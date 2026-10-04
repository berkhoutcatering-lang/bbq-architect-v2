/**
 * Winkel bestelt zichzelf bij — de rekenregel. Puur, zonder database.
 * Plan: docs/voorraad-bouwplan.md "Winkel bestellen".
 *
 * Net als de keuken, met de woorden van Mathijs:
 *
 *   minimum        (drempel)   eronder = "tijd om bij te bestellen"
 *   aanvullen tot  (par_niveau)
 *   besteleenheid  (bestel_hoeveelheid): krat van 24, wiel kaas — je kunt
 *                  geen 8 blikjes bestellen, dus 8 nodig = 1 krat (24).
 *
 *   beschikbaar = voorraad − besteld-nog-niet-ingepakt (webshop)
 *   onderweg    = besteld bij de leverancier, nog niet binnen
 *
 *   Trigger:  beschikbaar + onderweg ≤ minimum
 *   Nodig:    aanvullen tot − (beschikbaar + onderweg)
 *             (zonder aanvullen tot: tot net boven het minimum)
 *   Besteld:  omhoog afgerond op hele besteleenheden (roundUpToPack, net als
 *             de keuken).
 *
 * Niet bijgehouden (voorraad NULL) of geen minimum: geen voorstel. Geen gok.
 */
import { roundUpToPack } from '@/lib/dal/packRounding';
import { beschikbaar, hoeveelheidKort } from './voorraad';

export interface BestelProduct {
    id: string;
    naam: string;
    eenheid: 'stuk' | 'gram';
    voorraad: number | null;
    /** Besteld en nog niet ingepakt (webshop). */
    voorraad_bezet?: number;
    /** Het minimum: eigen getal, anders het voorstel (genoeg voor 5 pakketten). */
    minimum: number | null;
    par_niveau: number | null;
    bestel_hoeveelheid: number | null;
    bestel_eenheid_naam: string | null;
    bestel_prijs_cents: number | null;
}

export interface BestelRegel {
    winkel_product_id: string;
    naam: string;
    eenheid: 'stuk' | 'gram';
    nodig: number;
    besteld: number;
    eenheden: number | null;
    /** "1 krat (24)" of null zonder besteleenheid. */
    eenheid_label: string | null;
    zonder_besteleenheid: boolean;
    /** Prijs per voorraad-eenheid in euro (bestel_prijs ÷ besteleenheid), of null. */
    prijs_per_eenheid_eur: number | null;
    uitleg: string;
    beschikbaar: number;
    onderweg: number;
    minimum: number;
    aanvullen_tot: number | null;
}

const rond = (n: number) => Math.round(n * 1000) / 1000;

/** "1 krat (24)", "2 wielen (4 kg)", "3× 24". */
export function besteleenheidLabel(eenheden: number, grootte: number, naam: string | null, eenheid: 'stuk' | 'gram'): string {
    const inhoud = hoeveelheidKort(grootte, eenheid).replace(' st.', '');
    if (!naam) return `${eenheden}× ${inhoud}`;
    const meervoud = eenheden === 1 ? naam : meervoudVan(naam);
    return `${eenheden} ${meervoud} (${inhoud})`;
}

const MEERVOUD: Record<string, string> = {
    krat: 'kratten', wiel: 'wielen', doos: 'dozen', fles: 'flessen', zak: 'zakken', pot: 'potten',
    blik: 'blikken', pak: 'pakken', tray: 'trays', omdoos: 'omdozen', stuk: 'stuks', kist: 'kisten', emmer: 'emmers',
};

function meervoudVan(w: string): string {
    const t = w.trim().toLowerCase();
    if (MEERVOUD[t]) return MEERVOUD[t];
    if (/(en|s)$/.test(t)) return t;
    if (/(e|el|er|em|ie)$/.test(t)) return `${t}s`;
    return `${t}en`;
}

export function bestelVoorstel(p: BestelProduct, onderweg = 0): BestelRegel | null {
    const vrij = beschikbaar(p);
    if (vrij == null || p.minimum == null) return null;
    const stand = rond(vrij + onderweg);
    if (stand > p.minimum) return null;

    const doel = p.par_niveau != null && p.par_niveau > p.minimum ? p.par_niveau : null;
    /* Zonder aanvullen tot: tot net boven het minimum; de afronding maakt er
       minstens één hele besteleenheid van. */
    const nodig = rond(doel != null ? doel - stand : p.minimum - stand + 1);
    if (nodig <= 0) return null;

    const grootte = p.bestel_hoeveelheid != null && p.bestel_hoeveelheid > 0 ? p.bestel_hoeveelheid : null;
    const pak = roundUpToPack(nodig, p.eenheid, { package_size: grootte, package_unit: grootte ? p.eenheid : null, moq_packs: null });
    const label = pak.packs != null && grootte ? besteleenheidLabel(pak.packs, grootte, p.bestel_eenheid_naam, p.eenheid) : null;

    const prijs = p.bestel_prijs_cents != null && grootte ? p.bestel_prijs_cents / 100 / grootte : null;
    const k = (n: number) => hoeveelheidKort(n, p.eenheid);
    const delen = [
        `${k(vrij)} vrij`,
        onderweg > 0 ? `${k(onderweg)} onderweg` : null,
        `minimum ${k(p.minimum)}`,
        doel != null ? `aanvullen tot ${k(doel)}` : null,
    ].filter(Boolean);
    const uitleg = `${delen.join(' · ')} → ${k(nodig)} nodig → ${label ?? `${k(pak.qty_ordered)} (besteleenheid nog invullen)`}`;

    return {
        winkel_product_id: p.id, naam: p.naam, eenheid: p.eenheid,
        nodig, besteld: pak.qty_ordered, eenheden: pak.packs, eenheid_label: label, zonder_besteleenheid: !grootte,
        prijs_per_eenheid_eur: prijs, uitleg, beschikbaar: vrij, onderweg, minimum: p.minimum, aanvullen_tot: doel,
    };
}
