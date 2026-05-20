/**
 * Invite-lookup endpoint — server-side token-resolution met rate-limit.
 *
 * Voorheen deed `/invite/page.tsx` direct `supabase.from('invitations')`
 * vanaf de Client. Anonieme RLS-policy moet die query toelaten, wat een
 * brute-force enumeration-vector was — attacker kan tokens hash-by-hash
 * proberen via Supabase Realtime/REST.
 *
 * Nu loopt het via dit server-endpoint dat:
 *   - Per IP rate-limit (10 lookups/uur) → brute-force onpraktisch
 *   - Constant-time response (~150ms) zodat een attacker via timing
 *     niet kan zien of een token bestaat
 *   - Server-side service-role read (geen anonieme RLS-blootstelling)
 *
 * NB: Token blijft in URL voor email-deelbaarheid (Slack/Linear/etc.
 * doen het ook zo). Echte cookie-based flow zou breken bij multi-device.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createServiceSupabase } from '@/lib/supabase-server';

/* In-memory rate-limit. Stateless cache — Vercel houdt instances warm.
   Voor productie-scale zou Upstash Redis robuuster zijn. */
const ipBuckets = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT_MAX = 10;

function rateLimit(ip: string): boolean {
    const now = Date.now();
    const recent = (ipBuckets.get(ip) || []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
    if (recent.length >= RATE_LIMIT_MAX) return false;
    recent.push(now);
    ipBuckets.set(ip, recent);
    if (ipBuckets.size > 1000) {
        for (const [k, times] of ipBuckets.entries()) {
            if (times.every((t) => now - t > RATE_LIMIT_WINDOW_MS)) ipBuckets.delete(k);
        }
    }
    return true;
}

/* Constant-time response — voorkom dat een attacker via response-time
   kan zien of een token bestaat (snel = bestaat, langzaam = lookup-fail).
   Wachten tot minimaal 150ms voordat we returnen. */
async function constantTimeRespond<T>(value: T, startedAt: number, minMs = 150): Promise<T> {
    const elapsed = Date.now() - startedAt;
    if (elapsed < minMs) {
        await new Promise((resolve) => setTimeout(resolve, minMs - elapsed));
    }
    return value;
}

export async function POST(req: NextRequest) {
    const start = Date.now();
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim()
        || req.headers.get('x-real-ip')
        || 'unknown';

    if (!rateLimit(ip)) {
        return NextResponse.json(
            { error: 'Te veel lookup-pogingen — probeer over een uur opnieuw.' },
            { status: 429 },
        );
    }

    let body: { token?: string };
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: 'Ongeldige JSON' }, { status: 400 });
    }

    const token = typeof body.token === 'string' ? body.token : '';
    if (!token || token.length < 16 || token.length > 200) {
        const result = await constantTimeRespond({ error: 'Ongeldige token' }, start);
        return NextResponse.json(result, { status: 400 });
    }

    const sb = createServiceSupabase();
    const { data: invite, error: invErr } = await sb
        .from('invitations')
        .select('email, role, accepted_at, expires_at, organizations(name)')
        .eq('token', token)
        .single();

    if (invErr || !invite) {
        const result = await constantTimeRespond({ status: 'not_found' as const }, start);
        return NextResponse.json(result, { status: 404 });
    }

    if (invite.accepted_at) {
        const result = await constantTimeRespond({ status: 'accepted' as const }, start);
        return NextResponse.json(result);
    }

    if (new Date(invite.expires_at as string) < new Date()) {
        const result = await constantTimeRespond({ status: 'expired' as const }, start);
        return NextResponse.json(result, { status: 410 });
    }

    const org = invite.organizations as { name?: string } | null;
    const result = await constantTimeRespond(
        {
            status: 'ready' as const,
            invite: {
                email: invite.email as string,
                role: invite.role as string,
                organization_name: org?.name || 'Onbekend',
            },
        },
        start,
    );
    return NextResponse.json(result);
}
