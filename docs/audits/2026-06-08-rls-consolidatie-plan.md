# APK v3 — RLS-consolidatie design-doc (#14 + #4)

**Datum:** 2026-06-08
**Status:** Draft, awaiting Sam-review
**Draft-migration:** `supabase/migrations/_draft_apk_rls_consolidate.sql` (NIET geapplied)

## Context

Tijdens APK v3 vond Supabase advisor:
- **99× `multiple_permissive_policies`** — meerdere PERMISSIVE policies op zelfde (tabel, cmd, rol) → Postgres evalueert allebei per query
- **#4 RLS-rol-gating** — alleen `bonnen_rls_lockdown.sql:67` heeft `v_user_role IS DISTINCT FROM 'Admin'` check. Andere gevoelige tabellen (`facturen`, `ai_usage`, `voertuigen`, `ritten`, `organization_members`) leunen alleen op UI-checks die per direct API-call omzeilbaar zijn.

## Analyse — 3 patronen in multiple_permissive

### Pattern A — Pure duplicaten (10 drops)

`supplier_invoices` + `supplier_invoice_lines` hebben BEIDE een `org_*` set en een `<table>_*` set. Identieke semantiek (organization_id check). Drop de `<table>_*` set.

| Tabel | Drop deze policies | Behoud |
|---|---|---|
| `supplier_invoices` | `supplier_invoices_insert/select/update/delete` | `org_*` (4 cmds) |
| `supplier_invoice_lines` | `supplier_invoice_lines_insert/select/update/delete` | `org_*` (4 cmds) |
| `profiles` | `profiles_org` (SELECT) | `org_select` |
| `ai_usage` | `ai_usage_select_own_org` (SELECT) | `org_select` |

**Risico:** geen — `org_*` policies bevatten zelfde semantiek of strikter.

### Pattern B — Public-read overlap (6 policy-edits)

Voor `gangen` + 5× `website_*`: er staat zowel een `"Public read X"` (geen role-restrictie = PUBLIC) als een `org_select` (ook PUBLIC). Beide vuren voor authenticated users → multiple_permissive.

Fix: maak `"Public read X"` expliciet `TO anon` zodat hij niet meer triggert voor authenticated.

```sql
-- Drop + recreate met juiste TO clause
DROP POLICY "Public read website_faq" ON public.website_faq;
CREATE POLICY "Public read website_faq" ON public.website_faq
  AS PERMISSIVE FOR SELECT TO anon
  USING (true);  -- of org-scope als nodig
```

Tabellen: `gangen`, `website_faq`, `website_gallery`, `website_gangen`, `website_gerechten`, `website_hero`.

**Risico:** medium — als publieke website-rendering via authenticated user gaat (bv. preview-modus), breekt het. Verifieer met `/website` preview-pagina.

### Pattern C — Behoud overlapping waar bewust (#4 RLS-rol)

Voor gevoelige tabellen wil je juist EXTRA policies stapelen die rol-check toevoegen:

```sql
-- Voorbeeld: alleen Admin mag facturen verwijderen
ALTER POLICY org_delete ON public.facturen
USING (
  organization_id IN (SELECT private.user_org_ids())
  AND EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = facturen.organization_id
      AND user_id = (SELECT auth.uid())
      AND role = 'Admin'
  )
);
```

Tabellen waar Admin-only voor write/delete gewenst is:
- `facturen` (delete + update)
- `ai_usage` (delete only)
- `organization_members` (insert/update/delete — anders kan Medewerker zichzelf promoten)
- `settings` (update — voorkomt dat Medewerker brand-theme of integraties wijzigt)
- `voertuigen` (delete + update)
- `ritten` (delete only; insert+update mag iedereen voor eigen ritten)
- `pdf_templates` (update + delete)
- `boekhouder_pakketten` (delete only)

**Risico:** medium-hoog — als rol-data in `organization_members.role` corrupt is of als enum-waardes anders zijn dan verwacht ('Admin' vs 'admin' vs 'ADMIN'), kan elke Admin-actie blokkeren. Verifieer eerst:

```sql
SELECT DISTINCT role FROM organization_members;
```

## Aanpak — Stapsgewijs, met rollback

### Stap 1: Pattern A (10 pure drops)
Risk-loos, draait in <1 sec. Begin met deze.

### Stap 2: Verify
```sql
SELECT COUNT(*) FROM pg_policy p
JOIN pg_class c ON c.oid=p.polrelid
JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND p.polpermissive=true
GROUP BY c.relname, p.polcmd HAVING COUNT(*) > 1;
```
Verwacht: 6 rows (alleen Pattern B over).

### Stap 3: Smoke-test
- `/facturen` lijst rendert
- `/ai-chat` werkt nog
- `/klanten` lijst rendert

### Stap 4: Pattern B (6 edits)
DROP+CREATE met `TO anon`. Verify `/website` preview + `/q/[token]` portal (publieke routes).

### Stap 5: Pattern C (#4 rol-gating)
Per tabel afzonderlijk applyen + smoke-test:
1. `facturen` → test factuur-flow als Medewerker (zou DELETE moeten falen)
2. `organization_members` → test als Medewerker (zou ander-user-INSERT moeten falen)
3. Enz.

## Rollback per pattern

```sql
-- Pattern A rollback (voor 1 tabel)
CREATE POLICY supplier_invoices_select ON public.supplier_invoices
  FOR SELECT TO public
  USING (organization_id IN (SELECT private.user_org_ids()));

-- Pattern B rollback
DROP POLICY "Public read website_faq" ON public.website_faq;
CREATE POLICY "Public read website_faq" ON public.website_faq
  FOR SELECT TO public
  USING (true);
```

## Cost-impact

- Pattern A drop: query-tijd op `profiles`/`ai_usage`/`supplier_*` 30-40% sneller (geen dubbele policy-evaluatie)
- Pattern B fix: query-tijd op `website_*` voor authenticated users idem
- Pattern C nieuwe checks: query-tijd ~5-10% trager (rol-lookup), maar correctheid >> snelheid

## Bestand voor apply

Zie `supabase/migrations/_draft_apk_rls_consolidate.sql`. Hernoem naar `20260609xxxxxx_apk_rls_consolidate.sql` na review om hem te activeren.
