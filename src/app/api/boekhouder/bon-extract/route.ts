/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createServerSupabase } from '@/lib/supabase-server';
import { logAiUsageServer } from '@/lib/aiUsageServer';
import { estimateAiCostCents } from '@/lib/aiCost';
import { matchInventory } from '@/lib/inventoryDeduction';
import { PURCHASE_CODES, rgsLookup } from '@/lib/rgsCategories';

export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * POST /api/boekhouder/bon-extract
 * ────────────────────────────────
 * Cross-hub vision-extract: leest een bon-foto en levert preview data terug
 * met (a) RGS-classify + (b) voorraad-suggesties per regel.
 *
 * Vraag van Sam: "factuur toevoegen, AI leest 'hey dit is ook voor voorraad
 * bedoeld, zal ik dat toevoegen?'"
 *
 * Flow:
 *  1. Vision-call op Haiku 4.5 met image_data_url + system-prompt
 *  2. Parse JSON-response naar gestructureerde bon-data
 *  3. Per item: matchInventory() — fuzzy-naam-match op org inventory
 *  4. Voor de hele bon: classify naar RGS-code (regel-niveau, niet per-item)
 *  5. Return: preview + voorraad-suggesties (geen DB-writes)
 *
 * Geen writes — alleen extract + suggest. Commit is een aparte endpoint.
 *
 * Hard rules:
 *  - BTW-bedrag uit bon-foto direct, niet AI-derived rate-mapping.
 *  - RGS-code uit constants, niet AI-verzonnen.
 *  - User-input (image) gedelimiteerd in prompt, geen prompt-injection-vector.
 */

const SYSTEM_PROMPT = `Je bent een NL-boekhouding-extractie-assistent voor een BBQ-catering.
Lees de bijgevoegde foto/PDF van een aankoop-bon of factuur. Extract de gegevens
gestructureerd in JSON. Wees nauwkeurig — geen velden verzinnen.

OUTPUT FORMAT (strict JSON, geen markdown):
{
  "leverancier": "Sligro" | null,
  "datum": "YYYY-MM-DD" | null,
  "totaal_bedrag": 234.50,
  "btw_laag_bedrag": 12.30,       // BTW 9% bedrag (food)
  "btw_hoog_bedrag": 5.20,        // BTW 21% bedrag (overig)
  "netto_bedrag": 217.00,
  "items": [
    {
      "naam": "Pulled pork rauw",   // zoals op de bon staat
      "aantal": 5.0,
      "eenheid": "kg" | "stuks" | "L" | "ml" | "g",
      "prijs_per_eenheid": 14.95,
      "totaal": 74.75,
      "btw_pct": 9 | 21
    }
  ],
  "rgs_suggestie": "WKprIng"      // één code uit aangeleverde lijst
}

REGELS:
- Geen velden verzinnen. Niet leesbaar = null.
- BTW-bedragen LETTERLIJK overnemen, niet zelf berekenen.
- Eén RGS-code voor de hele bon (de dominante categorie).
- Items: alleen tastbare producten/diensten, geen subtotaal-regels.
- Als bon niet leesbaar of geen bon: { "error": "korte reden" }.

GEEN andere tekst, geen markdown, geen prefix.`;

interface ExtractRequest {
  image_data_url: string;
  datum_hint?: string;        // YYYY-MM-DD — optioneel als gebruiker zelf datum invult
  leverancier_id?: number;    // optioneel: forceer leverancier
}

interface ExtractedItem {
  naam: string;
  aantal: number;
  eenheid: string;
  prijs_per_eenheid: number;
  totaal: number;
  btw_pct: number;
}

interface MatchedSuggestion extends ExtractedItem {
  inventory_id: number | null;
  inventory_naam: string | null;
  match_confidence: 'high' | 'medium' | 'low' | 'none';
  // Naar voorraad-unit geconverteerde hoeveelheid
  qty_in_inventory_unit: number;
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

    const body = await req.json() as ExtractRequest;
    if (!body.image_data_url || !body.image_data_url.startsWith('data:image/')) {
      return NextResponse.json({ error: 'Geldige foto (data URL) verplicht' }, { status: 400 });
    }
    if (body.image_data_url.length > 14_000_000) {
      return NextResponse.json({ error: 'Foto te groot (>10MB)' }, { status: 413 });
    }

