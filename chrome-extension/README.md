# BBQ Architect — Catalogus Scanner (Chrome-extensie)

Scant leveranciers-portals (Sligro, Makro, Baktotaal, Vuur & Rook + onbekende
portals via AI-detect) en stuurt producten + prijzen direct naar je BBQ
Architect-account. Per-leverancier review-queue voorkomt verkeerde prijzen.

## Installeren (developer-mode, eenmalig)

1. Download deze map als zip OF gebruik de `.zip` uit BBQ Architect →
   Leveranciers → Extensie verbinden.
2. Pak uit naar een vaste map.
3. Open Chrome → `chrome://extensions`
4. Zet **"Developer mode"** rechtsboven aan
5. Klik **"Load unpacked"** → kies de uitgepakte map
6. Het BBQ Architect-icoontje verschijnt rechts in de toolbar

## Verbinden

1. Klik op het extensie-icoontje → ⚙ rechtsboven (Instellingen)
2. **BBQ Architect URL**: vul jouw productie- of dev-adres in
   - Dev: `http://localhost:56222`
   - Prod: `https://app.bbqarchitect.app`
3. **API-key**: open in BBQ Architect → Leveranciers → "Extensie verbinden" →
   Genereer key → Kopieer → Plak hier
4. Klik **Verbinden + testen** → moet "✓ Verbonden met [jouw org-naam]" tonen
5. Klik **Bewaren**

## Gebruiken

1. Open een leveranciers-portal (sligro.nl, vuurenrook.nl, ...) en log in
2. Navigeer naar een productpagina of categorie
3. Klik op het BBQ Architect-icoontje
4. Kies de leverancier (auto-geselecteerd als jij hem in BBQ Architect met
   het juiste portaal hebt aangemaakt)
5. Drie scan-modi:
   - **Scan deze pagina** = alleen huidige pagina (test, ~5 sec)
   - **Auto-walk paginering** = volg "volgende pagina"-knop binnen één categorie (~30 min, max 100 pagina's)
   - **🌐 Doorzoek hele site** = start op homepage, AI ontdekt zelf categorieën, BFS door alles (~30-90 min, max 200 pagina's)
6. Tempo-keuze:
   - **Normaal** (1.5s/pag) — open shops, snel
   - **Voorzichtig** (5s/pag) — Vuur & Rook, Baktotaal
   - **Stealth** (12-18s/pag, random + scroll + mouse-jitter) — Sligro, Makro, anti-bot sites
7. Wacht — pagina's + producten teller loopt live op
8. Als klaar: klik "Open review-queue" → akkoord op alle prijswijzigingen

## Per leverancier: hoe werkt het?

| Portal | Modus | Snelheid | Login? |
|---|---|---|---|
| Sligro | adapter (snel pad) | 1.5s/pagina | ja, jij doet |
| Makro | adapter | 1.5s/pagina | ja + 2FA, jij doet |
| Baktotaal | adapter | 1.5s/pagina | ja, jij doet |
| Vuur & Rook | adapter | 1.5s/pagina | nee (open shop) |
| Hanos | adapter | 1.5s/pagina | ja |
| Bidfood | adapter | 1.5s/pagina | ja |
| Andere portal | AI-detect | 3-5s/pagina (~€0.01/pag) | jij weet |

## Privacy / veiligheid

- Je login-wachtwoord blijft bij Chrome — extensie zíet het niet, slaat het niet op
- Captcha + 2FA los je zelf op zoals altijd
- API-key zit alleen in `chrome.storage.local` op deze laptop
- Alle data gaat over HTTPS naar jouw eigen BBQ Architect-app — wij zien niks
- Per leverancier review-queue: prijzen komen pas in `supplier_prices` als jij
  "Akkoord" klikt

## Troubleshooting

| Probleem | Oplossing |
|---|---|
| "Geen API-key" | Open instellingen, genereer + plak een nieuwe key |
| Verbinden faalt | Check de URL; key moet beginnen met `ext_` |
| Adapter werkt niet | Toggle naar AI-detect — werkt op elke pagina |
| Anti-bot detectie (CAPTCHA verschijnt) | Verhoog de "Vertraging tussen pagina-loads" naar 3000-5000ms |
| Auto-walk stopt te snel | Check of de "next"-knop wel klikbaar is op de site |

## Icons (placeholder)

In `icons/` horen `icon16.png`, `icon48.png`, `icon128.png`. Voor v1 mag je
eigen iconen maken — quick-fix: maak een simpele goud-zwarte ⏺ als PNG via
[favicon.io](https://favicon.io) en plaats in deze map.

## Architectuur

```
popup.html/js     → UI bij klikken op icoontje
options.html/js   → Instellingen-pagina (URL + API-key)
background.js     → Service worker; orchestreert scans, batch-posts
content.js        → Geïnjecteerd in elke pagina; extracteert HTML/producten
adapters.js       → Selectors per bekende portal
api.js            → Wrapper rond BBQ Architect REST-endpoints
styles.css        → Popup + options styling
```

Endpoints aan BBQ Architect-kant:
- `GET  /api/extension/auth` — verifieer key + return org-info
- `POST /api/extension/sync/start` — start sync-run, krijgt syncRunId
- `POST /api/extension/products/batch` — push 50-200 producten
- `POST /api/extension/sync/[id]/finish` — sluit run af
- `POST /api/extension/ai-detect` — proxy naar Claude vision voor onbekende portals
