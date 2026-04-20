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
- Bij onzekerheid: geef je beste inschatting — niet null laten
- Antwoord ALLEEN met de JSON, geen markdown, geen uitleg`;

const RECEIPT_SYSTEM_PROMPT = `Je bent een expert in het lezen van Nederlandse kassabonnen van supermarkten/groothandels voor een horeca bedrijf.
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
- Antwoord ALLEEN met de JSON, geen markdown`;

export async function POST(req: NextRequest) {
    try {
        const apiKey = process.env.GROQ_API_KEY;
        if (!apiKey) {
            return NextResponse.json({ error: 'GROQ_API_KEY ontbreekt in environment' }, { status: 500 });
        }

        const body = await req.json();
        const { imageBase64, imageUrl, type } = body as { imageBase64?: string; imageUrl?: string; type: 'invoice' | 'receipt' };

        if (!imageBase64 && !imageUrl) {
            return NextResponse.json({ error: 'Geef imageBase64 of imageUrl mee' }, { status: 400 });
        }
        if (!['invoice', 'receipt'].includes(type)) {
            return NextResponse.json({ error: 'type moet invoice of receipt zijn' }, { status: 400 });
        }

        const systemPrompt = type === 'invoice' ? INVOICE_SYSTEM_PROMPT : RECEIPT_SYSTEM_PROMPT;
        const userText = type === 'invoice'
            ? 'Lees deze factuur en retourneer het JSON-schema zoals geïnstrueerd.'
            : 'Lees deze kassabon en retourneer het JSON-schema zoals geïnstrueerd.';

        const imageContent = imageBase64
            ? { type: 'image_url', image_url: { url: imageBase64.startsWith('data:') ? imageBase64 : `data:image/jpeg;base64,${imageBase64}` } }
            : { type: 'image_url', image_url: { url: imageUrl! } };

        const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + apiKey,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'meta-llama/llama-4-scout-17b-16e-instruct',
                messages: [
                    {
                        role: 'user',
                        content: [
                            { type: 'text', text: systemPrompt + '\n\n' + userText },
                            imageContent,
                        ],
                    },
                ],
                temperature: 0.1,
                max_tokens: 3000,
                response_format: { type: 'json_object' },
            }),
        });

        if (!groqResponse.ok) {
            const err = await groqResponse.text();
            console.error('Groq vision error:', groqResponse.status, err);
            return NextResponse.json({
                error: 'AI kon het document niet lezen',
                detail: err,
                status: groqResponse.status,
            }, { status: 502 });
        }

        const data = await groqResponse.json();
        const content = data?.choices?.[0]?.message?.content;
        if (!content) {
            return NextResponse.json({ error: 'AI gaf leeg antwoord' }, { status: 502 });
        }

        let parsed: any;
        try {
            parsed = JSON.parse(content);
        } catch {
            const match = content.match(/\{[\s\S]*\}/);
            if (match) {
                try { parsed = JSON.parse(match[0]); } catch { parsed = null; }
            }
            if (!parsed) {
                return NextResponse.json({ error: 'AI antwoord kon niet als JSON worden gelezen', raw: content }, { status: 502 });
            }
        }

        return NextResponse.json({ success: true, data: parsed, raw: content });
    } catch (e: any) {
        console.error('parse-document error:', e);
        return NextResponse.json({ error: e?.message || 'Onbekende fout' }, { status: 500 });
    }
}
