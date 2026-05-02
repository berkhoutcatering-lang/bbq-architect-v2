/**
 * Moneybird API wrapper voor BBQ Architect.
 *
 * Vereist drie env vars (na MB-OAuth-app-registratie):
 *  - MONEYBIRD_CLIENT_ID
 *  - MONEYBIRD_CLIENT_SECRET
 *  - MONEYBIRD_REDIRECT_URI (= https://app.bbqarchitect.nl/api/integrations/moneybird/callback)
 *
 * Per-org access-token wordt opgeslagen in organizations.feature_flags.moneybird.access_token
 * (encryption-at-rest geleverd door Supabase).
 */

const MB_OAUTH_BASE = 'https://moneybird.com/oauth';
const MB_API_BASE = 'https://moneybird.com/api/v2';

export function getMoneybirdConfig() {
  const id = process.env.MONEYBIRD_CLIENT_ID;
  const secret = process.env.MONEYBIRD_CLIENT_SECRET;
  const redirect = process.env.MONEYBIRD_REDIRECT_URI;
  if (!id || !secret || !redirect) {
    return null;
  }
  return { id, secret, redirect };
}

export function buildAuthorizeUrl(state: string): string {
  const cfg = getMoneybirdConfig();
  if (!cfg) throw new Error('Moneybird env vars ontbreken');
  const url = new URL(MB_OAUTH_BASE + '/authorize');
  url.searchParams.set('client_id', cfg.id);
  url.searchParams.set('redirect_uri', cfg.redirect);
  url.searchParams.set('response_type', 'code');
  // documents + purchase_invoices toegevoegd voor Reizen & Kilometers (Q2 2026).
  // Bestaande klanten: re-consent vereist — surface banner in Settings.
  url.searchParams.set('scope', 'sales_invoices contacts ledger_accounts documents purchase_invoices');
  url.searchParams.set('state', state);
  return url.toString();
}

export interface MoneybirdToken {
  access_token: string;
  token_type: string;
  expires_in?: number;
  refresh_token?: string;
  administration_id?: string;
}

export async function exchangeCodeForToken(code: string): Promise<MoneybirdToken | { error: string }> {
  const cfg = getMoneybirdConfig();
  if (!cfg) return { error: 'Moneybird env vars ontbreken' };
  const res = await fetch(MB_OAUTH_BASE + '/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: cfg.id,
      client_secret: cfg.secret,
      code,
      redirect_uri: cfg.redirect,
      grant_type: 'authorization_code',
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { error: body?.error_description || res.statusText };
  return body as MoneybirdToken;
}

export interface MbAdministration {
  id: string;
  name: string;
  language: string;
  currency: string;
}

export async function listAdministrations(accessToken: string): Promise<MbAdministration[] | { error: string }> {
  const res = await fetch(MB_API_BASE + '/administrations.json', {
    headers: { 'Authorization': `Bearer ${accessToken}` },
  });
  if (!res.ok) return { error: res.statusText };
  return await res.json();
}

// ─── Sales invoice push ─────────────────────────────
export interface MbInvoiceLine {
  description: string;
  amount: number;        // qty
  price: number;         // per unit (excl BTW)
  tax_rate_id?: string;
}

export interface MbInvoiceInput {
  contact_id?: string;
  reference?: string;
  invoice_date?: string;
  details_attributes: MbInvoiceLine[];
}

export async function pushInvoice(
  accessToken: string,
  administrationId: string,
  input: MbInvoiceInput
): Promise<{ id: string } | { error: string }> {
  const res = await fetch(`${MB_API_BASE}/${administrationId}/sales_invoices.json`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ sales_invoice: input }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { error: body?.error || res.statusText };
  return body;
}
