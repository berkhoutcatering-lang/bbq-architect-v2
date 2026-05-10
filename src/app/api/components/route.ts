/* /api/components — Inspiratie Bibliotheek PR3
   POST: create a new component (prepared OR bought_in)
   GET:  list components (RLS doet org-filter, dus geen extra filtering)

   Validatie + re-auth gebeurt server-side ondanks RLS (defence-in-depth). */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';

interface ComponentInput {
    name: string;
    description?: string | null;
    type: 'prepared' | 'bought_in';
    base_quantity: number;
    base_unit: string;
    base_cost_cents: number;
    ingredients?: unknown;
    preparation_steps?: unknown;
    flavor_tags?: string[];
    supplier_product_id?: number | null;
    ai_suggested?: boolean;
}

function validateInput(body: unknown): { ok: true; data: ComponentInput } | { ok: false; error: string } {
    if (typeof body !== 'object' || body === null) return { ok: false, error: 'Body moet een object zijn' };
    const b = body as Record<string, unknown>;
    if (typeof b.name !== 'string' || b.name.trim().length === 0) return { ok: false, error: 'name verplicht' };
    if (b.type !== 'prepared' && b.type !== 'bought_in') return { ok: false, error: 'type moet prepared of bought_in zijn' };
    if (typeof b.base_quantity !== 'number' || b.base_quantity <= 0) return { ok: false, error: 'base_quantity > 0 verplicht' };
    if (typeof b.base_unit !== 'string' || b.base_unit.trim().length === 0) return { ok: false, error: 'base_unit verplicht' };
    if (typeof b.base_cost_cents !== 'number' || b.base_cost_cents < 0 || !Number.isInteger(b.base_cost_cents)) {
        return { ok: false, error: 'base_cost_cents moet een niet-negatieve integer zijn (cents)' };
    }
    return {
        ok: true,
        data: {
            name: b.name.trim(),
            description: typeof b.description === 'string' ? b.description : null,
            type: b.type,
            base_quantity: b.base_quantity,
            base_unit: b.base_unit.trim(),
            base_cost_cents: b.base_cost_cents,
            ingredients: b.ingredients ?? null,
            preparation_steps: b.preparation_steps ?? null,
            flavor_tags: Array.isArray(b.flavor_tags) ? b.flavor_tags.filter((t): t is string => typeof t === 'string') : [],
            supplier_product_id: typeof b.supplier_product_id === 'number' ? b.supplier_product_id : null,
            ai_suggested: typeof b.ai_suggested === 'boolean' ? b.ai_suggested : false,
        },
    };
}

export async function POST(req: NextRequest) {
    const supabase = await createServerSupabase();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
        return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });
    }

    // Re-authorize: zoek de organization_id van de actieve membership
    const { data: membership, error: memberErr } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .limit(1)
        .maybeSingle();
    if (memberErr || !membership) {
        return NextResponse.json({ error: 'Geen actieve organisatie-membership' }, { status: 403 });
    }

    const body = await req.json().catch(() => null);
    const v = validateInput(body);
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

    const { data, error } = await supabase
        .from('components')
        .insert({
            ...v.data,
            organization_id: membership.organization_id,
            approved_at: v.data.ai_suggested ? null : new Date().toISOString(),
            approved_by: v.data.ai_suggested ? null : user.id,
        })
        .select()
        .single();

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ component: data }, { status: 201 });
}

export async function GET() {
    const supabase = await createServerSupabase();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
        return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });
    }

    // RLS filtert op organization_id automatisch
    const { data, error } = await supabase
        .from('components')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ components: data ?? [] });
}
