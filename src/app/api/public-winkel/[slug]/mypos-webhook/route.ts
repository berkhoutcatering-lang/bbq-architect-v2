/**
 * POST /api/public-winkel/{slug}/mypos-webhook
 * URL_Notify van myPOS (IPCPurchaseNotify). Handtekening controleren met het
 * certificaat van myPOS, idempotent verwerken op transactiereferentie, en
 * 'OK' terugsturen. Een herhaald bericht verandert niets en stuurt geen
 * tweede mail. Contract: OVERDRACHT-BBQ-ARCHITECT-WEBSHOP.md §6.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { kassaContext } from '@/lib/winkel/context';
import { verwerkBetaalbericht } from '@/lib/winkel/kassa';

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params;
    const body = await req.text();
    const uit = await verwerkBetaalbericht(kassaContext(), slug, body);
    return new NextResponse(uit.tekst, { status: uit.status, headers: { 'content-type': 'text/plain; charset=utf-8' } });
}
