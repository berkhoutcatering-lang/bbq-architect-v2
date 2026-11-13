/**
 * Verkoop per artikel met inkoopwaarde en marge (ontwerp R3). Zuiver: krijgt
 * de verkoopregels van afgeronde Toonbank-bonnen, geeft centen.
 *
 * Regels
 *  - Een tegenbon telt negatief mee (aantal en bedrag staan al negatief).
 *  - Omzet excl. btw per artikel: per tarief de bedragen incl. optellen en dan
 *    één keer omrekenen. De officiële omzet van een periode komt uit
 *    laadToonbank (zelfde bron als de btw-aangifte); de som van de artikelen
 *    kan daar enkele centen van afwijken door afronding per bon.
 *  - Inkoopwaarde per regel wordt per onderdeel (product) bepaald, want de
 *    kassa boekt per regel en per product een voorraadmutatie:
 *      1. geen onderdelen (open prijs) → onbekend;
 *      2. tegenbon zonder goederen terug → 0, de inkoop blijft staan;
 *      3. mutaties van dit product bij deze regel (verkoop_kassa, retour) →
 *         min hun som ("logboek"); één zonder waarde → onbekend;
 *      4. geen mutatie → aantal × hoeveelheid × inkoopprijs van nu ÷ prijs_per
 *         ("prijs_nu"); geen inkoopprijs → onbekend.
 *  - Onbekend is null, nooit nul: een artikel zonder inkoopwaarde heeft geen
 *    marge en telt niet mee in de periodemarge.
 */

export type InkoopBron = 'logboek' | 'prijs_nu';

export interface Onderdeel {
    product_id: string;
    hoeveelheid: number;
    eenheid: string;
}

export interface VerkoopRegel {
    regel_id: number;
    bedrijfsdag: string;
    /** toonbank_bonnen.gebeurd_at */
    op: string;
    artikel_id: string | null;
    naam: string;
    open_prijs_groep: string | null;
    /** Negatief op een tegenbon. */
    aantal: number;
    /** Incl. btw. */
    bedrag_cents: number;
    btw: { pct: number; incl_cents: number }[];
    /** In de database altijd een lijst; leeg bij een open prijs. */
    onderdelen: Onderdeel[] | null;
    /** Alleen op een tegenbon gevuld. */
    goederen_terug: boolean | null;
    inkoop_cents: number | null;
    inkoop_bron: InkoopBron | null;
}

export interface RegelMutatie {
    toonbank_bon_regel_id: number;
    winkel_product_id: string;
    type: string;
    waarde_cents: number | null;
}

export interface ProductPrijs {
    inkoop_excl_cents: number | null;
    prijs_per: number;
}

export interface ArtikelCijfers {
    /** artikel_id of 'open:<groep>' */
    sleutel: string;
    naam: string;
    afdeling: string;
    aantal: number;
    omzet_excl_cents: number;
    inkoop_cents: number | null;
    marge_cents: number | null;
    /** Eén decimaal, bv. 43.7 */
    marge_pct: number | null;
    geschat: boolean;
}

export interface PeriodeMarge {
    /** Alle artikelen, excl. btw. */
    omzet_cents: number;
    /** Alleen artikelen met een marge. */
    inkoop_cents: number;
    marge_cents: number;
    marge_pct: number | null;
    /** Omzet met marge ÷ alle omzet, heel getal. */
    dekking_pct: number | null;
    /** Aantal artikelen. */
    zonder_inkoopprijs: number;
    /** Aantal artikelen. */
    geschat: number;
}

const ONBEKEND = { inkoop_cents: null, inkoop_bron: null } as const;
const TELT_MEE = new Set(['verkoop_kassa', 'retour']);
const eenDecimaal = (n: number) => Math.round(n * 10) / 10;

/** Het bedrag excl. btw uit een bedrag incl.; de btw wordt één keer afgerond, gelijk voor plus en min. */
export function exclUitIncl(incl_cents: number, pct: number): number {
    const btw = Math.sign(incl_cents) * Math.round((Math.abs(incl_cents) * pct) / (100 + pct));
    return incl_cents - btw;
}

