/**
 * Server Action: bewaar een AI-recept als gerecht.
 *
 * Zod-validatie + re-auth, organization_id expliciet mee (RLS WITH CHECK op
 * `gerechten` weigert de rij anders stilletjes).
 *
 * `total_cost_cents` gaat bewust NIET mee: die kolom wordt door de componenten-
 * trigger beheerd ("geen handmatige updates"). De kostprijs die we hier wél
 * vastleggen is `kostprijs_pp` — het bedrag dat de kostmotor uit de echte
 * catalogus heeft afgeleid.
 */

'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createServerSupabase } from '@/lib/supabase-server';

const IngredientSchema = z.object({
    naam: z.string().trim().min(1).max(200),
    /* Hoeveelheid PER PORTIE — dat is wat de bestelmotor met gasten
       vermenigvuldigt. */
    hoeveelheid: z.coerce.number().min(0),
    eenheid: z.string().trim().max(20),
    leverancier: z.string().max(120).nullable().optional(),
    uit_catalogus: z.boolean().optional().default(false),
    /* Regelkosten in centen zoals de kostmotor ze berekende. null = geen
       betrouwbare prijs gevonden; die regel gaat als 'geschat' de kaart op. */
    regel_cent: z.coerce.number().min(0).nullable().optional(),
});

/* Eén ontworpen receptstap. Zelfde velden en dezelfde woordenlijst als de
   ontleder gebruikt, zodat de planning niet hoeft te weten wie de stap
   geschreven heeft. */
const StapSchema = z.object({
    step_order: z.coerce.number().int().min(1),
    tekst: z.string().trim().min(1).max(300),
    actie: z.string().max(40).nullable().optional(),
    prep_group: z.string().max(80).nullable().optional(),
    duur_actief_min: z.coerce.number().int().min(0).max(10080).nullable().optional(),
    duur_passief_min: z.coerce.number().int().min(0).max(10080).nullable().optional(),
    plaats: z.enum(['thuis', 'bus', 'locatie']).default('thuis'),
    toezicht_nodig: z.boolean().optional().default(false),
    station: z.string().max(80).nullable().optional(),
    apparaat: z.string().max(80).nullable().optional(),
    temp_doel_c: z.coerce.number().nullable().optional(),
});

const BewaarSchema = z.object({
    naam: z.string().trim().min(1, 'Geef het gerecht een naam').max(200),
    beschrijving: z.string().max(2000).optional().default(''),
    categorie: z.string().max(60).optional().default('Vlees'),
    porties: z.coerce.number().int().min(1).max(500).optional().default(10),
    ingredienten: z.array(IngredientSchema).min(1, 'Een gerecht zonder ingrediënten kan niet'),
    bereidingswijze: z.array(z.string().max(1000)).optional().default([]),
    allergenen: z.array(z.string().max(40)).optional().default([]),
    tags: z.array(z.string().max(40)).optional().default([]),
    battle_plan_steps: z.array(z.string().max(500)).optional().default([]),
    service_tip: z.string().max(500).optional().default(''),
    /* Alleen doorgeven als de kostmotor élke regel een prijs kon geven —
       anders is het een ondergrens en zou het als kostprijs liegen. */
    kostprijs_pp: z.coerce.number().min(0).nullable().optional(),
    /* De bereiding opgehakt in handelingen. Leeg mag: dan heeft dit gerecht
       gewoon geen stappen en valt de planning terug op fase-lead-times. */
    stappen: z.array(StapSchema).max(60).optional().default([]),
});

interface Resultaat { data?: { id: string }; error?: string; fields?: Record<string, string[]> }

