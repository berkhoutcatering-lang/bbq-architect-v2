/**
 * GET /api/public-winkel/{slug}/keuzes
 * De combideals: per artikel dat actief én publiek is en minstens één kies-vak
 * heeft, de vakken met hun keuzes. Per keuze het product-id, de naam, de
 * meerprijs en een stand 'ja' | 'op' | 'onbeperkt' (geen voorraadgetallen).
 * De website stuurt de gekozen id's terug in `mand.regels[].keuzes`
 * ([{ slot, producten }]); BBQ Architect controleert ze opnieuw bij de offerte.
 * Plan: docs/context/winkel-aanbod-en-vloer-plan.md fase 2; logica in
 * haalKeuzes (src/lib/winkel/kassa.ts).
 */
import { NextResponse, type NextRequest } from 'next/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { ipVan, kassaContext } from '@/lib/winkel/context';
import { haalKeuzes } from '@/lib/winkel/kassa';

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params;
    const rl = checkRateLimit(`public-winkel-keuzes:${ipVan(req)}`, 120);
    if (!rl.allowed) {
        return NextResponse.json(
            { ok: false, soort: 'niet-beschikbaar', melding: 'Te veel verzoeken. Probeer het zo opnieuw.' },
            { status: 429, headers: { 'Retry-After': String(rl.resetInSeconds), 'Cache-Control': 'no-store' } },
        );
    }
    if (!/^[a-z0-9-]{1,80}$/.test(slug)) {
        return NextResponse.json({ ok: false, soort: 'niet-beschikbaar', melding: 'Onbekende winkel.' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
    }
    const uit = await haalKeuzes(kassaContext(req), slug);
    return NextResponse.json(uit.body, { status: uit.status, headers: { 'Cache-Control': 'no-store' } });
}
