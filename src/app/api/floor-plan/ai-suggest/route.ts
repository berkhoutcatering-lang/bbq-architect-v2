/**
 * POST /api/floor-plan/ai-suggest — Pillar #6 USP.
 *
 * Genereert een suggestie-layout voor een event op basis van gastenaantal +
 * type + venue-context. Output is een lijst CanvasShape's die de gebruiker
 * kan accepteren of bijschaven. NIET auto-saven — alleen voorstel.
 *
 * Body: { eventId?: number; headcount: number; eventType?: string; venueNote?: string; canvasWidth?: number; canvasHeight?: number }
 * Returns: { ok: true, shapes: CanvasShape[], reasoning: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { withTenantAuth, type TenantAuthCtx } from '@/lib/withTenantAuth';
import { logAiUsageServer } from '@/lib/aiUsageServer';
import { estimateAiCostCents } from '@/lib/aiCost';

export const runtime = 'nodejs';
export const maxDuration = 60;

const SHAPE_KINDS = [
    'round-table-6', 'round-table-8', 'round-table-10',
    'long-table-6', 'long-table-8', 'long-table-10',
    'smoker', 'grill', 'bar', 'buffet',
    'tent-wall', 'danger-zone', 'note',
] as const;

const SYSTEM_PROMPT = `Je bent een event-floor-plan-designer voor BBQ-catering events in NL.

Je rol: lever een ergonomische layout-suggestie als JSON van shapes. Werk in een coordinate-systeem van 0–100% voor zowel X als Y (percentages, niet pixels).

Regels:
- Plaats tafels NIET overlappend (minimum gap 8% afstand tussen shapes).
- Smoker (BBQ) altijd buiten in een hoek, plume-richting weg van gasten.
- Bar bij ingang of natuurlijke flow-zone.
- Buffet zit centraal of langs één wand, breed (w_pct ≥ 20).
- Tent-wall alleen indien venueNote outdoor + slecht weer suggereert.
- Bij 20-30 gasten: 4-6 ronde tafels-6/8. Bij 60+: long-tables 10 + extra rondes.

Antwoord ALLEEN met geldige JSON in dit schema:
{
  "shapes": [
    { "kind": "round-table-8", "x_pct": 25, "y_pct": 30, "w_pct": 12, "h_pct": 12, "rotation": 0, "label": "Tafel 1" }
  ],
  "reasoning": "string (1-2 zinnen over je keuzes)"
}

Geen markdown fences. Geen extra tekst.`;

interface RequestBody {
    eventId?: number;
    headcount: number;
    eventType?: string;
    venueNote?: string;
    canvasWidth?: number;
    canvasHeight?: number;
}

async function handler(req: NextRequest, ctx: TenantAuthCtx): Promise<NextResponse> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY ontbreekt' }, { status: 500 });

    let body: RequestBody;
    try {
        body = await req.json() as RequestBody;
    } catch {
        return NextResponse.json({ error: 'Ongeldige JSON' }, { status: 400 });
    }

    const headcount = Number(body.headcount);
    if (!Number.isFinite(headcount) || headcount <= 0) {
        return NextResponse.json({ error: 'headcount > 0 verplicht' }, { status: 400 });
    }
    if (headcount > 1000) {
        return NextResponse.json({ error: 'headcount > 1000 niet ondersteund' }, { status: 400 });
    }

    const safeType = String(body.eventType || 'BBQ').slice(0, 60).replace(/[<>]/g, '');
    const safeVenue = String(body.venueNote || '').slice(0, 300).replace(/[<>]/g, '');

    const userMessage = [
        `Aantal gasten: ${headcount}`,
        `Event-type: ${safeType}`,
        safeVenue ? `Locatie-context: ${safeVenue}` : '',
        '',
        'Genereer een layout-suggestie als JSON volgens het schema.',
    ].filter(Boolean).join('\n');

    const client = new Anthropic({ apiKey });
    const model = 'claude-haiku-4-5-20251001';

    let parsed: any = null;
    let response;
    try {
        response = await client.messages.create({
            model,
            max_tokens: 1500,
            system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
            messages: [{ role: 'user', content: userMessage }],
        } as any);

        const textBlock = response.content.find(function (b: any) { return b.type === 'text'; }) as any;
        if (textBlock?.text) {
            const t = textBlock.text.trim();
            const m = t.match(/\{[\s\S]*\}/);
            if (m) {
                try {
                    parsed = JSON.parse(m[0]);
                } catch (e) {
                    console.error('[floor-plan-ai] parse fail:', (e as Error).message);
                }
            }
        }
    } catch (e: any) {
        console.error('[floor-plan-ai] anthropic call failed:', e.message);
        return NextResponse.json({ error: e.message || 'AI fout' }, { status: 502 });
    }

    if (!parsed || !Array.isArray(parsed.shapes)) {
        return NextResponse.json({ error: 'AI gaf geen geldige layout' }, { status: 502 });
    }

    /* Sanitize shapes — alleen toegestane velden, alleen toegestane kinds,
       coordinates clipped naar 0-100. Geen client-input ooit vertrouwen. */
    const cleanShapes = (parsed.shapes as any[])
        .filter(function (s) { return s && typeof s === 'object' && SHAPE_KINDS.includes(s.kind); })
        .slice(0, 40)
        .map(function (s, i) {
            return {
                id: `ai-${Date.now()}-${i}`,
                kind: s.kind,
                x_pct: clip(Number(s.x_pct) || 50, 0, 100),
                y_pct: clip(Number(s.y_pct) || 50, 0, 100),
                w_pct: clip(Number(s.w_pct) || 10, 1, 80),
                h_pct: clip(Number(s.h_pct) || 10, 1, 80),
                rotation: Math.round(Number(s.rotation) || 0) % 360,
                label: typeof s.label === 'string' ? s.label.slice(0, 40) : undefined,
            };
        });

    // Log usage
    if (response?.usage) {
        const u: any = response.usage;
        void logAiUsageServer({
            organization_id: ctx.orgId,
            user_id: ctx.userId,
            action_type: 'other',
            model,
            tokens_input: u.input_tokens ?? 0,
            tokens_output: u.output_tokens ?? 0,
            tokens_cache_read: u.cache_read_input_tokens ?? 0,
            tokens_cache_creation: u.cache_creation_input_tokens ?? 0,
            cost_eur_cents: estimateAiCostCents({
                model,
                tokens_input: u.input_tokens ?? 0,
                tokens_output: u.output_tokens ?? 0,
                tokens_cache_read: u.cache_read_input_tokens ?? 0,
                tokens_cache_creation: u.cache_creation_input_tokens ?? 0,
            }),
            metadata: { feature: 'floor_plan_ai_suggest', event_id: body.eventId, headcount, shape_count: cleanShapes.length },
        });
    }

    return NextResponse.json({
        ok: true,
        shapes: cleanShapes,
        reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning.slice(0, 400) : '',
    });
}

function clip(n: number, lo: number, hi: number): number {
    return Math.max(lo, Math.min(hi, n));
}

export const POST = withTenantAuth(handler);
