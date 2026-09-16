/* GET /api/keukenscherm/vandaag — alles wat op de wand moet, als tekst.
 *
 * Het scherm rekent en formatteert niets. Dat is geen luiheid maar een
 * ontwerpregel: zodra het scherm zelf gaat rekenen kunnen scherm en planner
 * uit elkaar lopen, en dan hangt er een ding aan de muur dat iets anders
 * beweert dan het systeem denkt.
 *
 * Read-only. Deze route schrijft niets, ook niet stiekem.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withTenantAuth, type TenantAuthCtx } from '@/lib/withTenantAuth';
import { laadDag } from '@/lib/keukenplanner/laden';
import { bouwScherm } from '@/lib/keukenplanner/plan';
import { batch } from '@/lib/keukenplanner/batchen';
import { laadPartijStand } from '@/lib/productie/keukenscherm';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withTenantAuth(async (_req: NextRequest, { supabase, orgId }: TenantAuthCtx) => {
    const nu = new Date();

    let dag;
    try {
        dag = await laadDag(supabase, orgId, nu);
    } catch (e) {
        const bericht = e instanceof Error ? e.message : 'onbekende fout';
        return NextResponse.json({ error: `Dag laden mislukt: ${bericht}` }, { status: 500 });
    }

    /* Batchen levert hier alleen de capaciteitsmeldingen op — de taken zelf
       zijn al ingepland. Twee ladingen brisket is een melding waard, ook als
       er verder niets aan de tijdlijn verandert. */
    const dagKey = nu.toISOString().slice(0, 10);
    const { problemen } = batch(dag.taken, dagKey, (t) => ({
        duur_actief_min: t.actiefMin,
    }));

    const scherm = bouwScherm({
        taken: dag.taken,
        uitlevering: dag.uitlevering,
        nu: nu.toISOString(),
        haccpOpen: dag.haccpOpen,
        capaciteitsProblemen: problemen,
        afstandenBekend: dag.afstandenBekend,
    });

    /* Partijen: wat de taak van nu oplevert en wat er nog af te maken is.
       Los van de planner, en best-effort: valt dit weg, dan staat de rest. */
    try {
        const stand = await laadPartijStand(supabase, orgId, dag.taken, scherm.nu.taakId);
        scherm.nu.partij = stand.nuPartij;
        scherm.afTeMaken = stand.afTeMaken;
    } catch (e) {
        console.error('[keukenscherm] partijstand mislukt:', e);
        scherm.nu.partij = null;
        scherm.afTeMaken = [];
    }

    return NextResponse.json(scherm, {
        headers: {
            /* Nooit cachen. Een keukenscherm dat een oud beeld toont is
               erger dan een zwart scherm. */
            'Cache-Control': 'no-store, max-age=0',
        },
    });
});
