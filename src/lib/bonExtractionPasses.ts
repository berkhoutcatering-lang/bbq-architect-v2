/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Bon-extractie pass-orchestratie.
 *
 * Probleem dat dit oplost:
 *   - Sligro/Hanos-facturen worden in single-pass Haiku-vision soms slecht
 *     gelezen (multi-koloms layout, lange artnr's, subtotaal-regels).
 *   - We willen NIET altijd Sonnet/Opus inzetten (duur), maar WEL als
 *     Haiku faalt (lage confidence of reconciliation-mismatch).
 *
 * Ladder per mode:
 *   image          : Haiku 4.5 → Sonnet 4.6 → Opus 4.7
 *   pdf_text       : Haiku 4.5 text → Sonnet 4.6 document → Opus 4.7 document
 *   pdf_document   : Sonnet 4.6 document → Opus 4.7 document
 *   multi_image    : Sonnet 4.6 multi → Opus 4.7 multi
 *
 * Escalatie-trigger: shouldEscalate() in bonReconciliation.ts
 *
 * Hard-cap blokkering: pass-3 (Opus) wordt geskipped als checkAiCap zegt
 * hard_block — pass-2 mag wel (kost ~€0.02 vs Opus ~€0.10).
 */

import Anthropic from '@anthropic-ai/sdk';
import { estimateAiCostCents } from './aiCost';
import { logAiUsageServer } from './aiUsageServer';
import { normalizeBonItem, parseBonBtw } from './bonProcessing';
import { reconcileBon, shouldEscalate, type ReconciliationResult } from './bonReconciliation';
import { findSupplierHint } from './bonSupplierHints';
import type { BonItemRow } from '@/types';

/* ── Prompts ──────────────────────────────────────────────────────── */

const BASE_VISION_PROMPT = `Je bent een NL-boekhouding-extractie-assistent voor een BBQ-catering.
Lees de bijgevoegde bon/factuur en extract de gegevens in strict JSON (geen markdown, geen prose).

OUTPUT FORMAT:
{
  "leverancier": "Sligro" | null,
  "datum": "YYYY-MM-DD" | null,
  "totaal_bedrag": 234.50,
  "prices_include_btw": true | false,
  "items": [
    {
      "naam": "Pulled pork rauw",
      "aantal": 5.0,
      "eenheid": "kg" | "stuks" | "L" | "ml" | "g",
      "prijs_per_eenheid": 14.95,
      "totaal": 74.75,
      "btw_pct": 9 | 21 | 0
    }
  ],
  "confidence": 0.95
}

REGELS:
- Geen velden verzinnen. Niet leesbaar = null.
- BTW per regel — kijk naar BTW-kolom op de bon, NIET zelf berekenen.
- Items: alleen tastbare producten/diensten, geen subtotaal- of korting-regels.
- Datum: YYYY-MM-DD; als alleen "16-04-2026" zichtbaar → "2026-04-16".
- prices_include_btw: true op KASSABONNEN (Makro/Crisp/AH — bedrag inclusief BTW per regel).
  false op FACTUREN (Sligro/Hanos/Bidfood — bedrag exclusief BTW per regel, BTW staat apart onderaan).
  Controleer: als onderaan een blok staat met "BTW hoog %" + "BTW laag %" naast goederen-totalen,
  dan is dit een FACTUUR (false). Anders is het een kassabon (true).
- item.totaal = exact het bedrag uit de "bedrag/totaal"-kolom op de bon — NIET zelf incl-BTW maken.
- Bij onleesbaar of geen bon: { "error": "korte reden" }.

GEEN andere tekst, geen markdown.`;

const PDF_TEXT_PROMPT = `Je krijgt de ge-OCR'de tekst van een aankoop-bon/factuur (PDF).
Extract dezelfde JSON-structuur als bij vision-input. De tekst kan kolom-volgorde
verloren hebben — gebruik prijs-patronen ("€ 14,95") en eenheden ("kg", "st") om
items te reconstrueren.

${BASE_VISION_PROMPT}`;

const MULTI_IMAGE_INSTRUCTION = `Belangrijk: de volgende ${'{N}'} afbeeldingen tonen samen ÉÉN bon (volgorde top→bottom).
Combineer de regels uit alle afbeeldingen. Als er overlap is tussen 2 foto's
(dezelfde regel zichtbaar op 2 foto's), neem hem MAAR ÉÉN KEER mee.
Totaal_bedrag staat meestal op de LAATSTE foto.`;

/**
 * Bouw de system prompt met optionele supplier-hint.
 * supplierHint is server-controlled (uit findSupplierHint) — nooit user-input
 * direct in prompt, dat zou prompt-injection toelaten.
 */
function buildPrompt(base: string, supplierHintText?: string): string {
    if (!supplierHintText) return base;
    return `${base}\n\nLAYOUT-HINT:\n${supplierHintText}`;
}

/* ── Types ────────────────────────────────────────────────────────── */

export type ExtractionMode =
    | { kind: 'image'; mediaType: string; base64: string }
    | { kind: 'pdf_text'; text: string }
    | { kind: 'pdf_document'; base64: string }
    | { kind: 'multi_image'; images: Array<{ mediaType: string; base64: string }> };

export type ModelKey = 'claude-haiku-4-5' | 'claude-sonnet-4-6' | 'claude-opus-4-7';

export type PassEngine = 'haiku-vision' | 'haiku-text' | 'sonnet-vision' | 'sonnet-document' | 'opus-vision' | 'opus-document' | 'sonnet-multi' | 'opus-multi';

export interface PassResult {
    model: ModelKey;
    engine: PassEngine;
    confidence: number;
    items: BonItemRow[];
    leverancier: string | null;
    datum: string | null;
    totaal_bedrag: number | null;
    /** True = kassabon (regelbedragen incl-BTW); false = factuur (regelbedragen ex-BTW). */
    prices_include_btw: boolean;
    raw_text: string;
    reconciliation: ReconciliationResult;
    cost_eur_cents: number;
    duration_ms: number;
    error: string | null;
    /** Anthropic token usage — voor cost-attribution. */
    usage: {
        input: number;
        output: number;
        cache_read: number;
        cache_creation: number;
    };
}

export interface LadderInput {
    client: Anthropic;
    mode: ExtractionMode;
    /** Tier-status van checkAiCap. Bij hard_block → geen Opus pass-3. */
    cap_status: 'ok' | 'soft_warn' | 'hard_block';
    /** Tenant + user voor ai_usage logging. */
    organization_id: string;
    user_id: string;
    /** Optionele leverancier-hint uit eerdere pass (anders inferred from pass-1). */
    initial_supplier_hint?: string | null;
    /** Forceer max-pass — UI kan "Probeer opnieuw met krachtigere AI" triggeren door deze op 'opus' te zetten. */
    force_model?: ModelKey;
}

export interface LadderResult {
    final: PassResult;
    passes: PassResult[];
    /** Som van cost over alle gedraaide passes. */
    total_cost_eur_cents: number;
}

/* ── JSON-parser (resilient) ───────────────────────────────────────── */

function parseAiJson(raw: string): any {
    const cleaned = raw.replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
    try {
        return JSON.parse(cleaned);
    } catch {
        const m = cleaned.match(/\{[\s\S]*\}/);
        if (m) {
            try { return JSON.parse(m[0]); } catch { /* fall through */ }
        }
        return null;
    }
}

/* ── Single-pass extractie ─────────────────────────────────────────── */

interface RunPassArgs {
    client: Anthropic;
    model: ModelKey;
    engine: PassEngine;
    mode: ExtractionMode;
    supplierHintText?: string;
    organization_id: string;
    user_id: string;
}

async function runSinglePass(args: RunPassArgs): Promise<PassResult> {
    const t0 = Date.now();
    const usage = { input: 0, output: 0, cache_read: 0, cache_creation: 0 };
    let raw_text = '';
    let error: string | null = null;

    try {
        if (args.mode.kind === 'pdf_text') {
            const r = await args.client.messages.create({
                model: args.model,
                max_tokens: 4000,
                system: [{ type: 'text', text: buildPrompt(PDF_TEXT_PROMPT, args.supplierHintText), cache_control: { type: 'ephemeral' } }],
                messages: [{
                    role: 'user',
                    content: [{
                        type: 'text',
                        text: 'PDF-text:\n<document>\n' + args.mode.text.slice(0, 60_000) + '\n</document>',
                    }],
                }],
            });
            usage.input = r.usage.input_tokens || 0;
            usage.output = r.usage.output_tokens || 0;
            usage.cache_read = r.usage.cache_read_input_tokens || 0;
            usage.cache_creation = r.usage.cache_creation_input_tokens || 0;
            raw_text = (r.content.find((c: any) => c.type === 'text') as any)?.text ?? '';
        } else if (args.mode.kind === 'pdf_document') {
            const r = await args.client.messages.create({
                model: args.model,
                max_tokens: 4000,
                system: [{ type: 'text', text: buildPrompt(BASE_VISION_PROMPT, args.supplierHintText), cache_control: { type: 'ephemeral' } }],
                messages: [{
                    role: 'user',
                    content: [
                        {
                            type: 'document',
                            source: { type: 'base64', media_type: 'application/pdf' as any, data: args.mode.base64 },
                            citations: { enabled: true },
                        } as any,
                        { type: 'text', text: 'Extract deze bon.' },
                    ],
                }],
            });
            usage.input = r.usage.input_tokens || 0;
            usage.output = r.usage.output_tokens || 0;
            usage.cache_read = r.usage.cache_read_input_tokens || 0;
            usage.cache_creation = r.usage.cache_creation_input_tokens || 0;
            raw_text = (r.content.find((c: any) => c.type === 'text') as any)?.text ?? '';
        } else if (args.mode.kind === 'image') {
            const r = await args.client.messages.create({
                model: args.model,
                max_tokens: 4000,
                system: [{ type: 'text', text: buildPrompt(BASE_VISION_PROMPT, args.supplierHintText), cache_control: { type: 'ephemeral' } }],
                messages: [{
                    role: 'user',
                    content: [
                        { type: 'image', source: { type: 'base64', media_type: args.mode.mediaType as any, data: args.mode.base64 } },
                        { type: 'text', text: 'Extract deze bon.' },
                    ],
                }],
            });
            usage.input = r.usage.input_tokens || 0;
            usage.output = r.usage.output_tokens || 0;
            usage.cache_read = r.usage.cache_read_input_tokens || 0;
            usage.cache_creation = r.usage.cache_creation_input_tokens || 0;
            raw_text = (r.content.find((c: any) => c.type === 'text') as any)?.text ?? '';
        } else {
            // multi_image — N images, één bon
            const N = args.mode.images.length;
            const instruction = MULTI_IMAGE_INSTRUCTION.replace('{N}', String(N));
            const content: any[] = args.mode.images.map(img => ({
                type: 'image',
                source: { type: 'base64', media_type: img.mediaType, data: img.base64 },
            }));
            content.push({ type: 'text', text: instruction + '\n\nExtract deze bon (gecombineerd uit alle foto\'s).' });
            const r = await args.client.messages.create({
                model: args.model,
                max_tokens: 5000,
                system: [{ type: 'text', text: buildPrompt(BASE_VISION_PROMPT, args.supplierHintText), cache_control: { type: 'ephemeral' } }],
                messages: [{ role: 'user', content }],
            });
            usage.input = r.usage.input_tokens || 0;
            usage.output = r.usage.output_tokens || 0;
            usage.cache_read = r.usage.cache_read_input_tokens || 0;
            usage.cache_creation = r.usage.cache_creation_input_tokens || 0;
            raw_text = (r.content.find((c: any) => c.type === 'text') as any)?.text ?? '';
        }
    } catch (e) {
        error = e instanceof Error ? e.message : 'unknown_anthropic_error';
    }

    const duration_ms = Date.now() - t0;
    const cost_eur_cents = estimateAiCostCents({
        model: args.model,
        tokens_input: usage.input,
        tokens_output: usage.output,
        tokens_cache_read: usage.cache_read,
        tokens_cache_creation: usage.cache_creation,
    });

    /* Async fire-and-forget logging — pass-by-pass cost-attribution. */
    void logAiUsageServer({
        organization_id: args.organization_id,
        user_id: args.user_id,
        action_type: 'other',
        model: args.model,
        tokens_input: usage.input,
        tokens_output: usage.output,
        tokens_cache_read: usage.cache_read,
        tokens_cache_creation: usage.cache_creation,
        cost_eur_cents,
        metadata: { route: 'bonnen-extract', engine: args.engine },
    });

    /* Parse JSON + reconcile */
    const parsed = parseAiJson(raw_text);
    let items: BonItemRow[] = [];
    let leverancier: string | null = null;
    let datum: string | null = null;
    let totaal_bedrag: number | null = null;
    let confidence = 0;
    /* Default: kassabonnen (incl-BTW). AI moet false zetten voor facturen. */
    let prices_include_btw = true;

    if (parsed && !parsed.error) {
        const rawItems = Array.isArray(parsed.items) ? parsed.items : [];
        items = rawItems
            .map((it: any) => normalizeBonItem({
                naam: it.naam,
                aantal: it.aantal,
                eenheid: it.eenheid,
                prijs: it.prijs_per_eenheid ?? it.prijs,
                totaal: it.totaal,
                btw_pct: it.btw_pct,
            }))
            .filter((x: BonItemRow | null): x is BonItemRow => x != null);

        leverancier = typeof parsed.leverancier === 'string' ? parsed.leverancier.trim() : null;
        datum = typeof parsed.datum === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.datum) ? parsed.datum : null;
        totaal_bedrag = typeof parsed.totaal_bedrag === 'number' && parsed.totaal_bedrag > 0 ? parsed.totaal_bedrag : null;
        confidence = typeof parsed.confidence === 'number' && parsed.confidence >= 0 && parsed.confidence <= 1 ? parsed.confidence : 0.7;
        if (typeof parsed.prices_include_btw === 'boolean') {
            prices_include_btw = parsed.prices_include_btw;
        }
    } else if (parsed?.error) {
        error = error ?? String(parsed.error);
    } else if (!error) {
        error = 'extract_failed_json';
    }

    /* Reconcile — vergelijk Σ items met totaal_bedrag.
       Bij factuur (Sligro/Hanos): prices_include_btw=false → reconcileBon weet
       dat items ex-BTW zijn en past Σ aan. */
    const reconciliation = reconcileBon(items, totaal_bedrag, prices_include_btw);

    /* Stem confidence af op reconciliation — als items €5 mismatchen, is de
       AI-confidence-zelfrapportage minder waard. */
    let effectiveConfidence = confidence;
    if (reconciliation.status === 'mismatch') effectiveConfidence = Math.min(confidence, 0.6);
    if (reconciliation.status === 'minor_drift') effectiveConfidence = Math.min(confidence, 0.85);
    if (items.length === 0) effectiveConfidence = 0;

    return {
        model: args.model,
        engine: args.engine,
        confidence: effectiveConfidence,
        items,
        leverancier,
        datum,
        totaal_bedrag,
        prices_include_btw,
        raw_text,
        reconciliation,
        cost_eur_cents,
        duration_ms,
        error,
        usage,
    };
}

