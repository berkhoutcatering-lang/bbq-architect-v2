/**
 * "BA weet wat vrij is" (plan v5, BA-5a/5b) — puur: geen database, geen klok.
 *
 * Dezelfde regels als de databasefuncties uit migratie 20261005130000_winkel_vrij:
 *
 *   ligt er       winkel_producten.voorraad (null = niet bijgehouden)
 *   gereserveerd  betaald, of wacht met een lopende reservering, en nog niet
 *                 ingepakt (winkel_bezetting_product)
 *   vrij          ligt er − gereserveerd; mag onder nul (dan komt een order
 *                 tekort, contract §1.9); null = niet bijgehouden
 *
 * Per artikel: het kleinste aantal dat uit de onderdelen te maken is
 * (pakkettenTeMaken) en het artikelquotum. De geheugen-opslag rekent hiermee;
 * de echte opslag laat de database rekenen (winkel_vrij_producten,
 * winkel_vrij_artikelen). supabase/tests/winkel_vrij.sql bewaakt dat die twee
 * hetzelfde zeggen.
 *
 * En twee vertalingen naar woorden:
 *   standVoorWebsite  'onbeperkt' | 'ruim' | 'nog' | 'op' (+ het getal bij 'nog')
 *   kassaPil          de voorraadpil van de Toonbank, met vaste woorden uit
 *                     prototype v4 (V4-Verkopen.dc.html, pillTxt)
 */
import type { Artikel, Product, Slot } from './rekenen';
import { beperkendProduct, pakkettenTeMaken } from './voorraad';

/** Tot en met dit aantal zegt de website "Nog n" en de Toonbank "nog n" (winkel_instellingen.beschikbaar_grens). */
export const BESCHIKBAAR_GRENS = 5;

/** Eén rij van winkel_vrij_producten. */
export interface VrijProduct {
    product_id: string;
    naam: string;
    eenheid: 'stuk' | 'gram';
    /** null = niet bijgehouden. */
    ligt_er: number | null;
    gereserveerd: number;
    /** ligt er − gereserveerd; mag onder nul. null = niet bijgehouden. */
    vrij: number | null;
    bijgehouden: boolean;
}

/** Eén rij van winkel_vrij_artikelen. */
export interface VrijArtikel {
    artikel_id: string;
    slug: string;
    /** Hoeveel er nog te verkopen is (≥ 0). null = geen grens bekend. */
    vrij: number | null;
    /** Het product dat het eerst op is, als de onderdelen de grens zijn. */
    beperkend_product_id: string | null;
    bijgehouden: boolean;
}

/** winkel_voorraad_stand: de teller en wanneer de eerste lopende reservering verloopt. */
export interface VoorraadStand {
    versie: number;
    gewijzigd_at: string | null;
    /** Daarna verandert vrij zonder dat de versie omhooggaat: dan opnieuw ophalen. */
    vrij_verloopt_at: string | null;
}

function rond(n: number): number {
    return Math.round(n * 1000) / 1000;
}

/**
 * Ligt er / gereserveerd / vrij per product. `gereserveerd` per product-id
 * komt van de opslag (dezelfde regel als winkel_bezetting_product).
 * Volgorde: op naam, zoals de databasefunctie.
 */
export function vrijProducten(
    producten: Pick<Product, 'id' | 'naam' | 'eenheid' | 'voorraad'>[],
    gereserveerd: Map<string, number>,
): VrijProduct[] {
    return producten
        .map((p) => {
            const g = rond(gereserveerd.get(p.id) ?? 0);
            return {
                product_id: p.id,
                naam: p.naam,
                eenheid: p.eenheid,
                ligt_er: p.voorraad,
                gereserveerd: g,
                vrij: p.voorraad == null ? null : rond(p.voorraad - g),
                bijgehouden: p.voorraad != null,
            };
        })
        .sort((a, b) => (a.naam < b.naam ? -1 : a.naam > b.naam ? 1 : a.product_id < b.product_id ? -1 : 1));
}

/**
 * Vrij per artikel = het kleinste van
 *   - de onderdelen: pakkettenTeMaken (geen slots of niets bijgehouden: geen
 *     grens; een slot zonder product: 0);
 *   - het quotum: winkel_artikelen.voorraad − voorraad_bezet (≥ 0; null = geen grens).
 * beperkend_product_id alleen als de onderdelen de grens zijn (en geen slot leeg is).
 */
