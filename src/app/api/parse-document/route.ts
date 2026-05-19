/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createServerSupabase } from '@/lib/supabase-server';
import { logAiUsageServer } from '@/lib/aiUsageServer';
import { estimateAiCostCents } from '@/lib/aiCost';
import { enforceAiCap } from '@/lib/aiCostCap';

export const runtime = 'nodejs';
export const maxDuration = 120;

const INVOICE_SYSTEM_PROMPT = `Lees Nederlandse leveranciersfactuur → retourneer alleen JSON.
Geen uitleg, geen markdown, geen denk-tekst. Direct JSON.

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

const RECEIPT_SYSTEM_PROMPT = `Lees Nederlandse kassabon → retourneer alleen JSON.
Geen uitleg, geen markdown. Direct JSON met dit schema:

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
        const { imageBase64, pdfBase64, imageUrl, type, model: modelChoice } = body as {
            model?: 'haiku' | 'sonnet' | 'opus';
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
        const userText = 'JSON.';

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

        // Model-keuze: Haiku default (2-3x sneller, goedkoper, prima voor structured extract).
        // Sonnet/Opus als gebruiker meer nauwkeurigheid wil bij slechte scans.
        const MODEL_MAP = {
            haiku: 'claude-haiku-4-5',
            sonnet: 'claude-sonnet-4-6',
            opus: 'claude-opus-4-7',
        } as const;
        const model = MODEL_MAP[modelChoice || 'haiku'] || MODEL_MAP.haiku;
        console.log(`[parse-document] calling ${model} type=${type} elapsed=${Date.now() - t0}ms`);

        // Resolve org for usage logging (fire-and-forget)
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
        } catch { /* logging optional */ }

        const isHaikuOrSonnet = model === MODEL_MAP.haiku || model === MODEL_MAP.sonnet;

        /* P0.40 — invoice-parse op Sonnet vision ≈ €0.04/call. Conservatief. */
        if (orgId) {
            const capRes = await enforceAiCap(orgId, type === 'invoice' ? 0.08 : 0.04);
            if (capRes) return capRes;
        }

        const stream = client.messages.stream({
            model,
            max_tokens: type === 'invoice' ? 16000 : 4000,
            system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
            messages: [{ role: 'user', content: contentBlocks }],
            ...(isHaikuOrSonnet ? { thinking: { type: 'disabled' as const } } : {}),
        } as any);
        const response = await stream.finalMessage();

        // Log AI-usage (fire-and-forget)
        if (orgId && response.usage) {
            const u = response.usage;
            logAiUsageServer({
                organization_id: orgId,
                user_id: userId,
                action_type: 'other',
                model,
                tokens_input: u.input_tokens,
                tokens_output: u.output_tokens,
                tokens_cache_read: u.cache_read_input_tokens ?? 0,
                tokens_cache_creation: u.cache_creation_input_tokens ?? 0,
                cost_eur_cents: estimateAiCostCents({
                    model,
                    tokens_input: u.input_tokens,
                    tokens_output: u.output_tokens,
                    tokens_cache_read: u.cache_read_input_tokens ?? 0,
                    tokens_cache_creation: u.cache_creation_input_tokens ?? 0,
                }),
                metadata: { action: 'parse-document', documentType: type },
            }).catch(function () { /* non-blocking */ });
        }

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
