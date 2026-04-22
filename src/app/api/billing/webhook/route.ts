import { NextResponse, type NextRequest } from 'next/server';
import { createServiceSupabase } from '@/lib/supabase-server';
import { getPayment, createSubscription } from '@/lib/mollie';
import type { Tier } from '@/lib/featureFlags';

export const runtime = 'nodejs';

/**
 * POST /api/billing/webhook
 *
 * Mollie roept dit aan na elke status-wijziging op een payment of
 * subscription. Body bevat enkel `id` — wij moeten zelf de payment ophalen.
 *
 * Flow:
 *  1. Haal payment op
 *  2. Vind organization via metadata.organization_id of customerId
 *  3. Bij `paid` + sequenceType=first: maak recurring subscription
 *  4. Update organizations.plan + subscription_status
 *
 * Per Mollie best-practice: idempotent, returns 200 zelfs bij herhaalde calls.
 */
export async function POST(request: NextRequest) {
  if (!process.env.MOLLIE_API_KEY) {
    // Geen 5xx — Mollie zou dan blijven retry'en
    return new NextResponse('billing not configured', { status: 200 });
  }

  const formData = await request.formData().catch(() => null);
  const paymentId = formData?.get('id')?.toString();
  if (!paymentId) {
    return new NextResponse('missing id', { status: 200 });
  }

  const sb = createServiceSupabase();
  const payRes = await getPayment(paymentId);
  if (!payRes.ok || !payRes.data) {
    console.warn(`[billing/webhook] kon payment ${paymentId} niet ophalen: ${payRes.error}`);
    return new NextResponse('ok', { status: 200 });
  }
  const payment = payRes.data;
  const md = (payment as unknown as { metadata?: Record<string, string> }).metadata || {};
  const tier = md.tier as Tier | undefined;
  const customerId = payment.customerId;

  // Vind org via mollie_customer_id
  if (!customerId) return new NextResponse('no customer', { status: 200 });

  const { data: org } = await sb
    .from('organizations')
    .select('id, mollie_subscription_id')
    .eq('mollie_customer_id', customerId)
    .maybeSingle();

  if (!org) {
    console.warn(`[billing/webhook] geen org voor customer ${customerId}`);
    return new NextResponse('ok', { status: 200 });
  }

  if (payment.status === 'paid') {
    // Als nog geen subscription: maak hem aan
    if (md.kind === 'first_payment' && tier && !org.mollie_subscription_id) {
      const baseUrl = request.nextUrl.origin;
      const subRes = await createSubscription({
        customerId,
        tier,
        webhookUrl: `${baseUrl}/api/billing/webhook`,
        startDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10), // start over 30 dagen (na trial)
      });
      if (subRes.ok && subRes.data) {
        await sb.from('organizations').update({
          plan: tier,
          mollie_subscription_id: subRes.data.id,
          subscription_status: 'active',
          trial_ends_at: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
        }).eq('id', org.id);
      } else {
        console.error(`[billing/webhook] subscription-create faalde: ${subRes.error}`);
      }
    } else {
      // Recurring payment success — verleng subscription_status
      await sb.from('organizations').update({
        subscription_status: 'active',
      }).eq('id', org.id);
    }
  } else if (payment.status === 'failed' || payment.status === 'canceled' || payment.status === 'expired') {
    await sb.from('organizations').update({
      subscription_status: 'payment_failed',
    }).eq('id', org.id);
  }

  return new NextResponse('ok', { status: 200 });
}
