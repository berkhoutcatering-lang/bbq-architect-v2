/**
 * GET /api/public-winkel/{slug}/doos/{code}
 * Voor de Experience-app: welk pakket of welke schaal hoort bij deze QR-code
 * (S7, docs/OVERDRACHT-BBQ-ARCHITECT-GESCHENKPAKKETTEN.md). Alleen het artikel
 * en de inhoud — nooit naam, ordernummer of iets anders van de klant. Een scan
 * met een telefoon verandert niets; "opgehaald" zet alleen de ingelogde balie.
 * Onbekende code → 404.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { createServiceSupabase } from '@/lib/supabase-server';
import { ipVan } from '@/lib/winkel/context';
import { maakSupabaseStore } from '@/lib/winkel/supabaseStore';

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string; code: string }> }) {
    const { slug, code } = await params;
    const rl = checkRateLimit(`public-winkel-doos:${ipVan(req)}`, 120);
    if (!rl.allowed) {
        return NextResponse.json({ ok: false, melding: 'Te veel verzoeken.' }, { status: 429, headers: { 'Retry-After': String(rl.resetInSeconds) } });
    }
    const schoon = code.trim().toLowerCase();
    if (!/^[0-9a-f]{32,128}$/.test(schoon)) return NextResponse.json({ ok: false }, { status: 404 });

    const tenant = await maakSupabaseStore().laadTenant(slug);
    if (!tenant) return NextResponse.json({ ok: false }, { status: 404 });

    const sb = createServiceSupabase();
    const { data: doos } = await sb
        .from('winkel_dozen')
        .select('order_regel_id, omschrijving, winkel_order_regels!inner(slug, naam, aantal)')
        .eq('organization_id', tenant.orgId)
        .eq('code', schoon)
        .maybeSingle();
    if (!doos) return NextResponse.json({ ok: false }, { status: 404 });

    const regel = doos.winkel_order_regels as unknown as { slug: string; naam: string; aantal: number };
    const { data: comps } = await sb
        .from('winkel_order_regel_componenten')
        .select('naam, hoeveelheid, eenheid, slot_type')
        .eq('order_regel_id', doos.order_regel_id)
        .order('id');
    /* De inhoud van één pakket: de componenten van de regel gedeeld door het
       aantal. Bij de plank (per persoon) is dat de inhoud per persoon. */
    const n = Math.max(1, Number(regel.aantal));
    const inhoud = (comps ?? []).map((c) => ({ naam: c.naam as string, soort: c.slot_type as string, hoeveelheid: Math.round((Number(c.hoeveelheid) / n) * 1000) / 1000, eenheid: c.eenheid as string }));

    return NextResponse.json(
        { ok: true, artikel: { slug: regel.slug, naam: regel.naam }, doos: doos.omschrijving, inhoud },
        { headers: { 'Cache-Control': 'private, max-age=300' } },
    );
}
