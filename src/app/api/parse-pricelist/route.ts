/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

export const runtime = 'nodejs';
export const maxDuration = 120;

const PRICELIST_SYSTEM_PROMPT = `Je leest een Nederlandse groothandel prijslijst (Makro, Sligro, Hanos, Bidfood e.d.) en extraheert ALLE productregels.
Dit is GEEN voorraad — alleen product + prijs + eenheid + categorie.

Retourneer ALLEEN geldige JSON, geen markdown, geen uitleg:

{
  "leverancier": "string (naam uit de header, bv. 'Makro')",
  "datum": "YYYY-MM-DD of null (als zichtbaar)",
  "producten": [
    {
      "product_naam": "string (volledige productnaam, zonder artikelnummer)",
      "prijs": number (contractprijs per eenheid, EXCL BTW),
      "eenheid": "string (kg, L, stuks, doos, pak, fles, krat, enz)",
      "categorie": "Vlees/Vis/Groenten/Zuivel/Kruiden/Sauzen/Dranken/Brood/Hout/Verpakking/Kaas/Vegan/Overig"
    }
  ]
}

Regels:
- Geef ELKE regel terug die een product + prijs heeft, ook als ze op één pagina staan
- Gebruik contractprijs / staffelprijs (laagste) indien zichtbaar
- Alle prijzen EXCL BTW
- Bij onduidelijke eenheid: gebruik 'stuks'
- Categoriseer zo logisch mogelijk voor BBQ/catering context
- Skip: artikelnummers, barcodes, BTW-percentages — alleen product + prijs + eenheid + categorie`;

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
            return NextResponse.json({ error: 'ANTHROPIC_API_KEY ontbreekt' }, { status: 500 });
        }

        const body = await req.json();
        const { pdfBase64, imageBase64, model: modelChoice } = body as {
            pdfBase64?: string;
            imageBase64?: string;
            model?: 'haiku' | 'sonnet' | 'opus';
        };

        if (!pdfBase64 && !imageBase64) {
            return NextResponse.json({ error: 'Geen PDF of image meegegeven' }, { status: 400 });
        }

        const client = new Anthropic({ apiKey });
        const contentBlocks: Anthropic.Messages.ContentBlockParam[] = [];

        if (pdfBase64) {
            const parsed = pdfBase64.startsWith('data:') ? parseDataUrl(pdfBase64) : { mediaType: 'application/pdf', data: pdfBase64 };
            contentBlocks.push({
                type: 'document',
                source: { type: 'base64', media_type: 'application/pdf', data: parsed.data },
            } as any);
        } else if (imageBase64) {
            const parsed = imageBase64.startsWith('data:') ? parseDataUrl(imageBase64) : { mediaType: 'image/jpeg', data: imageBase64 };
            const mediaType = parsed.mediaType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
            contentBlocks.push({
                type: 'image',
                source: { type: 'base64', media_type: mediaType, data: parsed.data },
            });
        }

        contentBlocks.push({ type: 'text', text: 'Extraheer alle producten als JSON.' });

        const MODEL_MAP = {
            haiku: 'claude-haiku-4-5',
            sonnet: 'claude-sonnet-4-6',
            opus: 'claude-opus-4-7',
        } as const;
        const model = MODEL_MAP[modelChoice || 'haiku'] || MODEL_MAP.haiku;
        const isHaikuOrSonnet = model === MODEL_MAP.haiku || model === MODEL_MAP.sonnet;

        const stream = client.messages.stream({
            model,
            max_tokens: 16000,
            system: [{ type: 'text', text: PRICELIST_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
            messages: [{ role: 'user', content: contentBlocks }],
            ...(isHaikuOrSonnet ? { thinking: { type: 'disabled' as const } } : {}),
        } as any);
        const response = await stream.finalMessage();

        const textBlock = response.content.find(b => b.type === 'text');
        if (!textBlock || textBlock.type !== 'text') {
            return NextResponse.json({ error: 'Claude gaf geen tekst' }, { status: 502 });
        }
        const content = textBlock.text;

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
            try { parsed = JSON.parse(candidate); break; } catch { /* next */ }
        }

        if (!parsed) {
            return NextResponse.json({ error: 'AI gaf geen geldige JSON', raw: content.slice(0, 500) }, { status: 502 });
        }

        console.log(`[parse-pricelist] ${parsed.producten?.length || 0} producten · total=${Date.now() - t0}ms · tokens=${response.usage.input_tokens}in/${response.usage.output_tokens}out`);

        return NextResponse.json({
            success: true,
            data: parsed,
            elapsedMs: Date.now() - t0,
            usage: response.usage,
        });
    } catch (e: any) {
        console.error('[parse-pricelist]', e);
        if (e instanceof Anthropic.RateLimitError) {
            return NextResponse.json({ error: 'Rate limit — wacht even' }, { status: 429 });
        }
        return NextResponse.json({ error: e?.message || 'Onbekende fout' }, { status: 500 });
    }
}
