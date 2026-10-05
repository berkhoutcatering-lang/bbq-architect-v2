/**
 * Kerst-Box: zuivere hulpjes die zowel de server (mails, cron) als het
 * Kerst-scherm in de browser gebruiken. Geen Resend, geen database.
 */
import type { OrderRegelRij, OrderRij } from './store';

/** De slugs staan ook in kerst.ts; hier los, zodat de browser kerst.ts (node:crypto) niet hoeft te laden. */
export const KERST_SLUG = {
    box: 'kerst-box',
    vega: 'kerst-box-vegetarisch',
    bier: 'kerst-bierproeverij',
    wijn: 'kerst-wijnproeverij',
} as const;

export const KERST_SLUG_LIJST: string[] = Object.values(KERST_SLUG);

export interface KerstMailVelden {
    voornaam: string;
    nummer: string;
    personen: number;
    vegetarisch: number;
    bier: number;
    wijn: number;
    /** ISO-datum. */
    afhaaldag: string;
    totaalCenten: number;
}

/** "€ 141,00" */
export function euroKerst(centen: number): string {
    const [heel, rest] = (centen / 100).toFixed(2).split('.');
    return `€ ${heel!.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${rest}`;
}

/** '2026-12-24' → 'donderdag 24 december' (zonder jaartal). */
export function afhaaldagVoluit(iso: string): string {
    const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
}

export function voornaamVan(naam: string): string {
    return naam.trim().split(/\s+/)[0] || naam.trim();
}

/**
 * De velden uit de order zelf — de regels zijn de waarheid, ook nadat Mathijs
 * het aantal heeft aangepast. Vegetarisch uit het vega-artikel, of uit de
 * opmerking als er geen vega-artikel is.
 */
export function veldenUitOrder(order: Pick<OrderRij, 'contact_naam' | 'nummer' | 'totaal_cents' | 'opmerking'>, regels: Pick<OrderRegelRij, 'slug' | 'aantal' | 'klaar_op'>[]): KerstMailVelden {
    const som = (slug: string) => regels.filter((r) => r.slug === slug).reduce((s, r) => s + r.aantal, 0);
    const vegaRegel = som(KERST_SLUG.vega);
    const personen = som(KERST_SLUG.box) + vegaRegel;
    const uitOpmerking = Number(/waarvan vegetarisch\s*:\s*(\d+)/i.exec(order.opmerking ?? '')?.[1] ?? 0);
    const box = regels.find((r) => r.slug === KERST_SLUG.box || r.slug === KERST_SLUG.vega);
    return {
        voornaam: voornaamVan(order.contact_naam),
        nummer: order.nummer,
        personen,
        vegetarisch: vegaRegel || Math.min(uitOpmerking, personen),
        bier: som(KERST_SLUG.bier),
        wijn: som(KERST_SLUG.wijn),
        afhaaldag: box?.klaar_op ?? regels[0]?.klaar_op ?? '',
        totaalCenten: order.totaal_cents,
    };
}


/* ── Het Kerst-scherm: tellen per afhaaldag ───────────────────────────────── */

export interface KerstOrderRegel {
    id: number;
    slug: string;
    aantal: number;
    klaar_op: string;
    eenheden: number;
    opgehaald_at: string | null;
}

export interface KerstOrder {
    id: number;
    nummer: string;
    status: string;
    contact_naam: string;
    opmerking: string | null;
    totaal_cents: number;
    rest_cents: number;
    rest_betaald_at: string | null;
    aantal_onzeker: boolean;
    regels: KerstOrderRegel[];
}

export interface DagTotaal {
    dag: string;
    orders: number;
    personen: number;
    vega: number;
    gewoon: number;
    bier: number;
    wijn: number;
    /** Dozen zoals de capaciteit ze telt (klein/groot). */
    dozen: number;
    totaalCenten: number;
    /** Nog aan de balie te betalen. */
    openCenten: number;
    /** Personen op bestellingen waar de klant het aantal nog niet zeker wist. */
    onzeker: number;
    opgehaald: number;
}

function leegDag(dag: string): DagTotaal {
    return { dag, orders: 0, personen: 0, vega: 0, gewoon: 0, bier: 0, wijn: 0, dozen: 0, totaalCenten: 0, openCenten: 0, onzeker: 0, opgehaald: 0 };
}

