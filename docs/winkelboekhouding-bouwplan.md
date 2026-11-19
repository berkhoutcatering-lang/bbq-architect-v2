# Boekhouding winkel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Een werkruimte "Boekhouding winkel" die uit de bonnen en dagstaten van de winkelkassa vanzelf een dag in hokjes, een kasboek, verkoop per artikel, inkoop per levering en hardlopers/trage lopers maakt.

**Architecture:** Afleiden bij het lezen. Zuivere rekenfuncties in `src/lib/winkelboek/` krijgen rijen en geven getallen; `laden.ts` haalt de rijen op via de gebruikersclient (RLS); server-pagina's onder `src/app/winkelboek/` zetten het op het scherm. Eén nieuwe tabel voor geld dat je zelf uit of in de la doet. Officiële omzet en btw komen uit de bestaande `laadToonbank`, zodat de tegel hetzelfde getal geeft als de btw-aangifte.

**Tech Stack:** Next.js App Router (server components, `searchParams` als Promise), TypeScript (`strict` staat uit: vernauw een uitkomst met `'body' in x` of `'error' in x`, niet op een boolean; `null` wordt alleen door de tests bewaakt), Supabase (Postgres + RLS), Zod, Vitest, lucide-react. Geen nieuwe pakketten.

**Spec:** `docs/winkelboekhouding-ontwerp.md` (rekenregels R1 t/m R6). Schermontwerp: https://claude.ai/artifact/WmZkgz2g4FcnKueDMG8VTm

## Global Constraints

- Werk op tak `feat/winkelboekhouding` vanaf `origin/main`, in een eigen worktree (skill `superpowers:using-git-worktrees`). Niet in de hoofdmap: die staat op een oude tak.
- Bevriezing: niets naar productie vóór maandag 4 januari 2027. PR als concept. Geen `[noodfix]` in commitberichten.
- Migraties nooit met `supabase db push`. Het migratiebestand schrijven mag; toepassen alleen na uitdrukkelijk akkoord van Mathijs, met `npx supabase db query --linked -f <bestand>`. Elke pagina werkt ook als de tabel nog niet bestaat.
- Alle bedragen in rekenfuncties zijn hele centen (integer). Op het scherm via `formatEur(cents / 100)` uit `src/lib/format.ts`.
- Proefdagen uit `btw_kassa_uitsluitingen` tellen nergens mee.
- Nooit een verzonnen getal. Onbekend is `null` in de rekenlaag en op het scherm `KpiTegel` met `soort: 'onbepaald'` of de tekst "Nog geen inkoopprijs".
- Schermteksten: Nederlands, je-vorm, zinskapitalisatie, werkwoord eerst in knoppen, geen emoji, scheidingsteken ` · `.
- Geen enkele nieuwe letterlijke `<button` in `.tsx`: de teller staat precies op het plafond van 1603 (test `src/lib/remOpLosseOnderdelen.test.ts`). Gebruik `src/components/Button.tsx`, een `Link`, een `<a>`, een `<select>` of een formulier dat met Enter verstuurt. Ook geen nieuwe vaste kleurcodes; kleuren via de variabelen uit `globals.css`.
- Supabase geeft hooguit 1000 rijen per verzoek (`supabase/config.toml`). Elke lader die meer kan krijgen bladert met `.range()`, zoals `alles()` in `src/lib/btwAangifteBronnen.ts` (niet geëxporteerd: neem de opzet over in `laden.ts`).
- Bestaande bouwstenen: `EmptyState` eist de prop `page`; `KpiTegel` met `soort: 'leeg'` eist `wanneer`; functie-props (`onActie`, `onOpnieuw`, `HubHeader.meer`) kunnen niet van een servercomponent naar een clientcomponent en worden dus niet meegegeven; `wk-rij` heeft geen eigen kolommen, geef elke lijst een inline `gridTemplateColumns`. `ingelogdMetOrg()` is niet geëxporteerd: neem de opzet over.
- Serveracties: Zod op alle invoer, opnieuw inloggen controleren in de actie, `organization_id` uit `organization_members` en altijd expliciet meesturen (patroon `src/app/winkel/actions.ts`).
- Namen in code in het Nederlands, zoals de rest van `src/lib/winkel/` en `src/lib/toonbank/`.
- Na elke taak: `npm test`, `npx tsc --noEmit` en `npm run lint` groen, dan committen.

## Review Focus

- Een dag met bonnen maar zonder dagstaat (kassa niet afgesloten): stand `open`, geen groen vinkje, wel de cijfers tot nu toe. Test in taak 3.
- Een tegenbon (retour): negatieve bedragen; de hokjes sluiten nog steeds en het artikel telt negatief. Tests in taak 3 en 5.
- Een product zonder inkoopprijs of dat nog niet geteld is: marge `null`, telt niet mee in de periodemarge, dekking daalt. Test in taak 5.
- Een proefdag: geen kasboekregels, geen omzet, geen hardlopers. Tests in taak 4 en 6.
- De tabel `winkel_kas_mutaties` bestaat nog niet: de pagina's laden, het kasboek toont alleen kassaregels en de knop is uitgeschakeld. Test in taak 6.

---

### Task 1: Werkruimte in de navigatie en een lege startpagina

**Files:**
- Modify: `src/lib/navigation.tsx` (nieuwe sectie direct na de sectie met `slug: "winkel"`)
- Modify: `src/lib/navigation.test.ts`
- Modify: `src/app/verkoop/toonbank/dagstaten/page.tsx` (vaste kleuren in `STATUS` en de foutregel)
- Modify: `src/lib/remOpLosseOnderdelen.test.ts` (plafond omlaag)
- Create: `src/app/winkelboek/layout.tsx`, `src/app/winkelboek/page.tsx`

**Interfaces:**
- Produces: werkruimte met `slug: "winkelboek"`, `hubHref: "/winkelboek"`; tabbladen met `href` `/winkelboek`, `/winkelboek/kasboek`, `/winkelboek/verkoop`, `/winkelboek/inkoop`, `/winkelboek/lopers`.

- [ ] **Step 1: Schrijf de falende test** in `src/lib/navigation.test.ts`, in het blok `describe('vindWerkruimte', …)`:

```ts
it('Boekhouding winkel is een eigen werkruimte met vijf tabbladen', () => {
    expect(vindWerkruimte('/winkelboek')?.section.slug).toBe('winkelboek');
    expect(vindWerkruimte('/winkelboek')?.tab?.label).toBe('Overzicht');
    expect(vindWerkruimte('/winkelboek/kasboek')?.tab?.label).toBe('Kasboek');
    expect(vindWerkruimte('/winkelboek/verkoop')?.tab?.label).toBe('Verkoop');
    expect(vindWerkruimte('/winkelboek/inkoop')?.tab?.label).toBe('Inkoop');
    expect(vindWerkruimte('/winkelboek/lopers')?.tab?.label).toBe('Hardlopers');
    expect(vindWerkruimte('/winkelboek/dag/2026-11-28')?.tab?.label).toBe('Overzicht');
    expect(vindWerkruimte('/winkel')?.section.slug).toBe('winkel');
    expect(uitzetbareSleutels().has('winkelboek')).toBe(true);
});
```

Pas de laatste regel aan als `uitzetbareSleutels` iets anders dan een `Set` teruggeeft; lees de bestaande tests in het bestand.

- [ ] **Step 2: Draai de test en zie hem falen**

Run: `npx vitest run src/lib/navigation.test.ts`
Expected: FAIL, `expected undefined to be 'winkelboek'`

- [ ] **Step 3: Voeg de sectie toe in `navSections`**, direct na Winkel:

```tsx
{
    /* De boekhouding van de winkelkassa: leest de bonnen en dagstaten van de
       Toonbank. Bouwt niets na wat elders staat; verwijst ernaar. */
    title: "Boekhouding winkel",
    icon: <Wallet size={18} />,
    type: "folder",
    slug: "winkelboek",
    description: "Kasboek, verkoop, inkoop en hardlopers van de winkel.",
    hubHref: "/winkelboek",
    kleur: "#8E5FA8",
    children: [
        { label: "Overzicht", icon: <LayoutGrid size={16} />, href: "/winkelboek", description: "De laatste dag in hokjes en of kas en pin kloppen" },
        { label: "Kasboek", icon: <Euro size={16} />, href: "/winkelboek/kasboek", description: "Wat erbij kwam, wat eraf ging en wat er in de la ligt" },
        { label: "Verkoop", icon: <Receipt size={16} />, href: "/winkelboek/verkoop", description: "Per artikel wat het opbracht en wat het kostte" },
        { label: "Inkoop", icon: <Truck size={16} />, href: "/winkelboek/inkoop", description: "Elke levering met bedrag, btw en bon" },
        { label: "Hardlopers", icon: <TrendingUp size={16} />, href: "/winkelboek/lopers", description: "Wat hard loopt, traag loopt of stilligt" },
    ],
},
```

Importeer `Wallet`, `Euro` en `Truck` uit `lucide-react` als ze er nog niet staan. Bestaat een icoon niet in de geïnstalleerde versie, neem dan `Banknote` of `Coins`.

- [ ] **Step 4: Maak ruimte onder het kleurplafond.** In `src/app/verkoop/toonbank/dagstaten/page.tsx` staan zeven kleurcodes als terugval: vervang elke `var(--ws-warn, #d97706)` door `var(--status-warning-text)`, elke `var(--green, #16a34a)` door `var(--status-success-text)` en elke `var(--ws-vuur, #dc2626)` door `var(--status-danger-text)`. Tel daarna:

Run: `grep -roE '#[0-9a-fA-F]{6}\b' src --include='*.tsx' | grep -v '\.test\.tsx' | wc -l`
Zet `PLAFOND.vasteKleuren` in `src/lib/remOpLosseOnderdelen.test.ts` op dat getal (verwacht 1693: zeven eraf, één erbij voor de tegelkleur).

- [ ] **Step 5: Maak `src/app/winkelboek/layout.tsx`** (servercomponent): importeert `@/styles/winkel.css` en `@/styles/menu-hub.css` (daar staan `kf-chip` en `kf-input`) en zet `children` in `<div className="wk-pagina">`.

- [ ] **Step 6: Maak `src/app/winkelboek/page.tsx`** met `export const dynamic = 'force-dynamic'`, `metadata.title = 'Boekhouding winkel · Overzicht'`, `HubHeader` met titel "Boekhouding winkel" en onderschrift "Sluit de kassa af en alles staat vanzelf in het juiste hokje: omzet, btw, kas, pin en voorraad.", en daaronder `EmptyState` met "Nog geen afgesloten dagen. Zodra je de kassa afsluit, staat de dag hier." Lees de props van `src/components/chassis/HubHeader.tsx` en `src/components/EmptyState.tsx`.

- [ ] **Step 7: Draai alles**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: groen; de rem-test slaagt met het nieuwe, lagere plafond.

- [ ] **Step 8: Commit**

```bash
git add src/lib/navigation.tsx src/lib/navigation.test.ts src/lib/remOpLosseOnderdelen.test.ts src/app/verkoop/toonbank/dagstaten/page.tsx src/app/winkelboek
git commit -m "Boekhouding winkel: werkruimte in de navigatie en lege startpagina"
```

---

### Task 2: Periode (week of maand) uit het adres

**Files:**
- Create: `src/lib/winkelboek/periode.ts`
- Test: `src/lib/winkelboek/periode.test.ts`

**Interfaces:**
- Produces:

```ts
export type PeriodeSoort = 'week' | 'maand';
export interface Periode {
    sleutel: string;      // '2026-W48' of '2026-11'
    soort: PeriodeSoort;
    start: string;        // JJJJ-MM-DD, maandag of de 1e
    eind: string;         // JJJJ-MM-DD, zondag of de laatste dag
    label: string;        // 'Week 48 · 23 – 29 nov' of 'November 2026'
    vorige: string;       // sleutel
    volgende: string;     // sleutel
}
/** Ongeldige of ontbrekende sleutel: de ISO-week waarin `vandaag` (JJJJ-MM-DD) valt. */
export function periodeVan(sleutel: string | undefined, vandaag: string): Periode;
/** De sleutel van de maand waarin de periode begint, voor de wissel week ↔ maand. */
export function maandSleutel(p: Periode): string;
/** De sleutel van de week waarin de periode begint. */
export function weekSleutel(p: Periode): string;
```

- [ ] **Step 1: Schrijf de falende tests**

