/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createServerSupabase } from '@/lib/supabase-server';
import { logAiUsageServer } from '@/lib/aiUsageServer';
import { estimateAiCostCents } from '@/lib/aiCost';
import { RGS_CATERING_CATEGORIES, PURCHASE_CODES, rgsLookup } from '@/lib/rgsCategories';

export const runtime = 'nodejs';
export const maxDuration = 20;

/**
 * POST /api/boekhouder/classify
 * ─────────────────────────────
 * Pillar #1 + #2 + #3 — RGS-aware AI-classify met catering-context.
 *
 * Body: { bon_ids: number[], dry_run?: boolean }
 * Voor elke bon: AI suggereert RGS-code + confidence + reasoning.
 * - confidence >= org.ai_classify_threshold → auto-accept
 * - confidence < threshold OR always_review code → twijfel-stapel
 *
 * Hard rules:
 * - BTW komt NIET uit AI. AI suggereert categorie, btw-default uit RGS-code,
 *   feitelijk btw-bedrag uit bon-foto (bestaande btw_laag/btw_hoog kolommen).
 * - Bonnen met locked_at IS NOT NULL worden geweigerd (immutable).
 */

const SYSTEM_PROMPT = `Je bent een NL-boekhoudkundige assistent voor een BBQ-catering eenmanszaak.
Je classificeert een aankoop-bon naar één RGS-MKB-code uit een vaste lijst.

REGELS:
- Kies EXACT één code uit de aangeleverde lijst. Niet verzinnen.
- Geef confidence 0.0-1.0. Lage confidence = bon is ambigu / context ontbreekt.
- Reasoning: max 1 zin in NL, voor de cateraar (niet voor accountant).
- BTW-percentage zit al in RGS-code, je hoeft het niet te bepalen.
- Als de bon onduidelijk is: kies WBedKostOv ("overige kosten") met lage confidence — niet gokken.

INVESTERINGSDREMPEL (Kleinschaligheidsinvesteringsaftrek 2026):
- Bonnen boven €450 voor duurzame bedrijfsmiddelen (smoker, koelcel, aanhanger, computers, gereedschap >€450) →
  kies WAfsInv ("Investering inventaris"). Boekhouder beslist of KIA-aftrek van toepassing is.
- Onder €450: WBedKlGer ("Klein gereedschap") of een andere kosten-code.
- Belangrijk: AI mag dit suggereren, boekhouder bepaalt de definitieve activatie + afschrijvingsduur.

OUTPUT FORMAT (strict JSON):
{"rgs_code": "WKprIng", "confidence": 0.92, "reasoning": "Slager-bon — vlees voor event."}

GEEN andere tekst, geen markdown, geen prefix. Alleen valid JSON.`;

interface ClassifyRequest {
  bon_ids: number[];
  dry_run?: boolean;
}

