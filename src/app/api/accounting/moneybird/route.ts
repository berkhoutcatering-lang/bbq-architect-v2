/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// ── Moneybird Integratie ──
// TODO: Productie-setup:
//   1. Ga naar https://moneybird.com/user/applications/new
//   2. Maak een persoonlijke token aan (of gebruik OAuth voor multi-user)
//   3. Zoek je administratie-ID op via https://moneybird.com/ (staat in de URL)
//   4. Voeg de volgende env vars toe aan .env.local:
//      MONEYBIRD_TOKEN=...
//      MONEYBIRD_ADMINISTRATION_ID=...

const MONEYBIRD_TOKEN = process.env.MONEYBIRD_TOKEN || '';
const MONEYBIRD_ADMINISTRATION_ID = process.env.MONEYBIRD_ADMINISTRATION_ID || '';
const MONEYBIRD_BASE = 'https://moneybird.com/api/v2';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

function isConfigured(): boolean {
  return !!(MONEYBIRD_TOKEN && MONEYBIRD_ADMINISTRATION_ID);
}

function getSupabase() {
  if (!supabaseUrl || !supabaseKey) return null;
  return createClient(supabaseUrl, supabaseKey);
}

// ── Moneybird API helper ──
async function moneybirdFetch(endpoint: string, options: RequestInit = {}) {
  const url = `${MONEYBIRD_BASE}/${MONEYBIRD_ADMINISTRATION_ID}${endpoint}.json`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${MONEYBIRD_TOKEN}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  return res;
}

// ── Zoek contact op naam, maak aan als het niet bestaat ──
async function findOrCreateContact(clientNaam: string, clientAdres?: string): Promise<string | null> {
  // Zoek op naam
  const searchRes = await moneybirdFetch(`/contacts?query=${encodeURIComponent(clientNaam)}`);
  if (searchRes.ok) {
    const contacts = await searchRes.json();
    if (contacts.length > 0) return contacts[0].id;
  }

  // Maak nieuw contact aan
  const adresParts = (clientAdres || '').split(',').map(function (s: string) { return s.trim(); });
  const createRes = await moneybirdFetch('/contacts', {
    method: 'POST',
    body: JSON.stringify({
      contact: {
        company_name: clientNaam,
        address1: adresParts[0] || '',
        city: adresParts[1] || '',
        zipcode: adresParts[2] || '',
        country: 'NL',
        // TODO: Voeg extra contactgegevens toe (email, telefoon)
        // email: '',
        // phone: '',
      },
    }),
  });

  if (createRes.ok) {
    const contact = await createRes.json();
    return contact.id;
  }

  console.error('[MONEYBIRD] Contact aanmaken mislukt:', await createRes.text());
  return null;
}

// ── Map BBQ Architect factuur naar Moneybird verkoopfactuur ──
function factuurToMoneybirdInvoice(factuur: any, contactId: string): Record<string, any> {
  const detailLines = (factuur.items || []).map(function (item: any) {
    const btwPercentage = item.btw || 21;

    return {
      description: item.omschrijving || item.desc || 'Catering',
      price: String(item.prijs || 0),
      amount: String(item.qty || 1),
      // Moneybird BTW-tarief ID's
      // TODO: Pas aan op basis van je Moneybird administratie
      // Standaard tax_rate_ids:
      //   NL 21% = zoek op via /tax_rates.json
      //   NL 9%  = zoek op via /tax_rates.json
      //   0%     = zoek op via /tax_rates.json
      tax_rate_id: btwToMoneybirdTaxRate(btwPercentage),
      // TODO: Configureer de juiste grootboekrekening
      // ledger_account_id: 'MONEYBIRD_LEDGER_ACCOUNT_ID',
    };
  });

  return {
    sales_invoice: {
      contact_id: contactId,
      reference: factuur.nummer,
      invoice_date: factuur.datum,
      // Moneybird berekent vervaldatum op basis van workflow of je kunt het handmatig meegeven
      due_date: factuur.vervaldatum,
      currency: 'EUR',
      prices_are_incl_tax: false,
      details_attributes: detailLines,
    },
  };
}

