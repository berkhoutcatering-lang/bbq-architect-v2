# Wave 1 — Golden Flow (10 tools) — ✅ DONE

Lead-capture → offerte → portal → event → factuur → reflectie.

| # | Tool | Route | Status | Design-prompt |
|---|---|---|---|---|
| 01 | Publiek lead-formulier | `/aanvraag/[slug]` | ✅ | [01-aanvraag-formulier.md](./design-prompts/01-aanvraag-formulier.md) |
| 02 | Lead-lijst + drawer | `/verkoop/leads` | ✅ | [02-leads-drawer.md](./design-prompts/02-leads-drawer.md) |
| 03 | Offerte-wizard | `/offertes?wizard=true` | ✅ | [03-offerte-wizard.md](./design-prompts/03-offerte-wizard.md) |
| 04 | Offerte-detail | `/offertes/[id]/view` | ✅ | [04-offerte-detail.md](./design-prompts/04-offerte-detail.md) |
| 05 | Publiek portal | `/q/[token]` | ✅ | [05-q-portal.md](./design-prompts/05-q-portal.md) |
| 06 | Event-hub Overzicht | `/events/[id]/hub` | ✅⚠️ | [06-event-hub-overzicht.md](./design-prompts/06-event-hub-overzicht.md) |
| 07 | Event-hub Klantgesprek | `/events/[id]/hub` tab | ✅ | [07-event-hub-klantgesprek.md](./design-prompts/07-event-hub-klantgesprek.md) |
| 08 | Event mobile field-mode | `/events/[id]/field` | ✅ | [08-event-field-mobile.md](./design-prompts/08-event-field-mobile.md) |
| 09 | Finance Copilot | `/financien` | ✅ | [09-financien-copilot.md](./design-prompts/09-financien-copilot.md) |
| 10 | Event-reflectie | `/events/[id]/reflectie` | ✅ | [10-event-reflectie.md](./design-prompts/10-event-reflectie.md) |

## Bevindingen samengevat

### Werkt 100% goed
- /aanvraag/[slug] publieke flow — white-label + simpel
- /q/[token] state-machine (Hop & Bites brand, vraag-aanpassing-feature bevestigd)
- /verkoop/leads kanban met AI-concept (mooie Bedrijfsfeest-card visueel)
- Offerte-wizard modal "Rook stelt menu samen"
- Offerte-detail RelatedEntityPills naar event + klant
- Finance Copilot AI-insight ("99,9% klopt niet zonder foodcost")

### Echte bug gevonden (P1)
- **#45 [EVENT-HUB] toUpperCase crash** op event zonder volledige date-data — reproduceerbaar op test-event #52, werkt op #17. Fix: guard `Number.isNaN(evDate.getTime())` op line 568.

### Top UX-gaps voor extern bouwer
1. **Klant-veld in wizard** is plain input, geen autocomplete-combobox → dubbele records-risk
2. **Geen tijdscontextuele AI-prompts** in event-hub (zelfde voor elk event, ongeacht dagen-tot)
3. **Geen "Vraag aanpassing" history** in offerte-detail (wel feature in /q/[token], geen view voor cateraar)
4. **Geen tracking** of klant /q/[token] opende (privacy-eerlijk maar Sam wil het weten)
5. **Voorbereiding-tracker** in event-hub generic BBQ (5 stappen) — niet aanpasbaar per event-type
6. **Reflectie-reminder ontbreekt** — Sam vergeet 7-dagen-deadline

### Cohesie-status (alle Golden-Flow-handoffs)
- ✅ Lead → Offerte handoff (na APK-fix #1 lead.offerte_id writeback)
- ✅ Offerte → Event via acceptance-workflow
- ✅ Offerte → Factuur via acceptance-workflow
- ✅ Event → Reflectie → Factuur-CTA (APK-fix #7 verified)
- ⚠️ Event-detail crasht zonder volledige data (APK-bug #45)

## Files in deze wave

- `docs/audits/2026-06-08-tool-reviews/README.md` (master index)
- `docs/audits/2026-06-08-tool-reviews/wave-1-golden-flow.md` (deze file)
- `docs/audits/2026-06-08-tool-reviews/design-prompts/01-10*.md` (10 stand-alone prompts)

## Volgende stappen voor Sam

1. **Lees per prompt** een design-spec → stuur naar externe builder/designer
2. **Fix APK-bug #45** (P1 event-hub crash) voor andere events kunnen breken
3. **Beslis Wave 2-5** start: hub-subpagina's → mobile/Lars → AI-eval-fix → systeem/integraties
