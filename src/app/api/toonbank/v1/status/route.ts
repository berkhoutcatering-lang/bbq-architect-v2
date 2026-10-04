/**
 * GET /api/toonbank/v1/status?volgnummer={hoogste} (BA-7b, contract §3.3).
 * Elke 30 seconden: servertijd, contract {huidig, minimaal}, apparaat,
 * catalogus_versie, voorraad_versie, vrij_verloopt_at, afhaallijst_versie,
 * wegzetten_open, wegzetten_binnen_24u, hoogste_volgnummer_gemeld,
 * bevestigd_tot_volgnummer, hoogste_bon_volgnummer, instellingen,
 * te_controleren. Legt ook "laatst gezien", app- en contractversie en het
 * hoogste volgnummer vast (nooit omlaag).
 */
import { NextResponse } from 'next/server';
import { statusAntwoord } from '@/lib/toonbank/status';
import { foutAntwoord, optionsRoute, toonbankRoute } from '../_lib/guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const OPTIONS = optionsRoute;

export const GET = toonbankRoute({ naam: 'status' }, async ({ req, store, apparaat, app, contract }) => {
    const ruw = req.nextUrl.searchParams.get('volgnummer');
    let volgnummer: number | null = null;
    if (ruw !== null && ruw !== '') {
        if (!/^\d{1,15}$/.test(ruw)) return foutAntwoord('ongeldig_verzoek', 'volgnummer is een geheel getal van 0 of meer.', { punten: [{ pad: 'volgnummer', melding: 'geheel getal' }] });
        volgnummer = Number(ruw);
    }
    const antwoord = await statusAntwoord(store, { orgId: apparaat!.organization_id, apparaatId: apparaat!.id }, {
        volgnummer, app_versie: app?.slice(0, 40) ?? null, contract_versie: contract?.slice(0, 20) ?? null,
    });
    return NextResponse.json(antwoord);
});
