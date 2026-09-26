/**
 * Productie, inpakken en etiket — blok S7, zuiver.
 * Opdracht: docs/OVERDRACHT-BBQ-ARCHITECT-SINTERKLAAS.md · plan: docs/sinterklaas-bouwplan.md §5
 *
 * Alles hier rekent op wat bij het plaatsen is vastgelegd: de componenten van
 * elke regel (slots × aantal). Er wordt niets opnieuw uit het template gehaald,
 * dus een latere wissel in een pakket verandert een bestaande inpaklijst niet.
 *
 *   • Plank per afhaalmoment: personen → grammen per onderdeel, schalen,
 *     bakjes (6 per schaal); snij-/opmaaklijst per order met de grammen per schaal.
 *   • Pakketten per afhaalmoment, gegroepeerd per artikel: totaal, dan de orders
 *     met de exacte inhoud — zodat identieke pakketten in series gevuld worden.
 *   • Etiketten: één per pakket, één per schaal. QR is een URL met artikel-slug
 *     en ordernummer; BBQ Architect maakt geen token.
 */
import { telSchalen, verdeelSchalen, type Component, type Schaal } from './rekenen';

export const BAKJES_PER_SCHAAL = 6;

export interface ProductieRegel {
    regel: { id: number; artikel_id: string; slug: string; naam: string; aantal: number; alcohol: boolean };
    order: { id: number; nummer: string; contact_naam: string; betaalwijze: 'volledig' | 'reservering'; nu_te_betalen_cents: number; rest_cents: number; rest_betaald_at: string | null };
    componenten: Component[];
}

export interface ProductieArtikel {
    id: string;
    naam: string;
    slug: string;
    schaal_verdeling?: boolean;
    doos_klein_max?: number | null;
    doos_groot?: number | null;
    alcohol?: boolean;
}

/* ── Hulpjes ───────────────────────────────────────────────────────────────── */

function rond(n: number): number {
    return Math.round(n * 100) / 100;
}

/** Componenten teruggebracht naar één stuk (pakket) of één persoon (plank). */
export function perEenheid(componenten: Component[], aantal: number): Component[] {
    if (aantal <= 0) return componenten;
    return componenten.map((c) => ({ ...c, hoeveelheid: rond(c.hoeveelheid / aantal) }));
}

export function hoeveelheidTekst(hoeveelheid: number, eenheid: 'stuk' | 'gram'): string {
    if (eenheid === 'gram') return hoeveelheid >= 1000 ? `${rond(hoeveelheid / 1000)} kg` : `${rond(hoeveelheid)} g`;
    return `${rond(hoeveelheid)} ${hoeveelheid === 1 ? 'stuk' : 'stuks'}`;
}

/* ── Plank ─────────────────────────────────────────────────────────────────── */

export interface PlankOnderdeel {
    naam: string;
    slot_type: string;
    eenheid: 'stuk' | 'gram';
    /** Per persoon, uit de componenten (niet uit het template). */
    perPersoon: number;
    totaal: number;
}

export interface PlankSchaal {
    schaal: Schaal;
    onderdelen: { naam: string; hoeveelheid: number; eenheid: 'stuk' | 'gram' }[];
}

export interface PlankOrder {
    order: ProductieRegel['order'];
    regelId: number;
    personen: number;
    schalen: PlankSchaal[];
    alcohol: boolean;
}

export interface PlankProductie {
    artikel: ProductieArtikel;
    personen: number;
    orders: number;
    schalen: { klein: number; groot: number; totaal: number };
    bakjes: number;
    onderdelen: PlankOnderdeel[];
    perOrder: PlankOrder[];
}

/**
 * Productielijst voor een plank-artikel op één moment: totalen per onderdeel
 * (personen × gram p.p.), schalen en bakjes, en per order de snij-/opmaaklijst
 * met de grammen per schaal.
 */
