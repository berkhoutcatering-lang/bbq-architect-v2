/**
 * POST /api/toonbank/v1/orders/{order_id}/ophalen (BA-10, contract §3.2, §3.3).
 * Sleutel + medewerker. Body {gebeurtenis_id, moment, bon_id, rest, leeftijd}.
 * Een webshoporder zonder doos meegeven via winkel_order_ophalen (BA-2), bron
 * toonbank, met de ingelogde medewerker. Een rest staat altijd op een bon
 * (bon_id verplicht); het bedrag wordt met de open rest vergeleken.
 *   200 {uitkomst, order_id, nummer, rest_cents, opgehaald_at} — elke uitkomst
 *   400 ongeldig_verzoek (body, of een gebeurtenis_id dat al voor iets anders gebruikt is)
 */
import { ophaalVraag } from '@/lib/toonbank/afhalen';
import { OrderOphalenVerzoek } from '@/lib/toonbank/contract';
import { naToonbankBoekingen } from '@/lib/toonbank/naAfloop';
import { foutAntwoord, optionsRoute, toonbankRoute, valideer, vanUitkomst } from '../../../_lib/guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const OPTIONS = optionsRoute;

export const POST = toonbankRoute<{ order_id: string }>({ naam: 'order-ophalen', medewerker: true, maxBody: 2048 }, async ({ params, store, body, apparaat, sessie, contract }) => {
    if (!/^\d{1,15}$/.test(params.order_id ?? '')) return foutAntwoord('niet_gevonden', 'Deze order bestaat niet.', { order_id: params.order_id ?? null });
    const v = valideer(OrderOphalenVerzoek, body);
    if ('antwoord' in v) return v.antwoord;
    const orgId = apparaat!.organization_id;
    const r = await ophaalVraag(store, { orgId, apparaatId: apparaat!.id, medewerkerId: sessie!.medewerker_id, contract },
        { soort: 'order', orderId: Number(params.order_id) }, v.data);
    naToonbankBoekingen(orgId, r.productIds);
    return vanUitkomst(r.uitkomst);
});