export function vrijArtikel(
    artikel: Pick<Artikel, 'id' | 'slug' | 'voorraad' | 'voorraad_bezet'>,
    slots: Slot[],
    producten: VrijProduct[],
): VrijArtikel {
    const p = producten.map((x) => ({ id: x.product_id, naam: x.naam, voorraad: x.ligt_er, voorraad_bezet: x.gereserveerd }));
    const eigen = slots.filter((s) => s.artikel_id === artikel.id).sort((a, b) => a.volgorde - b.volgorde);
    const leegSlot = eigen.some((s) => !s.standaard_product_id);
    const uitOnderdelen = pakkettenTeMaken(artikel.id, eigen, p);
    const uitQuotum = artikel.voorraad == null ? null : Math.max(0, artikel.voorraad - (artikel.voorraad_bezet ?? 0));
    const grenzen = [uitOnderdelen, uitQuotum].filter((n): n is number => n != null);
    const vrij = grenzen.length ? Math.min(...grenzen) : null;
    const onderdelenBepalen = !leegSlot && uitOnderdelen != null && (uitQuotum == null || uitOnderdelen <= uitQuotum);
    return {
        artikel_id: artikel.id,
        slug: artikel.slug,
        vrij,
        beperkend_product_id: onderdelenBepalen ? beperkendProduct(artikel.id, eigen, p)?.id ?? null : null,
        bijgehouden: vrij != null,
    };
}

export function vrijArtikelen(
    artikelen: Pick<Artikel, 'id' | 'slug' | 'voorraad' | 'voorraad_bezet'>[],
    slots: Slot[],
    producten: VrijProduct[],
): VrijArtikel[] {
    return artikelen
        .map((a) => vrijArtikel(a, slots, producten))
        .sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
}

/* ── Woorden ──────────────────────────────────────────────────────────────── */

export type WebsiteStand = 'onbeperkt' | 'ruim' | 'nog' | 'op';

/**
 * Wat de website over één artikel te horen krijgt (BA-5b). Alleen bij 'nog'
 * komt er een getal mee; boven de grens zegt BA niet hoeveel er ligt.
 *   niet bijgehouden → onbeperkt (de website toont niets en begrenst niets)
 *   vrij ≤ 0         → op
 *   vrij ≤ grens     → nog n
 *   anders           → ruim
 */
export function standVoorWebsite(vrij: number | null, bijgehouden: boolean, grens: number = BESCHIKBAAR_GRENS): { stand: WebsiteStand; nog: number | null } {
    if (!bijgehouden || vrij == null) return { stand: 'onbeperkt', nog: null };
    const n = Math.max(0, Math.floor(vrij));
    if (n <= 0) return { stand: 'op', nog: 0 };
    if (n <= grens) return { stand: 'nog', nog: n };
    return { stand: 'ruim', nog: null };
}

export type PilSoort = 'op' | 'tekort' | 'webshop' | 'nog' | 'ruim';

/**
 * De voorraadpil van de Toonbank (contract §1.9, prototype v4 pillTxt). De
 * eerste regel die past:
 *   ligt er ≤ 0                    "op"
 *   gereserveerd > ligt er         "y webshop · t tekort"   (aria: "0 vrij · y webshop · t tekort")
 *   gereserveerd > 0               "x vrij · y webshop"
 *   ligt er ≤ grens                "nog n"
 *   anders                         "ruim"
 * "Webshop" = gereserveerd voor een webshoporder en nog niet apart gezet.
 * Niet bijgehouden (ligt null): geen pil.
 */
export function kassaPil(ligt: number | null, gereserveerd: number, grens: number = BESCHIKBAAR_GRENS): { soort: PilSoort; tekst: string; aria: string } | null {
    if (ligt == null) return null;
    const ap = Math.max(0, gereserveerd);
    const vr = Math.max(0, rond(ligt - ap));
    const tk = Math.max(0, rond(ap - ligt));
    if (ligt <= 0) return { soort: 'op', tekst: 'op', aria: 'op' };
    if (ap > 0 && tk > 0) {
        const tekst = `${getal(ap)} webshop · ${getal(tk)} tekort`;
        return { soort: 'tekort', tekst, aria: `0 vrij · ${tekst}` };
    }
    if (ap > 0) {
        const tekst = `${getal(vr)} vrij · ${getal(ap)} webshop`;
        return { soort: 'webshop', tekst, aria: tekst };
    }
    if (ligt <= grens) {
        const tekst = `nog ${getal(ligt)}`;
        return { soort: 'nog', tekst, aria: tekst };
    }
    return { soort: 'ruim', tekst: 'ruim', aria: 'ruim' };
}

/** 4 → "4", 1250 → "1250", 2.5 → "2,5": zoals het prototype, alleen met een komma. */
function getal(n: number): string {
    return rond(n).toLocaleString('nl-NL', { maximumFractionDigits: 3, useGrouping: false });
}
