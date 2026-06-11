# 27 — Bonnen camera-upload `/bonnen` (mobiel)

**Type:** Mobile receipt-scanner met camera-direct
**Source:** `src/app/bonnen/page.tsx` + `/api/bonnen/extract`

## Wat het moet doen

Sam koopt iets bij Sligro, krijgt papieren bon, pakt telefoon, opent BBQ Architect, scant bon. AI parse (Sonnet vision), itemize, matchen met leverancier, save naar archive. Plus: paste UBL-XML (e-invoice direct).

## Componenten
- Camera-direct (MediaDevices getUserMedia)
- Multi-format drop-zone (PDF/JPG/HEIC/UBL/Screenshot)
- AI extract met progress
- Confirm-preview voor save

## Acceptance
1. ✅ ⌘V paste-support (al in screenshot)
2. ✅ Camera in-app (geen file-picker tussenstap)
3. ✅ AI parse <8s p95 (Sonnet vision)
4. ✅ UBL-XML 0-cost (geen AI nodig — direct parse)
5. ✅ Auto-categorisering (boekhouder-classify, Haiku)

## Bevindingen
- ✅ Bonnen-scanner UI mooi (APK confirmed) — 5 formats zichtbaar
- ✅ Bon-scanner v2 met Haiku→Sonnet→Opus escalation
- ❌ Geen GPS-tag (handig voor reizen-bewijs)
- ❌ Geen "scan stack" voor 10 bonnen tegelijk

## Design-prompt

```
Bouw een mobile receipt-scanner voor catering-software BBQ Architect.

CONTEXT
Sam koopt veel bij Sligro/Bidfood/lokaal. Krijgt papier-bon of e-invoice.
Wil binnen 5 sec scannen, AI parse, klaar. Geen typewerk.

LAYOUT (mobile-primary)
- Header: "Bonnen scannen" + offline-pill
- HERO: full-width camera-preview (50vh)
  - Live edge-detection overlay (helpt aliging)
  - "Maak foto" centrale knop (80×80px)
- Alternatieve inputs (chips onder camera):
  - "Galerij uploaden"
  - "Paste UBL-XML (⌘V)"
  - "PDF uploaden"

NA SCAN-FOTO (preview-modus)
- Foto preview (kunnen croppen + draaien)
- "Verzend voor analyse" CTA

AI EXTRACT FLOW
- Loading: "Rook leest bon... ~5s"
- Skeleton-fields:
  - Leverancier (auto-detect uit logo + naam)
  - Datum (auto)
  - Totaal (auto)
  - Items (regel-voor-regel parsed)
  - BTW-splits (9% / 21% auto via BTW_RULES_2026)
  - RGS-categorie (AI-suggested Haiku, Sam confirms)

PREVIEW & CONFIRM
- Tabel met geparseerd items (edit-able)
- "Save" CTA → INSERT bonnen + update inventory + price_history
- "Save naar archive only" (geen voorraad-update)

UBL-XML FLOW (no AI cost)
- Paste XML in textarea
- Direct parse (fast-xml-parser, al in deps)
- Zelfde preview + save

OFFLINE-MODE
- Foto's queued bij offline
- Auto-upload + parse zodra wifi
- Toast "3 bonnen wachten op verwerking"

COMPONENTS
- MediaDevices.getUserMedia voor camera
- fast-xml-parser voor UBL (al in deps)
- browser-image-compression (resize <1MB voor upload)
- shadcn/ui Card, Button, Toast

ACCESSIBILITY
- Camera-button: aria-label "Maak foto van bon"
- Loading: aria-live "Rook analyseert bon..."
- Preview-table: scope=col

DESKTOP VARIANT
- Drop-zone groot ipv camera
- ⌘V paste-support voor screenshot
- Multi-file: drop 10 bonnen tegelijk → batch-extract

HARD RULES
- BTW-rates uit BTW_RULES_2026 (NIET AI)
- Bon-hash (dedup) — bonnen_hash_columns trigger
- Audit-trail: log_bon_action (al SECDEF function)
- Foto's in `bonnen` bucket (private, signed-URL)

CONNECTS TO
- POST /api/bonnen/extract (Sonnet vision)
- POST /api/boekhouder/classify (Haiku RGS)
- bonnen tabel (idempotent via hash)
- inventory.last_price + price_history (auto-update)
- /archief = bonnen-archief search-tool
- bon_share_tokens (voor delen met boekhouder)
```
