/**
 * POST /api/logistics-checklist — SSE streaming logistiek-checklist generatie.
 *
 * Lifecycle:
 *  1. Pre-flight cost-cap check (checkAiCostCapServer + checkAiCap).
 *  2. Bij hard-cap → fallback statisch template + één progress-event
 *     + done met fallback=true (geen Anthropic-call).
 *  3. Bij ok of soft-throttle → echte AI-call met streaming + ai_usage log.
 *
 * Body: { eventId: number }  (rest komt server-side uit DB)
 * Response: text/event-stream met events: check, progress, done, error
 */

import { NextRequest } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';
import { streamLogisticsChecklist, LOGISTICS_MODEL, type GenerateLogisticsInput, type LogisticsCheck } from '@/lib/ai/logisticsChecklist';
import { checkAiCap } from '@/lib/aiCostCap';
import { buildFallbackChecklist } from '@/lib/logistiek/fallbackTemplates';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface BodyShape { eventId?: unknown }

function validate(raw: BodyShape): { ok: true; eventId: number } | { ok: false; error: string } {
    const id = raw.eventId;
    const n = typeof id === 'string' ? Number.parseInt(id, 10) : (typeof id === 'number' ? id : NaN);
    if (!Number.isFinite(n) || n <= 0) return { ok: false, error: 'eventId must be a positive integer' };
    return { ok: true, eventId: n };
}

interface OfferteRowLite {
    menu_selectie: unknown;
    aantal_gasten: number | null;
    notitie: string | null;
}

interface EventRowLite {
    id: number;
    name: string | null;
    date: string | null;
    guests: number | null;
    location: string | null;
    type: string | null;
    organization_id: string;
    offerte_id: number | null;
}

/** Flatten menu_selectie ({ gang: dishName[] } óf array) naar uniek-named lijst. */
function flattenMenu(menu: unknown): string[] {
    if (!menu) return [];
    let m: unknown = menu;
    if (typeof m === 'string') {
        try { m = JSON.parse(m); } catch { return []; }
    }
    const out: string[] = [];
    if (Array.isArray(m)) {
        for (const x of m) {
            if (typeof x === 'string') out.push(x);
            else if (x && typeof x === 'object') {
                const o = x as Record<string, unknown>;
                const naam = (o.gerecht_naam || o.naam) as string | undefined;
                if (naam) out.push(naam);
            }
        }
    } else if (m && typeof m === 'object') {
        for (const v of Object.values(m as Record<string, unknown>)) {
            if (Array.isArray(v)) for (const item of v) {
                if (typeof item === 'string') out.push(item);
                else if (item && typeof item === 'object') {
                    const o = item as Record<string, unknown>;
                    const naam = (o.gerecht_naam || o.naam) as string | undefined;
                    if (naam) out.push(naam);
                }
            }
        }
    }
    return Array.from(new Set(out.filter(Boolean)));
}

