# Execution Playbook — BBQ Architect v2

**Datum:** 2026-04-21
**Doel:** Het verschil tussen "strategy-docs" en "werkende SaaS" overbruggen. Elk §-blok hieronder is een zelfstandige taak die Sam of Claude in ≤ 1 dag kan afronden met de snippets en SQL hieronder.

**Werkwijze:** volg de secties in deze volgorde — ze zijn zo gesorteerd dat eerder werk blokkeert later werk. Check na elke sectie dat de acceptatietest slaagt voordat je verder gaat.

---

## §A — RLS-restant: dicht de laatste 5 gaten

**Waarom:** RLS-fundament staat (`user_org_ids()` helper + `org_*` policies op alle data-tabellen). Maar Supabase-advisor vond 5 restcategorieën die voor commerciële launch opgelost moeten. Zonder deze sectie is SF-7 niet 100% klaar.

**Uitvoeren:** via `apply_migration` MCP-tool of handmatig via Supabase SQL Editor.

### A.1 — 12 tabellen met RLS-aan-geen-policies

Context: deze 12 tabellen hebben `rls_enabled=true` maar geen policies → alleen service-role kan erbij. Voor single-tenant Berkhout prima, maar bij tenant-B komen ze niet toe aan eigen data.

**Beslissing per tabel:**

| Tabel | Bestemming | Policy-strategie |
|---|---|---|
| `activity_log` | Intern (server-side schrijft via triggers) | Geen RLS-policy, alleen service-role. Weghalen van advisor-radar door `REVOKE ALL ON public.activity_log FROM authenticated, anon;` |
| `changelog_entries` | Globaal leesbaar (product-updates) | `SELECT qual: true` voor authenticated; INSERT/UPDATE/DELETE service-role |
| `changelog_reads` | Per-user (welke update gelezen) | Filter op `user_id = auth.uid()` |
| `error_logs` | Server-side | `REVOKE` + service-role-only |
| `help_articles` | Globaal leesbaar | `SELECT qual: true` voor authenticated |
| `help_article_feedback` | User-write, org-read | INSERT = `user_id = auth.uid()`; SELECT voor org-admins |
| `onboarding_events` | **Duplicate van `activation_events`?** | **Checken + consolideren met activation_events** (zie A.6) |
| `pdf_templates` | Per-org | `org_*` policies zoals andere data-tabellen |
| `portal_berichten` | Per-klant (via offerte-token) | Anon SELECT op token; authenticated `org_*` filter |
| `pos_cash_sessions` | Per-org | `org_*` policies |
| `support_tickets` | Per-org + Sam als admin | `org_*` policies + service-role escalation |

**SQL (run als migration):**

```sql
-- A.1.1 — Intern/server-side (revoke)
REVOKE ALL ON public.activity_log FROM authenticated, anon;
REVOKE ALL ON public.error_logs FROM authenticated, anon;
-- (service-role heeft access sowieso via BYPASSRLS)

-- A.1.2 — Globaal leesbaar
CREATE POLICY "authenticated_read" ON public.changelog_entries
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read" ON public.help_articles
  FOR SELECT TO authenticated USING (true);

-- A.1.3 — Per-user
CREATE POLICY "own_rows_all" ON public.changelog_reads
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "own_insert" ON public.help_article_feedback
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "own_or_org_select" ON public.help_article_feedback
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR organization_id IN (SELECT user_org_ids()));

-- A.1.4 — Per-org (standaard-pattern)
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY['pdf_templates','pos_cash_sessions','support_tickets'])
  LOOP
    EXECUTE format('CREATE POLICY "org_select" ON public.%I FOR SELECT TO authenticated USING (organization_id IN (SELECT user_org_ids()));', t);
    EXECUTE format('CREATE POLICY "org_insert" ON public.%I FOR INSERT TO authenticated WITH CHECK (organization_id IN (SELECT user_org_ids()));', t);
    EXECUTE format('CREATE POLICY "org_update" ON public.%I FOR UPDATE TO authenticated USING (organization_id IN (SELECT user_org_ids()));', t);
    EXECUTE format('CREATE POLICY "org_delete" ON public.%I FOR DELETE TO authenticated USING (organization_id IN (SELECT user_org_ids()));', t);
  END LOOP;
END $$;

-- A.1.5 — portal_berichten (speciaal: anon + auth)
CREATE POLICY "anon_read_via_token" ON public.portal_berichten
  FOR SELECT TO anon
  USING (offerte_id IN (SELECT id FROM public.offertes WHERE public_token IS NOT NULL));
CREATE POLICY "org_all" ON public.portal_berichten
  FOR ALL TO authenticated
  USING (organization_id IN (SELECT user_org_ids()))
  WITH CHECK (organization_id IN (SELECT user_org_ids()));
```

