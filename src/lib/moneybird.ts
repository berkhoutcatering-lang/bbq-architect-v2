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

export const MB_SCOPE = 'sales_invoices documents contacts ledger_accounts';

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
  url.searchParams.set('scope', MB_SCOPE);
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

// ─── Token refresh ──────────────────────────────────────
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

// ─── Purchase invoice read API ──────────────────────────
export interface MbPurchaseInvoiceDetail {
  id?: string;
  description: string;
  amount?: string;          // raw "1.0", "2,5 kg" — Moneybird varieert
  amount_decimal?: string;  // "1.0" — numeriek deel
  price?: string;           // unit price excl btw, als string
  total_price_excl_tax_with_discount?: string;
  tax_rate_id?: string | null;
  ledger_account_id?: string | null;
}

export interface MbPurchaseInvoice {
  id: string;
  contact_id?: string | null;
  reference?: string | null;
  date?: string | null;                       // YYYY-MM-DD
  due_date?: string | null;
  state?: string;                             // 'open', 'late', 'paid', etc.
  total_price_excl_tax?: string;
  total_price_incl_tax?: string;
  currency?: string;
  details?: MbPurchaseInvoiceDetail[];
}

export interface MbContact {
  id: string;
  company_name?: string | null;
  firstname?: string | null;
  lastname?: string | null;
}

export interface MbListPurchaseInvoicesOptions {
  /** YYYY-MM-DD — filter op factuurdatum >= sinds */
  since?: string;
  /** YYYY-MM-DD — filter op factuurdatum <= tot */
  until?: string;
  /** Page-grootte, max 100 bij Moneybird */
  perPage?: number;
  /** AbortSignal voor cancel */
  signal?: AbortSignal;
}

/**
 * Pagineer alle purchase_invoices binnen het opgegeven datumbereik.
 * Moneybird gebruikt cursor-paginering via `Link`-header met `?page=`-param.
 *
 * Filtering: gebruikt `filter=period:since..until` syntax die Moneybird ondersteunt
 * (zie https://developer.moneybird.com/api/documents_purchase_invoices/#list).
 */
export async function listAllPurchaseInvoices(
  accessToken: string,
  administrationId: string,
  options: MbListPurchaseInvoicesOptions = {}
): Promise<MbPurchaseInvoice[] | { error: string }> {
  const perPage = Math.min(options.perPage ?? 100, 100);
  const out: MbPurchaseInvoice[] = [];
  let page = 1;
  const MAX_PAGES = 100; // safety: 100 * 100 = 10.000 facturen

  while (page <= MAX_PAGES) {
    const url = new URL(`${MB_API_BASE}/${administrationId}/documents/purchase_invoices.json`);
    url.searchParams.set('page', String(page));
    url.searchParams.set('per_page', String(perPage));
    if (options.since && options.until) {
      url.searchParams.set('filter', `period:${options.since.replaceAll('-', '')}..${options.until.replaceAll('-', '')}`);
    } else if (options.since) {
      const until = new Date().toISOString().slice(0, 10);
      url.searchParams.set('filter', `period:${options.since.replaceAll('-', '')}..${until.replaceAll('-', '')}`);
    }

    const res = await fetch(url.toString(), {
      headers: { 'Authorization': `Bearer ${accessToken}` },
      signal: options.signal,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return { error: `HTTP ${res.status}: ${body?.error || res.statusText}` };
    }
    const batch = (await res.json()) as MbPurchaseInvoice[];
    if (!Array.isArray(batch) || batch.length === 0) break;
    out.push(...batch);
    if (batch.length < perPage) break;
    page++;
  }

  return out;
}

/**
 * Haal een enkele purchase_invoice op met volledige details inclusief
 * line items (`details[]`). De list-endpoint kan een afgekorte versie geven
 * — hiermee zekerheid.
 */
export async function getPurchaseInvoice(
  accessToken: string,
  administrationId: string,
  invoiceId: string
): Promise<MbPurchaseInvoice | { error: string }> {
  const res = await fetch(
    `${MB_API_BASE}/${administrationId}/documents/purchase_invoices/${invoiceId}.json`,
    { headers: { 'Authorization': `Bearer ${accessToken}` } }
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    return { error: `HTTP ${res.status}: ${body?.error || res.statusText}` };
  }
  return (await res.json()) as MbPurchaseInvoice;
}

/**
 * Download de originele PDF/scan die aan de purchase_invoice hangt.
 * Moneybird stuurt 302 → presigned S3 URL.
 */
export async function downloadPurchaseInvoiceAttachment(
  accessToken: string,
  administrationId: string,
  invoiceId: string,
  attachmentId: string
): Promise<{ buffer: Buffer; mime: string; filename: string } | { error: string }> {
  const res = await fetch(
    `${MB_API_BASE}/${administrationId}/documents/purchase_invoices/${invoiceId}/attachments/${attachmentId}/download`,
    { headers: { 'Authorization': `Bearer ${accessToken}` }, redirect: 'follow' }
  );
  if (!res.ok) {
    return { error: `HTTP ${res.status}: ${res.statusText}` };
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  const mime = res.headers.get('content-type') || 'application/octet-stream';
  const cd = res.headers.get('content-disposition') || '';
  const fnMatch = cd.match(/filename="?([^"]+)"?/);
  const filename = fnMatch ? fnMatch[1] : `purchase-invoice-${invoiceId}.pdf`;
  return { buffer, mime, filename };
}

export async function getContact(
  accessToken: string,
  administrationId: string,
  contactId: string
): Promise<MbContact | { error: string }> {
  const res = await fetch(
    `${MB_API_BASE}/${administrationId}/contacts/${contactId}.json`,
    { headers: { 'Authorization': `Bearer ${accessToken}` } }
  );
  if (!res.ok) {
    return { error: `HTTP ${res.status}: ${res.statusText}` };
  }
  return (await res.json()) as MbContact;
}

// ─── Per-org config helper met auto-refresh ─────────────
export interface MbOrgConfig {
  access_token: string;
  refresh_token: string | null;
  administration_id: string;
  connected_at: string | null;
}

export interface SupabaseLikeClient {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, val: string) => {
        single: () => Promise<{ data: { feature_flags: Record<string, unknown> } | null; error: unknown }>;
      };
    };
    update: (vals: Record<string, unknown>) => {
      eq: (col: string, val: string) => Promise<{ error: unknown }>;
    };
  };
}

