/**
 * Publieke leesroute voor hopbites.nl — wat Mathijs vanuit het scherm
 * "Website" heeft bijgestuurd. Blok B1 uit BOUWBRIEF-BEHEERSCHERM.md.
 *
 * Zelfde patroon als /api/public-bestelling: tenant via organizations.slug,
 * lezen met de service-role client, geen auth-gate. Alleen GET — de site
 * schrijft hier niets terug.
 *
 * Dit is bewust een ándere route dan de verkoop-API. Die zegt of er een doos
 * te koop is; deze zegt of de deur open staat. Zouden die uit dezelfde bron
 * komen, dan zou een storing in de verkoop een gesloten winkel betekenen.
 *
 * De site cachet dit antwoord 30 seconden en maakt alles nog eens schoon bij
 * binnenkomst. Bouw hier dus niets slims; geef door wat er staat, minus wat
 * voorbij is (zie lib/websiteBijsturing.ts).
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createServiceSupabase } from '@/lib/supabase-server';
import { naarContract, type BijsturingRij, type OpeningstijdRij } from '@/lib/websiteBijsturing';

export const dynamic = 'force-dynamic';

const SLUG_OK = /^[a-z0-9-]{1,60}$/;

export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ slug: string }> },
) {
    const { slug } = await params;
    if (!slug || !SLUG_OK.test(slug)) {
        return NextResponse.json({ error: 'Geen slug' }, { status: 400 });
    }

    const supabase = createServiceSupabase();
    const { data: org } = await supabase
        .from('organizations')
        .select('id')
        .eq('slug', slug)
        .maybeSingle();
    if (!org) return NextResponse.json({ error: 'Niet gevonden' }, { status: 404 });

    const [{ data: rij, error: fout1 }, { data: dagen, error: fout2 }] = await Promise.all([
        supabase
            .from('website_bijsturing')
            .select('sluiting_reden, sluiting_tot, sluiting_actief, weekaanbod_van, weekaanbod_tot, weekaanbod_titel, weekaanbod_tekst, weekaanbod_producten, uitverkocht')
            .eq('organization_id', org.id)
            .maybeSingle(),
        supabase
            .from('website_openingstijden')
            .select('datum, van, tot, gesloten')
            .eq('organization_id', org.id),
    ]);

    /* Een databasefout is geen "niets bijgestuurd". De site kent 'onbereikbaar'
       als eigen toestand en valt dan terug op haar schakelaars; een leeg
       antwoord zou hier "winkel gewoon open" betekenen terwijl we het niet
       weten. */
    if (fout1 || fout2) {
        return NextResponse.json({ error: 'Tijdelijk niet beschikbaar' }, { status: 503 });
    }

    const contract = naarContract(
        (rij ?? null) as BijsturingRij | null,
        (dagen ?? []) as OpeningstijdRij[],
    );

    return NextResponse.json(contract, {
        headers: {
            /* De site ververst elke 30 seconden; de CDN mag net zo lang meeliften. */
            'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60',
            'Access-Control-Allow-Origin': '*',
        },
    });
}
