/**
 * Een meting wegschrijven bij het klaar melden van een taak.
 *
 * Dit is de hele reden dat de stappen zo klein zijn. Een meting van "pulled
 * pork maken, zes uur" zegt niets. Een meting van "8 kg buikspek portioneren"
 * zegt alles.
 *
 * Twee dingen die hier bewaakt worden:
 *
 *   1. **Onderbroken telt niet mee.** De rij wordt wél bewaard — je wilt
 *      later kunnen zien hoe vaak het gebeurt — maar de schatter slaat hem
 *      over. Zonder dat vinkje zit er straks een duur van 24 minuten in
 *      omdat de leverancier aanbelde.
 *   2. **Best-effort.** Een mislukte meting mag de klaar-melding nooit
 *      blokkeren. Een kok die op Klaar drukt en een foutmelding krijgt voor
 *      iets waar hij niets mee te maken heeft, drukt de volgende keer niet.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { lopendePeriodeId } from './meethistorie';

export interface MetingTaak {
    id: number;
    started_at?: string | null;
    recipe_step_id?: string | null;
    schoonmaaktaak_id?: number | null;
    bewerking_code?: string | null;
    component_id?: number | null;
    target_unit?: string | null;
    stuk_gewicht_kg?: number | null;
}

export interface MetingUitkomst {
    /** Is er een rij weggeschreven? */
    vastgelegd: boolean;
    /** Telt hij mee in de schatting? Onderbroken metingen niet. */
    gemeten: boolean;
    werkelijkeMin: number | null;
    /** Waarom er niets is vastgelegd, als dat zo is. */
    reden?: string;
}

/** Boven deze duur is het geen taak meer maar een vergeten stopknop. */
const MAX_TAAKDUUR_MIN = 16 * 60;

export async function schrijfMeting(
    supabase: SupabaseClient,
    orgId: string,
    invoer: {
        taak: MetingTaak;
        actualQty: number | null;
        onderbroken: boolean;
        completedAt?: string | null;
    },
): Promise<MetingUitkomst> {
    const { taak, actualQty, onderbroken, completedAt } = invoer;

    /* Zonder starttijd is er geen duur. Dat is geen fout: iemand kan een taak
       afvinken die hij nooit gestart heeft. */
    if (!taak.started_at) {
        return { vastgelegd: false, gemeten: false, werkelijkeMin: null, reden: 'taak is nooit gestart' };
    }

    /* Een meting moet ergens aan hangen, anders kan de schatter er niets mee. */
    if (!taak.recipe_step_id && !taak.schoonmaaktaak_id && !taak.bewerking_code) {
        return { vastgelegd: false, gemeten: false, werkelijkeMin: null, reden: 'taak hangt niet aan een stap of bewerking' };
    }

    const eind = completedAt ? Date.parse(completedAt) : Date.now();
    const werkelijkeMin = Math.round(((eind - Date.parse(taak.started_at)) / 60000) * 10) / 10;

    if (!(werkelijkeMin > 0)) {
        return { vastgelegd: false, gemeten: false, werkelijkeMin: null, reden: 'duur is nul of negatief' };
    }
    if (werkelijkeMin > MAX_TAAKDUUR_MIN) {
        /* Hij is gisteren op Start gedrukt en vandaag pas op Klaar. Zo'n
           uitschieter zou de mediaan jarenlang vervuilen, dus we bewaren hem
           als onderbroken in plaats van hem mee te tellen. */
        return await voegToe(supabase, orgId, taak, werkelijkeMin, actualQty, true, 'duur lijkt een vergeten stopknop');
    }

    return await voegToe(supabase, orgId, taak, werkelijkeMin, actualQty, onderbroken);
}

async function voegToe(
    supabase: SupabaseClient,
    orgId: string,
    taak: MetingTaak,
    werkelijkeMin: number,
    hoeveelheid: number | null,
    onderbroken: boolean,
    reden?: string,
): Promise<MetingUitkomst> {
    try {
        const periodeId = await lopendePeriodeId(supabase, orgId);
        if (periodeId == null) {
            return { vastgelegd: false, gemeten: false, werkelijkeMin, reden: 'geen lopende meetperiode' };
        }

        const { error } = await supabase.from('taakmetingen').insert({
            organization_id: orgId,
            periode_id: periodeId,
            recipe_step_id: taak.recipe_step_id ?? null,
            schoonmaaktaak_id: taak.schoonmaaktaak_id ?? null,
            prep_task_id: taak.id,
            bewerking_code: taak.bewerking_code ?? null,
            component_id: taak.component_id ?? null,
            werkelijke_min: werkelijkeMin,
            hoeveelheid,
            eenheid: taak.target_unit ?? null,
            stuk_gewicht_kg: taak.stuk_gewicht_kg ?? null,
            tijdstip_van_dag: new Date().getHours(),
            onderbroken,
            bron: 'gemeten',
        });

        if (error) {
            console.warn('[keukenplanner] meting niet vastgelegd:', error.message);
            return { vastgelegd: false, gemeten: false, werkelijkeMin, reden: error.message };
        }

        return { vastgelegd: true, gemeten: !onderbroken, werkelijkeMin, reden };
    } catch (e) {
        console.warn('[keukenplanner] meting mislukt:', e);
        return { vastgelegd: false, gemeten: false, werkelijkeMin, reden: 'onverwachte fout' };
    }
}