```ts
import { describe, expect, it } from 'vitest';
import { maandSleutel, periodeVan, weekSleutel } from './periode';

describe('periodeVan', () => {
    it('een week loopt van maandag tot en met zondag', () => {
        expect(periodeVan('2026-W48', '2026-11-13')).toEqual({
            sleutel: '2026-W48', soort: 'week', start: '2026-11-23', eind: '2026-11-29',
            label: 'Week 48 · 23 – 29 nov', vorige: '2026-W47', volgende: '2026-W49',
        });
    });
    it('week 53 van 2026 loopt door in januari en wordt gevolgd door week 1 van 2027', () => {
        const p = periodeVan('2026-W53', '2026-11-13');
        expect(p).toMatchObject({ start: '2026-12-28', eind: '2027-01-03', volgende: '2027-W01', label: 'Week 53 · 28 dec – 3 jan' });
        expect(periodeVan('2027-W01', '2026-11-13')).toMatchObject({ start: '2027-01-04', vorige: '2026-W53' });
    });
    it('een maand loopt van de 1e tot en met de laatste dag', () => {
        expect(periodeVan('2026-11', '2026-11-13')).toEqual({
            sleutel: '2026-11', soort: 'maand', start: '2026-11-01', eind: '2026-11-30',
            label: 'November 2026', vorige: '2026-10', volgende: '2026-12',
        });
        expect(periodeVan('2026-12', '2026-11-13').volgende).toBe('2027-01');
    });
    it('zonder of met een kapotte sleutel: de week van vandaag', () => {
        expect(periodeVan(undefined, '2026-11-13').sleutel).toBe('2026-W46');
        expect(periodeVan('2026-W99', '2026-11-13').sleutel).toBe('2026-W46');
        expect(periodeVan('onzin', '2026-11-13').sleutel).toBe('2026-W46');
    });
    it('wisselt tussen week en maand op de begindatum', () => {
        expect(maandSleutel(periodeVan('2026-W48', '2026-11-13'))).toBe('2026-11');
        expect(weekSleutel(periodeVan('2026-11', '2026-11-13'))).toBe('2026-W44');
    });
});
```

- [ ] **Step 2: Draai en zie falen** — Run: `npx vitest run src/lib/winkelboek/periode.test.ts` — Expected: FAIL, module niet gevonden.

- [ ] **Step 3: Implementeer `periode.ts`.** ISO-8601 weeknummering (week 1 bevat 4 januari), rekenen in UTC op de middag (`T12:00:00Z`) zodat zomertijd niets verschuift. Maandnamen en korte maanden via `toLocaleDateString('nl-NL', …)`; de maandnaam begint met een hoofdletter. Een weeksleutel is geldig als het weeknummer in dat ISO-jaar bestaat.

- [ ] **Step 4: Draai en zie slagen** — Run: `npx vitest run src/lib/winkelboek/periode.test.ts` — Expected: PASS (5 tests).

- [ ] **Step 5: Commit** — `git add src/lib/winkelboek/periode.ts src/lib/winkelboek/periode.test.ts && git commit -m "Boekhouding winkel: periode per week of maand"`

---

### Task 3: De dag in hokjes (R1)

**Files:**
- Create: `src/lib/winkelboek/dagboeking.ts`
- Test: `src/lib/winkelboek/dagboeking.test.ts`

**Interfaces:**
- Produces:

```ts
export interface BonMin {
    status: 'afgerond' | 'geannuleerd';
    /** In welke dagafsluiting de bon valt; null = (nog) in geen enkele. */
    dagstaat_id: string | null;
    totaal_cents: number;
    afronding_cents: number;
    /** toonbank_bonnen.btw: {"9": {incl_cents, btw_cents}, "21": {…}} */
    btw: Record<string, { incl_cents: number; btw_cents: number }>;
    statiegeld_cents: number;
    order_rest_cents: number;
    pin_cents: number;
    contant_cents: number;
    cadeaubon_cents: number;
}
export interface DagstaatKort {
    id: string;
    apparaat_id: string;
    bedrijfsdag: string;
    status: 'voorlopig' | 'definitief' | 'aangevuld' | 'goedgekeurd';
    gesloten_at: string;
    aantal_bonnen: number;
    pin_toonbank_cents: number;
    pin_mypos_app_cents: number;
    pin_verschil_cents: number;
    contant_begin_cents: number;
    contant_verwacht_cents: number;
    contant_geteld_cents: number;
    contant_verschil_cents: number;
    afgeroomd_cents: number;
    verschillen: unknown[];
    goedgekeurd_at: string | null;
}
export interface Hokje { sleutel: string; label: string; uitleg: string; cents: number }
export type DagStand = 'geen_verkoop' | 'open' | 'te_controleren' | 'geboekt';
export interface Dagboeking {
    datum: string;
    binnen: { pin: number; contant: number; cadeaubon: number; totaal: number };
    hokjes: Hokje[];
    totaal_hokjes: number;
    sluit: boolean;
    stand: DagStand;
    aantal_bonnen: number;          // afgeronde bonnen, tegenbonnen meegeteld
    gesloten_at: string | null;     // de laatste dagstaat van de dag
    punten: string[];               // wat er nog aandacht vraagt, in gewone taal
}
export function maakDagboeking(datum: string, bonnen: BonMin[], dagstaten: DagstaatKort[]): Dagboeking;
```

Teksten in `punten` (bedragen via `formatEur`, die een vaste spatie na het euroteken zet; tests kijken daarom alleen naar de cijfers): `De kassa is nog niet afgesloten.` · `De dagstaat is voorlopig: de tablet had nog bonnen te versturen.` · `Kasverschil van <bedrag> is nog niet goedgekeurd.` · `Pinverschil van <bedrag> is nog niet goedgekeurd.` · `Narekenen uit de bonnen gaf een verschil met de tablet.` · `De hokjes sluiten niet: <bedrag> verschil.` · `Er zijn bonnen die in geen dagafsluiting vallen.` (er is een dagstaat, maar een afgeronde bon heeft `dagstaat_id` null; de dag is dan `te_controleren`).

Hokjes in deze volgorde, een hokje van 0 cent wordt weggelaten: per tarief oplopend `omzet_<pct>` (label `Omzet <pct>%`, uitleg `Excl. btw`) en `btw_<pct>` (label `Btw <pct>%`, uitleg `Af te dragen`); dan `statiegeld` (`Statiegeld`, `Geen omzet, geen btw`), `webshop_afgehaald` (`Webshop afgehaald`, `Omzet stond al bij de webshop`), `afronding` (`Afronding contant`, `Op 5 cent`).

- [ ] **Step 1: Schrijf de falende tests**

```ts
import { describe, expect, it } from 'vitest';
import { maakDagboeking, type BonMin, type DagstaatKort } from './dagboeking';

const bon = (b: Partial<BonMin>): BonMin => ({
    status: 'afgerond', dagstaat_id: 'd1', totaal_cents: 0, afronding_cents: 0, btw: {}, statiegeld_cents: 0,
    order_rest_cents: 0, pin_cents: 0, contant_cents: 0, cadeaubon_cents: 0, ...b,
});
const staat = (s: Partial<DagstaatKort>): DagstaatKort => ({
    id: 'd1', apparaat_id: 'kassa-1',
    bedrijfsdag: '2026-11-28', status: 'definitief', gesloten_at: '2026-11-28T17:07:00Z', aantal_bonnen: 1,
    pin_toonbank_cents: 0, pin_mypos_app_cents: 0, pin_verschil_cents: 0, contant_begin_cents: 15000,
    contant_verwacht_cents: 15000, contant_geteld_cents: 15000, contant_verschil_cents: 0,
    afgeroomd_cents: 0, verschillen: [], goedgekeurd_at: null, ...s,
});
const dag = bon({
    totaal_cents: 179198, afronding_cents: -2, statiegeld_cents: 1200, order_rest_cents: 8500,
    btw: { '9': { incl_cents: 109000, btw_cents: 9000 }, '21': { incl_cents: 60500, btw_cents: 10500 } },
    pin_cents: 140250, contant_cents: 33948, cadeaubon_cents: 5000,
});
const cents = (d: ReturnType<typeof maakDagboeking>) => Object.fromEntries(d.hokjes.map((h) => [h.sleutel, h.cents]));

describe('maakDagboeking', () => {
    it('zet de dag in hokjes en sluit op de cent', () => {
        const d = maakDagboeking('2026-11-28', [dag], [staat({})]);
        expect(d.binnen).toEqual({ pin: 140250, contant: 33948, cadeaubon: 5000, totaal: 179198 });
        expect(d.hokjes.map((h) => h.sleutel)).toEqual(['omzet_9', 'btw_9', 'omzet_21', 'btw_21', 'statiegeld', 'webshop_afgehaald', 'afronding']);
        expect(cents(d)).toEqual({ omzet_9: 100000, btw_9: 9000, omzet_21: 50000, btw_21: 10500, statiegeld: 1200, webshop_afgehaald: 8500, afronding: -2 });
        expect(d).toMatchObject({ totaal_hokjes: 179198, sluit: true, stand: 'geboekt', aantal_bonnen: 1, punten: [] });
    });
    it('een tegenbon telt negatief en de dag sluit nog steeds', () => {
        const terug = bon({ totaal_cents: -1090, btw: { '9': { incl_cents: -1090, btw_cents: -90 } }, pin_cents: -1090 });
        const d = maakDagboeking('2026-11-28', [dag, terug], [staat({})]);
        expect(cents(d)).toMatchObject({ omzet_9: 99000, btw_9: 8910 });
        expect(d).toMatchObject({ sluit: true, aantal_bonnen: 2 });
        expect(d.binnen.pin).toBe(139160);
    });
    it('een geannuleerde bon telt niet mee', () => {
        const d = maakDagboeking('2026-11-28', [dag, bon({ status: 'geannuleerd', totaal_cents: 500, pin_cents: 500 })], [staat({})]);
        expect(d.binnen.totaal).toBe(179198);
        expect(d.aantal_bonnen).toBe(1);
    });
    it('een bon buiten elke dagafsluiting is te controleren', () => {
        const d = maakDagboeking('2026-11-28', [dag, bon({ ...dag, dagstaat_id: null })], [staat({})]);
        expect(d.stand).toBe('te_controleren');
        expect(d.punten.join(' ')).toContain('geen dagafsluiting');
    });
    it('bonnen zonder dagstaat: de dag staat open en krijgt geen vinkje', () => {
        const d = maakDagboeking('2026-11-28', [{ ...dag, dagstaat_id: null }], []);
        expect(d.stand).toBe('open');
        expect(d.gesloten_at).toBeNull();
        expect(d.punten.join(' ')).toContain('niet afgesloten');
        expect(d.binnen.totaal).toBe(179198);
    });
    it('geen bonnen en geen dagstaat: geen verkoop', () => {
        expect(maakDagboeking('2026-11-28', [], [])).toMatchObject({ stand: 'geen_verkoop', hokjes: [], sluit: true, punten: [] });
    });
    it('een kasverschil blijft te controleren tot het is goedgekeurd', () => {
        const open = maakDagboeking('2026-11-28', [dag], [staat({ contant_verschil_cents: -200 })]);
        expect(open.stand).toBe('te_controleren');
        expect(open.punten.join(' ')).toContain('2,00');
        const klaar = maakDagboeking('2026-11-28', [dag], [staat({ contant_verschil_cents: -200, goedgekeurd_at: '2026-11-29T08:00:00Z' })]);
        expect(klaar.stand).toBe('geboekt');
    });
    it('een voorlopige dagstaat of een narekenverschil is te controleren', () => {
        expect(maakDagboeking('2026-11-28', [dag], [staat({ status: 'voorlopig' })]).stand).toBe('te_controleren');
        expect(maakDagboeking('2026-11-28', [dag], [staat({ verschillen: [{ veld: 'pin', tablet_cents: 1, ba_cents: 2 }] })]).stand).toBe('te_controleren');
        expect(maakDagboeking('2026-11-28', [dag], [staat({ status: 'goedgekeurd', verschillen: [{ veld: 'pin', tablet_cents: 1, ba_cents: 2 }] })]).stand).toBe('geboekt');
    });
    it('hokjes die niet sluiten zijn te controleren', () => {
        const d = maakDagboeking('2026-11-28', [bon({ ...dag, pin_cents: 140000 })], [staat({})]);
        expect(d).toMatchObject({ sluit: false, stand: 'te_controleren' });
        expect(d.punten.join(' ')).toContain('2,50');
    });
    it('twee tablets op één dag tellen samen', () => {
        const d = maakDagboeking('2026-11-28', [dag, dag], [staat({}), staat({ gesloten_at: '2026-11-28T17:30:00Z' })]);
        expect(d.binnen.totaal).toBe(358396);
        expect(d.gesloten_at).toBe('2026-11-28T17:30:00Z');
        expect(d.stand).toBe('geboekt');
    });
});
```

- [ ] **Step 2: Draai en zie falen** — Run: `npx vitest run src/lib/winkelboek/dagboeking.test.ts` — Expected: FAIL, module niet gevonden.

- [ ] **Step 3: Implementeer `maakDagboeking`** volgens R1 in de spec. Bedragen in `punten` via `formatEur(Math.abs(cents) / 100)`. De btw wordt opgeteld uit `btw[pct].btw_cents`, nooit herberekend.

- [ ] **Step 4: Draai en zie slagen** — Expected: PASS (10 tests).

- [ ] **Step 5: Commit** — `git commit -m "Boekhouding winkel: de dag in hokjes"`

---

### Task 4: Kasboek (R2) en de tabel voor eigen kasregels

**Files:**
- Create: `supabase/migrations/20261116120000_winkel_kas_mutaties.sql`
- Create: `src/lib/winkelboek/kasboek.ts`
- Test: `src/lib/winkelboek/kasboek.test.ts`

**Interfaces:**
- Consumes: `DagstaatKort` uit taak 3.
- Produces:

