// Sprint 2-deel-3 C7 — Generic status endpoint voor de integraties-marketplace.
// Per integratie checkt 'ie of de envKeys uit de manifest gezet zijn.
// Resend heeft een eigen route met extra send-test (zie ../../resend/status).

import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';
import { findIntegration } from '@/lib/integrations';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

  const integration = findIntegration(id);
  if (!integration) {
    return NextResponse.json({ error: 'Onbekende integratie' }, { status: 404 });
  }

  // Webhooks + iCal: altijd "configured" (no env-vars nodig).
  if (integration.setup.type === 'webhook' || integration.setup.type === 'none') {
    return NextResponse.json({ configured: true });
  }

  const envKeys = integration.setup.envKeys ?? [];
  if (envKeys.length === 0) {
    return NextResponse.json({ configured: false });
  }

  const configured = envKeys.every(key => !!process.env[key]);
  return NextResponse.json({
    configured,
    missing: configured ? [] : envKeys.filter(k => !process.env[k]),
  });
}