export function plankProductie(artikel: ProductieArtikel, rijen: ProductieRegel[]): PlankProductie {
    const eigen = rijen.filter((r) => r.regel.artikel_id === artikel.id);
    const kleinMax = artikel.doos_klein_max ?? 3;
    const groot = artikel.doos_groot ?? 5;

    const onderdeelMap = new Map<string, PlankOnderdeel>();
    let personen = 0;
    const schalenTel = { klein: 0, groot: 0, totaal: 0 };
    const perOrder: PlankOrder[] = [];

    for (const r of eigen) {
        personen += r.regel.aantal;
        const pp = perEenheid(r.componenten, r.regel.aantal);
        for (const c of pp) {
            const sleutel = `${c.slot_type}|${c.naam}`;
            const o = onderdeelMap.get(sleutel) ?? { naam: c.naam, slot_type: c.slot_type, eenheid: c.eenheid, perPersoon: c.hoeveelheid, totaal: 0 };
            o.totaal = rond(o.totaal + c.hoeveelheid * r.regel.aantal);
            onderdeelMap.set(sleutel, o);
        }
        const schalen = verdeelSchalen(r.regel.aantal, kleinMax, groot);
        const t = telSchalen(schalen);
        schalenTel.klein += t.klein;
        schalenTel.groot += t.groot;
        schalenTel.totaal += t.totaal;
        perOrder.push({
            order: r.order,
            regelId: r.regel.id,
            personen: r.regel.aantal,
            alcohol: r.regel.alcohol,
            schalen: schalen.map((s) => ({
                schaal: s,
                onderdelen: pp.map((c) => ({ naam: c.naam, hoeveelheid: rond(c.hoeveelheid * s.personen), eenheid: c.eenheid })),
            })),
        });
    }
    perOrder.sort((a, b) => a.order.nummer.localeCompare(b.order.nummer));

    return {
        artikel,
        personen,
        orders: perOrder.length,
        schalen: schalenTel,
        bakjes: schalenTel.totaal * BAKJES_PER_SCHAAL,
        onderdelen: [...onderdeelMap.values()],
        perOrder,
    };
}

/* ── Pakketten ─────────────────────────────────────────────────────────────── */

export interface InpakOrder {
    order: ProductieRegel['order'];
    regelId: number;
    aantal: number;
    /** De exacte inhoud van één pakket, zoals vastgelegd bij het plaatsen. */
    inhoudPerStuk: Component[];
    alcohol: boolean;
}

export interface InpakArtikel {
    artikel: ProductieArtikel;
    stuks: number;
    orders: InpakOrder[];
    /** De inhoud die alle orders van dit artikel delen (vast pakket); anders per order kijken. */
    inhoudPerStuk: Component[] | null;
}

/**
 * Inpaklijst per artikel: totaal stuks, dan de orders. Identieke pakketten
 * staan bij elkaar, zodat ze in series gevuld worden. Bij 1.000 regels blijft
 * dit bruikbaar: per artikel één kop met het totaal, daaronder de orders.
 */
export function inpaklijst(artikelen: ProductieArtikel[], rijen: ProductieRegel[]): InpakArtikel[] {
    const opId = new Map(artikelen.map((a) => [a.id, a]));
    const groepen = new Map<string, InpakOrder[]>();
    for (const r of rijen) {
        const a = opId.get(r.regel.artikel_id);
        if (!a || a.schaal_verdeling) continue;
        const lijst = groepen.get(a.id) ?? [];
        lijst.push({ order: r.order, regelId: r.regel.id, aantal: r.regel.aantal, inhoudPerStuk: perEenheid(r.componenten, r.regel.aantal), alcohol: r.regel.alcohol });
        groepen.set(a.id, lijst);
    }
    const uit: InpakArtikel[] = [];
    for (const [id, orders] of groepen) {
        orders.sort((a, b) => a.order.nummer.localeCompare(b.order.nummer));
        const eerste = JSON.stringify(orders[0]?.inhoudPerStuk ?? []);
        const gelijk = orders.every((o) => JSON.stringify(o.inhoudPerStuk) === eerste);
        uit.push({
            artikel: opId.get(id)!,
            stuks: orders.reduce((s, o) => s + o.aantal, 0),
            orders,
            inhoudPerStuk: gelijk ? orders[0]?.inhoudPerStuk ?? null : null,
        });
    }
    uit.sort((a, b) => b.stuks - a.stuks || a.artikel.naam.localeCompare(b.artikel.naam));
    return uit;
}