```ts
export type KasReden = 'uitgave' | 'prive' | 'wisselgeld' | 'overig';
/** 'tijdens' = tussen openen en tellen (verklaart een kasverschil); 'voor_openen' = vóór de eerste telling van die dag (verklaart een verschil tussen de dagen). */
export type KasMoment = 'voor_openen' | 'tijdens';
export interface KasMutatie { id: string; datum: string; bedrag_cents: number; reden: KasReden; omschrijving: string; moment: KasMoment }
export type KasRegelSoort = 'beginstand' | 'tussen_dagen' | 'verkoop' | 'eigen' | 'kasverschil' | 'afgeroomd';
export interface KasRegel {
    datum: string;
    soort: KasRegelSoort;
    wat: string;                 // 'Beginstand' | 'Tussen de dagen' | 'Contante verkoop' | omschrijving | 'Kasverschil' | 'Afgeroomd'
    bedrag_cents: number;        // + erbij, − eraf; 0 bij de beginstand
    saldo_cents: number;         // in de la na deze regel
    bron: 'automatisch' | 'zelf';
    mutatie_id: string | null;
    goedgekeurd: boolean;        // alleen van belang bij kasverschil
}
export interface Kasboek {
    regels: KasRegel[];              // oplopend in tijd
    in_de_la_cents: number | null;   // null zonder dagstaat in de periode
    kasverschil_cents: number;       // som van de onverklaarde verschillen
    afgeroomd_cents: number;
    punten: string[];
}
export function maakKasboek(dagstaten: DagstaatKort[], mutaties: KasMutatie[], uitgesloten?: ReadonlySet<string>): Kasboek;
```

Teksten in `punten`: `Kasverschil van <bedrag> op <dag> is nog niet goedgekeurd.` · `Tussen <dag> en <dag> veranderde de la <bedrag> zonder regel.` · `Er zijn dagafsluitingen van meer dan één kassa. Het kasboek rekent met één la.` Dagen als `do 26 nov`.

Het kasboek rekent met één la en loopt per dagafsluiting, in volgorde van `bedrijfsdag` en dan `gesloten_at` (niet per dag opgeteld: dezelfde kassa kan op één dag twee keer afsluiten). Per dagafsluiting, in deze volgorde:
1. eigen regels die er nog vóór horen: alle met een eerdere datum die nog niet geplaatst zijn, en bij de eerste afsluiting van een dag die van dezelfde datum met `moment: 'voor_openen'`;
2. `tussen_dagen` als `contant_begin_cents` afwijkt van het saldo;
3. `verkoop` = `contant_verwacht_cents − contant_begin_cents`;
4. alleen bij de laatste afsluiting van die dag: de eigen regels van die datum met `moment: 'tijdens'`;
5. `kasverschil` = `contant_verschil_cents` min de som uit stap 4, alleen als dat niet nul is;
6. `afgeroomd`, alleen als groter dan nul.

Eigen regels vóór de eerste afsluiting van de periode vervallen (er is nog geen saldo); eigen regels na de laatste afsluiting komen achteraan.

- [ ] **Step 1: Schrijf het migratiebestand.** Laad eerst de skills `supabase:supabase` en `postgres-best-practices:supabase-postgres-best-practices`. Inhoud:

```sql
-- winkel_kas_mutaties — geld dat je zelf uit of in de kassala doet.
--
-- De Toonbank kent alleen verkoop, tellen en afromen. Een boodschap die je
-- contant uit de la betaalt staat nergens; bij het tellen wordt dat een
-- kasverschil. Met een regel hier verklaart Boekhouding winkel dat verschil.
-- De app werkt ook zonder deze tabel (dan toont het kasboek alleen kassaregels).
--
-- Draaien: npx supabase db query --linked -f supabase/migrations/20261116120000_winkel_kas_mutaties.sql

CREATE TABLE IF NOT EXISTS public.winkel_kas_mutaties (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
    datum            DATE        NOT NULL,
    -- Negatief = uit de la, positief = in de la.
    bedrag_cents     INTEGER     NOT NULL CHECK (bedrag_cents <> 0),
    reden            TEXT        NOT NULL CHECK (reden IN ('uitgave', 'prive', 'wisselgeld', 'overig')),
    omschrijving     TEXT        NOT NULL CHECK (length(btrim(omschrijving)) BETWEEN 2 AND 200),
    -- 'tijdens' = tussen openen en tellen; 'voor_openen' = vóór de eerste telling van die dag.
    moment           TEXT        NOT NULL DEFAULT 'tijdens' CHECK (moment IN ('voor_openen', 'tijdens')),
    created_by       UUID        DEFAULT auth.uid(),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.winkel_kas_mutaties IS
    'Geld dat de ondernemer zelf uit of in de kassala doet (uitgave, privé, wisselgeld). Verklaart een kasverschil in Boekhouding winkel. 7 jaar bewaren.';

CREATE INDEX IF NOT EXISTS winkel_kas_mutaties_dag_idx ON public.winkel_kas_mutaties (organization_id, datum);

ALTER TABLE public.winkel_kas_mutaties ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS winkel_kas_mutaties_select ON public.winkel_kas_mutaties;
CREATE POLICY winkel_kas_mutaties_select ON public.winkel_kas_mutaties FOR SELECT TO authenticated
    USING (organization_id IN (SELECT private.user_org_ids()));
DROP POLICY IF EXISTS winkel_kas_mutaties_insert ON public.winkel_kas_mutaties;
CREATE POLICY winkel_kas_mutaties_insert ON public.winkel_kas_mutaties FOR INSERT TO authenticated
    WITH CHECK (organization_id IN (SELECT private.user_org_ids()));
DROP POLICY IF EXISTS winkel_kas_mutaties_delete ON public.winkel_kas_mutaties;
CREATE POLICY winkel_kas_mutaties_delete ON public.winkel_kas_mutaties FOR DELETE TO authenticated
    USING (organization_id IN (SELECT private.user_org_ids()));

REVOKE ALL ON TABLE public.winkel_kas_mutaties FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, DELETE ON TABLE public.winkel_kas_mutaties TO authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.winkel_kas_mutaties TO service_role;

-- Controle: moet één rij geven.
SELECT to_regclass('public.winkel_kas_mutaties') AS tabel;
```

Niet toepassen. Meld in het eindverslag dat het bestand klaarstaat en op akkoord van Mathijs wacht.

- [ ] **Step 2: Schrijf de falende tests** in `kasboek.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import type { DagstaatKort } from './dagboeking';
import { maakKasboek, type KasMutatie } from './kasboek';

const staat = (dag: string, begin: number, verwacht: number, geteld: number, afgeroomd: number, extra: Partial<DagstaatKort> = {}): DagstaatKort => ({
    id: `d-${dag}`, apparaat_id: 'kassa-1',
    bedrijfsdag: dag, status: 'definitief', gesloten_at: `${dag}T17:00:00Z`, aantal_bonnen: 1,
    pin_toonbank_cents: 0, pin_mypos_app_cents: 0, pin_verschil_cents: 0,
    contant_begin_cents: begin, contant_verwacht_cents: verwacht, contant_geteld_cents: geteld,
    contant_verschil_cents: geteld - verwacht, afgeroomd_cents: afgeroomd, verschillen: [], goedgekeurd_at: null, ...extra,
});
const week = [
    staat('2026-11-24', 15000, 23650, 23650, 8500),
    staat('2026-11-25', 15150, 22550, 22550, 7500),
    staat('2026-11-26', 15050, 24300, 24100, 9000),
    staat('2026-11-27', 15100, 33900, 33000, 18000),
    staat('2026-11-28', 15000, 48945, 48945, 34000),
];
const boodschap: KasMutatie = { id: 'm1', datum: '2026-11-27', bedrag_cents: -900, reden: 'uitgave', omschrijving: 'Schoonmaakmiddel', moment: 'tijdens' };

describe('maakKasboek', () => {
    it('rijgt de week aan elkaar en eindigt op wat er in de la ligt', () => {
        const k = maakKasboek(week, [boodschap]);
        expect(k.regels.map((r) => r.soort)).toEqual([
            'beginstand', 'verkoop', 'afgeroomd', 'verkoop', 'afgeroomd', 'verkoop', 'kasverschil', 'afgeroomd',
            'verkoop', 'eigen', 'afgeroomd', 'verkoop', 'afgeroomd',
        ]);
        expect(k.regels.map((r) => r.saldo_cents)).toEqual([
            15000, 23650, 15150, 22550, 15050, 24300, 24100, 15100, 33900, 33000, 15000, 48945, 14945,
        ]);
        expect(k).toMatchObject({ in_de_la_cents: 14945, kasverschil_cents: -200, afgeroomd_cents: 77000 });
    });
    it('een eigen regel verklaart het kasverschil van die dag', () => {
        const k = maakKasboek(week, [boodschap]);
        const vrijdag = k.regels.filter((r) => r.datum === '2026-11-27');
        expect(vrijdag.find((r) => r.soort === 'kasverschil')).toBeUndefined();
        expect(vrijdag.find((r) => r.soort === 'eigen')).toMatchObject({ wat: 'Schoonmaakmiddel', bedrag_cents: -900, bron: 'zelf', mutatie_id: 'm1' });
    });
    it('zonder die regel is het hele bedrag een kasverschil en een aandachtspunt', () => {
        const k = maakKasboek(week, []);
        expect(k.kasverschil_cents).toBe(-1100);
        expect(k.punten.filter((p) => p.includes('Kasverschil'))).toHaveLength(2);
    });
    it('een goedgekeurd kasverschil is geen aandachtspunt meer', () => {
        const k = maakKasboek([staat('2026-11-26', 15050, 24300, 24100, 9000, { goedgekeurd_at: '2026-11-27T08:00:00Z' })], []);
        expect(k.punten).toEqual([]);
        expect(k.regels.find((r) => r.soort === 'kasverschil')).toMatchObject({ bedrag_cents: -200, goedgekeurd: true });
    });
    it('een andere beginstand dan gisteren overbleef wordt een regel en een aandachtspunt', () => {
        const k = maakKasboek([staat('2026-11-24', 15000, 23650, 23650, 8500), staat('2026-11-25', 15000, 22400, 22400, 7400)], []);
        expect(k.regels.find((r) => r.soort === 'tussen_dagen')).toMatchObject({ datum: '2026-11-25', bedrag_cents: -150, saldo_cents: 15000 });
        expect(k.punten.join(' ')).toContain('1,50');
    });
    it('een proefdag laat geen regels na', () => {
        const k = maakKasboek([staat('2026-10-27', 0, 5000, 100, 0), ...week], [boodschap], new Set(['2026-10-27']));
        expect(k.regels[0]).toMatchObject({ soort: 'beginstand', datum: '2026-11-24', saldo_cents: 15000 });
        expect(k.kasverschil_cents).toBe(-200);
    });
    it('twee afsluitingen op één dag rijgen aan elkaar', () => {
        const k = maakKasboek([
            staat('2026-11-24', 15000, 20000, 20000, 5000, { id: 'a', gesloten_at: '2026-11-24T12:00:00Z' }),
            staat('2026-11-24', 15000, 18650, 18650, 3500, { id: 'b', gesloten_at: '2026-11-24T17:00:00Z' }),
        ], []);
        expect(k.regels.map((r) => r.saldo_cents)).toEqual([15000, 20000, 15000, 18650, 15150]);
        expect(k.punten).toEqual([]);
    });
    it('meer dan één kassa geeft een waarschuwing', () => {
        const k = maakKasboek([staat('2026-11-24', 15000, 20000, 20000, 5000), staat('2026-11-25', 15000, 16000, 16000, 1000, { apparaat_id: 'kassa-2' })], []);
        expect(k.punten.join(' ')).toContain('meer dan één kassa');
    });
    it('wisselgeld vóór het openen verklaart het verschil tussen de dagen', () => {
        const k = maakKasboek([staat('2026-11-24', 15000, 23650, 23650, 8500), staat('2026-11-25', 17150, 24550, 24550, 7400)],
            [{ id: 'm3', datum: '2026-11-25', bedrag_cents: 2000, reden: 'wisselgeld', omschrijving: 'Wisselgeld erbij', moment: 'voor_openen' }]);
        expect(k.regels.map((r) => r.soort)).toEqual(['beginstand', 'verkoop', 'afgeroomd', 'eigen', 'verkoop', 'afgeroomd']);
        expect(k).toMatchObject({ kasverschil_cents: 0, in_de_la_cents: 17150, punten: [] });
    });
    it('zonder dagstaten: leeg boek', () => {
        expect(maakKasboek([], [])).toEqual({ regels: [], in_de_la_cents: null, kasverschil_cents: 0, afgeroomd_cents: 0, punten: [] });
    });
    it('een eigen regel op een dag zonder dagstaat schuift het saldo op', () => {
        const k = maakKasboek([staat('2026-11-24', 15000, 23650, 23650, 8500), staat('2026-11-26', 17150, 20000, 20000, 0)],
            [{ id: 'm2', datum: '2026-11-25', bedrag_cents: 2000, reden: 'wisselgeld', omschrijving: 'Wisselgeld erbij', moment: 'tijdens' }]);
        expect(k.regels.find((r) => r.soort === 'tussen_dagen')).toBeUndefined();
        expect(k.in_de_la_cents).toBe(20000);
    });
});
```

- [ ] **Step 3: Draai en zie falen** — Run: `npx vitest run src/lib/winkelboek/kasboek.test.ts` — Expected: FAIL, module niet gevonden.

- [ ] **Step 4: Implementeer `maakKasboek`** volgens de zes stappen hierboven. `goedgekeurd` op een kasverschilregel is waar als die dagafsluiting een `goedgekeurd_at` heeft.

