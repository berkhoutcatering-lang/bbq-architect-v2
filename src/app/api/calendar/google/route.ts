/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// ── Google Calendar Bidirectional Sync ──
// TODO: Productie-setup:
//   1. Maak een Google Cloud project aan op https://console.cloud.google.com
//   2. Activeer de Google Calendar API
//   3. Maak OAuth 2.0 credentials aan (Web application)
//   4. Genereer een refresh token via de OAuth flow
//   5. Voeg de volgende env vars toe aan .env.local:
//      GOOGLE_CLIENT_ID=...
//      GOOGLE_CLIENT_SECRET=...
//      GOOGLE_REFRESH_TOKEN=...
//      GOOGLE_CALENDAR_ID=primary  (of een specifiek agenda-ID)

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const GOOGLE_REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN || '';
const GOOGLE_CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID || 'primary';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_CALENDAR_BASE = 'https://www.googleapis.com/calendar/v3';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

function isConfigured(): boolean {
  return !!(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET && GOOGLE_REFRESH_TOKEN);
}

function getSupabase() {
  if (!supabaseUrl || !supabaseKey) return null;
  return createClient(supabaseUrl, supabaseKey);
}

// ── OAuth: Ververs access token via refresh token ──
async function getAccessToken(): Promise<string> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: GOOGLE_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error('Google OAuth token refresh mislukt: ' + err);
  }

  const data = await res.json();
  return data.access_token;
}

// ── Map BBQ Architect event naar Google Calendar event ──
function toGoogleEvent(ev: any): Record<string, any> {
  const description = [
    ev.client_naam ? `Klant: ${ev.client_naam}` : '',
    ev.guests ? `Aantal gasten: ${ev.guests}` : '',
    ev.ppp ? `Prijs p.p.: EUR ${Number(ev.ppp).toFixed(2)}` : '',
    ev.location ? `Locatie: ${ev.location}` : '',
    ev.status ? `Status: ${ev.status}` : '',
    ev.notitie ? `\nNotities: ${ev.notitie}` : '',
  ].filter(Boolean).join('\n');

  // All-day event: startDate en endDate (exclusief)
  const startDate = ev.date;
  const endDate = (() => {
    const d = new Date(ev.date);
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  })();

  return {
    summary: ev.name || `BBQ Event - ${ev.client_naam || 'Onbekend'}`,
    description,
    location: ev.location || '',
    start: { date: startDate },
    end: { date: endDate },
    // Gebruik een stabiel ID zodat we altijd dezelfde event updaten
    extendedProperties: {
      private: {
        bbq_architect_id: String(ev.id),
        bbq_architect_status: ev.status || '',
      },
    },
  };
}

// ── Map Google Calendar event terug naar BBQ Architect velden ──
function fromGoogleEvent(gcalEvent: any): Record<string, any> {
  const startDate = gcalEvent.start?.date || gcalEvent.start?.dateTime?.slice(0, 10) || '';
  const props = gcalEvent.extendedProperties?.private || {};

  return {
    google_calendar_id: gcalEvent.id,
    name: gcalEvent.summary || '',
    date: startDate,
    location: gcalEvent.location || '',
    notitie: gcalEvent.description || '',
    bbq_architect_id: props.bbq_architect_id || null,
  };
}

