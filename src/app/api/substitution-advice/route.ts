/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createServerSupabase } from '@/lib/supabase-server';

export const runtime = 'nodejs';
export const maxDuration = 60;

const SYSTEM_PROMPT = `Je bent een Nederlandse catering-inkoopadviseur voor Hop & Bites.
Jouw taak: advies geven wanneer een product uit het assortiment is bij een leverancier,
zodat recepten en inkoop doorgaan zonder kwaliteitsverlies.

Regels:
- Denk in 2 richtingen: (1) één vervangend product dat dezelfde functie heeft,
  (2) combinatie van 2-4 losse producten die samen de functie overnemen
- Weeg mee: PRIJS (liefst niet veel duurder), FUNCTIE (smaak/toepassing),
  HOUDBAARHEID, ALLERGENEN (als aanwezig in master-data)
- Wees pragmatisch: voor een kruidenmix mag je losse kruiden voorstellen
- Maximaal 3 suggesties: 1 enkele vervanger + max 2 combinaties
- Als GEEN goede optie: zeg dat eerlijk en leg uit waarom

Retourneer ALLEEN geldige JSON:
{
  "headline": "string (1 zin — wat is je advies samengevat)",
  "suggestions": [
    {
      "type": "single" | "combo",
      "products": [
        { "naam": "string", "leverancier": "string", "prijs": number, "eenheid": "string",
          "aandeel_in_combo": "string (alleen bij combo — bv 'hoofdingredient' of 'smaak') OF null" }
      ],
      "price_diff_pp": number (per-portie verschil t.o.v. origineel, negatief=goedkoper),
      "functie_match_pct": number (0-100, hoe goed dekt dit de oorspronkelijke functie),
      "houdbaarheid_note": "string (korter/langer/gelijk, 1 zin)",
      "reasoning": "string (2-3 zinnen — waarom is dit een goede keuze)"
    }
  ],
  "advies_tekst": "string (2-3 zinnen vrije tekst — samenvatting voor de ondernemer)"
}`;

