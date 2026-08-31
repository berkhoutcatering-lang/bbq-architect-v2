/* eslint-disable @typescript-eslint/no-explicit-any */
// Scan een product-screenshot (IKEA, Sligro, etc.) → AI Vision parse → JSON
// Geen DB-insert — frontend toont preview, user reviewt en klikt opslaan.
// Hergebruikt het patroon van /api/parse-document maar met materieel-schema.
import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createServerSupabase } from '@/lib/supabase-server';
import { logAiUsageServer } from '@/lib/aiUsageServer';
import { estimateAiCostCents } from '@/lib/aiCost';
import { fetchProductPage, ProductPaginaError } from '@/lib/fetchProductPage';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MATERIEEL_SYSTEM_PROMPT = `Je bekijkt een productafbeelding (screenshot van IKEA/Sligro/etc, of foto van het echte product) voor Hop & Bites catering. Extract de relevante materieel-data → retourneer ALLEEN JSON.

Geen uitleg, geen markdown, geen denk-tekst. Direct JSON met dit schema:

{
  "naam": "string (productnaam zoals zichtbaar — bv 'IKEA OFTAST eetbord wit 25cm' of 'Yoder YS640S smoker')",
  "type": "BBQ | Servies | Linnen | Koeling | Transport | Meubilair | Overig",
  "kleur": "string of null (kleur-omschrijving voor foto-prompts, bv 'wit matt', 'zwart hout')",
  "materiaal": "string of null (bv 'porselein', 'stoneware', 'RVS', 'eiken', 'linnen')",
  "afmetingen": "string of null (vrije text, bv '25cm rond', '200x150cm', '60L inhoud')",
  "geschikt_voor_gangen": ["string"] (kies uit: hapje, voorgerecht, hoofdgerecht, vegetarisch, dessert, bijgerecht, borrelhap. Lege array als niet relevant — bv bij koeling/transport),
  "ai_styling_hint": "string of null (1-2 zinnen: voor welke gerechten of stijl past dit goed bij visualisatie/foto-prompts)",
  "notitie": "string (1 zin samenvatting van bijzonderheden — afgeleid van zichtbare specs)",

  "soort": "servies | apparatuur | opslag | meubilair | transport | gn_bak",
  "merk": "string of null (fabrikant, bv 'Hasegawa', 'Bizerba', 'Robot Coupe')",
  "model": "string of null (typeaanduiding, bv 'FSR20WH', 'CL50 Gourmet')",
  "artikelnummer": "string of null",
  "breedte_mm": "getal of null (buitenmaat in MILLIMETER — reken cm en inch om)",
  "diepte_mm": "getal of null",
  "hoogte_mm": "getal of null",
  "gewicht_g": "getal of null (in GRAM — reken kg om)",
  "capaciteit_waarde": "getal of null (bv 250 bij 250 kg/uur, 60 bij 60 liter)",
  "capaciteit_eenheid": "liter | gn_slots | kg | kg_per_uur | m2 | borden | null",
  "temp_min_c": "getal of null (laagste bedrijfstemperatuur)",
  "temp_max_c": "getal of null (hoogste bedrijfstemperatuur)"
}

Regels:
- Bij twijfel: geef je beste inschatting, niet null behalve waar expliciet toegestaan
- 'type' is verplicht en moet exact één van de opties zijn
- Voor servies/borden: vul kleur+materiaal+afmetingen ALTIJD in (essentieel voor foto-prompts later)
- Voor BBQ/koeling/transport: kleur+materiaal mag null als irrelevant
- ai_styling_hint alleen invullen voor servies/linnen — leeg laten voor apparatuur
- Geef NOOIT markdown fences (\`\`\`), geef alleen kale JSON
- Gebruik Nederlands voor alle tekst-velden

Maten en capaciteit (belangrijk):
- ALTIJD omrekenen naar millimeter en gram. '20 cm' wordt 200, '1,5 kg' wordt 1500.
- Staat een maat er niet, vul dan null — NOOIT een maat schatten. Een verzonnen
  afmeting laat later een bak niet in de koeling passen.
- Bij 'l × b × h' zonder duidelijk welke welke is: breedte is de langste kant
  van het werkvlak, diepte de kortste, hoogte de dikte of de stahoogte.`;

/** Alleen echte getallen doorlaten. Het model mag null zeggen als een maat niet
 *  op de pagina staat, en dan moet het null blijven — liever een leeg veld dan
 *  een geschatte afmeting waar later een capaciteitsberekening op leunt. */
