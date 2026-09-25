/**
 * Vakjes — rekenwerk zonder scherm.
 * Plan: docs/webshop-beheer-bouwplan.md §3.1.
 *
 * Een vakje is de dag waarop iets klaar moet zijn. Regels met een afhaalmoment
 * (plank) of afhaaldag (Kerst-Box) horen bij dat moment; regels zonder moment
 * horen in de vaste bak van hun klaar-op-dag — vandaag, of een dag in de
 * toekomst als de site die meegaf. Wat hier staat is puur: dezelfde invoer
 * geeft altijd dezelfde vakjes, er wordt niets opgehaald.
 *
 * Tellingen zijn de som van wat eronder ligt. Niets wordt apart bijgehouden.
 */
import { verdeelDozen } from '@/lib/winkel/rekenen';

export interface RegelRij {
    id: number;
    artikel_id: string;
    slug: string;
    naam: string;
    aantal: number;
    eenheid: string;
    stuk_cents: number;
    bedrag_cents: number;
    moment_id: string | null;
    eenheden: number;
    klaar_op: string;
    event_id: number | null;
    klaargezet_at: string | null;
    afhaalmoment_tekst: string | null;
}

export interface Wensen {
    vegetarisch: number;
    veganistisch: number;
    glutenvrij: number;
    allergenen: string[];
    overig: string[];
}

export interface OrderRij {
    id: number;
    nummer: string;
    status: 'wacht' | 'betaald' | 'afgebroken' | 'mislukt' | 'verlopen';
    status_reden: string | null;
    leverwijze: 'afhalen' | 'verzenden';
    moment_id: string | null;
    contact_naam: string;
    contact_email: string;
    contact_telefoon: string | null;
    adres: { straat: string; postcode: string; plaats: string } | null;
    opmerking: string | null;
    subtotaal_cents: number;
    leverkosten_cents: number;
    totaal_cents: number;
    reservering_tot: string;
    betaald_at: string | null;
    betaalmethode: string | null;
    created_at: string;
    refund_status: 'nodig' | 'gelukt' | 'mislukt' | null;
    refund_fout: string | null;
    mail_status: 'niet_verstuurd' | 'verstuurd' | 'mislukt';
    mail_fout: string | null;
    wensen: Wensen | null;
    wensen_bron: 'geen' | 'ai' | 'handmatig' | 'mislukt' | null;
    plaatsing_status: 'geplaatst' | 'vaste_bak' | 'mislukt' | null;
    plaatsing_fout: string | null;
    winkel_order_regels: RegelRij[];
}

export interface ArtikelRij {
    id: string;
    slug: string;
    naam: string;
    eenheid: string;
    telt: 'stuks' | 'personen';
    prijs_cents: number | null;
    btw_pct: number;
    minimum: number;
    maximum: number | null;
    verzendbaar: boolean;
    gekoeld: boolean;
    moment_soort: 'geen' | 'moment' | 'dag';
    moment_groep: string | null;
    afhaalmoment_tekst: string | null;
    capaciteit_soort: 'regel' | 'aantal' | 'dozen';
    doos_klein_max: number | null;
    doos_groot: number | null;
    voorraad: number | null;
    actief: boolean;
    publiek: boolean;
    gerecht_id: string | null;
    inventory_id: number | null;
    inkoop_per_stuk: number | null;
    dieet: 'vegetarisch' | 'veganistisch' | null;
    koppel_voorstel: { soort: 'gerecht' | 'voorraad' | 'geen'; id: string | number | null; naam: string | null; zekerheid: 'hoog' | 'laag'; reden: string } | null;
}

export interface MomentRij {
    id: string;
    groep: string;
    datum: string;
    van: string | null;
    tot: string | null;
    capaciteit: number;
    bestellen_tot: string | null;
    actief: boolean;
}

/* ── Datums ────────────────────────────────────────────────────────────────── */