**Acceptatietest:**
```sql
SELECT tablename FROM pg_tables pt
WHERE schemaname = 'public'
  AND NOT EXISTS (SELECT 1 FROM pg_policies pp WHERE pp.tablename = pt.tablename)
  AND tablename NOT IN ('activity_log','error_logs'); -- die zijn revoked
-- Verwacht: 0 rijen
```

### A.2 — Storage-buckets: listing intrekken, object-GET behouden

Context: 5 public buckets (`bonnen`, `brand-assets`, `gerechten-fotos`, `photos`, `website-images`) hebben brede SELECT-policies die ook `LIST` toestaan. Voor object-URLs niet nodig.

**SQL:**
```sql
-- Verwijder de brede listing-policies per bucket
DROP POLICY IF EXISTS "bonnen_public_read" ON storage.objects;
DROP POLICY IF EXISTS "brand_assets_public_read" ON storage.objects;
DROP POLICY IF EXISTS "Allow public reads" ON storage.objects; -- gerechten-fotos
DROP POLICY IF EXISTS "Public Access" ON storage.objects; -- photos
DROP POLICY IF EXISTS "Public read website-images" ON storage.objects;
DROP POLICY IF EXISTS "PublGive anon users access to JPG images in folder 13d6afd_0" ON storage.objects;

-- Vervang door object-GET-only policies (geen LIST)
-- Supabase signed URLs werken hiermee; directe object-URLs blijven publiek voor deze buckets
CREATE POLICY "public_buckets_read_object" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id IN ('bonnen','brand-assets','gerechten-fotos','photos','website-images'));

-- En restrict de buckets zelf tot bekend object-ID (niet listing)
-- In Supabase Studio: buckets publicly readable AAN, maar 'List objects' via API vereist authentication
```

**Acceptatietest:** proberen `storage.objects` via anon-JWT te listen voor `bonnen` bucket → 0 rijen.

### A.3 — POS-tabellen: constrainen van anon-INSERT

Context: `pos_order_items` en `pos_order_item_modifiers` hebben `WITH CHECK (true)` voor anon INSERT. Dit is voor online-ordering (source='online') maar te breed.

**SQL:**
```sql
DROP POLICY IF EXISTS "Anyone can insert order items" ON public.pos_order_items;
CREATE POLICY "anon_insert_online" ON public.pos_order_items
  FOR INSERT TO anon
  WITH CHECK (
    order_id IN (SELECT id FROM public.pos_orders WHERE source = 'online')
  );

DROP POLICY IF EXISTS "Anyone can insert order item modifiers" ON public.pos_order_item_modifiers;
CREATE POLICY "anon_insert_online" ON public.pos_order_item_modifiers
  FOR INSERT TO anon
  WITH CHECK (
    order_item_id IN (
      SELECT id FROM public.pos_order_items oi
      WHERE oi.order_id IN (SELECT id FROM public.pos_orders WHERE source = 'online')
    )
  );
```

**Acceptatietest:** anon kan alleen order-items toevoegen die bij een `source='online'`-order horen.

### A.4 — Auth leaked-password-protection (⚠️ Pro Plan only)

Context: Supabase biedt HaveIBeenPwned-check tijdens signup. **Vereist Pro Plan** (volgens Supabase docs); op Free Plan niet beschikbaar.

**Actie als/wanneer Pro Plan actief:**
- Optie A — dashboard: Authentication → Providers → Email → "Leaked password protection" → AAN
- Optie B — script: maak Personal Access Token op `https://supabase.com/dashboard/account/tokens` en run:
  ```bash
  SUPABASE_ACCESS_TOKEN=sbp_xxx npm run enable-leaked-password-protection
  ```
  (Zet ook `password_min_length=8` en `password_required_characters=lower_upper_letters_digits`.)

**Acceptatietest:** advisor `auth_leaked_password_protection` verdwijnt binnen ~1 minuut.

**Status 2026-04-21:** Berkhout-project zit nog op Free Plan → uitgesteld tot upgrade. Geen blokker voor MVP-launch (sterke wachtwoord-eisen in code-validatie blijven 6-tekens minimum, te verhogen indien nodig).