export async function POST(req: NextRequest) {
    try {
        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey) return NextResponse.json({ error: 'Geen API key' }, { status: 500 });

        const supabase = await createServerSupabase();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

        const { data: memberData } = await supabase
            .from('organization_members').select('organization_id')
            .eq('user_id', user.id).eq('status', 'active').limit(1);
        const orgId = memberData?.[0]?.organization_id;
        if (!orgId) return NextResponse.json({ error: 'Geen organisatie' }, { status: 400 });

        const body = await req.json();
        const { masterProductId, forceRefresh } = body as { masterProductId: number; forceRefresh?: boolean };

        if (!masterProductId) return NextResponse.json({ error: 'masterProductId verplicht' }, { status: 400 });

        /* Cache check: bestaat er al advies voor dit product? */
        if (!forceRefresh) {
            const { data: cached } = await supabase
                .from('substitution_advice')
                .select('*')
                .eq('master_product_id', masterProductId)
                .eq('organization_id', orgId)
                .order('generated_at', { ascending: false })
                .limit(1);
            if (cached && cached.length > 0) {
                return NextResponse.json({ success: true, fromCache: true, advice: cached[0] });
            }
        }

        /* Haal het originele product op */
        const { data: original } = await supabase
            .from('master_products')
            .select('id, naam, categorie, standaard_eenheid, standaard_leverancier, allergenen, tags')
            .eq('id', masterProductId)
            .eq('organization_id', orgId)
            .single();
        if (!original) return NextResponse.json({ error: 'Product niet gevonden' }, { status: 404 });

        /* Haal alle beschikbare alternatieven op: zelfde categorie, niet uit_assortiment */
        const { data: candidates } = await supabase
            .from('supplier_prices')
            .select('product_naam, leverancier, prijs, eenheid, categorie, master_product_id, master_products(naam, categorie, allergenen, tags, uit_assortiment)')
            .eq('organization_id', orgId)
            .eq('categorie', original.categorie || '')
            .eq('actief', true)
            .limit(200);

        /* Filter: niet het origineel zelf, niet uit assortiment */
        const validCandidates = (candidates || []).filter((c: any) =>
            c.master_product_id !== masterProductId
            && (!c.master_products || !c.master_products.uit_assortiment)
        );

        if (validCandidates.length === 0) {
            return NextResponse.json({
                success: true,
                fromCache: false,
                advice: {
                    advice_json: {
                        headline: 'Geen alternatieven in je catalogus',
                        suggestions: [],
                        advies_tekst: `Voor "${original.naam}" zijn er geen andere producten in categorie "${original.categorie}" in je prijslijst. Voeg meer leveranciers toe of upload een nieuwe catalog.`,
                    },
                    generated_at: new Date().toISOString(),
                },
            });
        }

        /* AI call met context */
        const client = new Anthropic({ apiKey });
        const userMessage = `Product uit assortiment:
- Naam: ${original.naam}
- Categorie: ${original.categorie || 'Onbekend'}
- Standaard-eenheid: ${original.standaard_eenheid || '?'}
- Vorige leverancier: ${original.standaard_leverancier || '?'}
- Allergenen: ${(original.allergenen || []).join(', ') || 'niet bekend'}
- Tags: ${(original.tags || []).join(', ') || '—'}

Beschikbare alternatieven (${validCandidates.length} in dezelfde categorie):
${validCandidates.slice(0, 80).map((c: any) =>
            `- ${c.product_naam} · ${c.leverancier} · €${Number(c.prijs).toFixed(2)}/${c.eenheid || 'st'}`
        ).join('\n')}

Geef 1-3 suggesties in het JSON-formaat. Prioriteit: 1 enkele vervanger + evt. 1-2 combinatie-opties.`;

        /* Haiku werkt prima voor product-substitution suggesties met gestructureerde input.
           Sonnet was 5× duurder zonder merkbaar betere output. Body kan optioneel `model: 'sonnet'`
           sturen voor expliciete opt-in. */
        const reqModel = body.model === 'sonnet' ? 'claude-sonnet-4-6' : 'claude-haiku-4-5';
        const stream = client.messages.stream({
            model: reqModel,
            max_tokens: 4000,
            system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
            messages: [{ role: 'user', content: userMessage }],
        } as any);
        const response = await stream.finalMessage();

        const textBlock = response.content.find(b => b.type === 'text');
        if (!textBlock || textBlock.type !== 'text') {
            return NextResponse.json({ error: 'AI gaf geen tekst' }, { status: 502 });
        }
        const content = textBlock.text;

        function cleanJson(s: string): string {
            let t = s.trim();
            const fence = t.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
            if (fence) t = fence[1].trim();
            return t;
        }
        let parsed: any = null;
        const tries = [content, cleanJson(content)];
        const biggest = content.match(/\{[\s\S]*\}/);
        if (biggest) tries.push(biggest[0]);
        for (const candidate of tries) {
            try { parsed = JSON.parse(candidate); break; } catch { /* next */ }
        }
        if (!parsed) return NextResponse.json({ error: 'JSON parse fout', raw: content.slice(0, 500) }, { status: 502 });

        /* Opslaan in substitution_advice cache */
        const { data: saved } = await supabase.from('substitution_advice').insert({
            organization_id: orgId,
            master_product_id: masterProductId,
            advice_json: parsed,
            model_used: reqModel,
            status: 'pending',
        }).select('*').single();

        return NextResponse.json({
            success: true,
            fromCache: false,
            advice: saved || { advice_json: parsed, generated_at: new Date().toISOString() },
            tokens: response.usage,
        });
    } catch (e: any) {
        console.error('[substitution-advice]', e);
        return NextResponse.json({ error: e?.message || 'Onbekende fout' }, { status: 500 });
    }
}
