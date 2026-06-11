# 20 — Leverancier-detail `/leveranciers/[id]`

**Type:** Supplier-detail met producten + historie + aliassen + sync-runs
**Source:** `src/app/leveranciers/[id]/page.tsx`

## Wat het moet doen

Per leverancier (Sligro, Bidfood, lokale slager): producten-lijst met current prijzen, historie van prijsmutaties, sync-runs status, alias-management voor naam-matching (e.g. "Pulled Pork" vs "Varkensschouder").

## Componenten
- Header met contact-info (email, phone, website)
- Producten-tabel (alle supplier_products voor deze supplier)
- Prijsmutaties-historie (org_price_mutations)
- Alias-mapping (org_product_aliases — handmatig + AI-suggesties)
- Sync-runs lijst (leverancier_sync_runs)

## State
```
loading      → skeleton
loaded       → contact + tabs (producten/historie/aliassen/sync)
syncing      → Chrome extension actief (scrape catalogus)
sync-done    → toast "247 producten gesynchroniseerd, 12 prijsmutaties"
```

## Acceptance
1. ✅ Aliassen voorkomen dat "Pulled Pork" + "Varkensschouder" als 2 verschillende components worden gezien
2. ✅ Sync-runs tonen success/fail per run + duration
3. ✅ Prijsmutaties >5% verandering = AI-prompt "Cost-impact 3 gerechten — herzie marge?"

## Bevindingen
- ✅ Chrome extension voor scraping bestaat (uit memory + APK)
- ⚠️ Aliases-flow onduidelijk hoe gebruiker triggers
- ❌ Geen contract-uploads voor afgesproken-prijzen (handig voor B2B-leverancier)

## Design-prompt

```
Bouw een leverancier-detail-pagina voor catering-software BBQ Architect.

CONTEXT
Sam werkt met 5-15 leveranciers. Wil per leverancier: producten zien,
prijshistorie, aliassen voor naam-matching (Sligro noemt het anders dan
Bidfood). Plus Chrome extension sync-status.

LAYOUT
- Breadcrumb: Voorraad > Leveranciers > {naam}
- Header: naam + contact-info (email, phone, website) + Sync-status pill
- Tabs: Producten | Prijsmutaties | Aliassen | Sync-runs

TAB 1: PRODUCTEN
- Tabel: SKU | Naam | Eenheid | Current prijs | Last updated | Gebruikt in N gerechten
- Filter: alleen-actief / met-prijs-change / alle
- Bulk-acties: archive / update-prijs / koppel-aan-component

TAB 2: PRIJSMUTATIES
- Chronologische lijst van veranderingen
- Per mutatie: product | oude prijs | nieuwe prijs | delta% | datum | bron (scan/import/handmatig)
- Filter: >5% changes only / per maand
- "AI-impact-analyse" knop → "Deze 3 mutaties raken 8 gerechten — herzie marge?"

TAB 3: ALIASSEN
- Mapping: leverancier-naam → component-id
  - "Pulled Pork BBQ" (Sligro) → ANANAS_SALSA_COMPONENT (custom mapping)
- AI-suggesties: "Wij denken 'Varkensschouder' is jouw 'PULLED_PORK_BASIS' — accept?"
- Sam confirms per row

TAB 4: SYNC-RUNS
- Chronologisch (chrome-ext + handmatig)
- Per run: timestamp | duration | producten gesynchroniseerd | mutaties gevonden | status
- Klik = detail met error-log
- "Start sync nu" knop (triggers extension)

ACTIONS
- Edit contact-info
- Upload contract (PDF — afgesproken prijzen)
- Verwijder leverancier (cascade-confirm)

COMPONENTS
- shadcn/ui Tabs, Card, Table
- TanStack Table v8
- File-upload voor contracts

ACCESSIBILITY
- Tabs: aria-current="page"
- Aliassen-table: keyboard-confirm met spacebar

MOBILE
- Tabs collapsen naar dropdown
- Tabel → kaart-list

CONNECTS TO
- supplier_products (producten-lijst)
- org_price_mutations (prijshistorie)
- org_product_aliases (mapping)
- leverancier_sync_runs (Chrome extension)
- /voorraad/{id} (klik product)
- /gerechten/componenten (klik koppel-aan-component)
```
