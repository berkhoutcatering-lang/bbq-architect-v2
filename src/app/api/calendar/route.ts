import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function escapeIcal(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const { data: events, error } = await supabase
    .from('events')
    .select('id,name,date,guests,status,location,client_naam')
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
