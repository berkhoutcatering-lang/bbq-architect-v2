/**
 * De werkruimte Winkel: per afdeling wat er ligt, wat het opbrengt en wat er
 * bijna over de datum gaat. Zuiver: krijgt rijen, geeft getallen. Laden doet
 * src/lib/winkel/winkelOverzicht.ts; de schermen staan onder /winkel.
 *
 * Regels
 *  - Omzet en verkocht komen alleen van de Toonbank (toonbank_bon_regels,
 *    afgeronde bonnen; een tegenbon telt negatief). Webshoporders niet: dat
 *    zijn pakketten met een eigen scherm.
 *  - Een bonregel met precies één product telt bij dat product en zijn
 *    afdeling. Een pakket (meerdere producten) wordt niet verdeeld: geen
 *    verzonnen verdeelsleutel. Het telt mee onder `pakketten`.
 *  - Bij een stickerregel is "verkocht" het aantal stuks (bakjes), niet het
 *    aantal gram.
 *  - Datums per stuk (winkel_stuks). "Bijna" = THT vandaag t/m over twee
 *    dagen; "over" = THT vóór vandaag en nog niet afgeboekt.
 *  - Periodes zijn rollend: de laatste 7 dagen tegen de 7 dagen daarvoor.
 */

export const BIJNA_DAGEN = 2;

export interface Afdeling {
    id: string;
    code: string;
    naam: string;
    volgorde: number;
}

export interface WinkelProductRij {
    id: string;
    naam: string;
    type: string;
    actief: boolean;
    eenheid: 'stuk' | 'gram';
    voorraad: number | null;
    tht: string | null;
    foto: string | null;
}

export interface PlaatsingRij {
    product_id: string;
    locatie_id: string;
}

/** Een verkoopregel van een afgeronde Toonbank-bon. */
export interface BonRegelRij {
    aantal: number;
    bedrag_cents: number;
    /** De tijd van de bon (toonbank_bonnen.gebeurd_at), ISO. */
    op: string;
    onderdelen: { product_id: string }[] | null;
}

export interface StukRij {
    id: string;
    product_id: string;
    code: string;
    tht: string;
    status: string;
    gewicht_g: number;
    prijs_cents: number;
    partij_id: string | null;
}

export type Trend = 'op' | 'neer' | 'gelijk' | null;

export interface ProductCijfers {
    verkocht7: number;
    verkocht28: number;
    omzet7_cents: number;
    omzet28_cents: number;
    laatsteVerkoop: string | null;
}

export interface AfdelingTegel {
    afdeling: Afdeling;
    producten: number;
    omzet7_cents: number;
    omzetVorige7_cents: number;
    verkocht7: number;
    trend: Trend;
    bijna: number;
    over: number;
}

export type Urgentie = 'over' | 'vandaag' | 'morgen' | 'bijna' | 'later';