/**
 * Lees de Moneybird-config uit organizations.feature_flags.moneybird.
 * Voert auto-refresh uit als de huidige access_token een 401 oplevert.
 *
 * Caller moet een service-role Supabase client doorgeven want we lezen + schrijven
 * `organizations.feature_flags` direct.
 */
export async function getMoneybirdOrgConfig(
  sb: SupabaseLikeClient,
  organizationId: string
): Promise<MbOrgConfig | { error: string }> {
  const { data: org, error } = await sb
    .from('organizations')
    .select('feature_flags')
    .eq('id', organizationId)
    .single();
  if (error || !org) return { error: 'Organisatie niet gevonden' };

  const ff = (org.feature_flags || {}) as Record<string, unknown>;
  const mb = ff.moneybird as Partial<MbOrgConfig> | undefined;
  if (!mb?.access_token || !mb?.administration_id) {
    return { error: 'Moneybird niet verbonden' };
  }

  return {
    access_token: mb.access_token,
    refresh_token: mb.refresh_token ?? null,
    administration_id: mb.administration_id,
    connected_at: mb.connected_at ?? null,
  };
}

/**
 * Probeer een Moneybird-call. Bij 401 (verlopen token): refresh + retry.
 * Updatet `feature_flags.moneybird.access_token` als refresh slaagt.
 *
 * NB: `fn` krijgt de huidige (mogelijk pas-vernieuwde) token mee.
 */
export async function withFreshMoneybirdToken<T>(
  sb: SupabaseLikeClient,
  organizationId: string,
  fn: (cfg: MbOrgConfig) => Promise<T | { error: string }>
): Promise<T | { error: string }> {
  const cfg = await getMoneybirdOrgConfig(sb, organizationId);
  if ('error' in cfg) return cfg;

  const first = await fn(cfg);
  if (!isAuthError(first)) return first;

  // Refresh + retry
  if (!cfg.refresh_token) {
    return { error: 'Moneybird-token verlopen en geen refresh_token beschikbaar — herverbind nodig' };
  }
  const fresh = await refreshAccessToken(cfg.refresh_token);
  if ('error' in fresh) {
    return { error: 'Token-refresh faalde: ' + fresh.error };
  }

  // Persist nieuwe tokens
  const { data: org } = await sb
    .from('organizations')
    .select('feature_flags')
    .eq('id', organizationId)
    .single();
  const ff = (org?.feature_flags || {}) as Record<string, unknown>;
  ff.moneybird = {
    ...(ff.moneybird as Record<string, unknown>),
    access_token: fresh.access_token,
    refresh_token: fresh.refresh_token || cfg.refresh_token,
  };
  await sb.from('organizations').update({ feature_flags: ff }).eq('id', organizationId);

  return fn({ ...cfg, access_token: fresh.access_token, refresh_token: fresh.refresh_token || cfg.refresh_token });
}

function isAuthError(result: unknown): boolean {
  if (!result || typeof result !== 'object') return false;
  const err = (result as { error?: unknown }).error;
  if (typeof err !== 'string') return false;
  return err.includes('HTTP 401') || err.includes('HTTP 403') || err.toLowerCase().includes('unauthorized');
}
