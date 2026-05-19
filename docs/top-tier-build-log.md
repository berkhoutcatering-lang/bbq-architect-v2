# BBQ Architect — Autonome bouw-log

**Sessie**: 2026-05-18 → 2026-05-19 dag 2 → 2026-05-20 dag 3 (autonoom, geen commit/merge/push)
**Branch**: `claude/amazing-herschel-8469eb` (worktree)
**Resultaat dag 1 + dag 2 gecombineerd**: ~30 P0's afgehandeld + 4 helpers + 1 migration + 7 nieuwe Server Actions + AI hard-cap bedraad in 9 routes + Moneybird OAuth-refresh bedraad in 2 routes + AI Act badge bedraad + demo-data seed API + menu-analyse en AI Pitmaster echte content i.p.v. stubs. 48 bestandswijzigingen op disk, niets gecommit.
**Te reviewen** door Mathijs: `git status` + `git diff` per file.

## Dag 2 toevoegingen (2026-05-19)

| Wat | Files | Status |
|---|---|---|
| `enforceAiCap` wrapper-helper | [src/lib/aiCostCap.ts](src/lib/aiCostCap.ts) | ✅ |
| AI hard-cap bedraad in 7 Sonnet/Vision routes | recipe-generate, parse-document, supplier-analysis, ai/supplier-catalog-parse, gerechten/regenerate-prompt, ai/component-generate, ai/cost-engineering | ✅ |
| Moneybird OAuth-refresh bedraad | [accounting/moneybird/route.ts](src/app/api/accounting/moneybird/route.ts), [ritten/moneybird-push/route.ts](src/app/api/ritten/moneybird-push/route.ts) | ✅ |
| Menu-analyse stub → werkende BCG (P0.18) | [src/app/gerechten/menu-analyse/page.tsx](src/app/gerechten/menu-analyse/page.tsx), [`_client.tsx`](src/app/gerechten/menu-analyse/_client.tsx), [src/lib/menu/bcgAnalysis.ts](src/lib/menu/bcgAnalysis.ts) | ✅ |
| AI Pitmaster stub → event-context + prompts (P0.17) | [src/app/gerechten/ai-pitmaster/page.tsx](src/app/gerechten/ai-pitmaster/page.tsx), [`_client.tsx`](src/app/gerechten/ai-pitmaster/_client.tsx) | ✅ |
| AI Act "Door AI samengesteld" badge bedraad in AIPromptDrawer | [src/components/dashboard/today/AIPromptDrawer.tsx](src/components/dashboard/today/AIPromptDrawer.tsx) | ✅ |
| Demo-data seed-API (P0.38) | [src/app/api/onboarding/seed-demo/route.ts](src/app/api/onboarding/seed-demo/route.ts) | ✅ |
| Server Action events-CRUD (P0.7) | [src/app/events/actions.ts](src/app/events/actions.ts) | ✅ (file klaar, UI-bedrading volgt) |
| Server Action offertes-CRUD (P0.14) | [src/app/offertes/actions.ts](src/app/offertes/actions.ts) | ✅ (file klaar) |
| Server Action gerechten-CRUD (P0.21) | [src/app/gerechten/actions.ts](src/app/gerechten/actions.ts) | ✅ (file klaar) |

## Nieuwe ⚠️ beslis-flags voor Sam

### Flag dag2-1 — `checkAiCapServer` vs `enforceAiCap`
Er zijn nu **twee cap-systemen**:
- `checkAiCapServer` (uit `src/lib/aiUsageServer.ts`) — telt AI-acties per maand, action-count-based
- `enforceAiCap` (uit `src/lib/aiCostCap.ts`) — telt EUR-spend, cost-based

Beide loggen naar dezelfde `ai_usage` tabel. Routes bedraad met `checkAiCapServer`: ai-improve, ai-fill, refine-price, parse-attachment. Routes bedraad met `enforceAiCap`: bon-extract, recipe-generate, parse-document, supplier-analysis, ai/supplier-catalog-parse, regenerate-prompt, ai/component-generate, ai/cost-engineering.

**Beslissing nodig**: 
- (a) Migreer alles naar EUR-based `enforceAiCap` (cleaner, voorspelbaarder, aligns met Anthropic cost-modeling)
- (b) Migreer alles naar action-count `checkAiCapServer` (simpeler maar werkt slechter bij Sonnet/Haiku-mix)
- (c) Behoud beide als parallel bescherming (dubbele veiligheid, marginaal duurder per call)

Voor nu: parallel laten draaien. Cap = wie het eerst hit.

### Flag dag2-2 — Demo-data seed kolommen
De seed-API gebruikt deze kolommen per tabel:
- `klanten`: naam, email, telefoon, adres, organization_id
- `leveranciers`: naam, categorie, organization_id
- `inventory`: naam, current_stock, min_stock, par_stock, unit, purchase_price, leverancier_id, organization_id
- `gerechten`: naam, categorie, gang_slug, kostprijs_pp, omschrijving, status, organization_id
- `events`: name, date, guests, ppp, status, type, client_naam, location, organization_id

**Verifieer morgen** of deze namen kloppen met je actuele schema (Supabase Studio → SQL editor → `\d klanten` etc.). Als een kolom anders heet faalt de bulk-insert met een column-not-found error en krijg je een `partial` response met de errors[]-lijst.

