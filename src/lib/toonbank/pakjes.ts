/**
 * Pakjes van de slager binnenmelden vanaf de Toonbank (contract 1.4, additief): POST pakjes en
 * POST pakjes/{stuk_id}/weg. Weggooien of invriezen: POST pakjes/eruit en pakjes/{stuk_id}/terug
 * (winkel_stuk_eruit, winkel_stuk_terug). De regels zelf staan in de database (winkel_stuk_binnen_prijscode,
 * winkel_stuk_weg); dit vertaalt naar het contract. Geen journaal: binnenmelden is ontvangst van
 * voorraad, geen verkoop. De organisatie komt altijd uit de apparaatsleutel.
 */
import type { PakjeBinnenAntwoord, PakjeBinnenVerzoek, PakjeEruitAntwoord, PakjeEruitVerzoek, PakjeTerugAntwoord, PakjeWegAntwoord } from './contract';
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

/** Wie en waar: de medewerker uit de sessie en het apparaat uit de sleutel. */
export interface EruitContext { orgId: string; medewerkerId: string | null; apparaatId: string | null }

export async function haalPakjeEruit(store: ToonbankStore, ctx: EruitContext, v: PakjeEruitVerzoek): Promise<Uitkomst<PakjeEruitAntwoord>> {
    const r = await store.pakjeEruit({
        orgId: ctx.orgId, verzoekId: v.verzoek_id.toLowerCase(), code: v.code.trim(), wat: v.wat,
        medewerkerId: ctx.medewerkerId, apparaatId: ctx.apparaatId,
    });
    // Zonder de migratie bestaat de route niet: de kassa zegt dan dat het in BBQ Architect moet.
    if (r.uitkomst === 'niet_gemigreerd') return mislukt('niet_gevonden', 'Deze route bestaat niet.');
    if (r.uitkomst === 'verzoek_bezet') return mislukt('ongeldig_verzoek', 'Dit verzoek_id is al gebruikt.', { verzoek_id: v.verzoek_id });
    return gelukt(r);
}

export async function zetPakjeTerug(store: ToonbankStore, orgId: string, stukId: string): Promise<Uitkomst<PakjeTerugAntwoord>> {
    if (!UUID.test(stukId)) return gelukt({ terug: false });
    return gelukt({ terug: await store.pakjeTerug(orgId, stukId.toLowerCase()) });
}