// ── Google Calendar API helpers ──
async function gcalFetch(accessToken: string, path: string, options: RequestInit = {}) {
  const url = `${GOOGLE_CALENDAR_BASE}/calendars/${encodeURIComponent(GOOGLE_CALENDAR_ID)}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  return res;
}

async function listGoogleEvents(accessToken: string, timeMin?: string, timeMax?: string) {
  const params = new URLSearchParams({
    maxResults: '100',
    singleEvents: 'true',
    orderBy: 'startTime',
  });
  if (timeMin) params.set('timeMin', new Date(timeMin).toISOString());
  if (timeMax) params.set('timeMax', new Date(timeMax).toISOString());

  const res = await gcalFetch(accessToken, `/events?${params.toString()}`);
  if (!res.ok) throw new Error('Google Calendar events ophalen mislukt: ' + (await res.text()));
  const data = await res.json();
  return data.items || [];
}

async function createGoogleEvent(accessToken: string, event: any) {
  const res = await gcalFetch(accessToken, '/events', {
    method: 'POST',
    body: JSON.stringify(event),
  });
  if (!res.ok) throw new Error('Google Calendar event aanmaken mislukt: ' + (await res.text()));
  return res.json();
}

async function updateGoogleEvent(accessToken: string, eventId: string, event: any) {
  const res = await gcalFetch(accessToken, `/events/${encodeURIComponent(eventId)}`, {
    method: 'PATCH',
    body: JSON.stringify(event),
  });
  if (!res.ok) throw new Error('Google Calendar event updaten mislukt: ' + (await res.text()));
  return res.json();
}

async function deleteGoogleEvent(accessToken: string, eventId: string) {
  const res = await gcalFetch(accessToken, `/events/${encodeURIComponent(eventId)}`, {
    method: 'DELETE',
  });
  if (!res.ok && res.status !== 404) {
    throw new Error('Google Calendar event verwijderen mislukt: ' + (await res.text()));
  }
}

// ── GET: Haal events op uit Google Calendar ──
export async function GET(req: NextRequest) {
  try {
    if (!isConfigured()) {
      return NextResponse.json(
        { error: 'Google Calendar niet geconfigureerd \u2014 voeg GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET en GOOGLE_REFRESH_TOKEN toe in .env' },
        { status: 501 }
      );
    }

    const { searchParams } = new URL(req.url);
    const timeMin = searchParams.get('from') || undefined;
    const timeMax = searchParams.get('to') || undefined;

    const accessToken = await getAccessToken();
    const events = await listGoogleEvents(accessToken, timeMin, timeMax);
    const mapped = events.map(fromGoogleEvent);

    return NextResponse.json({
      success: true,
      count: mapped.length,
      events: mapped,
    });
  } catch (e: any) {
    console.error('[GOOGLE-CALENDAR] GET error:', e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// ── POST: Sync BBQ Architect events naar Google Calendar ──
// Body: { action: 'sync' } voor volledige sync
// Body: { action: 'push', eventId: 123 } voor een enkel event
export async function POST(req: NextRequest) {
  try {
    if (!isConfigured()) {
      return NextResponse.json(
        { error: 'Google Calendar niet geconfigureerd \u2014 voeg GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET en GOOGLE_REFRESH_TOKEN toe in .env' },
        { status: 501 }
      );
    }

    const sb = getSupabase();
    if (!sb) return NextResponse.json({ error: 'Geen database verbinding' }, { status: 500 });

    const body = await req.json();
    const action = body.action || 'sync';
    const accessToken = await getAccessToken();

    if (action === 'push' && body.eventId) {
      // ── Push een enkel event ──
      const { data: ev, error } = await sb.from('events').select('*').eq('id', body.eventId).single();
      if (error || !ev) return NextResponse.json({ error: 'Event niet gevonden' }, { status: 404 });

      const gcalEvent = toGoogleEvent(ev);

      // Zoek of er al een gekoppeld Google Calendar event bestaat
      const existing = await findLinkedGoogleEvent(accessToken, ev.id);
      let result;
      if (existing) {
        result = await updateGoogleEvent(accessToken, existing.id, gcalEvent);
      } else {
        result = await createGoogleEvent(accessToken, gcalEvent);
      }

      return NextResponse.json({ success: true, action: 'push', googleEventId: result.id });
    }

    // ── Volledige sync: alle bevestigde events ──
    const { data: events, error } = await sb
      .from('events')
      .select('*')
      .in('status', ['confirmed', 'completed', 'pending'])
      .order('date', { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const results = { created: 0, updated: 0, deleted: 0, errors: [] as string[] };

    // Haal alle Google Calendar events op die door BBQ Architect zijn aangemaakt
    const gcalEvents = await listGoogleEvents(accessToken);
    const gcalByBbqId = new Map<string, any>();
    for (const ge of gcalEvents) {
      const bbqId = ge.extendedProperties?.private?.bbq_architect_id;
      if (bbqId) gcalByBbqId.set(bbqId, ge);
    }

    const processedBbqIds = new Set<string>();

    for (const ev of (events || [])) {
      try {
        const bbqId = String(ev.id);
        processedBbqIds.add(bbqId);
        const gcalEvent = toGoogleEvent(ev);
        const existing = gcalByBbqId.get(bbqId);

        if (existing) {
          await updateGoogleEvent(accessToken, existing.id, gcalEvent);
          results.updated++;
        } else {
          await createGoogleEvent(accessToken, gcalEvent);
          results.created++;
        }
      } catch (e: any) {
        results.errors.push(`Event ${ev.id}: ${e.message}`);
      }
    }

    // Verwijder Google Calendar events voor geannuleerde/verwijderde BBQ events
    for (const [bbqId, gcalEv] of gcalByBbqId) {
      if (!processedBbqIds.has(bbqId)) {
        try {
          await deleteGoogleEvent(accessToken, gcalEv.id);
          results.deleted++;
        } catch (e: any) {
          results.errors.push(`Verwijderen ${bbqId}: ${e.message}`);
        }
      }
    }

    return NextResponse.json({ success: true, action: 'sync', results });
  } catch (e: any) {
    console.error('[GOOGLE-CALENDAR] POST error:', e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// ── Helper: Zoek een bestaand Google Calendar event op basis van BBQ Architect ID ──
async function findLinkedGoogleEvent(accessToken: string, bbqEventId: number): Promise<any | null> {
  const events = await listGoogleEvents(accessToken);
  return events.find((e: any) =>
    e.extendedProperties?.private?.bbq_architect_id === String(bbqEventId)
  ) || null;
}