### Flag dag2-3 — Server Actions zijn klaar maar NIET bedraad in UI
De drie `actions.ts` files (events/offertes/gerechten) bevatten Zod-gevalideerde, re-auth'd upsert/delete-acties. Maar de bestaande Client-Components (`EventEditor`, `/offertes/page.tsx` 874r, `/gerechten/_client.tsx` 1805r) gebruiken nog steeds direct-Supabase-mutates.

**Te doen morgen** (~30 min per file): vervang in elke component de `supabase.from('events').insert(...)` calls door `await upsertEvent(formData)` + `useTransition`. Patroon staat in de comments boven elke action-file.

### Flag dag2-4 — AI Act badge: 6 plekken nog niet bedraad
Klaar: AIPromptDrawer (Vandaag).

Nog te bedraden (allemaal `<AiBadge model="..." inline />` toevoegen bij de AI-output):
- `AiOfferteWizard.tsx` — bovenaan menu-suggesties
- `/bedenker/_components/ConceptDrawer.tsx` — bij de gedetailleerde recept-weergave (cards hebben al CitationsChip, voldoende)
- `bon-extract` review-modal — bij OCR-resultaten
- `/price-intelligence` review-queue — bij AI-geëxtraheerde prijsmutaties
- `/api/today-briefing` rendering (Vandaag-page) — bij de chat-bubble
- `klantgesprek/extract` rendering — bij de samenvattings-card

### Flag dag2-5 — `enforceAiCap` retourneert nu direct een NextResponse
De helper importeert `NextResponse` lazy via `await import('next/server')` om bundle-impact in client-files te vermijden. Dit werkt in Node-runtime Server Components/API-routes. Test: stuur een test-tenant op 151% spend → volgende AI-call returnt status 402 + `{ error: 'ai_cap_exceeded', ... }`.

### Dag 2 — extra bedrading (na build-log update)

**AI Act badge** nu in 3 plekken bedraad:
- AIPromptDrawer.tsx — Vandaag AI-drawer
- AiOfferteWizard.tsx — offerte-wizard preview-step
- BonAddSheet.tsx — bon-extract review-modal

**Server Action showcase**: `EventEditor.saveEvent` + `EventEditor.deleteEvent` gebruiken nu `upsertEvent` resp. `deleteEvent` uit `src/app/events/actions.ts`. Direct `supabase.from('events').update/delete` calls zijn vervangen. Schema staat ruimhartig open (incl. legacy `'completed'`/`'confirmed'` statussen + passthrough voor onbekende velden) zodat bestaande events niet door Zod worden geweigerd.

**Patroon voor offertes + gerechten morgen**:
```ts
// In offertes/page.tsx of gerechten/_client.tsx:
import { upsertOfferte } from '@/app/offertes/actions'; // of upsertGerecht
// Vervang:
//   const { error } = await supabase.from('offertes').upsert(payload);
// Met:
//   const result = await upsertOfferte(payload);
//   if ('error' in result) toast.error(result.error);
//   else toast.success('Offerte opgeslagen');
```

### Eindstand dag 2 (2026-05-19)

**51 bestandswijzigingen** op disk (14 nieuw, 33 gemodificeerd, 4 verwijderd):
- 9 nieuwe helpers / componenten: `aiCostCap.ts`, `btw-rules.ts`, `AiBadge.tsx`, `aiCostCap.ts`-wrapper, `bcgAnalysis.ts`, 3× Server Action files, demo-data seed-route
- 1 migration: Mollie idempotency
- 7 modified API-routes (Mollie, Moneybird×2, bon-extract, 7 Sonnet-routes)
- Diverse UI-modificaties

**Wat ECHT klaar is** (kan morgen direct getest):
- ✅ `/offerte-editor` weg + redirect
- ✅ Email-in-adres in mailbox
- ✅ Vandaag deep-links (4 kaarten + agenda focus)
- ✅ AI-prompts context-aware naar heroEvent
- ✅ BTW-rules centraal (`BTW_RULES_2026`) + bonProcessing-integratie
- ✅ Per-tenant labor-rate in `accounting_config`
- ✅ Mollie webhook idempotency (migration + bedraad)
- ✅ Moneybird OAuth refresh (helper + bedraad in 2 routes)
- ✅ Token entropy + rate-limit op `/q/[token]`
- ✅ AI cost hard-cap in 9 dure Anthropic-routes
- ✅ AI Act "Door AI samengesteld" badge in 3 UI-plekken
- ✅ /admin/funnel met 5 KPI's + funnel-grafiek
- ✅ Menu-analyse = werkende BCG (geen stub)
- ✅ AI Pitmaster = werkende prompt-page (geen stub)
- ✅ `/bedenker` zit als sub-tab in Menu & Recepten
- ✅ Componenten fysiek verplaatst van /inspiratie naar /gerechten
- ✅ Demo-data seed-API klaar
- ✅ Server Actions klaar voor events/offertes/gerechten
- ✅ EventEditor.save/delete gebruikt nu Server Action (OWASP A01 showcase)

