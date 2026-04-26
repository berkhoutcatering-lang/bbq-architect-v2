/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';

export const runtime = 'nodejs';
export const maxDuration = 15;

/*
 * Stock-movement audit log writer
 * ───────────────────────────────
 * Frontend-aanroep vanuit voorraad/prep-counter om voorraad-mutaties te
 * loggen. Kan ook current_stock + last_count_at op inventory updaten.
 * Best-effort: faalt stilletjes als RLS / org-id ontbreekt zodat UI niet
 * blokkeert op audit-trail issues.
 */

interface MovementInput {
    inventory_id: number;
    type: 'count' | 'usage' | 'receive' | 'adjust' | 'waste';
    qty: number;
    resulting_stock?: number;
    note?: string;
    update_inventory?: boolean;  /* zo ja → ook inventory.current_stock + last_count_at updaten */
}

export async function POST(req: NextRequest) {
    try {
        const supabase = await createServerSupabase();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

        const { data: memberData } = await supabase
            .from('organization_members').select('organization_id')
            .eq('user_id', user.id).eq('status', 'active').limit(1);
        const orgId = memberData?.[0]?.organization_id;
        if (!orgId) return NextResponse.json({ error: 'Geen organisatie' }, { status: 400 });

        const body = await req.json() as MovementInput;
        const { inventory_id, type, qty, resulting_stock, note, update_inventory } = body;

        if (!inventory_id || !type || typeof qty !== 'number') {
            return NextResponse.json({ error: 'inventory_id, type en qty verplicht' }, { status: 400 });
        }

        /* Voor display: probeer email of full_name uit user metadata */
        const byUser = (user.user_metadata?.full_name || user.email || '').toString().slice(0, 60);

        const { data: inserted, error } = await supabase
            .from('stock_movements')
            .insert({
                organization_id: orgId,
                inventory_id,
                type,
                qty,
                resulting_stock: resulting_stock ?? null,
                note: note ?? null,
                by_user: byUser,
                by_user_id: user.id,
            })
            .select('id, created_at')
            .single();

        if (error) return NextResponse.json({ error: error.message }, { status: 500 });

        /* Optioneel: ook inventory.current_stock + last_count_at bijwerken
           (zodat de frontend niet 2 calls hoeft te doen) */
        if (update_inventory && resulting_stock !== undefined) {
            await supabase.from('inventory')
                .update({
                    current_stock: resulting_stock,
                    ...(type === 'count' ? { last_count_at: new Date().toISOString() } : {}),
                })
                .eq('id', inventory_id);
        }

        return NextResponse.json({ success: true, movement: inserted });
    } catch (e: any) {
        console.error('[stock-movement]', e);
        return NextResponse.json({ error: e?.message || 'Onbekende fout' }, { status: 500 });
    }
}
