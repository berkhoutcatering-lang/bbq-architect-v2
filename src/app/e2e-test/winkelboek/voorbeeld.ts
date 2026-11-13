/**
 * Vaste voorbeeldgegevens voor /e2e-test/winkelboek: één week van de winkel
 * (di 24 t/m za 28 november 2026). Verzonnen cijfers, alleen om de schermen
 * zonder inloggen en zonder database te kunnen bekijken. Ze sluiten op elkaar
 * aan: de contante verkoop van de bonnen is de contante verkoop van de dagstaat.
 */
import type { KassaDag } from '@/lib/btwAangifteBronnen';
import type { KassaRegel } from '@/lib/financeAnalytics';
import type { BonMin, DagstaatKort } from '@/lib/winkelboek/dagboeking';
import type { InkoopBon, Ontvangst } from '@/lib/winkelboek/inkoop';
import type { KasMutatie } from '@/lib/winkelboek/kasboek';
import type { VerkoopRegel } from '@/lib/winkelboek/verkoop';

type Bon = BonMin & { bedrijfsdag: string };

const bon = (bedrijfsdag: string, incl9: number, btw9: number, pin: number, contant: number, extra: Partial<Bon> = {}): Bon => ({
    status: 'afgerond', dagstaat_id: `d-${bedrijfsdag}`, bedrijfsdag,
    totaal_cents: pin + contant + (extra.cadeaubon_cents ?? 0), afronding_cents: 0,
    btw: { '9': { incl_cents: incl9, btw_cents: btw9 } },
    statiegeld_cents: 0, order_rest_cents: 0, pin_cents: pin, contant_cents: contant, cadeaubon_cents: 0, ...extra,
});

export const BONNEN: Bon[] = [
    bon('2026-11-24', 44908, 3708, 36258, 8650),
    bon('2026-11-25', 41420, 3420, 34020, 7400),
    bon('2026-11-26', 49595, 4095, 40345, 9250),
    bon('2026-11-27', 97010, 8010, 78210, 18800),
    bon('2026-11-28', 109000, 9000, 140250, 33948, {
        totaal_cents: 179198, afronding_cents: -2, statiegeld_cents: 1200, order_rest_cents: 8500, cadeaubon_cents: 5000,
        btw: { '9': { incl_cents: 109000, btw_cents: 9000 }, '21': { incl_cents: 60500, btw_cents: 10500 } },
    }),
];

const staat = (dag: string, begin: number, verwacht: number, geteld: number, afgeroomd: number, pin: number, bonnen: number): DagstaatKort => ({
    id: `d-${dag}`, apparaat_id: 'kassa-1', bedrijfsdag: dag, status: 'definitief', gesloten_at: `${dag}T17:07:00Z`, aantal_bonnen: bonnen,
    pin_toonbank_cents: pin, pin_mypos_app_cents: pin, pin_verschil_cents: 0,
    contant_begin_cents: begin, contant_verwacht_cents: verwacht, contant_geteld_cents: geteld,
    contant_verschil_cents: geteld - verwacht, afgeroomd_cents: afgeroomd, verschillen: [], goedgekeurd_at: null,
});

export const DAGSTATEN: DagstaatKort[] = [
    staat('2026-11-24', 15000, 23650, 23650, 8500, 36258, 18),
    staat('2026-11-25', 15150, 22550, 22550, 7500, 34020, 16),
    staat('2026-11-26', 15050, 24300, 24100, 9000, 40345, 21),
    staat('2026-11-27', 15100, 33900, 33000, 18000, 78210, 38),
    staat('2026-11-28', 15000, 48948, 48948, 34000, 140250, 64),
];

export const KAS_MUTATIES: KasMutatie[] = [
    { id: 'm1', datum: '2026-11-27', bedrag_cents: -900, reden: 'uitgave', omschrijving: 'Schoonmaakmiddel', moment: 'tijdens' },
];

const kassaRegel = (datum: string, btw_pct: number, omzet: number, btw: number): KassaRegel => ({ datum, btw_pct, omzet, btw, bron: 'toonbank' });

export const KASSA_REGELS: KassaRegel[] = [
    kassaRegel('2026-11-24', 9, 412, 37.08),
    kassaRegel('2026-11-25', 9, 380, 34.2),
    kassaRegel('2026-11-26', 9, 455, 40.95),
    kassaRegel('2026-11-27', 9, 890, 80.1),
    kassaRegel('2026-11-28', 9, 1000, 90),
    kassaRegel('2026-11-28', 21, 500, 105),
];

const kassaDag = (datum: string, orders: number, omzet: number, btw: number): KassaDag => ({ datum, orders, betaald: orders, omzet, btw, uitgesloten: false });