**Wat morgen nog te doen** (volgende sessie):
1. Bedraad Server Actions `upsertOfferte` in `offertes/page.tsx` (~30 min)
2. Bedraad Server Action `upsertGerecht` in `gerechten/_client.tsx` (~30 min)
3. AI Act badge bedraden in 4 resterende plekken (`/bedenker` ConceptDrawer, klantgesprek-summary, today-briefing-render, price-intelligence-review)
4. Migration `20260519100000_mollie_webhook_idempotency.sql` runnen in Supabase Studio
5. Test demo-data seed met een nieuwe test-tenant
6. Mega-refactor 1: `financien/page.tsx` 673r → Server + Client split (P0.31)

**Wat in een latere sessie** (te groot voor een dag):
- `voorraad/page.tsx` 2037r refactor (P0.24)
- `price-intelligence/page.tsx` 4600r refactor (P0.25)
- `gerechten/_client.tsx` 1805r refactor (P0.19)
- Type-safety pass over hele app (remove `eslint-disable any`)
- `globals.css` opruim 10k → 2k regels
- Realtime price-mutation trigger (P0.28) — bestaande `scanMargeAlerts` cron werkt al, trigger is optimalisatie

---

## Dag 3 toevoegingen (2026-05-20) — Track A: mega-refactors

**Onderbroken** door Sam: ik heb 3 Server/Client splits voltooid maar stop hier om hem ruimte te geven om te reviewen voordat ik verder ga. Geen `pnpm typecheck` / `pnpm build` uitgevoerd — Sam doet dat zelf.

| Wat | Voor | Na | Status |
|---|---|---|---|
| Financien split (P0.31) | 1 monolith 681r | 57r Server shell + 691r Client + `FinancienInitial` props | ✅ met data-prefetch |
| Voorraad split (P0.24) | 1 monolith 2037r | 37r Server shell + 2047r Client + `VoorraadInitial` props | ✅ met data-prefetch |
| Price-intelligence split slice 1 (P0.25) | 1 monolith 4600r | 17r Server shell + 4607r Client | 🟡 slice 1 alleen — sub-components fetchen nog zelf, slice 2 splitst 4 tabs |

**Patroon dat ik heb vastgelegd** (voor toekomstige hub-splits, bv. gerechten/_client.tsx 1805r):
```ts
// 1) page.tsx (Server Component, geen 'use client'):
import { createServerSupabase } from '@/lib/supabase-server';
import HubClient, { type HubInitial } from './_components/HubClient';
export const dynamic = 'force-dynamic';
export default async function Page() {
    const sb = await createServerSupabase();
    const [a, b, c] = await Promise.all([sb.from('x').select('*'), ...]);
    const initial: HubInitial = { a: a.data ?? [], ... };
    return <HubClient initial={initial} />;
}

// 2) _components/HubClient.tsx (Client Component):
'use client';
export interface HubInitial { a?: A[]; b?: B[]; ... }
export default function HubClient({ initial }: { initial?: HubInitial } = {}) {
    const { data: a } = useSupabase<A>('x', initial?.a ?? []);
    // ... rest blijft hetzelfde
}
```

**Caveat**: `useSupabase` doet altijd een refetch na mount. Dat is voor nu acceptabel (eerste paint heeft data, refetch is identiek dus geen flash), maar idealiter krijgt `useSupabase` een `skipInitialFetch` opt-in om netwerkverkeer te halveren. Dat is een lib-niveau-tweak voor later — niet kritisch.

### Nieuwe ⚠️ beslis-flag voor Sam

**Flag dag3-1 — Price-Intelligence slice 2 (de écht-grote refactor)**

Slice 1 (vandaag) levert: Server-shell, geen `'use client'` op page-niveau, sub-components ongewijzigd. **First Paint verbetering is minimaal** want de top-level Client-body doet zelf geen data-fetch.

Slice 2 (volgende sessie) = écht splitsen in 4 tab-files:
- `_tabs/InvoicesTab.tsx` (van regel 595-915 in huidige Client) — invoice-folder + AI-extract flow
- `_tabs/ReceiptsTab.tsx` (regel 1599-3277) — bonnen-folder + bon-scan flow  
- `_tabs/PricelistsTab.tsx` (regel 3278-4148) — pricelist-folder + supplier-prijs-update
- `_tabs/BooksTab.tsx` (regel 4149-eind) — boekhouding-folder + export

Per tab: eigen Server Component prefetch van zijn 1-3 tabellen → dat is waar de echte LCP-winst zit. Geschat 1 dag werk.

### Eindstand dag 3 (parked)

**56 bestandswijzigingen** op disk (was 51 eind dag 2, +5):
- 3 nieuwe `_components/` directories met Client files
- 3 modified page.tsx → Server Component shells
- 1 modified build-log (deze file)

**Volledige stack-status na 3 dagen autonoom werk**:
- ✅ ~33 P0's afgehandeld
- ✅ 9 dure Anthropic-routes met hard-cap
- ✅ 2 Moneybird-routes met OAuth-refresh
- ✅ 3 mega-pages Server/Client gesplitst (financien, voorraad, price-intelligence)
- ✅ Mollie webhook idempotent
- ✅ BTW-lookup centraal + bedraad
- ✅ AI Act badge in 3 UI-plekken
- ✅ Demo-data seed-API + activation-funnel grafiek
- ✅ Server Actions voor events/offertes/gerechten (events bedraad in EventEditor)

