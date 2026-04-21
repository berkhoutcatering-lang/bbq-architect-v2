/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

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
  "geschatte_kostprijs_pp": number (ruwe schatting in EUR, excl BTW)
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

        // Sonnet default voor recepten (kwaliteit boven snelheid). Haiku kan voor simpele enrich/scale.
        const MODEL_MAP = {
            haiku: 'claude-haiku-4-5',
            sonnet: 'claude-sonnet-4-6',
            opus: 'claude-opus-4-7',
        } as const;
        const model = MODEL_MAP[modelChoice || 'sonnet'] || MODEL_MAP.sonnet;
        console.log(`[recipe-generate] model=${model} mode=${mode} existingCount=${existing.length}`);

        // Streaming om timeouts te voorkomen bij lange outputs
        const stream = client.messages.stream({
            model,
            max_tokens: 8000,
            system: SYSTEM_PROMPT,
            messages: [{ role: 'user', content: userMessage }],
        });
        const response = await stream.finalMessage();

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
