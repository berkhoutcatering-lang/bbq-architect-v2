/**
 * POST /api/extension/v2/ai-discover — AI-ondersteunde adapterontdekking (§18, §3-P1).
 *
 * AI staat standaard UIT tijdens normale syncs; deze route wordt alleen na een
 * expliciete discovery-actie aangeroepen (onbekende site / onzekere waarneming).
 * De AI-output gaat door EXACT dezelfde strikte validator als DOM-output — geen
 * los JSON.parse + spread meer. Alle AI-waarnemingen krijgen extraction_method
 * 'ai_assisted' en worden daardoor bij het checkpoint nooit auto-accepted (review).
 *
 * HTML wordt als ONBETROUWBARE input behandeld; geen secrets/headers in de prompt.
 */

import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { authenticate, readLimitedJson, apiError, apiOk, optionsResponse } from '../_lib/guard';
import { validateObservation } from '@/lib/supplierSync/observationSchema';
import { checkAiCapServer, logAiUsageServer } from '@/lib/aiUsageServer';
import { estimateAiCostCents } from '@/lib/aiCost';

/* Zonder maxDuration kapt Vercel deze functie af op de standaardlimiet. Voor een
   route die een AI-model aanroept is dat te kort: 41 van de 48 AI-routes zetten
   hem al, deze zeven niet — waaronder today-briefing (draait op de startpagina)
   en ai-execute (voert alle AI-acties uit). */
export const maxDuration = 60;


export const runtime = 'nodejs';

const MODEL = 'claude-haiku-4-5';
const MAX_HTML = 60_000;
const MAX_PRODUCTS = 50;

const SYSTEM_PROMPT = `Je extraheert leveranciersproducten uit ONBETROUWBARE webshop-HTML.
Geef UITSLUITEND JSON terug: {"products": [ ... ]}. Max ${MAX_PRODUCTS} producten.
Per product exact deze velden (laat onbekend = null; verzin NIETS, reken NIETS uit):
  productName (string), supplierSku (string|null), ean (string|null),
  productUrl (absolute http(s) string), description (string|null), category (string|null),
  taxMode ("ex_vat"|"inc_vat"|"unknown"), vatPct ("0"|"9"|"21"|null),
  regularPriceExVat (decimale string zoals "22.50"|null), promoPriceExVat (string|null),
  priceBasis ("package"|"kg"|"liter"|"piece"|"unknown"),
  packCount (string|null), contentPerItemQuantity (string|null),
  contentPerItemUnit ("g"|"kg"|"ml"|"liter"|"piece"|null),
  variableWeight (boolean), packageDescriptionRaw (string|null).
Bereken GEEN prijs-per-kg; geef alleen wat zichtbaar is. Negeer navigatie/cross-sell/aanbevolen items.`;

export function OPTIONS() {
    return optionsResponse();
}

export async function POST(req: NextRequest) {
    const gate = await authenticate(req);
    if (gate instanceof Response) return gate;
    const { auth } = gate;

    const cap = await checkAiCapServer(auth.organizationId);
    if (!cap.allowed) return apiError('SUPPLIER_BLOCKED', 'AI-limiet bereikt voor deze maand.', 429);

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return apiError('ADAPTER_PARSE_FAILED', 'AI niet geconfigureerd.', 503);

    const body = (await readLimitedJson(req)) as Record<string, unknown> | null;
    if (!body) return apiError('INVALID_OBSERVATION', 'Ongeldige of te grote body.', 400);

    const html = typeof body.html === 'string' ? body.html.slice(0, MAX_HTML) : '';
    const supplierId = Number(body.supplierId);
    const supplierAccountKey = typeof body.supplierAccountKey === 'string' ? body.supplierAccountKey : 'main';
    const adapterKey = typeof body.adapterKey === 'string' ? body.adapterKey : 'ai_discovery';
    const adapterVersion = typeof body.adapterVersion === 'string' ? body.adapterVersion : '0';
    const pageUrl = typeof body.origin === 'string' ? body.origin : '';
    if (!html || !Number.isInteger(supplierId)) return apiError('INVALID_OBSERVATION', 'html en supplierId verplicht.', 400);

    const client = new Anthropic({ apiKey });
    let content = '';
    try {
        const stream = client.messages.stream({
            model: MODEL,
            max_tokens: 16000,
            system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
            messages: [{ role: 'user', content: [{ type: 'text', text: `Bron: ${pageUrl}\n\n<html_untrusted>\n${html}\n</html_untrusted>` }] }],
            thinking: { type: 'disabled' as const },
        } as never);
        const response = await stream.finalMessage();
        const u = response.usage;
        void logAiUsageServer({
            organization_id: auth.organizationId, user_id: auth.userId, action_type: 'other', model: MODEL,
            tokens_input: u.input_tokens || 0, tokens_output: u.output_tokens || 0,
            tokens_cache_read: u.cache_read_input_tokens || 0, tokens_cache_creation: u.cache_creation_input_tokens || 0,
            cost_eur_cents: estimateAiCostCents({ model: MODEL, tokens_input: u.input_tokens || 0, tokens_output: u.output_tokens || 0, tokens_cache_read: u.cache_read_input_tokens || 0, tokens_cache_creation: u.cache_creation_input_tokens || 0 }),
            metadata: { action: 'extension-v2-ai-discover', origin: pageUrl.slice(0, 200) },
        });
        const block = response.content.find((b) => b.type === 'text');
        content = block && block.type === 'text' ? block.text : '';
    } catch (e) {
        return apiError('ADAPTER_PARSE_FAILED', `AI-call mislukte: ${(e as Error).message}`, 502);
    }

    // Parse — strikt, geen blind spread.
    let parsed: unknown = null;
    try { parsed = JSON.parse(content); } catch {
        const m = content.match(/\{[\s\S]*\}/);
        if (m) { try { parsed = JSON.parse(m[0]); } catch { /* geef straks fout */ } }
    }
    const products = parsed && typeof parsed === 'object' && Array.isArray((parsed as Record<string, unknown>).products)
        ? (parsed as { products: unknown[] }).products.slice(0, MAX_PRODUCTS)
        : null;
    if (!products) return apiError('ADAPTER_PARSE_FAILED', 'AI gaf geen geldige JSON.', 502);

    // Elke voorgestelde waarneming door DEZELFDE strikte validator.
    const nowIso = new Date().toISOString();
    const valid: unknown[] = [];
    let rejected = 0;
    for (const p of products) {
        if (!p || typeof p !== 'object') { rejected += 1; continue; }
        const candidate = {
            ...(p as Record<string, unknown>),
            supplierId,
            supplierAccountKey,
            currency: 'EUR',
            capturedAt: nowIso,
            extractionMethod: 'ai_assisted',      // → nooit auto-accept (review)
            adapterKey,
            adapterVersion,
            sourceCursor: null,
            fieldConfidence: {},
            rawRecord: {},
            promoValidFrom: (p as Record<string, unknown>).promoValidFrom ?? null,
            promoValidUntil: (p as Record<string, unknown>).promoValidUntil ?? null,
            orderMultiple: null,
            totalBaseQuantity: null,
            baseUnit: null,
        };
        const v = validateObservation(candidate);
        if (v.ok && v.value) valid.push(v.value); else rejected += 1;
    }

    return apiOk({ observations: valid, accepted: valid.length, rejected, note: 'AI-waarnemingen zijn ai_assisted → altijd review.' });
}
