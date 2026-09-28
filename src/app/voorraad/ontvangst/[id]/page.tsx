import { notFound } from 'next/navigation';
import { createServerSupabase } from '@/lib/supabase-server';
import Controlescherm, { type ControleData } from './Controlescherm';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Ontvangst controleren · Voorraad' };

/**
 * Het controlescherm (W2b): voor elke manier van invoeren hetzelfde. Laadt
 * het concept, de producten van beide plekken, en of dezelfde factuur (op
 * nummer of bestand) al eerder is ingelezen.
 */
export default async function ControlePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ scan?: string }> }) {
    const { id } = await params;
    const { scan } = await searchParams;
    const supabase = await createServerSupabase();

    const { data: kop } = await supabase.from('voorraad_invoer')
        .select('id, bron, status, leverancier_id, leverancier_naam, factuurnummer, datum, totaal_cents, image_hash, bon_id, inkoop_order_id, prijzen_incl_btw, notitie, geboekt_at')
        .eq('id', id).maybeSingle();
    if (!kop) notFound();

    const [{ data: regels }, { data: winkel }, { data: keuken }, { data: leveranciers }] = await Promise.all([
        supabase.from('voorraad_invoer_regels').select('*').eq('invoer_id', id).order('volgorde').order('created_at'),
        supabase.from('winkel_producten').select('id, naam, type, eenheid, prijs_per, voorraad, ean').eq('actief', true).order('naam'),
        supabase.from('inventory').select('id, naam, unit, current_stock').order('naam').limit(3000),
        supabase.from('leveranciers').select('id, naam').order('naam'),
    ]);

    /* Al eens ingelezen? Zelfde factuurnummer (bij dezelfde leverancier) of hetzelfde bestand. */
    let dubbel: ControleData['dubbel'] = null;
    if (kop.factuurnummer || kop.image_hash) {
        let q = supabase.from('voorraad_invoer').select('id, status, created_at, factuurnummer').neq('id', id).neq('status', 'verworpen').limit(1);
        q = kop.image_hash
            ? q.or(`image_hash.eq.${kop.image_hash}${kop.factuurnummer ? `,factuurnummer.ilike.${String(kop.factuurnummer).replace(/[,()]/g, '')}` : ''}`)
            : q.ilike('factuurnummer', String(kop.factuurnummer).replace(/[,()]/g, ''));
        const { data: d } = await q.maybeSingle();
        if (d) dubbel = { id: d.id as string, status: d.status as string, wanneer: d.created_at as string };
    }

    const plekHint = typeof kop.notitie === 'string' && kop.notitie.startsWith('plek:') ? (kop.notitie.slice(5) as 'winkel' | 'makerij') : null;

    const data: ControleData = {
        kop: {
            id: kop.id as string, bron: kop.bron as string, status: kop.status as ControleData['kop']['status'],
            leverancier_id: (kop.leverancier_id as number | null) ?? null, leverancier_naam: (kop.leverancier_naam as string | null) ?? null,
            factuurnummer: (kop.factuurnummer as string | null) ?? null, datum: (kop.datum as string | null) ?? null,
            totaal_cents: (kop.totaal_cents as number | null) ?? null, prijzen_incl_btw: !!kop.prijzen_incl_btw,
            bon_id: (kop.bon_id as number | null) ?? null, geboekt_at: (kop.geboekt_at as string | null) ?? null,
        },
        regels: (regels ?? []).map((r) => ({
            id: r.id as string, bron_naam: r.bron_naam as string,
            bron_aantal: r.bron_aantal == null ? null : Number(r.bron_aantal), bron_eenheid: (r.bron_eenheid as string | null) ?? null,
            bron_prijs_cents: (r.bron_prijs_cents as number | null) ?? null, btw_pct: (r.btw_pct as number | null) ?? null, ean: (r.ean as string | null) ?? null,
            plek: (r.plek as 'winkel' | 'makerij' | null) ?? null, winkel_product_id: (r.winkel_product_id as string | null) ?? null,
            inventory_id: r.inventory_id == null ? null : Number(r.inventory_id), omrekening: r.omrekening == null ? null : Number(r.omrekening),
            aantal: r.aantal == null ? null : Number(r.aantal), tht: (r.tht as string | null) ?? null, overslaan: !!r.overslaan,
            voorstel: (r.voorstel as string | null) ?? null,
        })),
        winkel: (winkel ?? []).map((w) => ({ id: w.id as string, naam: w.naam as string, type: w.type as string, eenheid: w.eenheid as 'stuk' | 'gram', prijs_per: Number(w.prijs_per), voorraad: w.voorraad == null ? null : Number(w.voorraad) })),
        keuken: (keuken ?? []).map((k) => ({ id: Number(k.id), naam: k.naam as string, unit: (k.unit as string | null) ?? null, current_stock: k.current_stock == null ? null : Number(k.current_stock) })),
        leveranciers: (leveranciers ?? []).map((l) => ({ id: Number(l.id), naam: l.naam as string })),
        dubbel,
        plekHint,
    };
    return <Controlescherm data={data} scanOpen={scan === '1'} />;
}
