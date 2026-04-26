/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createServerSupabase } from '@/lib/supabase-server';
import { logAiUsageServer } from '@/lib/aiUsageServer';
import { estimateAiCostCents } from '@/lib/aiUsage';

export const runtime = 'nodejs';
export const maxDuration = 20;

/*
 * AI Chef Coach — persistent assistant voor Service KDS
 * ─────────────────────────────────────────────────────
 * Op basis van live event-state genereert deze endpoint korte directives
 * zoals een echte head-chef zou doen. Houdt rekening met:
 *  - tijd t.o.v. service-momenten (countdown)
 *  - mise-progress (% klaar per gang)
 *  - smoker-status (temp / target / ETA)
 *  - allergie-waarschuwingen (kritisch hoog flaggen)
 *  - chef-vraag (optioneel — als gebruiker actief vraagt)
 */

const SYSTEM = `Je bent ROOK MAART, een ervaren Nederlandse BBQ-pitmaster. Je werkt als persistent AI-coach in een Kitchen Display System tijdens live BBQ-events.

PERSOONLIJKHEID:
- Direct, kort, zonder gezeur — zoals een echte head-chef
- Gebruikt vaktaal (smoker, mise, internal temp, slicen, plate)
- Geen beleefdheidsformules ("dank je wel", "graag gedaan")
- Wel: aanmoediging als iets goed gaat ("strak werk", "mooi op tijd")
- Spreekt aan met "jij" / "je" — collegiaal
- Nooit emoji's

OUTPUT-FORMAT:
- ALLEEN een JSON-object, geen extra tekst
- {
    "directive": "1 zin, max 12 woorden — wat moet er NU gebeuren",
    "severity": "praise" | "normal" | "urgent" | "critical",
    "actionLabel": "korte CTA, max 3 woorden — bv 'Mac in oven' of 'Wrap nu'" | null,
    "context": "1 korte zin extra context max 14 woorden" | null
  }

SEVERITY GIDS:
- "critical": allergie-issue, missende mise <5 min voor service, smoker te koud
- "urgent": iets moet binnen 15 min, niet alle mise gedaan voor active gang
- "normal": tip, vooruitkijkend ("over 30 min start gang 2, plan vast bain")
- "praise": als alles loopt goed of stap net afgerond

Voorbeelden goede directives:
- "Brisket aansnijden, NU"
- "Mac in oven 180°C, 15 min"
- "Tafel 3 pinda — aparte plank klaarzetten"
- "Mooi tempo, gang 1 zit op schema"`;

interface ChefContext {
    now: string;                   // HH:MM
    activeCourseId?: string;
    activeCourseTitle?: string;
    activeCourseStart?: string;    // HH:MM
    activeCourseStatus?: string;   // 'prep' | 'active' | etc
    minsUntilNextCourse?: number;
    nextCourseTitle?: string;
    misePctDone?: number;          // 0-100
    miseRemaining?: { label: string; critical?: boolean }[];
    smoker?: { item: string; temp: number; target: number; etaMinutes: number };
    allergies?: { person: string; issue: string; severity: string }[];
    userQuestion?: string;          // optioneel — als gebruiker actief vraagt
}

export async function POST(req: NextRequest) {
    try {
        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey) return NextResponse.json({ error: 'Geen API key' }, { status: 500 });

        const supabase = await createServerSupabase();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

        const { data: memberData } = await supabase
            .from('organization_members').select('organization_id')
            .eq('user_id', user.id).eq('status', 'active').limit(1);
        const orgId = memberData?.[0]?.organization_id || null;

        const ctx = (await req.json()) as ChefContext;

        const userMessage = `LIVE EVENT-CONTEXT:
${ctx.now ? `- Nu: ${ctx.now}` : ''}
${ctx.activeCourseTitle ? `- Actieve gang: ${ctx.activeCourseTitle} (status: ${ctx.activeCourseStatus || '?'}, start ${ctx.activeCourseStart || '?'})` : ''}
${ctx.minsUntilNextCourse !== undefined ? `- Volgende gang over ${ctx.minsUntilNextCourse} min: ${ctx.nextCourseTitle || '?'}` : ''}
${ctx.misePctDone !== undefined ? `- Mise: ${ctx.misePctDone}% klaar` : ''}
${ctx.miseRemaining && ctx.miseRemaining.length > 0 ? `- Mise nog te doen:\n${ctx.miseRemaining.slice(0, 8).map(m => `  • ${m.label}${m.critical ? ' [CRITICAL]' : ''}`).join('\n')}` : ''}
${ctx.smoker ? `- Smoker: ${ctx.smoker.item} ${ctx.smoker.temp}°C → ${ctx.smoker.target}°C, ETA ${ctx.smoker.etaMinutes}m` : ''}
${ctx.allergies && ctx.allergies.length > 0 ? `- Allergieën: ${ctx.allergies.map(a => `${a.person}=${a.issue}(${a.severity})`).join(', ')}` : ''}

${ctx.userQuestion ? `\nVRAAG VAN PITMASTER: "${ctx.userQuestion}"` : ''}

Geef je directive als JSON.`;

        const client = new Anthropic({ apiKey });
        const response = await client.messages.create({
            model: 'claude-haiku-4-5',
            max_tokens: 350,
            system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
            messages: [{ role: 'user', content: userMessage }],
        });

        if (orgId) {
            void logAiUsageServer({
                organization_id: orgId,
                user_id: user.id,
                action_type: 'chat',
                model: 'claude-haiku-4-5',
                tokens_input: response.usage.input_tokens || 0,
                tokens_output: response.usage.output_tokens || 0,
                tokens_cache_read: response.usage.cache_read_input_tokens || 0,
                tokens_cache_creation: response.usage.cache_creation_input_tokens || 0,
                cost_eur_cents: estimateAiCostCents({
                    model: 'claude-haiku-4-5',
                    tokens_input: response.usage.input_tokens || 0,
                    tokens_output: response.usage.output_tokens || 0,
                    tokens_cache_read: response.usage.cache_read_input_tokens || 0,
                    tokens_cache_creation: response.usage.cache_creation_input_tokens || 0,
                }),
                metadata: { source: 'chef_coach' },
            });
        }

        const textBlock = response.content.find(b => b.type === 'text');
        const text = textBlock && textBlock.type === 'text' ? textBlock.text : '{}';

        /* JSON-recovery */
        let parsed: any = null;
        try { parsed = JSON.parse(text); } catch {
            const m = text.match(/\{[\s\S]*\}/);
            if (m) try { parsed = JSON.parse(m[0]); } catch { /* */ }
        }
        if (!parsed) parsed = { directive: 'Alles loopt — kom terug over een paar minuten.', severity: 'normal' };

        return NextResponse.json({
            success: true,
            ...parsed,
            generatedAt: new Date().toISOString(),
        });
    } catch (e: any) {
        console.error('[chef-coach]', e);
        return NextResponse.json({ error: e?.message || 'Onbekende fout' }, { status: 500 });
    }
}
