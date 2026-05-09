/* eslint-disable @typescript-eslint/no-explicit-any */

// ── BBQ Architect Webhook Framework ──
// Event-driven notificaties voor externe systemen.
//
// Gebruik:
//   import { emitWebhook, WebhookEventType } from '@/lib/webhooks';
//   await emitWebhook('factuur.created', { factuurId: 123, nummer: 'F2026-001' });
//
// Webhooks worden opgeslagen in Supabase (tabel: org_webhooks + org_webhook_logs).
// Migratie: supabase/migrations/030_webhooks_and_integration_tokens.sql

import { createServiceSupabase } from '@/lib/supabase-server';

// ── Event Types ──
export type WebhookEventType =
  | 'offerte.created'
  | 'offerte.accepted'
  | 'offerte.rejected'
  | 'event.created'
  | 'event.updated'
  | 'event.cancelled'
  | 'factuur.created'
  | 'factuur.sent'
  | 'factuur.paid'
  | 'haccp.recorded'
  | 'haccp.warning'
  | 'inventory.low_stock'
  | 'payment.received';

// ── Webhook Registration ──
export interface WebhookRegistration {
  id: number;
  url: string;
  events: WebhookEventType[];
  secret?: string;
  active: boolean;
  description?: string;
  created_at: string;
}

// ── Webhook Log Entry ──
export interface WebhookLogEntry {
  id?: number;
  webhook_id: number;
  event: string;
  payload: any;
  status_code: number | null;
  response_body: string | null;
  success: boolean;
  attempt: number;
  error: string | null;
  created_at?: string;
}

// ── Retry configuratie ──
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000; // 1 seconde, exponential backoff: 1s, 2s, 4s

function getSupabase() {
  try {
    return createServiceSupabase();
  } catch {
    return null;
  }
}

// ── HMAC Signing voor webhook payloads ──
async function signPayload(payload: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const data = encoder.encode(payload);

  const cryptoKey = await crypto.subtle.importKey(
    'raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', cryptoKey, data);
  const hashArray = Array.from(new Uint8Array(signature));
  return hashArray.map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
}

// ── Verstuur webhook met retry logic ──
async function deliverWebhook(
  webhook: WebhookRegistration,
  event: WebhookEventType,
  payload: any,
  attempt: number = 1
): Promise<WebhookLogEntry> {
  const body = JSON.stringify({
    event,
    timestamp: new Date().toISOString(),
    data: payload,
  });

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Webhook-Event': event,
    'X-Webhook-Attempt': String(attempt),
    'User-Agent': 'BBQ-Architect-Webhook/1.0',
  };

  // HMAC signature als er een secret is geconfigureerd
  if (webhook.secret) {
    headers['X-Webhook-Signature'] = 'sha256=' + (await signPayload(body, webhook.secret));
  }

  const logEntry: WebhookLogEntry = {
    webhook_id: webhook.id,
    event,
    payload,
    status_code: null,
    response_body: null,
    success: false,
    attempt,
    error: null,
  };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(function () { controller.abort(); }, 10000); // 10s timeout

    const res = await fetch(webhook.url, {
      method: 'POST',
      headers,
      body,
      signal: controller.signal,
    });

    clearTimeout(timeout);

    logEntry.status_code = res.status;
    logEntry.response_body = (await res.text()).slice(0, 1000); // Max 1KB response opslaan
    logEntry.success = res.status >= 200 && res.status < 300;
  } catch (e: any) {
    logEntry.error = e.name === 'AbortError' ? 'Timeout (10s)' : (e.message || 'Onbekende fout');
  }

  return logEntry;
}

// ── Sla webhook log op in Supabase ──
async function saveLog(log: WebhookLogEntry) {
  const sb = getSupabase();
  if (!sb) return;

  try {
    await sb.from('org_webhook_logs').insert(log);
  } catch (e: any) {
    console.error('[WEBHOOK] Log opslaan mislukt:', e.message);
  }
}

// ── Haal alle actieve webhooks op voor een event type ──
export async function getWebhooksForEvent(event: WebhookEventType): Promise<WebhookRegistration[]> {
  const sb = getSupabase();
  if (!sb) return [];

  const { data, error } = await sb
    .from('org_webhooks')
    .select('*')
    .eq('active', true)
    .contains('events', [event]);

  if (error) {
    console.error('[WEBHOOK] Ophalen mislukt:', error.message);
    return [];
  }

  return (data || []) as WebhookRegistration[];
}

