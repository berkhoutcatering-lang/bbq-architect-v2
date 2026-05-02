/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createServerSupabase } from '@/lib/supabase-server';
import { logAiUsageServer } from '@/lib/aiUsageServer';
import { estimateAiCostCents } from '@/lib/aiCost';

export const runtime = 'nodejs';
export const maxDuration = 120;

type GenerateMode = 'recipe' | 'menu' | 'enrich' | 'scale';

type ExistingDish = {
    naam: string;
    categorie?: string;
    gang?: string;
    tags?: string[];
};

const SYSTEM_PROMPT = `Je bent de executive chef van "Hop & Bites" — een Nederlandse catering voor BBQ en buiten-events. Je ontwikkelt recepten en gerechten die:
- Passen bij BBQ / buitenkeuken / vlam / rook-stijl
- Goed opschalen naar 20–100 gasten zonder kwaliteitsverlies
- Nederlands zijn qua ingrediënten (beschikbaar bij Makro/Sligro/Hanos)
- Zijn bedoeld voor horeca-prep (mise-en-place, Cook-chill, Re-gen)
- In de STIJL blijven van wat de keuken al doet (consistentie is belangrijk)

Je kijkt NAUWGEZET naar de bestaande gerechten-lijst die je krijgt en houdt je aan die stijl, prijsklasse, smaak-richting en complexiteit. Geen fusion-excessen, wel creativiteit binnen het BBQ-universum.

Antwoord ALLEEN met geldige JSON. Geen markdown fences, geen uitleg eromheen.`;

const RECIPE_SCHEMA_PROMPT = `Retourneer dit EXACTE JSON-schema (één recept):

{
  "naam": "string",
  "categorie": "Vlees" | "Vis" | "Bijgerecht" | "Saus" | "Dessert" | "Drank",
  "porties": number (standaard 10),
  "preptime": number (totale prep+cook tijd in minuten),
  "beschrijving": "string (1–2 zinnen, menu-worthy pitch)",
  "ingredienten": [
    { "naam": "string", "hoeveelheid": number, "eenheid": "string (g/kg/ml/l/stuks/tl/el)" }
  ],
  "instructies": ["stap 1", "stap 2", "..."] (6–12 stappen, concreet en chef-taal),
  "allergenen": ["gluten" | "lactose" | "ei" | "noten" | "soja" | "vis" | "schaaldieren" | "selderij" | "mosterd" | "sesam" | "sulfiet" | "lupine" | "weekdieren" | "pinda"],
  "tags": ["BBQ", "vega", "vegan", "glutenvrij", "signature", "zomer", "winter", "comfort", "lichtgekruid", "rook" enz.],
  "battle_plan": ["T-24h: marinade maken", "T-4h: kerntemperatuur naar 55°C...", "T-30min: afgrillen..."] (3–6 stappen, optioneel maar gewenst),
  "wijn_suggestie": "string (naam + korte reden)",
  "service_tip": "string (plating / bordje / temperatuur)",
  "geschatte_kostprijs_pp": number (ruwe schatting in EUR, excl BTW),
  "inspired_by": ["string"]   /* 1–3 bestaande gerechten uit JOUW REPERTOIRE
                                 die als stijl-bron dienen. Gebruik EXACT de
                                 naam zoals die in de lijst staat. Lege array
                                 alleen als geen referentie bestaat. */
}`;

const MENU_SCHEMA_PROMPT = `Retourneer dit EXACTE JSON-schema (volledig menu met meerdere gerechten):

{
  "menu_naam": "string",
  "thema": "string",
  "aantal_gasten": number,
  "gerechten": [
    {
      // zelfde schema als single recipe
      "naam": "string",
      "categorie": "Vlees" | "Vis" | "Bijgerecht" | "Saus" | "Dessert" | "Drank",
      "gang": "Voorgerecht" | "Hoofdgerecht" | "Bijgerecht" | "Dessert" | "Borrelhapje",
      "porties": number,
      "preptime": number,
      "beschrijving": "string",
      "ingredienten": [{ "naam": "string", "hoeveelheid": number, "eenheid": "string" }],
      "instructies": ["..."],
      "allergenen": ["..."],
      "tags": ["..."],
      "geschatte_kostprijs_pp": number
    }
  ],
  "totale_kostprijs_pp": number,
  "adviesprijs_pp": number (met 40–50% marge),
  "samengevatte_inkooplijst": [
    { "product": "string", "totale_hoeveelheid": number, "eenheid": "string", "categorie": "Vlees/Vis/Groenten/Zuivel/Kruiden/Sauzen/Overig" }
  ]
}`;

