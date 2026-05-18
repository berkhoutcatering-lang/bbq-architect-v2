/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { mergedAccountingConfig, type AccountingConfig } from '@/lib/accountingConfig';

/**
 * Exact Online sales-entry push. Tenant-instelbare division-code via
 * settings.accounting_config.exact_division_code; env-var EXACT_DIVISION
 * is fallback voor single-tenant dev.
 *
 * Setup-flow (Pro-tier tenant):
 *   1. Registreer app op apps.exactonline.com → redirect URI:
 *      https://<domein>/api/accounting/exact/callback
 *   2. OAuth → refresh_token wordt in integration_tokens opgeslagen
 *   3. /instellingen/integraties/accounting → vul exact_division_code +
 *      grootboekrekening + payment_terms in
 */
const EXACT_CLIENT_ID = process.env.EXACT_CLIENT_ID || '';
const EXACT_CLIENT_SECRET = process.env.EXACT_CLIENT_SECRET || '';
const ENV_EXACT_DIVISION = process.env.EXACT_DIVISION || '';
const EXACT_BASE_URL = 'https://start.exactonline.nl/api/v1';
const EXACT_TOKEN_URL = 'https://start.exactonline.nl/api/oauth2/token';

// GL account + journal env vars (set once per Exact-administratie via .env)
const EXACT_GL_ACCOUNT_GUID = process.env.EXACT_GL_ACCOUNT_GUID || '';
const EXACT_JOURNAL_CODE = process.env.EXACT_JOURNAL_CODE || '';
const EXACT_PAYMENT_TERMS_CODE = process.env.EXACT_PAYMENT_TERMS_CODE || '';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

function isConfigured(divisionCode: string): boolean {
  return !!(EXACT_CLIENT_ID && EXACT_CLIENT_SECRET && divisionCode &&
    (process.env.EXACT_REFRESH_TOKEN || supabaseServiceKey));
}

function isFullyConfigured(divisionCode: string): boolean {
  return isConfigured(divisionCode) && !!(EXACT_GL_ACCOUNT_GUID && EXACT_JOURNAL_CODE && EXACT_PAYMENT_TERMS_CODE);
}

function getSupabase() {
  if (!supabaseUrl || !supabaseKey) return null;
  return createClient(supabaseUrl, supabaseKey);
}

function getServiceSupabase() {
  if (!supabaseUrl || !supabaseServiceKey) return null;
  return createClient(supabaseUrl, supabaseServiceKey);
}

// Read persisted refresh token from DB (overrides env var after first rotation)
async function getStoredRefreshToken(): Promise<string> {
  const sb = getServiceSupabase();
  if (sb) {
    const { data } = await sb
      .from('integration_tokens')
      .select('token_value')
      .eq('integration_key', 'exact_refresh_token')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data?.token_value) return data.token_value;
  }
  return process.env.EXACT_REFRESH_TOKEN || '';
}

async function persistRefreshToken(newToken: string) {
  const sb = getServiceSupabase();
  if (!sb || !newToken) return;
  await sb.from('integration_tokens').upsert(
    { integration_key: 'exact_refresh_token', token_value: newToken, updated_at: new Date().toISOString() },
    { onConflict: 'integration_key' }
  );
}

// ── OAuth: Ververs access token + persisteer geroteerd refresh_token ──
async function getAccessToken(): Promise<string> {
  const refreshToken = await getStoredRefreshToken();
  if (!refreshToken) throw new Error('EXACT_REFRESH_TOKEN niet geconfigureerd');

  const res = await fetch(EXACT_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: EXACT_CLIENT_ID,
      client_secret: EXACT_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error('Exact Online token refresh mislukt: ' + err);
  }

  const data = await res.json();
  // Exact roteert de refresh_token — sla het nieuwe token op zodat de volgende call werkt
  if (data.refresh_token) {
    await persistRefreshToken(data.refresh_token);
  }
  return data.access_token;
}

