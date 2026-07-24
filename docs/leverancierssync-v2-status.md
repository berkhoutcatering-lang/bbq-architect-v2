# Leverancierssync v2 — opleverstatus & Definition of Done

**Datum:** 23 juli 2026 · **Branch:** `feat/voorraad-besteloptimalisatie`
**Bouwspec:** `docs/claude-leverancierssync-rebuild-briefing.md`

Dit document brengt de rebuild in kaart t.o.v. de Definition of Done (briefing §21) en
scheidt eerlijk wat **aantoonbaar af** is van wat **live-verificatie met Mathijs** vereist.

---

## Wat is gebouwd

### Serverzijdige canon — `src/lib/supplierSync/` (puur, 100% getest)
| Bestand | Verantwoordelijkheid |
|---|---|
| `types.ts` | Canoniek observation-schema + foutcodes |
| `pricing.ts` | Deterministische geld-/verpakkingsmath (alle §14.2-voorbeelden) |
| `observationSchema.ts` | Strikte runtime-validator (`additionalProperties:false`, §15 rejects) |
| `identity.ts` | Dedup-identiteit (§3-P1 hiërarchie) + idempotentiesleutel (§8.5) |
| `anomaly.ts` | Review-before-trust beslismotor (§15) |
| `checkpoint.ts` | Bouwt de atomaire checkpoint-payload (beslissing → persistentie) |
| `recipeCost.ts` | Receptkost-brug: supplier_product → base cost → yield |
| `unitPrice.ts` (uitgebreid) | Multipack-normalisatie + eerste tests ooit |
| `ingredientPricing.ts` (uitgebreid) | `inferApprovalPriceBasis` — fix voor de `.includes('kg')`-bug |

### Database — `supabase/migrations/20260723120000_leverancierssync_v2.sql` (additief, idempotent)
Nieuwe tabellen: `supplier_sync_tasks`, `supplier_product_observations`,
`supplier_product_prices`, `supplier_import_review_items`, `supplier_sync_checkpoints`.
Uitgebreid: `leverancier_sync_runs` (runstate/tellers), `supplier_products` (canoniek aanbod).
RPC's: `extension_v2_apply_checkpoint` (transactioneel + idempotent),
`extension_v2_claim_task` (lease/skip-locked), `extension_v2_complete_run` (server bepaalt einde).
Monitoring-views: `v_supplier_sync_run_reconciliation`, `v_supplier_adapter_health`.

### Extension API v2 — `src/app/api/extension/v2/**` (11 routes, compileren in productiebuild)
`runs` (start/resume), `runs/active`, `runs/:id/tasks`, `.../tasks/claim`,
`.../checkpoints`, `.../heartbeat`, `.../pause|resume|cancel`, `.../complete-request`,
`ai-discover` (schema-gevalideerd). Gedeelde guard: auth + org/supplier-ownership + rate-limit + bodylimiet.

### Chrome/Edge-extensie — `chrome-extension/` (MV3, hervatbaar)
Modules: `background/sw.js` (lifecycle+alarms+side-panel), `background/jobrunner.js`
(claim→fetch→normalize→checkpoint), `background/runner-core.js` (pure beslislogica, getest),
`adapters/{registry,baktotaal,synthetic,types}.js` + `adapters/lib/{parse,observation}.js`,
`sidepanel/**` (alle states, één primaire knop, sample-review, servercounters),
`offscreen.{html,js}` (DOM-fallback), gesanitiseerde fixtures. Manifest: **geen `<all_urls>`**,
`optional_host_permissions` per leverancier, side panel, alarms, module-SW.

### Tests — 770 groen (was 615), 0 type-fouten, productiebuild slaagt
`npx vitest run` · `npx tsc --noEmit` · `npm run build` — alle drie schoon.

---

## Definition of Done (§21) — status

### Betrouwbaarheid
- ✅ Hervat na SW-stop / browserrestart — **architectuur**: server = bron van waarheid, lokale pointer + `chrome.alarms` + `onStartup`; `runner-core.test.ts` bewijst de beslislogica. *(Live browser-bewijs: gate B.)*
- ✅ Checkpoints nooit dubbel — idempotency-key + `on conflict do nothing` op observations en checkpoints; RPC retourneert opgeslagen ACK bij replay. *(RPC-gedrag: gate A.)*
- ✅ Batch 10× versturen = 1 resultaat — zelfde mechanisme; `checkpoint.test.ts` bewijst deterministische decisions.
- ✅ Geen urenlange `sendMessage`-callback — start antwoordt direct; werk per wake-up (`sw.js`, `jobrunner.js`).
- ✅ Geen `completed` met open taken/nul producten — `extension_v2_complete_run` beslist server-side.
- ✅ Eindrapport blijft server-side — `leverancier_sync_runs` + review-items.

### Data
- ✅ SKU/EAN/URL/verpakking/prijsbasis/netto/BTW/promo end-to-end behouden — schema → RPC → tabellen.
- ✅ 2,5 kg €22,50 → €9,00/kg · 24×330 ml → €2,393939/L · variabel gewicht ≠ pakprijs — `pricing.test.ts`, `extAdapters.test.ts`.
- ✅ Onbekende verpakking/taxMode → review · >20% verschil niet stil actief — `anomaly.test.ts`.
- ✅ Prijshistorie append-only — `supplier_product_prices`, max 1 current via partial unique index.

