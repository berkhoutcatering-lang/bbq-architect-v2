/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

export const runtime = 'nodejs';
export const maxDuration = 120;

const PRICELIST_SYSTEM_PROMPT = `Je bent een extractie-engine voor Nederlandse groothandel-prijslijsten (Makro, Sligro, Hanos, Bidfood).
Je doel: LETTERLIJK ELKE productregel in de input extracten. Niet samenvatten, niet categoriseren-en-filteren, niet "top producten" kiezen. ALLES.

Retourneer ALLEEN geldige JSON, geen markdown, geen uitleg:

{
  "leverancier": "string",
  "datum": "YYYY-MM-DD of null",
  "producten": [
    { "product_naam": "string", "prijs": number, "eenheid": "string", "categorie": "string" }
  ]
}

KRITIEKE REGELS (faal hierop niet):
- ALLE regels → als je 500 producten ziet, geef 500 terug. Niet 50.
- Ook producten die op elkaar lijken (bv. "Gouda 48+ 5kg" en "Gouda 48+ 3kg") zijn aparte items.
- Elke variant (smaak, gewicht, verpakking, merk) = aparte regel.
- Inclusief seizoens-/actie-producten.
- Sla NIETS over omdat het "standaard" of "niet-interessant" lijkt.

Details per veld:
- product_naam: volledige naam, zonder artikelnummer
- prijs: contractprijs of staffelprijs (laagste), EXCL BTW, als number
- eenheid: kg / L / stuks / doos / pak / fles / krat / bakje / kist
- categorie: Vlees / Vis / Groenten / Fruit / Zuivel / Kaas / Kruiden / Sauzen /
  Dranken / Brood / Hout / Verpakking / Vegan / AGF / Overig (kies meest passend)

Skip alleen: artikelnummers, barcodes, BTW-percentages, lege witregels, paginanummers.`;

function parseDataUrl(dataUrl: string): { mediaType: string; data: string } {
    const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) throw new Error('Ongeldige data URL');
    return { mediaType: match[1], data: match[2] };
}

function cleanJson(s: string): string {
    let t = s.trim();
    const fence = t.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (fence) t = fence[1].trim();
    return t;
}

/* Partial-JSON recovery: extract producten-array uit afgekapte output */
function recoverPartialJson(s: string): any | null {
    try {
        const t = cleanJson(s);
        const prodStart = t.indexOf('"producten"');
        if (prodStart < 0) return null;
        const bracketStart = t.indexOf('[', prodStart);
        if (bracketStart < 0) return null;
        const items: any[] = [];
        let i = bracketStart + 1;
        while (i < t.length) {
            while (i < t.length && /[\s,]/.test(t[i])) i++;
            if (i >= t.length || t[i] === ']') break;
            if (t[i] !== '{') { i++; continue; }
            let depth = 0;
            const objStart = i;
            let inStr = false;
            let escape = false;
            while (i < t.length) {
                const ch = t[i];
                if (escape) { escape = false; i++; continue; }
                if (ch === '\\' && inStr) { escape = true; i++; continue; }
                if (ch === '"') { inStr = !inStr; i++; continue; }
                if (inStr) { i++; continue; }
                if (ch === '{') depth++;
                else if (ch === '}') {
                    depth--;
                    if (depth === 0) {
                        i++;
                        try { items.push(JSON.parse(t.slice(objStart, i))); } catch { /* skip */ }
                        break;
                    }
                }
                i++;
            }
            if (depth !== 0) break;
        }
        let leverancier: string | null = null;
        const levMatch = t.match(/"leverancier"\s*:\s*"([^"]+)"/);
        if (levMatch) leverancier = levMatch[1];
        let datum: string | null = null;
        const datMatch = t.match(/"datum"\s*:\s*"([^"]+)"/);
        if (datMatch) datum = datMatch[1];
        return { leverancier, datum, producten: items };
    } catch { return null; }
}

