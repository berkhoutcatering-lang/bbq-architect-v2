/* POST /api/componenten/koppel-prijzen — bouwstenen aan een echte prijs helpen.
 *
 * De receptlezer leest de ingrediëntenlijst uit het boek; deze route zoekt er
 * catalogusregels bij en rekent de kostprijs uit. De AI verzint dus nooit een
 * prijs — hij leest een naam en een hoeveelheid, en de rest komt uit Bidfood en
 * de andere leveranciers.
 *
 * **Alleen een zekere match telt mee.** In de eerste proef koppelde "citroen
 * (sap)" aan "Citroen meringues" van € 16,49 per stuk: acht euro voor een halve
 * citroen, en daarmee een kostprijs die nergens op sloeg. Zo'n match op middel
 * of laag komt hier terug als voorstel en gaat niet stilzwijgend de database in.
 * Een verkeerde kostprijs is erger dan geen kostprijs — die eerste ziet eruit
 * alsof hij klopt.
 *
 * Wat er ook niet gebeurt: een hoeveelheid verzinnen. Regels zonder hoeveelheid
 * ("zout en peper naar smaak") tellen voor niets mee en worden apart gemeld.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withTenantAuth, type TenantAuthCtx } from '@/lib/withTenantAuth';
import { recipeYieldFromRows, costPerBaseFromRecipe } from '@/lib/ingredientPricing';
import { matchIngredientenTegenCatalogus } from '@/lib/ingredientMatchDb';

export const runtime = 'nodejs';

interface IngredientRegel {
    naam: string;
    hoeveelheid?: number | null;
    eenheid?: string | null;
    /** Huishoudmaat omgerekend naar gram. Leeg als er niets om te rekenen viel. */
    gram?: number | null;
}

/**
 * De hoeveelheid waarmee gerekend wordt, en in welke eenheid.
 *
 * Grammen gaan vóór: je kunt geen theelepels optellen en niet vergelijken met
 * een catalogusprijs per kilo. Staat er al g, kg, ml of l, dan blijft dat staan —
 * daar valt niets om te rekenen en omzetten zou alleen afrondingsfouten geven.
 */
function rekenmaat(r: IngredientRegel): { hoeveelheid: number | null; eenheid: string | null } {
    const eigen = (r.eenheid ?? '').toLowerCase().trim();
    const isBasis = ['g', 'gram', 'kg', 'ml', 'l', 'liter'].includes(eigen);
    if (isBasis && typeof r.hoeveelheid === 'number' && r.hoeveelheid > 0) {
        return { hoeveelheid: r.hoeveelheid, eenheid: r.eenheid ?? null };
    }
    if (typeof r.gram === 'number' && r.gram > 0) {
        return { hoeveelheid: r.gram, eenheid: 'g' };
    }
    return { hoeveelheid: r.hoeveelheid ?? null, eenheid: r.eenheid ?? null };
}

interface Body {
    /** Welke bouwstenen. Leeg = alles wat uit de receptlezer komt en nog €0 is. */
    componentIds?: number[];
    /** Alleen rekenen en teruggeven, niets wegschrijven. */
    alleenTonen?: boolean;
}

interface Regel {
    naam: string;
    hoeveelheid: number | null;
    eenheid: string | null;
    bron: string | null;
    match: string | null;
    leverancier: string | null;
    zekerheid: string | null;
    centen: number | null;
    /** Waarom deze regel niet meetelt. Null = telt gewoon mee. */
    bezwaar: string | null;
}

