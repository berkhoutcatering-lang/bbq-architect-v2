/* POST /api/recipe/ontleed — foto's van een recept naar een Hop & Bites-receptuur.
 *
 * Wat hier gebeurt, en waarom in deze volgorde:
 *
 *   1. Het model krijgt de foto's én de inventaris te zien, en **vertaalt**
 *      het recept naar deze keuken. Een saus gaat in een pan op de inductie,
 *      een chunk in de kamado bestaat hier niet. Zelfde gerecht, zelfde
 *      kwaliteit, andere machines.
 *   2. De code **controleert** die vertaling tegen de werkelijke apparatuur
 *      (`controleer` in lib/keukenplanner/ontleder.ts). Bestaat dat toestel,
 *      haalt het die temperatuur, staat er een duur bij.
 *   3. Er wordt **niets opgeslagen**. Deze route geeft een voorstel terug; de
 *      kok keurt goed. Een systeem dat zijn eigen voorstel opslaat is geen
 *      goedkeuring.
 *
 * De foto's worden niet bewaard. Alleen jouw eigen vertaalde receptuur belandt
 * straks in de database — de pagina uit het boek niet.
 */

import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { withTenantAuth, type TenantAuthCtx } from '@/lib/withTenantAuth';
import { logAiUsageServer } from '@/lib/aiUsageServer';
import { estimateAiCostCents } from '@/lib/aiCost';
import { enforceAiCap } from '@/lib/aiCostCap';
import {
    controleer, inventarisVoorPrompt, SYSTEEM, SCHEMA, type Voorstel,
} from '@/lib/keukenplanner/ontleder';
import type { ApparaatMetKundes } from '@/lib/keukenplanner/estafette';

export const runtime = 'nodejs';
export const maxDuration = 300;

/* Opus: dit is vertaalwerk met oordeel erin, en een verkeerd vertaald recept
   kost een verpeste zaterdag. Op honderd euro voor een hele bibliotheek is dat
   niet de plek om te bezuinigen. Eén regel om te wisselen als je wilt meten. */
const MODEL = 'claude-opus-5';

/** Twee pagina's is normaal; meer dan zes is bijna altijd een vergissing. */
const MAX_FOTOS = 6;
const MAX_FOTO_BYTES = 5 * 1024 * 1024;

const TOEGESTANE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);



interface Body {
    /** Data-URL's of kale base64. De foto's worden niet bewaard. */
    fotos?: unknown;
    /** Wat de kok er zelf bij zegt. Mag leeg. */
    opmerking?: unknown;
}

