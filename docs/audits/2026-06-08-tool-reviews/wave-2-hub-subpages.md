# Wave 2 — Hub-subpagina's (12 tools) — ✅ DONE

Niet-Golden-Flow sub-tools per hub.

| # | Tool | Route | Status | Design-prompt |
|---|---|---|---|---|
| 11 | Agenda FullCalendar | `/agenda` | ✅ | [11-agenda.md](./design-prompts/11-agenda.md) |
| 12 | Events lijst | `/events` | ✅ | [12-events-lijst.md](./design-prompts/12-events-lijst.md) |
| 13 | Klant-detail | `/klanten/[id]` | ✅ | [13-klant-detail.md](./design-prompts/13-klant-detail.md) |
| 14 | Gerecht-detail + 3 modals | `/gerechten/[id]` | ✅ | [14-gerecht-detail-modals.md](./design-prompts/14-gerecht-detail-modals.md) |
| 15 | Componenten library | `/gerechten/componenten` | ✅ | [15-componenten-library.md](./design-prompts/15-componenten-library.md) |
| 16 | Gerechten analyse | `/gerechten/analyse` | ✅ | [16-gerechten-analyse.md](./design-prompts/16-gerechten-analyse.md) |
| 17 | Menukaart-editor | `/gerechten/menukaarten/[id]` | ✅ | [17-menukaart-editor.md](./design-prompts/17-menukaart-editor.md) |
| 18 | Voorraad-detail | `/voorraad/[id]` | ✅ | [18-voorraad-detail.md](./design-prompts/18-voorraad-detail.md) |
| 19 | Inkoop | `/inkoop` | ✅ | [19-inkoop.md](./design-prompts/19-inkoop.md) |
| 20 | Leverancier-detail | `/leveranciers/[id]` | ✅ | [20-leverancier-detail.md](./design-prompts/20-leverancier-detail.md) |
| 21 | Boekhouder maandpakket | `/geld/boekhouder` | ✅ | [21-boekhouder.md](./design-prompts/21-boekhouder.md) |
| 22 | Rittenregistratie | `/administratie/rittenregistratie` | ✅ | [22-rittenregistratie.md](./design-prompts/22-rittenregistratie.md) |

## Bevindingen samengevat

### Werkt al goed
- FullCalendar agenda met 5 KPIs (3 events / €4.954 / 46 prep / 3 weekends / 2 conflicten)
- Events-lijst met 5-status-filters + APK-fix #29 orphan-handling
- Klant-detail "alles zien"-tabs (na APK-fix #10)
- Componenten library — cascade-architectuur solide
- Menukaart 10 templates met visual-regression baselines
- Rittenregistratie RitForm met event-koppeling

### UX-gaps (niet ECHTE bugs, wel verbeteringen)
- /agenda: AI Insights button onduidelijk wat 'ie doet
- /events: paginatie ontbreekt boven 100 events
- /klanten/[id]: geen "next-action" AI-suggestie
- /gerechten/[id]: geen "preview op offerte"-knop
- /voorraad/[id]: geen voorspelde behoefte chart
- /inkoop: complete UI onbekend qua diepte
- /leveranciers: aliases-flow onduidelijk wanneer gebruiker invokes
- /boekhouder: geen vergelijking-tov-vorige-maand
- /administratie/rittenregistratie: events-gedekt 0/2 toont gap maar geen koppel-bulk-flow

### Cohesie-gaten
- Geen lead-bron-pill op offerte-detail (lead→offerte chain niet zichtbaar)
- Geen email-thread-link op klant-detail (alleen losse mails)
- /marges vs /gerechten/analyse — twee routes voor één concept

## Volgende stappen voor Sam

1. **Lees per prompt** voor extern bouwer
2. **Beslis Wave 3** start (Mobile + Lars-flow, 8 tools)
   - /events/[id]/field mobile · /haccp/field tablet · /keuken/kookbord · /service/plattegrond · /uren mobiel · /bonnen camera-upload · /q/[token] mobile · BottomNav-flow
