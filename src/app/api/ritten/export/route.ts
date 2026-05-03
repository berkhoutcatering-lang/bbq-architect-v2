// CSV-export voor rittenregistratie. Velden voldoen aan Belastingdienst-eisen 2026.
// Server-side: leest via RLS-aware Supabase client (cookie-session).
// Pillar #2: 7/7 verplichte velden + extra context-velden voor de boekhouder.

import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';
import { bedragAftrekbaar } from '@/lib/ritten-tarieven';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_RITTEN_PER_EXPORT = 5000;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const start = url.searchParams.get('start');
  const eind = url.searchParams.get('eind');

  if (!start || !eind || !/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(eind)) {
    return NextResponse.json(
      { error: 'start en eind verplicht (yyyy-mm-dd)' },
      { status: 400 },
    );
  }

  const sb = await createServerSupabase();
  const {
    data: { user },
    error: authErr,
  } = await sb.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });
  }

  const { data: ritten, error: rittenErr } = await sb
    .from('ritten')
    .select('*, voertuigen(kenteken, merk, type), events(name, date)')
    .gte('datum', start)
    .lte('datum', eind)
    .order('datum', { ascending: true })
    .limit(MAX_RITTEN_PER_EXPORT + 1);

  if (rittenErr) {
    return NextResponse.json({ error: rittenErr.message }, { status: 500 });
  }

  if (ritten && ritten.length > MAX_RITTEN_PER_EXPORT) {
    return NextResponse.json(
      { error: `Te veel ritten in deze periode (>${MAX_RITTEN_PER_EXPORT}). Splits in kortere perioden.` },
      { status: 413 },
    );
  }

  const csv = renderCSV(ritten ?? []);
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="ritten-${start}-${eind}.csv"`,
    },
  });
}

function csvEscape(s: unknown): string {
  if (s === null || s === undefined) return '';
  const str = String(s);
  if (/[",\n;]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

interface RittenRow {
  id: number;
  datum: string;
  vertrek_adres: string;
  aankomst_adres: string;
  route_omleiding: string | null;
  km_begin: number;
  km_eind: number;
  kilometers: number;
  zakelijk: boolean;
  prive_omleiding_km: number;
  doel: string | null;
  voertuigen?: { kenteken?: string; merk?: string; type?: string } | null;
  events?: { name?: string; date?: string } | null;
}

function renderCSV(rows: RittenRow[]): string {
  // Verplichte Belastingdienst-velden + boekhouder-context.
  const headers = [
    'Datum',
    'Kenteken',
    'Merk',
    'Type',
    'Begin km',
    'Eind km',
    'Kilometers',
    'Vertrekadres',
    'Aankomstadres',
    'Route (afwijkend)',
    'Zakelijk/Privé',
    'Privé-omleiding km',
    'Doel',
    'Gekoppeld event',
    'Aftrekbaar EUR',
  ];
  const lines = [headers.join(',')];
  for (const r of rows) {
    const aftrek = bedragAftrekbaar({
      kilometers: r.kilometers,
      zakelijk: r.zakelijk,
      priveOmleidingKm: r.prive_omleiding_km,
      datum: r.datum,
    });
    lines.push(
      [
        r.datum,
        r.voertuigen?.kenteken ?? '',
        r.voertuigen?.merk ?? '',
        r.voertuigen?.type ?? '',
        r.km_begin,
        r.km_eind,
        r.kilometers,
        r.vertrek_adres,
        r.aankomst_adres,
        r.route_omleiding ?? '',
        r.zakelijk ? 'Zakelijk' : 'Privé',
        r.prive_omleiding_km ?? 0,
        r.doel ?? '',
        r.events?.name ?? '',
        aftrek.toFixed(2),
      ]
        .map(csvEscape)
        .join(','),
    );
  }
  return '\uFEFF' + lines.join('\n'); // BOM zodat Excel UTF-8 herkent
}
