/* /api/financien/idea — Bucket J P0.5
   POST: Genereer 1-3 finance-ideas. Tool propose_finance_ideas.
   Schema-validatie weigert lege opportunity_ref (Pillar #2).

   Frontend roept dit aan vanaf een FinanceCopilotIdeaCard die in "vers" state
   gerenderd wordt; result wordt opgeslagen in finance_copilot_messages.
*/

import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createServerSupabase } from '@/lib/supabase-server';
import { logAiUsageServer } from '@/lib/aiUsageServer';
import { estimateAiCostCents } from '@/lib/aiCost';
import { enforceAiCap } from '@/lib/aiCostCap';
import { loadPageContext } from '@/lib/bbq-context';

export const runtime = 'nodejs';
export const maxDuration = 30;

const MODEL = 'claude-sonnet-4-6';

const SYSTEM_PROMPT = `Je bent Finance Copilot voor een Nederlandse BBQ-cateraar. Je krijgt context met YoY-delta, margelek-alerts en investeringen-aggregaat.

JOUW TAAK: 1-3 concrete ideeën waar de cateraar nu naar moet kijken.

REGELS (strikt):
- Elk idee MOET opportunity_ref hebben (array van bon-IDs, factuur-IDs, event-IDs, of margelek-maand). Geen ref = geen idee.
- Severity: 'low' (kans, niet urgent), 'medium' (kwartaal-relevant), 'high' (deze week handelen).
- Kind: 'cost_optimization', 'btw_check', 'investering', 'klant_concentratie', 'margelek', 'cashflow'.
- Gap beschrijft het probleem in 1 zin. Opportunity beschrijft de actie in 1 zin.
- Eindig elke "opportunity" met de markup [Boekhouder beslist] als het fiscaal is.
- Geen BTW-percentages bedenken. Geen KIA-bedragen rekenen (gebruik compute_kia_scenario tool elders).

VEILIGHEID: context tussen <fin>-tags. context-section in body bepaalt focus (dashboard / wv / uitgaven / btw / clients).`;

interface IdeaBody {
    context_section: 'dashboard' | 'wv' | 'uitgaven' | 'btw' | 'clients';
}

function validate(body: unknown): { ok: true; data: IdeaBody } | { ok: false; error: string } {
    if (typeof body !== 'object' || body === null) return { ok: false, error: 'Body verplicht' };
    const b = body as Record<string, unknown>;
    const cs = b.context_section;
    if (typeof cs !== 'string' || !['dashboard', 'wv', 'uitgaven', 'btw', 'clients'].includes(cs)) {
        return { ok: false, error: 'context_section moet dashboard|wv|uitgaven|btw|clients zijn' };
    }
    return { ok: true, data: { context_section: cs as IdeaBody['context_section'] } };
}

