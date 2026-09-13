/**
 * GET /api/public-winkel/{slug}/momenten
 * De afhaalmomenten met wat er nog vrij is, in besteleenheden. Standaard de
 * agenda (planken); ?groep=kerst-box of ?artikel=kerst-box geeft de
 * afhaaldagen van de Kerst-Box. De website cachet hooguit 60 s.
 * Contract: OVERDRACHT-BBQ-ARCHITECT-WEBSHOP.md §2.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { kassaContext } from '@/lib/winkel/context';
import { haalMomenten } from '@/lib/winkel/kassa';

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params;
    const groep = req.nextUrl.searchParams.get('artikel') || req.nextUrl.searchParams.get('groep') || 'agenda';
    const uit = await haalMomenten(kassaContext(), slug, groep);
    return NextResponse.json(uit.body, { status: uit.status, headers: { 'Cache-Control': 'no-store' } });
}