/** JJJJ-MM-DD in Nederlandse tijd. */
export function datumNL(d: Date): string {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Amsterdam', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

/** Dagen van vandaag tot de THT (negatief = al over). Beide als JJJJ-MM-DD. */
export function dagenTot(tht: string, vandaag: string): number {
    return Math.round((Date.parse(`${tht}T12:00:00Z`) - Date.parse(`${vandaag}T12:00:00Z`)) / 86_400_000);
}

export function urgentie(tht: string, vandaag: string): Urgentie {
    const d = dagenTot(tht, vandaag);
    if (d < 0) return 'over';
    if (d === 0) return 'vandaag';
    if (d === 1) return 'morgen';
    if (d <= BIJNA_DAGEN) return 'bijna';
    return 'later';
}

/** Bij welk product hoort deze regel? Null bij een pakket of een open prijs. */
export function productVanRegel(r: Pick<BonRegelRij, 'onderdelen'>): string | null {
    const ids = new Set((r.onderdelen ?? []).map((o) => o.product_id).filter(Boolean));
    return ids.size === 1 ? [...ids][0]! : null;
}

function binnen(op: string, nu: Date, vanDagen: number, totDagen: number): boolean {
    const t = Date.parse(op);
    const dag = 86_400_000;
    return t <= nu.getTime() - totDagen * dag && t > nu.getTime() - vanDagen * dag;
}

/** De cijfers van één product uit de regels die bij dat product horen. */
export function productCijfers(regels: readonly BonRegelRij[], nu: Date): ProductCijfers {
    const uit: ProductCijfers = { verkocht7: 0, verkocht28: 0, omzet7_cents: 0, omzet28_cents: 0, laatsteVerkoop: null };
    for (const r of regels) {
        if (binnen(r.op, nu, 7, 0)) { uit.verkocht7 += r.aantal; uit.omzet7_cents += r.bedrag_cents; }
        if (binnen(r.op, nu, 28, 0)) { uit.verkocht28 += r.aantal; uit.omzet28_cents += r.bedrag_cents; }
        if (r.aantal > 0 && (!uit.laatsteVerkoop || r.op > uit.laatsteVerkoop)) uit.laatsteVerkoop = r.op;
    }
    return uit;
}

/** Regels per product; pakketten apart. */
export function regelsPerProduct(regels: readonly BonRegelRij[]): { perProduct: Map<string, BonRegelRij[]>; pakketten: BonRegelRij[] } {
    const perProduct = new Map<string, BonRegelRij[]>();
    const pakketten: BonRegelRij[] = [];
    for (const r of regels) {
        const p = productVanRegel(r);
        if (!p) { pakketten.push(r); continue; }
        const lijst = perProduct.get(p);
        if (lijst) lijst.push(r); else perProduct.set(p, [r]);
    }
    return { perProduct, pakketten };
}

export function trendVan(nu: number, vorige: number): Trend {
    if (nu === 0 && vorige === 0) return null;
    /* Binnen 5 %: gelijk. Zo springt de pijl niet bij een paar euro. */
    const marge = Math.max(Math.abs(vorige) * 0.05, 100);
    if (nu > vorige + marge) return 'op';
    if (nu < vorige - marge) return 'neer';
    return 'gelijk';
}

/** De afdeling van elk product (de eerste verkoopplek). */
export function afdelingVan(plaatsingen: readonly PlaatsingRij[], afdelingIds: ReadonlySet<string>): Map<string, string> {
    const uit = new Map<string, string>();
    for (const p of plaatsingen) {
        if (afdelingIds.has(p.locatie_id) && !uit.has(p.product_id)) uit.set(p.product_id, p.locatie_id);
    }
    return uit;
}

/** De tegels: één per afdeling, in de volgorde van de winkel. */
export function afdelingTegels(
    afdelingen: readonly Afdeling[],
    plaatsingen: readonly PlaatsingRij[],
    producten: readonly WinkelProductRij[],
    regels: readonly BonRegelRij[],
    stuks: readonly StukRij[],
    nu: Date,
): AfdelingTegel[] {
    const vandaag = datumNL(nu);
    const ids = new Set(afdelingen.map((a) => a.id));
    const plek = afdelingVan(plaatsingen, ids);
    const { perProduct } = regelsPerProduct(regels);
    const productOp = new Map(producten.map((p) => [p.id, p]));

    return [...afdelingen]
        .sort((a, b) => a.volgorde - b.volgorde || a.naam.localeCompare(b.naam, 'nl'))
        .map((afdeling) => {
            const hier = [...plek].filter(([, l]) => l === afdeling.id).map(([pid]) => pid);
            let omzet7 = 0, vorige7 = 0, verkocht7 = 0, bijna = 0, over = 0;
            for (const pid of hier) {
                for (const r of perProduct.get(pid) ?? []) {
                    if (binnen(r.op, nu, 7, 0)) { omzet7 += r.bedrag_cents; verkocht7 += r.aantal; }
                    else if (binnen(r.op, nu, 14, 7)) vorige7 += r.bedrag_cents;
                }
            }
            const hierSet = new Set(hier);
            for (const s of stuks) {
                if (s.status !== 'op_voorraad' || !hierSet.has(s.product_id)) continue;
                const u = urgentie(s.tht, vandaag);
                if (u === 'over') over++;
                else if (u !== 'later') bijna++;
            }
            return {
                afdeling,
                producten: hier.filter((pid) => productOp.get(pid)?.actief).length,
                omzet7_cents: omzet7,
                omzetVorige7_cents: vorige7,
                verkocht7,
                trend: trendVan(omzet7, vorige7),
                bijna,
                over,
            };
        });
}

export interface DatumGroep {
    product_id: string;
    tht: string;
    urgentie: Urgentie;
    stuks: StukRij[];
}

/** De stuks die nog liggen, per product en THT, vroegste eerst. */
export function datumGroepen(stuks: readonly StukRij[], nu: Date, alleenUrgent = false): DatumGroep[] {
    const vandaag = datumNL(nu);
    const op = new Map<string, DatumGroep>();
    for (const s of stuks) {
        if (s.status !== 'op_voorraad') continue;
        const u = urgentie(s.tht, vandaag);
        if (alleenUrgent && u === 'later') continue;
        const sleutel = `${s.product_id}|${s.tht}`;
        const g = op.get(sleutel);
        if (g) g.stuks.push(s);
        else op.set(sleutel, { product_id: s.product_id, tht: s.tht, urgentie: u, stuks: [s] });
    }
    return [...op.values()].sort((a, b) => a.tht.localeCompare(b.tht) || a.product_id.localeCompare(b.product_id));
}
