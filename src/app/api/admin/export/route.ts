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

// GET — Export org data as JSON
export async function GET(request: NextRequest) {
  const user = await getPlatformAdmin();
  if (!user) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 });

  const orgId = request.nextUrl.searchParams.get('orgId');
  const format = request.nextUrl.searchParams.get('format') || 'json';

  if (!orgId) return NextResponse.json({ error: 'orgId parameter is verplicht' }, { status: 400 });

  const sb = createServiceSupabase();

  // Fetch org info
  const { data: org } = await sb.from('organizations').select('*').eq('id', orgId).single();
  if (!org) return NextResponse.json({ error: 'Organisatie niet gevonden' }, { status: 404 });

  // Fetch all data tables
  const tables = ['events', 'offertes', 'facturen', 'recepten', 'gerechten', 'klanten', 'inventory', 'materieel', 'haccp_records', 'leveranciers'];
  const exportData: Record<string, any[]> = { organization: [org] };

  for (const table of tables) {
    const { data: rows } = await sb.from(table).select('*').eq('organization_id', orgId);
    exportData[table] = rows || [];
  }

  // Settings
  const { data: settings } = await sb.from('settings').select('*').eq('organization_id', orgId);
  exportData.settings = settings || [];

  // Members
  const { data: members } = await sb.from('organization_members').select('id, role, status, joined_at').eq('organization_id', orgId);
  exportData.members = members || [];

  if (format === 'csv') {
    // Convert to CSV (simplified — one table at a time, return the biggest one)
    const lines: string[] = [];
    for (const [table, rows] of Object.entries(exportData)) {
      if (rows.length === 0) continue;
      lines.push('--- ' + table.toUpperCase() + ' ---');
      const headers = Object.keys(rows[0]);
      lines.push(headers.join(','));
      rows.forEach((row: any) => {
        lines.push(headers.map(h => {
          const val = row[h];
          if (val === null || val === undefined) return '';
          const str = typeof val === 'object' ? JSON.stringify(val) : String(val);
          return str.includes(',') || str.includes('"') ? '"' + str.replace(/"/g, '""') + '"' : str;
        }).join(','));
      });
      lines.push('');
    }

    return new NextResponse(lines.join('\n'), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="export-' + org.slug + '.csv"',
      },
    });
  }

  // JSON export
  return new NextResponse(JSON.stringify(exportData, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': 'attachment; filename="export-' + org.slug + '.json"',
    },
  });
}
