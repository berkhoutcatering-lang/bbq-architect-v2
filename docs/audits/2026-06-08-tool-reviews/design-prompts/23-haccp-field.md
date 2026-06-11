# 23 — HACCP veldmode `/haccp/field`

**Type:** Tablet-optimized HACCP food-safety logging
**Source:** `src/app/haccp/field/page.tsx`

## Wat het moet doen

Lars staat met thermometer bij smoker, temp moet gelogd: kerntemp, garingstijd, koel-traject. Tablet (1024×768), tap-only, offline-capable. Critical Control Points (CCP) per gerecht, AI anomaly-detection (Sonnet "temp 92°C op pulled pork is laag — extend 30min?").

## Componenten
- Per-CCP card met big temp-input + tijd-input
- Camera-snapshot voor evidence-photos
- Offline-snapshot (IndexedDB)
- Anomaly-detect AI button
- Audit-log (tamper-evident, geen edit na save)

## Acceptance
1. ✅ Touch-targets ≥56px (handschoenen)
2. ✅ Font body ≥20px (zicht in keuken-belichting)
3. ✅ Offline-capable (write-queue + sync zodra wifi)
4. ✅ Foto-evidence verplicht voor critical CCP (vlees>57°C check)
5. ✅ AI anomaly-suggestie maar geen auto-action (Sam blijft eind-decider)
6. ✅ Records tamper-evident (audit_log trigger na save)

## Bevindingen
- ✅ HACCP-field bestaat al (memory verifies + APK noemt het)
- ❌ Geen "noodknop" voor anomaly-overschrijding (direct contact food-safety officer)
- ❌ Geen integratie met smart-thermometer (Inkbird/Meater bluetooth)

## Design-prompt

```
Bouw HACCP veldmode (tablet) voor catering-software BBQ Architect.

CONTEXT
Lars logt food-safety in keuken (tablet 1024x768 horizontaal, handschoenen,
warmte 30°C, geluid). HACCP-records moeten 5 jaar bewaard + Belasting-
controle-bestendig. Geen edit na save (audit-log).

LAYOUT (landscape tablet primair)
- Header: "HACCP · Event {naam}" + offline-pill + Lars-naam
- Hub-grid: per CCP een grote card
  - "Vlees kerntemp" — laatst gelogd: 67°C ✓
  - "Koel-traject 4°C" — laatst gelogd: 3.8°C ✓
  - "Hete-buffet 60°C+" — laatst gelogd: 62°C ✓
  - "Reiniging post-event" — to-do
- Per card:
  - Big temp-input (numpad, 60px touch)
  - Tijd auto-prefill (now)
  - Camera-button voor foto-evidence
  - "Log" CTA (groot, groen)
  - History: laatste 3 entries

NIEUWE LOG-FLOW (drie-tap)
1. Tap CCP-card → numpad-overlay
2. Type temp + auto-default tijd
3. Optional camera-snap
4. "Log" → tamper-save naar haccp_records

ANOMALY-DETECT
- Na save: AI check (Sonnet) of temp afwijkt (e.g. <55°C voor pulled pork is unsafe)
- Toast: "⚠ 52°C is laag — extend cooking? Of escalatie?"
- Actie-chips: "Extend 30min" / "Escalatie" / "OK, geaccepteerd"

CORRECTIVE-ACTIONS
- Bij anomaly: prompt voor corrective-action (verplicht voor compliance)
- Templates: "Doorgewarmd tot 65°C" / "Item afgekeurd" / "Smoker temp-recalibrated"

OFFLINE-MODE
- IndexedDB cache CCP-templates per event
- Write-queue voor logs (sync zodra wifi)
- Visible indicator "Offline — 4 logs wachten"

COMPONENTS
- shadcn/ui Card, Button (XL), Dialog
- Custom numpad-overlay (browser-native onscreen-keyboard te traag)
- Camera-API (MediaDevices) voor foto-evidence
- IndexedDB via idb

ACCESSIBILITY
- WCAG AAA contrast (7:1 voor body)
- Aria-live announcements voor anomaly
- High-vis dark-mode default voor avond
- Vibration-API feedback bij save

MOBILE PORTRAIT (375-414px)
- Cards stack 1-koloms
- Numpad full-screen-overlay
- Camera vervangt foto-upload (geen file-picker)

HARD RULES
- Records tamper-evident: trigger blokt UPDATE na 1 uur (audit_log_changes)
- Foto-evidence verplicht voor "vlees boven 57°C"-CCPs
- AI is alleen suggestie — NIET auto-corrective-action
- HACCP-templates uit gerecht_haccp_templates per gerecht

CONNECTS TO
- haccp_records (INSERT only, tamper-evident UPDATE block)
- haccp_anomaly_findings (na AI detect)
- haccp_corrective_actions (verplicht bij anomaly)
- /events/{id}/hub HACCP-tab (post-event review)
- /haccp (master HACCP-dashboard)
```