interface ClassifyResult {
  bon_id: number;
  status: 'auto_accepted' | 'twijfel' | 'error';
  rgs_code: string | null;
  confidence: number | null;
  reasoning: string | null;
  error?: string;
}

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return NextResponse.json({ error: 'Geen API key' }, { status: 500 });

    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

    const { data: memberships } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .limit(1);
    const orgId = memberships?.[0]?.organization_id;
    if (!orgId) return NextResponse.json({ error: 'Geen organisatie' }, { status: 403 });

    const body = await req.json() as ClassifyRequest;
    const ids = Array.isArray(body.bon_ids) ? body.bon_ids.filter(n => Number.isInteger(n)) : [];
    if (ids.length === 0) return NextResponse.json({ error: 'bon_ids verplicht' }, { status: 400 });
    if (ids.length > 20) return NextResponse.json({ error: 'Max 20 bonnen per call' }, { status: 400 });

    // Org-threshold ophalen
    const { data: orgRow } = await supabase
      .from('organizations')
      .select('ai_classify_threshold')
      .eq('id', orgId)
      .single();
    const threshold = Number(orgRow?.ai_classify_threshold) || 0.85;

    // Bonnen ophalen — RLS doet org-check, plus we filteren locked-bonnen uit
    const { data: bonnen } = await supabase
      .from('bonnen')
      .select(`
        id, datum, totaal_bedrag, netto_bedrag, btw_laag_bedrag, btw_hoog_bedrag,
        notities, categorie, raw_analysis, leverancier_id, event_id, locked_at,
        leverancier:leverancier_id (naam, type)
      `)
      .in('id', ids);

    const eligibleBonnen = (bonnen || []).filter((b: any) => !b.locked_at);
    if (eligibleBonnen.length === 0) {
      return NextResponse.json({ error: 'Geen geldige bonnen (mogelijk vergrendeld)' }, { status: 400 });
    }

    // Optionele event-context per bon (Pillar #2)
    const eventIds = Array.from(new Set(eligibleBonnen.map((b: any) => b.event_id).filter(Boolean)));
    let eventsById = new Map<number, any>();
    if (eventIds.length > 0) {
      const { data: events } = await supabase
        .from('events')
        .select('id, name, date, guests, type')
        .in('id', eventIds);
      (events || []).forEach((e: any) => eventsById.set(e.id, e));
    }

    // RGS-lijst als prompt-context — gecached door Anthropic prompt-cache
    const rgsList = PURCHASE_CODES.map(c => {
      const cat = rgsLookup(c)!;
      return `- ${cat.code}: ${cat.label} — ${cat.hint}`;
    }).join('\n');

    const client = new Anthropic({ apiKey });
    const results: ClassifyResult[] = [];

    // Per bon één call (parallel zou kunnen, maar 1-op-1 is veiliger qua rate-limiting)
    for (const bon of eligibleBonnen as any[]) {
      try {
        const event = bon.event_id ? eventsById.get(bon.event_id) : null;
        // Supabase types geven `leverancier` als array of object terug — normaliseer naar object
        const lev: { naam?: string; type?: string } = Array.isArray(bon.leverancier)
          ? (bon.leverancier[0] || {})
          : (bon.leverancier || {});

        const userMessage = `BON-DATA:
Leverancier: ${lev.naam || '(onbekend)'} ${lev.type ? `(type: ${lev.type})` : ''}
Datum: ${bon.datum || '(onbekend)'}
Totaal: €${Number(bon.totaal_bedrag) || 0} (BTW 9%: €${Number(bon.btw_laag_bedrag) || 0}, BTW 21%: €${Number(bon.btw_hoog_bedrag) || 0})
${event ? `Gekoppeld event: ${event.name} (${event.date}, ${event.guests} gasten, type: ${event.type})` : 'Geen event-koppeling — vermoedelijk vaste voorraad/algemene kost.'}
Bestaande categorie-label (legacy): ${bon.categorie || '(geen)'}
Notities: ${bon.notities || '(geen)'}

BESCHIKBARE RGS-CODES:
${rgsList}

Classificeer deze bon. Output: alleen JSON.`;

        const response = await client.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 200,
          system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
          messages: [{ role: 'user', content: userMessage }],
        });

        const textBlock = response.content.find((c: any) => c.type === 'text');
        const raw = textBlock && (textBlock as any).text ? (textBlock as any).text.trim() : '';
        const jsonText = raw.replace(/^```json\s*|\s*```$/g, '').trim();

        let parsed: { rgs_code?: string; confidence?: number; reasoning?: string };
        try {
          parsed = JSON.parse(jsonText);
        } catch {
          results.push({
            bon_id: bon.id,
            status: 'error',
            rgs_code: null,
            confidence: null,
            reasoning: null,
            error: 'AI-respons niet geldige JSON: ' + raw.substring(0, 100),
          });
          continue;
        }

        const code = parsed.rgs_code || '';
        const cat = rgsLookup(code);
        if (!cat) {
          results.push({
            bon_id: bon.id,
            status: 'error',
            rgs_code: null,
            confidence: null,
            reasoning: null,
            error: `Onbekende RGS-code: ${code}`,
          });
          continue;
        }

        const confidence = Math.max(0, Math.min(1, Number(parsed.confidence) || 0));
        // Twijfel-trigger: lage confidence OF always_review-flag op code
        const goToTwijfel = confidence < threshold || cat.always_review === true;
        const status: 'auto_accepted' | 'twijfel' = goToTwijfel ? 'twijfel' : 'auto_accepted';

        // Cost-tracking
        void logAiUsageServer({
          organization_id: orgId,
          user_id: user.id,
          action_type: 'other',
          model: 'claude-haiku-4-5',
          tokens_input: response.usage.input_tokens || 0,
          tokens_output: response.usage.output_tokens || 0,
          tokens_cache_read: response.usage.cache_read_input_tokens || 0,
          tokens_cache_creation: response.usage.cache_creation_input_tokens || 0,
          cost_eur_cents: estimateAiCostCents({
            model: 'claude-haiku-4-5',
            tokens_input: response.usage.input_tokens || 0,
            tokens_output: response.usage.output_tokens || 0,
            tokens_cache_read: response.usage.cache_read_input_tokens || 0,
            tokens_cache_creation: response.usage.cache_creation_input_tokens || 0,
          }),
        });

        results.push({
          bon_id: bon.id,
          status,
          rgs_code: code,
          confidence,
          reasoning: parsed.reasoning || null,
        });

        // Persist tenzij dry_run
        if (!body.dry_run) {
          await supabase
            .from('bonnen')
            .update({
              rgs_code: code,
              rgs_category_label: cat.label,
              ai_classify_status: status,
              ai_classify_confidence: confidence,
              ai_classify_reasoning: parsed.reasoning || null,
              classified_at: new Date().toISOString(),
              classified_by_user_id: user.id,
            })
            .eq('id', bon.id)
            .eq('organization_id', orgId);
        }
      } catch (err: any) {
        results.push({
          bon_id: bon.id,
          status: 'error',
          rgs_code: null,
          confidence: null,
          reasoning: null,
          error: err?.message || 'onbekende fout',
        });
      }
    }

    return NextResponse.json({
      threshold,
      processed: results.length,
      auto_accepted: results.filter(r => r.status === 'auto_accepted').length,
      twijfel: results.filter(r => r.status === 'twijfel').length,
      errors: results.filter(r => r.status === 'error').length,
      results,
    });
  } catch (err: any) {
    console.error('[boekhouder/classify]', err);
    return NextResponse.json({ error: err?.message || 'Onbekende fout' }, { status: 500 });
  }
}
