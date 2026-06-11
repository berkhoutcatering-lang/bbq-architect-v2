# 29 — Instellingen `/instellingen`

**Type:** Tenant-wide bedrijfsprofiel + 5-token brand-theming
**Source:** `src/app/instellingen/page.tsx`

## Wat moet het doen

Sam stelt zijn bedrijfsgegevens in (KVK, BTW, IBAN, adres, contact), upload logo, kiest brand-theme (8 OKLCH-presets + custom). Theming cascadet door PDFs, /q/[token], /aanvraag/[slug], /arrangement/[slug]. Plus: AdvancedColorEditor met WCAG-audit.

## Componenten
- Form-secties (bedrijfsdata / branding / contact / locatie)
- ThemePresetPicker (8 OKLCH-presets)
- AdvancedColorEditor met live-preview + APCA contrast-check
- Logo-upload (settings.logo_url naar brand-assets bucket)

## Acceptance
1. ✅ Theme-cascade: wijzig brand-color → /q/[token] updaten zonder rebuild
2. ✅ KVK + BTW validatie (NL-format)
3. ✅ IBAN-check via mod-97
4. ✅ Logo max 5MB, accept PNG/SVG/JPG
5. ✅ WCAG AA contrast verified live (red flag bij <4.5:1)

## Bevindingen
- ✅ Theming 5x8 werkt (APK confirmed Hop & Bites warm-brown cascade)
- ❌ Geen "preview op voorbeeld-offerte" → moet handmatig /q/[fake-token] openen

## Design-prompt

```
Bouw een tenant-instellingen-tool voor catering-software BBQ Architect.

CONTEXT
Sam stelt 1× alles in en raakt het bijna nooit meer aan. Branding moet
cascade naar PDFs + publieke portals (white-label is Enterprise-anchor).
Form-flow moet snel + foutloos zijn (validaties live).

LAYOUT
- Sub-tab nav: Instellingen (active) | Gebruikers | Mailbox | Website | Hulp | Admin
- Section-navigation links (anchor-scroll):
  - Bedrijfsgegevens
  - Branding & theming
  - Contact & SLA
  - Locatie & adres
  - BTW & financieel

SECTIE 1: BEDRIJFSGEGEVENS
- Bedrijfsnaam (verplicht)
- KVK-nummer (8 digits, validated)
- BTW-nummer (NL format: NL123456789B01)
- Eigenaar-naam
- Oprichtingsjaar

SECTIE 2: BRANDING (kritiek)
- Logo-upload (drop-zone, max 5MB, PNG/SVG/JPG)
- Tagline (max 100 chars)
- Theme-preset-picker (8 cards: warm-brown / cool-blue / forest / charcoal / cream / sage / charcoal-gold / sunset)
- "Custom theme" → AdvancedColorEditor:
  - 5 OKLCH-sliders (brand-1, brand-2, surface, text, shadow)
  - Live-preview-card naast editor (toont /q/[token] mini-render)
  - APCA contrast-score per kleur-paar
  - "WCAG AA" / "AA+" / "Faal" pill per check

SECTIE 3: CONTACT & SLA
- Email (verplicht — voor klant-replies)
- Telefoon (NL format validation)
- WhatsApp-nummer (optional)
- SLA: "Reactietijd 24u" (override-able, default "binnen 24 uur")

SECTIE 4: LOCATIE
- Adres (autocomplete via PostNL API of handmatig)
- Werkgebied (radius vanaf basis-postcode)
- Service-uren (per dag toggle)

SECTIE 5: BTW & FINANCIEEL
- IBAN (mod-97 validatie)
- BIC (optional)
- BTW-tarieven (read-only, uit BTW_RULES_2026)
- Boekhouder-email (voor maandpakket-cron)

ACTIES
- Save (auto debounce 2s per veld)
- "Preview op voorbeeld-offerte" → open /q/preview met deze settings
- Reset naar default

COMPONENTS
- shadcn/ui Form, Card, Input, Select
- AdvancedColorEditor custom (Konva? Or pure SVG-based)
- File-upload (browser-image-compression voor logo)
- APCA-w3 voor contrast (al in deps)

ACCESSIBILITY
- Per veld aria-describedby met validatie-status
- Theme-preview: aria-live "Theme gewijzigd, contrast verified"
- Color-picker: aria-valuenow per slider

HARD RULES
- BTW-rates server-side uit BTW_RULES_2026 (NOOIT editen)
- IBAN-validatie client + server-side
- Logo in brand-assets bucket (public, 10MB limit)

CONNECTS TO
- settings tabel (all writes)
- /q/[token] = consumer cascade
- /aanvraag/[slug] = consumer cascade
- /arrangement/[slug] = consumer cascade
- PDF-templates (logo + branding)
- portalThemes.ts (8-preset library)
```
