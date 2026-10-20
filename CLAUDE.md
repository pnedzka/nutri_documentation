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
- **Code review automatyczne** (od 20.10.2026): `.github/workflows/claude-code-review.yml` (GitHub Actions, `anthropics/claude-code-action`, plugin `code-review`) komentuje PR, gdy przestaje być szkicem (Ready for review) i po kolejnych pushach; nie blokuje scalania. PR-y wydań (`develop` → `main`) i synchronizacji (`main` → `develop`) pomija. Potrzebuje sekretu repo `ANTHROPIC_API_KEY` (GitHub → Settings → Secrets and variables → Actions, wpisuje właściciel) i aplikacji Claude na GitHubie. Akcja działa tylko wtedy, gdy plik workflow jest identyczny na `main` (domyślna gałąź), więc jego zmiany wprowadza się na `main`.
- Błędy: Sentry (`SENTRY_DSN`, `VITE_SENTRY_DSN`); na serwerze `logError` zamiast `console.error`, bez treści dokumentów w zgłoszeniach. Zob. README („Monitorowanie”) i README centrum („Monitorowanie i błędy”).
- Sandbox Claude Code nie łączy się z supabase.co ani *.vercel.app. Używaj narzędzi MCP: Supabase, Vercel.
