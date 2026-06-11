# Wave 3 — Mobile + Lars-flow (8 tools) — ✅ DONE

Tablet/handschoenen/zonlicht-mode tools.

| # | Tool | Status | Prompt |
|---|---|---|---|
| 08 | Event mobile field-mode | ✅ (in Wave 1) | [08-event-field-mobile.md](./design-prompts/08-event-field-mobile.md) |
| 05 | /q/[token] mobile-spec | ✅ (in Wave 1, mobile-section) | [05-q-portal.md](./design-prompts/05-q-portal.md) |
| 23 | HACCP veldmode tablet | ✅ | [23-haccp-field.md](./design-prompts/23-haccp-field.md) |
| 24 | Keuken kookbord drag-to-done | ✅ | [24-keuken-kookbord.md](./design-prompts/24-keuken-kookbord.md) |
| 25 | Service plattegrond canvas | ✅ | [25-service-plattegrond.md](./design-prompts/25-service-plattegrond.md) |
| 26 | Uren PunchPanel mobiel | ✅ | [26-uren-mobiel.md](./design-prompts/26-uren-mobiel.md) |
| 27 | Bonnen camera-direct | ✅ | [27-bonnen-camera.md](./design-prompts/27-bonnen-camera.md) |
| 28 | BottomNav 5-tabs | ✅ | [28-bottomnav-mobile.md](./design-prompts/28-bottomnav-mobile.md) |

## Hoofdthema's

- Touch-targets 56-60px (handschoenen-vriendelijk, > WCAG 44px standaard)
- Font ≥18-20px (zonlicht-leesbaarheid)
- Offline-capable (IndexedDB write-queue, sync zodra wifi)
- WCAG AAA contrast (7:1) voor outdoor-leesbaarheid
- Vibration-API feedback bij belangrijke acties
- Wake-lock (scherm blijft aan tijdens event)
- Real-time collab via Supabase realtime channels

## Bevindingen

- ✅ KDS-architectuur (kds_device_sessions + audit) compleet in DB
- ✅ Camera-direct + offline-mode-toggle bestaand in code
- ❌ Geen smart-thermometer-integratie (Inkbird/Meater Bluetooth)
- ❌ Geen GPS-track-modus voor /administratie/rittenregistratie
