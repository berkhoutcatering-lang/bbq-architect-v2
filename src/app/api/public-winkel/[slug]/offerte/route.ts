/**
 * POST /api/public-winkel/{slug}/offerte
 * De mand opnieuw uitrekenen op slugs en aantallen, in hele centen. Bedragen
 * uit de browser doen hier niets. Contract: OVERDRACHT-BBQ-ARCHITECT-WEBSHOP.md §3.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { ipVan, kassaContext } from '@/lib/winkel/context';
import { offreer } from '@/lib/winkel/kassa';

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params;
    const rl = checkRateLimit(`public-winkel-offerte:${ipVan(req)}`, 60);
    if (!rl.allowed) {
        return NextResponse.json({ ok: false, soort: 'niet-beschikbaar', melding: 'Te veel verzoeken. Probeer het zo opnieuw.' }, { status: 429, headers: { 'Retry-After': String(rl.resetInSeconds) } });
    }
    let body: unknown;
    try { body = await req.json(); } catch { return NextResponse.json({ ok: false, soort: 'validatie', fouten: ['Ongeldige aanvraag.'] }, { status: 400 }); }
    const uit = await offreer(kassaContext(), slug, body);
    return NextResponse.json(uit.body, { status: uit.status, headers: { 'Cache-Control': 'no-store' } });
}