function buildUserMessage(mode: GenerateMode, userPrompt: string, existing: ExistingDish[], options: any): string {
    const stijlContext = existing.length > 0
        ? `\n\n## JOUW BESTAANDE REPERTOIRE (blijf in deze stijl):\n${existing.slice(0, 40).map(d => `- ${d.naam}${d.categorie ? ` (${d.categorie})` : ''}${d.gang ? ` · ${d.gang}` : ''}${d.tags?.length ? ` [${d.tags.join(', ')}]` : ''}`).join('\n')}`
        : '';

    if (mode === 'recipe') {
        return `Bedenk EEN recept op basis van deze vraag:\n\n"${userPrompt}"${stijlContext}\n\nPorties standaard ${options?.porties || 10}. ${RECIPE_SCHEMA_PROMPT}`;
    }
    if (mode === 'menu') {
        return `Stel een VOLLEDIG MENU samen op basis van deze vraag:\n\n"${userPrompt}"\n\nAantal gasten: ${options?.gasten || 20}. Aantal gangen: ${options?.gangen || '3-4 (voorgerecht, hoofd + bijgerecht, dessert)'}.${stijlContext}\n\n${MENU_SCHEMA_PROMPT}`;
    }
    if (mode === 'enrich') {
        const existingData = options?.currentDish || {};
        return `Verrijk dit bestaande gerecht met ontbrekende velden (bereiding, allergenen, wijn-suggestie, battle plan, service-tip). Behoud naam en categorie, breid alles anders aan:\n\n${JSON.stringify(existingData, null, 2)}${stijlContext}\n\n${RECIPE_SCHEMA_PROMPT}`;
    }
    if (mode === 'scale') {
        const orig = options?.currentRecipe || {};
        const target = options?.targetPorties || 20;
        return `Schaal dit recept naar ${target} porties. Pas hoeveelheden aan met realistische catering-rondingen (kg ipv 983g, hele flessen wijn enz). Behoud instructies maar pas waar nodig aan:\n\n${JSON.stringify(orig, null, 2)}\n\n${RECIPE_SCHEMA_PROMPT}`;
    }
    return userPrompt;
}

