/**
 * POST /api/public-winkel/{slug}/order
 * Order aanmaken, capaciteit en voorraad reserveren (atomair, 30 minuten),
 * betaling klaarzetten. Idempotent op `sleutel`. 409 prijs-gewijzigd als het
 * herberekende totaal afwijkt van verwachtTotaalCenten.
 * Contract: OVERDRACHT-BBQ-ARCHITECT-WEBSHOP.md §4.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { ipVan, kassaContext } from '@/lib/winkel/context';
import { plaatsOrder } from '@/lib/winkel/kassa';

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params;
    const rl = checkRateLimit(`public-winkel-order:${ipVan(req)}`, 20);
    if (!rl.allowed) {
        return NextResponse.json({ ok: false, soort: 'niet-beschikbaar', melding: 'Te veel pogingen. Probeer het over een minuut opnieuw.' }, { status: 429, headers: { 'Retry-After': String(rl.resetInSeconds) } });
    }
    let body: unknown;
    try { body = await req.json(); } catch { return NextResponse.json({ ok: false, soort: 'validatie', fouten: ['Ongeldige aanvraag.'] }, { status: 400 }); }
    const uit = await plaatsOrder(kassaContext(req), slug, body);
    return NextResponse.json(uit.body, { status: uit.status, headers: { 'Cache-Control': 'no-store' } });
}
