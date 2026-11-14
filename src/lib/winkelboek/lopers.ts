/**
 * Hardlopers, trage lopers en wat stilligt (ontwerp R5). Zuiver: krijgt per
 * product wat er in het venster verkocht is en wat er ligt.
 *
 * Regels
 *  - Venster: de laatste 28 kalenderdagen.
 *  - Ligt stil: niets verkocht en wel voorraad. Zonder verkoop en zonder
 *    voorraad (nul of nog niet geteld) staat een product in geen enkele groep.
 *  - De rest, aflopend op omzet: zolang het opgetelde aandeel vóór het product
 *    onder 80% ligt is het een hardloper, onder 95% middenmoot, daarna traag.
 *    Het product dat de 80% overschrijdt is zelf dus nog hardloper.
 *  - Genoeg voor = voorraad ÷ (verkocht ÷ verkoopdagen), alleen per stuk: bij
 *    een product op gewicht is "verkocht" het aantal bakjes en de voorraad in
 *    gram, en die twee zijn niet te vergelijken.
 *  - Staat de voorraad onder nul (er is meer verkocht dan er is ingeboekt), dan
 *    is niet te zeggen hoe lang het nog reikt: geen dagen, wel het advies om
 *    te tellen.
 *  - Een trage loper die bijna op is krijgt geen advies: er valt niets af te
 *    prijzen.
 *  - Voorlopig zolang de winkel nog geen 28 dagen verkoopt, geteld vanaf de
 *    eerste verkoopdag (dus ook met sluitingsdagen na vier weken definitief).
 */
import { productVanRegel } from '@/lib/winkel/afdelingen';
import { exclUitIncl, type VerkoopRegel } from './verkoop';

export const LOPER_VENSTER_DAGEN = 28;
export const KRAP_DAGEN = 3;
const A_GRENS = 0.8;
const B_GRENS = 0.95;

export interface LoperInvoer {
    product_id: string;
    naam: string;
    afdeling: string;
    eenheid: 'stuk' | 'gram';
    voorraad: number | null;
    voorraad_waarde_cents: number | null;
    tht: string | null;
    verkocht: number;
    omzet_cents: number;
    marge_cents: number | null;
    /** De marge is (deels) gerekend met de inkoopprijs van nu, omdat de voorraad niet was afgeboekt. */
    marge_geschat?: boolean;
}

export type LoperGroep = 'hard' | 'midden' | 'traag' | 'stil';
export type LoperActie = 'bijbestellen' | 'afprijzen' | 'uit_assortiment' | 'tellen';

export interface Loper extends LoperInvoer {
    groep: LoperGroep;
    dagen_voorraad: number | null;
    krap: boolean;
    /** Er is meer verkocht dan er is ingeboekt: de voorraad in het systeem klopt niet. */
    onder_nul: boolean;
    actie: LoperActie | null;
}

export interface LoperDagen {
    /** Verschillende bedrijfsdagen met verkoop in het venster; de deler voor "genoeg voor". */
    verkoopdagen: number;
    /** Kalenderdagen sinds de eerste verkoopdag ooit, vandaag meegeteld; 0 zonder verkoop. */
    dagen_open: number;
}

export interface Lopers {
    /** dagen_open < 28 */
    voorlopig: boolean;
    verkoopdagen: number;
    dagen_open: number;
    /** Per groep aflopend op omzet; stil aflopend op voorraadwaarde. */
    lijst: Loper[];
    aantallen: Record<LoperGroep, number>;
    /** null zodra één stilliggend product geen waarde heeft. */
    stil_waarde_cents: number | null;
}

const VOLGORDE: Record<LoperGroep, number> = { hard: 0, midden: 1, traag: 2, stil: 3 };