### A.5 — Mutable search_path op POS-functies

**SQL:**
```sql
ALTER FUNCTION public.pos_estimate_wait_time() SET search_path = public, pg_temp;
ALTER FUNCTION public.pos_deduct_inventory() SET search_path = public, pg_temp;
```

**Acceptatietest:** advisor `function_search_path_mutable` verdwijnt.

### A.6 — Consolideer `onboarding_events` + `activation_events`

Context: er bestaan **twee** onboarding-tabellen. Eén wordt gebruikt (`activation_events`), de ander (`onboarding_events`) niet.

**Actie:** check of `onboarding_events` rijen bevat (waarschijnlijk 0). Zo ja → migreer naar `activation_events`. Zo nee → drop.

**SQL:**
```sql
-- Check:
SELECT COUNT(*) FROM public.onboarding_events;

-- Als 0:
DROP TABLE public.onboarding_events;
```

---

## §B — Onboarding-wiring: van UI-state naar database

**Waarom:** `/onboarding` flow werkt end-to-end visueel maar slaat niets op. Zonder wiring: elke refresh is verloren werk, en bedrijfsgegevens komen nooit in de `organizations` tabel.

### B.1 — BedrijfStep persisteren

**Bestand:** `src/app/onboarding/page.tsx` → functie `BedrijfStep`.

**Diff:**
```tsx
function BedrijfStep({ onNext }: { onNext: () => void }) {
  const { orgId } = useOrg();
  const [naam, setNaam] = useState('');
  const [btw, setBtw] = useState('');
  const [kvk, setKvk] = useState('');
  const [adres, setAdres] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!orgId || !supabase) return;
    setSaving(true);
    const { error } = await supabase
      .from('organizations')
      .update({
        name: naam,
        kvk_number: kvk || null,
        btw_number: btw || null,
        address: adres || null,
      })
      .eq('id', orgId);
    setSaving(false);
    if (!error) onNext();
    else alert('Opslaan mislukt: ' + error.message);
  }

  return (
    <StepShell ...>
      ...
      <PrimaryButton onClick={handleSave} disabled={!naam || saving}>
        {saving ? 'Opslaan...' : 'Opslaan en verder'}
        <ArrowRight className="w-4 h-4" />
      </PrimaryButton>
    </StepShell>
  );
}
```

**Pre-requisite SQL (als kolommen nog niet bestaan):**
```sql
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS kvk_number text,
  ADD COLUMN IF NOT EXISTS btw_number text,
  ADD COLUMN IF NOT EXISTS address text;
```

### B.2 — DataStep: echte demo-data-import

**Actie:** maak `src/lib/demoData.ts` aan met `insertDemoData(orgId)`:

```tsx
// src/lib/demoData.ts
import { supabase } from './supabase';

export async function insertDemoData(orgId: string): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'No supabase client' };

  const klanten = [
    { naam: 'Tuinvereniging De Lelie', email: 'bestuur@delelie.nl', telefoon: '06-12345678', organization_id: orgId },
    { naam: 'Bedrijf BV', email: 'events@bedrijfbv.nl', telefoon: '06-87654321', organization_id: orgId },
    { naam: 'Familie De Vries', email: 'fam.devries@email.nl', telefoon: '06-11223344', organization_id: orgId },
  ];
  const gerechten = [
    { naam: 'Pulled Pork', categorie: 'hoofd', prijs_per_portie: 8.5, organization_id: orgId },
    { naam: 'Gegrilde Kip', categorie: 'hoofd', prijs_per_portie: 7.0, organization_id: orgId },
    { naam: 'Halloumi-spies', categorie: 'hoofd', prijs_per_portie: 7.5, organization_id: orgId },
    { naam: 'Coleslaw', categorie: 'salade', prijs_per_portie: 2.5, organization_id: orgId },
    { naam: 'Aardappelsalade', categorie: 'salade', prijs_per_portie: 2.5, organization_id: orgId },
  ];

  const { error: kError } = await supabase.from('klanten').insert(klanten);
  if (kError) return { ok: false, error: kError.message };
  const { error: gError } = await supabase.from('gerechten').insert(gerechten);
  if (gError) return { ok: false, error: gError.message };

  return { ok: true };
}
```

