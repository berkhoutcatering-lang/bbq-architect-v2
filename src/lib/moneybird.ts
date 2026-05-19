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
  url.searchParams.set('scope', 'sales_invoices contacts ledger_accounts');
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

/**
 * P0.12 — Vernieuw een verlopen Moneybird-token met een refresh_token.
 *
 * Moneybird access_tokens vervallen na ~30 dagen. Bij elk gebruik moeten we
 * checken of de token nog geldig is en zo niet automatisch vernieuwen.
 * Zonder dit: Sam moet handmatig Moneybird re-connecten elke maand.
 */
export async function refreshAccessToken(refreshToken: string): Promise<MoneybirdToken | { error: string }> {
  const cfg = getMoneybirdConfig();
  if (!cfg) return { error: 'Moneybird env vars ontbreken' };
  const res = await fetch(MB_OAUTH_BASE + '/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: cfg.id,
      client_secret: cfg.secret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { error: body?.error_description || body?.error || res.statusText };
  return body as MoneybirdToken;
}

/**
 * Per-org token-resolver met automatische refresh.
 *
 * Leest organizations.feature_flags.moneybird, checkt expiry-window, en
 * verfrist via refresh_token wanneer nodig. Bij succesvolle refresh wordt
 * de nieuwe token + expiry teruggeschreven naar feature_flags.
 *
 * Returnt:
 *  - { access_token, administration_id } bij succes
 *  - { error: ... } bij ontbrekende connection, gefaalde refresh of expired refresh_token
 *
 * Caller pattern (in API-route):
 *   const tok = await getValidMoneybirdToken(supabaseService, orgId);
 *   if ('error' in tok) return NextResponse.json({ error: tok.error }, { status: 503 });
 *   await pushInvoice(tok.access_token, tok.administration_id, { ... });
 */
export interface MoneybirdConnection {
  access_token: string;
  refresh_token: string | null;
  administration_id: string | null;
  expires_at: string | null;
  connected_at: string | null;
}

export async function getValidMoneybirdToken(
  serviceSupabase: { from: (t: string) => any },
  orgId: string,
): Promise<{ access_token: string; administration_id: string | null } | { error: string }> {
  const { data: org } = await serviceSupabase
    .from('organizations')
    .select('feature_flags')
    .eq('id', orgId)
    .single();

  const ff = (org?.feature_flags || {}) as Record<string, unknown>;
  const mb = ff.moneybird as MoneybirdConnection | undefined;
  if (!mb?.access_token) {
    return { error: 'moneybird_not_connected' };
  }

  // Buffer: refresh als token binnen 5 min verloopt (of expiry onbekend = altijd doorsturen).
  const now = Date.now();
  const expiresAt = mb.expires_at ? new Date(mb.expires_at).getTime() : 0;
  const needsRefresh = expiresAt > 0 && expiresAt - now < 5 * 60_000;

  if (!needsRefresh) {
    return { access_token: mb.access_token, administration_id: mb.administration_id };
  }

  if (!mb.refresh_token) {
    // Token nadert expiry maar er is geen refresh_token om mee te verlengen.
    return { error: 'moneybird_no_refresh_token_reconnect_required' };
  }

  const refreshed = await refreshAccessToken(mb.refresh_token);
  if ('error' in refreshed) {
    return { error: `moneybird_refresh_failed: ${refreshed.error}` };
  }

  // Bereken nieuwe expiry; sommige Moneybird-responses bevatten geen expires_in
  // (fallback 30 dagen, conservatieve schatting).
  const lifetime = (refreshed.expires_in ?? 30 * 24 * 60 * 60) * 1000;
  const newExpiresAt = new Date(now + lifetime).toISOString();

  ff.moneybird = {
    ...mb,
    access_token: refreshed.access_token,
    refresh_token: refreshed.refresh_token ?? mb.refresh_token, // Moneybird kan rotaten
    expires_at: newExpiresAt,
  };

  await serviceSupabase.from('organizations').update({ feature_flags: ff }).eq('id', orgId);

  return { access_token: refreshed.access_token, administration_id: mb.administration_id };
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
