/**
 * De rekenregels van de winkelvoorraad (plan docs/voorraad-bouwplan.md §3).
 *
 * Puur: geen database, geen klok. Het schrijven gebeurt in de databasefuncties
 * winkel_muteer_voorraad en voorraad_overboeken; hier staat wat een scherm of
 * een melding daarvan afleidt.
 *
 *   aanwezig      = winkel_producten.voorraad (de som van het logboek)
 *   gereserveerd  = besteld en nog niet ingepakt (voorraad_bezet)
 *   beschikbaar   = aanwezig − gereserveerd; kan negatief zijn, en dan is
 *                   dat een tekort dat gemeld wordt — nooit stil op nul.
 *
 * null betekent overal: niet bijgehouden. Een getal wordt nooit geraden.
 */
import type { Product, Slot } from './rekenen';
import { tekortTekst } from './wegzetten';

/** Hoeveel pakketten van het voorstel voor de drempel (antwoord Mathijs, 26 sep). */
export const DREMPEL_PAKKETTEN = 5;

export type Mutatietype = 'telling' | 'ontvangst' | 'overboeking' | 'verkoop_online' | 'verkoop_kassa' | 'retour' | 'afwijking';
export type Afwijkingsreden = 'eigen_gebruik' | 'proeven' | 'derving_breuk' | 'derving_tht' | 'keuken_verbruik';
export type Reden = Afwijkingsreden | 'manko' | 'telling_meer';

export const AFWIJKINGSREDENEN: { reden: Afwijkingsreden; label: string; voorbeeld: string }[] = [
    { reden: 'eigen_gebruik', label: 'Eigen gebruik', voorbeeld: '1 fles wijn mee naar huis' },
    { reden: 'proeven', label: 'Proeven / monster', voorbeeld: '2 bieren proeverij klant' },
    { reden: 'derving_breuk', label: 'Kapot', voorbeeld: '1 fles gebroken' },
    { reden: 'derving_tht', label: 'Over datum', voorbeeld: '3 worsten weggegooid' },
    { reden: 'keuken_verbruik', label: 'Keuken / catering', voorbeeld: '1 pot marmelade voor catering' },
];

export const TYPE_LABEL: Record<Mutatietype, string> = {
    telling: 'Telling',
    ontvangst: 'Ontvangst',
    overboeking: 'Overboeking',
    verkoop_online: 'Verkocht online',
    verkoop_kassa: 'Verkocht kassa',
    retour: 'Retour',
    afwijking: 'Afwijking',
};

export const REDEN_LABEL: Record<Reden, string> = {
    eigen_gebruik: 'eigen gebruik',
    proeven: 'proeven',
    derving_breuk: 'kapot',
    derving_tht: 'over datum',
    keuken_verbruik: 'keuken / catering',
    manko: 'manko',
    telling_meer: 'meer geteld',
};

export type VoorraadProduct = Pick<Product, 'id' | 'naam' | 'eenheid' | 'voorraad' | 'voorraad_bezet'> & { drempel?: number | null };

/** Besteld en nog niet ingepakt. 0 als er niets gereserveerd is. */
export function gereserveerd(p: Pick<Product, 'voorraad_bezet'>): number {
    return p.voorraad_bezet ?? 0;
}

/** Aanwezig − gereserveerd; null = niet bijgehouden. */
export function beschikbaar(p: Pick<Product, 'voorraad' | 'voorraad_bezet'>): number | null {
    if (p.voorraad == null) return null;
    return rond(p.voorraad - gereserveerd(p));
}

/** Per product wat één stuk van het artikel vraagt (slots bij elkaar opgeteld). */
function vraagPerStuk(artikelId: string, slots: Slot[]): Map<string, number> {
    const m = new Map<string, number>();
    for (const s of slots) {
        if (s.artikel_id !== artikelId || !s.standaard_product_id) continue;
        m.set(s.standaard_product_id, (m.get(s.standaard_product_id) ?? 0) + s.hoeveelheid);
    }
    return m;
}

/**
 * Hoeveel pakketten (of, voor de plank, personen) er nog te maken zijn: het
 * kleinste over de producten in de slots. null = geen enkel slot wordt
 * bijgehouden (of er zijn geen slots), dus er is geen grens bekend.
 * Een slot zonder product maakt het artikel onverkoopbaar: 0.
 */