- [ ] **Step 5: Draai en zie slagen** — Expected: PASS (11 tests).

- [ ] **Step 6: Commit** — `git add supabase/migrations/20261116120000_winkel_kas_mutaties.sql src/lib/winkelboek/kasboek.ts src/lib/winkelboek/kasboek.test.ts && git commit -m "Boekhouding winkel: kasboek en tabel voor eigen kasregels"`

---

### Task 5: Verkoop per artikel met inkoopwaarde (R3)

**Files:**
- Create: `src/lib/winkelboek/verkoop.ts`
- Test: `src/lib/winkelboek/verkoop.test.ts`

**Interfaces:**
- Consumes: `productVanRegel` uit `src/lib/winkel/afdelingen.ts`.
- Produces:

```ts
export type InkoopBron = 'logboek' | 'prijs_nu';
export interface Onderdeel { product_id: string; hoeveelheid: number; eenheid: string }
export interface VerkoopRegel {
    regel_id: number;
    bedrijfsdag: string;
    op: string;                          // toonbank_bonnen.gebeurd_at
    artikel_id: string | null;
    naam: string;
    open_prijs_groep: string | null;
    aantal: number;                      // negatief op een tegenbon
    bedrag_cents: number;                // incl. btw
    btw: { pct: number; incl_cents: number }[];
    onderdelen: Onderdeel[] | null;          // in de database altijd een lijst; leeg bij een open prijs
    goederen_terug: boolean | null;          // alleen op een tegenbon gevuld
    inkoop_cents: number | null;
    inkoop_bron: InkoopBron | null;
}
export interface RegelMutatie { toonbank_bon_regel_id: number; winkel_product_id: string; type: string; waarde_cents: number | null }
export interface ProductPrijs { inkoop_excl_cents: number | null; prijs_per: number }
export interface ArtikelCijfers {
    sleutel: string;                     // artikel_id of 'open:<groep>'
    naam: string;
    afdeling: string;
    aantal: number;
    omzet_excl_cents: number;
    inkoop_cents: number | null;
    marge_cents: number | null;
    marge_pct: number | null;            // één decimaal, bv. 43.7
    geschat: boolean;
}
export interface PeriodeMarge {
    omzet_cents: number;                 // alle artikelen, excl. btw
    inkoop_cents: number;                // alleen artikelen met een marge
    marge_cents: number;
    marge_pct: number | null;
    dekking_pct: number | null;          // omzet met marge ÷ alle omzet, heel getal
    zonder_inkoopprijs: number;          // aantal artikelen
    geschat: number;                     // aantal artikelen
}
export function exclUitIncl(incl_cents: number, pct: number): number;
export function inkoopVanRegel(
    regel: Pick<VerkoopRegel, 'regel_id' | 'aantal' | 'onderdelen' | 'goederen_terug'>,
    mutaties: readonly RegelMutatie[],
    prijzen: ReadonlyMap<string, ProductPrijs>,
): { inkoop_cents: number | null; inkoop_bron: InkoopBron | null };
export function verkoopPerArtikel(regels: readonly VerkoopRegel[], afdelingVanProduct: ReadonlyMap<string, string>): ArtikelCijfers[];
export function periodeMarge(artikelen: readonly ArtikelCijfers[]): PeriodeMarge;
```

De inkoopwaarde van een regel wordt per onderdeel (product) bepaald, want de kassa schrijft per regel × product een mutatie en bij een pakket kan het ene product wel en het andere niet geteld zijn:
1. Geen onderdelen (leeg of null: open prijs) → onbekend.
2. Tegenbonregel (`aantal < 0`) waarvan `goederen_terug` niet `true` is → 0 met bron `logboek`: het artikel kwam niet terug, dus de inkoop blijft staan.
3. Per onderdeel: zijn er mutaties met deze `toonbank_bon_regel_id` en dit `winkel_product_id` van type `verkoop_kassa` of `retour`, dan min hun som (`logboek`); is één ervan leeg → de hele regel onbekend. Zijn er geen, dan `Math.round(aantal × hoeveelheid × inkoop_excl_cents / prijs_per)` (`prijs_nu`); heeft het product geen inkoopprijs → de hele regel onbekend.
4. De regel is de som van zijn onderdelen; de bron is `prijs_nu` zodra één onderdeel zo gerekend is, anders `logboek`.

- [ ] **Step 1: Schrijf de falende tests**

```ts
import { describe, expect, it } from 'vitest';
import { exclUitIncl, inkoopVanRegel, periodeMarge, verkoopPerArtikel, type VerkoopRegel } from './verkoop';

const regel = (r: Partial<VerkoopRegel>): VerkoopRegel => ({
    regel_id: 1, bedrijfsdag: '2026-11-28', op: '2026-11-28T12:00:00Z', artikel_id: 'a-worst', naam: 'Droge worst naturel',
    open_prijs_groep: null, aantal: 1, bedrag_cents: 600, btw: [{ pct: 9, incl_cents: 600 }],
    onderdelen: [{ product_id: 'p-worst', hoeveelheid: 1, eenheid: 'stuk' }], goederen_terug: null,
    inkoop_cents: 310, inkoop_bron: 'logboek', ...r,
});
const afdeling = new Map([['p-worst', 'Worst'], ['p-bier', 'Bier']]);

describe('exclUitIncl', () => {
    it('haalt de btw eruit en rondt één keer af', () => {
        expect(exclUitIncl(109000, 9)).toBe(100000);
        expect(exclUitIncl(395, 21)).toBe(326);
        expect(exclUitIncl(-1090, 9)).toBe(-1000);
        expect(exclUitIncl(500, 0)).toBe(500);
    });
});

describe('inkoopVanRegel', () => {
    const prijzen = new Map([
        ['p-worst', { inkoop_excl_cents: 310, prijs_per: 1 }],
        ['p-noot', { inkoop_excl_cents: 1400, prijs_per: 100 }],
        ['p-bier', { inkoop_excl_cents: 145, prijs_per: 1 }],
    ]);
    const worst = [{ product_id: 'p-worst', hoeveelheid: 1, eenheid: 'stuk' }];
    const r = { regel_id: 7, aantal: 2, goederen_terug: null, onderdelen: worst };
    const mut = (regel: number, product: string, type: string, waarde: number | null) =>
        ({ toonbank_bon_regel_id: regel, winkel_product_id: product, type, waarde_cents: waarde });

    it('neemt de waarde uit het voorraadlogboek', () => {
        expect(inkoopVanRegel(r, [mut(7, 'p-worst', 'verkoop_kassa', -620)], prijzen)).toEqual({ inkoop_cents: 620, inkoop_bron: 'logboek' });
    });
    it('een tekortcorrectie en de mutaties van een andere regel tellen niet mee', () => {
        expect(inkoopVanRegel(r, [mut(7, 'p-worst', 'verkoop_kassa', -620), mut(7, 'p-worst', 'tekort_correctie', 310), mut(8, 'p-worst', 'verkoop_kassa', -310)], prijzen).inkoop_cents).toBe(620);
    });
    it('een tegenbon met goederen terug haalt de inkoopwaarde eraf', () => {
        expect(inkoopVanRegel({ regel_id: 8, aantal: -1, goederen_terug: true, onderdelen: worst }, [mut(8, 'p-worst', 'retour', 310)], prijzen)).toEqual({ inkoop_cents: -310, inkoop_bron: 'logboek' });
    });
    it('een tegenbon zonder goederen terug laat de inkoop staan', () => {
        expect(inkoopVanRegel({ regel_id: 8, aantal: -1, goederen_terug: false, onderdelen: worst }, [], prijzen)).toEqual({ inkoop_cents: 0, inkoop_bron: 'logboek' });
        expect(inkoopVanRegel({ regel_id: 8, aantal: -1, goederen_terug: null, onderdelen: worst }, [], prijzen).inkoop_cents).toBe(0);
    });
    it('een mutatie zonder waarde maakt de regel onbekend', () => {
        expect(inkoopVanRegel(r, [mut(7, 'p-worst', 'verkoop_kassa', null)], prijzen)).toEqual({ inkoop_cents: null, inkoop_bron: null });
    });
    it('zonder mutatie: de inkoopprijs van nu, per onderdeel', () => {
        expect(inkoopVanRegel(r, [], prijzen)).toEqual({ inkoop_cents: 620, inkoop_bron: 'prijs_nu' });
        expect(inkoopVanRegel({ regel_id: 9, aantal: 1, goederen_terug: null, onderdelen: [{ product_id: 'p-noot', hoeveelheid: 150, eenheid: 'gram' }] }, [], prijzen)).toEqual({ inkoop_cents: 2100, inkoop_bron: 'prijs_nu' });
    });
    it('een pakket met één geteld en één ongeteld product mengt logboek en de prijs van nu', () => {
        const pakket = { regel_id: 10, aantal: 1, goederen_terug: null, onderdelen: [{ product_id: 'p-bier', hoeveelheid: 4, eenheid: 'stuk' }, ...worst] };
        expect(inkoopVanRegel(pakket, [mut(10, 'p-bier', 'verkoop_kassa', -580)], prijzen)).toEqual({ inkoop_cents: 890, inkoop_bron: 'prijs_nu' });
    });
    it('een open prijs of een product zonder inkoopprijs: onbekend, nooit nul', () => {
        expect(inkoopVanRegel({ regel_id: 11, aantal: 1, goederen_terug: null, onderdelen: [] }, [], prijzen)).toEqual({ inkoop_cents: null, inkoop_bron: null });
        expect(inkoopVanRegel({ regel_id: 11, aantal: 1, goederen_terug: null, onderdelen: null }, [], prijzen).inkoop_cents).toBeNull();
        expect(inkoopVanRegel({ regel_id: 11, aantal: 1, goederen_terug: null, onderdelen: [{ product_id: 'p-onbekend', hoeveelheid: 1, eenheid: 'stuk' }] }, [], prijzen).inkoop_cents).toBeNull();
    });
});

describe('verkoopPerArtikel', () => {
    it('telt per artikel en rekent de marge', () => {
        const [a] = verkoopPerArtikel([regel({}), regel({ regel_id: 2, aantal: 2, bedrag_cents: 1200, btw: [{ pct: 9, incl_cents: 1200 }], inkoop_cents: 620 })], afdeling);
        expect(a).toEqual({ sleutel: 'a-worst', naam: 'Droge worst naturel', afdeling: 'Worst', aantal: 3, omzet_excl_cents: 1651, inkoop_cents: 930, marge_cents: 721, marge_pct: 43.7, geschat: false });
    });
    it('een tegenbon trekt af', () => {
        const [a] = verkoopPerArtikel([regel({ aantal: 2, bedrag_cents: 1200, btw: [{ pct: 9, incl_cents: 1200 }], inkoop_cents: 620 }),
            regel({ regel_id: 3, aantal: -1, bedrag_cents: -600, btw: [{ pct: 9, incl_cents: -600 }], inkoop_cents: -310 })], afdeling);
        expect(a).toMatchObject({ aantal: 1, omzet_excl_cents: 550, inkoop_cents: 310 });
    });
    it('één regel zonder inkoopwaarde maakt de marge van het artikel onbekend', () => {
        const [a] = verkoopPerArtikel([regel({}), regel({ regel_id: 2, inkoop_cents: null, inkoop_bron: null })], afdeling);
        expect(a).toMatchObject({ inkoop_cents: null, marge_cents: null, marge_pct: null });
    });
    it('een geschatte regel maakt het artikel geschat', () => {
        expect(verkoopPerArtikel([regel({ inkoop_bron: 'prijs_nu' })], afdeling)[0].geschat).toBe(true);
    });
    it('pakket, open prijs en product zonder plek krijgen een eigen afdeling', () => {
        const uit = verkoopPerArtikel([
            regel({ artikel_id: 'a-pakket', naam: 'Bierpakket', onderdelen: [{ product_id: 'p-bier', hoeveelheid: 4, eenheid: 'stuk' }, { product_id: 'p-worst', hoeveelheid: 1, eenheid: 'stuk' }] }),
            regel({ regel_id: 2, artikel_id: null, naam: 'Los', open_prijs_groep: 'vlees', onderdelen: [], inkoop_cents: null, inkoop_bron: null }),
            regel({ regel_id: 3, artikel_id: 'a-los', naam: 'Chutney', onderdelen: [{ product_id: 'p-chutney', hoeveelheid: 1, eenheid: 'stuk' }] }),
        ], afdeling);
        expect(Object.fromEntries(uit.map((a) => [a.sleutel, a.afdeling]))).toEqual({ 'a-pakket': 'Pakketten', 'open:vlees': 'Open prijs', 'a-los': 'Zonder afdeling' });
    });
    it('sorteert op omzet, grootste eerst', () => {
        const uit = verkoopPerArtikel([regel({}), regel({ regel_id: 2, artikel_id: 'a-bier', naam: 'Blond', bedrag_cents: 2000, btw: [{ pct: 21, incl_cents: 2000 }] })], afdeling);
        expect(uit.map((a) => a.sleutel)).toEqual(['a-bier', 'a-worst']);
    });
});

describe('periodeMarge', () => {
    it('rekent alleen met artikelen die een marge hebben en zegt hoeveel omzet dat dekt', () => {
        const m = periodeMarge([
            { sleutel: 'a', naam: 'A', afdeling: 'x', aantal: 1, omzet_excl_cents: 9000, inkoop_cents: 5220, marge_cents: 3780, marge_pct: 42, geschat: false },
            { sleutel: 'b', naam: 'B', afdeling: 'x', aantal: 1, omzet_excl_cents: 1000, inkoop_cents: null, marge_cents: null, marge_pct: null, geschat: false },
        ]);
        expect(m).toEqual({ omzet_cents: 10000, inkoop_cents: 5220, marge_cents: 3780, marge_pct: 42, dekking_pct: 90, zonder_inkoopprijs: 1, geschat: 0 });
    });
    it('zonder omzet: geen percentage', () => {
        expect(periodeMarge([])).toMatchObject({ omzet_cents: 0, marge_pct: null, dekking_pct: null });
    });
});
```