/* ── Etiket ────────────────────────────────────────────────────────────────── */

/**
 * De QR op het etiket: de Sinterklaas-editie van de Experience-app met de
 * artikel-slug en het ordernummer als parameters. Geen basis-URL = geen QR.
 */
export function qrUrl(basis: string | null | undefined, slug: string, nummer: string): string | null {
    const b = (basis ?? '').trim().replace(/\/+$/, '');
    if (!b) return null;
    const q = new URLSearchParams({ artikel: slug, order: nummer }).toString();
    return `${b}/sint?${q}`;
}

/** "reeds betaald € 2,50 · rest € 32,50" — alleen bij een reservering die nog openstaat. */
export function restTekst(o: Pick<ProductieRegel['order'], 'betaalwijze' | 'nu_te_betalen_cents' | 'rest_cents' | 'rest_betaald_at'>): string | null {
    if (o.betaalwijze !== 'reservering' || o.rest_cents <= 0) return null;
    if (o.rest_betaald_at) return 'rest betaald';
    return `reeds betaald ${euro(o.nu_te_betalen_cents)} · rest ${euro(o.rest_cents)}`;
}

/** "vr 4 dec · 16:00–18:00" — voor etiket en lijsten. Geen tijdzone: een DATE heeft geen tijd. */
export function momentTekst(m: { datum: string; van: string | null; tot: string | null } | null | undefined): string | null {
    if (!m) return null;
    const d = /^(\d{4})-(\d{2})-(\d{2})/.exec(m.datum);
    const dag = d ? new Date(Number(d[1]), Number(d[2]) - 1, Number(d[3])).toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' }).replace('.', '') : m.datum;
    const van = m.van?.slice(0, 5);
    const tot = m.tot?.slice(0, 5);
    if (!van) return dag;
    return `${dag} · ${tot ? `${van}–${tot}` : `vanaf ${van}`}`;
}

export function euro(centen: number): string {
    return '€ ' + (centen / 100).toFixed(2).replace('.', ',');
}

export interface WinkelEtiketData {
    klantnaam: string;
    ordernummer: string;
    /** Al opgemaakt: "vr 4 dec · 16:00–18:00". */
    moment: string | null;
    artikel: string;
    /** "2/3" — het hoeveelste van deze regel. */
    volgnr: string;
    qrUrl: string | null;
    alcohol: boolean;
    rest: string | null;
}

/**
 * De etiketten van één regel: één per pakket, één per schaal. Bij de plank
 * staat het aantal personen van die schaal op het etiket.
 */
export function etikettenVoorRegel(
    r: ProductieRegel,
    artikel: ProductieArtikel | null,
    momentTekst: string | null,
    qrBasis: string | null | undefined,
): WinkelEtiketData[] {
    const basis: Omit<WinkelEtiketData, 'volgnr' | 'artikel'> = {
        klantnaam: r.order.contact_naam,
        ordernummer: r.order.nummer,
        moment: momentTekst,
        qrUrl: qrUrl(qrBasis, r.regel.slug, r.order.nummer),
        alcohol: r.regel.alcohol,
        rest: restTekst(r.order),
    };
    if (artikel?.schaal_verdeling) {
        const schalen = verdeelSchalen(r.regel.aantal, artikel.doos_klein_max ?? 3, artikel.doos_groot ?? 5);
        return schalen.map((s, i) => ({
            ...basis,
            artikel: `${r.regel.naam} · ${s.maat === 'groot' ? 'grote' : 'kleine'} schaal · ${s.personen} pers.`,
            volgnr: `${i + 1}/${schalen.length}`,
        }));
    }
    return Array.from({ length: r.regel.aantal }, (_, i) => ({ ...basis, artikel: r.regel.naam, volgnr: `${i + 1}/${r.regel.aantal}` }));
}