export const POST = withTenantAuth(async (req: NextRequest, { supabase, orgId, userId }: TenantAuthCtx) => {
    let body: Body;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: 'Ongeldige JSON' }, { status: 400 });
    }

    const fotos = leesFotos(body.fotos);
    if (!fotos.ok) {
        return NextResponse.json({ error: (fotos as { ok: false; error: string }).error }, { status: 400 });
    }

    const opmerking = typeof body.opmerking === 'string' ? body.opmerking.slice(0, 1000) : '';

    /* Vision met twee pagina's kost rond de tien cent. De cap kijkt of daar
       nog ruimte voor is voordat we hem uitgeven. */
    const cap = await enforceAiCap(orgId, 0.15);
    if (cap) return cap;

    /* De inventaris. Zonder dit zet het model je sauzen op de barbecue. */
    const { data: materieel, error: matFout } = await supabase
        .from('materieel')
        .select('id, naam, maakt_mogelijk, temp_min_c, temp_max_c, capaciteit_waarde, capaciteit_eenheid, kookoppervlak_cm2, aanzet_min, opwarm_min, warm_blijft_min, schoonmaak_min, exclusief_bezet, concurrent_jobs')
        .eq('organization_id', orgId)
        .not('maakt_mogelijk', 'is', null);

    if (matFout) return NextResponse.json({ error: matFout.message }, { status: 500 });

    const apparaten: ApparaatMetKundes[] = (materieel ?? []).map((m) => ({
        id: m.id as number,
        naam: (m.naam as string) ?? 'Apparaat',
        kundes: (m.maakt_mogelijk as string[]) ?? [],
        aanzetMin: (m.aanzet_min as number) ?? 1,
        opwarmMin: (m.opwarm_min as number) ?? null,
        warmBlijftMin: (m.warm_blijft_min as number) ?? null,
        schoonmaakMin: (m.schoonmaak_min as number) ?? null,
        exclusiefBezet: (m.exclusief_bezet as boolean) ?? true,
        concurrentJobs: (m.concurrent_jobs as number) ?? null,
        capaciteitWaarde: (m.capaciteit_waarde as number) ?? null,
        capaciteitEenheid: (m.capaciteit_eenheid as string) ?? null,
        kookoppervlakCm2: (m.kookoppervlak_cm2 as number) ?? null,
        temp_min_c: (m.temp_min_c as number) ?? null,
        temp_max_c: (m.temp_max_c as number) ?? null,
        stationId: null,
    }));

    /* Componenten die al bestaan, zodat de controle weet wat er ontbreekt. */
    const { data: comps } = await supabase
        .from('components')
        .select('name')
        .eq('organization_id', orgId);
    const bekendeComponenten = (comps ?? []).map((c) => c.name as string);

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const inhoud: Anthropic.ContentBlockParam[] = [
        ...fotos.waarden.map((f): Anthropic.ContentBlockParam => ({
            type: 'image',
            source: { type: 'base64', media_type: f.mediaType, data: f.data },
        })),
        {
            type: 'text',
            text: [
                'Zet dit recept om naar onze werkwijze.',
                '',
                'DIT STAAT ER IN DE KEUKEN — kies alleen hieruit, met het id tussen haken:',
                inventarisVoorPrompt(apparaten),
                opmerking ? `\nDe kok zegt erbij: ${opmerking}` : '',
            ].join('\n'),
        },
    ];

    let bericht: Anthropic.Message;
    try {
        bericht = await anthropic.messages.create({
            model: MODEL,
            max_tokens: 16000,
            /* Vertalen naar andere apparatuur is oordeelswerk, geen overtypen. */
            thinking: { type: 'adaptive' },
            system: [
                /* Stabiel, dus cachebaar: dezelfde prompt bij elk recept. */
                { type: 'text', text: SYSTEEM, cache_control: { type: 'ephemeral' } },
            ],
            output_config: {
                format: { type: 'json_schema', schema: SCHEMA },
            },
            messages: [{ role: 'user', content: inhoud }],
        });
    } catch (e) {
        if (e instanceof Anthropic.RateLimitError) {
            return NextResponse.json({ error: 'Even te druk bij de AI — probeer het zo nog eens' }, { status: 429 });
        }
        if (e instanceof Anthropic.APIError) {
            return NextResponse.json({ error: `AI-fout ${e.status}: ${e.message}` }, { status: 502 });
        }
        return NextResponse.json({ error: e instanceof Error ? e.message : 'Onbekende fout' }, { status: 500 });
    }

    /* Kosten vastleggen vóór we iets teruggeven — ook als het parsen mislukt
       is er wél betaald, en dan hoort dat in de boekhouding te staan. */
    const kostenCent = estimateAiCostCents({
        model: MODEL,
        tokens_input: bericht.usage.input_tokens,
        tokens_output: bericht.usage.output_tokens,
        tokens_cache_read: bericht.usage.cache_read_input_tokens ?? 0,
        tokens_cache_creation: bericht.usage.cache_creation_input_tokens ?? 0,
    });
    await logAiUsageServer({
        organization_id: orgId,
        user_id: userId,
        action_type: 'other',
        model: MODEL,
        tokens_input: bericht.usage.input_tokens,
        tokens_output: bericht.usage.output_tokens,
        tokens_cache_read: bericht.usage.cache_read_input_tokens ?? 0,
        tokens_cache_creation: bericht.usage.cache_creation_input_tokens ?? 0,
        cost_eur_cents: kostenCent,
        metadata: { feature: 'recept-ontleder', fotos: fotos.waarden.length },
    }).catch(() => { /* boekhouding mag de route niet blokkeren */ });

    if (bericht.stop_reason === 'refusal') {
        return NextResponse.json({ error: 'De AI wilde dit recept niet verwerken' }, { status: 422 });
    }

    const tekst = bericht.content.find((b) => b.type === 'text');
    if (!tekst || tekst.type !== 'text') {
        return NextResponse.json({ error: 'Geen leesbaar antwoord van de AI' }, { status: 502 });
    }

    let voorstel: Voorstel;
    try {
        voorstel = JSON.parse(tekst.text) as Voorstel;
    } catch {
        return NextResponse.json({ error: 'Antwoord van de AI was geen geldige JSON' }, { status: 502 });
    }

    /* En dan het belangrijkste: de code kijkt de vertaling na. */
    const controle = controleer(voorstel, { apparaten, bekendeComponenten });

    return NextResponse.json({
        ok: true,
        controle,
        /* Wat dit gekost heeft, zodat je het na één recept precies weet in
           plaats van bij benadering. */
        kosten: {
            centen: kostenCent,
            tokensIn: bericht.usage.input_tokens,
            tokensUit: bericht.usage.output_tokens,
            model: MODEL,
        },
    });
});

/** Data-URL's of kale base64 omzetten naar wat de API wil. */
function leesFotos(v: unknown):
    | { ok: true; waarden: Array<{ mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'; data: string }> }
    | { ok: false; error: string } {
    if (!Array.isArray(v) || v.length === 0) return { ok: false, error: 'Stuur minstens één foto mee' };
    if (v.length > MAX_FOTOS) return { ok: false, error: `Hooguit ${MAX_FOTOS} foto's per recept` };

    const waarden: Array<{ mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'; data: string }> = [];

    for (const foto of v) {
        if (typeof foto !== 'string') return { ok: false, error: 'Foto is geen tekst' };

        const m = /^data:([^;]+);base64,(.+)$/.exec(foto);
        const mediaType = m ? m[1] : 'image/jpeg';
        const data = m ? m[2] : foto;

        if (!TOEGESTANE_TYPES.has(mediaType)) {
            return { ok: false, error: `Bestandstype ${mediaType} wordt niet ondersteund` };
        }
        /* Base64 is een derde groter dan het origineel. */
        if (data.length * 0.75 > MAX_FOTO_BYTES) {
            return { ok: false, error: 'Foto is te groot — verklein hem eerst' };
        }
        waarden.push({ mediaType: mediaType as 'image/jpeg', data });
    }

    return { ok: true, waarden };
}