- [ ] **Step 2: Draai en zie falen** — Run: `npx vitest run src/lib/winkelboek/verkoop.test.ts` — Expected: FAIL, module niet gevonden.

- [ ] **Step 3: Implementeer `verkoop.ts`** volgens R3 en de vier stappen hierboven. `exclUitIncl(incl, pct) = incl − Math.round(incl × pct / (100 + pct))`. Omzet excl. per artikel: eerst per tarief de `incl_cents` van alle regels optellen, dan één keer omrekenen.

- [ ] **Step 4: Draai en zie slagen** — Expected: PASS (17 tests).

- [ ] **Step 5: Commit** — `git commit -m "Boekhouding winkel: verkoop per artikel met inkoopwaarde"`

---

### Task 6: Laden en het tabblad Overzicht

**Files:**
- Create: `src/lib/winkelboek/laden.ts`
- Test: `src/lib/winkelboek/laden.test.ts`
- Create: `src/app/winkelboek/_components/PeriodeKiezer.tsx`, `src/app/winkelboek/_components/DagHokjes.tsx`, `src/app/winkelboek/_lib/lid.ts`
- Modify: `src/app/winkelboek/page.tsx`

**Interfaces:**
- Consumes: `periodeVan` (taak 2), `maakDagboeking`, `BonMin`, `DagstaatKort` (taak 3), `maakKasboek`, `KasMutatie` (taak 4), `inkoopVanRegel`, `verkoopPerArtikel`, `periodeMarge`, `VerkoopRegel` (taak 5), `laadToonbank` en `nlDatum` uit `src/lib/btwAangifteBronnen.ts`.
- Produces in `laden.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js';
/** Postgres/PostgREST-codes voor "tabel of kolom bestaat nog niet". */
export function isNogNiet(fout: { code?: string } | null | undefined): boolean;   // 42703, 42P01, PGRST200, PGRST204, PGRST205
export function zonderProefdagen<T extends { bedrijfsdag: string }>(rijen: readonly T[], uitgesloten: ReadonlySet<string>): T[];
export async function laadUitsluitingen(sb: SupabaseClient, orgId: string, start: string, eind: string): Promise<Set<string>>;
export async function laadDagBonnen(sb: SupabaseClient, orgId: string, start: string, eind: string): Promise<{ bonnen: (BonMin & { bedrijfsdag: string })[]; fout: string | null }>;
export async function laadDagstaten(sb: SupabaseClient, orgId: string, start: string, eind: string): Promise<{ dagstaten: DagstaatKort[]; fout: string | null }>;
export async function laadKasMutaties(sb: SupabaseClient, orgId: string, start: string, eind: string): Promise<{ mutaties: KasMutatie[]; beschikbaar: boolean }>;
export async function laadVerkoopRegels(sb: SupabaseClient, orgId: string, start: string, eind: string, uitgesloten: ReadonlySet<string>): Promise<{ regels: VerkoopRegel[]; fout: string | null }>;
export async function laadAfdelingVanProduct(sb: SupabaseClient): Promise<Map<string, string>>;
```

- Produces in `_lib/lid.ts`: `winkelboekLid(): Promise<{ supabase: SupabaseClient; orgId: string | null }>` (zelfde opzet als `src/app/verkoop/toonbank/_lib/lid.ts`, zonder `isAdmin`).
- Produces: `PeriodeKiezer({ periode, basis }: { periode: Periode; basis: string })` (servercomponent) en `DagHokjes({ dag }: { dag: Dagboeking })`.

- [ ] **Step 1: Schrijf de falende tests** in `laden.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { isNogNiet, zonderProefdagen } from './laden';

describe('isNogNiet', () => {
    it('herkent een tabel of kolom die er nog niet is', () => {
        for (const code of ['42P01', '42703', 'PGRST200', 'PGRST204', 'PGRST205']) expect(isNogNiet({ code })).toBe(true);
    });
    it('een andere fout of geen fout is het niet', () => {
        expect(isNogNiet({ code: '42501' })).toBe(false);
        expect(isNogNiet(null)).toBe(false);
        expect(isNogNiet({})).toBe(false);
    });
});

describe('zonderProefdagen', () => {
    it('laat rijen van uitgesloten dagen weg', () => {
        const rijen = [{ bedrijfsdag: '2026-10-27', x: 1 }, { bedrijfsdag: '2026-11-21', x: 2 }];
        expect(zonderProefdagen(rijen, new Set(['2026-10-27']))).toEqual([{ bedrijfsdag: '2026-11-21', x: 2 }]);
        expect(zonderProefdagen(rijen, new Set())).toHaveLength(2);
    });
});
```

- [ ] **Step 2: Draai en zie falen** — Run: `npx vitest run src/lib/winkelboek/laden.test.ts` — Expected: FAIL, module niet gevonden.

- [ ] **Step 3: Implementeer `laden.ts`.** Alle functies filteren op `organization_id = orgId` en op `bedrijfsdag` tussen `start` en `eind`.
  - Eén lokale hulpfunctie die met `.range()` per 1000 rijen doorbladert tot een pagina niet vol is; alle laders hieronder gebruiken hem.
  - `laadDagBonnen`: `toonbank_bonnen`, kolommen `status, dagstaat_id, bedrijfsdag, totaal_cents, afronding_cents, btw, statiegeld_cents, order_rest_cents, pin_cents, contant_cents, cadeaubon_cents`, gesorteerd op `id`; bestaat `cadeaubon_cents` nog niet (`isNogNiet`), opnieuw zonder die kolom en 0 invullen.
  - `laadDagstaten`: `toonbank_dagstaten`, de kolommen van `DagstaatKort` (ook `id` en `apparaat_id`).
  - `laadKasMutaties`: `winkel_kas_mutaties`; bij `isNogNiet` → `{ mutaties: [], beschikbaar: false }`.
  - `laadVerkoopRegels`: `toonbank_bon_regels` (`id, artikel_id, naam, open_prijs_groep, aantal, bedrag_cents, btw, onderdelen, goederen_terug`) met `toonbank_bonnen!inner(bedrijfsdag, gebeurd_at, status)`, `soort = 'verkoop'`, bon `status = 'afgerond'`, gesorteerd op `id`; daarna de mutaties (`winkel_voorraad_mutaties`: `toonbank_bon_regel_id, winkel_product_id, type, waarde_cents`) voor die regel-id's in stukken van 200 met `.in()`, elk stuk doorgebladerd (een pakket geeft meer dan één mutatie per regel); en `winkel_producten` (`id, inkoop_excl_cents, prijs_per`); per regel `inkoopVanRegel`. Proefdagen eruit met `zonderProefdagen`.
  - `laadAfdelingVanProduct`: `winkel_plaatsingen` (`rol = 'verkoop'`) met `opslag_locaties`; alleen locaties die een afdeling van de winkel zijn, zoals `laadWinkelOverzicht` in `src/lib/winkel/winkelOverzicht.ts` dat bepaalt (kind van de ruimte met `WINKEL_RUIMTE.code`). Bij `isNogNiet`: lege map.

- [ ] **Step 4: Draai en zie slagen** — Expected: PASS (3 tests).

- [ ] **Step 5: Bouw `PeriodeKiezer`.** Servercomponent, alleen `Link`s: vorige (`${basis}?p=${periode.vorige}`), het label, volgende, en een wissel "Week" / "Maand" (`weekSleutel`, `maandSleutel`). Stijl met `btn btn-ghost btn-icon` voor de pijlen (`ChevronLeft`, `ChevronRight`, met `aria-label` "Vorige periode" en "Volgende periode") en `kf-chip` voor de wissel, zoals `/winkel` chips gebruikt.

- [ ] **Step 6: Bouw `DagHokjes`.** Links "Zo kwam het binnen" (pin, contant, cadeaubon, totaal), rechts "Zo is het geboekt" (één vakje per `Hokje`: label, bedrag in `var(--font-mono)`, uitleg), onderaan het totaal met "Gelijk aan wat er binnenkwam" als `dag.sluit`, anders het verschil in `var(--status-warning-text)`. Indeling zoals het schermontwerp; op telefoonbreedte onder elkaar.

- [ ] **Step 7: Bouw het Overzicht** in `src/app/winkelboek/page.tsx` (servercomponent, `searchParams: Promise<{ p?: string }>`):
  1. `winkelboekLid()`; zonder organisatie de tekst "Je bent geen lid van een organisatie."
  2. `periodeVan(p, datumNL(new Date()))` (`datumNL` uit `src/lib/winkel/afdelingen.ts`).
  3. Parallel: `laadUitsluitingen`, `laadDagBonnen`, `laadDagstaten`, `laadKasMutaties`, `laadToonbank`, `laadVerkoopRegels`, `laadAfdelingVanProduct`.
  4. De laatste dag in de periode met bonnen of een dagstaat (proefdagen overgeslagen) → `maakDagboeking`.
  5. Drie vakjes "Kas", "Pin", "Afgeroomd": kas uit `maakKasboek(...)` (`in_de_la_cents`, en het onverklaarde verschil van de laatste dag), pin uit de dagstaten van de laatste dag (`pin_toonbank_cents`, `pin_verschil_cents`), afgeroomd = `afgeroomd_cents` van de periode. Groen (`status-surface-success`) alleen bij verschil 0 én een dagstaat; anders `status-surface-warning` met het bedrag; zonder dagstaat `status-surface-neutral` met "Nog niet afgesloten".
  6. `Panel` "Laatste dagafsluiting · <dag>" met `DagHokjes`, de regel "Dit deed het systeem toen je de kassa sloot" (vijf vinkjes, alleen bij stand `geboekt`) en de link "Bekijk de dag →" naar `/winkelboek/dag/<datum>`.
  7. Vijf `KpiTegel`s voor de periode. Let op: `laadToonbank` geeft **euro's als kommagetal**, niet centen, en `dagen` bevat ook proefdagen (vlag `uitgesloten`): filter op `!d.uitgesloten` en reken om met `Math.round(x * 100)`. Omzet excl. btw (onder het getal "<n> bonnen · gemiddeld <bedrag incl. btw>", uit `dagen`: `orders`, `omzet + btw`) en Btw af te dragen (som van `laadToonbank(...).regels`), Inkoopwaarde en Marge (`periodeMarge(verkoopPerArtikel(...))`; `soort: 'onbepaald'` met reden "Nog geen inkoopprijzen" als `dekking_pct` 0 of `null` is; onder de marge "<pct>% · over <dekking>% van de omzet"), Derving (som van `|waarde_cents|` van mutaties met `type = 'afwijking'` en `reden` `derving_breuk` of `derving_tht` in de periode; zonder zulke mutaties `soort: 'leeg'`).
  8. `Panel` "Omzet per dag": een eigen servercomponent `_components/DagBalken.tsx` met gewone `div`s (één kolom per dag: bedrag in `var(--font-mono)`, een balk met `height` in procenten van de hoogste dag en `background: color-mix(in srgb, var(--brand) 55%, transparent)`, de laatste dag `var(--brand-hover)`, daaronder "za 28"). Niet `BarChartVertical`: die plakt een hex-alfa achter de kleur en werkt dus niet met een variabele. Gevoed uit `laadToonbank(...).dagen` zonder proefdagen.
  9. `Panel` "Om naar te kijken": `dagboeking.punten`, `kasboek.punten`, en bij `zonder_inkoopprijs > 0` "<n> artikelen zonder inkoopprijs" met link naar `/winkelboek/verkoop`. Elk punt is een `wk-rij wk-taak` met een link naar waar je het oplost (kas- of pinverschil → `/verkoop/toonbank/dagstaten`). Geen punten: "Niets om naar te kijken."
  10. Knop "Maandstaat downloaden": een `<a className="btn btn-brand">` naar `/api/boekhouder/maandstaat?jaar=<j>&maand=<m>&pdf=1` voor de maand van `periode.start`.
  11. Geeft `laadToonbank` of een andere lader een `fout`, toon `PanelError` met die tekst; nooit stil nul.

- [ ] **Step 8: Controleer in de app.** Start de dev-server en open `/winkelboek`. Zonder kassadagen moet de lege staat verschijnen, zonder foutmelding in de serverlog. Lukt inloggen in de preview niet, meld dat in het eindverslag en controleer met `npx tsc --noEmit` en `npm run lint`.

- [ ] **Step 9: Commit** — `git add src/lib/winkelboek/laden.ts src/lib/winkelboek/laden.test.ts src/app/winkelboek && git commit -m "Boekhouding winkel: tabblad Overzicht met de dag in hokjes"`

---

### Task 7: De dagpagina (ook het telefoonscherm "Dag geboekt")

