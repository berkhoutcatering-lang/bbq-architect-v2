/**
 * GET /api/public-winkel/{slug}/betaal/{token}/terug?uitkomst=ok|afgebroken
 * URL_OK en URL_Cancel van myPOS. Een bezoek is geen bewijs van betaling:
 * bij 'ok' vragen we myPOS één keer om de status, bij 'afgebroken' zetten we
 * de order op afgebroken. Daarna door naar {site}/bestelling/{token}.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { kassaContext } from '@/lib/winkel/context';
import { terugVanMypos } from '@/lib/winkel/kassa';

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string; token: string }> }) {
    const { slug, token } = await params;
    const uit = await terugVanMypos(kassaContext(), slug, token, req.nextUrl.searchParams.get('uitkomst'));
    if (uit.soort === 'redirect') return NextResponse.redirect(uit.url, 303);
    if (uit.soort === 'fout') return new NextResponse(uit.tekst, { status: uit.status, headers: { 'content-type': 'text/plain; charset=utf-8' } });
    return new NextResponse(uit.html, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
}

/* myPOS kan de terugkeer ook als POST sturen. */
export const POST = GET;