async function callAnthropic(
    client: Anthropic,
    model: string,
    isHaikuOrSonnet: boolean,
    contentBlocks: Anthropic.Messages.ContentBlockParam[],
): Promise<{ parsed: any; content: string; truncated: boolean; usage: any; stopReason: string | null }> {
    const stream = client.messages.stream({
        model,
        max_tokens: 64000,
        system: [{ type: 'text', text: PRICELIST_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: contentBlocks }],
        ...(isHaikuOrSonnet ? { thinking: { type: 'disabled' as const } } : {}),
    } as any);
    const response = await stream.finalMessage();
    const textBlock = response.content.find(b => b.type === 'text');
    const content = (textBlock && textBlock.type === 'text') ? textBlock.text : '';
    const truncated = response.stop_reason === 'max_tokens';

    let parsed: any = null;
    const tries = [content, cleanJson(content)];
    const biggest = content.match(/\{[\s\S]*\}/);
    if (biggest) tries.push(biggest[0]);
    for (const candidate of tries) {
        try { parsed = JSON.parse(candidate); break; } catch { /* next */ }
    }
    if (!parsed) parsed = recoverPartialJson(content);

    return { parsed, content, truncated, usage: response.usage, stopReason: response.stop_reason };
}

async function runSingleCall(
    client: Anthropic, model: string, isHaikuOrSonnet: boolean,
    contentBlocks: Anthropic.Messages.ContentBlockParam[], t0: number,
): Promise<NextResponse> {
    try {
        const r = await callAnthropic(client, model, isHaikuOrSonnet, contentBlocks);
        if (!r.parsed) {
            const msg = r.truncated
                ? 'Output afgekapt bij ' + r.usage.output_tokens + ' tokens. Splits PDF in delen.'
                : 'AI gaf geen geldige JSON';
            return NextResponse.json({ error: msg, raw: r.content.slice(0, 500), stopReason: r.stopReason }, { status: 502 });
        }
        console.log(`[parse-pricelist] ${r.parsed.producten?.length || 0} producten · total=${Date.now() - t0}ms · tokens=${r.usage.input_tokens}in/${r.usage.output_tokens}out · stop=${r.stopReason}${r.truncated ? ' (RECOVERED)' : ''}`);
        return NextResponse.json({ success: true, data: r.parsed, elapsedMs: Date.now() - t0, usage: r.usage });
    } catch (e: any) {
        console.error('[parse-pricelist:single]', e?.status, e?.message, e);
        const detail = e?.error?.error?.message || e?.message || 'API-fout';
        return NextResponse.json({ error: detail, apiStatus: e?.status }, { status: e?.status || 500 });
    }
}

async function runChunkedTextCalls(
    client: Anthropic, model: string, isHaikuOrSonnet: boolean,
    fullText: string, t0: number,
): Promise<NextResponse> {
    const CHUNK_SIZE = 50_000; /* Kleinere chunks = meer output-ruimte + minder kans op missers */
    const chunks: string[] = [];
    /* Split op regel-grenzen om halverwege een product af te snijden te voorkomen */
    let pos = 0;
    while (pos < fullText.length) {
        let end = Math.min(pos + CHUNK_SIZE, fullText.length);
        if (end < fullText.length) {
            /* Zoek laatste newline/space terug vanaf end voor clean cut */
            const lastBreak = fullText.lastIndexOf('\n', end);
            if (lastBreak > pos + CHUNK_SIZE * 0.8) end = lastBreak;
        }
        chunks.push(fullText.slice(pos, end));
        pos = end;
    }

    const allProducten: any[] = [];
    let leverancier: string | null = null;
    let datum: string | null = null;
    let totalIn = 0, totalOut = 0;
    const errors: string[] = [];

    for (let i = 0; i < chunks.length; i++) {
        try {
            const blocks: Anthropic.Messages.ContentBlockParam[] = [
                { type: 'text', text: `Hieronder deel ${i + 1}/${chunks.length} van een groothandel-prijslijst. Extraheer ALLE producten:\n\n${chunks[i]}` },
                { type: 'text', text: 'Extraheer alle producten als JSON.' },
            ];
            const r = await callAnthropic(client, model, isHaikuOrSonnet, blocks);
            totalIn += r.usage?.input_tokens || 0;
            totalOut += r.usage?.output_tokens || 0;
            if (r.parsed?.producten) allProducten.push(...r.parsed.producten);
            if (!leverancier && r.parsed?.leverancier) leverancier = r.parsed.leverancier;
            if (!datum && r.parsed?.datum) datum = r.parsed.datum;
        } catch (e: any) {
            console.error(`[parse-pricelist:chunk ${i + 1}]`, e?.status, e?.message);
            errors.push(`Chunk ${i + 1}: ${e?.error?.error?.message || e?.message || 'fout'}`);
        }
    }

    if (allProducten.length === 0) {
        return NextResponse.json({ error: 'Geen producten geextract. Errors: ' + errors.join('; '), chunks: chunks.length }, { status: 502 });
    }

    console.log(`[parse-pricelist:chunked] ${allProducten.length} producten in ${chunks.length} chunks · total=${Date.now() - t0}ms · tokens=${totalIn}in/${totalOut}out${errors.length ? ` · ${errors.length} chunk-errors` : ''}`);
    return NextResponse.json({
        success: true,
        data: { leverancier, datum, producten: allProducten },
        elapsedMs: Date.now() - t0,
        usage: { input_tokens: totalIn, output_tokens: totalOut },
        chunks: chunks.length,
        chunkErrors: errors,
    });
}

