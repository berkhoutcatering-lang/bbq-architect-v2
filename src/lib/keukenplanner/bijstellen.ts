/**
 * De leerlus sluiten.
 *
 * Meten alleen is niets waard: er moet ook iets met die metingen gebeuren.
 * Deze module leest wat er gemeten is, laat de schatter er zijn oordeel over
 * geven, en schrijft dat terug naar de receptstappen — maar alleen als de
 * afwijking groot genoeg is.
 *
 * Draait na het klaar melden van een taak. Best-effort: als dit faalt is de
 * taak nog steeds klaar. Een kok die een foutmelding krijgt omdat de
 * statistiek niet lukte, drukt de volgende keer niet meer op Klaar.
 *
 * **Waarom op de bewerking en niet op de stap.** Bij duizend gerechten maal
 * vijftien stappen haalt geen enkele losse stap ooit vijf metingen. Dezelfde
 * bewerking op hetzelfde component wél: ui snipperen is binnen een week
 * volwassen, of het nu in gerecht 12 of gerecht 840 zit. Alle stappen met
 * dezelfde bewerking erven daarom dezelfde geleerde duur.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { schat, moetBijstellen, splitsVastEnPerEenheid } from './schatter';
import { lopendePeriodeId, metingenVoorBewerking } from './meethistorie';

export interface BijstelUitkomst {
    bijgesteld: boolean;
    stappenGeraakt: number;
    nieuweDuurMin: number | null;
    stand: 'geen' | 'monitor' | 'gemeten';
    splitsen: boolean;
    reden: string;
}

/**
 * Werk de schatting bij voor één bewerking + component.
 *
 * @param passief Bij een passieve gaarstap wordt er niet op tijd geleerd —
 *   die eindigt op kerntemperatuur en houdt het etiket `verwacht`.
 */
export async function stelBij(
    supabase: SupabaseClient,
    orgId: string,
    bewerkingCode: string,
    componentId: number | null,
    opties: { passief?: boolean } = {},
): Promise<BijstelUitkomst> {
    const leeg: BijstelUitkomst = {
        bijgesteld: false, stappenGeraakt: 0, nieuweDuurMin: null,
        stand: 'geen', splitsen: false, reden: 'niets te doen',
    };

    try {
        const periodeId = await lopendePeriodeId(supabase, orgId);
        if (periodeId == null) return { ...leeg, reden: 'geen lopende meetperiode' };

        const metingen = await metingenVoorBewerking(supabase, orgId, periodeId, bewerkingCode, componentId);
        const uitkomst = schat(metingen, opties);

        /* De stappen die deze bewerking gebruiken. `handmatig` blijft buiten
           schot: wat de kok zelf heeft ingevuld overschrijft de statistiek
           niet — hij weet iets wat de metingen niet weten. */
        let q = supabase
            .from('recipe_steps')
            .select('id, duur_vast_min, duur_per_eenheid_min, duur_actief_min, duur_bron')
            .eq('organization_id', orgId)
            .eq('bewerking_code', bewerkingCode)
            .neq('duur_bron', 'handmatig');
        q = componentId == null ? q.is('component_id', null) : q.eq('component_id', componentId);

        const { data: stappen } = await q;
        const rijen = (stappen ?? []) as Array<{
            id: string;
            duur_vast_min: number | null;
            duur_per_eenheid_min: number | null;
            duur_actief_min: number | null;
            duur_bron: string | null;
        }>;
        if (rijen.length === 0) return { ...leeg, stand: uitkomst.stand, reden: 'geen stappen met deze bewerking' };

        /* De spreidingsvlag zetten we altijd, ook als de duur niet verandert:
           een stap die verkeerd gedefinieerd is moet zichtbaar worden, ook
           als hij toevallig een stabiele mediaan heeft. */
        const patch: Record<string, unknown> = { splitsen_gevlagd: uitkomst.splitsen };

        if (uitkomst.durMin == null) {
            await pas(supabase, orgId, rijen.map((r) => r.id), patch);
            return {
                bijgesteld: false, stappenGeraakt: rijen.length, nieuweDuurMin: null,
                stand: uitkomst.stand, splitsen: uitkomst.splitsen, reden: uitkomst.reden,
            };
        }

        /* Vast en per eenheid scheiden mag pas als de hoeveelheden genoeg
           uiteenlopen. Lukt dat niet, dan één duur voor de hele stap. */
        const splitsing = splitsVastEnPerEenheid(metingen);

        const huidig = rijen[0];
        const huidigeDuur = huidig.duur_vast_min ?? huidig.duur_actief_min ?? null;
        const veranderen = moetBijstellen(huidigeDuur, uitkomst.durMin);

        if (!veranderen) {
            await pas(supabase, orgId, rijen.map((r) => r.id), patch);
            return {
                bijgesteld: false, stappenGeraakt: rijen.length, nieuweDuurMin: uitkomst.durMin,
                stand: uitkomst.stand, splitsen: uitkomst.splitsen,
                reden: 'afwijking onder de drempel — de planning verspringt niet bij elke meting',
            };
        }

        if (splitsing) {
            patch.duur_vast_min = Math.round(splitsing.vastMin);
            patch.duur_per_eenheid_min = splitsing.perEenheidMin;
        } else {
            patch.duur_vast_min = Math.round(uitkomst.durMin);
            patch.duur_per_eenheid_min = null;
        }
        patch.duur_bron = uitkomst.stand === 'gemeten' ? 'gemeten' : 'monitor';

        await pas(supabase, orgId, rijen.map((r) => r.id), patch);

        return {
            bijgesteld: true, stappenGeraakt: rijen.length, nieuweDuurMin: uitkomst.durMin,
            stand: uitkomst.stand, splitsen: uitkomst.splitsen, reden: uitkomst.reden,
        };
    } catch (e) {
        console.warn('[keukenplanner] bijstellen mislukt:', e);
        return { ...leeg, reden: 'onverwachte fout' };
    }
}

async function pas(
    supabase: SupabaseClient,
    orgId: string,
    ids: string[],
    patch: Record<string, unknown>,
): Promise<void> {
    if (ids.length === 0) return;
    const { error } = await supabase
        .from('recipe_steps')
        .update(patch)
        .eq('organization_id', orgId)
        .in('id', ids);
    if (error) console.warn('[keukenplanner] stappen bijwerken mislukt:', error.message);
}
