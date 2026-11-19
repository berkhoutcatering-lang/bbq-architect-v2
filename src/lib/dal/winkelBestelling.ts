/**
 * De winkelregels voor de bestellijst (/inkoop): per winkelproduct dat onder
 * zijn minimum zit, wat er besteld moet worden — afgerond op de besteleenheid.
 * De rekenregel staat in src/lib/winkel/bestellen.ts; hier alleen het laden.
 *
 *   minimum   = winkel_producten.drempel, anders het voorstel (5 pakketten)
 *   onderweg  = inkoop_order_lines met winkel_product_id van verstuurde orders
 *   bezet     = besteld in de webshop en nog niet ingepakt
 *
 * Zelf op de lijst gezet (bestel_handmatig) telt ook mee als er nog niet
 * geteld is; de automatische regel alleen bij getelde producten.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { bestelVoorstel, handmatigeRegel, type BestelRegel } from '@/lib/winkel/bestellen';
import { geldendeDrempel } from '@/lib/winkel/voorraad';
import type { Slot } from '@/lib/winkel/rekenen';

export interface WinkelBestelRegel extends BestelRegel {
    leverancier_id: number | null;
    btw_pct: number;
    type: string;
}

/**
 * De stand achter de bestellijst: de regels die erop komen, en per bekeken
 * product het minimum dat geldt en wat er al onderweg is. Boekhouding winkel
 * (Hardlopers) gebruikt dit om precies dezelfde regel te volgen.
 */
export interface WinkelBestelStand {
    regels: WinkelBestelRegel[];
    /** Per product het geldende minimum (eigen getal of het voorstel); null = geen. */
    minimum: Map<string, number | null>;
    /** Per product wat er besteld is en nog niet binnen. */
    onderweg: Map<string, number>;
}

export async function laadWinkelBestelRegels(supabase: SupabaseClient, orgId: string): Promise<WinkelBestelRegel[]> {
    return (await laadWinkelBestelStand(supabase, orgId)).regels;
}

export async function laadWinkelBestelStand(supabase: SupabaseClient, orgId: string): Promise<WinkelBestelStand> {
    const { data: producten, error } = await supabase
        .from('winkel_producten')
        .select('id, naam, type, eenheid, voorraad, drempel, par_niveau, bestel_hoeveelheid, bestel_eenheid_naam, bestel_prijs_cents, bestel_handmatig, leverancier_id, btw_pct')
        .eq('organization_id', orgId)
        .eq('actief', true)
        .or('voorraad.not.is.null,bestel_handmatig.not.is.null');
    /* Bestaan de winkeltabellen niet (andere cateraar), dan is er gewoon niets. */
    if (error || !producten?.length) return { regels: [], minimum: new Map(), onderweg: new Map() };

    const ids = producten.map((p) => p.id as string);
    const [{ data: slots }, { data: artikelen }, { data: lijnen }] = await Promise.all([
        supabase.from('winkel_artikel_slots').select('id, artikel_id, volgorde, slot_type, naam, hoeveelheid, eenheid, per, standaard_product_id, wisselbaar, alternatieven').eq('organization_id', orgId),
        supabase.from('winkel_artikelen').select('id, actief').eq('organization_id', orgId),
        supabase.from('inkoop_order_lines')
            .select('winkel_product_id, qty_ordered, qty_received, concept_inkoop_orders!inner(status)')
            .eq('organization_id', orgId)
            .in('winkel_product_id', ids)
            .eq('concept_inkoop_orders.status', 'sent'),
    ]);
    const bezet = new Map<string, number>();
    await Promise.all(producten.filter((p) => p.voorraad != null).map((p) => p.id as string).map(async (id) => {
        const { data: n } = await supabase.rpc('winkel_bezetting_product', { p_product_id: id, p_zonder_order: null });
        bezet.set(id, Number(n ?? 0));
    }));
    const onderweg = new Map<string, number>();
    for (const l of (lijnen ?? []) as { winkel_product_id: string; qty_ordered: number; qty_received: number | null }[]) {
        const open = Math.max(0, Number(l.qty_ordered ?? 0) - Number(l.qty_received ?? 0));
        onderweg.set(l.winkel_product_id, (onderweg.get(l.winkel_product_id) ?? 0) + open);
    }
    const sl = (slots ?? []).map((s) => ({ ...s, hoeveelheid: Number(s.hoeveelheid), alternatieven: s.alternatieven ?? [] })) as Slot[];
    const actief = new Set((artikelen ?? []).filter((a) => a.actief).map((a) => a.id as string));

    const uit: WinkelBestelRegel[] = [];
    const minima = new Map<string, number | null>();
    for (const p of producten) {
        const minimum = geldendeDrempel({ id: p.id as string, drempel: p.drempel == null ? null : Number(p.drempel) }, sl, actief).waarde;
        minima.set(p.id as string, minimum);
        const product = {
            id: p.id as string, naam: p.naam as string, eenheid: p.eenheid as 'stuk' | 'gram',
            voorraad: p.voorraad == null ? null : Number(p.voorraad), voorraad_bezet: bezet.get(p.id as string) ?? 0,
            minimum, par_niveau: p.par_niveau == null ? null : Number(p.par_niveau),
            bestel_hoeveelheid: p.bestel_hoeveelheid == null ? null : Number(p.bestel_hoeveelheid),
            bestel_eenheid_naam: (p.bestel_eenheid_naam as string | null) ?? null,
            bestel_prijs_cents: (p.bestel_prijs_cents as number | null) ?? null,
        };
        const stand = onderweg.get(p.id as string) ?? 0;
        const r = p.bestel_handmatig != null ? handmatigeRegel(product, Number(p.bestel_handmatig), stand) : bestelVoorstel(product, stand);
        if (r) uit.push({ ...r, leverancier_id: (p.leverancier_id as number | null) ?? null, btw_pct: Number(p.btw_pct ?? 9), type: p.type as string });
    }
    return { regels: uit, minimum: minima, onderweg };
}
