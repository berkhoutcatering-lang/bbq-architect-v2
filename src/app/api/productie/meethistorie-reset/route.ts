/* POST /api/productie/meethistorie-reset — de teller gaat op nul.
 *
 * Bij een verhuizing, een nieuw apparaat of een andere indeling verandert de
 * werkelijkheid in één keer. Dan is doormeten alsof er niets gebeurd is
 * erger dan opnieuw beginnen: je middelt twee keukens door elkaar.
 *
 * Bewust een expliciete handeling met een verplichte reden. Zonder reden weet
 * je over een jaar niet meer waarom er een breuk in de historie zit.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withTenantAuth, type TenantAuthCtx } from '@/lib/withTenantAuth';
import { valideerMeethistorieReset } from '@/lib/keukenplanner/validators';
import { resetMeethistorie } from '@/lib/keukenplanner/meethistorie';

export const runtime = 'nodejs';

export const POST = withTenantAuth(async (req: NextRequest, { supabase, orgId }: TenantAuthCtx) => {
    let body: unknown;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: 'Ongeldige JSON' }, { status: 400 });
    }

    const v = valideerMeethistorieReset(body);
    if (!v.ok) return NextResponse.json({ error: (v as { ok: false; error: string }).error }, { status: 400 });
    const { reden, recipeStepIds } = v.data;

    const uitkomst = await resetMeethistorie(supabase, orgId, reden);

    /* De betrokken stappen terug in monitorstand: hun opgeslagen duur is
       gebaseerd op een keuken die niet meer bestaat. `handmatig` blijft staan
       — wat de kok zelf heeft ingevuld gooit een verhuizing niet weg. */
    let teruggezet = 0;
    let q = supabase
        .from('recipe_steps')
        .update({ duur_bron: 'geschat', splitsen_gevlagd: false })
        .eq('organization_id', orgId)
        .in('duur_bron', ['gemeten', 'monitor']);
    if (recipeStepIds && recipeStepIds.length > 0) q = q.in('id', recipeStepIds);

    const { data, error } = await q.select('id');
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    teruggezet = (data ?? []).length;

    return NextResponse.json({
        ok: true,
        ...uitkomst,
        stappenTeruggezet: teruggezet,
        bericht: `Historie afgesloten met ${uitkomst.metingenInOudePeriode} metingen. ${teruggezet} stappen staan weer in monitorstand.`,
    });
});
