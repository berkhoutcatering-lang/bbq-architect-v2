/**
 * GET/POST /api/cron/calendar-google-sync
 *
 * Bidirectional Google Calendar sync — Pillar #2 (Plannen).
 * Triggert elke 6 uur de bestaande sync-logic van /api/calendar/google.
 *
 * Auth: CRON_SECRET in Authorization header (Vercel cron-pattern).
 * Configuratie: vercel.json schedule `0 *​/6 * * *`.
 *
 * Multi-tenant v1: gebruikt de single-tenant env-vars (GOOGLE_CLIENT_ID,
 * GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN). Per-org token-storage is
 * Sprint 3 werk (extension van integration_tokens).
 */

import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 300;

async function run(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get('authorization') || '';
  const provided = authHeader.replace(/^Bearer\s+/i, '');

  if (!cronSecret || provided !== cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!process.env.GOOGLE_REFRESH_TOKEN) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: 'Google Calendar niet geconfigureerd — geen sync.',
    });
  }

  // Roep de bestaande sync-route aan met het juiste action-payload.
  // We hergebruiken die logic ipv duplicate-implementatie hier.
  const origin = req.nextUrl.origin;
  const startedAt = Date.now();

  try {
    const res = await fetch(`${origin}/api/calendar/google`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Service-call: gebruik de cron-secret zodat de sync-route weet
        // dat dit een vertrouwde internal aanroep is (de route mag later
        // hierop checken; nu nog open).
        'X-Cron-Secret': cronSecret,
      },
      body: JSON.stringify({ action: 'sync' }),
    });

    const data = await res.json().catch(function () { return null; });
    const durationMs = Date.now() - startedAt;

    if (!res.ok) {
      console.error('[cron/calendar-google-sync] sync failed:', data?.error);
      return NextResponse.json({
        ok: false,
        status: res.status,
        error: data?.error || 'Sync mislukt',
        durationMs,
      }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      durationMs,
      results: data?.results || null,
    });
  } catch (e: any) {
    console.error('[cron/calendar-google-sync] exception:', e.message);
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) { return run(req); }
export async function POST(req: NextRequest) { return run(req); }
