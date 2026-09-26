/**
 * De etiketten van een webshop-order laden voor de printroute (S7).
 * Alles uit de order, de artikelen, het moment en de instellingen — het
 * aantal labels is het aantal pakketten en schalen, nooit een vrij getal.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { LabelVerzoek } from '@/lib/labelprinter/render';
import { etikettenVoorRegel, momentTekst, type ProductieArtikel, type ProductieRegel, type WinkelEtiketData } from './productie';

export type EtikettenUitkomst =
    | { ok: true; verzoek: LabelVerzoek }
    | { ok: false; status: number; error: string };

export async function laadWinkelEtiketten(supabase: SupabaseClient, orgId: string, orderId: number, regelIds: number[] | null): Promise<EtikettenUitkomst> {
    const { data: order, error: oErr } = await supabase
        .from('winkel_orders')
        .select('id, nummer, status, contact_naam, betaalwijze, nu_te_betalen_cents, rest_cents, rest_betaald_at, moment_id')
        .eq('id', orderId)
        .eq('organization_id', orgId)
        .maybeSingle();
    if (oErr) return { ok: false, status: 500, error: oErr.message };
    if (!order) return { ok: false, status: 404, error: 'Order niet gevonden' };
    if (order.status !== 'betaald') return { ok: false, status: 409, error: 'Alleen betaalde orders krijgen een etiket' };

    let q = supabase
        .from('winkel_order_regels')
        .select('id, artikel_id, slug, naam, aantal, alcohol, moment_id')
        .eq('order_id', orderId)
        .order('id', { ascending: true });
    if (regelIds?.length) q = q.in('id', regelIds);
    const { data: regels, error: rErr } = await q;
    if (rErr) return { ok: false, status: 500, error: rErr.message };
    if (!regels?.length) return { ok: false, status: 404, error: 'Geen regels om te printen' };

    const artikelIds = [...new Set(regels.map((r) => r.artikel_id as string))];
    const momentIds = [...new Set([...regels.map((r) => r.moment_id as string | null), order.moment_id as string | null].filter((x): x is string => !!x))];
    const [{ data: artikelen }, { data: momenten }, { data: inst }] = await Promise.all([
        supabase.from('winkel_artikelen').select('id, naam, slug, schaal_verdeling, doos_klein_max, doos_groot, alcohol').in('id', artikelIds),
        momentIds.length ? supabase.from('winkel_momenten').select('id, datum, van, tot').in('id', momentIds) : Promise.resolve({ data: [] as { id: string; datum: string; van: string | null; tot: string | null }[] }),
        supabase.from('winkel_instellingen').select('qr_basis_url').eq('organization_id', orgId).maybeSingle(),
    ]);
    const artikelOpId = new Map(((artikelen ?? []) as ProductieArtikel[]).map((a) => [a.id, a]));
    const momentOpId = new Map(((momenten ?? []) as { id: string; datum: string; van: string | null; tot: string | null }[]).map((m) => [m.id, m]));

    const labels: WinkelEtiketData[] = [];
    for (const r of regels) {
        const pr: ProductieRegel = {
            regel: { id: Number(r.id), artikel_id: r.artikel_id as string, slug: r.slug as string, naam: r.naam as string, aantal: Number(r.aantal), alcohol: Boolean(r.alcohol) },
            order: {
                id: Number(order.id), nummer: order.nummer as string, contact_naam: order.contact_naam as string,
                betaalwijze: order.betaalwijze as 'volledig' | 'reservering', nu_te_betalen_cents: Number(order.nu_te_betalen_cents),
                rest_cents: Number(order.rest_cents), rest_betaald_at: (order.rest_betaald_at as string | null) ?? null,
            },
            componenten: [],
        };
        const m = momentOpId.get((r.moment_id as string | null) ?? (order.moment_id as string | null) ?? '') ?? null;
        labels.push(...etikettenVoorRegel(pr, artikelOpId.get(r.artikel_id as string) ?? null, momentTekst(m), inst?.qr_basis_url as string | null | undefined));
    }
    if (labels.length > 200) return { ok: false, status: 400, error: 'Meer dan 200 etiketten in één keer; print per regel' };

    return { ok: true, verzoek: { soort: 'winkel_etiket', labels, referentie: { orderId, nummer: order.nummer, regelIds: regels.map((r) => Number(r.id)) } } };
}