function getal(v: unknown): number | null {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string') {
        const n = Number(v.replace(',', '.').replace(/[^\d.-]/g, ''));
        if (Number.isFinite(n) && v.trim() !== '') return n;
    }
    return null;
}

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
        const { imageBase64, imageUrl, productUrl, model: modelChoice } = body as {
            imageBase64?: string;
            imageUrl?: string;
            productUrl?: string;
            model?: 'haiku' | 'sonnet' | 'opus';
        };

        if (!imageBase64 && !imageUrl && !productUrl) {
            return NextResponse.json(
                { error: 'Geef een productlink, een foto of een screenshot mee.' },
                { status: 400 }
            );
        }

        const client = new Anthropic({ apiKey });
        const contentBlocks: Anthropic.Messages.ContentBlockParam[] = [];

        // Productlink: server haalt de pagina op, het model leest de tekst.
        // Faalt dit, dan zeggen we eerlijk waarom en waar de UI op terug kan
        // vallen — nooit een leeg voorstel dat zich voordoet als gelukt.
        let bronUrl: string | null = null;
        let bronAfbeelding: string | null = null;
        if (productUrl) {
            try {
                const pagina = await fetchProductPage(productUrl);
                bronUrl = pagina.url;
                bronAfbeelding = pagina.afbeelding;
                contentBlocks.push({
                    type: 'text',
                    text:
                        `Productpagina: ${pagina.url}\n` +
                        (pagina.titel ? `Titel: ${pagina.titel}\n` : '') +
                        `\n--- tekst van de pagina ---\n${pagina.tekst}`,
                });
            } catch (e) {
                if (e instanceof ProductPaginaError) {
                    return NextResponse.json(
                        { error: e.message, reden: e.reden, kanTerugvallenOpScreenshot: true },
                        { status: 422 }
                    );
                }
                throw e;
            }
        }

        if (imageBase64) {
            const parsed = imageBase64.startsWith('data:') ? parseDataUrl(imageBase64) : { mediaType: 'image/jpeg', data: imageBase64 };
            const mediaType = parsed.mediaType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
            contentBlocks.push({
                type: 'image',
                source: { type: 'base64', media_type: mediaType, data: parsed.data },
            });
        } else if (imageUrl) {
            contentBlocks.push({
                type: 'image',
                source: { type: 'url', url: imageUrl },
            });
        }

        contentBlocks.push({ type: 'text', text: 'JSON.' });

        const MODEL_MAP = {
            haiku: 'claude-haiku-4-5',
            sonnet: 'claude-sonnet-4-6',
            opus: 'claude-opus-4-7',
        } as const;
        const model = MODEL_MAP[modelChoice || 'haiku'] || MODEL_MAP.haiku;

        // Org voor usage logging (fire-and-forget)
        let orgId: string | null = null;
        let userId: string | null = null;
        try {
            const sb = await createServerSupabase();
            const { data: { user } } = await sb.auth.getUser();
            if (user) {
                userId = user.id;
                const mem = await sb.from('organization_members').select('organization_id').eq('user_id', user.id).eq('status', 'active').limit(1).maybeSingle();
                orgId = mem.data?.organization_id ?? null;
            }
        } catch { /* logging optional */ }

        const isHaikuOrSonnet = model === MODEL_MAP.haiku || model === MODEL_MAP.sonnet;
        const stream = client.messages.stream({
            model,
            max_tokens: 1500,
            system: [{ type: 'text', text: MATERIEEL_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
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
                metadata: { action: 'materieel-scan' },
            }).catch(function () { /* non-blocking */ });
        }

        // Extract en parse JSON
        const textBlock = response.content.find(b => b.type === 'text');
        const raw = textBlock && textBlock.type === 'text' ? textBlock.text.trim() : '';
        // Verwijder markdown fences als de AI ze toch gebruikt
        const cleaned = raw.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '').trim();

        let parsed: any = null;
        try {
            parsed = JSON.parse(cleaned);
        } catch (e: any) {
            return NextResponse.json({
                error: 'AI gaf geen geldige JSON terug',
                detail: e.message,
                raw: cleaned.slice(0, 500),
            }, { status: 422 });
        }

        // Validatie: type moet één van de toegestane zijn
        const VALID_TYPES = ['BBQ', 'Servies', 'Linnen', 'Koeling', 'Transport', 'Meubilair', 'Overig'];
        if (!parsed.naam || !parsed.type || !VALID_TYPES.includes(parsed.type)) {
            return NextResponse.json({
                error: 'AI-output mist verplicht veld (naam/type) of type is ongeldig',
                parsed,
            }, { status: 422 });
        }

        return NextResponse.json({
            data: {
                naam: String(parsed.naam),
                type: parsed.type,
                kleur: parsed.kleur ?? null,
                materiaal: parsed.materiaal ?? null,
                afmetingen: parsed.afmetingen ?? null,
                geschikt_voor_gangen: Array.isArray(parsed.geschikt_voor_gangen) ? parsed.geschikt_voor_gangen : [],
                ai_styling_hint: parsed.ai_styling_hint ?? null,
                notitie: parsed.notitie ?? '',

                // Apparatuur-velden. Getallen alleen doorgeven als het echt een
                // getal is: het model mag null teruggeven en dat moet null
                // blijven — een verzonnen maat laat later een bak niet passen.
                soort: parsed.soort ?? null,
                merk: parsed.merk ?? null,
                model: parsed.model ?? null,
                artikelnummer: parsed.artikelnummer ?? null,
                breedte_mm: getal(parsed.breedte_mm),
                diepte_mm: getal(parsed.diepte_mm),
                hoogte_mm: getal(parsed.hoogte_mm),
                gewicht_g: getal(parsed.gewicht_g),
                capaciteit_waarde: getal(parsed.capaciteit_waarde),
                capaciteit_eenheid: parsed.capaciteit_eenheid ?? null,
                temp_min_c: getal(parsed.temp_min_c),
                temp_max_c: getal(parsed.temp_max_c),
                product_url: bronUrl,
                foto_suggestie: bronAfbeelding,

                scan_source: (bronUrl ? 'claude-link/' : 'claude-vision/') + model,
                scan_data: parsed,
            },
            elapsed_ms: Date.now() - t0,
            model,
        });
    } catch (err: any) {
        console.error('[materieel/scan] error:', err);
        if (err instanceof Anthropic.AuthenticationError) {
            return NextResponse.json({ error: 'Ongeldige ANTHROPIC_API_KEY' }, { status: 401 });
        }
        if (err instanceof Anthropic.RateLimitError) {
            return NextResponse.json({ error: 'AI rate limit — probeer opnieuw' }, { status: 429 });
        }
        return NextResponse.json({ error: err.message || 'Onbekende fout' }, { status: 500 });
    }
}
