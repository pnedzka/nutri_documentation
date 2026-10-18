# CLAUDE.md: kontekst projektu

Repo `pnedzka/nutri_documentation`. Opis funkcji i wdrożenia jest w `README.md`; zasady wspólne dla aplikacji Nutri Partners są w `CLAUDE.md` repo `pnedzka/nutri_hub` (centrum aplikacji).

Właściciel: Paweł Nędzka. Rozmawiamy po polsku.

## Środowiska: dev i produkcja (od 18.10.2026)

Wspólne zasady, zmienne, procedura wydań i pułapki są w `CLAUDE.md` repo `pnedzka/nutri_hub` (sekcja „Środowiska”). Skrót dla tej aplikacji:

| | Produkcja | Dev |
| --- | --- | --- |
| Gałąź | `main` | `develop` i gałęzie PR-ów |
| Adres | https://nutridocumentation-nxdi.vercel.app | https://nutridocumentation-nxdi-git-develop-nutri-partners.vercel.app (tylko po zalogowaniu do Vercela) |
| Supabase | `nutri-documentation` (`edzjkumjutffodfpasmf`) | `nutri-dev` (`xmcwvpgtaxlpswxghuqq`), konto testowe `p.nedzka@nutripartners.co` |
| Zmienne w Vercelu | Production | Preview: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY` (baza dev), `ANTHROPIC_API_KEY`, `VITE_HUB_URL` (centrum dev) |

- Dokumenty i pliki (Storage: `originals`, `outputs`) z dev trafiają do `nutri-dev`, nie do produkcji.
- Serwer bierze `SUPABASE_SERVICE_ROLE_KEY` przed `SUPABASE_SECRET_KEY`. Produkcyjny `SUPABASE_SERVICE_ROLE_KEY` jest tylko w Production, więc Preview używa klucza dev. Nie dodawać go do Preview.
- **Schemat bazy:** `db/schema.sql` to pełny opis obu baz. Zmianę stosuje się najpierw na `nutri-dev` (MCP Supabase), a przy wydaniu na produkcji, przed scaleniem do `main`. Build nie migruje bazy (brak `POSTGRES_URL_NON_POOLING`). MCP Supabase zawiesza się na `drop …`, więc SQL dzielić na części.
- Wydanie tylko po „wdrażaj”: PR `develop` → `main` scalany merge commitem, potem sprawdzić wdrożenie produkcyjne.

## Praca z repo

- PR-y idą do `develop` (squash). Na produkcję tylko na polecenie właściciela, zob. „Środowiska” wyżej.
- Sandbox Claude Code nie łączy się z supabase.co ani *.vercel.app. Używaj narzędzi MCP: Supabase, Vercel.