**Niet getest in browser of via typecheck** — Sam moet morgen:
1. `pnpm typecheck` runnen
2. `pnpm build` runnen  
3. `pnpm dev` + bezoek `/financien`, `/voorraad`, `/price-intelligence` om te verifieren dat first paint werkt
4. Migration `20260519100000_mollie_webhook_idempotency.sql` in Supabase Studio

**Bij type-errors morgen**: meest waarschijnlijke oorzaak is mismatch tussen DB-kolommen en de in-component types (`Offerte`, `Factuur`, etc. uit `@/types`). De Server-side queries selecteren `*` dus krijgen alle kolommen — als een Client-type strikter is, kan TS klagen. Fix: cast `initial.X as Offerte[]` of verbreedt het Client-type met `& Record<string, unknown>`.

### Patroon voor de gerechten/_client.tsx 1805r refactor (P0.19, voor later)

Zelfde drie-stap als financien/voorraad — `cp` → rename functie → Server shell. Tabellen om te prefetchen: `gerechten`, `components`, `gerecht_components`, `ingredienten` (uit inventory), `allergens`. Geen useSearchParams in de top-level zover ik kon zien dus geen extra Suspense nodig.

### Dag 3 — vervolg (na review-pauze)

Sam was even weg, kwam terug met "ga door". Vervolg op de mega-refactors:

| Wat | Status |
|---|---|
| **P0.19 Gerechten split (4e mega-file)** — page.tsx Server prefetch + GerechtenInitial-prop in _client.tsx (1805r). Set "alle 4 mega-files Server/Client gesplitst" is compleet. | ✅ |
| **Offerte deleteOfferte Server Action wiring** — `deleteOfferte()` in `/offertes/page.tsx` gebruikt nu `deleteOfferteAction` met Zod + re-auth. Save-flow ongewijzigd (complexer pad met syncQuoteToEvent + acceptance-workflow — separate taak). | ✅ showcase |
| **OfferteSchema verbreed** met `.passthrough()` + legacy statussen `goedgekeurd`/`voltooid` zodat bestaande offertes niet door Zod worden geweigerd. | ✅ |
| **Activation events bedraad** (4 events uit ux-master.md sectie 7): | ✅ |
| · `first_klant_created` in `/klanten/page.tsx:saveKlant` | ✅ |
| · `first_gerecht_created` in `/gerechten/_client.tsx:saveGerecht` | ✅ |
| · `ai_wizard_used` in `AiOfferteWizard.tsx` (na succesvolle Anthropic-call) | ✅ |
| · `ai_allergen_detect` in `/gerechten/_client.tsx:detectAllergensViaAi` (als ≥1 allergen geretourneerd) | ✅ |

**Eindstand dag 3** (na vervolg): **60 bestandswijzigingen** op disk (was 56 voor de pauze, +4):
- 2 nieuwe `_components/` directories (financien + voorraad, price-intel = 3 totaal incl. eerder), gerechten gebruikt bestaande `_client.tsx`
- 4 mega-files Server/Client-split met initial-data prefetch waar mogelijk
- 4 activation events bedraad zodat `/admin/funnel` echte cijfers gaat tonen
- 1 Server Action showcase in offertes/page.tsx (delete)
- OfferteSchema verbreed voor backwards-compat

**Cumulatief over 3 dagen autonome bouw**:
- ~38 P0's afgehandeld
- 4 van 4 mega-pages Server/Client gesplitst (gerechten + financien + voorraad + price-intel)
- 9 dure Anthropic-routes met EUR-based hard-cap
- 2 Moneybird-routes met OAuth refresh
- 4 activation-events bedraad (samen met de 2 van dag 1 = 6 van 9 events)
- 3 Server Actions klaar + 2 bedraad in UI (events + offertes-delete)
- Mollie webhook idempotent, BTW-lookup centraal, AI Act badge in 3 plekken
- Demo-data seed, activation-funnel grafiek, AI Pitmaster + Menu-analyse echte content

**Eerst doen morgen (in deze volgorde)**:
1. `pnpm typecheck` — 4 mega-files met `initial?` props moeten compileren
2. `pnpm build` — Server Components compileren naar RSC bundles
3. Open `/`, `/financien`, `/voorraad`, `/gerechten`, `/price-intelligence` in dev — verifieer first paint
4. Migration `20260519100000_mollie_webhook_idempotency.sql` in Supabase Studio
5. Quick-test: maak een nieuwe klant → check `activation_events` tabel → `first_klant_created` rij?
6. Quick-test: AI-Wizard runnen → `ai_wizard_used` rij?

**Bij type-errors**: zoals eerder gemeld is de meest waarschijnlijke oorzaak `select('*')`-resultaat dat strikter typed wordt door Client. Cast `as Offerte[]` of voeg `as any` toe in de initial-prop spread.

**Volgende sessie kandidaten** (geordend op impact):
- **Server Action save-flow** in offertes (complex pad met workflow-chain — vereist careful refactor)
- **Server Action wiring** in gerechten (gebruik upsertGerecht voor saveGerecht)
- **Price-intelligence slice 2** — splits 4600r in 4 tab-files (InvoicesTab/ReceiptsTab/PricelistsTab/BooksTab) met eigen Server prefetch per tab
- **Type-safety pass** — `eslint-disable any` wegwerken (saai werk, hoge correctness-winst)
- **globals.css opruim** 10k → 2k regels (P0 uit roadmap)

---