// ── Emit: Verstuur webhook naar alle geregistreerde endpoints ──
export async function emitWebhook(event: WebhookEventType, payload: any): Promise<void> {
  const webhooks = await getWebhooksForEvent(event);

  if (webhooks.length === 0) {
    // Geen webhooks geregistreerd voor dit event, dat is ok
    return;
  }

  // Verstuur parallel naar alle endpoints
  const deliveries = webhooks.map(async function (webhook) {
    let lastLog: WebhookLogEntry | null = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      // Exponential backoff: wacht voor retries
      if (attempt > 1) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt - 2);
        await new Promise(function (resolve) { setTimeout(resolve, delay); });
      }

      lastLog = await deliverWebhook(webhook, event, payload, attempt);
      await saveLog(lastLog);

      if (lastLog.success) break;
    }

    if (lastLog && !lastLog.success) {
      console.error(
        `[WEBHOOK] Aflevering mislukt na ${MAX_RETRIES} pogingen: ${webhook.url} voor ${event}`
      );
    }
  });

  // Fire-and-forget: wacht niet op alle deliveries
  // In productie zou je dit via een queue willen doen
  Promise.allSettled(deliveries).catch(function (e) {
    console.error('[WEBHOOK] Emit fout:', e);
  });
}

// ── CRUD helpers voor webhook registraties ──

export async function listWebhooks(): Promise<WebhookRegistration[]> {
  const sb = getSupabase();
  if (!sb) return [];

  const { data, error } = await sb
    .from('org_webhooks')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw new Error('Webhooks ophalen mislukt: ' + error.message);
  return (data || []) as WebhookRegistration[];
}

export async function registerWebhook(
  url: string,
  events: WebhookEventType[],
  options: { secret?: string; description?: string } = {}
): Promise<WebhookRegistration> {
  const sb = getSupabase();
  if (!sb) throw new Error('Geen database verbinding');

  const { data, error } = await sb
    .from('org_webhooks')
    .insert({
      url,
      events,
      secret: options.secret || null,
      description: options.description || null,
      active: true,
    })
    .select()
    .single();

  if (error) throw new Error('Webhook registreren mislukt: ' + error.message);
  return data as WebhookRegistration;
}

export async function removeWebhook(id: number): Promise<void> {
  const sb = getSupabase();
  if (!sb) throw new Error('Geen database verbinding');

  const { error } = await sb.from('org_webhooks').delete().eq('id', id);
  if (error) throw new Error('Webhook verwijderen mislukt: ' + error.message);
}

export async function getWebhookLogs(webhookId?: number, limit: number = 50): Promise<WebhookLogEntry[]> {
  const sb = getSupabase();
  if (!sb) return [];

  let query = sb
    .from('org_webhook_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (webhookId) {
    query = query.eq('webhook_id', webhookId);
  }

  const { data, error } = await query;
  if (error) throw new Error('Webhook logs ophalen mislukt: ' + error.message);
  return (data || []) as WebhookLogEntry[];
}

// ── Beschikbare event types (voor UI) ──
export const WEBHOOK_EVENT_TYPES: { value: WebhookEventType; label: string }[] = [
  { value: 'offerte.created',    label: 'Offerte aangemaakt' },
  { value: 'offerte.accepted',   label: 'Offerte geaccepteerd' },
  { value: 'offerte.rejected',   label: 'Offerte afgewezen' },
  { value: 'event.created',      label: 'Event aangemaakt' },
  { value: 'event.updated',      label: 'Event gewijzigd' },
  { value: 'event.cancelled',    label: 'Event geannuleerd' },
  { value: 'factuur.created',    label: 'Factuur aangemaakt' },
  { value: 'factuur.sent',       label: 'Factuur verzonden' },
  { value: 'factuur.paid',       label: 'Factuur betaald' },
  { value: 'haccp.recorded',     label: 'HACCP registratie' },
  { value: 'haccp.warning',      label: 'HACCP waarschuwing' },
  { value: 'inventory.low_stock', label: 'Voorraad onder minimum' },
  { value: 'payment.received',   label: 'Betaling ontvangen' },
];