/** De afhaaldag van een Kerst-order: de dag van de box-regel, anders van een willekeurige regel. */
export function afhaaldagVan(o: Pick<KerstOrder, 'regels'>): string {
    const box = o.regels.find((r) => r.slug === KERST_SLUG.box || r.slug === KERST_SLUG.vega);
    return box?.klaar_op ?? o.regels[0]?.klaar_op ?? '';
}

/** Alleen geldige (betaalde) orders tellen; geannuleerd en afgebroken niet. */
export function kerstTotalen(orders: KerstOrder[], dagen: readonly string[] = []): { dagen: DagTotaal[]; totaal: DagTotaal } {
    const perDag = new Map<string, DagTotaal>(dagen.map((d) => [d, leegDag(d)]));
    const totaal = leegDag('totaal');
    for (const o of orders) {
        if (o.status !== 'betaald') continue;
        const v = veldenUitOrder({ contact_naam: o.contact_naam, nummer: o.nummer, totaal_cents: o.totaal_cents, opmerking: o.opmerking }, o.regels);
        const dag = afhaaldagVan(o);
        const d = perDag.get(dag) ?? leegDag(dag);
        perDag.set(dag, d);
        const dozen = o.regels.filter((r) => r.slug === KERST_SLUG.box || r.slug === KERST_SLUG.vega).reduce((s, r) => s + r.eenheden, 0);
        const open = o.rest_betaald_at ? 0 : o.rest_cents;
        const opgehaald = o.regels.length > 0 && o.regels.every((r) => r.opgehaald_at) ? 1 : 0;
        for (const t of [d, totaal]) {
            t.orders += 1;
            t.personen += v.personen;
            t.vega += v.vegetarisch;
            t.gewoon += v.personen - v.vegetarisch;
            t.bier += v.bier;
            t.wijn += v.wijn;
            t.dozen += dozen;
            t.totaalCenten += o.totaal_cents;
            t.openCenten += open;
            t.onzeker += o.aantal_onzeker ? v.personen : 0;
            t.opgehaald += opgehaald;
        }
    }
    return { dagen: [...perDag.values()].sort((a, b) => a.dag.localeCompare(b.dag)), totaal };
}

/* ── Productie: wat er per persoon in de doos zit, keer het aantal ─────────── */

export interface KerstOnderdeel {
    id: string;
    naam: string;
    soort: string;
    eenheid: 'gram' | 'stuk' | 'ml';
    per_persoon: number | null;
    per_persoon_vega: number | null;
    volgorde: number;
}

export interface ProductieRij {
    onderdeel: KerstOnderdeel;
    perDag: Record<string, number>;
    totaal: number;
}

/** per_persoon × gewoon + per_persoon_vega × vega, per dag en in totaal. */
export function kerstProductie(onderdelen: KerstOnderdeel[], dagen: Pick<DagTotaal, 'dag' | 'gewoon' | 'vega'>[]): ProductieRij[] {
    return [...onderdelen]
        .sort((a, b) => a.volgorde - b.volgorde || a.naam.localeCompare(b.naam))
        .map((onderdeel) => {
            const perDag: Record<string, number> = {};
            let totaal = 0;
            for (const d of dagen) {
                const n = (Number(onderdeel.per_persoon) || 0) * d.gewoon + (Number(onderdeel.per_persoon_vega) || 0) * d.vega;
                perDag[d.dag] = n;
                totaal += n;
            }
            return { onderdeel, perDag, totaal };
        });
}

function getal(n: number, decimalen: number): string {
    return n.toLocaleString('nl-NL', { minimumFractionDigits: 0, maximumFractionDigits: decimalen });
}

/** 12400 gram → "12,4 kg"; 350 → "350 g"; 24 stuk → "24 st."; 1500 ml → "1,5 l". */
export function hoeveelheidTekst(n: number, eenheid: KerstOnderdeel['eenheid']): string {
    if (!n) return '—';
    if (eenheid === 'gram') return n >= 1000 ? `${getal(n / 1000, 2)} kg` : `${getal(n, 0)} g`;
    if (eenheid === 'ml') return n >= 1000 ? `${getal(n / 1000, 2)} l` : `${getal(n, 0)} ml`;
    return `${getal(n, 1)} st.`;
}