export async function bewaarGerecht(input: unknown): Promise<Resultaat> {
    const parsed = BewaarSchema.safeParse(input);
    if (!parsed.success) {
        return { error: 'validation', fields: parsed.error.flatten().fieldErrors as Record<string, string[]> };
    }
    const v = parsed.data;

    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'unauthorized' };

    const { data: mem } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .limit(1)
        .maybeSingle();
    const orgId = mem?.organization_id as string | undefined;
    if (!orgId) return { error: 'geen actieve organisatie gevonden' };

    /* Categorie ("Vlees", "Saus") gaat als tag mee en NIET in pos_categorie:
       die kolom stuurt de kassa-indeling aan, en daar hoort een AI-label niet
       ongevraagd in te landen. */
    const tags = Array.from(new Set([...v.tags, v.categorie].filter(Boolean)));

    /* Twee kolommen, twee doelen — en dat is geen dubbelop:
         `ingredienten`      is text[]: de leesbare regels die op het gerecht en
                             op de menukaart getoond worden.
         `ingredient_costs`  is de structuur waar de bestelmotor mee rekent
                             (qty_pp × gasten) en waar de marge op leunt.
       Alleen het eerste vullen levert een gerecht op dat er compleet uitziet
       maar nergens in de inkoop opduikt. */
    const regels = v.ingredienten.map((i) => {
        const hoeveelheid = String(Math.round(i.hoeveelheid * 1000) / 1000).replace('.', ',');
        return `${hoeveelheid} ${i.eenheid} ${i.naam}`.trim();
    });

    const kosten = v.ingredienten.map((i) => {
        const heeftPrijs = i.regel_cent != null && i.regel_cent > 0 && i.hoeveelheid > 0;
        return {
            naam: i.naam,
            /* Geen inventory_id: deze regels komen uit de leverancier-catalogus,
               niet uit de eigen voorraad. De naam-resolver van de bestelmotor
               koppelt ze alsnog als het product wél in voorraad ligt. */
            inventory_id: null,
            qty_pp: i.hoeveelheid,
            unit: i.eenheid,
            yield: 1,
            /* is_estimated=false betekent hier: de prijs komt uit een echte
               catalogus-regel, niet uit een AI-schatting. */
            is_estimated: !heeftPrijs,
            /* In euro's delen, NIET eerst op hele centen afronden. Een prijs per
               gram is een fractie van een cent: 200 g kipfilet van €7,80/kg kost
               0,78 cent per gram, en dat afronden naar 1 cent maakt er €10/kg
               van — 28% te duur, in precies het getal waar de marge op leunt. */
            estimated_price_eur: heeftPrijs
                ? Math.round(((i.regel_cent as number) / 100 / i.hoeveelheid) * 1e6) / 1e6
                : null,
            leverancier: i.leverancier ?? null,
        };
    });

    const rij: Record<string, unknown> = {
        organization_id: orgId,
        naam: v.naam,
        beschrijving: v.beschrijving,
        porties: v.porties,
        ingredienten: regels,
        ingredient_costs: kosten,
        bereidingswijze: v.bereidingswijze.join('\n'),
        allergenen: v.allergenen,
        tags,
        battle_plan_steps: v.battle_plan_steps,
        service_tip: v.service_tip,
        status: 'actief',
        actief: true,
        /* `bron` heeft een check-constraint met precies twee waarden:
           'manual' of 'ai'. De fijnere herkomst (welk ingrediënt uit de
           catalogus komt) zit al per regel in `ingredienten.uit_catalogus`. */
        bron: 'ai',
        is_in_wizard: true,
    };
    if (v.kostprijs_pp != null) rij.kostprijs_pp = v.kostprijs_pp;

    const { data, error } = await supabase
        .from('gerechten')
        .insert(rij)
        .select('id')
        .single();

    if (error) return { error: error.message };

    /* Receptstappen erbij, zodat de prep-planning meteen weet wat handwerk is,
       wat wachten is en waar het gebeurt. Tot nu toe moest de ontleder daar
       achteraf nog een keer overheen; die tweede ronde vervalt voor alles wat
       de ontwerper zelf bedenkt.

       `bron: 'ontwerper'` en niet 'ontleder': deze tijden zijn niet uit een
       bestaand recept gelezen maar door de kok bedacht bij het ontwerp. Dat is
       een voorstel dat Mathijs goedkeurt, geen meting — en dat verschil hoort
       terug te vinden te zijn.

       Faalt dit, dan blijft het gerecht staan. Een gerecht zonder stappen is
       bruikbaar; geen gerecht is dat niet. */
    if (v.stappen.length > 0) {
        const stapRijen = v.stappen.map((st, i) => ({
            organization_id: orgId,
            gerecht_id: data.id,
            step_order: i + 1,
            tekst: st.tekst,
            actie: st.actie ?? null,
            prep_group: st.prep_group ?? null,
            duur_actief_min: st.duur_actief_min ?? null,
            duur_passief_min: st.duur_passief_min ?? null,
            plaats: st.plaats,
            toezicht_nodig: st.toezicht_nodig ?? false,
            station: st.station ?? null,
            apparaat: st.apparaat ?? null,
            temp_doel_c: st.temp_doel_c ?? null,
            bron: 'ontwerper',
        }));
        const { error: stapErr } = await supabase.from('recipe_steps').insert(stapRijen);
        if (stapErr) console.error('[bewaarGerecht] stappen niet bewaard:', stapErr.message);
    }

    revalidatePath('/gerechten');
    revalidatePath('/gerechten/' + String(data.id));
    return { data: { id: String(data.id) } };
}
