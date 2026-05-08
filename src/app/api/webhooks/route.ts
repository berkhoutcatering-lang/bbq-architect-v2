/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import {
  listWebhooks,
  registerWebhook,
  removeWebhook,
  getWebhookLogs,
  WEBHOOK_EVENT_TYPES,
  type WebhookEventType,
} from '@/lib/webhooks';
import { createServerSupabase } from '@/lib/supabase-server';

async function requirePlatformAdmin() {
  const supabase = await createServerSupabase();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user?.email) {
    return { ok: false as const, response: NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 }) };
  }

  const adminEmails = (process.env.PLATFORM_ADMIN_EMAILS || '')
    .split(',')
    .map(email => email.trim().toLowerCase())
    .filter(Boolean);
  if (adminEmails.length === 0 || !adminEmails.includes(user.email.toLowerCase())) {
    return { ok: false as const, response: NextResponse.json({ error: 'Geen toegang' }, { status: 403 }) };
  }

  return { ok: true as const };
}

// ── GET: Lijst van geregistreerde webhooks + optioneel logs ──
// ?logs=true          - voeg recente logs toe
// ?webhookId=123      - filter logs op specifiek webhook
export async function GET(req: NextRequest) {
  try {
    const auth = await requirePlatformAdmin();
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(req.url);
    const includeLogs = searchParams.get('logs') === 'true';
    const webhookId = searchParams.get('webhookId');

    const webhooks = await listWebhooks();

    const response: Record<string, any> = {
      success: true,
      count: webhooks.length,
      webhooks,
      availableEvents: WEBHOOK_EVENT_TYPES,
    };

    if (includeLogs) {
      const logs = await getWebhookLogs(
        webhookId ? parseInt(webhookId, 10) : undefined,
        50
      );
      response.logs = logs;
    }

    return NextResponse.json(response);
  } catch (e: any) {
    console.error('[WEBHOOKS] GET error:', e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// ── POST: Registreer een nieuwe webhook ──
// Body: {
//   url: "https://example.com/webhook",
//   events: ["factuur.created", "offerte.accepted"],
//   secret: "optioneel-hmac-secret",
//   description: "Beschrijving van de webhook"
// }
export async function POST(req: NextRequest) {
  try {
    const auth = await requirePlatformAdmin();
    if (!auth.ok) return auth.response;

    const body = await req.json();
    const { url, events, secret, description } = body;

    // Validatie
    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'URL is verplicht' }, { status: 400 });
    }

    try {
      new URL(url);
    } catch {
      return NextResponse.json({ error: 'Ongeldige URL' }, { status: 400 });
    }

    if (!events || !Array.isArray(events) || events.length === 0) {
      return NextResponse.json(
        { error: 'Minimaal 1 event type is verplicht', availableEvents: WEBHOOK_EVENT_TYPES },
        { status: 400 }
      );
    }

    // Controleer of alle event types geldig zijn
    const validEventTypes = WEBHOOK_EVENT_TYPES.map(function (e) { return e.value; });
    const invalidEvents = events.filter(function (e: string) {
      return validEventTypes.indexOf(e as WebhookEventType) === -1;
    });

    if (invalidEvents.length > 0) {
      return NextResponse.json(
        { error: `Ongeldige event types: ${invalidEvents.join(', ')}`, availableEvents: WEBHOOK_EVENT_TYPES },
        { status: 400 }
      );
    }

    const webhook = await registerWebhook(url, events as WebhookEventType[], {
      secret,
      description,
    });

    return NextResponse.json({
      success: true,
      message: 'Webhook geregistreerd',
      webhook,
    }, { status: 201 });
  } catch (e: any) {
    console.error('[WEBHOOKS] POST error:', e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// ── DELETE: Verwijder een webhook ──
// Body: { id: 123 }
export async function DELETE(req: NextRequest) {
  try {
    const auth = await requirePlatformAdmin();
    if (!auth.ok) return auth.response;

    const body = await req.json();
    const { id } = body;

    if (!id || typeof id !== 'number') {
      return NextResponse.json({ error: 'Webhook ID is verplicht (nummer)' }, { status: 400 });
    }

    await removeWebhook(id);

    return NextResponse.json({
      success: true,
      message: `Webhook ${id} verwijderd`,
    });
  } catch (e: any) {
    console.error('[WEBHOOKS] DELETE error:', e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