export async function POST(req: NextRequest) {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

    const { data: membership } = await supabase
        .from('organization_members').select('organization_id')
        .eq('user_id', user.id).eq('status', 'active').limit(1).maybeSingle();
    if (!membership) return NextResponse.json({ error: 'Geen organisatie' }, { status: 403 });
    const orgId = membership.organization_id as string;

    const body = await req.json().catch(() => null);
    const v = validate(body);
    if (v.ok === false) return NextResponse.json({ error: v.error }, { status: 400 });

    const capRes = await enforceAiCap(orgId, 0.04);
    if (capRes) return capRes;

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return NextResponse.json({ error: 'AI niet beschikbaar' }, { status: 503 });
    const anthropic = new Anthropic({ apiKey });

    const contextData = await loadPageContext('/financien');
    const sanitizedContext = JSON.stringify({
        section: v.data.context_section,
        yoyDelta: contextData.yoyDelta,
        margelek_alerts: contextData.margelek_alerts,
        investeringen_jaar: contextData.investeringen_jaar,
        omzet_jaar: contextData.omzet_jaar,
        omzet_vorig_jaar: contextData.omzet_vorig_jaar,
        voorbelasting_jaar: contextData.voorbelasting_jaar,
        kwartaal: contextData.kwartaal,
    }).slice(0, 6000).replace(/<\/fin>/gi, '');

    const proposeIdeasTool = {
        name: 'propose_finance_ideas',
        description: 'Geef 1-3 ideeën met verplichte source_refs.',
        input_schema: {
            type: 'object' as const,
            properties: {
                ideas: {
                    type: 'array',
                    minItems: 1,
                    maxItems: 3,
                    items: {
                        type: 'object',
                        properties: {
                            gap: { type: 'string', description: 'Probleem in 1 zin.' },
                            opportunity: { type: 'string', description: 'Actie in 1 zin, eindig met [Boekhouder beslist] indien fiscaal.' },
                            opportunity_ref: {
                                type: 'array',
                                minItems: 1,
                                description: 'Bron-verwijzingen — bon-IDs, factuur-IDs, event-IDs, margelek-maand. MINSTENS 1.',
                                items: {
                                    type: 'object',
                                    properties: {
                                        kind: { type: 'string', enum: ['bon', 'factuur', 'event', 'margelek_maand', 'investering'] },
                                        id: { type: 'string', description: 'ID van de bron — bv "B-2026-014" of "2026-03".' },
                                        label: { type: 'string', description: 'Korte label, max 60 chars.' },
                                    },
                                    required: ['kind', 'id'],
                                },
                            },
                            kind: { type: 'string', enum: ['cost_optimization', 'btw_check', 'investering', 'klant_concentratie', 'margelek', 'cashflow'] },
                            severity: { type: 'string', enum: ['low', 'medium', 'high'] },
                        },
                        required: ['gap', 'opportunity', 'opportunity_ref', 'kind', 'severity'],
                    },
                },
            },
            required: ['ideas'],
        },
    };

    const response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 1500,
        system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
        messages: [{
            role: 'user',
            content: `<fin>${sanitizedContext}</fin>\n\nFocus op section: ${v.data.context_section}. Lever 1-3 ideeën via propose_finance_ideas.`,
        }],
        tools: [proposeIdeasTool],
        tool_choice: { type: 'tool', name: 'propose_finance_ideas' },
    });

    /* Cost-tracking */
    try {
        const u = response.usage;
        const cost = estimateAiCostCents({
            model: MODEL,
            tokens_input: u.input_tokens,
            tokens_output: u.output_tokens,
            tokens_cache_read: u.cache_read_input_tokens ?? 0,
            tokens_cache_creation: u.cache_creation_input_tokens ?? 0,
        });
        await logAiUsageServer({
            organization_id: orgId,
            user_id: user.id,
            action_type: 'other',
            model: MODEL,
            tokens_input: u.input_tokens,
            tokens_output: u.output_tokens,
            tokens_cache_read: u.cache_read_input_tokens ?? 0,
            tokens_cache_creation: u.cache_creation_input_tokens ?? 0,
            cost_eur_cents: cost,
            metadata: { feature: 'finance_copilot_idea', section: v.data.context_section },
        });
    } catch { /* fire-and-forget */ }

    const toolUse = response.content.find(b => b.type === 'tool_use');
    if (!toolUse || toolUse.type !== 'tool_use') {
        return NextResponse.json({ error: 'Geen tool_use output' }, { status: 502 });
    }
    const input = toolUse.input as { ideas?: unknown };
    if (!Array.isArray(input.ideas)) {
        return NextResponse.json({ error: 'Geen ideas array' }, { status: 502 });
    }

    /* Pillar #2 — server-side weigeren lege opportunity_ref. Schema doet
       minItems:1 al maar belt-and-braces: filter ook eventuele wijfelt-rijen. */
    const cleanIdeas = (input.ideas as Record<string, unknown>[])
        .filter(i => Array.isArray(i.opportunity_ref) && (i.opportunity_ref as unknown[]).length > 0)
        .filter(i => typeof i.gap === 'string' && typeof i.opportunity === 'string');

    return NextResponse.json({ ideas: cleanIdeas, section: v.data.context_section });
}