function lokaal(iso: string): Date | null {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
    if (!m) return null;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/** "woensdag 23 december" */
export function datumLang(iso: string): string {
    const d = lokaal(iso);
    return d ? d.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' }) : iso;
}

/** "wo 23 dec" */
export function datumKort(iso: string): string {
    const d = lokaal(iso);
    return d ? d.toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' }).replace('.', '') : iso;
}

export function dagenTot(iso: string, vandaag: string): number {
    const a = lokaal(iso);
    const b = lokaal(vandaag);
    if (!a || !b) return 0;
    return Math.round((a.getTime() - b.getTime()) / 86_400_000);
}

/** "Vandaag", "Morgen", "Over 21 dagen", "Gisteren", "3 dagen geleden" */
export function afstandLabel(dagen: number): string {
    if (dagen === 0) return 'Vandaag';
    if (dagen === 1) return 'Morgen';
    if (dagen === -1) return 'Gisteren';
    if (dagen > 1) return `Over ${dagen} dagen`;
    return `${-dagen} dagen geleden`;
}

export function kortTijd(t: string | null | undefined): string | null {
    const m = /^(\d{2}):(\d{2})/.exec(t ?? '');
    return m ? `${m[1]}:${m[2]}` : null;
}

export function tijdvak(m: Pick<MomentRij, 'van' | 'tot'>): string | null {
    const van = kortTijd(m.van);
    if (!van) return null;
    const tot = kortTijd(m.tot);
    return tot ? `${van}–${tot}` : `vanaf ${van}`;
}

/* ── Groepen ───────────────────────────────────────────────────────────────── */

export type CapaciteitEenheid = 'planken' | 'dozen' | 'stuks';

/** Waarin telt de capaciteit van deze groep? Uit de artikelen die erop wijzen. */
export function capaciteitEenheid(groep: string, artikelen: ArtikelRij[]): CapaciteitEenheid {
    const soorten = artikelen.filter((a) => a.moment_groep === groep).map((a) => a.capaciteit_soort);
    if (soorten.includes('dozen')) return 'dozen';
    if (soorten.includes('regel')) return 'planken';
    return 'stuks';
}

/** "Agenda · planken", "Kerst-Box · afhaaldagen" */
export function groepLabel(groep: string, artikelen: ArtikelRij[]): string {
    if (groep === 'agenda') return 'Agenda · planken';
    const namen = [...new Set(artikelen.filter((a) => a.moment_groep === groep).map((a) => a.naam))];
    const kop = namen.length === 1 ? namen[0] : groep.charAt(0).toUpperCase() + groep.slice(1);
    const soort = artikelen.some((a) => a.moment_groep === groep && a.moment_soort === 'dag') ? 'afhaaldagen' : 'momenten';
    return `${kop} · ${soort}`;
}

/* ── Bezetting ─────────────────────────────────────────────────────────────── */

/** Telt mee: betaald, en wacht zolang de reservering loopt — dezelfde regel als de kassa. */
export function telt(o: Pick<OrderRij, 'status' | 'reservering_tot'>, nu: Date): boolean {
    return o.status === 'betaald' || (o.status === 'wacht' && new Date(o.reservering_tot).getTime() > nu.getTime());
}

export function telBezetting(orders: OrderRij[], nu: Date): Map<string, number> {
    const uit = new Map<string, number>();
    for (const o of orders) {
        if (!telt(o, nu)) continue;
        for (const r of o.winkel_order_regels) {
            const m = r.moment_id ?? o.moment_id;
            if (!m) continue;
            uit.set(m, (uit.get(m) ?? 0) + r.eenheden);
        }
    }
    return uit;
}

/* ── Vakjes ────────────────────────────────────────────────────────────────── */

export interface VakjeRegel {
    regel: RegelRij;
    order: OrderRij;
    artikel: ArtikelRij | null;
}

export interface PerArtikel {
    artikel_id: string;
    naam: string;
    aantal: number;
    dieet: ArtikelRij['dieet'];
    gekoppeld: boolean;
}

export interface Vakje {
    sleutel: string;
    soort: 'vaste_bak' | 'moment' | 'dag';
    datum: string;
    moment: MomentRij | null;
    eventId: number | null;
    regels: VakjeRegel[];
    orders: OrderRij[];
    /** Σ aantal van artikelen die in personen tellen. */
    personen: number;
    /** Σ aantal van artikelen die in stuks tellen. */
    stuks: number;
    perArtikel: PerArtikel[];
    /** Alleen bij dozen: hoeveel en hoe verdeeld. */
    dozen: { totaal: number; groot: number; klein: number } | null;
    capaciteit: { bezet: number; totaal: number; eenheid: CapaciteitEenheid } | null;
    nietGeplaatst: number;
    nietGelezen: number;
    allergenen: { naam: string; aantal: number }[];
    vegetarisch: number;
    klaargezet: { klaar: number; totaal: number };
    verzenden: number;
    totaalCents: number;
    /** Eén artikel zonder gerecht/voorraad-item in dit vakje: de keuken/inkoop ziet alleen aantallen. */
    ongekoppeld: string[];
}

export function opmerkingNietGelezen(o: Pick<OrderRij, 'opmerking' | 'wensen_bron'>): boolean {
    return Boolean(o.opmerking?.trim()) && (o.wensen_bron == null || o.wensen_bron === 'mislukt');
}

/**
 * Zet betaalde orders in vakjes. Regels mét moment → het vakje van dat moment.
 * Regels zónder moment → de vaste bak van hun klaar-op-dag; een dag die al
 * voorbij is en nog niet klaargezet schuift naar vandaag, klaargezet en
 * voorbij verdwijnt.
 */
export function bouwVakjes(orders: OrderRij[], artikelen: ArtikelRij[], momenten: MomentRij[], vandaag: string, nu: Date = new Date()): Vakje[] {
    const artikelOpId = new Map(artikelen.map((a) => [a.id, a]));
    const momentOpId = new Map(momenten.map((m) => [m.id, m]));
    const bezetting = telBezetting(orders, nu);
    const groepen = new Map<string, VakjeRegel[]>();

    for (const o of orders) {
        if (o.status !== 'betaald') continue;
        for (const r of o.winkel_order_regels) {
            const momentId = r.moment_id ?? o.moment_id;
            let sleutel: string;
            if (momentId && momentOpId.has(momentId)) {
                sleutel = `moment:${momentId}`;
            } else {
                let dag = r.klaar_op;
                if (dag < vandaag) {
                    if (r.klaargezet_at) continue;
                    dag = vandaag;
                }
                sleutel = `dag:${dag}`;
            }
            const lijst = groepen.get(sleutel) ?? [];
            lijst.push({ regel: r, order: o, artikel: artikelOpId.get(r.artikel_id) ?? null });
            groepen.set(sleutel, lijst);
        }
    }

    /* De vaste bak van vandaag staat er altijd, ook leeg. */
    if (!groepen.has(`dag:${vandaag}`)) groepen.set(`dag:${vandaag}`, []);

    const vakjes: Vakje[] = [];
    for (const [sleutel, regels] of groepen) {
        const moment = sleutel.startsWith('moment:') ? momentOpId.get(sleutel.slice(7)) ?? null : null;
        const datum = moment ? moment.datum : sleutel.slice(4);
        const soort: Vakje['soort'] = moment ? (moment.van ? 'moment' : 'dag') : 'vaste_bak';
        const orders = [...new Map(regels.map((x) => [x.order.id, x.order])).values()].sort((a, b) => a.nummer.localeCompare(b.nummer));

        let personen = 0;
        let stuks = 0;
        let vegetarisch = 0;
        const perArtikelMap = new Map<string, PerArtikel>();
        const dozen = { totaal: 0, groot: 0, klein: 0 };
        let metDozen = false;
        const ongekoppeld = new Set<string>();
        for (const { regel, artikel } of regels) {
            if (artikel?.telt === 'personen') personen += regel.aantal; else stuks += regel.aantal;
            if (artikel?.dieet === 'vegetarisch') vegetarisch += regel.aantal;
            const pa = perArtikelMap.get(regel.artikel_id) ?? { artikel_id: regel.artikel_id, naam: artikel?.naam ?? regel.naam, aantal: 0, dieet: artikel?.dieet ?? null, gekoppeld: Boolean(artikel?.gerecht_id || artikel?.inventory_id) };
            pa.aantal += regel.aantal;
            perArtikelMap.set(regel.artikel_id, pa);
            if (artikel && !artikel.gerecht_id && !artikel.inventory_id) ongekoppeld.add(artikel.naam);
            if (artikel?.capaciteit_soort === 'dozen' && artikel.doos_klein_max && artikel.doos_groot) {
                metDozen = true;
                const v = verdeelDozen(regel.aantal, artikel.doos_klein_max, artikel.doos_groot);
                dozen.totaal += v.dozen;
                dozen.groot += v.groot;
                dozen.klein += v.klein;
            }
        }

        const allergenenMap = new Map<string, number>();
        let nietGelezen = 0;
        for (const o of orders) {
            if (opmerkingNietGelezen(o)) nietGelezen += 1;
            const dieetOpOrder = regels.some((x) => x.order.id === o.id && x.artikel?.dieet === 'vegetarisch');
            if (o.wensen) {
                if (!dieetOpOrder) vegetarisch += o.wensen.vegetarisch;
                for (const a of o.wensen.allergenen) allergenenMap.set(a, (allergenenMap.get(a) ?? 0) + 1);
            }
        }

        const nietGeplaatst = orders.filter((o) => o.plaatsing_status === 'mislukt' || (moment && regels.some((x) => x.order.id === o.id && x.regel.event_id == null))).length;
        const eventId = regels.map((x) => x.regel.event_id).find((id): id is number => id != null) ?? null;
        const eenheid = moment ? capaciteitEenheid(moment.groep, artikelen) : null;

        vakjes.push({
            sleutel, soort, datum, moment, eventId, regels, orders,
            personen, stuks,
            perArtikel: [...perArtikelMap.values()].sort((a, b) => b.aantal - a.aantal),
            dozen: metDozen ? dozen : null,
            capaciteit: moment && eenheid ? { bezet: bezetting.get(moment.id) ?? 0, totaal: moment.capaciteit, eenheid } : null,
            nietGeplaatst,
            nietGelezen,
            allergenen: [...allergenenMap].map(([naam, aantal]) => ({ naam, aantal })).sort((a, b) => b.aantal - a.aantal),
            vegetarisch,
            klaargezet: { klaar: regels.filter((x) => x.regel.klaargezet_at).length, totaal: regels.length },
            verzenden: orders.filter((o) => o.leverwijze === 'verzenden').length,
            totaalCents: orders.reduce((s, o) => s + o.totaal_cents, 0),
            ongekoppeld: [...ongekoppeld],
        });
    }

    /* Vandaag bovenaan, dan op datum; op dezelfde dag eerst de vaste bak, dan op tijd. */
    vakjes.sort((a, b) => {
        if (a.datum !== b.datum) return a.datum.localeCompare(b.datum);
        if (a.soort === 'vaste_bak') return -1;
        if (b.soort === 'vaste_bak') return 1;
        return (a.moment?.van ?? '').localeCompare(b.moment?.van ?? '');
    });
    return vakjes;
}

/** "Kerst-Box", "Borrel Journey + Hop & Bites plank", of de groep. */
export function vakjeNaam(v: Vakje, artikelen: ArtikelRij[]): string {
    if (v.soort === 'vaste_bak') return 'Klaarzetten & verzenden';
    const namen = [...new Set(v.perArtikel.map((p) => p.naam))];
    if (namen.length >= 1 && namen.length <= 2) return namen.join(' + ');
    if (v.moment) return groepLabel(v.moment.groep, artikelen).split(' · ')[0];
    return 'Afhalen';
}

/* ── Geld ──────────────────────────────────────────────────────────────────── */

/** "6,50" of "€ 6,50" → 650; leeg → null; onzin → undefined. */
export function leesEuro(s: string): number | null | undefined {
    const t = s.replace(/€/g, '').replace(/\s/g, '').replace(',', '.');
    if (t === '') return null;
    const n = Number(t);
    if (!Number.isFinite(n) || n < 0) return undefined;
    return Math.round(n * 100);
}

export function toonEuro(cents: number | null | undefined): string {
    if (cents == null) return '';
    return (cents / 100).toFixed(2).replace('.', ',');
}