**Files:**
- Create: `src/app/winkelboek/dag/[datum]/page.tsx`

**Interfaces:**
- Consumes: `winkelboekLid`, `laadDagBonnen`, `laadDagstaten`, `laadKasMutaties`, `laadUitsluitingen` (taak 6), `maakDagboeking`, `maakKasboek`, `DagHokjes`.

- [ ] **Step 1: Bouw de pagina.** `params: Promise<{ datum: string }>`; een datum die niet `^\d{4}-\d{2}-\d{2}$` is of niet bestaat → `notFound()`. Inhoud, één kolom, maximaal 560px breed, gecentreerd:
  - Kop per stand: `geboekt` → groot vinkje (`CheckCircle2`, `var(--status-success-text)`), "Dag geboekt", "Alles klopt, je hoeft niets te doen". `te_controleren` → `AlertTriangle` in `var(--status-warning-text)`, "Dag afgesloten", daaronder elk punt uit `dag.punten`. `open` → "De kassa is nog niet afgesloten". `geen_verkoop` → `EmptyState` "Geen verkoop op deze dag." Een proefdag → "Deze dag telt niet mee (proefdag)."
  - Onder de kop: de datum voluit en "kassa gesloten om <tijd>" (tijd in `Europe/Amsterdam`).
  - `DagHokjes`.
  - `Panel` "In de la": in de la na de dag (`contant_geteld − afgeroomd`), "Geteld gelijk aan verwacht" of het verschil, "Afgeroomd € x".
  - Knoppen: "Bekijk de bonnen" (`Link` met `btn btn-brand btn-touch` naar `/verkoop/toonbank?datum=<datum>`) en "Naar Boekhouding winkel →" (`/winkelboek`).

- [ ] **Step 2: Controleer.** `npx tsc --noEmit && npm run lint && npm test`. Open `/winkelboek/dag/2026-11-28` (lege staat) en `/winkelboek/dag/onzin` (404).

- [ ] **Step 3: Commit** — `git commit -m "Boekhouding winkel: dagpagina"`

---

### Task 8: Tabblad Kasboek met eigen regels

**Files:**
- Create: `src/lib/winkelboek/kasInvoer.ts`
- Test: `src/lib/winkelboek/kasInvoer.test.ts`
- Create: `src/app/winkelboek/actions.ts`, `src/app/winkelboek/kasboek/page.tsx`, `src/app/winkelboek/_components/KasRegelLade.tsx`

**Interfaces:**
- Consumes: `maakKasboek`, `KasReden` (taak 4), laders (taak 6), `PeriodeKiezer`.
- Produces:

```ts
// kasInvoer.ts
/** '9' → 900, '9,5' → 950, '1.250,00' → 125000, '1.250' → 125000. Leeg, nul, negatief of geen getal → null.
 *  Een punt gevolgd door één of twee cijfers aan het eind ('9.50') → null: bij kasgeld gokken we niet of dat
 *  € 9,50 of € 950 is. Een punt mag alleen als duizendtal, dus met precies drie cijfers erachter. */
export function centenUitInvoer(tekst: string): number | null;
export const KasRegelSchema: z.ZodType<{ datum: string; richting: 'uit' | 'in'; bedrag: string; reden: KasReden; omschrijving: string; moment: KasMoment }>;
// actions.ts
export async function voegKasRegelToe(invoer: unknown): Promise<{ data: { id: string } } | { error: string }>;
export async function verwijderKasRegel(id: string): Promise<{ data: true } | { error: string }>;
```

- [ ] **Step 1: Schrijf de falende tests**

```ts
import { describe, expect, it } from 'vitest';
import { centenUitInvoer, KasRegelSchema } from './kasInvoer';

describe('centenUitInvoer', () => {
    it('leest bedragen in Nederlandse notatie', () => {
        expect(centenUitInvoer('9')).toBe(900);
        expect(centenUitInvoer('9,5')).toBe(950);
        expect(centenUitInvoer(' € 12,34 ')).toBe(1234);
        expect(centenUitInvoer('1.250,00')).toBe(125000);
        expect(centenUitInvoer('1.250')).toBe(125000);
    });
    it('weigert leeg, nul, negatief, onzin en meer dan twee decimalen', () => {
        for (const t of ['', '0', '0,00', '-3', 'abc', '1,234', '12,3,4']) expect(centenUitInvoer(t)).toBeNull();
    });
    it('gokt niet bij een punt als decimaalteken', () => {
        for (const t of ['9.50', '9.5', '12.3,4']) expect(centenUitInvoer(t)).toBeNull();
    });
});

describe('KasRegelSchema', () => {
    const goed = { datum: '2026-11-27', richting: 'uit', bedrag: '9,00', reden: 'uitgave', omschrijving: 'Schoonmaakmiddel', moment: 'tijdens' };
    it('keurt een gewone regel goed', () => {
        expect(KasRegelSchema.safeParse(goed).success).toBe(true);
    });
    it('weigert een kapotte datum, een leeg bedrag en een te korte omschrijving', () => {
        expect(KasRegelSchema.safeParse({ ...goed, datum: '27-11-2026' }).success).toBe(false);
        expect(KasRegelSchema.safeParse({ ...goed, bedrag: '0' }).success).toBe(false);
        expect(KasRegelSchema.safeParse({ ...goed, omschrijving: 'x' }).success).toBe(false);
        expect(KasRegelSchema.safeParse({ ...goed, reden: 'anders' }).success).toBe(false);
        expect(KasRegelSchema.safeParse({ ...goed, moment: 'later' }).success).toBe(false);
    });
});
```

- [ ] **Step 2: Draai en zie falen** — Run: `npx vitest run src/lib/winkelboek/kasInvoer.test.ts` — Expected: FAIL, module niet gevonden.

- [ ] **Step 3: Implementeer `kasInvoer.ts`.** Omschrijving 2 tot 200 tekens na `trim`. De datum mag niet in de toekomst liggen; die controle zit in de actie (die kent "vandaag"), niet in het schema.

- [ ] **Step 4: Draai en zie slagen** — Expected: PASS (5 tests).

- [ ] **Step 5: Schrijf de acties** in `src/app/winkelboek/actions.ts` (`'use server'`), met `ingelogdMetOrg()` zoals in `src/app/winkel/actions.ts`.
  - `voegKasRegelToe`: schema, datum niet na vandaag (`datumNL`), is de maand afgesloten (`maand_afsluitingen` voor dat jaar en die maand) → `{ error: 'Deze maand is afgesloten. Heropen hem eerst onder Geld → Boekhouder.' }`. `bedrag_cents` = `centenUitInvoer`, negatief bij richting `uit`. Insert met expliciete `organization_id`. Bestaat de tabel niet (`isNogNiet`) → `{ error: 'Eigen kasregels zijn nog niet ingeschakeld.' }`. Daarna `revalidatePath('/winkelboek', 'layout')`.
  - `verwijderKasRegel`: zelfde afsluitcontrole op de datum van de regel, dan delete op `id` én `organization_id`.

- [ ] **Step 6: Bouw `KasRegelLade`** (clientcomponent) met `SlideOverPanel` (`width="sm"`, titel "Geld uit of in de la"): keuze "Uit de la" / "In de la" (`<select>`), bedrag (onder het veld "Gebruik een komma voor centen"), datum (standaard vandaag), wanneer (`<select>`: "Tijdens de dag, de kassa was open" = `tijdens`, standaard; "Vóór het openen" = `voor_openen`; eronder "Na het tellen? Kies de dag erna en 'Vóór het openen'."), reden (Uitgave, Privé, Wisselgeld, Overig), omschrijving; onderaan `Button` "Opslaan" (met `loading`) en `Button variant="ghost"` "Annuleren". Velden met de `field`-klassen. Fout van de actie boven de knoppen. De knop die de lade opent is een `Button` met `Plus`; hij is uitgeschakeld met de uitleg "Nog niet ingeschakeld" als `beschikbaar` onwaar is.

- [ ] **Step 7: Bouw `/winkelboek/kasboek/page.tsx`.** Standaard de lopende maand (`periodeVan(p ?? maandsleutel van vandaag, …)`). Bovenaan drie `KpiTegel`s: "In de la nu", "Afgeroomd deze periode", "Kasverschil deze periode" (`soort: 'leeg'` zonder dagstaten). Daaronder de zin "Elke regel komt uit de dagafsluiting van de kassa. Alleen geld dat je zelf uit of in de la doet, voer je hier in." met rechts de knop. Dan de lijst (`wk-lijst` / `wk-rij`), nieuwste boven: datum (alleen op de eerste regel van een dag), wat, erbij, eraf, in de la, bron ("Automatisch" of "Zelf ingevoerd"). Een kasverschil zonder goedkeuring krijgt de link "Goedkeuren" naar `/verkoop/toonbank/dagstaten`. Een eigen regel krijgt een verwijderknop (`Button variant="ghost" size="icon"`, `Trash2`, `aria-label="Verwijder deze regel"`). Op telefoon schuift de lijst zijwaarts in een kader.

- [ ] **Step 8: Controleer.** `npm test && npx tsc --noEmit && npm run lint`. Open `/winkelboek/kasboek`: lege staat, knop uitgeschakeld zolang de tabel er niet is.

- [ ] **Step 9: Commit** — `git commit -m "Boekhouding winkel: tabblad Kasboek met eigen regels"`

---

### Task 9: Tabblad Verkoop

**Files:**
- Modify: `src/lib/winkelboek/verkoop.ts`, `src/lib/winkelboek/verkoop.test.ts`
- Create: `src/app/winkelboek/verkoop/page.tsx`

**Interfaces:**
- Consumes: `laadVerkoopRegels`, `laadAfdelingVanProduct`, `laadUitsluitingen` (taak 6), `verkoopPerArtikel`, `periodeMarge`, `ArtikelCijfers` (taak 5), `PeriodeKiezer`.
- Produces: `filterArtikelen(artikelen: readonly ArtikelCijfers[], zoek: string | undefined, afdeling: string | undefined): ArtikelCijfers[]`.

Zoeken en filteren lopen via het adres (`?q=` en `?afdeling=`), zodat de pagina een servercomponent blijft en er geen `<button>` nodig is.

- [ ] **Step 1: Schrijf de falende test** in `verkoop.test.ts`

```ts
describe('filterArtikelen', () => {
    const a = (naam: string, afdeling: string): ArtikelCijfers => ({ sleutel: naam, naam, afdeling, aantal: 1, omzet_excl_cents: 100, inkoop_cents: null, marge_cents: null, marge_pct: null, geschat: false });
    const lijst = [a('Droge worst naturel', 'Worst'), a('Fuet met truffel', 'Worst'), a('Naober Blond', 'Bier')];
    it('filtert op afdeling en op een stuk van de naam, zonder op hoofdletters te letten', () => {
        expect(filterArtikelen(lijst, undefined, 'Worst').map((x) => x.naam)).toEqual(['Droge worst naturel', 'Fuet met truffel']);
        expect(filterArtikelen(lijst, 'WORST', undefined).map((x) => x.naam)).toEqual(['Droge worst naturel']);
        expect(filterArtikelen(lijst, ' blond ', 'Bier')).toHaveLength(1);
        expect(filterArtikelen(lijst, 'blond', 'Worst')).toEqual([]);
    });
    it('zonder zoekwoord en zonder afdeling, of met "Alles": de hele lijst', () => {
        expect(filterArtikelen(lijst, undefined, undefined)).toHaveLength(3);
        expect(filterArtikelen(lijst, '', 'Alles')).toHaveLength(3);
    });
});
```

- [ ] **Step 2: Draai en zie falen, implementeer, draai en zie slagen** — Run: `npx vitest run src/lib/winkelboek/verkoop.test.ts` — Expected na implementatie: PASS (19 tests).

- [ ] **Step 3: Bouw de pagina** (`searchParams: Promise<{ p?: string; q?: string; afdeling?: string }>`). Boven de lijst `PeriodeKiezer`. Daaronder een `<form method="get">` met een zoekveld (`wk-zoek`, `<input type="search" name="q" className="kf-input" placeholder="Zoek een artikel…">`, met de huidige `p` en `afdeling` als verborgen velden; Enter verstuurt) en de afdelingen als `Link`s met `kf-chip` in `wk-keuzes` ("Alles" plus elke afdeling die in de periode voorkomt; de gekozen krijgt `aria-current="true"`; elke link houdt `p` en `q` vast). Lijst met inline `gridTemplateColumns`; kolommen: Artikel (naam, eronder de afdeling), Verkocht, Omzet excl., Inkoopwaarde, Marge, Marge in % (balk tot 60% plus het getal). Zonder marge: in de laatste kolom "Nog geen inkoopprijs" in `var(--status-warning-text)` en streepjes in Inkoopwaarde en Marge. `geschat`: achter de marge het woord "geschat" in `var(--muted)`. Onder de lijst: "<n> artikelen verkocht · <omzet> omzet excl. btw", bij `geschat > 0` "<n> artikelen gerekend met de inkoopprijs van nu", en "Het totaal kan enkele centen afwijken van de btw-aangifte door afronding per bon." Geen verkoop in de periode: `EmptyState` "Nog niets verkocht in deze periode." Wel verkoop maar niets gevonden: "Geen artikel gevonden."

- [ ] **Step 4: Controleer** — `npm test && npx tsc --noEmit && npm run lint`; open `/winkelboek/verkoop`.

