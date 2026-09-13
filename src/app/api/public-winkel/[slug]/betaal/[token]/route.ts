/**
 * GET /api/public-winkel/{slug}/betaal/{token}
 * De betaalUrl uit de order: zet de order (opnieuw) op 'wacht' met een verse
 * reservering en stuurt de klant met een formulier-POST naar de betaalpagina
 * van myPOS. Al betaald of geen plek meer → terug naar de website.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { kassaContext } from '@/lib/winkel/context';
import { betaalPagina } from '@/lib/winkel/kassa';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string; token: string }> }) {
    const { slug, token } = await params;
    const uit = await betaalPagina(kassaContext(), slug, token);
    if (uit.soort === 'redirect') return NextResponse.redirect(uit.url, 303);
    if (uit.soort === 'fout') return new NextResponse(uit.tekst, { status: uit.status, headers: { 'content-type': 'text/plain; charset=utf-8' } });
    return new NextResponse(uit.html, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}
