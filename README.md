# nutri_documentation

Aplikacja do neutralizacji dokumentów dostawców dla Nutri Partners. Pracownik loguje się i wgrywa plik od dostawcy (specyfikację, kartę techniczną, świadectwo jakości), a w wyniku dostaje PDF na papierze firmowym Nutri Partners:

- bez danych dostawcy,
- z zachowaniem wszystkich danych technicznych,
- z wyraźnie oznaczonymi miejscami nieczytelnymi.

## Funkcje

Interfejs aplikacji, komunikaty, ostrzeżenia i e-maile są po angielsku (system „Document Neutralization”).

- **Logowanie** e-mailem i hasłem, wspólnym kontem Nutri Partners. Publicznej rejestracji nie ma.
  - **Konta, zaproszenia, reset hasła i uprawnienia** są tylko w centrum aplikacji: https://nutripartners.vercel.app → User management (repo `pnedzka/nutri_hub`). „Forgot password?” prowadzi tam.
  - **Dostęp:** aplikacja wpuszcza administratorów i osoby, które mają `neutralizer` w `profiles.apps`. Pozostali po zalogowaniu widzą komunikat o braku dostępu i link do centrum.
- **Wejście:** PDF z warstwą tekstową, skany PDF, zdjęcia (JPG/PNG) i dokumenty Word (DOCX), do 20 MB.
- **Neutralizacja.** Usuwane są:
  - dane identyfikujące dostawcę: nazwa, adresy, NIP, kontakty, osoby, numery dokumentów i certyfikatów dostawcy,
  - nazwy handlowe i kody produktów dostawcy, które można zastąpić nazwą i kodem produktu Nutri Partners,
  - ceny i warunki handlowe.

  Pozostają kraj pochodzenia, numery weterynaryjne zakładu, partie i daty.
- **Przegląd przed wydaniem dokumentu.** Oryginał jest obok wyniku, a wszystkie ostrzeżenia trzeba potwierdzić albo poprawić. Każdy fragment można kliknąć, aby go poprawić, oznaczyć do usunięcia albo przywrócić.
- **PDF na papierze firmowym, zawsze po angielsku:** logo, stopka z danymi firmy, numer referencyjny dokumentu i numeracja stron.
  - Z dokumentów dwujęzycznych (np. chińsko-angielskich) trafia tylko część angielska.
  - Dokumenty bez wersji angielskiej są tłumaczone.
  - Oczywiste literówki w angielskim tekście są poprawiane (np. „ANALAYSIS” → „ANALYSIS”).
  - Miejsca nieczytelne są oznaczone w treści jako `[ILLEGIBLE]` i zebrane w zestawieniu na końcu.
- **Moje dokumenty:** lista własnych plików ze statusem i liczbą ostrzeżeń.
- **Administrator:**
  - podgląd wszystkich dokumentów z oznaczeniem właściciela, filtrami po właścicielu i statusie oraz wyszukiwarką,
  - konta zakłada i zmienia się w centrum aplikacji (User management).
- **Historia zmian każdego dokumentu:** kto, kiedy i co potwierdził, poprawił, usunął lub przywrócił.
- **Powrót do centrum aplikacji:** logo i przycisk „All apps” w nagłówku prowadzą do https://nutripartners.vercel.app (zmienna `VITE_HUB_URL`).

## Jak aplikacja pilnuje, żeby nic nie zostało zmyślone

Dokumenty są wiążące, dlatego treść przepisywana przez model (Claude) jest sprawdzana mechanicznie, bez udziału modelu.

1. **Wierna transkrypcja.** Model przepisuje dokument znak po znaku, bez tłumaczenia, poprawiania i uzupełniania.
   - Fragmenty do usunięcia tylko oznacza, a nie kasuje. Usunięcie następuje dopiero przy generowaniu PDF, więc każdą decyzję widać na ekranie przeglądu.
   - Niepewne znaki oznacza jako nieczytelne zamiast zgadywać.
2. **Porównanie ze źródłem** (PDF z warstwą tekstową, DOCX). Każdy fragment wyniku musi występować w tekście dokumentu źródłowego w tej samej kolejności.
   - Zmieniona liczba, inny znak (`<` / `≤`) albo przestawione słowo (np. „min.” zamiast „max.”) daje ostrzeżenie **"Not in source"**.
   - Każda linia źródła musi się znaleźć w wyniku: zachowana albo oznaczona do usunięcia. Brakująca liczba lub treść daje ostrzeżenie **"Possibly omitted"**.
3. **Skany i zdjęcia** (bez warstwy tekstowej). Dokument jest odczytywany drugi raz, niezależnie. Liczby, symbole i słowa zmieniające sens, których drugi odczyt nie potwierdza, dostają ostrzeżenie **"Uncertain reading"**.
4. **Pozostałe ostrzeżenia:**
   - miejsca nieczytelne,
   - grafiki, które nie są przenoszone do PDF,
   - dane dostawcy, które mogły zostać w tekście,
   - uwagi z odczytu (pieczątki, podpisy, dopiski odręczne).