- [ ] **Step 5: Commit** — `git commit -m "Boekhouding winkel: tabblad Verkoop"`

---

### Task 10: Tabblad Inkoop (R4)

**Files:**
- Create: `src/lib/winkelboek/inkoop.ts`
- Test: `src/lib/winkelboek/inkoop.test.ts`
- Modify: `src/lib/winkelboek/laden.ts` (twee laders erbij)
- Create: `src/app/winkelboek/inkoop/page.tsx`

**Interfaces:**
- Produces:

```ts
export interface Ontvangst { datum: string; product_id: string; product_naam: string; btw_pct: number; waarde_cents: number | null; leverancier_id: number | null; leverancier: string | null }
export interface InkoopBon { id: number; datum: string; leverancier_id: number | null; netto_cents: number | null }
export type BonStand = { soort: 'gevonden'; id: number; netto_cents: number | null } | { soort: 'meerdere'; aantal: number } | { soort: 'ontbreekt' };
export interface Levering {
    datum: string; leverancier_id: number | null; leverancier: string;
    producten: number; wat: string;                 // 'Worst, Fuet en 2 andere'
    bedrag_cents: number | null;
    /** Geschat: waarde × het btw-tarief van het product. De echte voorbelasting staat op de bon. */
    btw_geschat_cents: number | null;
    bon: BonStand;
}
export function maakLeveringen(ontvangsten: readonly Ontvangst[], bonnen: readonly InkoopBon[]): Levering[];   // nieuwste eerst
// laden.ts
export async function laadOntvangsten(sb: SupabaseClient, orgId: string, start: string, eind: string): Promise<Ontvangst[]>;
export async function laadInkoopBonnen(sb: SupabaseClient, orgId: string, start: string, eind: string): Promise<InkoopBon[]>;   // start − 1 dag t/m eind + 7 dagen
```

- [ ] **Step 1: Schrijf de falende tests**

```ts
import { describe, expect, it } from 'vitest';
import { maakLeveringen, type InkoopBon, type Ontvangst } from './inkoop';

const o = (x: Partial<Ontvangst>): Ontvangst => ({ datum: '2026-11-26', product_id: 'p1', product_naam: 'Worst', btw_pct: 9, waarde_cents: 20000, leverancier_id: 7, leverancier: 'Slagerij', ...x });
const bon = (x: Partial<InkoopBon>): InkoopBon => ({ id: 1, datum: '2026-11-27', leverancier_id: 7, netto_cents: 31850, ...x });

describe('maakLeveringen', () => {
    it('groepeert op dag en leverancier en telt bedrag en btw', () => {
        const [l] = maakLeveringen([o({}), o({ product_id: 'p2', product_naam: 'Fuet', waarde_cents: 11850 })], [bon({})]);
        expect(l).toEqual({ datum: '2026-11-26', leverancier_id: 7, leverancier: 'Slagerij', producten: 2, wat: 'Worst en Fuet',
            bedrag_cents: 31850, btw_geschat_cents: 2867, bon: { soort: 'gevonden', id: 1, netto_cents: 31850 } });
    });
    it('schat de btw per regel met het tarief van het product', () => {
        const [l] = maakLeveringen([o({ waarde_cents: 41280, btw_pct: 21 })], []);
        expect(l).toMatchObject({ btw_geschat_cents: 8669, bon: { soort: 'ontbreekt' } });
    });
    it('één regel zonder waarde maakt het bedrag van de levering onbekend', () => {
        expect(maakLeveringen([o({}), o({ product_id: 'p2', waarde_cents: null })], [])[0]).toMatchObject({ bedrag_cents: null, btw_geschat_cents: null });
    });
    it('zoekt de bon van één dag ervoor tot zeven dagen erna, bij dezelfde leverancier', () => {
        expect(maakLeveringen([o({})], [bon({ datum: '2026-11-25' })])[0].bon.soort).toBe('gevonden');
        expect(maakLeveringen([o({})], [bon({ datum: '2026-12-03' })])[0].bon.soort).toBe('gevonden');
        expect(maakLeveringen([o({})], [bon({ datum: '2026-12-04' })])[0].bon.soort).toBe('ontbreekt');
        expect(maakLeveringen([o({})], [bon({ datum: '2026-11-24' })])[0].bon.soort).toBe('ontbreekt');
        expect(maakLeveringen([o({})], [bon({ leverancier_id: 8 })])[0].bon.soort).toBe('ontbreekt');
        expect(maakLeveringen([o({})], [bon({}), bon({ id: 2 })])[0].bon).toEqual({ soort: 'meerdere', aantal: 2 });
    });
    it('zonder leverancier: "Onbekend" en nooit een bon', () => {
        expect(maakLeveringen([o({ leverancier_id: null, leverancier: null })], [bon({ leverancier_id: null })])[0]).toMatchObject({ leverancier: 'Onbekend', bon: { soort: 'ontbreekt' } });
    });
    it('vat lange leveringen samen en zet de nieuwste bovenaan', () => {
        const uit = maakLeveringen([
            o({ datum: '2026-11-24' }),
            o({ product_id: 'a', product_naam: 'Noten' }), o({ product_id: 'b', product_naam: 'Crackers' }),
            o({ product_id: 'c', product_naam: 'Saus' }), o({ product_id: 'd', product_naam: 'Chutney' }),
        ], []);
        expect(uit.map((l) => l.datum)).toEqual(['2026-11-26', '2026-11-24']);
        expect(uit[0].wat).toBe('Noten, Crackers en 2 andere');
    });
});
```

- [ ] **Step 2: Draai en zie falen** — Run: `npx vitest run src/lib/winkelboek/inkoop.test.ts` — Expected: FAIL, module niet gevonden.

- [ ] **Step 3: Implementeer `maakLeveringen`** volgens R4. Meerdere mutaties van hetzelfde product in één levering tellen als één product. `wat`: één naam; twee met "en"; meer dan twee: de eerste twee, dan "en <n> andere".

- [ ] **Step 4: Draai en zie slagen** — Expected: PASS (6 tests).

- [ ] **Step 5: Voeg de laders toe.** `laadOntvangsten`: `winkel_voorraad_mutaties` met `type = 'ontvangst'`, tijd = `COALESCE(gebeurd_at, created_at)` binnen de periode (in Nederlandse tijd via `nlDatum`), met `winkel_producten(naam, btw_pct, leverancier_id, leveranciers(naam))`. `laadInkoopBonnen`: `bonnen` (`id, datum, leverancier_id, netto_bedrag`), `netto_cents = Math.round(netto_bedrag × 100)` of `null`.

- [ ] **Step 6: Bouw de pagina.** Vier `KpiTegel`s: "Ingekocht deze periode" (som van de bekende bedragen; staat er een onbekende tussen, dan onder het getal "<n> leveringen zonder bedrag"), "Leveringen zonder bon" (het aantal met `bon.soort === 'ontbreekt'`; `alarm` als het groter dan nul is), "Voorraadwaarde nu" (som van `voorraad × inkoop_excl_cents ÷ prijs_per` over actieve producten met beide bekend; onder het getal "<n> producten zonder inkoopprijs of telling" als dat er zijn), "Inkoop tegenover omzet" (ingekocht ÷ omzet excl. uit `laadToonbank`, omgerekend naar centen; `onbepaald` zonder omzet). Geen tegel "Voorbelasting": de echte voorbelasting komt van de bonnen en staat in de btw-aangifte. Lijst: datum, leverancier (link naar `/leveranciers/<id>/winkel`; "Onbekend" zonder link), wat kwam binnen, bedrag excl., "Btw, geschat", bon. Bon gevonden → vinkje, "Bon gevonden" en het bedrag van de bon, link naar `/archief`; meerdere → "<n> bonnen, kies de juiste" met link naar `/archief`; ontbreekt → link "Bon scannen" naar `/bonnen`. Onderaan: "Boek je een ontvangst in Assortiment of sticker je een levering, dan staat hij hier vanzelf, op de dag van inboeken. De btw is geschat met het tarief van het product; het echte bedrag staat op de bon."

- [ ] **Step 7: Controleer en commit** — `npm test && npx tsc --noEmit && npm run lint`; `git commit -m "Boekhouding winkel: tabblad Inkoop"`

---

### Task 11: Tabblad Hardlopers (R5)

**Files:**
- Create: `src/lib/winkelboek/lopers.ts`
- Test: `src/lib/winkelboek/lopers.test.ts`
- Modify: `src/lib/winkelboek/laden.ts` (één lader erbij)
- Create: `src/app/winkelboek/lopers/page.tsx`

**Interfaces:**
- Consumes: `VerkoopRegel` (taak 5), `productVanRegel` uit `src/lib/winkel/afdelingen.ts`.
- Produces:

```ts
export const LOPER_VENSTER_DAGEN = 28;
export const KRAP_DAGEN = 3;
export interface LoperInvoer {
    product_id: string; naam: string; afdeling: string; eenheid: 'stuk' | 'gram';
    voorraad: number | null; voorraad_waarde_cents: number | null; tht: string | null;
    verkocht: number; omzet_cents: number; marge_cents: number | null;
}
export type LoperGroep = 'hard' | 'midden' | 'traag' | 'stil';
export type LoperActie = 'bijbestellen' | 'afprijzen' | 'uit_assortiment';
export interface Loper extends LoperInvoer { groep: LoperGroep; dagen_voorraad: number | null; krap: boolean; actie: LoperActie | null }
export interface LoperDagen {
    verkoopdagen: number;   // verschillende bedrijfsdagen met verkoop in het venster; de deler voor "genoeg voor"
    dagen_open: number;     // kalenderdagen sinds de eerste verkoopdag ooit, vandaag meegeteld; 0 zonder verkoop
}
export interface Lopers {
    voorlopig: boolean;                          // dagen_open < 28
    verkoopdagen: number; dagen_open: number;
    lijst: Loper[];                              // per groep aflopend op omzet; stil aflopend op voorraadwaarde
    aantallen: Record<LoperGroep, number>;
    stil_waarde_cents: number | null;            // null zodra één stilliggend product geen waarde heeft
}
export function deelLopersIn(producten: readonly LoperInvoer[], dagen: LoperDagen): Lopers;
/** Telt per product verkocht, omzet (incl.) en marge uit regels met precies één product. */
export function cijfersPerProduct(regels: readonly VerkoopRegel[]): Map<string, { verkocht: number; omzet_cents: number; marge_cents: number | null }>;
// laden.ts
export async function laadLoperInvoer(sb: SupabaseClient, orgId: string, nu: Date): Promise<{ producten: LoperInvoer[]; dagen: LoperDagen; fout: string | null }>;
```

Een product zonder verkoop en zonder voorraad (nul, of nog niet geteld) staat in geen enkele groep: er valt niets mee te doen.

- [ ] **Step 1: Schrijf de falende tests**

```ts
import { describe, expect, it } from 'vitest';
import { deelLopersIn, type LoperInvoer } from './lopers';

const p = (id: string, omzet: number, x: Partial<LoperInvoer> = {}): LoperInvoer => ({
    product_id: id, naam: id, afdeling: 'x', eenheid: 'stuk', voorraad: 100, voorraad_waarde_cents: 10000, tht: null,
    verkocht: omzet > 0 ? 10 : 0, omzet_cents: omzet, marge_cents: null, ...x,
});
const tien = [400, 300, 200, 50, 30, 10, 5, 3, 1, 1].map((o, i) => p(`p${i}`, o * 100));
const lang = { verkoopdagen: 24, dagen_open: 40 };
const kort = { verkoopdagen: 5, dagen_open: 7 };

describe('deelLopersIn', () => {
    it('verdeelt op opgeteld omzetaandeel: tot 80% hardloper, tot 95% middenmoot, daarna traag', () => {
        const l = deelLopersIn(tien, lang);
        expect(l.aantallen).toEqual({ hard: 3, midden: 1, traag: 6, stil: 0 });
        expect(l.lijst.filter((x) => x.groep === 'hard').map((x) => x.product_id)).toEqual(['p0', 'p1', 'p2']);
        expect(l.voorlopig).toBe(false);
    });
    it('voorlopig zolang de winkel nog geen 28 dagen verkoopt, ook met sluitingsdagen', () => {
        expect(deelLopersIn(tien, kort)).toMatchObject({ voorlopig: true, verkoopdagen: 5, dagen_open: 7 });
        expect(deelLopersIn(tien, { verkoopdagen: 20, dagen_open: 28 }).voorlopig).toBe(false);
    });
    it('ligt stil: niets verkocht en wel voorraad; zonder verkoop en zonder voorraad valt een product weg', () => {
        const l = deelLopersIn([p('a', 1000), p('stil', 0, { voorraad: 6, voorraad_waarde_cents: 8100 }), p('leeg', 0, { voorraad: 0 }), p('ongeteld', 0, { voorraad: null })], lang);
        expect(l.aantallen.stil).toBe(1);
        expect(l.lijst.map((x) => x.product_id)).toEqual(['a', 'stil']);
        expect(l.stil_waarde_cents).toBe(8100);
        expect(l.lijst.find((x) => x.product_id === 'stil')?.actie).toBe('uit_assortiment');
    });
    it('rekent hoeveel dagen de voorraad nog reikt en wat krap is', () => {
        const l = deelLopersIn([p('worst', 40000, { verkocht: 74, voorraad: 30 }), p('kaas', 39000, { verkocht: 60, voorraad: 300 })], kort);
        expect(l.lijst[0]).toMatchObject({ product_id: 'worst', dagen_voorraad: 2, krap: true, actie: 'bijbestellen' });
        expect(l.lijst[1]).toMatchObject({ product_id: 'kaas', dagen_voorraad: 25, krap: false, actie: null });
    });
    it('een product op gewicht krijgt geen dagen: stuks en grammen zijn niet te vergelijken', () => {
        expect(deelLopersIn([p('kaas', 1000, { eenheid: 'gram', voorraad: 7100 })], kort).lijst[0]).toMatchObject({ dagen_voorraad: null, krap: false });
    });
    it('een trage loper krijgt "afprijzen"', () => {
        expect(deelLopersIn(tien, lang).lijst.find((x) => x.product_id === 'p9')).toMatchObject({ groep: 'traag', actie: 'afprijzen' });
    });
    it('één stilliggend product zonder waarde maakt het totaal onbekend', () => {
        expect(deelLopersIn([p('a', 0, { voorraad: 3, voorraad_waarde_cents: null }), p('b', 0, { voorraad: 2 })], lang).stil_waarde_cents).toBeNull();
    });
    it('zonder producten: alles nul', () => {
        expect(deelLopersIn([], { verkoopdagen: 0, dagen_open: 0 })).toEqual({ voorlopig: true, verkoopdagen: 0, dagen_open: 0, lijst: [], aantallen: { hard: 0, midden: 0, traag: 0, stil: 0 }, stil_waarde_cents: 0 });
    });
});
```

