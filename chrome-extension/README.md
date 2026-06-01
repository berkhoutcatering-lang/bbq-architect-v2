# BBQ Architect — Catalogus Scanner (Chrome-extensie)

Universele scanner voor leveranciers-portals. Werkt op **elke webshop** zonder
per-site configuratie — de extensie detecteert zelf hoe de site in elkaar zit en
haalt producten + prijzen eruit. Resultaat gaat naar je BBQ Architect-account,
met een per-leverancier review-queue die verkeerde prijzen tegenhoudt.

Versie: **0.6.3**

## Hoe het werkt — 5-laags pipeline

De scanner probeert per pagina achtereenvolgens (stopt zodra een laag genoeg
producten vindt). Van gratis + snel naar duur + langzaam:

| Laag | Wat | Kosten | Pakt |
|---|---|---|---|
| 0 | **Cached selectors** — door eerdere scan geleerde CSS-selectors per domein | gratis | herhaal-scans van bekende sites |
| 1 | **JSON-LD** — Schema.org product-data uit `<script>` tags | gratis | ~60% van moderne shops |
| 2 | **Platform-detectie** — Shopify / Magento / WooCommerce / Lightspeed / BigCommerce / PrestaShop / CCV | gratis | herkenbare platforms |
| 3 | **Claude HTML-analyse** — gecleande HTML → Claude Haiku. Bij 0: raw-HTML (smart container) → bij 0: harvest-during-scroll (virtualized lists) | ~€0.005–0.01/pag | maatwerk-shops, B2B-portals, virtualized lijsten |
| 4 | **Vision** — screenshots (JPEG) → Claude vision | ~€0.05/pag | heavy-JS / vreemde DOM, laatste redmiddel |

Succesvolle selectors worden per domein **gecachet**, zodat een tweede scan op
dezelfde site instant en gratis is.

### Virtualized lijsten (Bidfood-stijl)

Sommige sites (Bidfood) renderen alleen de producten die in beeld staan; de rest
zijn lege `<a>`-shells. Eén HTML-momentopname mist die. De **harvest-during-scroll**
scrolt door de pagina en verzamelt productkaarten zodra ze renderen, dedupe op
URL, en stuurt een compacte tekstlijst naar Claude. Zo komen alle producten binnen.

## Installeren (developer-mode, eenmalig)

1. Open Chrome → `chrome://extensions`
2. Zet **"Developer mode"** rechtsboven aan
3. Klik **"Load unpacked"** → kies de map `chrome-extension`
4. Het BBQ Architect-icoontje verschijnt rechts in de toolbar

Na een code-update: klik het ↻ refresh-icoontje op de extensie-kaart. De popup
toont de versie (`v0.6.3`); bij een mismatch-waarschuwing Chrome volledig sluiten
(Cmd+Q) en opnieuw openen.

## Verbinden

1. Klik op het extensie-icoontje → ⚙ rechtsboven (Instellingen)
2. **BBQ Architect URL**:
   - Dev: `http://localhost:56222`
   - Prod: `https://bbq-architect-v2.vercel.app`
3. **API-key**: in BBQ Architect → Leveranciers → "Extensie verbinden" →
   Genereer key → Kopieer → Plak hier
4. Klik **Verbinden + testen** → moet "✓ Verbonden met [jouw org-naam]" tonen
5. Klik **Bewaren**

## Gebruiken

