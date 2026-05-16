/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// ── Mollie Betalingen ──
// TODO: Productie-setup:
//   1. Maak een account aan op https://mollie.com
//   2. Ga naar Ontwikkelaars > API-sleutels
//   3. Gebruik de live API key voor productie (begint met live_)
//   4. Voeg toe aan .env.local:
//      MOLLIE_API_KEY=test_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
//   5. Configureer de webhook URL in Mollie dashboard:
//      https://jouw-domein.nl/api/payments/mollie?webhook=true
//   6. Optioneel: stel MOLLIE_REDIRECT_URL in voor na betaling

const MOLLIE_API_KEY = process.env.MOLLIE_API_KEY || '';
const MOLLIE_REDIRECT_URL = process.env.MOLLIE_REDIRECT_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://app.bbqarchitect.nl';
const MOLLIE_WEBHOOK_URL = process.env.MOLLIE_WEBHOOK_URL || '';
const MOLLIE_BASE = 'https://api.mollie.com/v2';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

function isConfigured(): boolean {
  return !!MOLLIE_API_KEY;
}

function getSupabase() {
  if (!supabaseUrl || !supabaseKey) return null;
  return createClient(supabaseUrl, supabaseKey);
}

// ── Mollie API helper ──
async function mollieFetch(endpoint: string, options: RequestInit = {}) {
  const res = await fetch(`${MOLLIE_BASE}${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${MOLLIE_API_KEY}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  return res;
}

// ── Bereken totaalbedrag van een factuur ──
function berekenFactuurTotaal(factuur: any): number {
  const items = factuur.items || [];
  let totaal = 0;
  items.forEach(function (item: any) {
    const subtotaal = (item.qty || 0) * (item.prijs || 0);
    const btw = item.btw || 21;
    totaal += subtotaal * (1 + btw / 100);
  });
  return Math.round(totaal * 100) / 100;
}

// ── POST: Maak een betaallink aan voor een factuur ──
// Body: { factuurId: 123 }
//   of: { factuurId: 123, method: 'ideal' } voor specifieke betaalmethode
export async function POST(req: NextRequest) {
  try {
    if (!isConfigured()) {
      return NextResponse.json(
        { error: 'Mollie niet geconfigureerd \u2014 voeg MOLLIE_API_KEY toe in .env' },
        { status: 501 }
      );
    }

    const sb = getSupabase();
    if (!sb) return NextResponse.json({ error: 'Geen database verbinding' }, { status: 500 });

    const body = await req.json();
    const { factuurId, method } = body;

    if (!factuurId) {
      return NextResponse.json({ error: 'Geen factuurId meegegeven' }, { status: 400 });
    }

    // Haal factuur op
    const { data: factuur, error: fetchErr } = await sb
      .from('facturen')
      .select('*')
      .eq('id', factuurId)
      .single();

    if (fetchErr || !factuur) {
      return NextResponse.json({ error: 'Factuur niet gevonden' }, { status: 404 });
    }

    // Bereken totaalbedrag
    const bedrag = berekenFactuurTotaal(factuur);
    if (bedrag <= 0) {
      return NextResponse.json({ error: 'Factuurbedrag is 0 of negatief' }, { status: 400 });
    }

    // Maak betaling aan bij Mollie
    const paymentData: Record<string, any> = {
      amount: {
        currency: 'EUR',
        value: bedrag.toFixed(2),
      },
      description: `Factuur ${factuur.nummer} - ${factuur.client_naam}`,
      redirectUrl: `${MOLLIE_REDIRECT_URL}/facturen?betaald=${factuur.nummer}`,
      metadata: {
        factuur_id: factuurId,
        factuur_nummer: factuur.nummer,
        client_naam: factuur.client_naam,
      },
    };

    // Webhook URL voor status-updates
    if (MOLLIE_WEBHOOK_URL) {
      paymentData.webhookUrl = MOLLIE_WEBHOOK_URL;
    }

    // Optioneel: specifieke betaalmethode (ideal, creditcard, bancontact, etc.)
    if (method) {
      paymentData.method = method;
    }

    const createRes = await mollieFetch('/payments', {
      method: 'POST',
      body: JSON.stringify(paymentData),
    });

    if (!createRes.ok) {
      const errBody = await createRes.text();
      throw new Error('Mollie betaling aanmaken mislukt: ' + errBody);
    }

    const payment = await createRes.json();

    // De checkout URL is de betaallink die je naar de klant stuurt
    const checkoutUrl = payment._links?.checkout?.href || null;

    return NextResponse.json({
      success: true,
      paymentId: payment.id,
      status: payment.status,
      checkoutUrl,
      bedrag: bedrag.toFixed(2),
      factuur: factuur.nummer,
      message: checkoutUrl
        ? `Betaallink aangemaakt voor factuur ${factuur.nummer}: EUR ${bedrag.toFixed(2)}`
        : 'Betaling aangemaakt maar geen checkout URL ontvangen',
    });
  } catch (e: any) {
    console.error('[MOLLIE] POST error:', e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// ── GET: Controleer betalingsstatus (webhook callback of handmatige check) ──
// Query params: ?paymentId=tr_xxx  of  ?webhook=true (met POST body van Mollie)
export async function GET(req: NextRequest) {
  try {
    if (!isConfigured()) {
      return NextResponse.json(
        { error: 'Mollie niet geconfigureerd \u2014 voeg MOLLIE_API_KEY toe in .env' },
        { status: 501 }
      );
    }

    const { searchParams } = new URL(req.url);
    const paymentId = searchParams.get('paymentId');

    if (!paymentId) {
      return NextResponse.json({ error: 'Geen paymentId meegegeven' }, { status: 400 });
    }

    // Haal betalingsstatus op bij Mollie
    const res = await mollieFetch(`/payments/${paymentId}`);
    if (!res.ok) {
      const errBody = await res.text();
      throw new Error('Mollie betaling ophalen mislukt: ' + errBody);
    }

    const payment = await res.json();
    const factuurId = payment.metadata?.factuur_id;

    // Als betaling is gelukt, update de factuurstatus
    if (payment.status === 'paid' && factuurId) {
      const sb = getSupabase();
      if (sb) {
        await sb.from('facturen').update({ status: 'betaald' }).eq('id', factuurId);
      }
    }

    return NextResponse.json({
      success: true,
      paymentId: payment.id,
      status: payment.status,
      bedrag: payment.amount,
      factuurId,
      factuurNummer: payment.metadata?.factuur_nummer || null,
      paidAt: payment.paidAt || null,
      // Mollie betalingsstatussen:
      // open, canceled, pending, authorized, expired, failed, paid
      statusBeschrijving: mollieStatusNl(payment.status),
    });
  } catch (e: any) {
    console.error('[MOLLIE] GET error:', e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// ── Webhook handler: Mollie stuurt een POST als betalingsstatus wijzigt ──
// Dit wordt aangeroepen door Mollie's webhook systeem
// TODO: Registreer deze URL als webhook in je Mollie dashboard
export async function PUT(req: NextRequest) {
  try {
    if (!isConfigured()) {
      return new NextResponse('Not configured', { status: 501 });
    }

    const body = await req.text();
    const params = new URLSearchParams(body);
    const paymentId = params.get('id');

    if (!paymentId) {
      return new NextResponse('No payment ID', { status: 400 });
    }

    // Haal betalingsdetails op bij Mollie (nooit vertrouwen op webhook data)
    const res = await mollieFetch(`/payments/${paymentId}`);
    if (!res.ok) {
      return new NextResponse('Payment not found', { status: 404 });
    }

    const payment = await res.json();
    const factuurId = payment.metadata?.factuur_id;

    if (factuurId) {
      const sb = getSupabase();
      if (sb) {
        // Update factuurstatus op basis van Mollie status
        let factuurStatus: string | null = null;
        switch (payment.status) {
          case 'paid':
            factuurStatus = 'betaald';
            break;
          case 'expired':
          case 'failed':
          case 'canceled':
            // Factuur terug naar 'verzonden' zodat een nieuwe betaallink gemaakt kan worden
            factuurStatus = 'verzonden';
            break;
        }

        if (factuurStatus) {
          await sb.from('facturen').update({ status: factuurStatus }).eq('id', factuurId);
          // Webhook factuur status updated
        }
      }
    }

    // Mollie verwacht een 200 OK
    return new NextResponse('OK', { status: 200 });
  } catch (e: any) {
    console.error('[MOLLIE-WEBHOOK] Error:', e.message);
    return new NextResponse('Error', { status: 500 });
  }
}

// ── Nederlandse betalingsstatus ──
function mollieStatusNl(status: string): string {
  switch (status) {
    case 'open':       return 'Wachten op betaling';
    case 'canceled':   return 'Geannuleerd';
    case 'pending':    return 'In behandeling';
    case 'authorized': return 'Geautoriseerd';
    case 'expired':    return 'Verlopen';
    case 'failed':     return 'Mislukt';
    case 'paid':       return 'Betaald';
    default:           return status;
  }
}
