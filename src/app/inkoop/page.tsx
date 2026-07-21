/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * /inkoop — full-page InkoopLijst (bucket D · P0-1)
 * ─────────────────────────────────────────────────
 * Strip: het oude tab-systeem (leveranciers/bonnen/archief) is dood.
 *  - Bon-scanner → /bonnen (bucket E)
 *  - Leveranciers-CRUD → /leveranciers (eigen pagina)
 *  - Bon-archief → /archief
 *
 * Wat blijft: één doel — "wat moet ik vandaag bestellen, per leverancier".
 * Server-side data fetch via buildBestelvoorstel (math is deterministisch);
 * de UI doet alleen presentatie + optimistic overrides via Server Actions.
 */
import { redirect } from 'next/navigation';
import { createServerSupabase } from '@/lib/supabase-server';
import { buildBestelvoorstel } from '@/lib/dal/bestelvoorstel';
import { getInventoryWithDemand } from '@/lib/dal/inventoryDemand';
import PageHeader from '@/components/PageHeader';
import PageGuideNote from '@/components/PageGuideNote';
import { RequireTier } from '@/components/PaywallPrompt';
import InkoopLijst from './_components/InkoopLijst';
import OntvangstSectie, { type SentOrder } from './_components/OntvangstSectie';

export const dynamic = 'force-dynamic';

export default async function InkoopPage() {
    const sb = await createServerSupabase();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) redirect('/login?next=/inkoop');

    const { data: member } = await sb
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .limit(1)
        .single();

    const orgId = member?.organization_id;
    if (!orgId) redirect('/onboarding');

    // Parallel fetch — bestelvoorstel + leveranciers + events-meta voor empty-state.
    const [summary, leveranciersRes, demandSnapshot, sentOrdersRes] = await Promise.all([
        buildBestelvoorstel(sb, orgId, 14, { persistConcepts: true }).catch((e) => {
            console.error('[/inkoop] buildBestelvoorstel failed', e);
            return null;
        }),
        sb.from('leveranciers')
            .select('id, naam, type, email, tel')
            .eq('organization_id', orgId)
            .order('naam', { ascending: true }),
        getInventoryWithDemand(sb, orgId, 14).catch(() => null),
        // Verzonden orders + hun regels voor de "Onderweg"-sectie (ontvangst-loop).
        sb.from('concept_inkoop_orders')
            .select('id, leverancier_id, sent_at, window_end, total_eur, inkoop_order_lines(id, inventory_id, naam, qty_ordered, qty_received, unit, unit_price_eur)')
            .eq('organization_id', orgId)
            .eq('status', 'sent')
            .order('sent_at', { ascending: false }),
    ]);

    const leveranciers = (leveranciersRes.data || []) as Array<{
        id: number;
        naam: string;
        type: string;
        email: string | null;
        tel: string | null;
    }>;

    const events_count = demandSnapshot?.events_in_window?.length ?? 0;
    const has_menu_items = (demandSnapshot?.rows?.some((r) => r.reserved_qty > 0)) ?? false;

    // Verzonden orders → "Onderweg"-sectie (leverancier-naam erbij, alleen met regels).
    const levById = new Map(leveranciers.map((l) => [l.id, l.naam]));
    const sentOrders: SentOrder[] = (((sentOrdersRes.data as any[]) || [])
        .map((o) => ({
            id: o.id as string,
            leverancier_naam: o.leverancier_id != null ? (levById.get(o.leverancier_id) || 'Onbekende leverancier') : 'Nog te kiezen',
            sent_at: o.sent_at ?? null,
            window_end: o.window_end ?? null,
            total_eur: o.total_eur == null ? null : Number(o.total_eur),
            lines: ((o.inkoop_order_lines as any[]) || []).map((l) => ({
                id: l.id as string,
                inventory_id: l.inventory_id == null ? null : Number(l.inventory_id),
                naam: l.naam as string,
                qty_ordered: Number(l.qty_ordered) || 0,
                qty_received: l.qty_received == null ? null : Number(l.qty_received),
                unit: (l.unit as string) || '',
                unit_price_eur: l.unit_price_eur == null ? null : Number(l.unit_price_eur),
            })),
        }))
        .filter((o) => o.lines.length > 0));

    if (!summary) {
        return (
            <RequireTier feature="inkoop">
                <div className="artisan-page inkoop-page">
                    <PageHeader title="Inkoop" description="Bestellen voor de events" />
                    <div
                        style={{
                            background: 'var(--card)',
                            border: '1px solid var(--border)',
                            borderRadius: 14,
                            padding: 24,
                            color: 'var(--muted)',
                        }}
                    >
                        Kon bestelvoorstel niet laden. Probeer de pagina te herladen.
                    </div>
                </div>
            </RequireTier>
        );
    }

    return (
        <RequireTier feature="inkoop">
            <div className="artisan-page inkoop-page">
                <PageHeader
                    title="Inkoop"
                    description={`Bestellen voor de events komende ${summary.totals.window_days} dagen`}
                />

                {/* icon-prop bewust niet gezet — Lucide-components mogen niet
                    van een Server Component naar een Client Component (React 19);
                    PageGuideNote valt terug op de default Compass-icon. */}
                <PageGuideNote
                    id="inkoop"
                    accent="#6366f1"
                    intro="Per leverancier zie je precies wat er besteld moet worden voor je events. Pas hoeveelheden aan, kies een andere leverancier, of stuur direct een bestelling met PDF."
                    actions={[
                        { lead: 'Pas een aantal aan', text: '— klik op de hoeveelheid om bij te schuiven; we onthouden je wijziging.' },
                        { lead: 'Verstuur de lijst', text: 'naar je leverancier per e-mail met PDF in de bijlage.' },
                        { lead: 'Geen leverancier?', text: 'kies er één in de gele banner bovenaan zodat de bestelling compleet is.' },
                    ]}
                />

                <InkoopLijst
                    initialSummary={summary}
                    leveranciers={leveranciers}
                    events_count={events_count}
                    has_menu_items={has_menu_items}
                />

                <OntvangstSectie orders={sentOrders} />
            </div>
        </RequireTier>
    );
}
