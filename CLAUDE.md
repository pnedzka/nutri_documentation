# CLAUDE.md: kontekst projektu

Repo `pnedzka/nutri_documentation`. Opis funkcji i wdrożenia jest w `README.md`; zasady wspólne dla aplikacji Nutri Partners są w `CLAUDE.md` repo `pnedzka/nutri_hub` (centrum aplikacji).

Właściciel: Paweł Nędzka. Rozmawiamy po polsku.

## Praca z repo

- Środowiska (od 18.10.2026): `develop` = dev (baza Supabase `nutri-dev`, zmienne Preview), `main` = produkcja. PR-y idą do `develop` (squash). Na produkcję tylko na polecenie właściciela: PR `develop` → `main` scalany merge commitem. Szczegóły w README, sekcja „Środowiska”.
- Sandbox Claude Code nie łączy się z supabase.co ani *.vercel.app. Używaj narzędzi MCP: Supabase, Vercel.