/* ── Ladder-orkestratie ────────────────────────────────────────────── */

/**
 * Kies pass-1 model op basis van mode.
 *   - image, pdf_text → Haiku 4.5 (snel, goedkoop)
 *   - pdf_document    → Sonnet 4.6 (Haiku kan geen documents)
 *   - multi_image     → Sonnet 4.6 (Haiku doet multi-image slecht)
 */
function firstPassConfig(mode: ExtractionMode): { model: ModelKey; engine: PassEngine } {
    switch (mode.kind) {
        case 'image': return { model: 'claude-haiku-4-5', engine: 'haiku-vision' };
        case 'pdf_text': return { model: 'claude-haiku-4-5', engine: 'haiku-text' };
        case 'pdf_document': return { model: 'claude-sonnet-4-6', engine: 'sonnet-document' };
        case 'multi_image': return { model: 'claude-sonnet-4-6', engine: 'sonnet-multi' };
    }
}

/**
 * Kies pass-2 model: één treetje omhoog van pass-1.
 *   - Haiku → Sonnet
 *   - Sonnet → Opus
 *   - Opus → al hoogste, stop
 */
function secondPassConfig(mode: ExtractionMode, pass1Model: ModelKey): { model: ModelKey; engine: PassEngine } | null {
    if (pass1Model === 'claude-opus-4-7') return null;

    if (pass1Model === 'claude-haiku-4-5') {
        // Haiku pass-1 → Sonnet voor pass-2. Engine hangt af van mode.
        if (mode.kind === 'pdf_text') return { model: 'claude-sonnet-4-6', engine: 'sonnet-document' };
        if (mode.kind === 'image') return { model: 'claude-sonnet-4-6', engine: 'sonnet-vision' };
        // multi_image en pdf_document beginnen al bij Sonnet
        return null;
    }

    if (pass1Model === 'claude-sonnet-4-6') {
        // Sonnet pass-1 → Opus voor pass-2.
        if (mode.kind === 'pdf_document') return { model: 'claude-opus-4-7', engine: 'opus-document' };
        if (mode.kind === 'multi_image') return { model: 'claude-opus-4-7', engine: 'opus-multi' };
        if (mode.kind === 'image') return { model: 'claude-opus-4-7', engine: 'opus-vision' };
        if (mode.kind === 'pdf_text') return { model: 'claude-opus-4-7', engine: 'opus-document' };
    }

    return null;
}

