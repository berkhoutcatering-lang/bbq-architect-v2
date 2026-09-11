/**
 * De brug tussen database en planner.
 *
 * De planner zelf raakt de database niet aan — dat is de hele reden dat hij
 * te testen is. Deze module haalt op wat hij nodig heeft en giet het in het
 * model uit `types.ts`. Alle rekenwerk gebeurt daarna, niet hier.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Apparaat, Taak, TaakStatus, DuurBron } from './types';
import { actieveDuurMin, passieveDuurMin } from './duur';
import { kiesApparaat, bepaalFlessenhals, vraagPerApparaat, type ApparaatMetKundes } from './estafette';

export interface DagInvoer {
    taken: Taak[];
    uitlevering: Record<number, string>;
    haccpOpen: number;
    afstandenBekend: boolean;
    /** Waar de dag op vastloopt, en hoe vol dat toestel zit. */
    flessenhals: { apparaatId: number | null; naam: string | null; bezettingsgraad: number; krap: boolean };
}

/** Van welk moment tot welk moment "vandaag" loopt voor de keuken. */
export function dagvenster(nu: Date): { van: string; tot: string } {
    /* De dag draait om 04:00, niet om middernacht: wie om half twee 's nachts
       nog een brisket opzet is met de vorige dag bezig. */
    const start = new Date(nu);
    if (start.getHours() < 4) start.setDate(start.getDate() - 1);
    start.setHours(4, 0, 0, 0);
    const eind = new Date(start);
    eind.setDate(eind.getDate() + 1);
    return { van: start.toISOString(), tot: eind.toISOString() };
}

interface TaakRij {
    id: number;
    text: string | null;
    status: string | null;
    scheduled_at: string | null;
    started_at: string | null;
    event_id: number | null;
    gerecht_id: string | null;
    component_id: number | null;
    station_id: number | null;
    materieel_id: number | null;
    bewerking_code: string | null;
    target_qty: number | null;
    target_unit: string | null;
    stuk_gewicht_kg: number | null;
    duur_actief_min: number | null;
    duur_passief_min: number | null;
    duration_min: number | null;
    verwacht_eind: string | null;
    bevestigd_eind: string | null;
    batch_id: string | null;
    lading_nr: number | null;
    toezicht_nodig: boolean | null;
    recipe_step_id: string | null;
    schoonmaaktaak_id: number | null;
    kunde: string | null;
}

interface StapRij {
    id: string;
    tekst: string;
    bewerking_code: string | null;
    duur_vast_min: number | null;
    duur_per_eenheid_min: number | null;
    duur_actief_min: number | null;
    duur_passief_min: number | null;
    passief_ref_kg: number | null;
    herhaal_interval_min: number | null;
    herhaal_duur_min: number | null;
    toezicht_nodig: boolean;
    temp_doel_c: number | null;
    duur_bron: string | null;
    houdbaarheid_na_dagen: number | null;
    station_id: number | null;
    materieel_id: number | null;
    kunde: string | null;
    hangt_af_van_stap_id: string | null;
}

/**
 * Haalt alles op wat de dag nodig heeft.
 *
 * Bewust één functie met een handvol queries in plaats van een laag met
 * repositories: het is één scherm dat één keer per dertig seconden ververst,
 * en zes losse queries zijn hier leesbaarder dan een abstractie.
 */
