/**
 * Welke voorraadmeldingen er nu "aan" horen te staan (W4) — puur, zonder
 * database. meldingen.ts vergelijkt dit met wat al aan stond en maakt alleen
 * van nieuwe een melding: één keer per keer dat iets onder de grens zakt.
 *
 * Plan: docs/voorraad-bouwplan.md §3 W4.
 */
import type { Product, Slot } from '@/lib/winkel/rekenen';
import { beperkendProduct, beschikbaar, geldendeDrempel, hoeveelheidKort, pakkettenTeMaken } from '@/lib/winkel/voorraad';

export type Meldingsoort = 'voorraad_laag' | 'voorraad_op' | 'artikel_dicht' | 'voorraad_tekort_vooruit';
export type Meldingbron = 'winkel' | 'keuken' | 'artikel';

export const MELDINGSOORTEN: Meldingsoort[] = ['voorraad_laag', 'voorraad_op', 'artikel_dicht', 'voorraad_tekort_vooruit'];

/** Direct mailen; de rest gaat mee in het overzicht van 8:00 (besluit Mathijs, 26 sep). */
export const DIRECT_MAILEN: Meldingsoort[] = ['voorraad_op', 'artikel_dicht'];

export interface Melding {
    bron: Meldingbron;
    item_id: string;
    soort: Meldingsoort;
    titel: string;
    tekst: string;
    link: string;
    metadata: Record<string, unknown>;
}

export type WinkelProduct = Pick<Product, 'id' | 'naam' | 'eenheid' | 'voorraad' | 'voorraad_bezet' | 'actief'> & { drempel: number | null };
export interface ArtikelKort { id: string; naam: string; actief: boolean }

/** Wat er besteld staat en nog ingepakt moet worden, per product per ophaaldag. */
export interface Vraag { product_id: string; klaar_op: string; hoeveelheid: number; pakketten: number }

const WINKEL_LINK = (id: string) => `/voorraad/winkel?product=${id}`;

function dagKort(iso: string): string {
    const d = new Date(`${iso}T12:00:00Z`);
    return d.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Amsterdam' });
}

/** Bijna op en op, per winkelproduct dat wordt bijgehouden. */
export function winkelProductMeldingen(producten: WinkelProduct[], slots: Slot[], actieveArtikelIds: Set<string>): Melding[] {
    const uit: Melding[] = [];
    for (const p of producten) {
        if (!p.actief) continue;
        const b = beschikbaar(p);
        if (b == null) continue;
        const { waarde: drempel } = geldendeDrempel(p, slots, actieveArtikelIds);
        const aanwezig = p.voorraad ?? 0;
        const besteld = p.voorraad_bezet ?? 0;
        const stand = `Er is ${hoeveelheidKort(aanwezig, p.eenheid)}, besteld en nog niet ingepakt ${hoeveelheidKort(besteld, p.eenheid)}.`;
        const meta = { aanwezig, besteld, beschikbaar: b, drempel };
        if (b <= 0) {
            uit.push({
                bron: 'winkel', item_id: p.id, soort: 'voorraad_op',
                titel: b < 0 ? `${p.naam}: ${hoeveelheidKort(-b, p.eenheid)} te kort` : `${p.naam} is op`,
                tekst: stand, link: WINKEL_LINK(p.id), metadata: meta,
            });
        } else if (drempel != null && b <= drempel) {
            uit.push({
                bron: 'winkel', item_id: p.id, soort: 'voorraad_laag',
                titel: `${p.naam} is bijna op: nog ${hoeveelheidKort(b, p.eenheid)}`,
                tekst: `${stand} Grens: ${hoeveelheidKort(drempel, p.eenheid)}.`, link: WINKEL_LINK(p.id), metadata: meta,
            });
        }
    }
    return uit;
}

/** "Bierpakket € 35 kan niet meer besteld worden: Mr. Hop is op." */
export function artikelDichtMeldingen(artikelen: ArtikelKort[], producten: WinkelProduct[], slots: Slot[]): Melding[] {
    const uit: Melding[] = [];
    for (const a of artikelen) {
        if (!a.actief) continue;
        const n = pakkettenTeMaken(a.id, slots, producten);
        if (n !== 0) continue;
        const oorzaak = beperkendProduct(a.id, slots, producten);
        const zonderProduct = slots.some((s) => s.artikel_id === a.id && !s.standaard_product_id);
        const reden = oorzaak ? `${oorzaak.naam} is op` : zonderProduct ? 'er staat een onderdeel zonder product in' : 'een onderdeel is op';
        uit.push({
            bron: 'artikel', item_id: a.id, soort: 'artikel_dicht',
            titel: `${a.naam} kan niet meer besteld worden: ${reden}`,
            tekst: oorzaak ? `Vul ${oorzaak.naam} aan (ontvangst of overboeken), of kies een ander product in het pakket.` : 'Kies in het pakket voor elk onderdeel een product.',
            link: oorzaak ? WINKEL_LINK(oorzaak.id) : '/verkoop/webshop#artikelen',
            metadata: { oorzaak_product_id: oorzaak?.id ?? null },
        });
    }
    return uit;
}