`dagen_voorraad` deelt door de verkoopdagen (dagen dat er echt verkocht is) en wordt naar beneden afgerond op hele dagen (`Math.floor`): 30 ÷ (74 ÷ 5) = 2,03 → 2; 300 ÷ (60 ÷ 5) = 25.

- [ ] **Step 2: Draai en zie falen** — Run: `npx vitest run src/lib/winkelboek/lopers.test.ts` — Expected: FAIL, module niet gevonden.

- [ ] **Step 3: Implementeer `lopers.ts`** volgens R5. Een product dat het opgetelde aandeel over de 80% tilt, is zelf nog hardloper (de grens geldt voor het aandeel vóór het product). `cijfersPerProduct`: alleen regels waarvoor `productVanRegel` één product geeft; marge = `exclUitIncl`-omzet min `inkoop_cents`, `null` zodra één regel van het product geen inkoopwaarde heeft. Voeg twee tests toe voor `cijfersPerProduct`: een pakketregel wordt overgeslagen; één regel zonder inkoopwaarde maakt de marge `null`.

- [ ] **Step 4: Draai en zie slagen** — Expected: PASS (10 tests).

- [ ] **Step 5: Voeg `laadLoperInvoer` toe.** Venster: de laatste 28 kalenderdagen, vandaag meegeteld (`vandaag − 27` t/m vandaag). Verkoopregels via `laadVerkoopRegels` (proefdagen eruit); `verkoopdagen` = aantal verschillende `bedrijfsdag` in die regels. `dagen_open`: de vroegste `bedrijfsdag` van een afgeronde bon in `toonbank_bonnen` die geen proefdag is (één rij, oplopend gesorteerd, proefdagen overgeslagen) tot en met vandaag; 0 als er geen is. Producten: actieve `winkel_producten` die los te koop zijn (een actief `winkel_artikelen` met precies dit product als enige slot, zoals `losTeKoop` in `src/app/winkel/page.tsx`). `voorraad_waarde_cents = Math.round(voorraad × inkoop_excl_cents / prijs_per)` als beide bekend zijn, anders `null`.

- [ ] **Step 6: Bouw de pagina.** Bovenaan, alleen als `voorlopig`: `status-surface-info` met "De winkel verkoopt nu <dagen_open> dagen. Deze indeling is voorlopig en wordt betrouwbaar na 28 dagen." Dan drie keuzes als `Link` (`?groep=hard|traag|stil`, standaard `hard`), elk met het aantal, de naam en één zin: Hardlopers "Maken samen 80% van je omzet. Zorg dat ze er liggen."; Trage lopers "Verkopen wel, maar langzaam. Minder inkopen of afprijzen."; Ligt stil "Niets verkocht in 28 dagen. Samen <bedrag> aan inkoopwaarde." (zonder bedrag als `stil_waarde_cents` `null` is). De gekozen keuze heeft `aria-current="true"` en de rand in `var(--brand)`. Lijst: Artikel (naam, eronder afdeling en bij een THT binnen 14 dagen "over datum op <datum>"), Verkocht, Marge, Ligt er, Genoeg voor ("<n> dagen", bij krap in `var(--status-warning-text)`; bij stil "Nog niets verkocht"), Wat nu. Wat nu is een `Link` met `btn btn-ghost btn-sm`: Bijbestellen → `/winkel/bestellijst`; Afprijzen en Uit assortiment → `/voorraad/winkel?product=<id>` (controleer in `WinkelVoorraadClient.tsx` welke zoekparameter een product opent en gebruik die). Onderaan: "<midden> artikelen zitten daartussenin en lopen gewoon door." Geen producten: `EmptyState` "Nog geen verkoop om in te delen."

- [ ] **Step 7: Controleer en commit** — `npm test && npx tsc --noEmit && npm run lint`; `git commit -m "Boekhouding winkel: tabblad Hardlopers"`

---

### Task 12: Melding "Dag geboekt" (raakt de kassakoppeling: eigen wijziging, pas na akkoord)

**Files:**
- Create: `src/lib/winkelboek/dagMelding.ts`
- Test: `src/lib/winkelboek/dagMelding.test.ts`
- Modify: `src/lib/toonbank/naAfloop.ts` (nieuwe export `naDagstaat`)
- Modify: `src/app/api/toonbank/v1/dagstaten/route.ts`
- Modify: `src/app/api/toonbank/v1/afhalen-dagstaten.test.ts` en `src/app/api/toonbank/v1/bonnen.test.ts` (de mock van `naAfloop` krijgt `naDagstaat` erbij)
- Modify: `src/app/voorraad/winkel/actions.ts` (`BEL_TYPES`)

**Interfaces:**
- Consumes: `maakDagboeking`, `Dagboeking` (taak 3), `laadDagBonnen`, `laadDagstaten` (taak 6), `createServiceSupabase` uit `src/lib/supabase-server`.
- Produces:

```ts
// dagMelding.ts
/** Null bij stand `open` of `geen_verkoop`: dan komt er geen melding. */
export function dagMeldingTekst(d: Dagboeking): { title: string; body: string } | null;
/** Maakt hooguit één melding per organisatie per bedrijfsdag. Gooit nooit. */
export async function meldDagGeboekt(orgId: string, dagstaatId: string): Promise<void>;
// naAfloop.ts
/** Na een verwerkte dagstaat: de melding "Dag geboekt", ná het antwoord aan de tablet. Gooit nooit. */
export function naDagstaat(orgId: string, dagstaatId: string): void;
```

De melding verschijnt in de bel van de app; die toont alleen de types uit `BEL_TYPES`. Er komt geen mail en geen pushbericht: dat bestaat in de app nog niet en is een eigen besluit van Mathijs.

- [ ] **Step 1: Schrijf de falende tests**

```ts
import { describe, expect, it } from 'vitest';
import type { Dagboeking } from './dagboeking';
import { dagMeldingTekst } from './dagMelding';

const dag = (x: Partial<Dagboeking>): Dagboeking => ({
    datum: '2026-11-28', binnen: { pin: 0, contant: 0, cadeaubon: 0, totaal: 0 }, hokjes: [], totaal_hokjes: 0,
    sluit: true, stand: 'geboekt', aantal_bonnen: 64, gesloten_at: '2026-11-28T17:07:00Z', punten: [], ...x,
});

describe('dagMeldingTekst', () => {
    it('een geboekte dag', () => {
        expect(dagMeldingTekst(dag({}))).toEqual({ title: 'Dag geboekt · za 28 nov', body: 'Alles klopt, je hoeft niets te doen.' });
    });
    it('een dag met punten', () => {
        expect(dagMeldingTekst(dag({ stand: 'te_controleren', punten: ['a'] }))).toEqual({ title: 'Dag afgesloten · za 28 nov', body: '1 punt om naar te kijken.' });
        expect(dagMeldingTekst(dag({ stand: 'te_controleren', punten: ['a', 'b'] }))?.body).toBe('2 punten om naar te kijken.');
    });
    it('geen melding voor een open dag of een dag zonder verkoop', () => {
        expect(dagMeldingTekst(dag({ stand: 'open' }))).toBeNull();
        expect(dagMeldingTekst(dag({ stand: 'geen_verkoop' }))).toBeNull();
    });
});
```

- [ ] **Step 2: Draai en zie falen** — Run: `npx vitest run src/lib/winkelboek/dagMelding.test.ts` — Expected: FAIL, module niet gevonden.

- [ ] **Step 3: Implementeer `dagMelding.ts`** (met `import 'server-only'`; in `vitest.config.ts` is dat al een lege vervanger, dus de test kan het bestand gewoon laden). `meldDagGeboekt`: dagstaat ophalen op `id` en `organization_id` → `bedrijfsdag`; is die dag een proefdag (`btw_kassa_uitsluitingen`) → stoppen; bestaat er al een rij in `notifications` met `organization_id`, `type = 'winkel_dag_geboekt'` en `metadata->>bedrijfsdag` gelijk aan de dag → stoppen; bonnen en dagstaten van die dag laden, `maakDagboeking`, `dagMeldingTekst`; insert `{ organization_id, user_id: null, type: 'winkel_dag_geboekt', title, body, link: '/winkelboek/dag/<datum>', metadata: { bedrijfsdag, stand } }` zoals `src/lib/voorraad/meldingen.ts` dat doet. Alles in één `try/catch` die alleen `console.error('[winkelboek] melding dag geboekt mislukt:', …)` doet.

- [ ] **Step 4: Draai en zie slagen** — Expected: PASS (3 tests).

- [ ] **Step 5: Voeg `naDagstaat` toe aan `src/lib/toonbank/naAfloop.ts`**, met dezelfde opzet als `naToonbankBoekingen`: `after(() => meldDagGeboekt(orgId, dagstaatId))`, en bij een fout op `after` (buiten een verzoek) `void meldDagGeboekt(...)`.

- [ ] **Step 6: Werk de twee testmocks bij.** In `afhalen-dagstaten.test.ts` en `bonnen.test.ts` staat `vi.mock('@/lib/toonbank/naAfloop', () => ({ naToonbankBoekingen: … }))`. Zet `naDagstaat` erbij; in `afhalen-dagstaten.test.ts` schrijft hij naar `houder.dag` (`{ orgId, dagstaatId }`). Voeg aan de bestaande test die een dagstaat met succes post één verwachting toe: `houder.dag` bevat precies één aanroep met het `dagstaat_id` uit het antwoord.

- [ ] **Step 7: Haak aan in de route.** In `src/app/api/toonbank/v1/dagstaten/route.ts`, na `naToonbankBoekingen(orgId, r.productIds)`: `if ('body' in r.uitkomst) naDagstaat(orgId, r.uitkomst.body.dagstaat_id)`. Ook bij `journaal === 'bestond'`: na een verouderd contract komt de herzending als "bestond" binnen, en `meldDagGeboekt` maakt zelf nooit meer dan één melding per dag. Het antwoord aan de tablet verandert niet.

- [ ] **Step 8: Laat de bel de melding tonen.** Voeg `'winkel_dag_geboekt'` toe aan `BEL_TYPES` in `src/app/voorraad/winkel/actions.ts`.

- [ ] **Step 9: Draai de bestaande Toonbank-tests**

Run: `npx vitest run src/app/api/toonbank`
Expected: PASS; één verwachting meer dan vóór deze taak, geen foutregels van `[winkelboek]` in de uitvoer.

- [ ] **Step 10: Commit** — `git add src/lib/winkelboek/dagMelding.ts src/lib/winkelboek/dagMelding.test.ts src/lib/toonbank/naAfloop.ts src/app/api/toonbank/v1 src/app/voorraad/winkel/actions.ts && git commit -m "Boekhouding winkel: melding zodra de dag geboekt is"`

---

## Na de laatste taak

- Open een concept-PR van `feat/winkelboekhouding` naar `main`. In de beschrijving: wat er staat, dat het migratiebestand op akkoord wacht, dat taak 12 de kassakoppeling raakt, en dat het pas vanaf 4 januari 2027 live kan. Geen echte bedragen in de PR-tekst.
- Niet samenvoegen en geen migratie draaien zonder akkoord van Mathijs.
- Volgt als eigen plan: de aansluiting met de bank (pin-uitbetaling en gestort kasgeld).

## Nagekeken

Op 13 november 2026 is dit plan door een tweede lezer tegen `origin/main` (ed4d6a83) gehouden. De rekenvoorbeelden van taak 2, 3, 4, 5, 10 en 11 zijn met de hand nagerekend en klopten. Negen aannames over de bestaande code klopten niet en zijn hierboven verwerkt. Niet gecontroleerd: of `Wallet` en `Euro` in de geïnstalleerde lucide-versie zitten, hoe `after()` zich buiten een verzoek gedraagt, of de live database gelijk is aan de migratiebestanden, en de eslint-regels.