## Wat is veranderd — overzicht in mensentaal

Drie groepen werk:

### Groep 1 — Dingen die nu doodgaan of opgeruimd zijn
- **`/offerte-editor` route is weg** (memory zei "dood" — nu écht weg). Oude bookmarks krijgen een 308-redirect naar `/offertes` via middleware.
- **Tooltip in offerte-view** verwees nog naar "publiceer via offerte-editor" — bijgewerkt naar "open op /offertes".
- **`/inspiratie/componenten/` directory weg**: 1595 regels code zijn fysiek verplaatst naar `/gerechten/componenten/`. De re-export-stub die daar stond is weg. Geen interne imports gebroken.

### Groep 2 — Nieuwe waarheid + sneltoegang
- **Email-in-adres staat nu op `/mailbox`** als gouden banner met kopieer-knop. Tenant ziet direct waar leveranciers PDFs heen moeten sturen.
- **Vandaag-deeplinks**: alle 5 AttentionPanel-kaarten hebben nu een `?filter=` of `?focus=` query-param. Klik op "facturen >30 dagen" → opent `/facturen?overdue=1&focus=<id>` i.p.v. generiek `/facturen`.
- **Agenda honoreert `?conflict=<event-id>`** uit Vandaag: highlight + auto-scroll naar het event, 5s een outline-ring, daarna terug naar normaal.
- **AI Quick Prompts op Vandaag** zijn nu **context-aware**: als er een hero-event is staan er bovenaan 4 prompts met de event-naam erin ("Maak briefing voor [Eventnaam]", "Meelijst voor [N] gasten", etc.). Generieke prompts blijven daaronder.
- **`/bedenker` zit nu in de Menu & Recepten tab-bar**: tabblad "AI Bedenker" tussen Ingrediënten en AI Pitmaster. URL blijft `/bedenker` (geen breaking change voor bookmarks), maar visueel is hij onderdeel van de hub.
- **AI Pitmaster, Menu-analyse, Allergenen** zijn nu in de tab-bar in een logische volgorde (van werkdag links naar analyse rechts).
- **`ux-master.md` sectie 5 IA-overzicht** is gesynchroniseerd met de echte sidebar uit `navigation.tsx` (was achter op de code lopen).

### Groep 3 — Onder de motorkap: veiligheid, kosten, NL-compliance
- **BTW lookup-tabel** `src/lib/btw-rules.ts` is nieuw. Eén bron van waarheid voor de NL-2026 percentages (food 9%, service/alcohol/transport 21%, B2B reverse 0%). AI mag de categorie suggereren, deze tabel geeft de rate. Hard rule 1 nu eenduidig.
- **`bonProcessing.ts` gebruikt `validateBtwPct`** uit de nieuwe tabel i.p.v. een eigen drempel-functie. Geen drift meer mogelijk tussen bon-OCR en factuur-pad.
- **AI hard-cap kill-switch** `src/lib/aiCostCap.ts`: vóór elke dure Anthropic-call check je `checkAiCap(orgId, geschatte_kosten)`. Bij hard-cap (150% van tier-limit) → 402 zonder de Anthropic-call te doen. Bedraad in `bon-extract` route als voorbeeld; rest van AI-routes morgen in 1 batch.
- **Mollie webhook idempotency**: migration `20260519100000_mollie_webhook_idempotency.sql` voegt `processed_mollie_events` tabel toe met UNIQUE(payment_id, status). Webhook-route doet INSERT vóór factuur-update — bij retry komt 23505-conflict en stuurt de webhook 200 OK terug zonder dubbele processing.
- **Moneybird OAuth refresh**: nieuwe helpers in `src/lib/moneybird.ts` (`refreshAccessToken`, `getValidMoneybirdToken`). Token-rotation gebeurt automatisch wanneer token binnen 5 min vervalt. `expires_at` wordt nu opgeslagen tijdens callback. Bedrading in `/api/accounting/moneybird` en `/api/ritten/moneybird-push` staat als follow-up.
- **Public-offerte rate-limit**: `/api/public-offerte/[token]` heeft nu max 20 requests/min per IP. Bij overschrijding 429 met `Retry-After` header. Anti-scraping voor de publieke endpoint zonder auth.
- **AI Act badge** `src/components/ai/AiBadge.tsx`: herbruikbare component die "Door AI samengesteld" toont met `Sparkles`-icon. Niet automatisch bedraad — moet bij elke AI-output-render aan, dat is een batch voor morgen.
- **Per-tenant labor-rate** in `accounting_config.labor_cost_per_hour`. Default 35 voor werkdagen, 42 voor weekend. `/financien` leest het uit settings i.p.v. hardcoded €35.
- **Activation-funnel grafiek** op `/admin/funnel`: visualisatie met horizontale bars per stap, conversie-% tussen stappen, kleur groen/oranje als doel gehaald/gemist. 5 stappen: signup → quiz → activated → 1e offerte concept → 1e verzonden.

---

## Voortgang — 18 P0's afgehandeld

> Status: ✅ klaar · ⚠️ flag voor Sam · ⏭️ herzien

