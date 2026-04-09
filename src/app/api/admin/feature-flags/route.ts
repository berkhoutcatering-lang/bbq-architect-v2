/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase-server';

async function getPlatformAdmin() {
  const authSb = await createServerSupabase();
  const { data: { user } } = await authSb.auth.getUser();
  if (!user) return null;
  const adminEmails = (process.env.PLATFORM_ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
  if (!adminEmails.includes((user.email || '').toLowerCase())) return null;
  return user;
}

// Available feature flags
const AVAILABLE_FLAGS = [
  { key: 'ai_assistant', label: 'AI Assistent', description: 'Toegang tot de AI Pitmaster Studio' },
  { key: 'price_intelligence', label: 'Prijsintelligentie', description: 'Geavanceerde prijsanalyse en marktinzichten' },
  { key: 'csv_import', label: 'CSV Import', description: 'Importeer data via CSV-bestanden' },
  { key: 'website_builder', label: 'Website Builder', description: 'Beheer een publieke website' },
  { key: 'advanced_analytics', label: 'Geavanceerde Analytics', description: 'Uitgebreide financiele rapportages' },
  { key: 'api_access', label: 'API Toegang', description: 'REST API toegang voor integraties' },
  { key: 'multi_location', label: 'Meerdere Locaties', description: 'Ondersteuning voor meerdere vestigingen' },
  { key: 'white_label', label: 'White Label', description: 'Volledig eigen branding zonder BBQ Architect logo' },
];

// GET — Get feature flags for an org
export async function GET(request: NextRequest) {
  const user = await getPlatformAdmin();
  if (!user) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 });

  const orgId = request.nextUrl.searchParams.get('orgId');
  if (!orgId) return NextResponse.json({ error: 'orgId is verplicht' }, { status: 400 });

  const sb = createServiceSupabase();
  const { data: org } = await sb.from('organizations').select('id, name, feature_flags').eq('id', orgId).single();

  if (!org) return NextResponse.json({ error: 'Org niet gevonden' }, { status: 404 });

  const flags = (org.feature_flags || {}) as Record<string, boolean>;

  return NextResponse.json({
    orgId: org.id,
    orgName: org.name,
    flags,
    availableFlags: AVAILABLE_FLAGS,
  });
}

// POST — Update feature flags for an org
export async function POST(request: NextRequest) {
  const user = await getPlatformAdmin();
  if (!user) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 });

  const { orgId, flags } = await request.json();
  if (!orgId || !flags) return NextResponse.json({ error: 'orgId en flags zijn verplicht' }, { status: 400 });

  const sb = createServiceSupabase();

  const { error } = await sb
    .from('organizations')
    .update({ feature_flags: flags })
    .eq('id', orgId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
