/**
 * POST /api/kassa/{slug}/verkoop
 * De winkelkassa meldt een bon: welke producten (barcode of id) en hoeveel.
 * Elke regel wordt `verkoop_kassa` (of `retour` bij een negatief aantal) op
 * het winkel-logboek; de melding "tijd om bij te bestellen" en de bestellijst
 * volgen vanzelf. Plan: docs/voorraad-bouwplan.md "Winkel bestellen", stap 6.
 *
 *   Authorization: Bearer <kassasleutel>    (Webshop → Instellingen)
 *   { "bon": "B-1001", "regels": [ { "ean": "8710000000001", "aantal": 2 } ] }
 *
 * Merk-onafhankelijk. Dubbel melden boekt niets dubbel. De sleutel staat
 * alleen als SHA-256 in winkel_instellingen.kassa_sleutel.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { createHash, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { checkRateLimit } from '@/lib/rateLimit';
import { createServiceSupabase } from '@/lib/supabase-server';
import { ipVan } from '@/lib/winkel/context';
import { maakSupabaseStore } from '@/lib/winkel/supabaseStore';
import { verwerkKassaBon } from '@/lib/winkel/kassaVerkoop';
import { evalueerWinkelMeldingen } from '@/lib/voorraad/meldingen';

const Body = z.object({
    bon: z.string().trim().min(1).max(80),
    regels: z.array(z.object({
        ean: z.string().trim().regex(/^\d{8,14}$/).nullable().optional(),
        product_id: z.string().uuid().nullable().optional(),
        aantal: z.number().refine((n) => n !== 0 && Math.abs(n) <= 100000),
    }).refine((r) => !!(r.ean || r.product_id), 'ean of product_id')).min(1).max(200),
});

function sleutelKlopt(gegeven: string, opgeslagenHash: string | null): boolean {
    if (!opgeslagenHash || !gegeven) return false;
    const a = Buffer.from(createHash('sha256').update(gegeven).digest('hex'), 'hex');
    const b = Buffer.from(opgeslagenHash, 'hex');
    return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params;
    const rl = checkRateLimit(`kassa:${ipVan(req)}`, 600);
    if (!rl.allowed) return NextResponse.json({ ok: false, fout: 'te veel verzoeken' }, { status: 429 });

    const tenant = await maakSupabaseStore().laadTenant(slug);
    if (!tenant) return NextResponse.json({ ok: false }, { status: 404 });
    const sb = createServiceSupabase();
    const { data: inst } = await sb.from('winkel_instellingen').select('kassa_sleutel').eq('organization_id', tenant.orgId).maybeSingle();
    const gegeven = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    if (!sleutelKlopt(gegeven, (inst?.kassa_sleutel as string | null) ?? null)) {
        return NextResponse.json({ ok: false, fout: 'ongeldige kassasleutel' }, { status: 401 });
    }

    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ ok: false, fout: parsed.error.issues[0]?.message ?? 'ongeldige bon' }, { status: 400 });
    const orgId = tenant.orgId;

    const uit = await verwerkKassaBon(parsed.data.bon, parsed.data.regels, {
        async zoekProduct(r) {
            let q = sb.from('winkel_producten').select('id, naam').eq('organization_id', orgId).limit(1);
            q = r.product_id ? q.eq('id', r.product_id) : q.eq('ean', r.ean!);
            const { data } = await q.maybeSingle();
            return data ? { id: data.id as string, naam: data.naam as string } : null;
        },
        async muteer(a) {
            const { data, error } = await sb.rpc('winkel_muteer_voorraad', {
                p_org: orgId, p_product_id: a.product_id, p_type: a.type, p_hoeveelheid: a.hoeveelheid,
                p_idempotency_key: a.sleutel, p_notitie: a.notitie,
            });
            if (error) throw Object.assign(new Error(error.message), { code: error.code });
            const j = data as { voorraad: number; bestond: boolean };
            return { voorraad: Number(j.voorraad), bestond: !!j.bestond };
        },
    });

    /* Niets stil overslaan: wat niet geboekt kon worden, wordt een melding in de bel. */
    const problemen = uit.filter((u) => u.status !== 'geboekt');
    if (problemen.length) {
        await sb.from('notifications').insert({
            organization_id: orgId, user_id: null, type: 'kassa_onbekend',
            title: `Kassabon ${parsed.data.bon}: ${problemen.length} ${problemen.length === 1 ? 'regel' : 'regels'} niet afgeboekt`,
            body: problemen.map((p) => p.status === 'onbekend' ? `Onbekende barcode ${p.ean ?? '?'}`
                : p.status === 'niet_bijgehouden' ? `${p.naam} wordt nog niet bijgehouden (tel het)`
                : p.status === 'tekort' ? p.melding : '').join(' · '),
            link: '/voorraad/winkel', metadata: { bon: parsed.data.bon, problemen },
        });
    }
    const geboekt = uit.filter((u) => u.status === 'geboekt').map((u) => (u as { product_id: string }).product_id);
    if (geboekt.length) await evalueerWinkelMeldingen(orgId, [...new Set(geboekt)]);

    return NextResponse.json({ ok: true, regels: uit }, { headers: { 'Cache-Control': 'no-store' } });
}