**In `DataStep` aanroepen:**
```tsx
async function handleNext() {
  if (choice === 'demo' && orgId) {
    const { ok } = await insertDemoData(orgId);
    if (!ok) alert('Demo-data import mislukt');
  }
  logActivationEvent(orgId, choice === 'demo' ? 'demo_data_loaded' : 'demo_data_skipped');
  onNext();
}
```

### B.3 — onboarding_completed event aan einde

**In `IntegratiesStep`** (laatste stap) → fire event + redirect:
```tsx
function IntegratiesStep() {
  const { orgId } = useOrg();
  function handleFinish() {
    logActivationEvent(orgId, 'onboarding_completed');
    window.location.href = '/';
  }
  return (
    <StepShell ...>
      ...
      <PrimaryButton onClick={handleFinish}>
        Klaar — naar dashboard
        <ArrowRight className="w-4 h-4" />
      </PrimaryButton>
    </StepShell>
  );
}
```

---

## §C — Signup-event wire-up

**Bestand:** `src/app/signup/page.tsx` → na succesvolle signup.

```tsx
import { logActivationEvent } from '@/lib/activation';

// ... in handleSignup na auth.signUp succes + organization create:
const { data: newOrg } = await supabase
  .from('organizations')
  .insert({ name: orgName })
  .select()
  .single();

if (newOrg?.id) {
  await supabase.from('organization_members').insert({
    organization_id: newOrg.id,
    user_id: authData.user.id,
    role: 'owner',
  });
  // Fire activation event (fire-and-forget)
  logActivationEvent(newOrg.id, 'signup_completed', {
    email,
    source: document.referrer || 'direct',
  });
  router.push('/onboarding');
}
```

**Acceptatietest:**
```sql
SELECT event_type, COUNT(*) FROM public.activation_events GROUP BY event_type;
-- Verwacht: signup_completed rij bestaat na nieuwe test-signup
```

---

## §D — First-quote-sent event wire-up

**Waar:** elke plek waar een offerte op "verzonden" zet (waarschijnlijk `src/app/offertes/**` of `src/app/offerte-editor/**`).

**Vind het met:**
```bash
grep -rn "status.*=.*verzonden\|public_token\|offerte.*send" src/app/
```

**Patch (standaardpatroon — vervang `updateOfferte` call):**
```tsx
import { logActivationEvent } from '@/lib/activation';

async function handleVerzenden() {
  const { error } = await supabase
    .from('offertes')
    .update({ status: 'verzonden', verzonden_op: new Date().toISOString() })
    .eq('id', offerteId);

  if (!error) {
    // Check of dit de eerste verzonden offerte voor deze org is
    const { count } = await supabase
      .from('offertes')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .eq('status', 'verzonden');

    if (count === 1) {
      logActivationEvent(orgId, 'first_quote_sent', { offerte_id: offerteId });
    }
  }
}
```

**Acceptatietest:**
```sql
SELECT metadata->>'offerte_id' AS offerte_id, created_at
FROM public.activation_events
WHERE event_type = 'first_quote_sent'
ORDER BY created_at DESC LIMIT 5;
```

---

## §E — Activation-funnel dashboard

**Waarom:** zonder funnel-meting kunnen we SF-6 success-criterion (50% binnen 60 min 1e offerte) niet bewijzen.

**SQL view:**
```sql
CREATE OR REPLACE VIEW public.activation_funnel AS
WITH first_events AS (
  SELECT
    organization_id,
    MIN(created_at) FILTER (WHERE event_type = 'signup_completed') AS signup_at,
    MIN(created_at) FILTER (WHERE event_type = 'company_profile_saved') AS bedrijf_at,
    MIN(created_at) FILTER (WHERE event_type IN ('demo_data_loaded','demo_data_skipped')) AS data_at,
    MIN(created_at) FILTER (WHERE event_type = 'first_quote_draft') AS draft_at,
    MIN(created_at) FILTER (WHERE event_type = 'first_quote_sent') AS sent_at,
    MIN(created_at) FILTER (WHERE event_type = 'onboarding_completed') AS done_at
  FROM public.activation_events
  GROUP BY organization_id
)
SELECT
  organization_id,
  signup_at,
  EXTRACT(EPOCH FROM (bedrijf_at - signup_at))/60 AS min_to_bedrijf,
  EXTRACT(EPOCH FROM (data_at - signup_at))/60 AS min_to_data,
  EXTRACT(EPOCH FROM (draft_at - signup_at))/60 AS min_to_draft,
  EXTRACT(EPOCH FROM (sent_at - signup_at))/60 AS min_to_sent,
  EXTRACT(EPOCH FROM (done_at - signup_at))/60 AS min_to_done,
  (sent_at IS NOT NULL AND sent_at < signup_at + INTERVAL '60 minutes') AS activated_60min
FROM first_events;
```