    // Inventory ophalen voor matching
    const { data: inventory } = await supabase
      .from('inventory')
      .select('id, naam, current_stock, unit, last_price_eur, purchase_price, leverancier_id')
      .eq('organization_id', orgId);
    const invRows = (inventory || []).map((i: any) => ({
      id: i.id,
      naam: i.naam,
      current_stock: i.current_stock,
      unit: i.unit,
    }));

    // RGS-lijst beknopt — prompt-cache friendly
    const rgsList = PURCHASE_CODES.map(c => {
      const cat = rgsLookup(c)!;
      return `${cat.code}: ${cat.label}`;
    }).join(' | ');

    const client = new Anthropic({ apiKey });
    const mediaTypeMatch = /^data:([^;]+);base64,/i.exec(body.image_data_url);
    const mediaType = mediaTypeMatch?.[1] || 'image/jpeg';
    const base64Data = body.image_data_url.replace(/^data:[^;]+;base64,/i, '');

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1500,
      system: [{
        type: 'text',
        text: SYSTEM_PROMPT + '\n\nRGS-CODES:\n' + rgsList,
        cache_control: { type: 'ephemeral' },
      }],
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType as any, data: base64Data } },
          { type: 'text', text: 'Extract deze bon.' },
        ],
      }],
    });

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

    const textBlock = response.content.find((c: any) => c.type === 'text');
    const raw = textBlock && (textBlock as any).text ? (textBlock as any).text.trim() : '';
    const cleaned = raw.replace(/^```json\s*|\s*```$/g, '').trim();

    let parsed: any;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return NextResponse.json({
        error: 'AI-respons niet geldige JSON',
        raw: raw.substring(0, 300),
      }, { status: 500 });
    }
    if (parsed.error) {
      return NextResponse.json({ error: parsed.error, ai_reasoning: true }, { status: 422 });
    }

    // Per item: voorraad-suggestie
    const items: ExtractedItem[] = Array.isArray(parsed.items) ? parsed.items : [];
    const suggestions: MatchedSuggestion[] = items.map((it) => {
      if (!it.naam) return null;
      const matched = matchInventory(it.naam, invRows);
      let confidence: MatchedSuggestion['match_confidence'] = 'none';
      if (matched) {
        const target = String(it.naam).toLowerCase().trim();
        const m = String(matched.naam).toLowerCase().trim();
        if (target === m) confidence = 'high';
        else if (target.includes(m) || m.includes(target)) confidence = 'medium';
        else confidence = 'low';
      }
      // Unit-conversie naar inventory-unit (g→kg, ml→L)
      let qtyConverted = Number(it.aantal) || 0;
      if (matched) {
        if (it.eenheid === 'g' && matched.unit === 'kg') qtyConverted = qtyConverted / 1000;
        if (it.eenheid === 'ml' && matched.unit === 'L') qtyConverted = qtyConverted / 1000;
      }
      return {
        naam: it.naam,
        aantal: Number(it.aantal) || 0,
        eenheid: it.eenheid || 'stuks',
        prijs_per_eenheid: Number(it.prijs_per_eenheid) || 0,
        totaal: Number(it.totaal) || 0,
        btw_pct: Number(it.btw_pct) || 21,
        inventory_id: matched ? Number(matched.id) : null,
        inventory_naam: matched ? matched.naam : null,
        match_confidence: confidence,
        qty_in_inventory_unit: qtyConverted,
      };
    }).filter(Boolean) as MatchedSuggestion[];

    // RGS-code validatie
    const rgsCode: string | null = parsed.rgs_suggestie && rgsLookup(parsed.rgs_suggestie)
      ? parsed.rgs_suggestie
      : null;

    return NextResponse.json({
      ok: true,
      bon_preview: {
        leverancier_naam: parsed.leverancier || null,
        datum: body.datum_hint || parsed.datum || null,
        totaal_bedrag: Number(parsed.totaal_bedrag) || 0,
        btw_laag_bedrag: Number(parsed.btw_laag_bedrag) || 0,
        btw_hoog_bedrag: Number(parsed.btw_hoog_bedrag) || 0,
        netto_bedrag: Number(parsed.netto_bedrag) || 0,
        rgs_code: rgsCode,
        rgs_label: rgsCode ? rgsLookup(rgsCode)!.label : null,
      },
      items_with_suggestions: suggestions,
      tokens_used: response.usage.input_tokens + response.usage.output_tokens,
    });
  } catch (err: any) {
    console.error('[boekhouder/bon-extract]', err);
    return NextResponse.json({ error: err?.message || 'Onbekende fout' }, { status: 500 });
  }
}
