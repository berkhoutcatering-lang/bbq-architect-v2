/**
 * Streepjescodes koppelen vanaf de Toonbank (contract 1.4, additief): POST codes en
 * POST codes/{artikel_id}/weghalen. Eén manier van opslaan: dezelfde controle (lib/winkel/ean.ts)
 * en dezelfde opslag (lib/winkel/eanKoppelen.ts) als de pagina Streepjescodes koppelen in BBQ
 * Architect. De code komt op het product achter het artikel (winkel_producten.ean); de
 * catalogusversie gaat dan vanzelf omhoog (trigger trg_winkel_cv_product). Geen journaal.
 * De organisatie komt altijd uit de apparaatsleutel.
 */
import type { CodeKoppelAntwoord, CodeKoppelVerzoek, CodeWeghalenAntwoord } from './contract';
import type { CodeArtikelRuw, ToonbankStore } from './store';
import { gelukt, type Uitkomst } from './uitkomst';
import { controleerEan } from '@/lib/winkel/ean';
import { koppelEan } from '@/lib/winkel/eanKoppelen';
import { krijgtStreepjescode } from '@/lib/winkel/streepjescodes';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Mag dit artikel een streepjescode krijgen? Dan het product, anders de reden in gewone taal. */
export function codeDoel(a: CodeArtikelRuw | null): { ok: true; productId: string } | { ok: false; reden: string } {
    if (!a) return { ok: false, reden: 'Dit artikel bestaat niet (meer) in BBQ Architect.' };
    if (a.onderdelen.length !== 1) return { ok: false, reden: 'Dit is een pakket van meer producten. Een streepjescode hoort bij één los product.' };
    if (a.verkoop_per === 'kg' || a.product?.eenheid === 'gram') {
        return { ok: false, reden: 'Dit gaat op gewicht. Dat krijgt een sticker van de weegschaal, geen streepjescode.' };
    }
    if (Number(a.onderdelen[0]!.hoeveelheid) !== 1) return { ok: false, reden: 'Dit artikel is meer dan één stuk. Koppel de code aan het losse product.' };
    const p = a.product;
    if (!p) return { ok: false, reden: 'Achter dit artikel staat geen product.' };
    if (p.prijscode_nr || p.binnen_per_sticker) return { ok: false, reden: 'Dit is een pakje van de slager. Dat scan je met de prijscode op het etiket.' };
    if (!krijgtStreepjescode(p)) return { ok: false, reden: 'Dit product staat uit in het assortiment.' };
    return { ok: true, productId: p.id };
}

export async function koppelCode(store: ToonbankStore, orgId: string, v: CodeKoppelVerzoek): Promise<Uitkomst<CodeKoppelAntwoord>> {
    const doel = codeDoel(await store.codeArtikel(orgId, v.artikel_id.toLowerCase()));
    if (doel.ok === false) return gelukt({ uitkomst: 'kan_niet', reden: doel.reden });
    const c = controleerEan(v.code);
    if (c.ok === false) return gelukt({ uitkomst: 'ongeldig', reden: c.fout });

    const u = await koppelEan(store.eanOpslag(orgId), doel.productId, c.code);
    if (u.ok === false) {
        if (u.bijProduct) return gelukt({ uitkomst: 'al_gekoppeld', naam: u.bijProduct.naam });
        /* Twee scans tegelijk: de unieke index weigerde; welk product weten we dan niet zeker. */
        if (/hoort al bij een ander product/.test(u.fout)) return gelukt({ uitkomst: 'al_gekoppeld', naam: 'een ander product' });
        return gelukt({ uitkomst: 'kan_niet', reden: u.fout });
    }
    return gelukt({
        uitkomst: 'gekoppeld', artikel_id: v.artikel_id.toLowerCase(), product_id: doel.productId, code: c.code,
        catalogus_versie: await store.catalogusVersie(orgId),
    });
}

export async function haalCodeWeg(store: ToonbankStore, orgId: string, artikelId: string): Promise<Uitkomst<CodeWeghalenAntwoord>> {
    const klaar = async (weg: boolean) => gelukt({ weg, catalogus_versie: await store.catalogusVersie(orgId) });
    if (!UUID.test(artikelId)) return klaar(false);
    const doel = codeDoel(await store.codeArtikel(orgId, artikelId.toLowerCase()));
    if (doel.ok === false) return klaar(false);
    const opslag = store.eanOpslag(orgId);
    const product = await opslag.product(doel.productId);
    if (!product?.ean) return klaar(false);
    const u = await koppelEan(opslag, doel.productId, null);
    return klaar(u.ok);
}