**Admin-pagina query (maak `src/app/admin/funnel/page.tsx`):**
```sql
SELECT
  DATE_TRUNC('week', signup_at) AS week,
  COUNT(*) AS signups,
  COUNT(bedrijf_at) AS finished_bedrijf,
  COUNT(sent_at) AS sent_quote,
  COUNT(*) FILTER (WHERE activated_60min) AS activated_60min,
  ROUND(100.0 * COUNT(*) FILTER (WHERE activated_60min) / NULLIF(COUNT(*),0), 1) AS activation_rate_pct
FROM public.activation_funnel
GROUP BY 1 ORDER BY 1 DESC;
```

---

## §F — Launch-checklist: go-live-prerequisites

Vóór publieke lancering afvinken. Elk vinkje = gepubliceerd bewijs (screenshot, URL of SQL-query).

### F.1 — Juridisch
- [ ] `/legal/voorwaarden` — algemene voorwaarden (verwijzing naar KvK-nr + artikel 6:234 BW)
- [ ] `/legal/privacy` — privacy-policy (AVG art. 13, subverwerkers: Supabase, Anthropic, Mollie, Resend)
- [ ] `/legal/dpa` — verwerkersovereenkomst-template voor B2B-klanten
- [ ] Cookiebanner (alleen functionele cookies — geen consent nodig mits)
- [ ] KvK + BTW op factuur-footer van Berkhout Catering (eigen org settings)

