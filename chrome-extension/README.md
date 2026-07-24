# BBQ Architect — Leverancierssync (extensie v2)

Hervatbare, herleidbare synchronisatie van leveranciersprijzen naar BBQ Architect.
**De browser levert toegang tot de ingelogde leverancierssessie; de server bewaakt
run, volledigheid, historie en datakwaliteit.** Manifest V3 (Chrome/Edge 120+).

Volledige opleverstatus + Definition of Done: [`docs/leverancierssync-v2-status.md`](../docs/leverancierssync-v2-status.md).
Bouwspec: [`docs/claude-leverancierssync-rebuild-briefing.md`](../docs/claude-leverancierssync-rebuild-briefing.md).

## Architectuur

```
sidepanel/            Primaire UI: preflight → sample → synchroniseer → voortgang (servercounters)
background/
  sw.js               Service-worker entry: lifecycle (onStartup/alarms/side-panel/tab), commando's
  jobrunner.js        Per wake-up: claim → adapter.fetchTask → normalize → transactioneel checkpoint
  runner-core.js      PURE beslislogica (getest via vitest) — geen chrome.*
  offscreen-client.js DOM-fallback via offscreen-document (SW heeft geen DOM)
  lib/                api-v2 (Extension API v2-client), storage (lokale pointer), idempotency (crypto.subtle)
adapters/
  registry.js         Domeinherkenning + adapterregister
  baktotaal.js        Eerste volledige adapter (JSON-eerst, DOM-fallback)
  synthetic.js        Deterministische test-/dev-adapter
  types.js            Uitvoerbaar adaptercontract (matches/preflight/discover/fetchTask/normalize)
  lib/                parse (verpakking/prijs → velden), observation (bouwt schema-conform object)
  __fixtures__/       Gesanitiseerde fixtures (geen cookies/tokens/klantnummer)
offscreen.{html,js}   HTML parsen buiten de DOM-loze service worker
```

De **rekenkundige canon leeft server-side** (`src/lib/supplierSync/**`): de extensie leest bronvelden
+ ruwe tekst; de server valideert strikt en berekent deterministisch elke euro-per-eenheid (ADR-4).

## Instellen (Load unpacked)
1. Chrome/Edge → Extensies → Ontwikkelaarsmodus → **Load unpacked** → kies deze map.
2. Klik het icoon → **opties** → API-URL (bv. je BBQ Architect-URL) + extension-key.
3. Open een **ingelogde** leverancierssite (bv. Baktotaal) → het side panel wordt actief →
   **Geef toegang** (host-permission) → **Controleer** → **Synchroniseer**.

## Belangrijke principes
- Geen `<all_urls>`: `optional_host_permissions` per leverancier-origin; side panel per origin.
- Nooit wachtwoorden/cookies/tokens opslaan; `rawRecord` is een productveld-whitelist.
- AI staat standaard UIT tijdens normale syncs (0 AI-calls op een bekende adapter).
- Hervatten na SW-stop/browserrestart: server = bron van waarheid, lokale opslag alleen pointer + cache.

## Legacy v1 (backwards-compatible, niet meer door het manifest geladen)
`background.js`, `popup.*`, `content.js`, `auto-extractor.js`, `adapters.js`, `api.js` blijven staan
voor rollback tot v2 op productie is geverifieerd (briefing §16 Fase E). De v1 API-routes
(`/api/extension/sync/*`, `products/batch`, `ai-detect`) blijven eveneens werken.
