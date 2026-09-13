/**
 * GET /api/public-winkel/{slug}/order/{token}
 * De status van een order op een onraadbaar token (256 bit). Alleen wat de
 * bevestigingspagina nodig heeft: geen volledig e-mailadres, geen adres, geen
 * telefoon. Onbekend token → 404. De website pollt elke 3 s zolang 'wacht'.
 * Contract: OVERDRACHT-BBQ-ARCHITECT-WEBSHOP.md §5.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { ipVan, kassaContext } from '@/lib/winkel/context';
import { haalStatus } from '@/lib/winkel/kassa';

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string; token: string }> }) {
    const { slug, token } = await params;
    const rl = checkRateLimit(`public-winkel-status:${ipVan(req)}`, 120);
    if (!rl.allowed) {
        return NextResponse.json({ ok: false, soort: 'niet-beschikbaar', melding: 'Te veel verzoeken.' }, { status: 429, headers: { 'Retry-After': String(rl.resetInSeconds) } });
    }
    const uit = await haalStatus(kassaContext(), slug, token);
    return NextResponse.json(uit.body, { status: uit.status, headers: { 'Cache-Control': 'no-store' } });
}
