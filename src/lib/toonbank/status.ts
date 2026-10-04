/**
 * GET /api/toonbank/v1/medewerkers en GET status (BA-7b). Contract §3.3.
 *
 * - medewerkers: namen en rol voor het inlogscherm; nooit inloggegevens.
 * - status: elke 30 seconden; is er iets nieuws (catalogus, vrij, wegzetten,
 *   afhaallijst), hoe staat het apparaat ervoor. Eén databaseaanroep
 *   (toonbank_status), die ook "laatst gezien" en het hoogste volgnummer
 *   vastlegt.
 */
import { CONTRACT_HUIDIG, CONTRACT_MINIMAAL, type MedewerkersAntwoord, type StatusAntwoord } from './contract';
import type { ApparaatGezien, ToonbankStore } from './store';

export async function medewerkersAntwoord(store: ToonbankStore, orgId: string): Promise<MedewerkersAntwoord> {
    const lijst = await store.medewerkers(orgId);
    return {
        medewerkers: lijst
            .filter((m) => m.toonbank_rol)
            .map((m) => ({ medewerker_id: m.id, naam: m.naam, rol: m.toonbank_rol! })),
    };
}

export async function statusAntwoord(store: ToonbankStore, ctx: { orgId: string; apparaatId: string }, gezien: ApparaatGezien): Promise<StatusAntwoord> {
    const s = await store.status(ctx.orgId, ctx.apparaatId, gezien);
    return {
        servertijd: s.servertijd,
        contract: { huidig: CONTRACT_HUIDIG, minimaal: CONTRACT_MINIMAAL },
        apparaat: s.apparaat,
        catalogus_versie: s.catalogus_versie,
        voorraad_versie: s.voorraad_versie,
        vrij_verloopt_at: s.vrij_verloopt_at,
        afhaallijst_versie: s.afhaallijst_versie,
        wegzetten_open: s.wegzetten_open,
        wegzetten_binnen_24u: s.wegzetten_binnen_24u,
        hoogste_volgnummer_gemeld: s.hoogste_volgnummer_gemeld,
        bevestigd_tot_volgnummer: s.bevestigd_tot_volgnummer,
        hoogste_bon_volgnummer: s.hoogste_bon_volgnummer,
        instellingen: s.instellingen,
        te_controleren: s.te_controleren,
    };
}