export async function laadDag(
    supabase: SupabaseClient,
    orgId: string,
    nu: Date,
): Promise<DagInvoer> {
    const venster = dagvenster(nu);

    const [takenRes, stationsRes, materieelRes, afstandenRes, haccpRes] = await Promise.all([
        supabase
            .from('prep_tasks')
            .select('id, text, status, scheduled_at, started_at, event_id, gerecht_id, component_id, station_id, materieel_id, bewerking_code, target_qty, target_unit, stuk_gewicht_kg, duur_actief_min, duur_passief_min, duration_min, verwacht_eind, bevestigd_eind, batch_id, lading_nr, toezicht_nodig, recipe_step_id, schoonmaaktaak_id, kunde')
            .eq('organization_id', orgId)
            .gte('scheduled_at', venster.van)
            .lt('scheduled_at', venster.tot)
            .order('scheduled_at', { ascending: true }),
        supabase.from('kitchen_stations').select('id, name, is_fysiek, exclusief').eq('organization_id', orgId),
        supabase
            .from('materieel')
            .select('id, naam, aanzet_min, opwarm_min, warm_blijft_min, schoonmaak_min, exclusief_bezet, concurrent_jobs, capaciteit_waarde, capaciteit_eenheid, kookoppervlak_cm2, temp_min_c, temp_max_c, maakt_mogelijk')
            .eq('organization_id', orgId),
        supabase.from('station_afstanden').select('id').eq('organization_id', orgId).limit(1),
        /* "Open HACCP" op de statusbalk = registraties die aandacht vragen.
           Bewust niet "onbevestigd": `confirmed_by_user_id` wordt nergens
           gevuld (0 van 165 op 8 sep 2026), dus dat zou elke registratie ooit
           als open tonen — en een teller die altijd hoog staat wordt genegeerd.
           De statussen die er zijn: ok, warn, danger. */
        supabase
            .from('haccp_records')
            .select('id', { count: 'exact', head: true })
            .eq('organization_id', orgId)
            .in('status', ['warn', 'danger'])
            .gte('created_at', dagvenster(nu).van),
    ]);

    const taakRijen = (takenRes.data ?? []) as TaakRij[];

    const stapIds = taakRijen.map((t) => t.recipe_step_id).filter((v): v is string => v != null);
    const stappen = new Map<string, StapRij>();
    if (stapIds.length > 0) {
        const { data } = await supabase
            .from('recipe_steps')
            .select('id, tekst, bewerking_code, duur_vast_min, duur_per_eenheid_min, duur_actief_min, duur_passief_min, passief_ref_kg, herhaal_interval_min, herhaal_duur_min, toezicht_nodig, temp_doel_c, duur_bron, houdbaarheid_na_dagen, station_id, materieel_id, kunde, hangt_af_van_stap_id')
            .eq('organization_id', orgId)
            .in('id', stapIds);
        for (const r of (data ?? []) as StapRij[]) stappen.set(r.id, r);
    }

    const eventIds = [...new Set(taakRijen.map((t) => t.event_id).filter((v): v is number => v != null))];
    const uitlevering: Record<number, string> = {};
    if (eventIds.length > 0) {
        const { data } = await supabase
            .from('events')
            .select('id, date, start_time')
            .eq('organization_id', orgId)
            .in('id', eventIds);
        for (const e of (data ?? []) as Array<{ id: number; date: string | null; start_time: string | null }>) {
            if (!e.date) continue;
            uitlevering[e.id] = new Date(`${e.date}T${e.start_time ?? '16:00'}`).toISOString();
        }
    }

    const stations = new Map<number, { naam: string }>(
        ((stationsRes.data ?? []) as Array<{ id: number; name: string }>).map((s) => [s.id, { naam: s.name }]),
    );

    const apparaten = new Map<number, Apparaat>(
        ((materieelRes.data ?? []) as Array<Record<string, unknown>>).map((m) => [
            m.id as number,
            {
                id: m.id as number,
                naam: (m.naam as string) ?? 'Apparaat',
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
                kundes: (m.maakt_mogelijk as string[]) ?? [],
                stationId: null,
            },
        ]),
    );

    /* Afhankelijkheden lopen via prep_task_dependencies; de stap-keten uit
       recipe_steps.hangt_af_van_stap_id komt daar via de stap-id bovenop. */
    const { data: depsData } = await supabase
        .from('prep_task_dependencies')
        .select('task_id, depends_on_id')
        .eq('organization_id', orgId);
    const deps = new Map<number, number[]>();
    for (const d of (depsData ?? []) as Array<{ task_id: number; depends_on_id: number }>) {
        const lijst = deps.get(d.task_id);
        if (lijst) lijst.push(d.depends_on_id);
        else deps.set(d.task_id, [d.depends_on_id]);
    }

    /* Stap-id → taak-id, zodat een afhankelijkheid tussen receptstappen ook
       een afhankelijkheid tussen de taken van vandaag wordt. */
    const taakVanStap = new Map<string, number>();
    for (const t of taakRijen) if (t.recipe_step_id) taakVanStap.set(t.recipe_step_id, t.id);

    /* Alles met kundes erbij, zodat de planner kan kiezen in plaats van
       gehoorzamen. */
    const metKundes: ApparaatMetKundes[] = [...apparaten.values()].map((a) => ({ ...a, kundes: a.kundes ?? [] }));

    const taken: Taak[] = taakRijen.map((rij) => {
        const stap = rij.recipe_step_id ? stappen.get(rij.recipe_step_id) : undefined;
        const stationId = rij.station_id ?? stap?.station_id ?? null;

        /* Een vast toestel op de taak of de stap wint altijd: soms hóórt iets
           op één machine (de Bizerba is de Bizerba). Anders kiest de planner
           op grond van de gevraagde kunde. */
        const vastId = rij.materieel_id ?? stap?.materieel_id ?? null;
        const kunde = rij.kunde ?? stap?.kunde ?? null;
        const apparaat = vastId != null ? (apparaten.get(vastId) ?? null) : null;
        const apparaatReden: string | null = apparaat ? `${apparaat.naam} staat vast op deze stap` : null;

        const actief = stap
            ? actieveDuurMin(stap, rij.target_qty)
            : (rij.duur_actief_min ?? rij.duration_min ?? null);
        const passief = stap
            ? passieveDuurMin(stap, rij.stuk_gewicht_kg)
            : (rij.duur_passief_min ?? null);

        const uitStap = stap?.hangt_af_van_stap_id
            ? taakVanStap.get(stap.hangt_af_van_stap_id)
            : undefined;
        const hangtAfVan = [...(deps.get(rij.id) ?? [])];
        if (uitStap != null && !hangtAfVan.includes(uitStap)) hangtAfVan.push(uitStap);

        return {
            id: rij.id,
            titel: rij.text || stap?.tekst || 'Taak',
            kunde,
            apparaatReden,
            toelichting: stap && rij.text && stap.tekst !== rij.text ? stap.tekst : null,
            recipeStepId: rij.recipe_step_id,
            schoonmaaktaakId: rij.schoonmaaktaak_id,
            eventId: rij.event_id,
            bewerkingCode: rij.bewerking_code ?? stap?.bewerking_code ?? null,
            componentId: rij.component_id,
            stationId,
            stationNaam: stationId != null ? (stations.get(stationId)?.naam ?? null) : null,
            apparaat,
            hoeveelheid: rij.target_qty,
            eenheid: rij.target_unit,
            stukGewichtKg: rij.stuk_gewicht_kg,
            actiefMin: actief,
            passiefMin: passief,
            duurBron: leesDuurBron(stap?.duur_bron, stap?.temp_doel_c ?? null),
            herhaalIntervalMin: stap?.herhaal_interval_min ?? null,
            herhaalDuurMin: stap?.herhaal_duur_min ?? null,
            toezichtNodig: rij.toezicht_nodig ?? stap?.toezicht_nodig ?? false,
            tempDoelC: stap?.temp_doel_c ?? null,
            houdbaarheidNaDagen: stap?.houdbaarheid_na_dagen ?? null,
            hangtAfVan,
            status: leesStatus(rij.status),
            geplandOp: rij.scheduled_at,
            gestartOp: rij.started_at,
            verwachtEind: rij.verwacht_eind,
            bevestigdEind: rij.bevestigd_eind,
            batchId: rij.batch_id,
            ladingNr: rij.lading_nr,
        };
    });

    /* ── Tweede ronde: wie krijgt welk toestel? ──────────────────────
       Dit kan pas nu, want om de flessenhals te ontzien moet je eerst weten
       wie dat is — en dat volgt uit de taken die hun toestel al vast hebben.

       Volgorde is dus: vaste toestellen tellen → flessenhals bepalen →
       de rest kiezen. Andersom zou de planner de smoker volplannen en daarna
       ontdekken dat hij de smoker had moeten ontzien. */
    const flessenhalsUit = bepaalFlessenhals(vraagPerApparaat(taken));
    const bezet = vraagPerApparaat(taken);

    for (const t of taken) {
        if (t.apparaat || !t.kunde) continue;
        const keuze = kiesApparaat(
            { kunde: t.kunde, tempC: t.tempDoelC ?? null },
            metKundes,
            { flessenhalsId: flessenhalsUit.apparaatId, bezetMin: bezet },
        );
        if (!keuze) {
            /* Niets in huis dat dit kan. Eerlijk laten staan: het scherm meldt
               het, en de planner doet niet alsof er een toestel is. */
            t.apparaatReden = `Geen apparaat dat "${t.kunde}" kan`;
            continue;
        }
        t.apparaat = keuze.apparaat;
        t.apparaatReden = keuze.reden;

        /* Meetellen, zodat de volgende taak ziet dat dit toestel voller wordt
           en niet alles op hetzelfde ding belandt. */
        const erbij = (keuze.apparaat.aanzetMin ?? 0) + (keuze.apparaat.opwarmMin ?? 0)
            + (t.actiefMin ?? 0) + (t.passiefMin ?? 0);
        bezet.set(keuze.apparaat.id, (bezet.get(keuze.apparaat.id) ?? 0) + erbij);
    }

    /* Opnieuw bepalen: door de keuzes hierboven kan de flessenhals verschoven
       zijn. Dit is wat het scherm laat zien. */
    const flessenhals = bepaalFlessenhals(vraagPerApparaat(taken));

    return {
        taken,
        uitlevering,
        haccpOpen: haccpRes.count ?? 0,
        afstandenBekend: (afstandenRes.data ?? []).length > 0,
        flessenhals: {
            apparaatId: flessenhals.apparaatId,
            naam: flessenhals.apparaatId != null
                ? (apparaten.get(flessenhals.apparaatId)?.naam ?? null)
                : null,
            bezettingsgraad: flessenhals.bezettingsgraad,
            krap: flessenhals.krap,
        },
    };
}

function leesStatus(v: string | null): TaakStatus {
    const geldig: TaakStatus[] = ['planned', 'queued', 'in_progress', 'done', 'skipped', 'blocked'];
    return geldig.includes(v as TaakStatus) ? (v as TaakStatus) : 'planned';
}

/**
 * Een stap met een kerntemperatuur eindigt op een waarneming, niet op de
 * klok. Die draagt daarom altijd het etiket `verwacht`, wat er ook in de
 * kolom staat.
 */
function leesDuurBron(v: string | null | undefined, tempDoelC: number | null): DuurBron {
    if (tempDoelC != null) return 'verwacht';
    const geldig: DuurBron[] = ['geschat', 'monitor', 'gemeten', 'handmatig', 'verwacht'];
    return geldig.includes(v as DuurBron) ? (v as DuurBron) : 'geschat';
}