### F.2 — Technisch
- [ ] §A afgerond (RLS-restant dicht)
- [ ] §B-D afgerond (onboarding wired-up)
- [ ] 2e-tenant Playwright-test groen
- [ ] Externe pen-test op RLS (ik raad aan: [Hacker One](https://hackerone.com/) `pentest` voor €500 of [Intigriti](https://www.intigriti.com/))
- [ ] Error-log-monitoring (Sentry of vergelijkbaar) live
- [ ] Uptime-monitoring (BetterUptime, Uptime-robot)
- [ ] Backup-strategie Supabase: PITR aan (Pro-plan feature)
- [ ] Domein `bbqarchitect.nl` (of vergelijkbaar) geregistreerd + DNS ingericht
- [ ] SPF/DKIM/DMARC voor transactional emails (Resend-domain-verify)

### F.3 — Product
- [ ] Landingspagina (`/welkom`) met demo-video (60–90s)
- [ ] Pricing-page (`/pricing`) public-read accessibility (geen login vereist)
- [ ] Signup-flow zonder creditcard werkt
- [ ] Trial-countdown zichtbaar in app-header vanaf dag 40
- [ ] Upgrade-prompt bij hitting van AI-cap (`PaywallPrompt` component bestaat al ✅)
- [ ] Help-center (`/hulp`) met minstens 5 artikelen: offerte-wizard, HACCP, Moneybird, event-dag, data-export

### F.4 — Support
- [ ] `support@bbqarchitect.nl` mailbox werkend
- [ ] FAQ op landing (al in `/pricing` ✅)
- [ ] Loom-library met 5 tutorial-video's (embed in onboarding-stappen)
- [ ] In-app chat (optioneel — begin met mailto-link; later Intercom / Crisp)

### F.5 — Commercie
- [ ] Mollie account geverifieerd + KVK gelinkt
- [ ] Mollie Subscriptions-app getest met trial-tenant
- [ ] Billing-webhook naar `/api/billing/webhook` werkend
- [ ] Upgrade-flow (Starter → Pro) proration-correct
- [ ] Eerste test-invoice zichtbaar in Mollie Dashboard

---

## §G — Moneybird OAuth-app registration

**Waarom:** SF-5 Moneybird-sync is kern-Pro-waarde. App-registratie bij Moneybird is eenmalig werk met marketplace-exposure.

**Stappen:**

1. **Moneybird developer-account:** https://developer.moneybird.com
2. **Registreer nieuwe app:**
   - App-naam: `BBQ Architect`
   - Redirect URL: `https://app.bbqarchitect.nl/api/integrations/moneybird/callback`
   - Scopes: `sales_invoices`, `contacts`, `ledger_accounts`
3. **OAuth-flow implementeren** (nieuwe route `src/app/api/integrations/moneybird/`):
   - `GET /connect` → redirect naar Moneybird OAuth
   - `GET /callback` → exchange code voor token, opslaan in `organizations.integrations.moneybird.access_token` (encrypted)
4. **Sync-logica** in `src/lib/moneybird.ts`:
   - `pushInvoiceToMoneybird(factuurId)` — maakt concept-invoice, linked via `external_reference`
   - Rate-limit: 150 req/min (respecteren met queue)
5. **Marketplace-listing** (optioneel — na 10 klanten): app submitten voor publieke listing

**Acceptatietest:** één echte factuur uit Berkhout → Moneybird concept binnen 5 sec.

---

## §H — Mollie Subscriptions setup

**Waarom:** SF-10 billing is blokker voor zelfs 1 betalende klant.

**Stappen:**

1. **Mollie account + KVK-verificatie** (1–2 werkdagen)
2. **Products aanmaken:**
   - `Starter` — €49/mnd, €490/jaar
   - `Pro` — €99/mnd, €990/jaar
   - `Enterprise` — €249/mnd, €2.490/jaar
3. **Webhook-endpoint:** `/api/billing/webhook` — events:
   - `subscription.created` → activeer plan
   - `subscription.updated` → update `organizations.plan`
   - `subscription.canceled` → soft-lock (read-only modus)
   - `payment.failed` → counter increment, na 3× → soft-lock
4. **Subscription-flow UI:** `/pricing` → klik "Start trial" → Mollie hosted checkout (met trial=60 dagen) → callback zet `organizations.plan='starter'` en `trial_ends_at`
5. **Proration:** Mollie heeft ingebouwde proration-logica bij `updateSubscription`
6. **Test-modus:** gebruik Mollie-testkaart `4111 1111 1111 1111` tot launch-day

**Pre-requisite SQL:**
```sql
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS plan text NOT NULL DEFAULT 'starter',
  ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS mollie_customer_id text,
  ADD COLUMN IF NOT EXISTS mollie_subscription_id text,
  ADD COLUMN IF NOT EXISTS subscription_status text DEFAULT 'trial';
```

---

## §I — AI-eval pipeline (SF-12 light)

**Waarom:** zonder eval-set rol je prompts/model-updates blind naar prod. 30 cases is genoeg om regressie >5pp te vangen.

**Setup:**

1. **Eval-set verzamelen** — `docs/ai-evals/offerte-wizard/`:
   - 30 JSON-bestanden `case-001.json` ... `case-030.json`
   - Elk bestand: `{ "input": "<ruwe tekst>", "expected": { "gasten": 30, "datum": "2026-06-14", ... } }`
   - Bronnen: recente echte aanvragen (geanonimiseerd) + 5 edge-cases (geen datum, dieet-info, engels, meertalige, typo)

2. **Eval-script:** `scripts/ai-eval.ts`:
```ts
import { readFile } from 'fs/promises';
import { glob } from 'glob';
// Gebruikt dezelfde wizard-logic als /api/parse-document

const cases = await glob('docs/ai-evals/offerte-wizard/*.json');
let passed = 0;
for (const path of cases) {
  const tc = JSON.parse(await readFile(path, 'utf-8'));
  const actual = await callWizard(tc.input);
  const ok = compareOutputs(actual, tc.expected); // fuzzy match: datum, gasten, cuisine
  if (ok) passed++;
  else console.log(`FAIL: ${path}`);
}
console.log(`${passed}/${cases.length} passed (${(100*passed/cases.length).toFixed(1)}%)`);
```

3. **CI-job** (GitHub Actions `.github/workflows/ai-eval.yml`):
```yaml
name: AI Eval
on:
  push: { branches: [main] }
  workflow_dispatch:
jobs:
  eval:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci && npx tsx scripts/ai-eval.ts
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
```

**Acceptatietest:** groene run in CI met ≥ 28/30 pass (93%).

---

## §J — Content-kalender M1: eerste blog-post

**Onderwerp:** "Wat kost het als je offertes in Excel blijft maken?"

**Outline:**
1. Intro (100 woorden): Nederlandse caterier doet 8 offertes per maand in Excel. Gemiddeld 50 minuten per stuk. Dat is 6,5 uur/mnd = ~3 events' nettomarge.
2. De 5 verborgen kosten:
   - Dubbele invoer (Excel → Moneybird) — 10 min/factuur
   - Geen margecheck (je weet niet wat je verdient per gerecht)
   - Geen follow-up (offertes waar je klant niet op reageert blijven liggen)
   - Geen audit-trail (BTW-verschillen kunnen je hele boekhouding onderuithalen)
   - Geen mobiele toegang (WhatsApp klant → laptop openen → 20 min verlies)
3. Hoe AI-wizard + geïntegreerde flow dit fixt (Berkhout-case: 50 min → 6 min)
4. Call-to-action: 2 maanden gratis proberen → `bbqarchitect.nl`

**Distributie:** Facebook-groep "Nederlandse Caterers", LinkedIn-profiel, eigen website-blog.

---

## §K — Eet-je-eigen-hondenvoer-event-plan

**Datum:** volgende Berkhout-event (uiterlijk 2026-05-05).

**Doel:** 1 echt event volledig via BBQ Architect draaien — van offerte tot factuur — en alle friction-points opschrijven.

**Checklist pre-event:**
- [ ] Offerte via `/offertes` maken (niet Excel)
- [ ] HACCP-log op tablet tijdens voorbereiding (iPad gemonteerd in keuken)
- [ ] Crew-uren via telefoon loggen op event-dag
- [ ] Materieel-checklist vóór bus-laden
- [ ] Event-dag real-time sync naar kantoor

**Post-event retrospective:**
- Welk moment was de grootste friction? → input voor SF-3/SF-4 scope
- Wat werkte beter dan verwacht? → marketing-material
- Wat miste je? → input voor volgende sprint

---

## §L — Referral-programma (H2)

**Waarom:** bij ≥10 klanten begint mond-tot-mond te werken. Kleine referral-nudge versnelt dit.

**Ontwerp:**
- Elke actieve klant krijgt een referral-link in `/instellingen/referral`
- Nieuwe signup via die link → beide klanten krijgen **€50 credit** (na 1e betaalde maand)
- Credit = gratis maand of €-korting op volgende factuur
- Max 10 referrals per klant (om misbruik te voorkomen)

**SQL:**
```sql
CREATE TABLE IF NOT EXISTS public.referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_org_id uuid NOT NULL REFERENCES organizations(id),
  referred_org_id uuid REFERENCES organizations(id),
  referral_code text UNIQUE NOT NULL,
  status text NOT NULL DEFAULT 'pending', -- pending/activated/paid
  credit_amount_cents int DEFAULT 5000,
  created_at timestamptz DEFAULT now(),
  activated_at timestamptz
);
```

**Implementatie-moment:** H2 M9 — niet H1 (focus eerst op base-conversie).

---

## Prioriteit en tijdsbudget

| § | Moeite | Prioriteit | Blokkeert |
|---|---:|---|---|
| §A RLS-restant | 1 dag | **P0** | Launch |
| §B Onboarding-wiring | 2 dagen | **P0** | SF-6 meting |
| §C Signup-event | 1 uur | P0 | Funnel-meting |
| §D First-quote-sent | 2 uur | P0 | Funnel-meting |
| §E Funnel-dashboard | 3 uur | P1 | Decisions-zonder-data |
| §F Launch-checklist | 5 dagen (gespreid) | P0 | Launch |
| §G Moneybird OAuth | 2 dagen | P1 | Pro-tier-waarde |
| §H Mollie Subscriptions | 3 dagen | **P0** | Any paid customer |
| §I AI-eval pipeline | 2 dagen | P2 | Kwaliteitsborging |
| §J Blog-post M1 | 4 uur | P1 | Acquisitie |
| §K Eet-je-hondenvoer-event | 1 event-dag | P1 | SF-3/SF-4 scope |
| §L Referral-programma | 2 dagen | P3 | H2 groei |

**Aanbevolen volgorde voor de eerste 10 werkdagen:**
1. Dag 1 — §A (RLS-restant) + §C (signup-event)
2. Dag 2–3 — §B (onboarding-wiring) + §D (first-quote-sent)
3. Dag 4 — §E (funnel-dashboard) + begin §J (blog)
4. Dag 5–7 — §H (Mollie Subscriptions)
5. Dag 8–9 — §F (launch-checklist afronden)
6. Dag 10 — eerste 3 test-trials uitsturen naar Sam's netwerk

Met deze volgorde staat commerciële launch klaar eind dag 10. SF-3/SF-4 (mobile-fix) kan daarna parallel met eerste klanten.