5. **Wersja angielska.** Model podaje dla każdego fragmentu tekst do druku po angielsku, a dosłowna transkrypcja zostaje do porównania ze źródłem. Aplikacja sprawdza mechanicznie, czy:
   - „część angielska” rzeczywiście występuje w oryginale,
   - liczby i symbole (`<`, `≤`, `%`…) są takie same jak w oryginale,
   - w tekście do druku nie zostały znaki spoza alfabetu angielskiego.

   Każde tłumaczenie, poprawka pisowni i pominięte powtórzenie (np. chiński wiersz nad angielskim) daje ostrzeżenie do potwierdzenia. Na ekranie przeglądu takie fragmenty są podkreślone, a oryginał widać po najechaniu i w edytorze fragmentu.
6. **Kontrola gotowego PDF.** Przed zapisaniem tekst PDF jest odczytywany z powrotem. Jeśli brakuje w nim choćby jednego znaku treści, plik nie jest zapisywany.
7. **Bramka człowieka.** PDF można wygenerować dopiero, gdy każde ostrzeżenie jest potwierdzone lub poprawione. Wszystko trafia do historii zmian.

Kod: `shared/verify.ts` (sprawdzanie), `shared/printable.ts` (co trafia na papier), `api/_lib/prompts.ts` (instrukcje dla modelu).

## Środowiska: dev i produkcja

| | Produkcja | Dev |
| --- | --- | --- |
| Gałąź | `main` | `develop` (i gałęzie PR-ów) |
| Adres | https://nutridocumentation-nxdi.vercel.app | https://nutridocumentation-nxdi-git-develop-nutri-partners.vercel.app (tylko po zalogowaniu do Vercela) |
| Baza Supabase | `nutri-documentation` (`edzjkumjutffodfpasmf`) | `nutri-dev` (`xmcwvpgtaxlpswxghuqq`), osobne konta testowe |
| Zmienne w Vercelu | Production | Preview |

W Preview przeglądarka używa `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`, a serwer `SUPABASE_URL` i `SUPABASE_SECRET_KEY` bazy dev; `VITE_HUB_URL` prowadzi do centrum dev. Dokumenty z dev trafiają do bazy i Storage `nutri-dev`.

1. **Praca:** gałąź od `develop` i PR do `develop` (squash). Każdy PR ma własny podgląd; po scaleniu zmiana jest pod stałym adresem dev.
2. **Wydanie na produkcję** (na polecenie właściciela): PR `develop` → `main`, scalany **merge commitem**, nie squashem, żeby gałęzie się nie rozjechały. Vercel wdraża `main` w ok. minutę. Cofnięcie: Vercel → Deployments → poprzednie wdrożenie → Instant Rollback.
3. **Zmiany schematu bazy:** najpierw na `nutri-dev`, przy wydaniu ta sama zmiana na produkcji, przed scaleniem do `main`. Pełny schemat: `db/schema.sql` w `nutri_documentation`.
4. **Pilna poprawka:** PR do `main`, potem `main` scalić do `develop`.

Darmowa baza dev usypia się po 7 dniach bez użycia. Wybudzenie: Supabase → projekt `nutri-dev` → Restore (ok. minuty).

## Wdrożenie (Vercel, projekt `nutri_documentation-nxdi`)

1. **Baza i pliki.** Vercel → projekt → **Storage** → **Create** → **Supabase**, a potem podłącz bazę do projektu dla wszystkich środowisk. Integracja sama doda zmienne `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` i `POSTGRES_URL_NON_POOLING`.
   - **Projekt Supabase już istnieje** (np. `nutri-documentation`, ref `edzjkumjutffodfpasmf`, ze schematem założonym przez konektor Supabase): zmienne ustaw ręcznie w Settings → Environment Variables:
     - `NEXT_PUBLIC_SUPABASE_URL` i `SUPABASE_URL`: adres projektu, np. `https://edzjkumjutffodfpasmf.supabase.co`,
     - `NEXT_PUBLIC_SUPABASE_ANON_KEY`: klucz publiczny (anon lub publishable),
     - `SUPABASE_SERVICE_ROLE_KEY`: Supabase → Project Settings → API Keys → `service_role` / secret.

     `POSTGRES_URL_NON_POOLING` jest wtedy opcjonalny. Bez niego migracja w buildzie jest pomijana.
2. **Settings → Environment Variables:**
   - `ANTHROPIC_API_KEY`: klucz Claude API (console.anthropic.com).
   - `ADMIN_EMAILS`: adres e-mail administratora, kilka adresów rozdziel przecinkami.
   - opcjonalnie `CLAUDE_MODEL`: domyślnie `claude-opus-5-5`.
   - opcjonalnie `CLAUDE_EFFORT`: domyślnie `medium`.
   - opcjonalnie `CLAUDE_FALLBACKS=off`: wyłącza automatyczne ponowienie na innym modelu, gdy Claude odmówi przetworzenia.