/**
 * Vooruitkijken: loop de ophaaldagen af en tel op wat er nodig is. De eerste
 * dag waarop de optelling meer is dan er ligt, is het tekort — "Voor zaterdag
 * staan 6 pakketten besteld; daar zijn 30 bier voor nodig, er zijn er 24."
 */
export function tekortVooruitMeldingen(producten: WinkelProduct[], vraag: Vraag[]): Melding[] {
    const uit: Melding[] = [];
    for (const p of producten) {
        if (!p.actief || p.voorraad == null) continue;
        const perDag = new Map<string, { hoeveelheid: number; pakketten: number }>();
        for (const v of vraag) {
            if (v.product_id !== p.id) continue;
            const d = perDag.get(v.klaar_op) ?? { hoeveelheid: 0, pakketten: 0 };
            d.hoeveelheid += v.hoeveelheid;
            d.pakketten += v.pakketten;
            perDag.set(v.klaar_op, d);
        }
        let nodig = 0;
        let pakketten = 0;
        for (const dag of [...perDag.keys()].sort()) {
            const d = perDag.get(dag)!;
            nodig = Math.round((nodig + d.hoeveelheid) * 1000) / 1000;
            pakketten += d.pakketten;
            if (nodig > p.voorraad) {
                uit.push({
                    bron: 'winkel', item_id: p.id, soort: 'voorraad_tekort_vooruit',
                    titel: `Tekort ${p.naam} voor ${dagKort(dag)}`,
                    tekst: `Tot en met ${dagKort(dag)} ${pakketten === 1 ? 'staat 1 pakket' : `staan ${pakketten} pakketten`} besteld dat nog ingepakt moet worden; daar is ${hoeveelheidKort(nodig, p.eenheid)} ${p.naam} voor nodig, er is ${hoeveelheidKort(p.voorraad, p.eenheid)}.`,
                    link: WINKEL_LINK(p.id),
                    metadata: { dag, nodig, aanwezig: p.voorraad, pakketten },
                });
                break;
            }
        }
    }
    return uit;
}

export interface KeukenItem { id: number; naam: string; unit: string | null; current_stock: number | null; min_stock: number | null }

/** De keuken in dezelfde vorm: onder min_stock = bijna op, 0 = op. Zonder min_stock geen melding. */
export function keukenMeldingen(items: KeukenItem[]): Melding[] {
    const uit: Melding[] = [];
    for (const i of items) {
        if (i.current_stock == null || i.min_stock == null || i.min_stock <= 0) continue;
        const eenheid = i.unit ?? '';
        const meta = { aanwezig: i.current_stock, drempel: i.min_stock };
        if (i.current_stock <= 0) {
            uit.push({ bron: 'keuken', item_id: String(i.id), soort: 'voorraad_op', titel: `${i.naam} is op (keuken)`, tekst: `Grens: ${i.min_stock} ${eenheid}.`, link: `/voorraad/historie/${i.id}`, metadata: meta });
        } else if (i.current_stock <= i.min_stock) {
            uit.push({ bron: 'keuken', item_id: String(i.id), soort: 'voorraad_laag', titel: `${i.naam} is bijna op: nog ${i.current_stock} ${eenheid}`, tekst: `Grens: ${i.min_stock} ${eenheid}.`, link: `/voorraad/historie/${i.id}`, metadata: meta });
        }
    }
    return uit;
}

export const sleutelVan = (m: Pick<Melding, 'bron' | 'item_id' | 'soort'>) => `${m.bron}:${m.item_id}:${m.soort}`;

/**
 * Wat moet er bij, wat moet er weg. `bekeken` = de items die opnieuw bekeken
 * zijn: alleen daarvan mag een staat verdwijnen (anders wist een evaluatie van
 * één product de meldingen van de rest).
 */
export function verschil(
    aan: Pick<Melding, 'bron' | 'item_id' | 'soort'>[],
    gewenst: Melding[],
    bekeken: (m: Pick<Melding, 'bron' | 'item_id' | 'soort'>) => boolean,
): { nieuw: Melding[]; weg: Pick<Melding, 'bron' | 'item_id' | 'soort'>[] } {
    const aanSet = new Set(aan.map(sleutelVan));
    const gewenstSet = new Set(gewenst.map(sleutelVan));
    return {
        nieuw: gewenst.filter((m) => !aanSet.has(sleutelVan(m))),
        weg: aan.filter((m) => bekeken(m) && !gewenstSet.has(sleutelVan(m))),
    };
}
