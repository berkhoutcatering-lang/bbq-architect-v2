/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceSupabase } from '@/lib/supabase-server';

/*
 * Mollie payment webhook
 * ──────────────────────
 * Wordt door Mollie aangeroepen wanneer een payment-status verandert.
 * Mollie POSTet form-urlencoded "id=tr_xxx", we vragen de payment-status
 * dan op via de Mollie API en updaten de gekoppelde factuur.
 *
 * Service-role supabase is verplicht: webhook-calls hebben geen user-auth,
 * dus RLS blokkeert anders elke UPDATE op facturen.
 *
 * Mollie verwacht een 200 OK; alle andere statussen zorgen dat Mollie
 * later opnieuw probeert (uit-the-box retry).
 *
 * Setup: registreer als webhook in Mollie dashboard
 *   https://jouw-domein.nl/api/payments/mollie/webhook
 * (of zet MOLLIE_WEBHOOK_URL in .env zodat /api/payments/mollie 'm meegeeft
 *  bij elke payment-create).
 */

const MOLLIE_API_KEY = process.env.MOLLIE_API_KEY || '';
const MOLLIE_BASE = 'https://api.mollie.com/v2';

export async function POST(req: NextRequest) {
    try {
        if (!MOLLIE_API_KEY) return new NextResponse('Not configured', { status: 501 });

        /* Mollie POSTet form-urlencoded; lees raw body. */
        const text = await req.text();
        const params = new URLSearchParams(text);
        const paymentId = params.get('id');
        if (!paymentId) return new NextResponse('No payment ID', { status: 400 });

        /* Verifieer payment-status door 'm direct bij Mollie op te halen
           — vertrouw nooit alleen op de webhook-body. */
        const res = await fetch(`${MOLLIE_BASE}/payments/${paymentId}`, {
            headers: { Authorization: `Bearer ${MOLLIE_API_KEY}` },
        });
        if (!res.ok) {
            console.warn('[mollie-webhook] payment fetch failed:', paymentId, res.status);
            return new NextResponse('Payment not found', { status: 404 });
        }

        const payment = await res.json();
        const factuurId = payment.metadata?.factuur_id;
        if (!factuurId) {
            /* Geen factuur-koppeling in metadata — log + accepteer (geen retry nodig). */
            console.warn('[mollie-webhook] payment zonder factuur_id metadata:', paymentId);
            return new NextResponse('OK', { status: 200 });
        }

        /* Map Mollie-status naar onze factuur-status. */
        let factuurStatus: string | null = null;
        let extraUpdates: Record<string, any> = {};
        switch (payment.status) {
            case 'paid':
                factuurStatus = 'betaald';
                /* paidAt logging zodat boekhouding weet wanneer het binnenkwam — los van factuur.datum. */
                if (payment.paidAt) extraUpdates.betaald_op = payment.paidAt;
                break;
            case 'expired':
            case 'failed':
            case 'canceled':
                /* Niet weer naar concept — laat 'verzonden' blijven zodat user zelf actie kan ondernemen. */
                factuurStatus = 'verzonden';
                break;
            /* open / pending / authorized: niets doen, wacht op definitieve status. */
        }

        if (factuurStatus) {
            const sb = createServiceSupabase();
            const { error } = await sb.from('facturen')
                .update({ status: factuurStatus, ...extraUpdates })
                .eq('id', factuurId);
            if (error) {
                /* extraUpdates kan een onbekende kolom hebben — retry zonder. */
                if (/column .* does not exist/i.test(error.message)) {
                    await sb.from('facturen').update({ status: factuurStatus }).eq('id', factuurId);
                } else {
                    console.error('[mollie-webhook] update failed:', error.message);
                    return new NextResponse('DB error', { status: 500 });
                }
            }
            console.info('[mollie-webhook] factuur', factuurId, '→', factuurStatus);
        }

        return new NextResponse('OK', { status: 200 });
    } catch (e: any) {
        console.error('[mollie-webhook]', e?.message);
        return new NextResponse('Error', { status: 500 });
    }
}