export function pakkettenTeMaken(artikelId: string, slots: Slot[], producten: Pick<Product, 'id' | 'voorraad' | 'voorraad_bezet'>[]): number | null {
    const eigen = slots.filter((s) => s.artikel_id === artikelId);
    if (eigen.length === 0) return null;
    if (eigen.some((s) => !s.standaard_product_id)) return 0;
    let kleinste: number | null = null;
    for (const [productId, perStuk] of vraagPerStuk(artikelId, slots)) {
        const p = producten.find((x) => x.id === productId);
        const b = p ? beschikbaar(p) : null;
        if (b == null) continue;
        const n = Math.max(0, Math.floor(rond(b / perStuk)));
        kleinste = kleinste == null ? n : Math.min(kleinste, n);
    }
    return kleinste;
}

/** Welk product bepaalt het aantal pakketten (het eerste dat op is), voor "Mr. Hop is op". */
export function beperkendProduct<P extends Pick<Product, 'id' | 'naam' | 'voorraad' | 'voorraad_bezet'>>(artikelId: string, slots: Slot[], producten: P[]): P | null {
    let beste: { p: P; n: number } | null = null;
    for (const [productId, perStuk] of vraagPerStuk(artikelId, slots)) {
        const p = producten.find((x) => x.id === productId);
        const b = p ? beschikbaar(p) : null;
        if (!p || b == null) continue;
        const n = Math.floor(rond(b / perStuk));
        if (beste == null || n < beste.n) beste = { p, n };
    }
    return beste?.p ?? null;
}

/**
 * Het voorstel voor de drempel: genoeg voor 5 pakketten van het artikel dat
 * het meeste van dit product vraagt. null = zit in geen enkel artikel.
 */
export function drempelVoorstel(productId: string, slots: Slot[], actieveArtikelIds?: Set<string>): number | null {
    const perArtikel = new Map<string, number>();
    for (const s of slots) {
        if (s.standaard_product_id !== productId) continue;
        if (actieveArtikelIds && !actieveArtikelIds.has(s.artikel_id)) continue;
        perArtikel.set(s.artikel_id, (perArtikel.get(s.artikel_id) ?? 0) + s.hoeveelheid);
    }
    if (perArtikel.size === 0) return null;
    return rond(Math.max(...perArtikel.values()) * DREMPEL_PAKKETTEN);
}

/** De drempel die geldt: een eigen getal wint van het voorstel. */
export function geldendeDrempel(p: { id: string; drempel?: number | null }, slots: Slot[], actieveArtikelIds?: Set<string>): { waarde: number | null; bron: 'eigen' | 'voorstel' | null } {
    if (p.drempel != null) return { waarde: p.drempel, bron: 'eigen' };
    const v = drempelVoorstel(p.id, slots, actieveArtikelIds);
    return v == null ? { waarde: null, bron: null } : { waarde: v, bron: 'voorstel' };
}

export type Voorraadstatus = 'niet_bijgehouden' | 'tekort' | 'op' | 'laag' | 'ok';

/** Op = niets meer beschikbaar; tekort = er is meer besteld dan er ligt. */
export function voorraadstatus(b: number | null, drempel: number | null): Voorraadstatus {
    if (b == null) return 'niet_bijgehouden';
    if (b < 0) return 'tekort';
    if (b === 0) return 'op';
    if (drempel != null && b <= drempel) return 'laag';
    return 'ok';
}

/**
 * Wat inpakken of uitpakken van één regel boekt (W3) — dezelfde regel als de
 * databasefunctie winkel_zet_klaargezet. Netto: het doel (− de componenten als
 * de regel ingepakt is én de order betaald, anders 0) min wat al voor deze
 * regel geboekt is. Negatief = verkoop_online, positief = retour.
 * Niet bijgehouden en nooit geboekt: niets.
 */
