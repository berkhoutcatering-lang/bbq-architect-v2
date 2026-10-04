/**
 * Kassa → voorraad. De winkelkassa meldt per bon welke producten (barcode of
 * id) en hoeveel; elke regel wordt een logboekregel `verkoop_kassa` (of
 * `retour` bij een negatief aantal). Plan: docs/voorraad-bouwplan.md "Winkel
 * bestellen", stap 6.
 *
 * Merk-onafhankelijk: welke kassa het ook wordt, die hoeft alleen dit te
 * sturen. Dubbel melden boekt niets dubbel (sleutel kassa:{bon}:{regel}).
 * Niets wordt stil overgeslagen: een onbekende barcode, een product dat nog
 * niet wordt bijgehouden of een verkoop van meer dan er volgens het systeem
 * ligt, komt terug in de uitkomst en wordt een melding.
 */

export interface KassaRegel {
    ean?: string | null;
    product_id?: string | null;
    aantal: number;
}

export type RegelUitkomst =
    | { regel: number; status: 'geboekt'; product_id: string; naam: string; voorraad: number; al_gemeld: boolean }
    | { regel: number; status: 'onbekend'; ean: string | null }
    | { regel: number; status: 'niet_bijgehouden'; product_id: string; naam: string }
    | { regel: number; status: 'tekort'; product_id: string; naam: string; melding: string };

export interface KassaDeps {
    zoekProduct: (r: KassaRegel) => Promise<{ id: string; naam: string } | null>;
    /** De databasefunctie; gooit met code WV001 (onder nul) of WV002 (niet bijgehouden). */
    muteer: (a: { product_id: string; type: 'verkoop_kassa' | 'retour'; hoeveelheid: number; sleutel: string; notitie: string }) => Promise<{ voorraad: number; bestond: boolean }>;
}

export async function verwerkKassaBon(bon: string, regels: KassaRegel[], deps: KassaDeps): Promise<RegelUitkomst[]> {
    const uit: RegelUitkomst[] = [];
    for (const [i, r] of regels.entries()) {
        const nr = i + 1;
        if (!r.aantal) continue;
        const p = await deps.zoekProduct(r);
        if (!p) { uit.push({ regel: nr, status: 'onbekend', ean: r.ean ?? null }); continue; }
        const verkoop = r.aantal > 0;
        try {
            const m = await deps.muteer({
                product_id: p.id, type: verkoop ? 'verkoop_kassa' : 'retour', hoeveelheid: -r.aantal,
                sleutel: `kassa:${bon}:${nr}`, notitie: `Kassabon ${bon}`,
            });
            uit.push({ regel: nr, status: 'geboekt', product_id: p.id, naam: p.naam, voorraad: m.voorraad, al_gemeld: m.bestond });
        } catch (e) {
            const code = (e as { code?: string }).code;
            if (code === 'WV002') uit.push({ regel: nr, status: 'niet_bijgehouden', product_id: p.id, naam: p.naam });
            else if (code === 'WV001') uit.push({ regel: nr, status: 'tekort', product_id: p.id, naam: p.naam, melding: `Kassa verkocht ${r.aantal} ${p.naam}, maar volgens het systeem is er minder. Tel ${p.naam}.` });
            else throw e;
        }
    }
    return uit;
}