export async function POST(req: NextRequest) {
    const t0 = Date.now();
    try {
        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey) {
            return NextResponse.json({ error: 'ANTHROPIC_API_KEY ontbreekt' }, { status: 500 });
        }

        const body = await req.json();
        const { prompt, mode = 'recipe', existing = [], options = {}, model: modelChoice } = body as {
            prompt?: string;
            mode?: GenerateMode;
            existing?: ExistingDish[];
            options?: any;
            model?: 'haiku' | 'sonnet' | 'opus';
        };

        if (!prompt && mode !== 'enrich' && mode !== 'scale') {
            return NextResponse.json({ error: 'Geef een prompt mee' }, { status: 400 });
        }

        const client = new Anthropic({ apiKey });
        const userMessage = buildUserMessage(mode, prompt || '', existing, options);

        // Slimme default per mode:
        // - recipe/menu = creatief werk → Sonnet (default)
        // - enrich/scale = simpele structured tasks → Haiku (3× sneller, 5× goedkoper)
        const MODEL_MAP = {
            haiku: 'claude-haiku-4-5',
            sonnet: 'claude-sonnet-4-6',
            opus: 'claude-opus-4-7',
        } as const;
        const simpleMode = mode === 'enrich' || mode === 'scale';
        const defaultModel = simpleMode ? 'haiku' : 'sonnet';
        const model = MODEL_MAP[modelChoice || defaultModel] || MODEL_MAP.sonnet;
        console.log(`[recipe-generate] model=${model} mode=${mode} existingCount=${existing.length}`);

        // Resolve org for usage logging (fire-and-forget, no auth required)
        let orgId: string | null = null;
        let userId: string | null = null;
        try {
            const sb = await createServerSupabase();
            const { data: { user } } = await sb.auth.getUser();
            if (user) {
                userId = user.id;
                const mem = await sb.from('organization_members')
                    .select('organization_id')
                    .eq('user_id', user.id)
                    .eq('status', 'active')
                    .limit(1)
                    .maybeSingle();
                orgId = mem.data?.organization_id ?? null;
            }
        } catch {
            /* logging is optional */
        }

        const maxTokens = mode === 'menu' ? 8000 : mode === 'recipe' ? 4000 : 2500;
        const isHaikuOrSonnet = model === MODEL_MAP.haiku || model === MODEL_MAP.sonnet;
        const stream = client.messages.stream({
            model,
            max_tokens: maxTokens,
            system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
            messages: [{ role: 'user', content: userMessage }],
            ...(isHaikuOrSonnet ? { thinking: { type: 'disabled' as const } } : {}),
        } as any);
        const response = await stream.finalMessage();

        // Log AI-usage (fire-and-forget)
        if (orgId && response.usage) {
            const u = response.usage;
            const cost = estimateAiCostCents({
                model,
                tokens_input: u.input_tokens,
                tokens_output: u.output_tokens,
                tokens_cache_read: u.cache_read_input_tokens ?? 0,
                tokens_cache_creation: u.cache_creation_input_tokens ?? 0,
            });
            logAiUsageServer({
                organization_id: orgId,
                user_id: userId,
                action_type: 'menu_suggestion',
                model,
                tokens_input: u.input_tokens,
                tokens_output: u.output_tokens,
                tokens_cache_read: u.cache_read_input_tokens ?? 0,
                tokens_cache_creation: u.cache_creation_input_tokens ?? 0,
                cost_eur_cents: cost,
                metadata: { mode, existingCount: existing.length },
            }).catch(function () { /* non-blocking */ });
        }

        const textBlock = response.content.find(b => b.type === 'text');
        if (!textBlock || textBlock.type !== 'text') {
            return NextResponse.json({ error: 'Claude gaf geen tekst antwoord' }, { status: 502 });
        }
        const content = textBlock.text;

        // Strip markdown fences en parse JSON
        function cleanJson(s: string): string {
            let t = s.trim();
            const fence = t.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
            if (fence) t = fence[1].trim();
            return t;
        }
        let parsed: any = null;
        const tries = [content, cleanJson(content)];
        const biggest = content.match(/\{[\s\S]*\}/);
        if (biggest) tries.push(biggest[0]);

        for (const candidate of tries) {
            try { parsed = JSON.parse(candidate); break; } catch { /* try next */ }
        }

        if (!parsed) {
            console.error(`[recipe-generate] JSON parse failed, stop=${response.stop_reason}`);
            return NextResponse.json({
                error: response.stop_reason === 'max_tokens' ? 'AI antwoord te lang — probeer een eenvoudiger vraag' : 'AI gaf geen geldig JSON',
                raw: content.slice(0, 500),
            }, { status: 502 });
        }

        console.log(`[recipe-generate] success total=${Date.now() - t0}ms tokens=${response.usage.input_tokens}in/${response.usage.output_tokens}out`);
        return NextResponse.json({
            success: true,
            data: parsed,
            mode,
            elapsedMs: Date.now() - t0,
            usage: response.usage,
        });
    } catch (e: any) {
        console.error('[recipe-generate]', e);
        if (e instanceof Anthropic.AuthenticationError) {
            return NextResponse.json({ error: 'Ongeldige ANTHROPIC_API_KEY' }, { status: 401 });
        }
        if (e instanceof Anthropic.RateLimitError) {
            return NextResponse.json({ error: 'Te veel requests — wacht even' }, { status: 429 });
        }
        return NextResponse.json({ error: e?.message || 'Onbekende fout' }, { status: 500 });
    }
}
