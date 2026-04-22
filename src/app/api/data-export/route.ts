import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase-server';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * GET /api/data-export?orgId=<uuid>
 *
 * SF-11 — AVG-compliance dataportabiliteit (artikel 20).
 * Geeft alle data van de huidige organization in één JSON-bestand terug.
 * Verifieert dat de aangelogde user member is van die organisatie.
 *
 * Veilig:
 * - Auth check via cookies-session
 * - Membership-check tegen organization_members
 * - Daarna service-role om alle org-data op te halen (zonder RLS-roundtrips)
 */

const EXPORTABLE_TABLES = [
  'organizations', // alleen eigen org
  'profiles',
  'organization_members',
  'klanten',
  'gerechten',
  'gangen',
  'recepten',
  'events',
  'offertes',
  'facturen',
  'leveranciers',
  'inkooplijsten',
  'inventory',
  'materieel',
  'hardware_items',
  'haccp_records',
  'time_logs',
  'service_logs',
  'event_reflecties',
  'pack_lists',
  'rtr_items',
  'prep_tasks',
  'photo_logbook',
  'supplier_invoices',
  'supplier_invoice_lines',
  'supplier_prices',
  'settings',
  'email_templates',
  'emails',
  'pdf_templates',
  'website_hero',
  'website_gallery',
  'website_gangen',
  'website_gerechten',
  'website_faq',
  'activation_events',
  'ai_usage',
] as const;

export async function GET(request: NextRequest) {
  // ─── Auth ───────────────────────────────────────────
  const authSb = await createServerSupabase();
  const { data: { user }, error: authErr } = await authSb.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });
  }

  const orgId = request.nextUrl.searchParams.get('orgId');
  if (!orgId) {
    return NextResponse.json({ error: 'orgId parameter ontbreekt' }, { status: 400 });
  }

  // ─── Membership check ───────────────────────────────
  const { data: membership } = await authSb
    .from('organization_members')
    .select('role')
    .eq('user_id', user.id)
    .eq('organization_id', orgId)
    .maybeSingle();

  if (!membership) {
    return NextResponse.json({ error: 'Geen toegang tot deze organisatie' }, { status: 403 });
  }

  // ─── Export via service-role ────────────────────────
  const sb = createServiceSupabase();
  const exportData: Record<string, unknown> = {
    _meta: {
      generated_at: new Date().toISOString(),
      organization_id: orgId,
      requested_by_user_id: user.id,
      schema_version: '1.0',
      avg_recht: 'Artikel 20 GDPR — recht op dataportabiliteit',
    },
  };

  for (const table of EXPORTABLE_TABLES) {
    try {
      let query = sb.from(table).select('*');

      // organizations: alleen eigen org
      if (table === 'organizations') {
        query = query.eq('id', orgId);
      } else if (table === 'profiles' || table === 'organization_members') {
        query = query.eq('organization_id', orgId);
      } else {
        // standaard org-filter voor alle data-tabellen
        query = query.eq('organization_id', orgId);
      }

      const { data, error } = await query;
      if (error) {
        exportData[table] = { _error: error.message, rows: [] };
      } else {
        exportData[table] = data || [];
      }
    } catch (e) {
      exportData[table] = { _error: (e as Error).message, rows: [] };
    }
  }

  const filename = `bbq-architect-export-${orgId.slice(0, 8)}-${new Date().toISOString().slice(0, 10)}.json`;

  return new NextResponse(JSON.stringify(exportData, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
