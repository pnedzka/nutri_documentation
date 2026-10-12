-- Database schema of the document neutralization app. Idempotent: safe to run on every deployment
-- (scripts/migrate.mjs runs it during the Vercel build).
--
-- The app reads and writes through its own API with the service role and checks ownership there.
-- Row level security is enabled as a second line of defence: with the public (anon) key a signed-in user can read
-- only their own rows, an administrator all rows, and nobody can write.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  role text not null default 'user' check (role in ('user', 'admin')),
  created_at timestamptz not null default now()
);

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

alter table public.profiles enable row level security;
alter table public.documents enable row level security;
alter table public.document_events enable row level security;

drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated
  using (id = (select auth.uid()) or private.is_admin());

drop policy if exists documents_read on public.documents;
create policy documents_read on public.documents for select to authenticated
  using (owner_id = (select auth.uid()) or private.is_admin());

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