1. Open een leveranciers-portal en log in (indien nodig)
2. Navigeer naar een categorie- of productlijst-pagina
3. Klik op het BBQ Architect-icoontje
4. Kies de leverancier (auto-geselecteerd op basis van het domein)
5. Drie scan-modi:
   - **Scan deze pagina** — alleen de huidige pagina (test)
   - **Auto-walk paginering** — loopt door `?page=1..N` binnen één categorie tot 3 lege pagina's of de cap (100). Dit is "aanzetten en wachten".
   - **🌐 Doorzoek hele site** — start op de huidige pagina, ontdekt categorieën, BFS door alles (max 200 pagina's)
6. **Tempo** staat standaard op **✨ Automatisch**: kiest zelf het juiste tempo per leverancier (stealth voor Sligro/Makro/Hanos/Bidfood, normaal voor open shops). Handmatig overrulen kan altijd.
7. Wacht — pagina's + producten teller loopt live op
8. Als klaar: klik **Open review-queue** → akkoord op alle prijswijzigingen

## Tempo's

| Tempo | Snelheid | Wanneer |
|---|---|---|
| ✨ Automatisch | per host | **default** — kiest hieronder zelf |
| ⚡ Normaal | 1.5s/pag | open shops, snel |
| 🐢 Voorzichtig | 5s/pag | onbekende sites (auto-default) |
| 🥷 Stealth | 12-18s/pag + scroll + mouse-jitter | Sligro, Makro, Hanos, Bidfood (auto-default) |

## Kosten per leverancier (richtlijn)

| Portal | Werkende laag | Kosten/pagina |
|---|---|---|
| Sligro | Claude HTML | ~€0.005 |
| Bidfood | harvest (virtualized) | ~€0.01 |
| Makro | API/HTML | ~€0.005 |
| Shopify/Magento shops | platform-detect | gratis |
| Shops met JSON-LD | JSON-LD | gratis |
| Onbekende heavy-JS site | vision (laatste redmiddel) | ~€0.05 |

Tweede scan op een bekend domein = vaak gratis (cached selectors).

## Privacy / veiligheid

- Je login blijft bij Chrome — de extensie zíet het niet, slaat het niet op
- Captcha + 2FA los je zelf op
- API-key zit alleen in `chrome.storage.local` op deze laptop
- Alle data gaat over HTTPS naar jouw eigen BBQ Architect-app
- Per-leverancier review-queue: prijzen komen pas in `supplier_prices` als jij "Akkoord" klikt

## Troubleshooting

| Probleem | Oplossing |
|---|---|
| "Geen API-key" | Open instellingen, genereer + plak een nieuwe key |
| "Kon content-script niet bereiken" | De extensie injecteert zichzelf opnieuw + retry't automatisch; lukt het niet, refresh de tab (Cmd+R) |
| Versie-mismatch waarschuwing | Chrome cached oude background-worker → Cmd+Q + opnieuw openen |
| 0 producten op een site | Open de service-worker console (chrome://extensions → "service worker") en bekijk de `[BBQ scraper]` + `[AUTO-WALK]` diag-logs per laag |
| Auto-walk stopt te snel | Stopt na 3 lege pagina's achter elkaar (= einde categorie) of de cap (100) |
| Vision faalt met 413 | Opgelost in 0.6.0 (JPEG ipv PNG screenshots) |

## Debug

Service-worker console (`chrome://extensions` → BBQ Architect → "service worker"):
- `[tabSend] ...` — messaging tussen background en content script (retry/backoff)
- `[BBQ scraper] STAP 1..4` — single-page scan stappen per laag
- `[AUTO-WALK <id>] PAGE x/y` — auto-walk voortgang per pagina
- `raw HTML diag` / `harvest diag` — wat de DOM bevatte (productlinks, prijzen)

In de pagina zelf (content-script console): `window.__BBQ_CONTENT_EVENT_LOG__`
bevat de laatste 200 message-events met timing.

## Architectuur

```
popup.html/js     → UI bij klikken op icoontje (modus + tempo + leverancier)
options.html/js   → Instellingen-pagina (URL + API-key)
background.js     → Service worker; orchestreert de 5-laags pipeline, batch-posts,
                    auto-walk, deep-crawl, tempo-resolutie, selector-cache
content.js        → Geïnjecteerd in elke pagina; humanScroll, HTML-cleanup,
                    raw/harvest HTML, message-listener met debug-events
auto-extractor.js → Laag 0-2: JSON-LD parser + platform-detectie + selector-extractor
adapters.js       → Legacy: alleen nog voor hostname → leverancier-naam matching
api.js            → Wrapper rond BBQ Architect REST-endpoints
styles.css        → Popup + options styling
```

Endpoints aan BBQ Architect-kant:
- `GET  /api/extension/auth` — verifieer key + return org-info
- `POST /api/extension/sync/start` — start sync-run, krijgt syncRunId
- `POST /api/extension/products/batch` — push 50-200 producten
- `POST /api/extension/sync/[id]/finish` — sluit run af
- `POST /api/extension/ai-detect` — Claude HTML/vision detectie + optioneel selectors-leren

## Versiegeschiedenis (kort)

- **0.6.x** — harvest-during-scroll voor virtualized lists (Bidfood), vision JPEG-fix, auto-stealth tempo
- **0.5.x** — selector-cache per domein, RAW-HTML fallback + smart container
- **0.4.x** — universele 4-laags pipeline (JSON-LD → platform → HTML → vision), adapters uitgefaseerd
- **0.3.x** — adapter-based (Sligro/Makro selectors), vision fallback
