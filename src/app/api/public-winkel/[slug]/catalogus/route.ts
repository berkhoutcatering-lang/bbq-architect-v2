/**
 * GET /api/public-winkel/{slug}/catalogus[?voorbeeld=<token>]
 * Wat er los te koop is (bier, wijn, vlees): naam, foto, tekst, prijs —
 * alleen wat live staat. Met een voorbeeldtoken (24 uur, uit BBQ Architect)
 * komt één concept erbij. Nooit inkoop, leverancier of marge.
 * Plan: docs/OPDRACHT-BBQ-ARCHITECT-CATALOGUS.md (blok C2).
 */
import { NextResponse, type NextRequest } from 'next/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { ipVan } from '@/lib/winkel/context';
import { haalCatalogus } from '@/lib/winkel/catalogus';

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params;
    if (!checkRateLimit(`catalogus:${ipVan(req)}`, 120).allowed) {
        return NextResponse.json({ fout: 'te-veel' }, { status: 429 });
    }
    const voorbeeld = req.nextUrl.searchParams.get('voorbeeld');
    const uit = await haalCatalogus(slug, voorbeeld);
    /* De website cachet zelf (tag 'catalogus'); een voorbeeld nooit. */
    return NextResponse.json(uit.body, { status: uit.status, headers: { 'Cache-Control': 'no-store' } });
}
