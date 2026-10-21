-- Database schema of the document neutralization app and the shared tables of the Nutri Partners apps (sign-in,
-- profiles, saved e-mail signatures). Idempotent: safe to run on every deployment
-- (scripts/migrate.mjs runs it during the Vercel build).
--
-- The neutralizer reads and writes through its own API with the service role and checks ownership there.
-- Row level security is enabled as a second line of defence: with the public (anon) key a signed-in user can read
-- only their own rows, an administrator all rows, and nobody can write. The exception is email_signatures (below),
-- which the signature generator reads and writes in the browser, guarded by row level security alone.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  role text not null default 'user' check (role in ('user', 'admin')),
  created_at timestamptz not null default now()
);

-- Which apps of the Nutri Partners hub a person may use (ids from nutri_hub shared/access.ts); administrators may
-- use every app. Managed in the hub. Accounts that existed before per-app access keep every app; new ones get none.
alter table public.profiles add column if not exists apps text[] not null default array['neutralizer', 'signatures', 'owner-lookup', 'intranet']::text[];
alter table public.profiles alter column apps set default '{}'::text[];

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete restrict,
  original_filename text not null,
  original_path text not null,
  mime_type text not null,
  size_bytes bigint,
  source_kind text check (source_kind in ('text_pdf', 'scan', 'image', 'docx')),
  page_count integer,
  status text not null default 'uploaded' check (status in ('uploaded', 'processing', 'review', 'done', 'error')),
  np_product_name text,
  np_product_code text,
  extraction jsonb,
  warnings jsonb,
  model text,
  error_message text,
  output_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  processing_started_at timestamptz,
  finalized_at timestamptz,
  finalized_by uuid references public.profiles (id)
);

create index if not exists documents_owner_created_idx on public.documents (owner_id, created_at desc);

-- PDF names: {document_type}_NP_{yyyymmdd}_{number of the day}, e.g. CoA_NP_20261021_01 (shared/outputName.ts).
-- The name is given at the first generation and kept afterwards; the type is recognised by the model and can be
-- changed in review until then.
alter table public.documents add column if not exists document_type text;
alter table public.documents add column if not exists output_name text;
alter table public.documents add column if not exists output_date date;
alter table public.documents add column if not exists output_seq integer;
create unique index if not exists documents_output_name_idx on public.documents (output_name);
create unique index if not exists documents_output_day_seq_idx on public.documents (output_date, output_seq);

-- Number of PDFs named per day (Polish calendar day) across the company. Used by the API with the service role
-- only: row level security is on and there are no policies.
create table if not exists public.output_counters (
  day date primary key,
  last integer not null
);

-- Next number of the day in one statement, so two people generating at the same moment never get the same one.
create or replace function public.next_output_seq(p_day date)
returns integer
language sql
set search_path = ''
as $$
  insert into public.output_counters as c (day, last) values (p_day, 1)
  on conflict (day) do update set last = c.last + 1
  returning last;
$$;

revoke all on function public.next_output_seq(date) from public, anon, authenticated;
grant execute on function public.next_output_seq(date) to service_role;
create index if not exists documents_created_idx on public.documents (created_at desc);

-- Audit trail: every acknowledgement, correction, restored or added removal, processing run and finalization.
create table if not exists public.document_events (
  id bigint generated always as identity primary key,
  document_id uuid not null references public.documents (id) on delete cascade,
  actor_id uuid references public.profiles (id),
  kind text not null,
  payload jsonb,
  created_at timestamptz not null default now()
);

create index if not exists document_events_document_idx on public.document_events (document_id, created_at);

-- One-time links from account e-mails (invitation: 24 h, password reset: 1 h). Only the SHA-256 of the token is
-- stored. Used by the API with the service role only: row level security is on and there are no policies.
create table if not exists public.account_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('invite', 'recovery')),
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists account_links_user_idx on public.account_links (user_id);

-- Helper for the policies below. It lives in a schema the Data API does not expose, so it cannot be called
-- through /rest/v1/rpc (Supabase security advisor 0028/0029).
create schema if not exists private;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin');
$$;

revoke all on function private.is_admin() from public;
grant usage on schema private to authenticated;
grant execute on function private.is_admin() to authenticated;

-- Whether the signed-in person may use an app of the hub: administrators, or the app id in profiles.apps
-- (nutri_hub shared/access.ts, canUse).
create or replace function private.can_use_app(app text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and (role = 'admin' or app = any (apps))
  );
$$;

revoke all on function private.can_use_app(text) from public;
grant execute on function private.can_use_app(text) to authenticated;

-- Saved e-mail signatures of the signature generator (pnedzka/nutri_signatures): one list shared by everyone who may
-- use the generator. `overrides` holds only the form fields that differ from the defaults (SignatureData in that
-- repo). The generator reads and writes this table in the browser with the signed-in user's session.
create table if not exists public.email_signatures (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 200),
  overrides jsonb not null default '{}'::jsonb
    check (jsonb_typeof(overrides) = 'object' and pg_column_size(overrides) <= 20000),
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_by_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists email_signatures_updated_idx on public.email_signatures (updated_at desc);

-- Who saved a signature comes from the session, never from the request; a change moves updated_at to now
-- (a new row may keep the updated_at it was given, e.g. when moving signatures saved before this table existed).
create or replace function private.stamp_email_signature()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_by := (select auth.uid());
  new.updated_by_email := (select auth.jwt() ->> 'email');
  if tg_op = 'INSERT' then
    new.created_by := new.updated_by;
    new.created_at := now();
  else
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    new.updated_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists email_signatures_stamp on public.email_signatures;
create trigger email_signatures_stamp before insert or update on public.email_signatures
  for each row execute function private.stamp_email_signature();

revoke all on public.email_signatures from anon;
grant select, insert, update, delete on public.email_signatures to authenticated;

alter table public.profiles enable row level security;
alter table public.documents enable row level security;
alter table public.document_events enable row level security;
alter table public.account_links enable row level security;
alter table public.output_counters enable row level security;
alter table public.email_signatures enable row level security;

drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated
  using (id = (select auth.uid()) or private.is_admin());

drop policy if exists documents_read on public.documents;
create policy documents_read on public.documents for select to authenticated
  using (owner_id = (select auth.uid()) or private.is_admin());

drop policy if exists email_signatures_all on public.email_signatures;
create policy email_signatures_all on public.email_signatures for all to authenticated
  using ((select private.can_use_app('signatures')))
  with check ((select private.can_use_app('signatures')));

drop policy if exists document_events_read on public.document_events;
create policy document_events_read on public.document_events for select to authenticated
  using (exists (select 1 from public.documents d where d.id = document_id and (d.owner_id = (select auth.uid()) or private.is_admin())));

-- Private buckets: files are only reachable through short-lived signed URLs issued by the API.
-- (The API also creates them on first use, so a failure here does not block the deployment.)
do $$
begin
  insert into storage.buckets (id, name, public, file_size_limit)
  values ('originals', 'originals', false, 20971520), ('outputs', 'outputs', false, 52428800)
  on conflict (id) do nothing;
exception when others then
  raise notice 'storage buckets not created: %', sqlerrm;
end
$$;
