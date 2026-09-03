import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';

function escapeIcal(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

export async function GET() {
  /* Stond hier met een eigen anon-client zónder sessie. RLS gaf dan niets terug,
     dus het .ics-bestand bevatte alleen de VCALENDAR-kop en nul afspraken —
     terwijl er gewoon events waren. Er zat bovendien geen filter op organisatie
     in; de enige reden dat er niets lekte was dat de query toch al leeg bleef.
     Nu de sessie van de gebruiker, plus een expliciete org-filter. */
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

  const { data: memberships } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', user.id)
    .eq('status', 'active');
  const orgIds = (memberships || []).map((m) => m.organization_id);
  if (orgIds.length === 0) {
    return NextResponse.json({ error: 'Geen organisatie' }, { status: 403 });
  }

  const { data: events, error } = await supabase
    .from('events')
    .select('id,name,date,guests,status,location,client_naam')
    .in('organization_id', orgIds)
    .neq('status', 'geannuleerd')
    .order('date', { ascending: true })
    .limit(100);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//BBQ Architect//Hop & Bites//NL',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:BBQ Architect Events',
    'X-WR-TIMEZONE:Europe/Amsterdam',
  ];

  (events || []).forEach((ev) => {
    const dateStr = (ev.date || '').replace(/-/g, '');
    if (!dateStr) return;

    const summary = ev.name || ev.client_naam || 'Event';
    const description = [
      ev.guests ? `${ev.guests} gasten` : '',
      ev.status ? `Status: ${ev.status}` : '',
      ev.client_naam ? `Klant: ${ev.client_naam}` : '',
    ].filter(Boolean).join(' | ');

    lines.push('BEGIN:VEVENT');
    lines.push(`UID:bbq-event-${ev.id}@bbqarchitect`);
    lines.push(`DTSTART;VALUE=DATE:${dateStr}`);
    lines.push(`DTEND;VALUE=DATE:${dateStr}`);
    lines.push(`SUMMARY:${escapeIcal(summary)}`);
    if (description) lines.push(`DESCRIPTION:${escapeIcal(description)}`);
    if (ev.location) lines.push(`LOCATION:${escapeIcal(ev.location)}`);
    lines.push(`STATUS:${ev.status === 'confirmed' ? 'CONFIRMED' : 'TENTATIVE'}`);
    lines.push('END:VEVENT');
  });

  lines.push('END:VCALENDAR');

  return new NextResponse(lines.join('\r\n'), {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'attachment; filename="bbq-architect-events.ics"',
    },
  });
}
