/* POST /api/recipe/ontleed/opslaan — het goedgekeurde voorstel wordt receptuur.
 *
 * Dit is de enige plek waar de ontleder iets in de database zet, en hij doet
 * dat pas als de kok alles beslist heeft. De controle die het scherm gebruikt
 * om de knop op slot te houden draait hier nog een keer — een dichte deur die
 * je via de achterdeur kunt omzeilen is geen deur.
 *
 * Wat er niet gebeurt: kostprijzen afleiden, allergenen invullen, hoeveelheden
 * verzinnen. Dat komt uit componenten en metingen, niet uit een kookboek.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withTenantAuth, type TenantAuthCtx } from '@/lib/withTenantAuth';
import { openstaandeVragen, type Controle, type Antwoorden } from '@/lib/keukenplanner/ontleder';

export const runtime = 'nodejs';

/**
 * "Smokey's Pig Spray (zie blz. 29)" wordt "Smokey's Pig Spray".
 *
 * De verwijzing hoort bij het boek waar het recept vandaan komt, niet bij de
 * bouwsteen die hier voor altijd in de lijst blijft staan.
 */
function zonderPaginaverwijzing(naam: string): string {
    return naam.replace(/\s*\((?:zie\s+)?(?:blz\.?|pagina|p\.)\s*\d+\)\s*$/i, '').trim() || naam.trim();
}

/** Eenheden die de rest van de app kent. De kok kiest er één; wij verzinnen er geen. */
const EENHEDEN = new Set(['g', 'kg', 'ml', 'l', 'stuk']);

interface Body {
    controle?: Controle;
    antwoorden?: Antwoorden;
    /** Componenten die aangemaakt mogen worden, mét de eenheid die de kok koos. */
    nieuweComponenten?: Array<{ naam: string; eenheid: string }>;
}

