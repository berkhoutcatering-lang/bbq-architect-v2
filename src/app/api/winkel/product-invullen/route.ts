/**
 * POST /api/winkel/product-invullen — de AI zet een productpagina klaar (blok C6).
 *
 * Invoer: { productId, fotos?: [{ media_type, data }] (base64, hooguit 2), ean?, extra? }
 * Uit:    { voorstel, bronnen, tekstcontrole, usage }
 *
 * Schrijft NIETS: het voorstel gaat naar het scherm, Mathijs neemt over wat
 * klopt. Prijs, btw, allergenen en ingrediënten zijn nooit een veld (alleen
 * een hint); zie src/lib/ai/productInvuller.ts. Elke tekst gaat langs de
 * woordregels van de website; faalt hij, dan één nieuwe poging met de fouten
 * erbij, en anders zegt het scherm welk woord niet mag.
 */
import { NextResponse, type NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { createServerSupabase } from '@/lib/supabase-server';
import { logAiUsageServer } from '@/lib/aiUsageServer';
import { estimateAiCostCents } from '@/lib/aiCost';
import { enforceAiCap } from '@/lib/aiCostCap';
import { INVULLER_MODEL, INVULLER_SYSTEEM, bouwVraag, haalJson, leesVoorstel, tekstenVan, verzamelBronnen } from '@/lib/ai/productInvuller';
import { soortVanType } from '@/lib/winkel/productsoorten';
import { controleerTekst, siteUrl } from '@/lib/winkel/tekstcontrole';

export const runtime = 'nodejs';
export const maxDuration = 120;

const Invoer = z.object({
    productId: z.string().uuid(),
    fotos: z.array(z.object({
        media_type: z.enum(['image/jpeg', 'image/png', 'image/webp']),
        data: z.string().min(100).max(6_000_000),
    })).max(2).default([]),
    ean: z.string().regex(/^\d{8,14}$/).nullable().default(null),
    extra: z.string().max(600).nullable().default(null),
});

export async function POST(req: NextRequest) {
    const t0 = Date.now();
    const sb = await createServerSupabase();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });
    const { data: member } = await sb.from('organization_members').select('organization_id').eq('user_id', user.id).eq('status', 'active').limit(1).maybeSingle();
    const orgId = member?.organization_id as string | undefined;
    if (!orgId) return NextResponse.json({ error: 'Geen organisatie' }, { status: 403 });

    const parsed = Invoer.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Ongeldige invoer' }, { status: 400 });
    const { productId, fotos, ean, extra } = parsed.data;

    /* RLS: alleen een product van de eigen organisatie. */
    const { data: product } = await sb.from('winkel_producten').select('id, naam, type, kenmerken, ean').eq('id', productId).eq('organization_id', orgId).maybeSingle();
    if (!product) return NextResponse.json({ error: 'Product niet gevonden' }, { status: 404 });
    const soort = soortVanType(product.type as string);
    if (!soort) return NextResponse.json({ error: 'Dit soort product heeft geen pagina' }, { status: 400 });

    /* Zoeken met beeld kost meer dan een gewone vraag: ruim schatten. */
    const cap = await enforceAiCap(orgId, 0.25);
    if (cap) return cap;

    const kenmerken = (product.kenmerken ?? {}) as Record<string, unknown>;
    const maker = (kenmerken.brouwerij ?? kenmerken.producent ?? null) as string | null;
    const vraag = bouwVraag(soort, { naam: product.naam as string, maker, ean: ean ?? (product.ean as string | null), fotoAantal: fotos.length, extra });

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const berichten: Anthropic.MessageParam[] = [{
        role: 'user',
        content: [
            ...fotos.map((f): Anthropic.ImageBlockParam => ({ type: 'image', source: { type: 'base64', media_type: f.media_type, data: f.data } })),
            { type: 'text', text: vraag },
        ],
    }];

    let tokens = { in: 0, uit: 0, cacheLees: 0, cacheSchrijf: 0 };
    const alleInhoud: unknown[] = [];

    async function vraagAan(): Promise<Anthropic.Message> {
        /* pause_turn: de zoektocht liep lang; dezelfde beurt voortzetten (hooguit drie keer). */
        for (let i = 0; i < 4; i++) {
            const antwoord = await anthropic.messages.create({
                model: INVULLER_MODEL,
                max_tokens: 16000,
                output_config: { effort: 'medium' },
                system: [{ type: 'text', text: INVULLER_SYSTEEM, cache_control: { type: 'ephemeral' } }],
                tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 6 }],
                messages: berichten,
            });
            const u = antwoord.usage;
            tokens = { in: tokens.in + u.input_tokens, uit: tokens.uit + u.output_tokens, cacheLees: tokens.cacheLees + (u.cache_read_input_tokens ?? 0), cacheSchrijf: tokens.cacheSchrijf + (u.cache_creation_input_tokens ?? 0) };
            alleInhoud.push(...antwoord.content);
            if (antwoord.stop_reason !== 'pause_turn') return antwoord;
            berichten.push({ role: 'assistant', content: antwoord.content });
        }
        throw new Error('De zoektocht duurde te lang.');
    }

    try {
        let antwoord = await vraagAan();
        if (antwoord.stop_reason === 'refusal') {
            return NextResponse.json({ error: 'De AI wilde dit niet invullen. Vul het zelf in.' }, { status: 422 });
        }
        const tekst = () => antwoord.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join('');
        let voorstel = leesVoorstel(soort, haalJson(tekst()));
        if (!voorstel) return NextResponse.json({ error: 'Het antwoord van de AI was niet te lezen. Probeer het nog eens of vul het zelf in.' }, { status: 502 });

        /* De woordregels van de website: één herkansing met de fouten erbij. */
        const site = await siteUrl(orgId);
        let controle = await controleerTekst(site, tekstenVan(voorstel));
        if (controle.status === 'fout') {
            berichten.push({ role: 'assistant', content: antwoord.content });
            berichten.push({ role: 'user', content: `Deze woorden mogen niet op de site: ${controle.fouten.map((f) => `"${f.woord}" (${f.veld})`).join(', ')}. Geef hetzelfde JSON-object terug met die zinnen anders gezegd. Zoek niet opnieuw.` });
            antwoord = await vraagAan();
            const tweede = leesVoorstel(soort, haalJson(tekst()));
            if (tweede) {
                voorstel = tweede;
                controle = await controleerTekst(site, tekstenVan(voorstel));
            }
        }

        const costCents = estimateAiCostCents({ model: INVULLER_MODEL, tokens_input: tokens.in, tokens_output: tokens.uit, tokens_cache_read: tokens.cacheLees, tokens_cache_creation: tokens.cacheSchrijf });
        logAiUsageServer({
            organization_id: orgId,
            user_id: user.id,
            action_type: 'other',
            model: INVULLER_MODEL,
            tokens_input: tokens.in,
            tokens_output: tokens.uit,
            tokens_cache_read: tokens.cacheLees,
            tokens_cache_creation: tokens.cacheSchrijf,
            cost_eur_cents: costCents,
            metadata: { feature: 'product_invullen', soort, product_id: productId, fotos: fotos.length },
        }).catch(() => { /* nooit de flow blokkeren */ });

        return NextResponse.json({
            voorstel,
            bronnen: verzamelBronnen(alleInhoud),
            tekstcontrole: controle,
            usage: { cost_eur_cents: costCents, duration_ms: Date.now() - t0 },
        });
    } catch (e) {
        if (e instanceof Anthropic.RateLimitError) return NextResponse.json({ error: 'Even te druk bij de AI. Probeer het over een minuut nog eens.' }, { status: 429 });
        if (e instanceof Anthropic.APIError) return NextResponse.json({ error: `AI-fout ${e.status}` }, { status: 502 });
        return NextResponse.json({ error: e instanceof Error ? e.message : 'AI-fout' }, { status: 500 });
    }
}
