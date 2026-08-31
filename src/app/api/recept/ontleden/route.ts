/**
 * Receptuur-ontleder — agent 11, klasse H.
 *
 * Jij zet je receptuur erin met een korte bereidingswijze. De AI leest na, kijkt
 * naar de manier van koken en hakt het op in micro-stappen. Jij keurt goed.
 *
 * Klasse H betekent hier concreet: deze route schrijft NOOIT naar recipe_steps.
 * Hij maakt een voorstel in de goedkeur-lade. Pas als jij tekent, voert de
 * bevestig-actie het uit. Zie docs/agent-architectuur-plan.md hoofdstuk 7.1.
 *
 * Wat code bewaakt en het model dus niet mag verzinnen:
 *   - plaats is thuis, bus of locatie — niets anders
 *   - duren zijn getallen of leeg, nooit negatief en nooit geraden
 *   - techniek_slug moet in de kennisbank bestaan, anders valt hij weg
 *   - temperaturen alleen als PROCEStemperatuur; wettelijke grenswaarden komen
 *     uit de HACCP-normtabel en niet uit een model
 *
 * Werkt op een bestaand gerecht óf op geplakte tekst. Dat tweede is bewust:
 * van de gerechten in de database heeft nog lang niet alles een bereidingswijze,
 * en een recept uit een schrift of een appje moet er net zo goed in kunnen.
 */
import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { createServerSupabase } from '@/lib/supabase-server';
import { logAiUsageServer } from '@/lib/aiUsageServer';
import { estimateAiCostCents } from '@/lib/aiCost';

export const runtime = 'nodejs';
export const maxDuration = 90;

const MODEL = 'claude-sonnet-5';

const PLAATSEN = ['thuis', 'bus', 'locatie'] as const;

const BodySchema = z
    .object({
        gerecht_id: z.string().uuid().optional(),
        tekst: z.string().min(10).max(20_000).optional(),
        naam: z.string().max(200).optional(),
        porties: z.coerce.number().int().min(1).max(2000).optional(),
    })
    .refine((b) => b.gerecht_id || b.tekst, {
        message: 'Geef een gerecht of een stuk receptuur mee',
    });

const SYSTEM = `Je hakt receptuur op in micro-stappen voor een BBQ-cateraar. Antwoord met ALLEEN kale JSON, geen uitleg, geen markdown.

{
  "stappen": [
    {
      "tekst": "korte handeling, gebiedende wijs, max 90 tekens",
      "actie": "snijden|mise-en-place|marineren|pekelen|smoken|sous-vide|bakken|koken|blenden|emulgeren|koelen|invriezen|portioneren|afwerken|uitgifte",
      "prep_group": "batching-sleutel of null, bv 'sjalot-brunoise'",
      "duur_actief_min": getal of null,
      "duur_passief_min": getal of null,
      "plaats": "thuis|bus|locatie",
      "toezicht_nodig": true/false,
      "station": "string of null",
      "apparaat": "string of null",
      "techniek_slug": "string of null",
      "temp_doel_c": getal of null,
      "ingredient_ref": "ingrediëntnaam of null",
      "hoeveelheid": getal of null,
      "eenheid": "g|ml|st of null"
    }
  ],
  "opmerkingen": "1-2 zinnen: wat je niet zeker wist of wat er in de bron ontbrak"
}

HANDTIJD VERSUS WACHTTIJD — dit is het belangrijkste van de hele taak:
- duur_actief_min is tijd waarin een PERSOON bezig is. Snijden, kloppen, afwerken.
- duur_passief_min is tijd waarin een APPARAAT of de tijd het werk doet en er niemand bij hoeft. Marineren, koelen, roken, laten trekken, opstijven.
- Een stap heeft vaak allebei: "smoker opstoken" is 15 min handtijd en 45 min wachten.
- Zet nooit wachttijd in het actieve veld. Twaalf uur op de smoker is geen twaalf uur werk.

PLAATS:
- thuis = eigen keuken, voorbereiding
- bus = onderweg, meestal rusten of koelen
- locatie = bij de gast, afwerken en uitgeven
- Bij twijfel: voorbereiden is thuis, het laatste snijden en uitgeven is locatie.

HOEVEELHEDEN: altijd PER GAST, nooit per recept. Staat de bron in totalen voor N porties, deel dan door N. Weet je N niet: laat hoeveelheid leeg.

WAT JE NIET DOET:
- Geen tijden verzinnen. Staat er geen duur, laat het veld leeg. Een geraden handtijd maakt elke planning eronder waardeloos, en erger: geloofwaardig-maar-fout.
- Geen wettelijke grenswaarden invullen. temp_doel_c is alleen een PROCEStemperatuur die in de bron staat (bv "tot 70 °C verwarmen"). Kerntemperaturen voor voedselveiligheid komen ergens anders vandaan.
- Geen stappen toevoegen die niet in de bron staan. Ontleden is opdelen, niet aanvullen.

PREP_GROUP: geef dezelfde sleutel aan handelingen die over recepten heen samen te voegen zijn. Sjalot snipperen in drie recepten wordt één taak. Laat leeg als een stap uniek is voor dit gerecht.

Alle tekst in het Nederlands.`;