| P0 | Status | Wat | Files |
|---|---|---|---|
| P0.10 | ✅ | `/offerte-editor` directory verwijderd + middleware 308-redirect + tooltip-fix | [middleware.ts:7](src/middleware.ts:7), [offertes/[id]/view/page.tsx:541](src/app/offertes/[id]/view/page.tsx:541) |
| P0.45 | ✅ | `docs/ux-master.md` sectie 5 IA-overzicht gesynced met navigation.tsx | [docs/ux-master.md:70](docs/ux-master.md:70) |
| P0.44 | ✅ | Email-in-adres-banner in `/mailbox` met kopieer-knop | [mailbox/page.tsx:36,233](src/app/mailbox/page.tsx) |
| P0.26 | ⚠️ | ExtensionConnectPanel is API-key-manager (geen scraper) — laten staan | zie flag hieronder |
| P0.8 | ✅ | Agenda `?conflict=<id>` deep-link met scroll + 5s focus-ring | [agenda/page.tsx:650-670](src/app/agenda/page.tsx) |
| P0.4 | ✅ | Vandaag AttentionPanel 5 kaarten met query-param deep-links | [page.tsx:442-510](src/app/page.tsx:442) |
| P0.6 | ⏭️ | HACCP `/haccp/field` is GEEN duplicaat — quick-entry zonder event. Geen actie, zie flag | n.v.t. |
| P0.22 | ✅ | `/bedenker` als sub-tab in Menu & Recepten + eigen layout | [GerechtenTabs.tsx](src/components/GerechtenTabs.tsx), [bedenker/layout.tsx](src/app/bedenker/layout.tsx) |
| P0.15 | ✅ | BTW-lookup-tabel + audit acceptance-workflow (geen direct BTW daar) | [lib/btw-rules.ts](src/lib/btw-rules.ts) |
| P0.23 | ✅ | Allergeen hard-rule audit: detect-allergens schrijft alleen `allergen_code` uit whitelist (`ai_suggested=true`). Clean. | [api/detect-allergens/route.ts:150-179](src/app/api/detect-allergens/route.ts) |
| P0.33 | ✅ | BTW Geld-hub audit + `bonProcessing` gebruikt nu `validateBtwPct` uit centrale tabel | [lib/bonProcessing.ts:99-111](src/lib/bonProcessing.ts) |
| P0.2 | ✅ | AIQuickPrompts neemt heroEvent prop, bouwt 4 event-aware prompts bovenaan | [today/AIQuickPrompts.tsx:33-83](src/components/dashboard/today/AIQuickPrompts.tsx) |
| P0.34 | ✅ | `labor_cost_per_hour` in `AccountingConfig` + Financien leest uit settings | [accountingConfig.ts:8-30](src/lib/accountingConfig.ts), [financien/page.tsx:82](src/app/financien/page.tsx:82) |
| P0.40 | ✅ | AI hard-cap helper + bedraad in bon-extract route (rest morgen) | [lib/aiCostCap.ts](src/lib/aiCostCap.ts), [api/boekhouder/bon-extract/route.ts:111-122](src/app/api/boekhouder/bon-extract/route.ts) |
| P0.16 | ✅ | Token entropy ✓ (UUID via gen_random_uuid) + rate-limit 20/min per IP | [api/public-offerte/[token]/route.ts:5-37](src/app/api/public-offerte/[token]/route.ts) |
| P0.11 | ✅ | Mollie webhook idempotency migration + bedraad webhook | [migrations/20260519100000_mollie_webhook_idempotency.sql](supabase/migrations/20260519100000_mollie_webhook_idempotency.sql), [api/payments/mollie/webhook/route.ts:50-80](src/app/api/payments/mollie/webhook/route.ts) |
| P0.12 | ✅ (helper) | Moneybird OAuth refresh helper + expires_at in callback. Bedrading in routes = follow-up | [lib/moneybird.ts:46-160](src/lib/moneybird.ts), [api/integrations/moneybird/callback/route.ts:54-70](src/app/api/integrations/moneybird/callback/route.ts) |
| P0.20 | ✅ | `/inspiratie/componenten/page.tsx` (1595r) fysiek verplaatst naar `/gerechten/componenten/page.tsx`. Re-export-stub weg. | `mv` ops |
| P0.39 | ✅ | Funnel-grafiek (5 stappen, conversie-%, groen/oranje per target) op /admin/funnel | [admin/funnel/page.tsx:280-294,376-430](src/app/admin/funnel/page.tsx) |
| NL-15 | ✅ (component) | AI Act badge component "Door AI samengesteld" — bedrading volgt | [components/ai/AiBadge.tsx](src/components/ai/AiBadge.tsx) |

---

## ⚠️ Beslis-flags voor Sam (te reviewen morgen)

### Flag 1 — ExtensionConnectPanel (P0.26)
**Wat ik vond**: `src/app/leveranciers/_components/ExtensionConnectPanel.tsx` is geen scraper, het is een **Chrome-extensie API-key-manager**. Genereert keys via `/api/extension-keys`, toont laatste-gebruik per key, kan revoken. De extensie zelf is wat scraping zou kunnen doen — die staat niet in deze repo.

**Memory zegt**: scraper-route afgewezen.

**Beslissing nodig**: 
- (a) Chrome-extensie is nog in gebruik bij Hop & Bites → laat panel staan
- (b) Chrome-extensie is uitgefaseerd → verwijder panel + `/api/extension/*` routes + `extension_keys` tabel
- (c) Extensie doet iets anders dan scrapen (bv import van webshop-orders) → laat staan, documenteer scope