export async function POST(req: NextRequest) {
    const t0 = Date.now();
    try {
        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY ontbreekt' }, { status: 500 });

        const body = await req.json();
        const { pdfBase64, pdfUrl, imageBase64, textContent, model: modelChoice } = body as {
            pdfBase64?: string;
            pdfUrl?: string;
            imageBase64?: string;
            textContent?: string;
            model?: 'haiku' | 'sonnet' | 'opus';
        };

        if (!pdfBase64 && !pdfUrl && !imageBase64 && !textContent) {
            return NextResponse.json({ error: 'Geen input meegegeven' }, { status: 400 });
        }

        const client = new Anthropic({ apiKey });
        const MODEL_MAP = {
            haiku: 'claude-haiku-4-5',
            sonnet: 'claude-sonnet-4-6',
            opus: 'claude-opus-4-7',
        } as const;
        const model = MODEL_MAP[modelChoice || 'haiku'] || MODEL_MAP.haiku;
        const isHaikuOrSonnet = model === MODEL_MAP.haiku || model === MODEL_MAP.sonnet;

        /* TEXT-MODE met auto-chunking voor grote PDFs.
           Kleinere chunks (60K) geven meer output-ruimte per call en minder
           kans dat Claude een subset pakt i.p.v. alles. */
        if (textContent && textContent.length > 100) {
            const MAX_SINGLE_CALL = 60_000;
            if (textContent.length <= MAX_SINGLE_CALL) {
                const contentBlocks: Anthropic.Messages.ContentBlockParam[] = [
                    { type: 'text', text: 'Hieronder de tekst van een groothandel-prijslijst. Extraheer ALLE producten:\n\n' + textContent },
                    { type: 'text', text: 'Extraheer alle producten als JSON.' },
                ];
                return await runSingleCall(client, model, isHaikuOrSonnet, contentBlocks, t0);
            }
            return await runChunkedTextCalls(client, model, isHaikuOrSonnet, textContent, t0);
        }

        /* VISION-MODE (via URL of base64) */
        const contentBlocks: Anthropic.Messages.ContentBlockParam[] = [];

        if (pdfUrl) {
            const r = await fetch(pdfUrl);
            if (!r.ok) return NextResponse.json({ error: 'Kon PDF niet downloaden (' + r.status + ')' }, { status: 502 });
            const arrayBuf = await r.arrayBuffer();
            const base64 = Buffer.from(arrayBuf).toString('base64');
            contentBlocks.push({
                type: 'document',
                source: { type: 'base64', media_type: 'application/pdf', data: base64 },
            } as any);
        } else if (pdfBase64) {
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
        return await runSingleCall(client, model, isHaikuOrSonnet, contentBlocks, t0);
    } catch (e: any) {
        console.error('[parse-pricelist:outer]', e?.status, e?.message, e);
        if (e instanceof Anthropic.RateLimitError) {
            return NextResponse.json({ error: 'Rate limit — wacht even' }, { status: 429 });
        }
        const detail = e?.error?.error?.message || e?.message || 'Onbekende fout';
        return NextResponse.json({ error: detail, apiStatus: e?.status }, { status: e?.status || 500 });
    }
}
