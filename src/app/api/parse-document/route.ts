/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

export const runtime = 'nodejs';
export const maxDuration = 120;

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
      "prijs_per_eenheid": number (werkelijk betaalde prijs per eenheid — dus INCL bulk/actie korting),
      "prijs_normaal": number of null (reguliere stuksprijs ZONDER bulkkorting — alleen vullen als op de factuur zichtbaar is dat er korting geldt, anders null),
      "korting_type": "bulk" | "actie" | "staffel" | null (type korting; "bulk"/"staffel" bij staffelkorting zoals 3 voor €5,09 ipv €5,99; "actie" bij tijdelijke aanbieding; null als geen korting),
      "korting_bedrag": number of null (totale korting op deze regel in euro's, excl BTW),
      "btw_pct": number (meestal 9 of 21),
      "subtotaal": number (werkelijk regelsubtotaal excl BTW na korting),
      "categorie": "string (Vlees/Vis/Groenten/Zuivel/Kruiden/Sauzen/Dranken/Brood/Hout/Verpakking/Overig)"
    }
  ]
}

Regels:
- Alle bedragen EXCL BTW tenzij anders aangegeven
- BELANGRIJK — BTW: geef ALTIJD het werkelijke percentage (9 of 21). Nederlandse facturen gebruiken soms codes: "1" of "L" = 9% (laag), "2" of "H" = 21% (hoog). Vertaal deze codes naar het percentage. Geef NOOIT 1, 2 of 0 als btw_pct — altijd 9 of 21 (of 0 als 0% BTW). Bij twijfel is 21% standaard.
- BELANGRIJK — bulkkorting bij Makro/Sligro: veel facturen tonen "1 stuks €5,99" én "staffelprijs €5,09 per 3". Vul in dat geval prijs_per_eenheid=5.09, prijs_normaal=5.99, korting_type="bulk", korting_bedrag=(verschil × hoeveelheid)
- Als er geen zichtbare korting is: zet prijs_normaal, korting_type en korting_bedrag op null
- Categoriseer producten logisch voor BBQ/catering context
- Bij onzekerheid: geef je beste inschatting — niet null laten behalve waar expliciet toegestaan
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

        // Sonnet 4.6 voor beide types — hoge betrouwbaarheid voor PDFs en foto's.
        // Bij jouw volume (~30-50 scans/maand) kost dit ~€0,10-0,15/maand terwijl
        // de slechte-scan-fouten van Haiku wegvallen.
        const model = 'claude-sonnet-4-6';
        console.log(`[parse-document] calling ${model} type=${type} elapsed=${Date.now() - t0}ms`);

        // Streaming voorkomt timeouts bij lange facturen; .finalMessage() geeft de volledige response terug
        const stream = client.messages.stream({
            model,
            max_tokens: 16000,
            system: systemPrompt,
            messages: [{ role: 'user', content: contentBlocks }],
        });
        const response = await stream.finalMessage();

        // Extract text content from response
        const textBlock = response.content.find(b => b.type === 'text');
        if (!textBlock || textBlock.type !== 'text') {
            return NextResponse.json({ error: 'Claude gaf geen tekst antwoord' }, { status: 502 });
        }
        const content = textBlock.text;
        const stopReason = response.stop_reason;
        const truncated = stopReason === 'max_tokens';

        // Strip common wrappers: ```json ... ```, ``` ... ```, leading/trailing prose
        function cleanJson(s: string): string {
            let t = s.trim();
            // Markdown fences (```json\n...\n``` or ```\n...\n```)
            const fence = t.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
            if (fence) t = fence[1].trim();
            return t;
        }

        let parsed: any = null;
        const tries: string[] = [
            content,
            cleanJson(content),
        ];
        // Last-resort: extract biggest {...} block
        const biggest = content.match(/\{[\s\S]*\}/);
        if (biggest) tries.push(biggest[0]);

        for (const candidate of tries) {
            try { parsed = JSON.parse(candidate); break; } catch { /* try next */ }
        }

        if (!parsed) {
            console.error(`[parse-document] JSON parse failed stop=${stopReason} len=${content.length}`);
            return NextResponse.json({
                error: truncated
                    ? 'Factuur te lang — AI werd afgekapt. Probeer een kleinere factuur of splits in meerdere pagina\'s.'
                    : 'AI antwoord was geen geldige JSON — probeer opnieuw of gebruik een duidelijkere scan',
                raw: content.slice(0, 800),
                stopReason,
            }, { status: 502 });
        }

        // Safety net: Nederlandse facturen gebruiken soms BTW-codes (1/L = 9%, 2/H = 21%).
        // Normaliseer hier voor het geval AI deze codes toch overneemt.
        function normalizeBtw(val: any): number {
            const n = parseFloat(val);
            if (isNaN(n)) return 21;
            if (n === 1) return 9;   // code 1 = laag tarief
            if (n === 2) return 21;  // code 2 = hoog tarief
            if (n <= 3) return 21;   // onwaarschijnlijk laag → normaliseer naar hoog
            return n;
        }
        if (parsed && Array.isArray(parsed.regels)) {
            parsed.regels = parsed.regels.map((r: any) => ({
                ...r,
                btw_pct: normalizeBtw(r.btw_pct),
            }));
        }
        if (parsed && typeof parsed.btw_pct !== 'undefined') {
            parsed.btw_pct = normalizeBtw(parsed.btw_pct);
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
