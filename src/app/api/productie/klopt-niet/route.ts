/* POST /api/productie/klopt-niet — de kok keurt een schatting af.
 *
 * Zonder deze knop gaat hij het scherm negeren zodra het er een paar keer
 * naast zit, en dan is het hele systeem dood. Daarom is dit geen randgeval
 * maar een eersteklas actie: hij geeft de werkelijke duur op, die telt als
 * volwaardige meting mee, en de dag wordt opnieuw gerekend.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withTenantAuth, type TenantAuthCtx } from '@/lib/withTenantAuth';
import { valideerKloptNiet } from '@/lib/keukenplanner/validators';
import { lopendePeriodeId } from '@/lib/keukenplanner/meethistorie';

export const runtime = 'nodejs';

export const POST = withTenantAuth(async (req: NextRequest, { supabase, orgId }: TenantAuthCtx) => {
    let body: unknown;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: 'Ongeldige JSON' }, { status: 400 });
    }

    const v = valideerKloptNiet(body);
    if (!v.ok) return NextResponse.json({ error: (v as { ok: false; error: string }).error }, { status: 400 });
    const { taakId, werkelijkeMin, hoeveelheid, onderbroken } = v.data;

    const { data: taak, error: taakFout } = await supabase
        .from('prep_tasks')
        .select('id, organization_id, recipe_step_id, schoonmaaktaak_id, bewerking_code, component_id, target_unit, stuk_gewicht_kg')
        .eq('id', taakId)
        .maybeSingle();

    if (taakFout) return NextResponse.json({ error: taakFout.message }, { status: 500 });
    if (!taak) return NextResponse.json({ error: 'Taak niet gevonden' }, { status: 404 });
    if (taak.organization_id !== orgId) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 });

    /* Een meting moet ergens aan hangen, anders kan de schatter er niets mee.
       Hangt de taak nergens aan, dan is het geen meting maar een notitie. */
    if (!taak.recipe_step_id && !taak.schoonmaaktaak_id && !taak.bewerking_code) {
        return NextResponse.json(
            { error: 'Deze taak hangt niet aan een receptstap of bewerking — er valt niets te leren' },
            { status: 409 },
        );
    }

    const periodeId = await lopendePeriodeId(supabase, orgId);
    if (periodeId == null) {
        return NextResponse.json({ error: 'Geen lopende meetperiode' }, { status: 500 });
    }

    const { error: metingFout } = await supabase.from('taakmetingen').insert({
        organization_id: orgId,
        periode_id: periodeId,
        recipe_step_id: taak.recipe_step_id,
        schoonmaaktaak_id: taak.schoonmaaktaak_id,
        prep_task_id: taak.id,
        bewerking_code: taak.bewerking_code,
        component_id: taak.component_id,
        werkelijke_min: werkelijkeMin,
        hoeveelheid,
        eenheid: taak.target_unit,
        stuk_gewicht_kg: taak.stuk_gewicht_kg,
        tijdstip_van_dag: new Date().getHours(),
        onderbroken,
        bron: 'klopt_niet',
    });

    if (metingFout) return NextResponse.json({ error: metingFout.message }, { status: 500 });

    return NextResponse.json({
        ok: true,
        /* Eerlijk over wat er wel en niet gebeurt: een onderbroken meting
           wordt bewaard maar telt niet mee, anders zit er straks een duur van
           24 minuten in omdat de leverancier aanbelde. */
        meegeteld: !onderbroken,
        bericht: onderbroken
            ? 'Genoteerd. Omdat je onderbroken was telt deze niet mee in de schatting.'
            : 'Genoteerd. Deze telt mee vanaf nu.',
    });
});
