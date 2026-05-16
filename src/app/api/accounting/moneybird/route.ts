/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { mergedAccountingConfig, type AccountingConfig } from '@/lib/accountingConfig';

/**
 * Moneybird sales-invoice push. Tenant-specifieke config (administratie-ID,
 * BTW tax_rate_ids, betaaltermijn, email-template) komt uit
 * settings.accounting_config; env-vars zijn fallback voor single-tenant dev.
 *
 * Setup-flow (Pro-tier tenant):
 *   1. /instellingen/integraties/moneybird → connect (OAuth komt in S3)
 *   2. /instellingen/integraties/accounting → vul accounting_config
 *      met grootboekrekening + BTW tax_rate_ids + payment_terms_dagen
 *   3. Test push via /api/accounting/moneybird POST { factuurId, action:'preview' }
 */
const ENV_MONEYBIRD_TOKEN = process.env.MONEYBIRD_TOKEN || '';
const ENV_MONEYBIRD_ADMINISTRATION_ID = process.env.MONEYBIRD_ADMINISTRATION_ID || '';
const MONEYBIRD_BASE = 'https://moneybird.com/api/v2';

const ENV_MONEYBIRD_TAX_RATE_21 = process.env.MONEYBIRD_TAX_RATE_21 || '';
const ENV_MONEYBIRD_TAX_RATE_9 = process.env.MONEYBIRD_TAX_RATE_9 || '';
const ENV_MONEYBIRD_TAX_RATE_0 = process.env.MONEYBIRD_TAX_RATE_0 || '';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

interface ResolvedConfig {
  token: string;
  administrationId: string;
  taxRate21: string;
  taxRate9: string;
  taxRate0: string;
  cfg: ReturnType<typeof mergedAccountingConfig>;
}

function resolveConfig(rawCfg: AccountingConfig | null): ResolvedConfig {
  const cfg = mergedAccountingConfig(rawCfg);
  return {
    token: ENV_MONEYBIRD_TOKEN,
    administrationId: cfg.moneybird_administration_id || ENV_MONEYBIRD_ADMINISTRATION_ID,
    taxRate21: cfg.moneybird_tax_rate_21 || ENV_MONEYBIRD_TAX_RATE_21,
    taxRate9: cfg.moneybird_tax_rate_9 || ENV_MONEYBIRD_TAX_RATE_9,
    taxRate0: cfg.moneybird_tax_rate_0 || ENV_MONEYBIRD_TAX_RATE_0,
    cfg,
  };
}

function isConfigured(c: ResolvedConfig): boolean {
  return !!(c.token && c.administrationId);
}

function areTaxRatesConfigured(c: ResolvedConfig): boolean {
  return !!(c.taxRate21 && c.taxRate9 && c.taxRate0);
}

function getSupabase() {
  if (!supabaseUrl || !supabaseKey) return null;
  return createClient(supabaseUrl, supabaseKey);
}

