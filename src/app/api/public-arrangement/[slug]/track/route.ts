/**
 * Beacon-endpoint voor de configurator-trechter (funnel_events).
 *
 * Fire-and-forget: returnt ALTIJD 204 (ook bij fouten) — een beacon mag de
 * publieke pagina nooit storen. Anoniem: alleen event + een client-gegenereerde
 * session_id (geen PII, geen cookie). Insert via SERVICE-ROLE (zoals de rest van
 * de publieke kant); org-resolve via organizations.slug.
 */

import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServiceSupabase } from '@/lib/supabase-server';
import { checkRateLimit } from '@/lib/rateLimit';

const noContent = () => new NextResponse(null, { status: 204 });

const TrackSchema = z.object({
    event: z.enum(['view', 'start', 'submit']),
    session_id: z.string().max(64).optional(),
    arrangement_id: z.string().uuid().optional(),
});

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ slug: string }> },
) {
    const { slug } = await params;
    if (!slug) return noContent();

    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
        || req.headers.get('x-real-ip')
        || 'unknown';
    if (!checkRateLimit(`funnel:${ip}`, 60).allowed) return noContent();   // ruim: meerdere beacons per sessie

    let raw: unknown;
    try { raw = await req.json(); } catch { return noContent(); }
    const parsed = TrackSchema.safeParse(raw);
    if (!parsed.success) return noContent();

    const supabase = createServiceSupabase();
    const { data: org } = await supabase.from('organizations').select('id').eq('slug', slug).single();
    if (!org) return noContent();

    /* arrangement_id alleen accepteren als het van deze org is (anders null). */
    let arrangementId: string | null = null;
    if (parsed.data.arrangement_id) {
        const { data: arr } = await supabase
            .from('arrangementen').select('id')
            .eq('id', parsed.data.arrangement_id).eq('organization_id', org.id)
            .maybeSingle();
        arrangementId = arr?.id ?? null;
    }

    await supabase.from('funnel_events').insert({
        organization_id: org.id,
        arrangement_id: arrangementId,
        event: parsed.data.event,
        session_id: parsed.data.session_id ?? null,
    });

    return noContent();
}