// ── BTW percentage naar Moneybird tax_rate_id ──
function btwToMoneybirdTaxRate(percentage: number): string {
  // TODO: Haal de juiste tax_rate_ids op via GET /tax_rates.json
  // en pas deze mapping aan op je administratie
  switch (percentage) {
    case 21: return 'TODO_TAX_RATE_21';
    case 9:  return 'TODO_TAX_RATE_9';
    case 0:  return 'TODO_TAX_RATE_0';
    default: return 'TODO_TAX_RATE_21';
  }
}

// ── POST: Duw factuur naar Moneybird ──
// Body: { factuurId: 123 }
//   of: { factuurId: 123, action: 'preview' }
//   of: { factuurId: 123, action: 'send' } - maak aan EN verstuur via Moneybird
export async function POST(req: NextRequest) {
  try {
    if (!isConfigured()) {
      return NextResponse.json(
        { error: 'Moneybird niet geconfigureerd \u2014 voeg MONEYBIRD_TOKEN en MONEYBIRD_ADMINISTRATION_ID toe in .env' },
        { status: 501 }
      );
    }

    const sb = getSupabase();
    if (!sb) return NextResponse.json({ error: 'Geen database verbinding' }, { status: 500 });

    const body = await req.json();
    const { factuurId, action } = body;

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

    // Zoek of maak contact
    const contactId = await findOrCreateContact(factuur.client_naam, factuur.client_adres);
    if (!contactId) {
      return NextResponse.json(
        { error: `Kon contact "${factuur.client_naam}" niet vinden of aanmaken in Moneybird` },
        { status: 500 }
      );
    }

    // Map naar Moneybird formaat
    const invoicePayload = factuurToMoneybirdInvoice(factuur, contactId);

    // Preview modus
    if (action === 'preview') {
      return NextResponse.json({
        success: true,
        action: 'preview',
        factuur: {
          nummer: factuur.nummer,
          client: factuur.client_naam,
          datum: factuur.datum,
        },
        contactId,
        moneybirdPayload: invoicePayload,
      });
    }

    // Maak verkoopfactuur aan in Moneybird
    const createRes = await moneybirdFetch('/sales_invoices', {
      method: 'POST',
      body: JSON.stringify(invoicePayload),
    });

    if (!createRes.ok) {
      const errBody = await createRes.text();
      throw new Error('Moneybird factuur aanmaken mislukt: ' + errBody);
    }

    const invoice = await createRes.json();

    // Optioneel: verstuur de factuur via Moneybird e-mail
    if (action === 'send' && invoice.id) {
      const sendRes = await moneybirdFetch(
        `/sales_invoices/${invoice.id}/send_invoice`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            sales_invoice_sending: {
              delivery_method: 'Email',
              // TODO: Pas het e-mail template aan
              // email_address: factuur.client_email,
              // email_message: 'Bijgaand ontvangt u onze factuur.',
            },
          }),
        }
      );

      if (!sendRes.ok) {
        console.error('[MONEYBIRD] Factuur versturen mislukt:', await sendRes.text());
        return NextResponse.json({
          success: true,
          action: 'created_not_sent',
          moneybirdId: invoice.id,
          invoiceNumber: invoice.invoice_id,
          message: `Factuur ${factuur.nummer} aangemaakt in Moneybird maar versturen mislukt`,
        });
      }

      return NextResponse.json({
        success: true,
        action: 'sent',
        moneybirdId: invoice.id,
        invoiceNumber: invoice.invoice_id,
        message: `Factuur ${factuur.nummer} aangemaakt en verstuurd via Moneybird`,
      });
    }

    return NextResponse.json({
      success: true,
      action: 'created',
      moneybirdId: invoice.id,
      invoiceNumber: invoice.invoice_id,
      message: `Factuur ${factuur.nummer} succesvol aangemaakt in Moneybird`,
    });
  } catch (e: any) {
    console.error('[MONEYBIRD] POST error:', e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
