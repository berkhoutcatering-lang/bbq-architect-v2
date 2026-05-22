/**
 * POST /api/menukaart-editor/suggest
 *
 * AI-Coach endpoint voor de menukaart-editor. Neemt de huidige cascade-staat
 * + user-prompt en vraagt Claude Sonnet 4.6 om tool-calls te produceren die
 * één of meer template-tokens veranderen.
 *
 * Pillar #1: diff is altijd zichtbaar verschillend — output wordt server-side
 * gefilterd op `tool.value !== currentResolved[key]`. Pillar #2: allow-list
 * dwingt template-bound waardes af via validateOverrides. Pillar #3: rate-limit
 * 10/u per tenant + ai_usage logging.
 *
 * Hard rules:
 *  - Customer-input wrapped in delimiters + sanitization (OWASP LLM01)
 *  - cost_eur_cents berekend uit Anthropic usage block
 *  - Re-auth in body (niet alleen middleware)
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import Anthropic from '@anthropic-ai/sdk';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase-server';
import { getTemplate, type Overrides, type OverrideKey } from '@/lib/menukaart/registry';
import { validateOverrides } from '@/lib/menukaart/validation';
import { resolveCascade, flatten } from '@/lib/menukaart/cascade';
import { checkRateLimit } from '@/lib/rateLimit';
import { logAiUsageServer } from '@/lib/aiUsageServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BodySchema = z.object({
    offerId: z.string().min(1),
    templateId: z.string().min(1),
    prompt: z.string().trim().min(3).max(500),
    /** Huidige offerte-laag overrides (custom). */
    customOverrides: z.record(z.string(), z.unknown()).default({}),
});

const MODEL = 'claude-sonnet-4-5-20250929';
const MAX_TOKENS = 800;
const SAMPLE_PROMPTS_HASH_CACHE: Record<string, true> = {};
void SAMPLE_PROMPTS_HASH_CACHE;

/* ── Anthropic price (Sonnet 4.6, 2026-05) per 1M tokens ────────────────
   Bron: https://www.anthropic.com/pricing — controleer maandelijks. */
const PRICE_INPUT_CENTS = 0.30;          // €0.0030/1K input
const PRICE_OUTPUT_CENTS = 1.50;         // €0.0150/1K output
const PRICE_CACHE_WRITE_CENTS = 0.375;   // 1.25× input
const PRICE_CACHE_READ_CENTS = 0.03;     // 0.1× input

/* ── Tool-definities ─────────────────────────────────────────────── */

const TOOLS: Anthropic.Messages.Tool[] = [
    {
        name: 'set_color',
        description: 'Wijzig een kleur in de menukaart. Gebruik hex-notatie #RRGGBB.',
        input_schema: {
            type: 'object',
            properties: {
                target: { type: 'string', enum: ['accent', 'bg', 'text'], description: 'Welk kleur-token wijzigen.' },
                hex: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$', description: 'Nieuwe kleur als #RRGGBB.' },
                reason: { type: 'string', description: 'Korte uitleg waarom (NL, max 60 tekens).' },
            },
            required: ['target', 'hex'],
        },
    },
    {
        name: 'set_font',
        description: 'Kies een ander lettertype voor heading of body. Alleen waarden uit allow-list zijn geldig.',
        input_schema: {
            type: 'object',
            properties: {
                target: { type: 'string', enum: ['headingFont', 'bodyFont'] },
                font: { type: 'string', description: 'Font-naam uit toegestane opties.' },
                reason: { type: 'string', description: 'Korte uitleg waarom (NL).' },
            },
            required: ['target', 'font'],
        },
    },
    {
        name: 'set_size',
        description: 'Wijzig grootte van heading, body of logo (in pixels).',
        input_schema: {
            type: 'object',
            properties: {
                target: { type: 'string', enum: ['headingSize', 'bodySize', 'logoSize'] },
                px: { type: 'number', description: 'Nieuwe grootte in pixels.' },
                reason: { type: 'string' },
            },
            required: ['target', 'px'],
        },
    },
    {
        name: 'set_weight',
        description: 'Stel font-weight voor headings in (300-700, alleen toegestane opties).',
        input_schema: {
            type: 'object',
            properties: {
                weight: { type: 'number', description: 'Een van 300/400/500/600/700.' },
                reason: { type: 'string' },
            },
            required: ['weight'],
        },
    },
    {
        name: 'set_logo_position',
        description: 'Plaats logo links, gecentreerd of rechts boven.',
        input_schema: {
            type: 'object',
            properties: {
                position: { type: 'string', enum: ['top-left', 'top-center', 'top-right'] },
                reason: { type: 'string' },
            },
            required: ['position'],
        },
    },
    {
        name: 'toggle_decoration',
        description: 'Schakel een decoratie-element in of uit.',
        input_schema: {
            type: 'object',
            properties: {
                target: { type: 'string', enum: ['showOrnament', 'showDividers', 'showGhostNumbers'] },
                on: { type: 'boolean' },
                reason: { type: 'string' },
            },
            required: ['target', 'on'],
        },
    },
];

