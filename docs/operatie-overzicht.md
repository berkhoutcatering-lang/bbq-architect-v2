# Operatie Overzicht — de app weer begrijpelijk maken

**Datum:** 2026-06-12 (avond) · **Status:** plan, uitvoering ná weekendtest 13-14 juni
**Aanleiding (Mathijs):** "De app is bijna te groot. Niet per se features schrappen, maar de overzichtelijkheid moet terug. Alles moet duidelijk zijn en een nieuwe persoon moet begrijpen wat er gebeurt."

## Uitgangspunten (vast)

1. **Features blijven** — wat Sam zelf niet gebruikt kan een andere cateraar wél gebruiken (bestaande regel). We schrappen *deuren*, geen *vermogens*.
2. **De meetlat is de nieuwe-persoon-test**: iemand die de app nooit zag maakt zonder hulp binnen 10 minuten een offerte en verstuurt 'm (= bestaande Pro-tier-stranger persona, nu echt af te nemen).
3. **Geen "eenvoudige modus"-schakelaar** — een tweede modus is extra complexiteit. Betere defaults, niet meer keuzes.
4. **Eén verbouwing per sessie**, oude routes blijven werken via de bestaande redirect-stub-aanpak.

## Diagnose — waaróm het als bende voelt (bewijs uit de volledige app-test van 2026-06-12)

| # | Probleem | Voorbeelden |
|---|---|---|
| 1 | **Sidebar toont ~26 items tegelijk** — hub-and-spoke (plan 2026-05-01) is half af: hubs bestaan, maar alle spokes staan permanent uitgeklapt | Vandaag + Plannen(2) + Verkoop(4) + Menu(3) + Voorraad(6) + Geld(6) + Systeem(7) |
| 2 | **Zelfde begrip, meerdere deuren** | Bonnen ×3 (Scannen, Bonnenkistje, Boekhouder) · Marge ×3 (/marges, /gerechten/analyse, /menu-engineering) · Gerechten ×2 (/gerechten, /recepten) · Inkoop ×2 (Inkoop, Inkoopprijzen) · Logistiek ×2 (hub-pagina én event-tab) |
| 3 | **Verkeerde woonplaats** | Uren onder Geld (is team-werk) · Materieel onder Voorraad (spullen ≠ voorraad — zelfde verwarring als food/non-food in componenten) · Mailbox onder Systeem |
| 4 | **Restjes zichtbaar voor iedereen** | Website, Platform Beheer, /event-planner, /template-editor, /ai-chat-placeholder, /m/gerechten, dode /api/q/[id] |
| 5 | **Wisselende pagina-anatomie** | Sommige pagina's hub-cards, andere tabs, andere direct een lijst; "WAT KUN JE HIER"-blok bestaat maar niet overal |

## Doelstructuur — sidebar van 26 → 8 zichtbare keuzes

Spokes worden horizontale tabs óp de hubpagina (patroon draait al op /financien en /uren). Sidebar toont alléén:

| Hub | Tabs op de hubpagina | Verandering |
|---|---|---|
| **Vandaag** | — (dashboard) | ongewijzigd startpunt |
| **Plannen** | Agenda · Events | logistiek leeft ín het event (tab bestaat al) |
| **Verkoop** | Aanvragen · Offertes · Klanten · Arrangementen | ongewijzigd, alleen ingeklapt |
| **Keuken** (was "Menu") | Gerechten · Componenten · Kookbord · Menu-analyse | Recepten→Gerechten gemerged; Menu-analyse absorbeert Marges + Menu-engineering (één marge-waarheid — sluit aan op omzet-eenduidigheid uit top-10 #3) |
| **Inkoop & Voorraad** | Voorraad · Inkoop · Leveranciers · Bonnen | Inkoopprijzen → tab binnen Inkoop; Bonnen = één ingang met tabs Scannen · Kistje · Boekhouder |
| **Geld** | Financiën · Facturen · Boekhouder-rapporten | puur geld; Uren/Bonnen/Ritten verhuizen eruit |
| **Team & Operatie** (nieuw) | Uren · Materieel · Ritten · Logistiek | nieuw logisch thuis voor wat nu verspreid staat |
| **Systeem** (klein, onderin) | Instellingen · Gebruikers · Integraties · Website · Mailbox · Help | restjes uit zicht van dagelijks werk; Platform Beheer alleen voor admin-rol |

**Eén-deur-regel:** elke taak heeft precies één plek in de navigatie. Alle oude URL's blijven werken als redirect (bestaand stub-patroon, ~14 voorbeelden al in productie).

**Pagina-anatomie-canon (overal hetzelfde):** ① kop met één zin wat-is-dit, ② één primaire actie rechtsboven, ③ "Wat kun je hier"-blok (bestaat al, wordt norm), ④ content. Geen pagina zonder deze vier.

## Uitvoeringsvolgorde (ná de weekendtest)

| Sessie | Wat | Omvang | Risico |
|---|---|---|---|
| 0 | **Weekendtest als munitie**: Mathijs noteert elk moment van zóeken ("waar zat … ook alweer?") | — | — |
| 1 | Sidebar-inklap + verhuizingen (Team & Operatie) + tabbalken + kruimelpad-éénbron — **✅ af 2026-06-12 (commit 64e2b03)**: ruststand 8 items, spokes klappen per actieve hub, Geld=puur geld, Facturen in nav, Breadcrumbs lezen navSections. Resteert uit sessie 1: anatomie-pass per pagina | ~1 dag | laag — geen feature-code, alleen navigatie |
| 2 | Bonnen-éénwording + Marge-éénwording (ingangen samenvoegen, engines blijven) | ~1 dag | middel — drie pagina's worden tabs |
| 3 | Gerechten+Recepten-merge (stond al op de lijst, memory 2026) | ~1 dag | middel |
| 4 | Naming-pass (één NL-term per begrip) + **nieuwe-persoon-test live afnemen** (Lars of een vreemde cateraar) | ~½ dag | laag |

**Niet nu doen:** vanavond beginnen (weekendtest morgen + tweede sessie werkt aan kookbord — verbouwen tijdens samenloop = bewezen recept voor brokken, zie parallel-sessies-les van vanavond).

## Definitie van klaar

- Sidebar ≤ 8 zichtbare keuzes; geen enkel begrip met >1 deur
- Alle oude URL's redirecten correct (route-matrix uit de test-campagne als checklist)
- Elke pagina volgt de anatomie-canon
- Nieuwe-persoon-test gehaald: offerte gemaakt en verstuurd in <10 min zonder hulp
- Activation-KPI's op /admin/funnel als blijvende meting
