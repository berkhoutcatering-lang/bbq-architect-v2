/* POST /api/productie/verstoring — apparaat X is er even niet.
 *
 * Herplant de dag en geeft terug wat er verschuift en of er iets kritiek
 * wordt. Dat laatste is het punt: een herplanning die stil gebeurt kost het
 * vertrouwen in het scherm, en daarmee het hele systeem.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withTenantAuth, type TenantAuthCtx } from '@/lib/withTenantAuth';
import { valideerVerstoring } from '@/lib/keukenplanner/validators';
import { laadDag } from '@/lib/keukenplanner/laden';
import { terugrekenen } from '@/lib/keukenplanner/terugrekenen';
import { herplanMelding } from '@/lib/keukenplanner/plan';

export const runtime = 'nodejs';

export const POST = withTenantAuth(async (req: NextRequest, { supabase, orgId }: TenantAuthCtx) => {
    let body: unknown;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: 'Ongeldige JSON' }, { status: 400 });
    }

    const v = valideerVerstoring(body);
    if (!v.ok) return NextResponse.json({ error: (v as { ok: false; error: string }).error }, { status: 400 });
    const { materieelId, totMoment, reden } = v.data;

    const { data: apparaat } = await supabase
        .from('materieel')
        .select('id, naam, organization_id')
        .eq('id', materieelId)
        .maybeSingle();

    if (!apparaat) return NextResponse.json({ error: 'Apparaat niet gevonden' }, { status: 404 });
    if (apparaat.organization_id !== orgId) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 });

    const nu = new Date();
    const dag = await laadDag(supabase, orgId, nu);

    const geraakt = dag.taken.filter(
        (t) => t.apparaat?.id === materieelId && t.status !== 'done' && t.status !== 'skipped',
    );

    /* Voor de herrekening doen we alsof de getroffen taken pas kunnen starten
       als het apparaat er weer is. Is er geen eindtijd, dan is alles wat op
       dit apparaat draait van de baan tot nader order — en dan is de vraag
       niet "hoe schuift het" maar "wat halen we niet". */
    const weerBeschikbaar = totMoment ? Date.parse(totMoment) : null;
    const verschoven = geraakt.map((t) => ({
        ...t,
        geplandOp: weerBeschikbaar != null
            ? new Date(Math.max(Date.parse(t.geplandOp ?? nu.toISOString()), weerBeschikbaar)).toISOString()
            : t.geplandOp,
    }));

    const overigeTaken = dag.taken.filter((t) => !geraakt.some((g) => g.id === t.id));
    const rekening = terugrekenen({
        taken: [...overigeTaken, ...verschoven],
        uitlevering: dag.uitlevering,
        nu: nu.toISOString(),
    });

    const kritiek = [...rekening.values()].filter((r) => r.teLaat);
    const haalbaar = weerBeschikbaar != null && kritiek.length === 0;

    /* Vroegste uitlevering van vandaag, voor de tekst op het scherm. */
    const uitleveringen = Object.values(dag.uitlevering).sort();
    const eerste = uitleveringen[0] ? new Date(uitleveringen[0]) : null;
    const klok = eerste
        ? `${String(eerste.getHours()).padStart(2, '0')}:${String(eerste.getMinutes()).padStart(2, '0')}`
        : 'de uitlevering';

    const speling = haalbaar && rekening.size > 0
        ? Math.min(...[...rekening.values()].map((r) => r.margeMin))
        : null;

    const melding = herplanMelding({
        wat: `${apparaat.naam} niet beschikbaar${reden ? ` — ${reden}` : ''}`,
        verschovenTaken: geraakt.length,
        haalbaar,
        uitleveringKlok: klok,
        spelingMin: speling,
    });

    return NextResponse.json({
        ok: true,
        apparaat: apparaat.naam,
        totMoment,
        verschovenTaken: geraakt.map((t) => ({ id: t.id, titel: t.titel })),
        kritiekeTaken: kritiek.map((r) => {
            const t = dag.taken.find((x) => x.id === r.taakId);
            return { id: r.taakId, titel: t?.titel ?? 'Taak', margeMin: r.margeMin };
        }),
        haalbaar,
        melding,
    });
});
