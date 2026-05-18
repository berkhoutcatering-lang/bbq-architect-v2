/**
 * POST /api/haccp/generate — SSE streaming HACCP-checklist generatie.
 *
 * Pillar #1: streaming reveal (<8s target), Pillar #2: Citations API,
 * Pillar #4: rate-limit + max_tokens + cost-tracking in ai_usage.
 *
 * Body: { eventTitle, servingTime, dishes: [{id, name, sub?, risk}] }
 * Response: text/event-stream met events: progress, check, done, error
 */
import { NextRequest } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';
import { streamHaccpChecklist, HACCP_MODEL, type GenerateHaccpInput } from '@/lib/ai/haccpChecklist';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface BodyShape {
    eventTitle?: unknown;
    servingTime?: unknown;
    dishes?: unknown;
}

function isString(v: unknown, max = 200): v is string {
    return typeof v === 'string' && v.length > 0 && v.length <= max;
}

function validate(raw: BodyShape): { ok: true; data: GenerateHaccpInput } | { ok: false; error: string } {
    if (!isString(raw.eventTitle, 200)) return { ok: false, error: 'eventTitle missing or invalid' };
    if (!isString(raw.servingTime, 10) || !/^\d{2}:\d{2}$/.test(raw.servingTime)) {
        return { ok: false, error: 'servingTime must be HH:MM' };
    }
    if (!Array.isArray(raw.dishes) || raw.dishes.length === 0 || raw.dishes.length > 20) {
        return { ok: false, error: 'dishes must be 1-20 items' };
    }
    const dishes: GenerateHaccpInput['dishes'] = [];
    for (const d of raw.dishes) {
        const dd = d as Record<string, unknown>;
        if (!isString(dd.id, 64) || !isString(dd.name, 200)) {
            return { ok: false, error: 'dish must have id + name' };
        }
        const risk = dd.risk;
        if (risk !== 'hoog' && risk !== 'middel' && risk !== 'laag') {
            return { ok: false, error: 'dish.risk must be hoog/middel/laag' };
        }
        dishes.push({
            id: dd.id,
            name: dd.name,
            sub: typeof dd.sub === 'string' ? dd.sub.slice(0, 500) : undefined,
            risk,
        });
    }
    return {
        ok: true,
        data: {
            eventTitle: raw.eventTitle,
            servingTime: raw.servingTime,
            dishes,
        },
    };
}

export async function POST(req: NextRequest) {
    const sb = await createServerSupabase();
    const {
        data: { user },
    } = await sb.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });

    // Re-auth: vind actieve org via organization_members (matches existing pattern in /api/ai-execute)
    const { data: membership } = await sb
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .limit(1);
    const orgId = membership?.[0]?.organization_id;
    if (!orgId) return new Response(JSON.stringify({ error: 'no active organization' }), { status: 403 });

    // Rate-limit: simpel per-org window-throttle, 10 generates per 5 min.
    // Pillar #4: voorkomt cost runaway bij abuse.
    const fiveMinAgo = new Date(Date.now() - 5 * 60_000).toISOString();
    const { count: recentCalls } = await sb
        .from('ai_usage')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .eq('action_type', 'haccp_generate')
        .gte('created_at', fiveMinAgo);
    if ((recentCalls ?? 0) >= 10) {
        return new Response(JSON.stringify({ error: 'rate limit (10/5min)' }), { status: 429 });
    }

    let body: BodyShape;
    try {
        body = await req.json();
    } catch {
        return new Response(JSON.stringify({ error: 'invalid JSON' }), { status: 400 });
    }
    const validation = validate(body);
    if (validation.ok === false) {
        return new Response(JSON.stringify({ error: validation.error }), { status: 400 });
    }
    const validData = validation.data;

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
        async start(controller) {
            try {
                for await (const event of streamHaccpChecklist(validData)) {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
                    if (event.type === 'done' && event.usage) {
                        // Log to ai_usage (non-blocking, service-role since auth context may have closed)
                        const { error: logError } = await sb.from('ai_usage').insert({
                            organization_id: orgId,
                            user_id: user.id,
                            action_type: 'haccp_generate',
                            model: HACCP_MODEL,
                            tokens_input: event.usage.inputTokens,
                            tokens_output: event.usage.outputTokens,
                            tokens_cache_read: event.usage.cacheReadTokens,
                            tokens_cache_creation: event.usage.cacheCreationTokens,
                            cost_eur_cents: event.usage.estCostEurCents,
                            metadata: {
                                eventTitle: validData.eventTitle,
                                dishCount: validData.dishes.length,
                            },
                        });
                        if (logError) console.warn('[haccp/generate] ai_usage log failed', logError.message);
                    }
                }
            } catch (e) {
                controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify({ type: 'error', message: (e as Error).message })}\n\n`),
                );
            } finally {
                controller.close();
            }
        },
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache, no-transform',
            Connection: 'keep-alive',
            'X-Accel-Buffering': 'no',
        },
    });
}
