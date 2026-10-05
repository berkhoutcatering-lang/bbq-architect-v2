/**
 * GET /api/public-winkel/{slug}/kerst
 * Wat het Kerst-Box-formulier op de site uit BBQ Architect haalt: de prijs per
 * persoon en welke proeverijen er te bestellen zijn, met hun prijs. Een
 * proeverij zonder prijs (of uit) staat er niet in — dan toont de site hem
 * niet. Mathijs zet de prijs in Verkoop → Kerst; de site cachet hooguit 60 s.
 *
 *   { box: { prijsCenten }, proeverijen: [{ soort: 'bier'|'wijn', naam, eenheid, prijsCenten }] }
 */
import { NextResponse, type NextRequest } from 'next/server';
import { KERST_SLUGS } from '@/lib/winkel/kerst';
import { maakSupabaseStore } from '@/lib/winkel/supabaseStore';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params;
    const store = maakSupabaseStore();
    const tenant = await store.laadTenant(slug);
    if (!tenant) return NextResponse.json({ ok: false, soort: 'niet-beschikbaar', melding: 'Onbekende winkel.' }, { status: 404 });
    const artikelen = await store.laadArtikelen(tenant.orgId);
    const box = artikelen.find((a) => a.slug === KERST_SLUGS.box);
    const proeverijen = (['bier', 'wijn'] as const)
        .map((soort) => ({ soort, a: artikelen.find((x) => x.slug === KERST_SLUGS[soort]) }))
        .filter(({ a }) => a && a.actief && a.prijs_cents != null)
        .map(({ soort, a }) => ({ soort, naam: a!.naam, eenheid: a!.eenheid, prijsCenten: a!.prijs_cents! }));
    return NextResponse.json(
        { ok: true, box: { prijsCenten: box?.prijs_cents ?? null }, proeverijen },
        { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' } },
    );
}