export function deelLopersIn(producten: readonly LoperInvoer[], dagen: LoperDagen): Lopers {
    const verkocht = producten.filter((p) => p.verkocht > 0).sort((a, b) => b.omzet_cents - a.omzet_cents || a.naam.localeCompare(b.naam));
    const stil = producten
        .filter((p) => p.verkocht <= 0 && p.voorraad !== null && p.voorraad > 0)
        .sort((a, b) => (b.voorraad_waarde_cents ?? -1) - (a.voorraad_waarde_cents ?? -1) || a.naam.localeCompare(b.naam));

    const totaal = verkocht.reduce((s, p) => s + Math.max(p.omzet_cents, 0), 0);
    const lijst: Loper[] = [];
    let ervoor = 0;

    for (const p of verkocht) {
        const aandeelErvoor = totaal > 0 ? ervoor / totaal : 0;
        const groep: LoperGroep = aandeelErvoor < A_GRENS ? 'hard' : aandeelErvoor < B_GRENS ? 'midden' : 'traag';
        ervoor += Math.max(p.omzet_cents, 0);

        const perDag = dagen.verkoopdagen > 0 ? p.verkocht / dagen.verkoopdagen : 0;
        const onder_nul = p.voorraad !== null && p.voorraad < 0;
        const dagen_voorraad = !onder_nul && p.eenheid === 'stuk' && p.voorraad !== null && perDag > 0 ? Math.floor(p.voorraad / perDag) : null;
        const krap = dagen_voorraad !== null && dagen_voorraad < KRAP_DAGEN;
        const actie: LoperActie | null = onder_nul ? 'tellen'
            : groep === 'traag' ? (krap ? null : 'afprijzen')
            : krap ? 'bijbestellen' : null;
        lijst.push({ ...p, groep, dagen_voorraad, krap, onder_nul, actie });
    }
    for (const p of stil) lijst.push({ ...p, groep: 'stil', dagen_voorraad: null, krap: false, onder_nul: false, actie: 'uit_assortiment' });

    lijst.sort((a, b) => VOLGORDE[a.groep] - VOLGORDE[b.groep]);

    const aantallen: Record<LoperGroep, number> = { hard: 0, midden: 0, traag: 0, stil: 0 };
    for (const l of lijst) aantallen[l.groep] += 1;

    const stil_waarde_cents = stil.some((p) => p.voorraad_waarde_cents === null) ? null : stil.reduce((s, p) => s + (p.voorraad_waarde_cents ?? 0), 0);

    return {
        voorlopig: dagen.dagen_open < LOPER_VENSTER_DAGEN,
        verkoopdagen: dagen.verkoopdagen,
        dagen_open: dagen.dagen_open,
        lijst, aantallen, stil_waarde_cents,
    };
}

export type LoperKeuze = 'hard' | 'traag' | 'stil';

/**
 * Wat er onder een keuze op het scherm staat. Een artikel uit de middenmoot
 * waar iets mee moet (bijna op, of de voorraad staat onder nul) staat bij de
 * hardlopers: de middenmoot heeft geen eigen lijst (ontwerp R5).
 */
export function lopersVoorKeuze(lopers: Lopers, keuze: LoperKeuze): Loper[] {
    if (keuze !== 'hard') return lopers.lijst.filter((l) => l.groep === keuze);
    return lopers.lijst.filter((l) => l.groep === 'hard' || (l.groep === 'midden' && l.actie !== null));
}

/** Het aantal middenmoters dat gewoon doorloopt en dus nergens in een lijst staat. */
export function middenLooptDoor(lopers: Lopers): number {
    return lopers.lijst.filter((l) => l.groep === 'midden' && l.actie === null).length;
}

/** Telt per product verkocht, omzet (incl. btw) en marge uit regels met precies één product. */
export function cijfersPerProduct(regels: readonly VerkoopRegel[]): Map<string, { verkocht: number; omzet_cents: number; marge_cents: number | null; geschat: boolean }> {
    interface Som { verkocht: number; omzet: number; incl: Map<number, number>; inkoop: number | null; geschat: boolean }
    const per = new Map<string, Som>();
    for (const r of regels) {
        const productId = productVanRegel({ onderdelen: r.onderdelen });
        if (!productId) continue;
        let s = per.get(productId);
        if (!s) { s = { verkocht: 0, omzet: 0, incl: new Map(), inkoop: 0, geschat: false }; per.set(productId, s); }
        s.verkocht += r.aantal;
        s.omzet += r.bedrag_cents;
        const delen = r.btw && r.btw.length > 0 ? r.btw : [{ pct: 0, incl_cents: r.bedrag_cents }];
        for (const d of delen) s.incl.set(d.pct, (s.incl.get(d.pct) ?? 0) + d.incl_cents);
        if (r.inkoop_cents === null || s.inkoop === null) s.inkoop = null;
        else s.inkoop += r.inkoop_cents;
        if (r.inkoop_bron === 'prijs_nu') s.geschat = true;
    }
    return new Map([...per.entries()].map(([id, s]) => {
        const excl = [...s.incl.entries()].reduce((som, [pct, incl]) => som + exclUitIncl(incl, pct), 0);
        return [id, { verkocht: s.verkocht, omzet_cents: s.omzet, marge_cents: s.inkoop === null ? null : excl - s.inkoop, geschat: s.inkoop !== null && s.geschat }];
    }));
}