// ── Exact Online API helper ──
async function exactFetch(accessToken: string, divisionCode: string, endpoint: string, options: RequestInit = {}) {
  const url = `${EXACT_BASE_URL}/${divisionCode}${endpoint}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(options.headers || {}),
    },
  });
  return res;
}

// ── Map BBQ Architect factuur naar Exact Online verkoopboeking ──
function factuurToExactSalesEntry(factuur: any): Record<string, any> {
  // Exact Online SalesEntry (verkoopboeking) formaat
  const salesEntryLines = (factuur.items || []).map(function (item: any, idx: number) {
    const subtotaal = (item.qty || 0) * (item.prijs || 0);
    const btwPercentage = item.btw || 21;

    return {
      GLAccount: EXACT_GL_ACCOUNT_GUID,
      Description: item.omschrijving || item.desc || `Regel ${idx + 1}`,
      AmountFC: subtotaal,
      VATCode: btwPercentageToExactVATCode(btwPercentage),
      Quantity: item.qty || 1,
      UnitPrice: item.prijs || 0,
    };
  });

  return {
    Description: `Factuur ${factuur.nummer} - ${factuur.client_naam}`,
    EntryDate: formatExactDate(factuur.datum),
    DueDate: formatExactDate(factuur.vervaldatum),
    Journal: EXACT_JOURNAL_CODE,
    PaymentCondition: EXACT_PAYMENT_TERMS_CODE,
    PaymentReference: factuur.nummer,
    YourRef: factuur.nummer,
    SalesEntryLines: salesEntryLines,
  };
}

// ── BTW percentage naar Exact Online BTW-code ──
// Codes zijn administratie-specifiek; bij afwijkende mapping override
// via settings.accounting_config.exact_vat_codes (zie type-extension).
function btwPercentageToExactVATCode(percentage: number): string {
  switch (percentage) {
    case 21: return '2';  // Standaard 21% BTW
    case 9:  return '4';  // Laag tarief 9% BTW
    case 0:  return '0';  // Geen BTW / vrijgesteld
    default: return '2';  // Fallback naar 21%
  }
}

function formatExactDate(dateStr: string): string {
  // Exact Online verwacht /Date(timestamp)/ formaat
  if (!dateStr) return '';
  const ts = new Date(dateStr).getTime();
  return `/Date(${ts})/`;
}

// ── Zoek of maak relatie (Account) in Exact ──
async function findOrCreateAccount(accessToken: string, divisionCode: string, factuur: any): Promise<string | null> {
  // Zoek bestaande relatie op naam
  const searchRes = await exactFetch(
    accessToken,
    divisionCode,
    `/crm/Accounts?$filter=Name eq '${encodeURIComponent(factuur.client_naam)}'&$select=ID,Name`
  );

  if (searchRes.ok) {
    const data = await searchRes.json();
    const results = data.d?.results || [];
    if (results.length > 0) return results[0].ID;
  }

  // Maak nieuwe relatie aan met adresgegevens (uit factuur.client_*).
  const adresParts = (factuur.client_adres || '').split(',').map(function (s: string) { return s.trim(); });
  const createRes = await exactFetch(accessToken, divisionCode, '/crm/Accounts', {
    method: 'POST',
    body: JSON.stringify({
      Name: factuur.client_naam,
      AddressLine1: adresParts[0] || undefined,
      City: adresParts[1] || undefined,
      Postcode: adresParts[2] || undefined,
      Country: 'NL',
      Email: factuur.client_email || undefined,
      Phone: factuur.client_telefoon || undefined,
      Status: 'C', // C = Customer (klant)
    }),
  });

  if (createRes.ok) {
    const data = await createRes.json();
    return data.d?.ID || null;
  }

  return null;
}

// ── POST: Duw een factuur naar Exact Online ──
// Body: { factuurId: 123 }
//   of: { factuurId: 123, action: 'preview' } voor een droge run
export async function POST(req: NextRequest) {
  try {
    const sb = getSupabase();
    if (!sb) return NextResponse.json({ error: 'Geen database verbinding' }, { status: 500 });

    const body = await req.json();
    const { factuurId, action } = body;

    if (!factuurId) {
      return NextResponse.json({ error: 'Geen factuurId meegegeven' }, { status: 400 });
    }

    // Haal factuur + accounting_config van tenant op
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
      .select('accounting_config')
      .eq('organization_id', factuur.organization_id)
      .maybeSingle();

    const cfg = mergedAccountingConfig((settingsRow?.accounting_config as AccountingConfig) || null);
    const divisionCode = cfg.exact_division_code || ENV_EXACT_DIVISION;

    if (!isConfigured(divisionCode)) {
      return NextResponse.json(
        { error: 'Exact Online niet geconfigureerd. Vul exact_division_code in via /instellingen/integraties/accounting of voeg EXACT_DIVISION toe in env.' },
        { status: 501 }
      );
    }
    if (!isFullyConfigured(divisionCode)) {
      return NextResponse.json(
        { error: 'Exact Online GL-configuratie ontbreekt. Voeg EXACT_GL_ACCOUNT_GUID, EXACT_JOURNAL_CODE en EXACT_PAYMENT_TERMS_CODE toe in env.' },
        { status: 501 }
      );
    }

    // Map naar Exact Online formaat
    const salesEntry = factuurToExactSalesEntry(factuur);

    // Preview modus: toon wat er verstuurd zou worden
    if (action === 'preview') {
      return NextResponse.json({
        success: true,
        action: 'preview',
        factuur: {
          nummer: factuur.nummer,
          client: factuur.client_naam,
          datum: factuur.datum,
        },
        exactPayload: salesEntry,
      });
    }

    // Verstuur naar Exact Online
    const accessToken = await getAccessToken();

    // Zoek of maak de klant als relatie
    const accountId = await findOrCreateAccount(accessToken, divisionCode, factuur);
    if (accountId) {
      salesEntry.Customer = accountId;
    }

    const res = await exactFetch(accessToken, divisionCode, '/salesentry/SalesEntries', {
      method: 'POST',
      body: JSON.stringify(salesEntry),
    });

    if (!res.ok) {
      const errBody = await res.text();
      throw new Error('Exact Online verkoopboeking mislukt: ' + errBody);
    }

    const result = await res.json();

    return NextResponse.json({
      success: true,
      action: 'push',
      factuur: factuur.nummer,
      exactEntryId: result.d?.EntryID || null,
      message: `Factuur ${factuur.nummer} succesvol naar Exact Online gestuurd`,
    });
  } catch (e: any) {
    console.error('[EXACT-ONLINE] POST error:', e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
