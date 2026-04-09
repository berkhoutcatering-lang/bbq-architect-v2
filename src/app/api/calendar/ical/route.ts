import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function escapeIcal(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

function foldLine(line: string): string {
  // RFC 5545: lines should not exceed 75 octets; fold with CRLF + space
  const maxLen = 75;
  if (line.length <= maxLen) return line;
  const parts: string[] = [];
  parts.push(line.slice(0, maxLen));
  let i = maxLen;
  while (i < line.length) {
    parts.push(' ' + line.slice(i, i + maxLen - 1));
    i += maxLen - 1;
  }
  return parts.join('\r\n');
}

function formatDateStamp(): string {
  // DTSTAMP in UTC: YYYYMMDDTHHmmssZ
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  const h = String(now.getUTCHours()).padStart(2, '0');
  const min = String(now.getUTCMinutes()).padStart(2, '0');
  const s = String(now.getUTCSeconds()).padStart(2, '0');
  return `${y}${m}${d}T${h}${min}${s}Z`;
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
    .select('id, name, date, location, guests, ppp, status, client_naam, notes')
    .in('status', ['confirmed', 'completed'])
    .order('date', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const dtstamp = formatDateStamp();

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//BBQ Architect//Hop & Bites iCal Export//NL',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:BBQ Architect - Bevestigde Events',
    'X-WR-TIMEZONE:Europe/Amsterdam',
  ];

  (events || []).forEach((ev) => {
    const dateStr = (ev.date || '').replace(/-/g, '');
    if (!dateStr) return;

    // Compute end date as next day for all-day events (RFC 5545 DTEND is exclusive)
    const startDate = new Date(ev.date);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 1);
    const endStr = `${endDate.getFullYear()}${String(endDate.getMonth() + 1).padStart(2, '0')}${String(endDate.getDate()).padStart(2, '0')}`;

    const summary = ev.name || ev.client_naam || 'BBQ Event';

    const descParts: string[] = [];
    if (ev.client_naam) descParts.push(`Klant: ${ev.client_naam}`);
    if (ev.guests) descParts.push(`Aantal gasten: ${ev.guests}`);
    if (ev.ppp) descParts.push(`Prijs p.p.: EUR ${Number(ev.ppp).toFixed(2)}`);
    if (ev.status) descParts.push(`Status: ${ev.status}`);
    if (ev.notes) descParts.push(`Notities: ${ev.notes}`);
    const description = descParts.join('\\n');

    lines.push('BEGIN:VEVENT');
    lines.push(`UID:bbq-event-${ev.id}@bbqarchitect.nl`);
    lines.push(`DTSTAMP:${dtstamp}`);
    lines.push(foldLine(`DTSTART;VALUE=DATE:${dateStr}`));
    lines.push(foldLine(`DTEND;VALUE=DATE:${endStr}`));
    lines.push(foldLine(`SUMMARY:${escapeIcal(summary)}`));
    if (description) lines.push(foldLine(`DESCRIPTION:${escapeIcal(description)}`));
    if (ev.location) lines.push(foldLine(`LOCATION:${escapeIcal(ev.location)}`));
    lines.push(`STATUS:${ev.status === 'completed' ? 'CONFIRMED' : 'CONFIRMED'}`);
    lines.push('TRANSP:OPAQUE');
    lines.push('END:VEVENT');
  });

  lines.push('END:VCALENDAR');

  const icsContent = lines.join('\r\n');

  return new NextResponse(icsContent, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'attachment; filename="bbq-architect-confirmed-events.ics"',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  });
}
