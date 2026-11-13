/**
 * De melding "Dag geboekt" (ontwerp R6): zodra de kassa een dag afsluit, komt
 * er één melding in de bel met een link naar de dagpagina.
 *
 * Wordt ná het antwoord aan de tablet aangeroepen (src/lib/toonbank/naAfloop.ts).
 * Een fout hier mag de kassa nooit raken: de dagstaat is dan al bewaard.
 */
import 'server-only';
import { maakDagboeking, type Dagboeking } from './dagboeking';

export const DAG_GEBOEKT_TYPE = 'winkel_dag_geboekt';

const korteDag = (datum: string) =>
    new Date(`${datum}T12:00:00Z`).toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

/** Null bij stand `open` of `geen_verkoop`: dan komt er geen melding. */
export function dagMeldingTekst(d: Dagboeking): { title: string; body: string } | null {
    if (d.stand === 'geboekt') return { title: `Dag geboekt · ${korteDag(d.datum)}`, body: 'Alles klopt, je hoeft niets te doen.' };
    if (d.stand === 'te_controleren') {
        const n = d.punten.length;
        return { title: `Dag afgesloten · ${korteDag(d.datum)}`, body: `${n} ${n === 1 ? 'punt' : 'punten'} om naar te kijken.` };
    }
    return null;
}

/** Maakt hooguit één melding per organisatie per bedrijfsdag. Gooit nooit. */
export async function meldDagGeboekt(orgId: string, dagstaatId: string): Promise<void> {
    try {
        const [{ createServiceSupabase }, { laadDagBonnen, laadDagstaten, laadUitsluitingen }] = await Promise.all([
            import('@/lib/supabase-server'),
            import('./laden'),
        ]);
        const sb = createServiceSupabase();

        const { data: staat } = await sb.from('toonbank_dagstaten').select('bedrijfsdag').eq('organization_id', orgId).eq('id', dagstaatId).maybeSingle();
        const datum = staat?.bedrijfsdag ? String(staat.bedrijfsdag) : null;
        if (!datum) return;

        /* Een proefdag telt nergens mee, dus ook geen melding. */
        if ((await laadUitsluitingen(sb, orgId, datum, datum)).has(datum)) return;

        const { data: bestaand } = await sb.from('notifications').select('id')
            .eq('organization_id', orgId).eq('type', DAG_GEBOEKT_TYPE).eq('metadata->>bedrijfsdag', datum).limit(1);
        if (bestaand && bestaand.length > 0) return;

        const [bonnen, staten] = await Promise.all([laadDagBonnen(sb, orgId, datum, datum), laadDagstaten(sb, orgId, datum, datum)]);
        const dag = maakDagboeking(datum, bonnen.bonnen, staten.dagstaten);
        const tekst = dagMeldingTekst(dag);
        if (!tekst) return;

        const { error } = await sb.from('notifications').insert({
            organization_id: orgId, user_id: null, type: DAG_GEBOEKT_TYPE, title: tekst.title, body: tekst.body,
            link: `/winkelboek/dag/${datum}`, metadata: { bedrijfsdag: datum, stand: dag.stand },
        });
        if (error) console.error('[winkelboek] melding dag geboekt mislukt:', error.message);
    } catch (e) {
        console.error('[winkelboek] melding dag geboekt mislukt:', e instanceof Error ? e.message : String(e));
    }
}
