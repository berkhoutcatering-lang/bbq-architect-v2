import { createServerSupabase } from '@/lib/supabase-server';
import VoorraadClient, { type VoorraadInitial } from './_components/VoorraadClient';

export const dynamic = 'force-dynamic';

/* P0.24 — Voorraad hub Server Component shell.
   Prefetcht inventory + recepten + supplier-prices + movements + price-history
   parallel. Client-body krijgt het als initial-data en gebruikt useSupabase
   met de initial-data als defaultVal — refetch + realtime daarna.
   Tenant-isolatie via RLS-policies op elke tabel. */
export default async function VoorraadPage() {
    const supabase = await createServerSupabase();

    const [
        inventoryRes,
        receptenRes,
        supplierPricesRes,
        movementsRes,
        priceHistoryRes,
    ] = await Promise.all([
        supabase.from('inventory').select('*').order('naam').limit(2000),
        supabase.from('recepten').select('*').limit(500),
        supabase.from('supplier_prices').select('*').order('created_at', { ascending: false }).limit(2000),
        supabase.from('stock_movements').select('*').order('created_at', { ascending: false }).limit(500),
        supabase.from('price_history').select('id, inventory_id, datum, unit_price, unit, source').order('datum', { ascending: false }).limit(1000),
    ]);

    const initial: VoorraadInitial = {
        inventory: inventoryRes.data ?? [],
        recepten: receptenRes.data ?? [],
        supplierPrices: supplierPricesRes.data ?? [],
        movements: movementsRes.data ?? [],
        priceHistory: priceHistoryRes.data ?? [],
    };

    return <VoorraadClient initial={initial} />;
}