/**
 * Voor sonnet-pass-2 die pdf_document werd in plaats van pdf_text:
 * we hebben de base64 nodig — niet alleen de text. De caller zorgt dat
 * `mode` updated wordt naar pdf_document indien Sonnet/Opus moet kijken.
 */
function escalateModeForVision(mode: ExtractionMode, fallback_pdf_base64?: string): ExtractionMode {
    if (mode.kind === 'pdf_text' && fallback_pdf_base64) {
        return { kind: 'pdf_document', base64: fallback_pdf_base64 };
    }
    return mode;
}

/**
 * Run de extractie-ladder tot we een goed-genoeg resultaat hebben of
 * de top van de ladder bereiken.
 */
export async function runBonExtractionLadder(
    input: LadderInput & { pdf_base64_for_vision_fallback?: string },
): Promise<LadderResult> {
    const passes: PassResult[] = [];

    // Pass 1
    const p1cfg = firstPassConfig(input.mode);
    const supplierHintText0 = input.initial_supplier_hint ?? undefined;

    const pass1 = await runSinglePass({
        client: input.client,
        model: input.force_model ?? p1cfg.model,
        engine: input.force_model ? mapEngine(input.mode, input.force_model) : p1cfg.engine,
        mode: input.mode,
        supplierHintText: supplierHintText0,
        organization_id: input.organization_id,
        user_id: input.user_id,
    });
    passes.push(pass1);

    /* Detecteer supplier voor evt. pass-2 hint (uit pass-1 output). */
    const detectedSupplier = pass1.leverancier ? findSupplierHint(pass1.leverancier) : null;
    const supplierHintTextForRetry = detectedSupplier?.hint ?? supplierHintText0;

    /* Stop-condities pass-1: */
    if (input.force_model) {
        return { final: pass1, passes, total_cost_eur_cents: pass1.cost_eur_cents };
    }
    if (!shouldEscalate(pass1.confidence, pass1.items.length, pass1.reconciliation)) {
        return { final: pass1, passes, total_cost_eur_cents: pass1.cost_eur_cents };
    }

    // Pass 2
    const p2cfg = secondPassConfig(input.mode, pass1.model);
    if (!p2cfg) {
        return { final: pass1, passes, total_cost_eur_cents: pass1.cost_eur_cents };
    }

    const p2Mode = p2cfg.engine.includes('document') || p2cfg.engine.includes('vision') || p2cfg.engine.includes('multi')
        ? escalateModeForVision(input.mode, input.pdf_base64_for_vision_fallback)
        : input.mode;

    const pass2 = await runSinglePass({
        client: input.client,
        model: p2cfg.model,
        engine: p2cfg.engine,
        mode: p2Mode,
        supplierHintText: supplierHintTextForRetry,
        organization_id: input.organization_id,
        user_id: input.user_id,
    });
    passes.push(pass2);

    const cost2 = pass1.cost_eur_cents + pass2.cost_eur_cents;

    /* Stop-condities pass-2: */
    if (!shouldEscalate(pass2.confidence, pass2.items.length, pass2.reconciliation)) {
        return { final: pass2, passes, total_cost_eur_cents: cost2 };
    }

    /* Hard-cap blokkeert pass-3 (Opus is duur ~€0.10). */
    if (input.cap_status === 'hard_block') {
        return { final: pickBetter(pass1, pass2), passes, total_cost_eur_cents: cost2 };
    }

    // Pass 3 — Opus 4.7 (alleen als ladder dat toestaat)
    const p3cfg = secondPassConfig(input.mode, pass2.model);
    if (!p3cfg) {
        return { final: pickBetter(pass1, pass2), passes, total_cost_eur_cents: cost2 };
    }
    const p3Mode = escalateModeForVision(input.mode, input.pdf_base64_for_vision_fallback);

    const pass3 = await runSinglePass({
        client: input.client,
        model: p3cfg.model,
        engine: p3cfg.engine,
        mode: p3Mode,
        supplierHintText: supplierHintTextForRetry,
        organization_id: input.organization_id,
        user_id: input.user_id,
    });
    passes.push(pass3);

    const cost3 = cost2 + pass3.cost_eur_cents;

    return {
        final: pickBetter(pickBetter(pass1, pass2), pass3),
        passes,
        total_cost_eur_cents: cost3,
    };
}