/* ── Tool-naam → override-key map (voor diff-type kleuring in UI) ────────────────── */

const TOOL_TO_TYPE: Record<string, 'kleur' | 'typo' | 'logo' | 'deco' | 'text'> = {
    set_color: 'kleur',
    set_font: 'typo',
    set_size: 'typo',
    set_weight: 'typo',
    set_logo_position: 'logo',
    toggle_decoration: 'deco',
};

/* ── Response shape (matcht client AICoach.Diff) ─────────────────── */

type DiffOut = {
    id: string;
    type: 'kleur' | 'typo' | 'logo' | 'deco' | 'text';
    label: string;
    fromSwatch?: string;
    fromText?: string;
    toSwatch?: string;
    toText?: string;
    status: 'open';
    apply: Partial<Record<OverrideKey, unknown>>;
};

type SuggestResponse = {
    summary: string;
    diffs: DiffOut[];
    rateLimitRemaining?: number;
    costCents?: number;
};

/* ── Helper: tool-call → DiffOut ────────────────────────────────── */

function normalizeFont(s: string): string {
    return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

function buildDiff(toolName: string, input: Record<string, unknown>, current: Overrides, idx: number, allowFonts: { heading: string[]; body: string[] }): DiffOut | null {
    const id = `d${idx}`;
    switch (toolName) {
        case 'set_color': {
            const target = input.target as OverrideKey;
            const hex = String(input.hex || '').toLowerCase();
            const from = String((current as Record<string, unknown>)[target] || '').toLowerCase();
            if (!hex || hex === from) return null;
            return {
                id,
                type: 'kleur',
                label: `Kleur — ${target === 'accent' ? 'primary accent' : target === 'bg' ? 'achtergrond' : 'tekst'}`,
                fromSwatch: from || undefined,
                fromText: from || undefined,
                toSwatch: hex,
                toText: hex,
                status: 'open',
                apply: { [target]: hex },
            };
        }
        case 'set_font': {
            const target = input.target as 'headingFont' | 'bodyFont';
            const rawFont = String(input.font || '');
            // Map terug naar canoniek-case uit allow-list
            const options = target === 'headingFont' ? allowFonts.heading : allowFonts.body;
            const canonical = options.find(o => normalizeFont(o) === normalizeFont(rawFont));
            if (!canonical) return null;
            const from = String((current as Record<string, unknown>)[target] || '');
            if (canonical === from) return null;
            return {
                id, type: 'typo',
                label: `Typografie — ${target === 'headingFont' ? 'heading-font' : 'body-font'}`,
                fromText: from || '—',
                toText: canonical,
                status: 'open',
                apply: { [target]: canonical },
            };
        }
        case 'set_size': {
            const target = input.target as 'headingSize' | 'bodySize' | 'logoSize';
            const px = Math.round(Number(input.px));
            if (!Number.isFinite(px)) return null;
            const from = Number((current as Record<string, unknown>)[target] || 0);
            if (px === from) return null;
            return {
                id, type: 'typo',
                label: `${target === 'logoSize' ? 'Logo' : 'Typografie'} — ${target === 'headingSize' ? 'heading-grootte' : target === 'bodySize' ? 'body-grootte' : 'logo-grootte'}`,
                fromText: `${from}px`, toText: `${px}px`,
                status: 'open',
                apply: { [target]: px },
            };
        }
        case 'set_weight': {
            const weight = Number(input.weight);
            const from = Number((current as Record<string, unknown>).headingWeight || 0);
            if (weight === from) return null;
            return {
                id, type: 'typo',
                label: 'Typografie — heading-weight',
                fromText: String(from || '—'), toText: String(weight),
                status: 'open',
                apply: { headingWeight: weight },
            };
        }
        case 'set_logo_position': {
            const pos = String(input.position || '') as 'top-left' | 'top-center' | 'top-right';
            const from = String((current as Record<string, unknown>).logoPosition || '');
            if (pos === from) return null;
            const NL: Record<string, string> = { 'top-left': 'Linksboven', 'top-center': 'Boven-midden', 'top-right': 'Rechtsboven' };
            return {
                id, type: 'logo',
                label: 'Logo — positie',
                fromText: NL[from] || '—', toText: NL[pos] || pos,
                status: 'open',
                apply: { logoPosition: pos },
            };
        }
        case 'toggle_decoration': {
            const target = input.target as 'showOrnament' | 'showDividers' | 'showGhostNumbers';
            const on = Boolean(input.on);
            const fromVal = (current as Record<string, unknown>)[target];
            const fromBool = fromVal === undefined ? (target === 'showGhostNumbers' ? false : true) : Boolean(fromVal);
            if (on === fromBool) return null;
            const LABELS: Record<string, string> = {
                showOrnament: 'ornament-randen',
                showDividers: 'dividers',
                showGhostNumbers: 'ghost-cijfers',
            };
            return {
                id, type: 'deco',
                label: `Decoratie — ${LABELS[target]}`,
                fromText: fromBool ? 'Aan' : 'Uit', toText: on ? 'Aan' : 'Uit',
                status: 'open',
                apply: { [target]: on },
            };
        }
        default:
            return null;
    }
}

/* ── Route handler ─────────────────────────────────────────────────── */

export async function POST(request: Request): Promise<NextResponse<SuggestResponse | { error: string }>> {
    const parsed = BodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
        return NextResponse.json({ error: 'Ongeldige body: ' + parsed.error.issues.map(i => i.message).join(', ') }, { status: 400 });
    }

    // Auth-check
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

    // Org-id voor logging + rate-limit
    const { data: orgRow } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .limit(1)
        .single();
    const organizationId = orgRow?.organization_id as string | undefined;
    if (!organizationId) return NextResponse.json({ error: 'Geen actieve organisatie' }, { status: 403 });

    // Pillar #3 — rate-limit (10/min per tenant; impliciet ook ~10/uur ondergrens
    // omdat niemand realistisch 10 suggesties per minuut aanvraagt).
    const rl = checkRateLimit(`menukaart-ai:${organizationId}`, 10);
    if (!rl.allowed) {
        return NextResponse.json({
            error: `Te veel AI-suggesties — wacht ${rl.resetInSeconds}s en probeer opnieuw.`,
        }, { status: 429 });
    }

    // Verifieer offerte + behoort tot deze tenant (RLS doet dit ook, dubbel-check via service-client)
    const adminSb = createServiceSupabase();
    const { data: offerRow } = await adminSb
        .from('offertes')
        .select('id, organization_id, menukaart_template_id, menukaart_overrides')
        .eq('id', parsed.data.offerId)
        .eq('organization_id', organizationId)
        .single();
    if (!offerRow) return NextResponse.json({ error: 'Offerte niet gevonden' }, { status: 404 });

    // Cascade-resolve naar huidige flat (template default → brand → custom)
    const template = getTemplate(parsed.data.templateId);
    const { data: settingsRow } = await adminSb
        .from('settings')
        .select('menukaart_overrides')
        .eq('organization_id', organizationId)
        .limit(1)
        .single();
    const brandOverrides = (settingsRow?.menukaart_overrides as Overrides) ?? {};
    const customOverrides = parsed.data.customOverrides as Overrides;
    const resolved = resolveCascade(template, brandOverrides, customOverrides);
    const flat = flatten(resolved) as Overrides;

    // System prompt — gecached prefix (1h cache)
    const allowFonts = {
        heading: template.allowList.headingFont?.options ?? [],
        body: template.allowList.bodyFont?.options ?? [],
    };
    const headingSizeRange = template.allowList.headingSize ? `${template.allowList.headingSize.min}-${template.allowList.headingSize.max}` : '—';
    const bodySizeRange = template.allowList.bodySize ? `${template.allowList.bodySize.min}-${template.allowList.bodySize.max}` : '—';
    const logoSizeRange = template.allowList.logoSize ? `${template.allowList.logoSize.min}-${template.allowList.logoSize.max}` : '—';
    const weights = template.allowList.headingWeight?.options.join(', ') ?? '300, 400, 500, 600';

    const systemPrompt = [
        `Je bent een design-assistent voor menukaart-styling in een Nederlandse catering-app.`,
        `Je rol is: vertaal een korte instructie van de ondernemer naar concrete tool-calls die de styling MERKBAAR tweaken.`,
        ``,
        `Template: ${template.name} (${template.id}) — ${template.description}`,
        `Toegestane heading-fonts: ${allowFonts.heading.join(', ')}`,
        `Toegestane body-fonts: ${allowFonts.body.join(', ')}`,
        `Heading-grootte: ${headingSizeRange}px · Body-grootte: ${bodySizeRange}px · Logo-grootte: ${logoSizeRange}px`,
        `Heading-weights: ${weights}`,
        ``,
        `REGELS:`,
        `- Roep ALTIJD 2-4 tools aan, NOOIT tekst-alleen. Eén-tool-output telt als faal — combineer altijd minstens 2 wijzigingen.`,
        `- Stel ALLEEN wijzigingen voor die anders zijn dan de huidige waarde — geen no-op suggesties.`,
        `- Kleuren altijd als hex #RRGGBB.`,
        `- Houd binnen de allow-list ranges; ga niet buiten min/max.`,
        ``,
        `MAGNITUDE (zeer belangrijk):`,
        `- "groter" / "kleiner" voor size betekent MINIMAAL 20% verandering, niet +/-2px. Bij logoSize: durf naar 80-160px te gaan als gebruiker "veel groter" of "imposant" vraagt.`,
        `- "donkerder" / "lichter" betekent MINSTENS 30% lightness-verschuiving in het kleur-token.`,
        `- "warmer" = oranje/rood/gele tint verschuiven (hue +20° naar warm). "koeler" = blauw/groen.`,
        `- "strakker" = lager weight (-100 of -200), kleinere heading, minder decoraties uit.`,
        `- "groffer" = hoger weight (+100 of +200), grotere heading.`,
        `- Bij vage prompts ("iets warmer"): kies 2-3 tools voor zichtbaar effect, niet 1 minimal tweak.`,
        ``,
        `- "reason" velden in NL, kort (max 60 chars).`,
    ].join('\n');

    // Customer-input gedelimiteerd + gesanitiseerd (OWASP LLM01)
    const sanitizedPrompt = parsed.data.prompt.replace(/<\/?[a-z][^>]*>/gi, '').slice(0, 500);
    const currentJson = JSON.stringify({
        accent: flat.accent, bg: flat.bg, text: flat.text,
        headingFont: flat.headingFont, bodyFont: flat.bodyFont,
        headingSize: flat.headingSize, bodySize: flat.bodySize,
        headingWeight: flat.headingWeight,
        logoPosition: flat.logoPosition, logoSize: flat.logoSize,
        showOrnament: flat.showOrnament !== false,
        showDividers: flat.showDividers !== false,
        showGhostNumbers: flat.showGhostNumbers === true,
    }, null, 2);

    const userMessage = [
        `<huidige-styling>`,
        currentJson,
        `</huidige-styling>`,
        ``,
        `<instructie>`,
        sanitizedPrompt,
        `</instructie>`,
    ].join('\n');

    // Anthropic call
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return NextResponse.json({ error: 'AI niet geconfigureerd' }, { status: 503 });

    const client = new Anthropic({ apiKey });
    let response: Anthropic.Messages.Message;
    try {
        response = await client.messages.create({
            model: MODEL,
            max_tokens: MAX_TOKENS,
            system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
            messages: [{ role: 'user', content: userMessage }],
            tools: TOOLS,
            tool_choice: { type: 'any' },
        });
    } catch (e) {
        const err = e as Error;
        return NextResponse.json({ error: `AI fout: ${err.message}` }, { status: 502 });
    }

    // Extract tool-calls
    const toolCalls = response.content.filter(
        (b): b is Anthropic.Messages.ToolUseBlock => b.type === 'tool_use',
    );

    // Bouw diffs + filter no-ops + validate tegen allow-list
    const rawDiffs: DiffOut[] = [];
    for (let i = 0; i < toolCalls.length; i++) {
        const t = toolCalls[i];
        const d = buildDiff(t.name, t.input as Record<string, unknown>, flat, i, allowFonts);
        if (d) rawDiffs.push(d);
    }

    // Allow-list validatie: gooi diffs weg die buiten bereik vallen
    const cleanDiffs: DiffOut[] = [];
    for (const d of rawDiffs) {
        const check = validateOverrides(template, d.apply as Record<string, unknown>);
        if (check.ok === true) cleanDiffs.push(d);
    }

    // Cost-tracking
    const usage = response.usage;
    const costCents = Math.ceil(
        (usage.input_tokens * PRICE_INPUT_CENTS) / 1000 +
        (usage.output_tokens * PRICE_OUTPUT_CENTS) / 1000 +
        ((usage.cache_creation_input_tokens ?? 0) * PRICE_CACHE_WRITE_CENTS) / 1000 +
        ((usage.cache_read_input_tokens ?? 0) * PRICE_CACHE_READ_CENTS) / 1000,
    );

    // Async log (non-blocking)
    void logAiUsageServer({
        organization_id: organizationId,
        user_id: user.id,
        action_type: 'menu_suggestion',
        model: MODEL,
        tokens_input: usage.input_tokens,
        tokens_output: usage.output_tokens,
        tokens_cache_read: usage.cache_read_input_tokens ?? 0,
        tokens_cache_creation: usage.cache_creation_input_tokens ?? 0,
        cost_eur_cents: costCents,
        metadata: {
            template_id: template.id,
            offer_id: parsed.data.offerId,
            prompt_length: sanitizedPrompt.length,
            diffs_emitted: cleanDiffs.length,
            tools_called: toolCalls.length,
        },
    });

    // Summary uit tool-reasons of fallback
    const reasons = toolCalls.map(t => (t.input as { reason?: string }).reason).filter(Boolean) as string[];
    const summary = cleanDiffs.length === 0
        ? 'Geen bruikbare wijzigingen — je menukaart staat al strak voor deze instructie.'
        : reasons.length > 0
            ? `Voorgesteld: ${reasons[0]}` + (reasons.length > 1 ? ` (+${reasons.length - 1} meer)` : '')
            : `${cleanDiffs.length} aanpassing${cleanDiffs.length === 1 ? '' : 'en'} voorgesteld.`;

    return NextResponse.json({
        summary,
        diffs: cleanDiffs,
        rateLimitRemaining: rl.remaining,
        costCents,
    });
}