export const POST = withTenantAuth(async (req: NextRequest, { supabase, orgId }: TenantAuthCtx) => {
    let body: Body = {};
    try {
        body = await req.json();
    } catch { /* leeg mag */ }

    let query = supabase
        .from('components')
        .select('id, name, ingredients, base_quantity, base_unit, base_cost_cents')
        .eq('organization_id', orgId);

    query = Array.isArray(body.componentIds) && body.componentIds.length > 0
        ? query.in('id', body.componentIds)
        : query.not('uit_gerecht_id', 'is', null);

    const { data: componenten, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    /* Hoe compleet is de catalogus waar we tegen prijzen?
    
       Zonder dit trek je de verkeerde conclusie. Bij de ranchsaus kwamen
       gedroogd bieslook, dille en uiengranulaat als "geen product gevonden"
       terug, en dat leest als "Bidfood verkoopt dat niet". In werkelijkheid
       staat de import van Bidfood sinds 31 juli op `partial`: hij is blijven
       hangen in brood-banket-en-bakproducten, en het hele droge assortiment is
       nooit binnengekomen. Een lege uitkomst mag nooit als een compleet antwoord
       gepresenteerd worden. */
    const { data: leveranciers } = await supabase
        .from('leveranciers')
        .select('naam, products_count, last_sync_status, last_sync_at')
        .eq('organization_id', orgId)
        .gt('products_count', 0);

    /* `ok` en `completed` zijn allebei "klaar" — twee woorden voor hetzelfde,
       gegroeid over verschillende importwegen. Alles daarbuiten betekent dat er
       nog iets ontbreekt. Een sync die maanden op `running` staat is niet bezig
       maar blijven hangen; dat is iets anders dan half klaar en verdient een
       eigen woord. */
    const KLAAR = new Set(['ok', 'completed']);
    const MAAND_MS = 30 * 86_400_000;

    const onvolledig = (leveranciers ?? [])
        .filter((l) => l.last_sync_status != null && !KLAAR.has(l.last_sync_status as string))
        .map((l) => {
            const stand = l.last_sync_status as string;
            const laatst = l.last_sync_at as string | null;
            const oud = laatst != null && Date.now() - Date.parse(laatst) > MAAND_MS;
            return {
                naam: l.naam as string,
                producten: l.products_count as number,
                stand,
                laatst,
                uitleg: stand === 'running' && oud
                    ? 'staat al maanden op "bezig" — waarschijnlijk halverwege blijven hangen'
                    : stand === 'never' ? 'nooit ingelezen'
                        : 'niet afgemaakt',
            };
        });

    /** "Bidfood, Sligro en Baktotaal" — geen rij van vijf keer "en". */
    const opsomming = (namen: string[]): string =>
        namen.length <= 1 ? (namen[0] ?? '')
            : `${namen.slice(0, -1).join(', ')} en ${namen[namen.length - 1]}`;

    const uitkomst: Array<Record<string, unknown>> = [];

    for (const comp of componenten ?? []) {
        const ruwe = Array.isArray(comp.ingredients) ? comp.ingredients : [];
        const regels: IngredientRegel[] = ruwe
            .map((r: unknown) => (typeof r === 'object' && r !== null ? r as IngredientRegel : null))
            .filter((r): r is IngredientRegel => r != null && typeof r.naam === 'string');

        if (regels.length === 0) {
            uitkomst.push({
                id: comp.id, naam: comp.name, status: 'geen_ingredienten',
                uitleg: 'Deze bouwsteen heeft geen ingrediëntenlijst — zonder regels valt er niets te koppelen.',
                regels: [],
            });
            continue;
        }

        const rauw = await matchIngredientenTegenCatalogus(
            supabase,
            orgId,
            regels.map((r) => {
                const m = rekenmaat(r);
                return { naam: r.naam, qty_pp: m.hoeveelheid, eenheid: m.eenheid };
            }),
        );

        /* Alleen een zekere match met een vergelijkbare eenheid telt mee. De
           rest komt terug als voorstel — zie de kop van dit bestand. */
        const gematcht: Regel[] = rauw.map((r) => {
            const m = r.match;
            const bezwaar = m == null ? 'geen product gevonden'
                : m.line_cost_cents == null ? `eenheid onvergelijkbaar (${r.eenheid || '?'} tegen ${m.base_unit})`
                : m.confidence !== 'hoog' ? `match is ${m.confidence}, niet zeker genoeg`
                : (r.qty_pp ?? 0) <= 0 ? 'geen hoeveelheid in het recept'
                : null;

            return {
                naam: r.naam,
                hoeveelheid: r.qty_pp || null,
                eenheid: r.eenheid || null,
                bron: m?.source ?? null,
                match: m?.name ?? null,
                leverancier: m?.supplier ?? null,
                zekerheid: m?.confidence ?? null,
                centen: m?.line_cost_cents ?? null,
                bezwaar,
            };
        });

        const tellenMee = gematcht.filter((r) => r.bezwaar == null && r.centen != null);
        const somCenten = tellenMee.reduce((a, r) => a + (r.centen ?? 0), 0);

        /* De opbrengst: hoeveel levert deze batch op? Uit de regels die een
           hoeveelheid hebben. Zonder opbrengst is er geen eerlijke omrekening
           naar een prijs per gram. */
        /* De opbrengst: hoeveel levert deze batch op?
        
           Milliliters tellen hier als grammen. `recipeYieldFromRows` weigert dat
           terecht in het algemeen — siroop weegt 1,4 en olie 0,92 — maar bij een
           saus van mayonaise, karnemelk en zure room zit je binnen een procent,
           en het alternatief is helemaal geen kostprijs. Mathijs' eigen norm is
           1 tot 4 procent, dus dit valt ruim binnen wat bruikbaar is. Het staat
           erbij als `opbrengstBenadering` zodat niemand denkt dat het gewogen is. */
        const maten = regels
            .map(rekenmaat)
            .filter((m) => typeof m.hoeveelheid === 'number' && m.hoeveelheid > 0 && m.eenheid);

        const vloeibaar = maten.some((m) => ['ml', 'l', 'liter'].includes((m.eenheid ?? '').toLowerCase()));
        const opbrengst = recipeYieldFromRows(
            maten.map((m) => {
                const e = (m.eenheid ?? '').toLowerCase();
                const naarGram = e === 'l' || e === 'liter' ? 1000 : e === 'ml' ? 1 : null;
                return naarGram != null
                    ? { qty: (m.hoeveelheid as number) * naarGram, unit: 'g' }
                    : { qty: m.hoeveelheid as number, unit: m.eenheid as string };
            }),
        );

        /* Een basis van 1 gram is te fijn. Kostprijs staat in hele centen, dus
           bij 0,87 cent per gram schrijf je 1 cent op en zit je er 15% naast —
           en bij 0,44 cent zelfs op nul, waarmee het gerecht weer gratis is.
        
           We kiezen daarom een basis waarbij er minstens tien centen op tafel
           liggen: dan is de afrondingsfout hooguit een half procent, ruim binnen
           de 1 tot 4 procent die hier de norm is. Dat is geen ander getal maar
           dezelfde prijs in een leesbare eenheid — zoals een catalogus "per kilo"
           schrijft en niet "per gram". */
        const GENOEG_CENTEN = 10;
        let basisHoeveelheid = Number(comp.base_quantity) || 1;
        let perBasis = opbrengst != null
            ? costPerBaseFromRecipe(somCenten, opbrengst, basisHoeveelheid, comp.base_unit as string)
            : null;

        if (opbrengst != null && perBasis != null && perBasis < GENOEG_CENTEN) {
            for (const grover of [100, 1000]) {
                if (grover <= basisHoeveelheid) continue;
                const poging = costPerBaseFromRecipe(somCenten, opbrengst, grover, comp.base_unit as string);
                if (poging != null && poging >= GENOEG_CENTEN) {
                    basisHoeveelheid = grover;
                    perBasis = poging;
                    break;
                }
            }
        }

        const onzeker = gematcht.filter((r) => r.bezwaar != null).length;

        uitkomst.push({
            id: comp.id,
            naam: comp.name,
            status: perBasis != null ? 'berekend' : 'onvolledig',
            somCenten,
            opbrengst,
            opbrengstBenadering: vloeibaar,
            nieuweKostprijsCenten: perBasis,
            nieuweBasisHoeveelheid: basisHoeveelheid,
            eenheid: comp.base_unit,
            huidigeKostprijsCenten: comp.base_cost_cents,
            gekoppeld: tellenMee.length,
            onzeker,
            totaal: gematcht.length,
            regels: gematcht,
        });

        if (!body.alleenTonen && perBasis != null && perBasis > 0) {
            await supabase
                .from('components')
                .update({ base_cost_cents: perBasis, base_quantity: basisHoeveelheid })
                .eq('id', comp.id)
                .eq('organization_id', orgId);
        }
    }

    return NextResponse.json({
        ok: true,
        alleenTonen: body.alleenTonen === true,
        componenten: uitkomst,
        /* Erbij, altijd: "niet gevonden" betekent iets anders als de catalogus
           half binnen is. */
        catalogus: {
            onvolledig,
            waarschuwing: onvolledig.length > 0
                ? `${opsomming(onvolledig.map((l) => l.naam))} ${onvolledig.length === 1 ? 'is' : 'zijn'} niet volledig ingelezen. "Geen product gevonden" kan dus ook betekenen dat het er nog niet in staat.`
                : null,
        },
    });
});