/**
 * Kies de beste pass voor "final" als geen enkele pass schoon door reconciliatie kwam.
 * Priorities: lowest reconciliation mismatch → highest confidence → most items.
 */
function pickBetter(a: PassResult, b: PassResult): PassResult {
    /* Een pass met 'ok' reconciliation wint altijd. */
    if (a.reconciliation.status === 'ok' && b.reconciliation.status !== 'ok') return a;
    if (b.reconciliation.status === 'ok' && a.reconciliation.status !== 'ok') return b;

    /* Anders: minder mismatch wint. */
    if (a.reconciliation.mismatch_eur < b.reconciliation.mismatch_eur - 0.10) return a;
    if (b.reconciliation.mismatch_eur < a.reconciliation.mismatch_eur - 0.10) return b;

    /* Bij gelijke mismatch: hogere confidence wint. */
    if (a.confidence > b.confidence) return a;
    if (b.confidence > a.confidence) return b;

    /* Anders: meer items wint (minder gemist). */
    return a.items.length >= b.items.length ? a : b;
}

/* Engine-mapping voor force_model (UI "Probeer met krachtigere AI"). */
function mapEngine(mode: ExtractionMode, model: ModelKey): PassEngine {
    if (mode.kind === 'pdf_text') {
        return model === 'claude-haiku-4-5' ? 'haiku-text' : (model === 'claude-sonnet-4-6' ? 'sonnet-document' : 'opus-document');
    }
    if (mode.kind === 'pdf_document') {
        return model === 'claude-sonnet-4-6' ? 'sonnet-document' : 'opus-document';
    }
    if (mode.kind === 'multi_image') {
        return model === 'claude-sonnet-4-6' ? 'sonnet-multi' : 'opus-multi';
    }
    return model === 'claude-haiku-4-5' ? 'haiku-vision' : (model === 'claude-sonnet-4-6' ? 'sonnet-vision' : 'opus-vision');
}

/* Helper: bereken BTW + finale total uit final pass (route gebruikt dit). */
export function summarizeFinalPass(pass: PassResult): {
    netto_bedrag: number;
    btw_laag_bedrag: number;
    btw_hoog_bedrag: number;
    totaal_bedrag: number;
} {
    const btw = parseBonBtw(pass.items, pass.prices_include_btw);
    const totaal_bedrag = pass.totaal_bedrag ?? btw.bruto_bedrag;
    return {
        netto_bedrag: btw.netto_bedrag,
        btw_laag_bedrag: btw.btw_laag_bedrag,
        btw_hoog_bedrag: btw.btw_hoog_bedrag,
        totaal_bedrag: Math.round(totaal_bedrag * 100) / 100,
    };
}
