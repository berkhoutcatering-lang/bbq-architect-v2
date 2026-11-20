/**
 * De lijst op /voorraad/winkel/codes: welke producten een streepjescode
 * horen te krijgen, welke de kassa ook echt kan vinden, en welk product na
 * een scan aan de beurt is. Geen database, geen scherm.
 */

export interface CodeProductRij {
    id: string;
    naam: string;
    type: string;
    ean: string | null;
    actief: boolean;
    eenheid: string;
    binnen_per_sticker: boolean;
    prijscode_nr: number | null;
}

/**
 * Een EAN hoort bij losse, verpakte producten. Niet bij wat op gewicht gaat
 * (de Toonbank weegt en stickert het) en niet bij pakjes met een prijssticker
 * van de slager (die scan je via prijscode_nr).
 */
export function krijgtStreepjescode(p: Pick<CodeProductRij, 'actief' | 'eenheid' | 'binnen_per_sticker' | 'prijscode_nr'>): boolean {
    return p.actief && p.eenheid !== 'gram' && !p.binnen_per_sticker && p.prijscode_nr == null;
}

export interface KassaArtikel { id: string; kanalen: string[] | null; prijs_cents: number | null }
export interface KassaSlot { artikel_id: string; standaard_product_id: string | null; hoeveelheid: number | string }

/**
 * De producten die de kassa via hun EAN kan vinden. Dezelfde regel als
 * scan_resolve en de codes in toonbank_catalogus: een artikel op de Toonbank
 * met een prijs en precies één onderdeel, van 1 stuk van dit product.
 */
export function productenOpKassa(artikelen: readonly KassaArtikel[], slots: readonly KassaSlot[]): Set<string> {
    const opToonbank = new Set(artikelen.filter((a) => (a.kanalen ?? []).includes('toonbank') && a.prijs_cents != null).map((a) => a.id));
    const perArtikel = new Map<string, KassaSlot[]>();
    for (const s of slots) {
        if (!opToonbank.has(s.artikel_id)) continue;
        const lijst = perArtikel.get(s.artikel_id) ?? [];
        lijst.push(s);
        perArtikel.set(s.artikel_id, lijst);
    }
    const uit = new Set<string>();
    for (const lijst of perArtikel.values()) {
        if (lijst.length !== 1) continue;
        const [s] = lijst;
        if (s.standaard_product_id && Number(s.hoeveelheid) === 1) uit.add(s.standaard_product_id);
    }
    return uit;
}

/**
 * Na een geslaagde scan: het eerstvolgende product in de lijst ná `id` dat
 * niet in `overslaan` staat, of null als `id` het laatste was. `lijst` is de
 * lijst zoals hij op het scherm stond vóór de scan.
 */
export function volgendeNa(lijst: readonly { id: string }[], id: string, overslaan: ReadonlySet<string> = new Set()): string | null {
    const i = lijst.findIndex((p) => p.id === id);
    if (i < 0) return null;
    for (let j = i + 1; j < lijst.length; j++) if (!overslaan.has(lijst[j].id)) return lijst[j].id;
    return null;
}
