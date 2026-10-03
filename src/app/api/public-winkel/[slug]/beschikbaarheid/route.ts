/**
 * GET /api/public-winkel/{slug}/beschikbaarheid
 * Per artikel dat actief én publiek is: { slug, stand, nog } met stand
 * 'op' | 'nog' | 'ruim' | 'onbeperkt'. Alleen bij 'nog' (tot en met
 * winkel_instellingen.beschikbaar_grens) en 'op' (0) komt er een getal mee.
 * Plus de voorraadversie en vrij_verloopt_at, zodat de website weet wanneer
 * hij opnieuw moet vragen. Plan v5, BA-5b; logica in haalBeschikbaarheid
 * (src/lib/winkel/kassa.ts).
 *
 * Alleen een badge: BBQ Architect blijft de poort bij de order (WK002/WK009).
 * Is deze route onbereikbaar, dan toont de website geen badge en geen limiet.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { ipVan, kassaContext } from '@/lib/winkel/context';
import { haalBeschikbaarheid } from '@/lib/winkel/kassa';

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params;
    const rl = checkRateLimit(`public-winkel-beschikbaarheid:${ipVan(req)}`, 120);
    if (!rl.allowed) {
        return NextResponse.json(
            { ok: false, soort: 'niet-beschikbaar', melding: 'Te veel verzoeken. Probeer het zo opnieuw.' },
            { status: 429, headers: { 'Retry-After': String(rl.resetInSeconds), 'Cache-Control': 'no-store' } },
        );
    }
    if (!/^[a-z0-9-]{1,80}$/.test(slug)) {
        return NextResponse.json({ ok: false, soort: 'niet-beschikbaar', melding: 'Onbekende winkel.' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
    }
    const uit = await haalBeschikbaarheid(kassaContext(req), slug);
    return NextResponse.json(uit.body, { status: uit.status, headers: { 'Cache-Control': 'no-store' } });
}