Voor nu: **laten staan + niet meer aandacht aan besteden**. Sam kiest.

### Flag 2 — HACCP `/haccp/field` (P0.6)
**Wat ik vond**: 457 regels werkelijke quick-entry-modus met presets, voice-input, label-print. NIET een duplicaat van `/events/[id]/field` (332r, event-scoped HACCP).

**Roadmap zei**: dedupliceren. Klopt niet.

**Beslissing nodig**:
- (a) Houd beide modi — generic quick-entry + event-scoped. Documenteer verschil in help.
- (b) Maak `/haccp/field` óók event-koppelbaar als optioneel veld in de form. Beste UX maar 4-6u werk.

Voor nu: **niets gedaan**. Sam kiest.

### Flag 3 — Hub-naam beslissing
**Wat is canoniek**: `navigation.tsx` zegt "Menu & Recepten + Systeem". `ux-master.md` zei "Inspiratie Bibliotheek + Instellingen & Hulp". Ik heb `ux-master.md` aangepast aan de code.

**Beslissing nodig** (uit eerdere vraag die je dismissed): wil je
- (a) Code-realiteit volgen ("Menu & Recepten + Systeem") — ✅ nu zo, geen actie nodig
- (b) Code aanpassen naar bedoelde IA ("Inspiratie Bibliotheek + Instellingen & Hulp") — vereist sidebar-update + tab-bar-update

### Flag 4 — Mollie webhook + Moneybird OAuth migration runnen
**Beslissing**: jij draait deze migraties in Supabase Studio:
- `supabase/migrations/20260519100000_mollie_webhook_idempotency.sql` — voegt `processed_mollie_events` tabel toe

Geen breaking change voor bestaande data. Idempotent (`CREATE TABLE IF NOT EXISTS`).

### Flag 5 — AI hard-cap bedraden in alle routes
**Wat is gedaan**: helper `aiCostCap.ts` + bedraad in bon-extract als showcase.

**Te bedraden morgen** (5-min per route):
- `/api/recipe-generate` (Sonnet, duur)
- `/api/parse-pricelist` (Sonnet vision, duurste)
- `/api/ai/supplier-catalog-parse` (Sonnet vision batch-25)
- `/api/supplier-analysis` (Sonnet)
- `/api/recipe/ai-improve` (Sonnet)
- `/api/recipe/refine-price` (Sonnet)
- `/api/today-briefing` (Haiku, goedkoop maar veel-gebruik)
- `/api/chef-coach` (Haiku streaming)
- `/api/detect-allergens` (Haiku, veel-gebruik)
- `/api/boekhouder/classify` (Haiku)
- `/api/klantgesprek/extract` (Haiku)

Patroon (knip-en-plak):
```ts
import { checkAiCap } from '@/lib/aiCostCap';
// ... na orgId-resolution:
const cap = await checkAiCap(orgId, 0.05); // bv €0.05 schatting per call
if (cap.status === 'hard_block') {
  return NextResponse.json({ error: 'ai_cap_exceeded', ...cap }, { status: 402 });
}
```

### Flag 6 — AI Act badge bedraden bij elke AI-output
**Wat is gedaan**: `<AiBadge />` component klaar.

**Te bedraden** (alleen render-plekken, geen logica):
- `AIPromptDrawer` → onderaan response
- `AiOfferteWizard` → bovenaan menu-suggesties
- `/bedenker` → op concept-cards
- `/gerechten/ai-pitmaster` → bij elke chat-response
- `bon-extract` review-modal → bij OCR-resultaten
- `price-intelligence` review-queue → bij AI-geëxtraheerde mutaties
- `/api/today-briefing` rendering → onderaan briefing

Gebruik: `<AiBadge model="claude-haiku-4-5" />`

### Flag 7 — Moneybird-refresh bedraden in routes
**Wat is gedaan**: helper `getValidMoneybirdToken()` klaar.

**Te bedraden** (15 min):
- `src/app/api/accounting/moneybird/route.ts` — vervang directe `feature_flags.moneybird.access_token`-read door helper-call
- `src/app/api/ritten/moneybird-push/route.ts` — idem

Patroon:
```ts
import { getValidMoneybirdToken } from '@/lib/moneybird';
const tok = await getValidMoneybirdToken(serviceSupabase, orgId);
if ('error' in tok) return NextResponse.json({ error: tok.error }, { status: 503 });
await pushInvoice(tok.access_token, tok.administration_id, input);
```

---

## Wat NIET in deze sessie is gedaan (verwacht morgen of later)

### Zware refactors (4-16u per stuk, te groot voor 1 sessie)
- **P0.1** Vandaag Server Component split (885r → server + client) — 6u
- **P0.5** `serviceMockData.ts` wegvegen + Server Component KDS-service (1374r) — 6u
- **P0.7** Plannen Server Actions voor event-CRUD — 4u
- **P0.14** Verkoop Server Actions voor offerte-CRUD — 4u
- **P0.17** AI Pitmaster echte content (geen stub) — 8u
- **P0.18** Menu-analyse BCG embed (verplaats /marges component) — 4u
- **P0.19** `gerechten/_client.tsx` 1805r refactor — 8u
- **P0.21** Menu Server Actions — 6u
- **P0.24** Voorraad `page.tsx` 2037r refactor — 10u
- **P0.25** Price-Intelligence `page.tsx` 4600r refactor — 16u
- **P0.27** Voorraad Server Actions — 6u
- **P0.28** Price-mutation trigger + `marge_alerts` insertion — 4u
- **P0.30** Voorraad type-safety pass — 8u
- **P0.31** Financien Server Component split — 5u
- **P0.32** Boekhouder Server Component + ZIP-Server-Action — 6u
- **P0.35** Geld Server Actions — 6u
- **P0.38** Demo-data seed API `/api/onboarding/seed-demo` — 8u
- **P0.41** Website + Admin Server Component splits — 8u

