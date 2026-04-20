/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

export const runtime = 'nodejs';
export const maxDuration = 60;

const INVOICE_SYSTEM_PROMPT = `Je bent een expert in het lezen van Nederlandse leveranciersfacturen voor een horeca/catering bedrijf.
Je krijgt een factuur (PDF of foto). Extracteer de gegevens in strikt JSON formaat.
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

function parseDataUrl(dataUrl: string): { mediaType: string; data: string } {
    const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) throw new Error('Ongeldige data URL');
    return { mediaType: match[1], data: match[2] };
}

export async function POST(req: NextRequest) {
    const t0 = Date.now();
    try {
        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey) {
            return NextResponse.json({
                error: 'ANTHROPIC_API_KEY ontbreekt — voeg toe aan .env.local',
                hint: 'Ga naar console.anthropic.com → API Keys → Create key',
            }, { status: 500 });
        }

        const body = await req.json();
        const { imageBase64, pdfBase64, imageUrl, type } = body as {
            imageBase64?: string;
            pdfBase64?: string;
            imageUrl?: string;
            type: 'invoice' | 'receipt';
        };

        if (!imageBase64 && !pdfBase64 && !imageUrl) {
            return NextResponse.json({ error: 'Geen document meegegeven (imageBase64 / pdfBase64 / imageUrl)' }, { status: 400 });
        }
        if (!['invoice', 'receipt'].includes(type)) {
            return NextResponse.json({ error: 'type moet invoice of receipt zijn' }, { status: 400 });
        }

        const systemPrompt = type === 'invoice' ? INVOICE_SYSTEM_PROMPT : RECEIPT_SYSTEM_PROMPT;
        const userText = type === 'invoice'
            ? 'Lees deze factuur en retourneer het JSON-schema zoals geïnstrueerd.'
            : 'Lees deze kassabon en retourneer het JSON-schema zoals geïnstrueerd.';

        const client = new Anthropic({ apiKey });

        // Build the document content block — Claude supports both native PDF and image input
        const contentBlocks: Anthropic.Messages.ContentBlockParam[] = [];

        if (pdfBase64) {
            const parsed = pdfBase64.startsWith('data:') ? parseDataUrl(pdfBase64) : { mediaType: 'application/pdf', data: pdfBase64 };
            contentBlocks.push({
                type: 'document',
                source: { type: 'base64', media_type: 'application/pdf', data: parsed.data },
            } as any);
        } else if (imageBase64) {
            const parsed = imageBase64.startsWith('data:') ? parseDataUrl(imageBase64) : { mediaType: 'image/jpeg', data: imageBase64 };
            const isPdf = parsed.mediaType === 'application/pdf';
            if (isPdf) {
                contentBlocks.push({
                    type: 'document',
                    source: { type: 'base64', media_type: 'application/pdf', data: parsed.data },
                } as any);
            } else {
                const mediaType = parsed.mediaType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
                contentBlocks.push({
                    type: 'image',
                    source: { type: 'base64', media_type: mediaType, data: parsed.data },
                });
            }
        } else if (imageUrl) {
            contentBlocks.push({
                type: 'image',
                source: { type: 'url', url: imageUrl },
            });
        }

        contentBlocks.push({ type: 'text', text: userText });

        // Haiku 4.5 is uitstekend voor gestructureerde extractie en ~80% goedkoper dan Opus.
        // Voor complexe facturen waar Haiku faalt kan later een fallback naar Sonnet/Opus worden toegevoegd.
        const model = 'claude-haiku-4-5';
        console.log(`[parse-document] calling ${model} type=${type} elapsed=${Date.now() - t0}ms`);

        const response = await client.messages.create({
            model,
            max_tokens: 4000,
            system: systemPrompt,
            messages: [{ role: 'user', content: contentBlocks }],
        });

        // Extract text content from response
        const textBlock = response.content.find(b => b.type === 'text');
        if (!textBlock || textBlock.type !== 'text') {
            return NextResponse.json({ error: 'Claude gaf geen tekst antwoord' }, { status: 502 });
        }
        const content = textBlock.text;

        let parsed: any;
        try {
            parsed = JSON.parse(content);
        } catch {
            const match = content.match(/\{[\s\S]*\}/);
            if (match) {
                try { parsed = JSON.parse(match[0]); } catch { parsed = null; }
            }
        }
        if (!parsed) {
            return NextResponse.json({
                error: 'AI antwoord kon niet als JSON worden gelezen',
                raw: content.slice(0, 500),
            }, { status: 502 });
        }

        console.log(`[parse-document] success total=${Date.now() - t0}ms tokens=${response.usage.input_tokens}in/${response.usage.output_tokens}out`);
        return NextResponse.json({
            success: true,
            data: parsed,
            model: response.model,
            elapsedMs: Date.now() - t0,
            usage: response.usage,
        });
    } catch (e: any) {
        console.error('[parse-document]', e);
        if (e instanceof Anthropic.AuthenticationError) {
            return NextResponse.json({ error: 'Ongeldige ANTHROPIC_API_KEY — check console.anthropic.com' }, { status: 401 });
        }
        if (e instanceof Anthropic.RateLimitError) {
            return NextResponse.json({ error: 'Te veel requests — wacht even en probeer opnieuw' }, { status: 429 });
        }
        if (e instanceof Anthropic.APIError) {
            return NextResponse.json({ error: 'Claude API fout', detail: e.message, status: e.status }, { status: 502 });
        }
        return NextResponse.json({ error: e?.message || 'Onbekende fout' }, { status: 500 });
    }
}