export function regelBoekingen(
    componenten: { product_id: string | null; hoeveelheid: number }[],
    staat: { ingepakt: boolean; betaald: boolean },
    alGeboekt: Map<string, number>,
    bijgehouden: (productId: string) => boolean,
): { product_id: string; hoeveelheid: number; type: 'verkoop_online' | 'retour' }[] {
    const doel = new Map<string, number>();
    if (staat.ingepakt && staat.betaald) {
        for (const c of componenten) if (c.product_id) doel.set(c.product_id, rond((doel.get(c.product_id) ?? 0) - c.hoeveelheid));
    }
    const ids = [...new Set([...doel.keys(), ...alGeboekt.keys()])].sort();
    const uit: { product_id: string; hoeveelheid: number; type: 'verkoop_online' | 'retour' }[] = [];
    for (const id of ids) {
        const geboekt = alGeboekt.get(id) ?? 0;
        const delta = rond((doel.get(id) ?? 0) - geboekt);
        if (delta === 0 || (!bijgehouden(id) && geboekt === 0)) continue;
        uit.push({ product_id: id, hoeveelheid: delta, type: delta < 0 ? 'verkoop_online' : 'retour' });
    }
    return uit;
}

/** Waarde tegen inkoopprijs in centen; null als de inkoopprijs onbekend is. Zelfde som als de databasefunctie. */
export function waardeCenten(p: Pick<Product, 'inkoop_excl_cents' | 'prijs_per'>, hoeveelheid: number): number | null {
    if (p.inkoop_excl_cents == null) return null;
    return Math.round((hoeveelheid * p.inkoop_excl_cents) / p.prijs_per);
}

/** "450 g", "1,2 kg", "15 st." */
export function hoeveelheidKort(n: number, eenheid: 'stuk' | 'gram'): string {
    if (eenheid === 'gram') {
        if (Math.abs(n) >= 1000) return `${(n / 1000).toLocaleString('nl-NL', { maximumFractionDigits: 2 })} kg`;
        return `${n.toLocaleString('nl-NL', { maximumFractionDigits: 1 })} g`;
    }
    return `${n.toLocaleString('nl-NL', { maximumFractionDigits: 2 })} st.`;
}

/**
 * De foutcodes van de databasefuncties in mensentaal. De code staat altijd in
 * de SQLSTATE (error.code): WV001–WV011, ook WV010 en WV011 (migratie
 * 20261005140000). Alleen daarop wordt vertaald, net als straks in de
 * Toonbank-API; de tekst van de melding telt niet. `details` is wat
 * PostgREST uit DETAIL doorgeeft; bij WV010 is dat JSON met de tekorten.
 */
export function voorraadFout(code: string | undefined, bericht: string, details?: string | null): string {
    const wv = code && /^WV\d{3}$/.test(code) ? code : undefined;
    switch (wv) {
        case 'WV001': return `Dat kan niet: dan komt de voorraad onder nul. ${bericht.replace(/^onder nul[^:]*: /, '')}`;
        case 'WV002': return 'Dit product wordt nog niet bijgehouden. Tel het eerst.';
        case 'WV003': return 'De voorraad verandert alleen via tellen, ontvangst, overboeken of een afwijking.';
        case 'WV004': return `De eenheden passen niet op elkaar: ${bericht}`;
        case 'WV005': return bericht;
        case 'WV006': return 'Deze order is (nog) niet betaald. Er is niets ingepakt of apart gezet.';
        case 'WV010': {
            const tekorten = tekortenUitDetails(details);
            const wat = tekorten.length ? `${tekortTekst(tekorten)}. ` : '';
            return `Te weinig op het schap om apart te zetten. ${wat}Er is niets apart gezet: tel het schap en corrigeer de voorraad.`;
        }
        case 'WV011': return 'Deze order is al opgehaald: apart zetten kan niet meer terug. Klopt de voorraad niet, tel dan opnieuw.';
        default: return bericht;
    }
}

/** De tekorten uit de DETAIL van WV010 ({tekorten: [{naam, ligt_er, nodig}]}); leeg als het geen JSON is. */
function tekortenUitDetails(details: string | null | undefined): { naam: string; ligt_er: number; nodig: number }[] {
    if (!details) return [];
    try {
        const d = JSON.parse(details) as { tekorten?: unknown };
        if (!Array.isArray(d.tekorten)) return [];
        return d.tekorten
            .filter((t): t is Record<string, unknown> => !!t && typeof t === 'object')
            .map((t) => ({ naam: String(t.naam ?? ''), ligt_er: Number(t.ligt_er), nodig: Number(t.nodig) }))
            .filter((t) => t.naam !== '' && Number.isFinite(t.ligt_er) && Number.isFinite(t.nodig));
    } catch {
        return [];
    }
}

function rond(n: number): number {
    return Math.round(n * 1000) / 1000;
}