3. **Deployments → Redeploy.** Przy buildzie skrypt `scripts/migrate.mjs` sam założy tabele i prywatne buckety (`db/schema.sql`). Skrypt można bezpiecznie uruchamiać wielokrotnie.
4. **Pierwsze konto.** Supabase → **Authentication → Users → Add user** (e-mail z `ADMIN_EMAILS`, hasło, „Auto Confirm User”).
   - Po zalogowaniu ta osoba jest administratorem.
   - Kolejne konta zakłada w centrum aplikacji (https://nutripartners.vercel.app → User management).
5. W Supabase → **Authentication → Sign In / Providers** wyłącz „Allow new users to sign up”. Konta zakłada tylko administrator.

## Konta i uprawnienia

Zakładanie kont, zaproszenia e-mailem, reset hasła, role, imiona i uprawnienia do aplikacji są w centrum aplikacji Nutri Partners (`pnedzka/nutri_hub`, https://nutripartners.vercel.app → User management). Neutralizator tylko loguje i sprawdza dostęp:
- `profiles.apps` (`text[]`) musi zawierać `neutralizer`, chyba że osoba jest administratorem (`api/_lib/auth.ts`, `shared/schema.ts`);
- kolumnę dodaje `db/schema.sql`: konta sprzed wprowadzenia uprawnień dostały wszystkie aplikacje, nowe konta nie mają żadnej, dopóki administrator ich nie wybierze;
- `ADMIN_EMAILS` nadal nadaje rolę administratora przy logowaniu (pierwsze konto).
- **Jedno logowanie przez centrum** (od 18.10.2026): bez sesji aplikacja przekierowuje do centrum (`/sso`), które w razie potrzeby pokazuje logowanie i wraca na tę samą stronę z jednorazowym tokenem w adresie (`#sso=…`, `src/lib/sso.ts`). Wylogowanie tutaj wylogowuje też z centrum (`/logout`). Formularz logowania w aplikacji zostaje jako zapasowy, gdy token nie zadziała.

Limit czasu funkcji to 300 s (`vercel.json`). Długie PDF-y są dzielone na części po 3 strony, czytane równolegle.

Funkcje API działają we Frankfurcie (`"regions": ["fra1"]` w `vercel.json`), obok bazy Supabase w `eu-central-1`. Przy projekcie Supabase w innym regionie zmień tę wartość.

**Ochrona wdrożeń.** Aplikacja ma własne logowanie, więc w Vercelu → Settings → Deployment Protection ustaw Vercel Authentication na „Only Preview Deployments” albo podepnij własną domenę. Inaczej pracownicy bez konta w zespole Vercel zobaczą ekran logowania Vercela zamiast aplikacji.

## Papier firmowy

Dane firmy w stopce PDF są w pliku `shared/letterhead.ts`: pełna nazwa, adres, NIP, KRS, telefon, e-mail, www. Puste pola są pomijane, więc wystarczy uzupełnić je i wdrożyć ponownie.

Logo pochodzi z `assets/logo.svg`. W PDF jest rysowane wektorowo, z pliku `api/_lib/pdf/logo.ts`, wygenerowanego z SVG. Tabele mają nagłówek w kolorze logo (powtarzany na każdej stronie, gdy tabela przechodzi na kolejną) i jasnoszare tło komórek z nazwą wiersza. Czcionka to Inter, a znaki chińskie (i japońskie kanji) są drukowane czcionką Noto Sans SC (`assets/fonts`, licencja OFL). Jeśli dokument zawiera znaki, których żadna z tych czcionek nie ma (np. koreańskie, arabskie), PDF nie zostanie wygenerowany, a aplikacja pokaże, o które znaki chodzi. Żaden znak nie zniknie więc z wyniku po cichu.

## Uruchomienie lokalne

```bash
npm install
cp .env.example .env.local   # uzupełnij klucze
npx vercel dev               # frontend + funkcje /api na http://localhost:3000
npm test                     # testy (weryfikacja, neutralizacja, PDF, pipeline z atrapą modelu)
npm run lint
npm run build
```

Sam `npm run dev` uruchamia tylko frontend (bez `/api`).

## Struktura

| Ścieżka | Zawartość |
| --- | --- |
| `src/` | Frontend (React, Tailwind): logowanie, listy dokumentów, ekran przeglądu, moje konto |
| `api/` | Funkcje Vercel: `documents`, `documents/[id]`, `documents/[id]/process`, `documents/[id]/finalize`, `me` |
| `api/_lib/` | Pipeline (Claude, odczyt PDF/DOCX), generator PDF, dostęp do bazy |
| `shared/` | Kod wspólny: model danych, weryfikacja, neutralizacja, akcje przeglądu, dane papieru firmowego |
| `db/schema.sql` | Schemat bazy (tabele, RLS, buckety) |

## Ograniczenia

- Grafiki, wykresy i zdjęcia z dokumentu źródłowego nie są przenoszone do PDF. Każda grafika daje ostrzeżenie do potwierdzenia.
- Z plików Word nie są odczytywane nagłówki i stopki stron (zwykle są tam dane dostawcy). Wynik dostaje o tym uwagę.
- Zdjęcia większe niż 4,5 MB są zmniejszane w przeglądarce przed wysłaniem (limit Claude API to 5 MB na obraz).
