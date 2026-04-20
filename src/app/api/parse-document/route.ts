/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

const INVOICE_SYSTEM_PROMPT = `Je bent een expert in het lezen van Nederlandse leveranciersfacturen voor een horeca/catering bedrijf.
Je krijgt een afbeelding van een factuur. Extracteer de gegevens in strikt JSON formaat.
Gebruik EXACT dit schema, geen extra velden:

{
  "leverancier": "string (naam van de leverancier)",
  "factuurnummer": "string of null",
  "datum": "YYYY-MM-DD of null",
  "totaal_excl": number,
  "totaal_btw": number,
  "totaal_incl": number,
  "valuta": "EUR",
  "regels": [
    {
      "product_naam": "string",
      "hoeveelheid": number,
      "eenheid": "string (kg/L/stuks/doos/etc)",
      "prijs_per_eenheid": number,
      "btw_pct": number (meestal 9 of 21),
      "subtotaal": number,
      "categorie": "string (Vlees/Vis/Groenten/Zuivel/Kruiden/Sauzen/Dranken/Brood/Hout/Verpakking/Overig)"
    }
  ]
}

Regels:
- Alle bedragen EXCL BTW tenzij anders aangegeven
- Categoriseer producten logisch voor BBQ/catering context
- Bij onzekerheid: geef je beste inschatting
- Antwoord ALLEEN met geldige JSON, geen markdown fences, geen extra tekst`;

const RECEIPT_SYSTEM_PROMPT = `Je bent een expert in het lezen van Nederlandse kassabonnen voor een horeca bedrijf.
Je krijgt een foto van een kassabon. Extracteer in strikt JSON formaat:

{
  "winkel": "string (naam supermarkt/winkel)",
  "datum": "YYYY-MM-DD of null",
  "totaal_bedrag": number (totaal incl BTW),
  "btw_pct": number (meestal 9 of 21),
  "categorie": "string (Vlees/Vis/Groenten/Zuivel/Kruiden/Sauzen/Dranken/Brood/Hout/Verpakking/Overig)",
  "regels": [
    { "product_naam": "string", "aantal": number, "prijs": number }
  ],
  "notities": "string (bijzonderheden, max 1 zin)"
}

Regels:
- Bij onleesbare bon: geef je beste inschatting
- Antwoord ALLEEN met geldige JSON, geen markdown fences, geen extra tekst`;

// Try models in order — first supported one wins
const VISION_MODELS = [
    'meta-llama/llama-4-scout-17b-16e-instruct',
    'meta-llama/llama-4-maverick-17b-128e-instruct',
    'llama-3.2-90b-vision-preview',
    'llama-3.2-11b-vision-preview',
];

async function callGroqWithTimeout(body: any, apiKey: string, timeoutMs: number): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: controller.signal,
        });
    } finally {
        clearTimeout(timer);
    }
}

export async function POST(req: NextRequest) {
    const t0 = Date.now();
    try {
        const apiKey = process.env.GROQ_API_KEY;
        if (!apiKey) {
            return NextResponse.json({ error: 'GROQ_API_KEY ontbreekt — voeg toe aan .env.local' }, { status: 500 });
        }

        const body = await req.json();
        const { imageBase64, imageUrl, type } = body as { imageBase64?: string; imageUrl?: string; type: 'invoice' | 'receipt' };

        if (!imageBase64 && !imageUrl) {
            return NextResponse.json({ error: 'Geen afbeelding meegegeven' }, { status: 400 });
        }
        if (!['invoice', 'receipt'].includes(type)) {
            return NextResponse.json({ error: 'type moet invoice of receipt zijn' }, { status: 400 });
        }

        const systemPrompt = type === 'invoice' ? INVOICE_SYSTEM_PROMPT : RECEIPT_SYSTEM_PROMPT;
        const userText = type === 'invoice'
            ? 'Lees deze factuur en retourneer het JSON-schema zoals geïnstrueerd.'
            : 'Lees deze kassabon en retourneer het JSON-schema zoals geïnstrueerd.';

        const imageContent = imageBase64
            ? { type: 'image_url' as const, image_url: { url: imageBase64.startsWith('data:') ? imageBase64 : `data:image/jpeg;base64,${imageBase64}` } }
            : { type: 'image_url' as const, image_url: { url: imageUrl! } };

        const messages = [{
            role: 'user' as const,
            content: [
                { type: 'text' as const, text: systemPrompt + '\n\n' + userText },
                imageContent,
            ],
        }];

        let lastError: string | null = null;
        let lastStatus = 0;

        for (const model of VISION_MODELS) {
            console.log(`[parse-document] trying model=${model} type=${type} elapsed=${Date.now() - t0}ms`);
            try {
                const res = await callGroqWithTimeout({
                    model,
                    messages,
                    temperature: 0.1,
                    max_tokens: 3000,
                    response_format: { type: 'json_object' },
                }, apiKey, 45000);

                if (!res.ok) {
                    const err = await res.text();
                    lastStatus = res.status;
                    lastError = err.slice(0, 500);
                    console.warn(`[parse-document] model=${model} status=${res.status} err=${lastError}`);
                    // If model doesn't exist / decommissioned, try next
                    if (res.status === 400 || res.status === 404) continue;
                    // Other errors: stop
                    break;
                }

                const data = await res.json();
                const content = data?.choices?.[0]?.message?.content;
                if (!content) {
                    lastError = 'AI gaf leeg antwoord';
                    continue;
                }

                let parsed: any;
                try {
                    parsed = JSON.parse(content);
                } catch {
                    const match = content.match(/\{[\s\S]*\}/);
                    if (match) {
                        try { parsed = JSON.parse(match[0]); } catch { /* ignore */ }
                    }
                }
                if (!parsed) {
                    lastError = 'AI antwoord kon niet als JSON worden gelezen';
                    continue;
                }

                console.log(`[parse-document] success model=${model} total=${Date.now() - t0}ms`);
                return NextResponse.json({ success: true, data: parsed, model, elapsedMs: Date.now() - t0 });
            } catch (e: any) {
                lastError = e?.name === 'AbortError' ? 'AI reageerde niet binnen 45s' : (e?.message || 'Onbekende fout');
                console.warn(`[parse-document] model=${model} exception=${lastError}`);
                if (e?.name === 'AbortError') break;
            }
        }

        return NextResponse.json({
            error: lastError || 'Geen enkel vision-model werkte',
            status: lastStatus,
            hint: 'Check je GROQ_API_KEY + of je account toegang heeft tot vision-modellen op console.groq.com',
        }, { status: 502 });
    } catch (e: any) {
        console.error('[parse-document] fatal', e);
        return NextResponse.json({ error: e?.message || 'Onbekende fout' }, { status: 500 });
    }
}