export function inkoopVanRegel(
    regel: Pick<VerkoopRegel, 'regel_id' | 'aantal' | 'onderdelen' | 'goederen_terug'>,
    mutaties: readonly RegelMutatie[],
    prijzen: ReadonlyMap<string, ProductPrijs>,
): { inkoop_cents: number | null; inkoop_bron: InkoopBron | null } {
    const onderdelen = regel.onderdelen ?? [];
    if (onderdelen.length === 0) return ONBEKEND;
    if (regel.aantal < 0 && regel.goederen_terug !== true) return { inkoop_cents: 0, inkoop_bron: 'logboek' };

    const perProduct = new Map<string, number>();
    for (const o of onderdelen) perProduct.set(o.product_id, (perProduct.get(o.product_id) ?? 0) + o.hoeveelheid);

    const vanRegel = mutaties.filter((m) => m.toonbank_bon_regel_id === regel.regel_id && TELT_MEE.has(m.type));

    let som = 0;
    let geschat = false;
    for (const [productId, hoeveelheid] of perProduct) {
        const geboekt = vanRegel.filter((m) => m.winkel_product_id === productId);
        if (geboekt.length > 0) {
            for (const m of geboekt) {
                if (m.waarde_cents === null) return ONBEKEND;
                som -= m.waarde_cents;
            }
            continue;
        }
        const prijs = prijzen.get(productId);
        if (!prijs || prijs.inkoop_excl_cents === null || prijs.inkoop_excl_cents === undefined || !(prijs.prijs_per > 0)) return ONBEKEND;
        som += Math.round((regel.aantal * hoeveelheid * prijs.inkoop_excl_cents) / prijs.prijs_per);
        geschat = true;
    }
    return { inkoop_cents: som, inkoop_bron: geschat ? 'prijs_nu' : 'logboek' };
}

function afdelingVan(regel: VerkoopRegel, afdelingVanProduct: ReadonlyMap<string, string>): string {
    if (!regel.artikel_id) return 'Open prijs';
    const producten = new Set((regel.onderdelen ?? []).map((o) => o.product_id));
    if (producten.size > 1) return 'Pakketten';
    const enige = [...producten][0];
    return (enige && afdelingVanProduct.get(enige)) || 'Zonder afdeling';
}

/** Per artikel: verkocht, omzet excl. btw, inkoopwaarde en marge. Grootste omzet eerst. */
export function verkoopPerArtikel(regels: readonly VerkoopRegel[], afdelingVanProduct: ReadonlyMap<string, string>): ArtikelCijfers[] {
    interface Som { naam: string; afdeling: string; aantal: number; incl: Map<number, number>; inkoop: number | null; geschat: boolean }
    const per = new Map<string, Som>();

    for (const r of regels) {
        const sleutel = r.artikel_id ?? `open:${r.open_prijs_groep ?? 'overig'}`;
        let s = per.get(sleutel);
        if (!s) {
            s = {
                naam: r.artikel_id ? r.naam : `Open prijs · ${r.open_prijs_groep ?? 'overig'}`,
                afdeling: afdelingVan(r, afdelingVanProduct),
                aantal: 0, incl: new Map(), inkoop: 0, geschat: false,
            };
            per.set(sleutel, s);
        }
        s.aantal += r.aantal;
        const delen = r.btw && r.btw.length > 0 ? r.btw : [{ pct: 0, incl_cents: r.bedrag_cents }];
        for (const d of delen) s.incl.set(d.pct, (s.incl.get(d.pct) ?? 0) + d.incl_cents);
        if (r.inkoop_cents === null || s.inkoop === null) s.inkoop = null;
        else s.inkoop += r.inkoop_cents;
        if (r.inkoop_bron === 'prijs_nu') s.geschat = true;
    }

    return [...per.entries()]
        .map(([sleutel, s]): ArtikelCijfers => {
            const omzet = [...s.incl.entries()].reduce((som, [pct, incl]) => som + exclUitIncl(incl, pct), 0);
            const marge = s.inkoop === null ? null : omzet - s.inkoop;
            return {
                sleutel, naam: s.naam, afdeling: s.afdeling, aantal: s.aantal,
                omzet_excl_cents: omzet,
                inkoop_cents: s.inkoop,
                marge_cents: marge,
                marge_pct: marge === null || omzet <= 0 ? null : eenDecimaal((marge / omzet) * 100),
                geschat: s.inkoop !== null && s.geschat,
            };
        })
        .sort((a, b) => b.omzet_excl_cents - a.omzet_excl_cents || a.naam.localeCompare(b.naam));
}

/** De marge van een periode: alleen over artikelen die een marge hebben, met de dekking erbij. */
export function periodeMarge(artikelen: readonly ArtikelCijfers[]): PeriodeMarge {
    let omzet = 0;
    let omzetBekend = 0;
    let inkoop = 0;
    let marge = 0;
    let zonder = 0;
    let geschat = 0;
    for (const a of artikelen) {
        omzet += a.omzet_excl_cents;
        if (a.marge_cents === null || a.inkoop_cents === null) { zonder += 1; continue; }
        omzetBekend += a.omzet_excl_cents;
        inkoop += a.inkoop_cents;
        marge += a.marge_cents;
        if (a.geschat) geschat += 1;
    }
    return {
        omzet_cents: omzet,
        inkoop_cents: inkoop,
        marge_cents: marge,
        marge_pct: omzetBekend > 0 ? eenDecimaal((marge / omzetBekend) * 100) : null,
        dekking_pct: omzet > 0 ? Math.round((omzetBekend / omzet) * 100) : null,
        zonder_inkoopprijs: zonder,
        geschat,
    };
}