export const KASSA_DAGEN: KassaDag[] = [
    kassaDag('2026-11-24', 18, 412, 37.08),
    kassaDag('2026-11-25', 16, 380, 34.2),
    kassaDag('2026-11-26', 21, 455, 40.95),
    kassaDag('2026-11-27', 38, 890, 80.1),
    kassaDag('2026-11-28', 64, 1500, 195),
];

export const AFDELINGEN = new Map<string, string>([
    ['p-worst', 'Worst'], ['p-fuet', 'Worst'], ['p-kaas', 'Kaas'], ['p-blond', 'Bier'], ['p-tripel', 'Bier'],
    ['p-amandel', 'Noten'], ['p-cracker', 'Broodbeleg'], ['p-saus', 'Broodbeleg'],
]);

let regelId = 0;
const regel = (artikel: string, naam: string, product: string | string[], aantal: number, incl: number, pct: number, inkoop: number | null, geschat = false): VerkoopRegel => ({
    regel_id: ++regelId, bedrijfsdag: '2026-11-28', op: '2026-11-28T13:00:00Z', artikel_id: artikel, naam, open_prijs_groep: null,
    aantal, bedrag_cents: incl, btw: [{ pct, incl_cents: incl }],
    onderdelen: (Array.isArray(product) ? product : [product]).map((p) => ({ product_id: p, hoeveelheid: 1, eenheid: 'stuk' })),
    goederen_terug: null, inkoop_cents: inkoop, inkoop_bron: inkoop === null ? null : geschat ? 'prijs_nu' : 'logboek',
});

export const VERKOOP_REGELS: VerkoopRegel[] = [
    regel('a-worst', 'Droge worst naturel', 'p-worst', 74, 44400, 9, 22940),
    regel('a-kaas', 'Boerenkaas belegen', 'p-kaas', 31, 43175, 9, 24800),
    regel('a-blond', 'Naober Blond 33 cl', 'p-blond', 132, 39600, 21, 19140),
    regel('a-amandel', 'Gerookte amandelen 150 g', 'p-amandel', 58, 28900, 9, 13340, true),
    regel('a-pakket', 'Bierpakket 4 Naober', ['p-blond', 'p-tripel'], 21, 31500, 21, 15330),
    regel('a-fuet', 'Fuet met truffel', 'p-fuet', 31, 21680, 9, 11780),
    regel('a-saus', 'Mosterd-dillesaus', 'p-saus', 29, 13050, 9, null),
    regel('a-cracker', 'Crackers zeezout', 'p-cracker', 44, 11000, 9, 5280),
    regel('a-tripel', 'Tripel 75 cl', 'p-tripel', 12, 10800, 21, 5400),
    regel('a-doos', 'Cadeauverpakking', 'p-doos', 14, 3500, 21, null),
];

export const DERVING = { cents: 1840, aantal: 2, zonder_waarde: 0 };

const ontvangst = (datum: string, leverancier_id: number | null, leverancier: string | null, product_id: string, product_naam: string, waarde_cents: number | null, btw_pct = 9): Ontvangst =>
    ({ datum, leverancier_id, leverancier, product_id, product_naam, waarde_cents, btw_pct });

export const ONTVANGSTEN: Ontvangst[] = [
    ontvangst('2026-11-27', 1, 'Brouwerij', 'p-blond', 'Naober Blond 33 cl', 23200, 21),
    ontvangst('2026-11-27', 1, 'Brouwerij', 'p-tripel', 'Tripel 75 cl', 10800, 21),
    ontvangst('2026-11-27', 1, 'Brouwerij', 'p-barley', 'Barleywine 33 cl', 7280, 21),
    ontvangst('2026-11-26', 2, 'Slagerij', 'p-worst', 'Droge worst naturel', 20000),
    ontvangst('2026-11-26', 2, 'Slagerij', 'p-fuet', 'Fuet met truffel', 11850),
    ontvangst('2026-11-25', 3, 'Kaasmakerij', 'p-kaas', 'Boerenkaas belegen', 37600),
    ontvangst('2026-11-24', 4, 'Groothandel', 'p-amandel', 'Gerookte amandelen 150 g', 13340),
    ontvangst('2026-11-24', 4, 'Groothandel', 'p-cracker', 'Crackers zeezout', 9600),
    ontvangst('2026-11-24', 4, 'Groothandel', 'p-saus', 'Mosterd-dillesaus', null),
    ontvangst('2026-11-24', null, null, 'p-doos', 'Cadeauverpakking', 2800, 21),
];

export const INKOOP_BONNEN: InkoopBon[] = [
    { id: 11, datum: '2026-11-27', leverancier_id: 1, netto_cents: 41280 },
    { id: 12, datum: '2026-11-28', leverancier_id: 2, netto_cents: 31850 },
    { id: 13, datum: '2026-11-24', leverancier_id: 4, netto_cents: 28940 },
    { id: 14, datum: '2026-11-26', leverancier_id: 4, netto_cents: 6120 },
];

export const VOORRAADWAARDE = { cents: 684000, producten: 61, zonder: 12 };
