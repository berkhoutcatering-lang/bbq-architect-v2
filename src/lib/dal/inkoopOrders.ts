/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Inkoop-orders DAL
 * ─────────────────
 * CRUD voor concept_inkoop_orders. Eén concept per (org, leverancier, window).
 * UPSERT-pattern omdat /inkoop bij elke pagina-load garandeert dat er een
 * concept-rij staat per leverancier-bucket — zodat order_overrides ergens
 * aan kunnen hangen.
 *
 * Math zit NIET hier — items/totalen worden alleen op send-moment gesnapshot
 * (zie sendOrderToSupplier in /inkoop/actions.ts).
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export type OrderStatus = 'concept' | 'sent' | 'received' | 'cancelled';

export interface ConceptInkoopOrder {
    id: string;
    organization_id: string;
    leverancier_id: number | null;
    window_start: string;
    window_end: string;
    status: OrderStatus;
    sent_at: string | null;
    sent_to_email: string | null;
    pdf_url: string | null;
    send_note: string | null;
    items: OrderItemSnapshot[];
    subtotal_eur: number | null;
    btw_laag_eur: number | null;
    btw_hoog_eur: number | null;
    total_eur: number | null;
    created_at: string;
    updated_at: string;
}

export interface OrderItemSnapshot {
    inventory_id: number;
    naam: string;
    qty: number;
    unit: string;
    unit_price_eur: number | null;
    line_total_eur: number;
    btw_pct: 9 | 21;
    categorie: string | null;
    events: Array<{ event_id: number; event_name: string; event_date: string; qty: number }>;
}

/** UPSERT: garandeert een concept-rij per (org, leverancier, window). Returnt id.
 *  Wanneer leverancier_id null is (unknown bucket) maken we wél een rij maar
 *  zonder unique-constraint — meerdere "unknown" concepts mogen bestaan per
 *  window (al is dat in praktijk niet aanbevolen — de UI groepeert ze). */
export async function ensureConceptOrder(
    sb: SupabaseClient,
    orgId: string,
    leverancierId: number | null,
    windowStart: string,
    windowEnd: string,
): Promise<string> {
    // 1. Probeer bestaande concept te vinden.
    let q = sb
        .from('concept_inkoop_orders')
        .select('id')
        .eq('organization_id', orgId)
        .eq('status', 'concept')
        .eq('window_start', windowStart);
    if (leverancierId == null) {
        q = q.is('leverancier_id', null);
    } else {
        q = q.eq('leverancier_id', leverancierId);
    }
    const { data: existing } = await q.maybeSingle();
    if (existing?.id) return existing.id as string;

    // 2. Maak nieuwe concept-rij.
    const { data, error } = await sb
        .from('concept_inkoop_orders')
        .insert({
            organization_id: orgId,
            leverancier_id: leverancierId,
            window_start: windowStart,
            window_end: windowEnd,
            status: 'concept',
        })
        .select('id')
        .single();

    if (error) {
        // Race-conditie: tweede sessie kwam ons voor (partial unique). Re-query.
        if (error.code === '23505') {
            const { data: race } = await q.maybeSingle();
            if (race?.id) return race.id as string;
        }
        throw new Error('Kon concept-order niet aanmaken: ' + error.message);
    }
    return data!.id as string;
}

/** Eén concept-order op id (binnen huidige org via RLS). */
export async function getConceptOrderById(
    sb: SupabaseClient,
    orderId: string,
): Promise<ConceptInkoopOrder | null> {
    const { data, error } = await sb
        .from('concept_inkoop_orders')
        .select('*')
        .eq('id', orderId)
        .maybeSingle();
    if (error) throw new Error('Order ophalen mislukt: ' + error.message);
    return (data as ConceptInkoopOrder) ?? null;
}

/** Concept-orders ophalen voor /inkoop. Default: status=concept én window
 *  startend vandaag/eerder zodat de UI alleen actuele concepts toont. */
export async function listConceptOrders(
    sb: SupabaseClient,
    orgId: string,
    opts: { statuses?: OrderStatus[]; windowStart?: string } = {},
): Promise<ConceptInkoopOrder[]> {
    let q = sb
        .from('concept_inkoop_orders')
        .select('*')
        .eq('organization_id', orgId)
        .in('status', opts.statuses ?? ['concept']);
    if (opts.windowStart) q = q.gte('window_start', opts.windowStart);
    q = q.order('window_start', { ascending: true });
    const { data, error } = await q;
    if (error) throw new Error('Orders ophalen mislukt: ' + error.message);
    return (data as ConceptInkoopOrder[]) ?? [];
}

/** Snapshot van items + totalen vastleggen en status → sent zetten.
 *  Roep dit aan vanuit sendOrderToSupplier nadat PDF gegenereerd + gemaild is. */