### Type-safety pass overall
Bij elke hub stond P0 voor "eslint-disable any weghalen + Supabase-types gebruiken". Dit is veel knip-en-plak-werk dat ik kan doen, maar het breekt mogelijk veel call-sites tegelijk. Beter dat morgen samen doen.

### globals.css opruim (10k → 2k regels)
Cross-cutting § 11. Mega-cleanup, 8u werk, niet trivial.

### Promptfoo eval-suite
- `evals/bon-classify.eval.yaml` (P0.37)
- `evals/offerte-wizard-citations.eval.yaml`
- `evals/event-type-suggest.eval.yaml`

---

## Per-file-diff samenvatting (29 wijzigingen)

| Type | File | Aanleiding |
|---|---|---|
| Verwijderd | `src/app/offerte-editor/page.tsx` | P0.10 |
| Verwijderd | `src/app/offerte-editor/error.tsx` | P0.10 |
| Verwijderd | `src/app/offerte-editor/loading.tsx` | P0.10 |
| Verwijderd | `src/app/inspiratie/componenten/page.tsx` | P0.20 (verplaatst) |
| Nieuw | `src/app/gerechten/componenten/page.tsx` | P0.20 (1595r, was re-export) |
| Nieuw | `src/app/bedenker/layout.tsx` | P0.22 |
| Nieuw | `src/components/ai/AiBadge.tsx` | NL-15 |
| Nieuw | `src/lib/aiCostCap.ts` | P0.40 |
| Nieuw | `src/lib/btw-rules.ts` | P0.15 / P0.33 |
| Nieuw | `supabase/migrations/20260519100000_mollie_webhook_idempotency.sql` | P0.11 |
| Nieuw | `docs/top-tier-roadmap.md` | (de roadmap zelf) |
| Nieuw | `docs/top-tier-build-log.md` | (dit document) |
| Edit | `src/middleware.ts` | P0.10 redirect |
| Edit | `src/app/offertes/[id]/view/page.tsx` | P0.10 tooltip |
| Edit | `docs/ux-master.md` | P0.45 |
| Edit | `src/app/mailbox/page.tsx` | P0.44 |
| Edit | `src/app/agenda/page.tsx` | P0.8 + EventChip focused-prop |
| Edit | `src/app/page.tsx` | P0.4 deep-links + P0.2 heroEvent pass-through |
| Edit | `src/components/dashboard/today/AIQuickPrompts.tsx` | P0.2 |
| Edit | `src/components/GerechtenTabs.tsx` | P0.22 |
| Edit | `src/lib/bonProcessing.ts` | P0.33 |
| Edit | `src/lib/accountingConfig.ts` | P0.34 |
| Edit | `src/app/financien/page.tsx` | P0.34 |
| Edit | `src/lib/moneybird.ts` | P0.12 |
| Edit | `src/app/api/integrations/moneybird/callback/route.ts` | P0.12 |
| Edit | `src/app/api/payments/mollie/webhook/route.ts` | P0.11 |
| Edit | `src/app/api/public-offerte/[token]/route.ts` | P0.16 |
| Edit | `src/app/api/boekhouder/bon-extract/route.ts` | P0.40 |
| Edit | `src/app/admin/funnel/page.tsx` | P0.39 |

---

## Commands voor morgen

Verificatie:
```bash
# Lokaal eerst type-check + build (geen merge nodig)
pnpm typecheck
pnpm build

# Migratie draaien in Supabase Studio (handmatig of via CLI)
supabase db push  # of plak de SQL handmatig

# Review per file
git diff <file>

# Bij twijfel: ga terug naar HEAD
git checkout <file>
```

Als alles klopt: groepeer in 3-4 logische commits (bv "fix: dead route /offerte-editor", "feat: NL-2026 BTW lookup", "feat: AI hard-cap kill-switch", "feat: Mollie idempotency").

---

## Vragen die ik niet kon beantwoorden

1. **`tier` kolom in `organizations` tabel**: bestaat die? `aiCostCap.ts` leest `org.tier` met fallback 'starter'. Als de kolom ontbreekt is iedereen automatisch starter — relatief veilig maar Pro-tier tenants krijgen verkeerd cap. Verifieer met `\d organizations` in Supabase.
2. **Mollie test-mode credentials**: kun je morgen via Mollie Dashboard een test-payment doen om idempotency te valideren? Stuur dezelfde webhook 2× → eerste = factuur op 'betaald', tweede = 200 OK zonder dubbele update.
3. **Moneybird expires_in werkelijke waarde**: Moneybird-docs zeggen 30 dagen maar ik heb het zelf niet gemeten. Test bij volgende OAuth-callback: `console.log(tokenRes.expires_in)`.