export const POST = withTenantAuth(async (req: NextRequest, { supabase, orgId }: TenantAuthCtx) => {
    let body: Body;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: 'Ongeldige JSON' }, { status: 400 });
    }

    const controle = body.controle;
    if (!controle || !Array.isArray(controle.stappen) || controle.stappen.length === 0) {
        return NextResponse.json({ error: 'Geen receptuur om op te slaan' }, { status: 400 });
    }

    const antwoorden = body.antwoorden ?? {};
    const open = openstaandeVragen(controle, antwoorden);
    if (open.length > 0) {
        return NextResponse.json(
            { error: `Nog niet compleet: ${open[0]}`, openstaand: open },
            { status: 400 },
        );
    }

    const nieuw = (body.nieuweComponenten ?? [])
        .filter((c) => c?.naam && EENHEDEN.has(c.eenheid))
        .map((c) => ({ ...c, naam: zonderPaginaverwijzing(c.naam) }));

    /* 1 — Het gerecht zelf. Alleen wat we echt weten.
    
           `status` blijft concept: een recept waarvan de helft van de stappen
           nog geen tijd heeft en waar nog geen kostprijs onder hangt is niet
           klaar om een klant voor te schrijven. Dat zet je zelf op actief.
    
           `bron` is 'ai' omdat de kolom alleen manual en ai kent; dat het uit
           de ontleder komt staat op elke stap (recipe_steps.bron). */
    const { data: gerecht, error: gerechtFout } = await supabase
        .from('gerechten')
        .insert({
            organization_id: orgId,
            naam: controle.gerechtNaam,
            /* Nooit stilzwijgend tien: als het boek geen aantal noemt heeft de
               kok het ingevuld, en zonder allebei mag dit niet eens opgeslagen
               worden (openstaandeVragen blokkeert het hierboven). */
            porties: controle.porties ?? antwoorden.porties ?? 10,
            bron: 'ai',
            status: 'concept',
        })
        .select('id')
        .single();

    if (gerechtFout || !gerecht) {
        return NextResponse.json({ error: gerechtFout?.message ?? 'Gerecht aanmaken mislukte' }, { status: 500 });
    }

    /* 2 — De stappen. `duur_bron` staat op geschat: dit komt uit een boek en uit
           jouw inschatting, niet uit een meting. Zodra je hem een paar keer
           gedraaid hebt, zet het leerspoor hem op gemeten. */
    const herhaalDuren = antwoorden.herhaalDuren ?? {};

    /* Duren worden niet meer gevraagd: hoe lang 2,5 kg procureur over kern 88
       doet weet je pas als je het gemeten hebt. Wat het recept noemt gaat mee,
       de rest blijft leeg en komt uit het leerspoor. */
    const rijen = controle.stappen.map((s) => {
        return {
            organization_id: orgId,
            gerecht_id: gerecht.id,
            step_order: s.volgnummer,
            tekst: s.tekst,
            actie: s.bewerking ?? null,
            bewerking_code: s.bewerking ?? null,
            hoeveelheid: s.hoeveelheid ?? null,
            eenheid: s.eenheid ?? null,
            duur_actief_min: s.actiefMin ?? null,
            duur_passief_min: s.passiefMin ?? null,
            temp_doel_c: s.tempC ?? null,
            kern_temp_c: s.kernTempC ?? null,
            materieel_id: s.materieelId ?? null,
            herhaal_interval_min: s.herhaalIntervalMin ?? null,
            /* Wat de kok invulde wint van wat het model schatte: bij "elk half
               uur natspuiten" las het model de hele gaartijd als de duur van de
               handeling, en dat is honderdvijftig minuten werk die er niet zijn. */
            herhaal_duur_min: herhaalDuren[s.volgnummer] ?? s.herhaalDuurMin ?? null,
            toezicht_nodig: s.toezichtNodig === true,
            plaats: 'thuis' as const,
            duur_bron: 'geschat',
            bron: 'ontleder',
        };
    });

    const { data: opgeslagen, error: stapFout } = await supabase
        .from('recipe_steps')
        .insert(rijen)
        .select('id, step_order');

    if (stapFout) {
        /* Een gerecht zonder stappen is erger dan geen gerecht: het ziet er af
           uit en is het niet. Draai hem terug. */
        await supabase.from('gerechten').delete().eq('id', gerecht.id).eq('organization_id', orgId);
        return NextResponse.json({ error: `Stappen opslaan mislukte: ${stapFout.message}` }, { status: 500 });
    }

    /* 3 — Volgorde-afhankelijkheden. Pas nu te leggen, want de id's bestonden
           een moment geleden nog niet. Mislukt dit, dan is het recept er wél —
           alleen mag de planner de stappen niet door elkaar husselen. */
    const perNummer = new Map((opgeslagen ?? []).map((r) => [r.step_order as number, r.id as string]));
    const koppelingen = controle.stappen
        .filter((s) => s.hangtAfVanVolgnummer != null && perNummer.has(s.hangtAfVanVolgnummer))
        .map((s) => ({ id: perNummer.get(s.volgnummer)!, van: perNummer.get(s.hangtAfVanVolgnummer!)! }));

    let koppelWaarschuwing: string | null = null;
    for (const k of koppelingen) {
        const { error } = await supabase
            .from('recipe_steps')
            .update({ hangt_af_van_stap_id: k.van })
            .eq('id', k.id)
            .eq('organization_id', orgId);
        if (error) {
            koppelWaarschuwing = 'De stappen staan erin, maar de volgorde-verbanden niet — kijk ze even na.';
            break;
        }
    }

    /* 4 — Pas nu de bouwstenen die de kok wil aanmaken. Bewust als laatste:
           in de eerste versie stonden ze vooraan, en toen het gerecht daarna
           afketste op een constraint bleven er twee lege componenten achter die
           niemand had besteld. Kostprijs blijft leeg — die komt uit inkoop, niet
           uit een boek. De eenheid komt van de kok, want daar hangt elke latere
           hoeveelheid aan vast. */
    let componentWaarschuwing: string | null = null;
    if (nieuw.length > 0) {
        const { error } = await supabase.from('components').insert(
            nieuw.map((c) => ({
                organization_id: orgId,
                name: c.naam,
                type: 'prepared',
                category: 'food',
                base_quantity: 1,
                base_unit: c.eenheid,
                base_cost_cents: 0,
                ai_suggested: true,
                description: `Aangemaakt vanuit het recept ${controle.gerechtNaam}. Kostprijs nog invullen.`,
            })),
        );
        if (error) componentWaarschuwing = `Het recept staat erin, maar de bouwstenen niet: ${error.message}`;
    }

    return NextResponse.json({
        ok: true,
        gerechtId: gerecht.id,
        stappen: rijen.length,
        componenten: componentWaarschuwing ? 0 : nieuw.length,
        waarschuwing: componentWaarschuwing ?? koppelWaarschuwing,
    });
});
