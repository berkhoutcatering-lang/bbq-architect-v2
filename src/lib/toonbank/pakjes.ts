/**
 * Pakjes van de slager binnenmelden vanaf de Toonbank (contract 1.4, additief): POST pakjes en
 * POST pakjes/{stuk_id}/weg. De regels zelf staan in de database (winkel_stuk_binnen_prijscode,
 * winkel_stuk_weg); dit vertaalt naar het contract. Geen journaal: binnenmelden is ontvangst van
 * voorraad, geen verkoop. De organisatie komt altijd uit de apparaatsleutel.
 */
import type { PakjeBinnenAntwoord, PakjeBinnenVerzoek, PakjeWegAntwoord } from './contract';
import type { ToonbankStore } from './store';
import { gelukt, mislukt, type Uitkomst } from './uitkomst';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function meldPakjeBinnen(store: ToonbankStore, orgId: string, v: PakjeBinnenVerzoek): Promise<Uitkomst<PakjeBinnenAntwoord>> {
    const r = await store.pakjeBinnen({
        orgId, stukId: v.pakje_id.toLowerCase(), code: v.code.trim(), tht: v.tht, productId: v.product_id ? v.product_id.toLowerCase() : null,
    });
    if (r.uitkomst === 'nummer_bezet') return mislukt('nummer_bezet', r.melding, { code: v.code });
    if (r.uitkomst === 'product_onbekend') return mislukt('niet_gevonden', 'Dit product bestaat niet (meer).', { product_id: v.product_id ?? null });
    return gelukt(r);
}

export async function haalPakjeWeg(store: ToonbankStore, orgId: string, stukId: string): Promise<Uitkomst<PakjeWegAntwoord>> {
    if (!UUID.test(stukId)) return gelukt({ weg: false });
    return gelukt({ weg: await store.pakjeWeg(orgId, stukId.toLowerCase()) });
}
