/**
 * Mollie API wrapper voor BBQ Architect billing.
 * Werkt zodra `MOLLIE_API_KEY` is gezet in .env (test_xxx of live_xxx).
 *
 * Pricing-tiers worden in code afgeleid van TIER_PRICING in featureFlags.ts.
 * Mollie Subscriptions vereist een first payment om customer + mandate te krijgen.
 */

import type { Tier } from './featureFlags';
import { TIER_PRICING } from './featureFlags';

const MOLLIE_API_BASE = 'https://api.mollie.com/v2';

function getApiKey(): string {
  const k = process.env.MOLLIE_API_KEY;
  if (!k) {
    throw new Error('MOLLIE_API_KEY ontbreekt in .env (test_xxx of live_xxx)');
  }
  return k;
}

interface MollieResponse<T = unknown> {
  ok: boolean;
  status: number;
  data?: T;
  error?: string;
}

async function mollieFetch<T = unknown>(
  path: string,
  init: RequestInit = {}
): Promise<MollieResponse<T>> {
  const res = await fetch(MOLLIE_API_BASE + path, {
    ...init,
    headers: {
      'Authorization': `Bearer ${getApiKey()}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, status: res.status, error: body?.detail || res.statusText };
  }
  return { ok: true, status: res.status, data: body as T };
}

// ─── Customer ─────────────────────────────────────────
export interface MollieCustomer {
  id: string;
  email: string;
  name: string;
}

export async function createCustomer(input: { email: string; name: string; metadata?: Record<string, string> }): Promise<MollieResponse<MollieCustomer>> {
  return mollieFetch<MollieCustomer>('/customers', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

// ─── First payment (om mandate te krijgen) ────────────
export interface MolliePayment {
  id: string;
  status: string;
  amount: { value: string; currency: string };
  customerId?: string;
  mandateId?: string;
  _links?: { checkout?: { href: string } };
}

export async function createFirstPayment(opts: {
  customerId: string;
  tier: Tier;
  redirectUrl: string;
  webhookUrl: string;
  description?: string;
}): Promise<MollieResponse<MolliePayment>> {
  const tier = TIER_PRICING[opts.tier];
  return mollieFetch<MolliePayment>('/payments', {
    method: 'POST',
    body: JSON.stringify({
      amount: { currency: 'EUR', value: tier.monthlyEUR.toFixed(2) },
      description: opts.description || `BBQ Architect ${tier.label} — eerste betaling`,
      redirectUrl: opts.redirectUrl,
      webhookUrl: opts.webhookUrl,
      customerId: opts.customerId,
      sequenceType: 'first',
      method: 'ideal',
      metadata: { tier: opts.tier, kind: 'first_payment' },
    }),
  });
}

// ─── Recurring subscription ───────────────────────────
export interface MollieSubscription {
  id: string;
  status: string;
  amount: { value: string; currency: string };
  interval: string;
}

export async function createSubscription(opts: {
  customerId: string;
  tier: Tier;
  webhookUrl: string;
  startDate?: string;
}): Promise<MollieResponse<MollieSubscription>> {
  const tier = TIER_PRICING[opts.tier];
  return mollieFetch<MollieSubscription>(`/customers/${opts.customerId}/subscriptions`, {
    method: 'POST',
    body: JSON.stringify({
      amount: { currency: 'EUR', value: tier.monthlyEUR.toFixed(2) },
      interval: '1 month',
      description: `BBQ Architect ${tier.label} maandabonnement`,
      webhookUrl: opts.webhookUrl,
      startDate: opts.startDate,
      metadata: { tier: opts.tier },
    }),
  });
}

export async function cancelSubscription(customerId: string, subscriptionId: string): Promise<MollieResponse<MollieSubscription>> {
  return mollieFetch<MollieSubscription>(`/customers/${customerId}/subscriptions/${subscriptionId}`, {
    method: 'DELETE',
  });
}

export async function getPayment(paymentId: string): Promise<MollieResponse<MolliePayment>> {
  return mollieFetch<MolliePayment>(`/payments/${paymentId}`);
}