/** Alleen echte getallen. Het model mag null zeggen, en dan moet het null
 *  blijven — een geraden duur is erger dan een lege. */
function getal(v: unknown): number | null {
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0) return v;
    if (typeof v === 'string' && v.trim() !== '') {
        const n = Number(v.replace(',', '.').replace(/[^\d.]/g, ''));
        if (Number.isFinite(n) && n >= 0) return n;
    }
    return null;
}

function tekst(v: unknown, max = 200): string | null {
    if (typeof v !== 'string') return null;
    const t = v.trim();
    return t ? t.slice(0, max) : null;
}

export async function POST(req: NextRequest) {
    const t0 = Date.now();
    try {
        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY ontbreekt' }, { status: 500 });

        const parsed = BodySchema.safeParse(await req.json());
        if (!parsed.success) {
            return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Ongeldige invoer' }, { status: 400 });
        }

        const sb = await createServerSupabase();
        const { data: { user } } = await sb.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

        const { data: mem } = await sb
            .from('organization_members')
            .select('organization_id')
            .eq('user_id', user.id)
            .eq('status', 'active')
            .limit(1)
            .maybeSingle();
        const orgId = mem?.organization_id as string | undefined;
        if (!orgId) return NextResponse.json({ error: 'Geen actieve organisatie' }, { status: 403 });

        /* ── Bron samenstellen ─────────────────────────────────────── */
        let naam = parsed.data.naam ?? '';
        let porties = parsed.data.porties ?? null;
        let bron = parsed.data.tekst ?? '';
        let gerechtId: string | null = parsed.data.gerecht_id ?? null;

        if (gerechtId) {
            const { data: g, error } = await sb
                .from('gerechten')
                .select('id, naam, beschrijving, bereidingswijze, ingredienten, ingredient_costs, porties')
                .eq('id', gerechtId)
                .eq('organization_id', orgId)
                .maybeSingle();
            if (error) return NextResponse.json({ error: error.message }, { status: 500 });
            if (!g) return NextResponse.json({ error: 'Gerecht niet gevonden' }, { status: 404 });

            naam = naam || (g.naam as string);
            porties = porties ?? (g.porties as number | null);

            const delen = [
                g.beschrijving ? `Omschrijving: ${g.beschrijving}` : '',
                Array.isArray(g.ingredienten) && g.ingredienten.length
                    ? `Ingrediënten: ${(g.ingredienten as unknown[]).map(String).join(', ')}`
                    : '',
                Array.isArray(g.ingredient_costs) && g.ingredient_costs.length
                    ? `Hoeveelheden per gast: ${(g.ingredient_costs as { naam: string; qty_pp: number; unit: string }[])
                          .map((i) => `${i.naam} ${i.qty_pp} ${i.unit}`)
                          .join(', ')}`
                    : '',
                g.bereidingswijze ? `Bereidingswijze:\n${g.bereidingswijze}` : '',
                bron,
            ].filter(Boolean);

            bron = delen.join('\n\n');
        }

        if (bron.trim().length < 10) {
            return NextResponse.json(
                {
                    error:
                        'Dit gerecht heeft nog geen bereidingswijze om te ontleden. Plak er een in, dan hak ik hem op.',
                    reden: 'leeg',
                },
                { status: 422 }
            );
        }

        /* ── Kennisbank meegeven: alleen de technieken, als shortlist ──
           Niet de hele bibliotheek meesturen. Code filtert vooraf; dat scheelt
           een factor tientallen aan invoerkosten en houdt het model bij de les. */
        const { data: technieken } = await sb
            .from('technieken')
            .select('slug, naam, apparaat, eindtextuur');

        const techniekLijst = (technieken ?? []) as { slug: string; naam: string; apparaat: string | null }[];
        const geldigeSlugs = new Set(techniekLijst.map((t) => t.slug));

        const context =
            `Gerecht: ${naam || 'naamloos'}` +
            (porties ? `\nRecept is voor ${porties} porties — reken hoeveelheden om naar PER GAST.` : '') +
            (techniekLijst.length
                ? `\n\nBekende technieken (gebruik alleen deze slugs, anders null):\n` +
                  techniekLijst.map((t) => `- ${t.slug}: ${t.naam}${t.apparaat ? ` (${t.apparaat})` : ''}`).join('\n')
                : '') +
            `\n\n--- receptuur ---\n${bron}`;

        /* ── Model ─────────────────────────────────────────────────── */
        const client = new Anthropic({ apiKey });
        const stream = client.messages.stream({
            model: MODEL,
            max_tokens: 8000,
            system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
            messages: [{ role: 'user', content: context }],
        });
        const response = await stream.finalMessage();

        if (response.usage) {
            const u = response.usage;
            logAiUsageServer({
                organization_id: orgId,
                user_id: user.id,
                action_type: 'other',
                model: MODEL,
                tokens_input: u.input_tokens,
                tokens_output: u.output_tokens,
                tokens_cache_read: u.cache_read_input_tokens ?? 0,
                tokens_cache_creation: u.cache_creation_input_tokens ?? 0,
                cost_eur_cents: estimateAiCostCents({
                    model: MODEL,
                    tokens_input: u.input_tokens,
                    tokens_output: u.output_tokens,
                    tokens_cache_read: u.cache_read_input_tokens ?? 0,
                    tokens_cache_creation: u.cache_creation_input_tokens ?? 0,
                }),
                metadata: { action: 'recept-ontleden', gerecht_id: gerechtId },
            }).catch(() => { /* niet blokkerend */ });
        }

        const blok = response.content.find((b) => b.type === 'text');
        const raw = blok && blok.type === 'text' ? blok.text.trim() : '';
        const schoon = raw.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '').trim();

        let uit: { stappen?: unknown[]; opmerkingen?: unknown };
        try {
            uit = JSON.parse(schoon);
        } catch {
            return NextResponse.json(
                { error: 'De AI gaf geen bruikbaar antwoord. Probeer het nog eens.', raw: schoon.slice(0, 400) },
                { status: 422 }
            );
        }

        /* ── Valideren: hier bewaakt code de grenzen ───────────────── */
        const ruw = Array.isArray(uit.stappen) ? uit.stappen : [];
        const weggevallen: string[] = [];

        const stappen = ruw
            .map((s, i) => {
                const o = (s ?? {}) as Record<string, unknown>;
                const stapTekst = tekst(o.tekst, 300);
                if (!stapTekst) return null;

                const plaatsRuw = tekst(o.plaats, 20);
                const plaats = (PLAATSEN as readonly string[]).includes(plaatsRuw ?? '')
                    ? (plaatsRuw as (typeof PLAATSEN)[number])
                    : 'thuis';

                const slug = tekst(o.techniek_slug, 60);
                let techniek: string | null = null;
                if (slug) {
                    if (geldigeSlugs.has(slug)) techniek = slug;
                    else weggevallen.push(slug);
                }

                return {
                    step_order: i + 1,
                    tekst: stapTekst,
                    actie: tekst(o.actie, 40),
                    prep_group: tekst(o.prep_group, 80),
                    duur_actief_min: getal(o.duur_actief_min),
                    duur_passief_min: getal(o.duur_passief_min),
                    plaats,
                    toezicht_nodig: o.toezicht_nodig === true,
                    station: tekst(o.station, 80),
                    apparaat: tekst(o.apparaat, 80),
                    techniek_slug: techniek,
                    temp_doel_c: getal(o.temp_doel_c),
                    ingredient_ref: tekst(o.ingredient_ref, 200),
                    hoeveelheid: getal(o.hoeveelheid),
                    eenheid: tekst(o.eenheid, 20),
                };
            })
            .filter((s): s is NonNullable<typeof s> => s !== null);

        if (!stappen.length) {
            return NextResponse.json({ error: 'Er kwamen geen bruikbare stappen uit.' }, { status: 422 });
        }

        /* ── Voorstel wegschrijven, niet uitvoeren ─────────────────── */
        const payload = {
            gerecht_id: gerechtId,
            naam,
            porties,
            stappen,
            opmerkingen: tekst(uit.opmerkingen, 600),
            technieken_niet_herkend: [...new Set(weggevallen)],
        };

        const { data: voorstel, error: voorstelErr } = await sb
            .from('ai_action_proposals')
            .insert({
                organization_id: orgId,
                user_id: user.id,
                proposal_type: 'recept_ontleding',
                payload,
                status: 'pending',
            })
            .select('id')
            .single();
        if (voorstelErr) return NextResponse.json({ error: voorstelErr.message }, { status: 500 });

        return NextResponse.json({
            voorstel_id: voorstel.id,
            ...payload,
            totaal_actief_min: stappen.reduce((s, x) => s + (x.duur_actief_min ?? 0), 0),
            totaal_passief_min: stappen.reduce((s, x) => s + (x.duur_passief_min ?? 0), 0),
            elapsed_ms: Date.now() - t0,
            model: MODEL,
        });
    } catch (err) {
        console.error('[recept/ontleden]', err);
        if (err instanceof Anthropic.AuthenticationError) {
            return NextResponse.json({ error: 'Ongeldige API-sleutel' }, { status: 401 });
        }
        if (err instanceof Anthropic.RateLimitError) {
            return NextResponse.json({ error: 'Even te druk bij de AI — probeer zo nog eens.' }, { status: 429 });
        }
        return NextResponse.json(
            { error: err instanceof Error ? err.message : 'Onbekende fout' },
            { status: 500 }
        );
    }
}