export async function POST(req: NextRequest) {
    const sb = await createServerSupabase();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });

    /* Re-auth: vind actieve org via organization_members. */
    const { data: membership } = await sb
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .limit(1);
    const orgId = membership?.[0]?.organization_id as string | undefined;
    if (!orgId) return new Response(JSON.stringify({ error: 'no active organization' }), { status: 403 });

    let body: BodyShape;
    try { body = await req.json(); } catch { return new Response(JSON.stringify({ error: 'invalid JSON' }), { status: 400 }); }
    const validation = validate(body);
    if (validation.ok === false) {
        return new Response(JSON.stringify({ error: validation.error }), { status: 400 });
    }
    const { eventId } = validation;

    /* Fetch event + offerte server-side zodat client geen menu/orgId
       hoeft te sturen (RLS check via current user-session). */
    const { data: ev, error: evErr } = await sb
        .from('events')
        .select('id, name, date, guests, location, type, organization_id, offerte_id')
        .eq('id', eventId)
        .single();
    if (evErr || !ev) return new Response(JSON.stringify({ error: 'event not found or no access' }), { status: 404 });
    const event = ev as EventRowLite;

    let offerte: OfferteRowLite | null = null;
    if (event.offerte_id) {
        const { data: off } = await sb
            .from('offertes')
            .select('menu_selectie, aantal_gasten, notitie')
            .eq('id', event.offerte_id)
            .single();
        offerte = (off as OfferteRowLite | null) ?? null;
    }

    const dishNames = flattenMenu(offerte?.menu_selectie);

    /* Standaard-hardware uit tenant-katalogus. Mag leeg zijn (geen seed
       in nieuwe tenants) — fallback in prompt handelt dat. */
    const { data: stdHw } = await sb
        .from('hardware_items')
        .select('naam, categorie, standaard_event')
        .eq('organization_id', orgId)
        .eq('standaard_event', true)
        .limit(30);

    /* Rate-limit: max 10 generates per 5 min per org (zoals haccp). */
    const fiveMinAgo = new Date(Date.now() - 5 * 60_000).toISOString();
    const { count: recentCalls } = await sb
        .from('ai_usage')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .eq('action_type', 'logistics_proposal')
        .gte('created_at', fiveMinAgo);
    if ((recentCalls ?? 0) >= 10) {
        return new Response(JSON.stringify({ error: 'rate limit (10/5min)' }), { status: 429 });
    }

    /* Cost-cap pre-flight. Estimate €0.04 per Sonnet-call (tools+stream). */
    const cap = await checkAiCap(orgId, 0.04);

    const encoder = new TextEncoder();
    const enc = (e: Record<string, unknown>) => encoder.encode(`data: ${JSON.stringify(e)}\n\n`);

    /* Bij hard-cap of geen API-key: serveer fallback template. */
    const useFallback = cap.status === 'hard_block' || !process.env.ANTHROPIC_API_KEY;

    if (useFallback) {
        const stream = new ReadableStream({
            async start(controller) {
                try {
                    const fb = buildFallbackChecklist({
                        guests: event.guests ?? offerte?.aantal_gasten ?? 50,
                        eventType: event.type,
                        locationProfile: event.location,
                        hasMenu: dishNames.length > 0,
                    });

                    for (let i = 0; i < fb.checks.length; i++) {
                        controller.enqueue(enc({ type: 'check', check: fb.checks[i] }));
                        controller.enqueue(enc({ type: 'progress', progress: { current: i + 1, total: fb.checks.length } }));
                    }
                    controller.enqueue(enc({
                        type: 'done',
                        fallback: true,
                        fallbackTemplate: fb.template,
                        capStatus: cap.status,
                        capMessage: cap.message,
                        usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, estCostEurCents: 0 },
                    }));
                } catch (e) {
                    controller.enqueue(enc({ type: 'error', message: (e as Error).message }));
                } finally {
                    controller.close();
                }
            },
        });
        return new Response(stream, sseHeaders());
    }

    /* Echte AI-stream. */
    const input: GenerateLogisticsInput = {
        eventTitle: event.name ?? `Event #${event.id}`,
        eventDate: event.date ?? new Date().toISOString().slice(0, 10),
        guests: event.guests ?? offerte?.aantal_gasten ?? 50,
        locationName: event.location ?? undefined,
        locationProfile: event.location ? `Locatie: ${event.location}` : undefined,
        dishes: dishNames.map(n => ({ naam: n })),
        standardHardware: (stdHw ?? []) as Array<{ naam: string; categorie?: string; standaard_event?: boolean }>,
        klantNotities: offerte?.notitie ?? undefined,
    };

    const stream = new ReadableStream({
        async start(controller) {
            try {
                let lastUsage: Record<string, unknown> | null = null;
                let lastFallback = false;

                /* Soft-warning: stuur extra event zodat UI banner kan tonen. */
                if (cap.status === 'soft_warning') {
                    controller.enqueue(enc({ type: 'progress', softWarning: cap.message }));
                }

                for await (const ev of streamLogisticsChecklist(input)) {
                    if (ev.type === 'check') {
                        controller.enqueue(enc({ type: 'check', check: ev.check as LogisticsCheck }));
                    } else if (ev.type === 'progress') {
                        controller.enqueue(enc({ type: 'progress', progress: ev.progress }));
                    } else if (ev.type === 'done' && ev.usage) {
                        lastUsage = {
                            inputTokens: ev.usage.inputTokens,
                            outputTokens: ev.usage.outputTokens,
                            cacheReadTokens: ev.usage.cacheReadTokens,
                            cacheCreationTokens: ev.usage.cacheCreationTokens,
                            estCostEurCents: ev.usage.estCostEurCents,
                        };

                        /* Log naar ai_usage (RLS-bypass via service-role niet
                           nodig; user-session heeft INSERT-policy via
                           organization_id IN auth.user_org_ids). */
                        const { error: logErr } = await sb.from('ai_usage').insert({
                            organization_id: orgId,
                            user_id: user.id,
                            action_type: 'logistics_proposal',
                            model: LOGISTICS_MODEL,
                            tokens_input: ev.usage.inputTokens,
                            tokens_output: ev.usage.outputTokens,
                            tokens_cache_read: ev.usage.cacheReadTokens,
                            tokens_cache_creation: ev.usage.cacheCreationTokens,
                            cost_eur_cents: ev.usage.estCostEurCents,
                            metadata: {
                                event_id: eventId,
                                eventTitle: input.eventTitle,
                                dishCount: input.dishes.length,
                                feature: 'logistics_proposal',
                            },
                        });
                        if (logErr) console.warn('[logistics-checklist] ai_usage log failed', logErr.message);

                        controller.enqueue(enc({
                            type: 'done',
                            fallback: lastFallback,
                            capStatus: cap.status,
                            usage: lastUsage,
                        }));
                    } else if (ev.type === 'error') {
                        controller.enqueue(enc({ type: 'error', message: ev.message }));
                    }
                }
            } catch (e) {
                controller.enqueue(enc({ type: 'error', message: (e as Error).message }));
            } finally {
                controller.close();
            }
        },
    });

    return new Response(stream, sseHeaders());
}

function sseHeaders(): ResponseInit {
    return {
        headers: {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache, no-transform',
            Connection: 'keep-alive',
            'X-Accel-Buffering': 'no',
        },
    };
}
