import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase-server';
import { createCustomer, createFirstPayment } from '@/lib/mollie';
import type { Tier } from '@/lib/featureFlags';

export const runtime = 'nodejs';

/**
 * POST /api/billing/checkout
 * Body: { tier: 'starter' | 'professional' | 'enterprise' }
 *
 * Flow:
 *  1. Auth + org check
 *  2. Maak (of hergebruik) een Mollie-customer voor deze org
 *  3. Maak een eerste iDEAL-betaling om een mandate te krijgen
 *  4. Returneer hosted-checkout URL waar de klant naartoe geleid wordt
 *
 * Na succesvolle eerste betaling roept Mollie de webhook aan
 * (/api/billing/webhook). Daar maken we de recurring subscription aan
 * en updaten organizations.plan + subscription_status.
 */
export async function POST(request: NextRequest) {
  if (!process.env.MOLLIE_API_KEY) {
    return NextResponse.json({
      error: 'Billing nog niet geconfigureerd',
      hint: 'Stel MOLLIE_API_KEY in (test_xxx of live_xxx) — zie docs/execution-playbook.md §H',
    }, { status: 503 });
  }

  const authSb = await createServerSupabase();
  const { data: { user } } = await authSb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const tier: Tier | undefined = body?.tier;
  if (!tier || !['starter', 'professional', 'enterprise'].includes(tier)) {
    return NextResponse.json({ error: 'Ongeldige tier' }, { status: 400 });
  }

  // ─── Org-check ─────────────────────────────────────
  const { data: membership } = await authSb
    .from('organization_members')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .in('role', ['owner', 'admin'])
    .maybeSingle();
  if (!membership) {
    return NextResponse.json({ error: 'Alleen org-owner/admin kan abonnement starten' }, { status: 403 });
  }

  const sb = createServiceSupabase();
  const { data: org } = await sb
    .from('organizations')
    .select('id,name,mollie_customer_id')
    .eq('id', membership.organization_id)
    .single();

  if (!org) return NextResponse.json({ error: 'Organisatie niet gevonden' }, { status: 404 });

  // ─── Mollie-customer (create or reuse) ─────────────
  let customerId = org.mollie_customer_id as string | null;
  if (!customerId) {
    const c = await createCustomer({
      email: user.email || `org-${org.id}@bbqarchitect.local`,
      name: org.name,
      metadata: { organization_id: org.id },
    });
    if (!c.ok || !c.data) return NextResponse.json({ error: 'Mollie customer-create faalde: ' + c.error }, { status: 502 });
    customerId = c.data.id;
    await sb.from('organizations').update({ mollie_customer_id: customerId }).eq('id', org.id);
  }

  // ─── First payment ─────────────────────────────────
  const baseUrl = request.nextUrl.origin;
  const payment = await createFirstPayment({
    customerId,
    tier,
    redirectUrl: `${baseUrl}/instellingen?billing=complete`,
    webhookUrl: `${baseUrl}/api/billing/webhook`,
    description: `BBQ Architect ${tier} — start abonnement voor ${org.name}`,
  });

  if (!payment.ok || !payment.data?._links?.checkout?.href) {
    return NextResponse.json({ error: 'Mollie payment-create faalde: ' + payment.error }, { status: 502 });
  }

  // Save pending tier (set after webhook confirms)
  await sb.from('organizations').update({
    subscription_status: 'pending_first_payment',
  }).eq('id', org.id);

  return NextResponse.json({
    checkoutUrl: payment.data._links.checkout.href,
    paymentId: payment.data.id,
  });
}
