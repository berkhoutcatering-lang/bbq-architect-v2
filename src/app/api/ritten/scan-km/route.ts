// Vision-extractie van km-stand uit dashboard-foto.
// Pillar #4: AI suggereert, code rekent. Tarief blijft in lib/ritten-tarieven.ts.

/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createServerSupabase } from '@/lib/supabase-server';
import { logAiUsageServer, checkAiCapServer } from '@/lib/aiUsageServer';
import { estimateAiCostCents } from '@/lib/aiCost';
import { checkRateLimit } from '@/lib/rateLimit';

export const runtime = 'nodejs';
export const maxDuration = 30;

// Hard ceiling tegen DDoS via giant base64 payloads. 5MB raw ≈ 7MB base64.
// Een normale dashboard-foto is 200-800KB; 5MB dekt zware HEIC ruim.
const MAX_IMAGE_BASE64_BYTES = 7 * 1024 * 1024;

const KM_SCAN_SYSTEM = `Je leest een foto van een dashboard / kilometerteller van een auto of bestelbus. Geef ALLEEN JSON terug:

{
  "km_stand": number | null,
  "vertrouwen": "hoog" | "midden" | "laag",
  "type_meter": "digitaal" | "analoog" | "onduidelijk",
  "notitie": "string (1 zin: wat je ziet of waarom je twijfelt)"
}

Regels:
- km_stand is een geheel getal in km, NOOIT mijl of meters. Bij twijfel mijl/km: kies km (NL-app).
- Bij digitale display met decimalen (bv. trip-meter): pak ALLEEN de hoofd-odometer (totaal km), NIET de trip-teller.
- Bij twijfel of de meter onleesbaar is: km_stand = null, vertrouwen = "laag".
- vertrouwen "hoog" alleen als alle cijfers helder leesbaar zijn EN je zeker weet dat het de hoofdodometer is.
- Geen markdown fences, geen uitleg buiten de JSON. Direct JSON.

NOOIT:
- Een getal verzinnen als de foto onduidelijk is.
- De trip-teller voor totaal-km aanzien.
- Een aftrekbaar bedrag of tarief uitrekenen — dat doet de code.`;

interface ScanResult {
  km_stand: number | null;
  vertrouwen: 'hoog' | 'midden' | 'laag';
  type_meter: 'digitaal' | 'analoog' | 'onduidelijk';
  notitie: string;
}

function parseDataUrl(dataUrl: string): {
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';
  data: string;
} {
  const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!m) return { mediaType: 'image/jpeg', data: dataUrl };
  return { mediaType: m[1] as any, data: m[2] };
}

export async function POST(req: NextRequest) {
  const t0 = Date.now();
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY ontbreekt' }, { status: 500 });
  }

  let imageBase64: string;
  try {
    const body = await req.json();
    imageBase64 = body.imageBase64;
    if (!imageBase64) throw new Error();
  } catch {
    return NextResponse.json({ error: 'imageBase64 verplicht' }, { status: 400 });
  }

  // Size guard — base64-string-length is een goedkope proxy voor payload-omvang.
  if (imageBase64.length > MAX_IMAGE_BASE64_BYTES) {
    return NextResponse.json(
      { error: 'Foto te groot (max ~5MB) — comprimeer of maak een nieuwe foto' },
      { status: 413 },
    );
  }

  const sb = await createServerSupabase();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

  const { data: mem } = await sb
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .maybeSingle();
  if (!mem) return NextResponse.json({ error: 'Geen organisatie' }, { status: 403 });

  // Rate limit per user — 30 scans/min is ruim voor handmatig invoeren maar
  // blokkeert script-abuse. Sliding window in-memory (zelfde patroon als chat).
  const rl = checkRateLimit(`ritten-scan:${user.id}`, 30);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: `Te veel scans achter elkaar — wacht ${rl.resetInSeconds}s en probeer opnieuw` },
      { status: 429 },
    );
  }

  // Cost-cap per tier — soft 100% throttle, hard 150% block. Voorkomt dat
  // een vision-loop een tenant-bill exploit creëert.
  const cap = await checkAiCapServer(mem.organization_id);
  if (!cap.allowed) {
    return NextResponse.json(
      {
        error: 'AI-limiet voor deze maand bereikt — upgrade abonnement of wacht tot volgende maand',
        used: cap.used,
        cap: cap.cap,
        tier: cap.tier,
      },
      { status: 429 },
    );
  }

  const parsed = parseDataUrl(imageBase64);
  const client = new Anthropic({ apiKey });
  const model = 'claude-haiku-4-5';

  const stream = client.messages.stream({
    model,
    max_tokens: 200,
    system: [
      {
        type: 'text',
        text: KM_SCAN_SYSTEM,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: parsed.mediaType, data: parsed.data },
          },
          { type: 'text', text: 'JSON.' },
        ],
      },
    ],
    thinking: { type: 'disabled' as const },
  } as any);
  const response = await stream.finalMessage();

  if (response.usage) {
    const u = response.usage;
    logAiUsageServer({
      organization_id: mem.organization_id,
      user_id: user.id,
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
      metadata: { action: 'ritten-scan-km' },
    }).catch(() => {
      /* non-blocking */
    });
  }

  const textBlock = response.content.find((b) => b.type === 'text');
  const raw = textBlock?.type === 'text' ? textBlock.text.trim() : '';
  const cleaned = raw
    .replace(/^```(?:json)?\s*/, '')
    .replace(/\s*```$/, '')
    .trim();

  let result: ScanResult;
  try {
    result = JSON.parse(cleaned);
  } catch {
    return NextResponse.json(
      { error: 'AI gaf geen JSON', raw: cleaned.slice(0, 200) },
      { status: 422 },
    );
  }

  // Sanity-validation
  if (result.km_stand !== null) {
    if (
      typeof result.km_stand !== 'number' ||
      result.km_stand < 0 ||
      result.km_stand > 9_999_999
    ) {
      return NextResponse.json(
        { error: 'AI gaf onmogelijk km-getal', raw: cleaned.slice(0, 200) },
        { status: 422 },
      );
    }
  }
  if (!['hoog', 'midden', 'laag'].includes(result.vertrouwen)) {
    result.vertrouwen = 'laag';
  }

  return NextResponse.json({
    suggestion: result,
    elapsed_ms: Date.now() - t0,
    disclaimer: 'AI-suggestie, controleer voor opslaan',
  });
}