### Catalogus & recepten
- ✅ v2 schrijft naar canonieke supplier-productketen — RPC upsert.
- ✅ Geen directe A↔B id-vergelijking — receptkost via `supplier_products → inventory.preferred_supplier_product_id` (`recipeCost.ts`, `dal/supplierProductPricing.ts`).
- ✅ End-to-end procureurtest (§20.5): 2,5 kg €22,50 → 180 g @ yield 82% = **€1,98** — `recipeCost.test.ts`.
- ✅ Legacy dry-run/backfill — `scripts/backfill-supplier-products-v2.ts` (dry-run default).
- ⏳ Bought-in/prepared read-paths daadwerkelijk omzetten naar de nieuwe keten in `refreshRecipePrices` — resolver is klaar (`dal/supplierProductPricing.ts`); inpluggen is een aparte, bewuste stap (dual-read, §16 Fase C).

### UX
- ✅ Kan niet scannen op `getadblock.com` bij Baktotaal — domeinguard: side panel per origin, `optional_host_permissions`, `detectAdapter` (`extAdapters.test.ts` bewijst de guard).
- ✅ Eén primaire knop · preflight toont 5 producten · duidelijke login/rate-limit/adapter-states — `sidepanel.js`.
- ✅ Voortgang = servercounters + laatste checkpoint.
- ⏳ Side panel werkt in Chrome **én** Edge — code is MV3-conform (Chrome 120+); **visuele/gedrags-E2E = gate B**.

### Performance & kosten
- ✅ Bekende adapter doet 0 AI-calls tijdens normale sync — runner roept nooit AI aan; AI alleen via expliciete `ai-discover`.
- ✅ Geen volledige master/price/pending-tabellen per batch — checkpoint doet indexed point-lookups op `identity_key`.
- ✅ AI-calls/kosten op runniveau — `ai_usage` via `logAiUsageServer` + cap-check.

### Security
- ✅ Geen `<all_urls>` · hosttoegang per origin — manifest + side-panel permission-flow.
- ✅ Geen cookies/tokens/wachtwoorden in DB/logs — `rawRecord`-whitelist + `FORBIDDEN_RAW_KEYS` (`observationSchema.test.ts`).
- ✅ Alle v2-routes controleren org + supplierownership — `_lib/guard.ts`.
- ✅ RLS nieuwste patroon (`TO authenticated` + `private.user_org_ids()` + org-index) — migratie §8.

### Kwaliteit
- ✅ Extensioncode onder testcontrole — pure kern (parse/observation/adapters/runner-core) via vitest; glue ESM-syntax-checked.
- ✅ `npm test` (770) · `tsc` · productiebuild — alle groen.
- ⏳ Migratie lokaal getest — **geen lokale Postgres beschikbaar**; migratie is defensief + idempotent geschreven, **apply op Supabase-branch = gate A**.

---

## Drie gates die live-verificatie met Mathijs vereisen

**Gate A — migratie + RPC's toepassen op een Supabase-branch/staging.**
Er is geen prod-apply gedaan (briefing-regel). `master_products`/`supplier_prices`/`stock_movements`
hebben geen DDL in de repo, dus test op een branch die de prod-structuur weerspiegelt.
Daarna: `extension_v2_apply_checkpoint` idempotentie + counters verifiëren.

**Gate B — browser-E2E in Chrome én Edge met een ingelogde leverancierssessie.**
Laad `chrome-extension/` (Load unpacked), stel API-URL + extension-key in via opties, open Baktotaal
ingelogd → side panel → preflight → sample → synchroniseer → forceer SW-stop (chrome://serviceworker-internals)
en browserrestart → controleer hervat.

**Gate C — live Baktotaal-endpointonderzoek (briefing §10).**
De adapter parseert een gedocumenteerde JSON-record-vorm (`BaktotaalRecord`, zie fixtures). De **exacte**
endpoint-URL, query/cursor en veldnamen moeten in een ingelogd Baktotaal-tabblad via DevTools → Network →
Fetch/XHR worden bevestigd; pas dan alleen `BAKTOTAAL_JSON`-accessors aan in `adapters/baktotaal.js`.
`normalize()` blijft ongewijzigd en getest. Zonder JSON-endpoint werkt de DOM-fallback (offscreen + fixed selectors).

---

## Toepassen & testen
```bash
npx vitest run            # 770 tests groen
npx tsc --noEmit          # geen type-fouten
npm run build             # productiebuild slaagt
# Gate A: migratie op Supabase-branch, daarna:
npx tsx scripts/backfill-supplier-products-v2.ts        # dry-run
# Gate B: chrome-extension/ als unpacked laden in Chrome + Edge
```

## Bewust behouden (backwards-compatible)
v1-extensiebestanden (`background.js`, `popup*`, `content.js`, `adapters.js`) en v1 API-routes
(`/api/extension/sync/*`, `products/batch`, `ai-detect`) blijven werken tot v2 op prod geverifieerd is
(briefing §13/§16 Fase E: legacy pas afbouwen na ≥2 geverifieerde releases).