// ── Moneybird API helper ──
async function moneybirdFetch(c: ResolvedConfig, endpoint: string, options: RequestInit = {}) {
  const url = `${MONEYBIRD_BASE}/${c.administrationId}${endpoint}.json`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${c.token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  return res;
}

// ── Zoek contact op naam, maak aan als het niet bestaat ──
async function findOrCreateContact(
  c: ResolvedConfig,
  klant: { naam: string; adres?: string | null; email?: string | null; telefoon?: string | null },
): Promise<string | null> {
  // Zoek op naam
  const searchRes = await moneybirdFetch(c, `/contacts?query=${encodeURIComponent(klant.naam)}`);
  if (searchRes.ok) {
    const contacts = await searchRes.json();
    if (contacts.length > 0) return contacts[0].id;
  }

  // Maak nieuw contact aan met volledige gegevens (adres, email, telefoon).
  const adresParts = (klant.adres || '').split(',').map(function (s: string) { return s.trim(); });
  const createRes = await moneybirdFetch(c, '/contacts', {
    method: 'POST',
    body: JSON.stringify({
      contact: {
        company_name: klant.naam,
        address1: adresParts[0] || '',
        city: adresParts[1] || '',
        zipcode: adresParts[2] || '',
        country: c.cfg.contact_default_country,
        send_invoices_to_email: klant.email || undefined,
        phone: klant.telefoon || undefined,
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
function factuurToMoneybirdInvoice(
  c: ResolvedConfig,
  factuur: any,
  contactId: string,
): Record<string, any> {
  const detailLines = (factuur.items || []).map(function (item: any) {
    const btwPercentage = item.btw || 21;
    return {
      description: item.omschrijving || item.desc || 'Catering',
      price: String(item.prijs || 0),
      amount: String(item.qty || 1),
      tax_rate_id: btwToMoneybirdTaxRate(c, btwPercentage),
      // Tenant-specifieke grootboekrekening uit accounting_config.
      ledger_account_id: c.cfg.grootboekrekening_omzet,
    };
  });

  // Bereken due_date uit payment_terms_dagen als factuur.vervaldatum leeg is.
  let dueDate = factuur.vervaldatum;
  if (!dueDate && factuur.datum) {
    const d = new Date(factuur.datum);
    d.setDate(d.getDate() + c.cfg.payment_terms_dagen);
    dueDate = d.toISOString().slice(0, 10);
  }

  return {
    sales_invoice: {
      contact_id: contactId,
      reference: factuur.nummer,
      invoice_date: factuur.datum,
      due_date: dueDate,
      currency: 'EUR',
      prices_are_incl_tax: false,
      details_attributes: detailLines,
    },
  };
}

function btwToMoneybirdTaxRate(c: ResolvedConfig, percentage: number): string {
  switch (percentage) {
    case 21: return c.taxRate21;
    case 9:  return c.taxRate9;
    case 0:  return c.taxRate0;
    default: return c.taxRate21;
  }
}

// ── POST: Duw factuur naar Moneybird ──
// Body: { factuurId: 123 }
//   of: { factuurId: 123, action: 'preview' }
//   of: { factuurId: 123, action: 'send' } - maak aan EN verstuur via Moneybird
export async function POST(req: NextRequest) {
  try {
    const sb = getSupabase();
    if (!sb) return NextResponse.json({ error: 'Geen database verbinding' }, { status: 500 });

    const body = await req.json();
    const { factuurId, action } = body;

    if (!factuurId) {
      return NextResponse.json({ error: 'Geen factuurId meegegeven' }, { status: 400 });
    }

    // Haal factuur + bedrijfsnaam + accounting_config van dezelfde tenant op
    const { data: factuur, error: fetchErr } = await sb
      .from('facturen')
      .select('*')
      .eq('id', factuurId)
      .single();

    if (fetchErr || !factuur) {
      return NextResponse.json({ error: 'Factuur niet gevonden' }, { status: 404 });
    }

    const { data: settingsRow } = await sb
      .from('settings')
      .select('accounting_config, bedrijfsnaam')
      .eq('organization_id', factuur.organization_id)
      .maybeSingle();

    const config = resolveConfig((settingsRow?.accounting_config as AccountingConfig) || null);
    const bedrijfsnaam = settingsRow?.bedrijfsnaam || 'BBQ Architect';

    if (!isConfigured(config)) {
      return NextResponse.json(
        { error: 'Moneybird niet geconfigureerd. Vul de administratie-ID in via /instellingen/integraties/accounting of voeg MONEYBIRD_TOKEN/MONEYBIRD_ADMINISTRATION_ID toe in env.' },
        { status: 501 }
      );
    }
    if (!areTaxRatesConfigured(config)) {
      return NextResponse.json(
        { error: 'Moneybird BTW-tarieven niet geconfigureerd. Vul de drie tax_rate_ids in via /instellingen/integraties/accounting. Ophalen via GET /tax_rates.json in Moneybird.' },
        { status: 501 }
      );
    }

    // Zoek of maak contact
    const contactId = await findOrCreateContact(config, {
      naam: factuur.client_naam,
      adres: factuur.client_adres,
      email: factuur.client_email,
      telefoon: factuur.client_telefoon,
    });
    if (!contactId) {
      return NextResponse.json(
        { error: `Kon contact "${factuur.client_naam}" niet vinden of aanmaken in Moneybird` },
        { status: 500 }
      );
    }

    // Map naar Moneybird formaat
    const invoicePayload = factuurToMoneybirdInvoice(config, factuur, contactId);

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
    const createRes = await moneybirdFetch(config, '/sales_invoices', {
      method: 'POST',
      body: JSON.stringify(invoicePayload),
    });

    if (!createRes.ok) {
      const errBody = await createRes.text();
      throw new Error('Moneybird factuur aanmaken mislukt: ' + errBody);
    }

    const invoice = await createRes.json();

    // Optioneel: verstuur de factuur via Moneybird e-mail.
    // Subject + body komen uit accounting_config.email_template_* (tenant-instelbaar).
    if (action === 'send' && invoice.id) {
      const { fillTemplate } = await import('@/lib/accountingConfig');
      const vars = {
        nummer: factuur.nummer,
        bedrijfsnaam,
        klant: factuur.client_naam || '',
      };
      const sendRes = await moneybirdFetch(
        config,
        `/sales_invoices/${invoice.id}/send_invoice`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            sales_invoice_sending: {
              delivery_method: 'Email',
              email_address: factuur.client_email || undefined,
              email_message: fillTemplate(config.cfg.email_template_body, vars),
              invoice_subject: fillTemplate(config.cfg.email_template_subject, vars),
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
