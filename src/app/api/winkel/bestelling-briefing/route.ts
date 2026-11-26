/**
 * POST /api/winkel/bestelling-briefing — van screenshot + korte tekst naar een
 * klaargezet bestelformulier.
 *
 * Invoer: { fotos?: [{ media_type, data }] (base64, hooguit 3), beschrijving? }
 * Uit:    { briefing, usage }
 *
 * Schrijft NIETS: de briefing gaat naar het formulier "Bestelling invoeren",
 * Mathijs kijkt na en slaat zelf op. Geen prijzen, alleen bekende producten;
 * zie src/lib/ai/bestelBriefing.ts.
 */
import { NextResponse, type NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { createServerSupabase } from '@/lib/supabase-server';
import { logAiUsageServer } from '@/lib/aiUsageServer';
import { estimateAiCostCents } from '@/lib/aiCost';
import { enforceAiCap } from '@/lib/aiCostCap';
import { haalJson } from '@/lib/ai/productInvuller';
import { BRIEFING_MODEL, BRIEFING_SYSTEEM, bouwBriefingVraag, leesBriefing, type BriefingArtikel } from '@/lib/ai/bestelBriefing';
import { OP_MAAT_SLUG } from '@/lib/winkel/handmatig';

export const runtime = 'nodejs';
export const maxDuration = 60;

const Invoer = z.object({
    fotos: z.array(z.object({
        media_type: z.enum(['image/jpeg', 'image/png', 'image/webp']),
        data: z.string().min(100).max(6_000_000),
    })).max(3).default([]),
    beschrijving: z.string().trim().max(2000).default(''),
}).refine((x) => x.fotos.length > 0 || x.beschrijving.length > 0, { message: 'Geef een screenshot of een beschrijving' });

/** Vandaag en de weekdag in Nederland, niet in de tijdzone van de server. */
function vandaagNL(): { vandaag: string; weekdag: string } {
    const nu = new Date();
    const vandaag = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Amsterdam' }).format(nu);
    const weekdag = new Intl.DateTimeFormat('nl-NL', { timeZone: 'Europe/Amsterdam', weekday: 'long' }).format(nu);
    return { vandaag, weekdag };
}

export async function POST(req: NextRequest) {
    const t0 = Date.now();
    const sb = await createServerSupabase();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });
    const { data: member } = await sb.from('organization_members').select('organization_id').eq('user_id', user.id).eq('status', 'active').limit(1).maybeSingle();
    const orgId = member?.organization_id as string | undefined;
    if (!orgId) return NextResponse.json({ error: 'Geen organisatie' }, { status: 403 });

    const parsed = Invoer.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Ongeldige invoer' }, { status: 400 });
    const { fotos, beschrijving } = parsed.data;

    const cap = await enforceAiCap(orgId, 0.05);
    if (cap) return cap;

    const { data: rijen } = await sb.from('winkel_artikelen').select('slug, naam, eenheid').eq('organization_id', orgId).eq('actief', true).neq('slug', OP_MAAT_SLUG).order('naam');
    const artikelen = (rijen ?? []) as BriefingArtikel[];
    const { vandaag, weekdag } = vandaagNL();

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    try {
        const antwoord = await anthropic.messages.create({
            model: BRIEFING_MODEL,
            max_tokens: 3000,
            system: [{ type: 'text', text: BRIEFING_SYSTEEM, cache_control: { type: 'ephemeral' } }],
            messages: [{
                role: 'user',
                content: [
                    ...fotos.map((f): Anthropic.ImageBlockParam => ({ type: 'image', source: { type: 'base64', media_type: f.media_type, data: f.data } })),
                    { type: 'text', text: bouwBriefingVraag({ artikelen, beschrijving, vandaag, weekdag, fotoAantal: fotos.length }) },
                ],
            }],
        });
        if (antwoord.stop_reason === 'refusal') {
            return NextResponse.json({ error: 'De AI wilde dit niet lezen. Vul het zelf in.' }, { status: 422 });
        }
        const tekst = antwoord.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join('');
        const briefing = leesBriefing(haalJson(tekst), artikelen, vandaag);
        if (!briefing) return NextResponse.json({ error: 'Het antwoord van de AI was niet te lezen. Probeer het nog eens of vul het zelf in.' }, { status: 502 });

        const u = antwoord.usage;
        const costCents = estimateAiCostCents({ model: BRIEFING_MODEL, tokens_input: u.input_tokens, tokens_output: u.output_tokens, tokens_cache_read: u.cache_read_input_tokens ?? 0, tokens_cache_creation: u.cache_creation_input_tokens ?? 0 });
        logAiUsageServer({
            organization_id: orgId,
            user_id: user.id,
            action_type: 'other',
            model: BRIEFING_MODEL,
            tokens_input: u.input_tokens,
            tokens_output: u.output_tokens,
            tokens_cache_read: u.cache_read_input_tokens ?? 0,
            tokens_cache_creation: u.cache_creation_input_tokens ?? 0,
            cost_eur_cents: costCents,
            metadata: { feature: 'bestelling_briefing', fotos: fotos.length },
        }).catch(() => { /* nooit de flow blokkeren */ });

        return NextResponse.json({ briefing, usage: { cost_eur_cents: costCents, duration_ms: Date.now() - t0 } });
    } catch (e) {
        if (e instanceof Anthropic.RateLimitError) return NextResponse.json({ error: 'Even te druk bij de AI. Probeer het over een minuut nog eens.' }, { status: 429 });
        if (e instanceof Anthropic.APIError) return NextResponse.json({ error: `AI-fout ${e.status}` }, { status: 502 });
        return NextResponse.json({ error: e instanceof Error ? e.message : 'AI-fout' }, { status: 500 });
    }
}