export async function markOrderSent(
    sb: SupabaseClient,
    orderId: string,
    snapshot: {
        items: OrderItemSnapshot[];
        subtotal_eur: number;
        btw_laag_eur: number;
        btw_hoog_eur: number;
        total_eur: number;
        sent_to_email: string;
        pdf_url: string;
        send_note?: string;
    },
): Promise<void> {
    const { error } = await sb
        .from('concept_inkoop_orders')
        .update({
            status: 'sent',
            sent_at: new Date().toISOString(),
            sent_to_email: snapshot.sent_to_email,
            pdf_url: snapshot.pdf_url,
            send_note: snapshot.send_note ?? null,
            items: snapshot.items,
            subtotal_eur: snapshot.subtotal_eur,
            btw_laag_eur: snapshot.btw_laag_eur,
            btw_hoog_eur: snapshot.btw_hoog_eur,
            total_eur: snapshot.total_eur,
        })
        .eq('id', orderId);
    if (error) throw new Error('Order op sent zetten mislukt: ' + error.message);
}

export interface ReceivedLineInput {
    line_id: string;
    qty_received: number;
    unit_price_eur: number | null;
    reason?: string | null;
}

/** Ontvangst boeken: zet qty_received per regel, hoogt de voorraad atomair op
 *  (increment_inventory_stock → stock_movements type='receive'), en zet de order
 *  op 'received' zodra ÁLLE regels vol binnen zijn (anders blijft 'ie 'sent' voor
 *  het openstaande deel — deel-ontvangst). Sluit de ontvangst-loop (beslissing #6). */
export async function markOrderReceived(
    sb: SupabaseClient,
    orgId: string,
    orderId: string,
    received: ReceivedLineInput[],
): Promise<void> {
    // Bron van waarheid = de persisted regels van DEZE order. We vertrouwen NOOIT
    // de client-inventory_id, en we hogen op met het VERSCHIL t.o.v. wat al geboekt
    // was — idempotent bij her-boeken/deel-levering, dus geen dubbeltelling.
    const { data: existingLines, error: readErr } = await sb
        .from('inkoop_order_lines')
        .select('id, inventory_id, qty_ordered, qty_received, unit_price_eur')
        .eq('concept_order_id', orderId)
        .eq('organization_id', orgId);
    if (readErr) throw new Error('Orderregels ophalen mislukt: ' + readErr.message);
    const lineById = new Map<string, any>((existingLines || []).map(function (l: any) { return [l.id as string, l]; }));

    for (const r of received) {
        const line = lineById.get(r.line_id);
        if (!line) continue; // regel hoort niet bij deze order → overslaan (line-ownership)

        const prev = Number(line.qty_received ?? 0);
        const next = Math.max(0, Number(r.qty_received) || 0);
        const delta = Math.round((next - prev) * 1000) / 1000;

        const { error: upErr } = await sb
            .from('inkoop_order_lines')
            .update({ qty_received: next })
            .eq('id', r.line_id)
            .eq('concept_order_id', orderId)
            .eq('organization_id', orgId);
        if (upErr) throw new Error('Orderregel bijwerken mislukt: ' + upErr.message);

        if (line.inventory_id != null && delta !== 0) {
            const { error: rpcErr } = await sb.rpc('increment_inventory_stock', {
                p_org: orgId,
                p_inventory_id: line.inventory_id, // uit de persisted regel, niet uit client-input
                p_delta: delta,
                p_type: 'receive',
                p_unit_price: r.unit_price_eur ?? line.unit_price_eur ?? null,
                p_order_line_id: r.line_id,
                p_note: r.reason ? `Ontvangst: ${String(r.reason).slice(0, 200)}` : 'Ontvangst inkoop-order',
            });
            if (rpcErr) throw new Error('Voorraad ophogen mislukt: ' + rpcErr.message);
        }
    }

    // Order pas 'received' als alle regels vol ontvangen zijn (anders deel-ontvangst → 'sent' houden).
    const { data: lines } = await sb
        .from('inkoop_order_lines')
        .select('qty_ordered, qty_received')
        .eq('concept_order_id', orderId)
        .eq('organization_id', orgId);
    const allReceived = (lines || []).length > 0
        && (lines || []).every(function (l: any) { return Number(l.qty_received ?? 0) >= Number(l.qty_ordered ?? 0); });

    const { error: stErr } = await sb
        .from('concept_inkoop_orders')
        .update({ status: allReceived ? 'received' : 'sent' })
        .eq('id', orderId)
        .eq('organization_id', orgId);
    if (stErr) throw new Error('Order-status bijwerken mislukt: ' + stErr.message);
}

/** Eindigt het bestaan van een concept (UI: "X" op een bucket). */
export async function cancelConceptOrder(
    sb: SupabaseClient,
    orderId: string,
): Promise<void> {
    const { error } = await sb
        .from('concept_inkoop_orders')
        .update({ status: 'cancelled' })
        .eq('id', orderId);
    if (error) throw new Error('Order annuleren mislukt: ' + error.message);
}
