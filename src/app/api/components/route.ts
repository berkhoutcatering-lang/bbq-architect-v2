/* /api/components — Inspiratie Bibliotheek PR3
   POST: create a new component (prepared OR bought_in)
   GET:  list components (RLS doet org-filter, dus geen extra filtering)

   Validatie + re-auth gebeurt server-side ondanks RLS (defence-in-depth). */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';

interface AllergenInput {
    allergen_code: string;
    ai_suggested?: boolean;
}

interface HaccpPointInput {
    type: string;
    threshold_value?: number | null;
    threshold_unit?: string | null;
    note?: string | null;
    ai_suggested?: boolean;
}

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
    /* Optionele nested writes (worden in join-tables opgeslagen) */
    allergens?: AllergenInput[];
    haccp_points?: HaccpPointInput[];
}

const ALLOWED_HACCP_TYPES = new Set([
    'kerntemp', 'koeltemp', 'tijd_uit_koeling',
    'handhygiene', 'kruisbesmetting', 'oppervlakte_reiniging', 'overig',
]);

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

    // Optionele allergens
    const allergens: AllergenInput[] = [];
    if (Array.isArray(b.allergens)) {
        for (const a of b.allergens) {
            if (typeof a === 'object' && a !== null && typeof (a as any).allergen_code === 'string') {
                const code = (a as any).allergen_code.trim().toUpperCase();
                if (code.length > 0 && code.length <= 5) {
                    allergens.push({
                        allergen_code: code,
                        ai_suggested: Boolean((a as any).ai_suggested),
                    });
                }
            }
        }
    }

    // Optionele HACCP-punten
    const haccp_points: HaccpPointInput[] = [];
    if (Array.isArray(b.haccp_points)) {
        for (const h of b.haccp_points) {
            if (typeof h !== 'object' || h === null) continue;
            const ho = h as any;
            if (typeof ho.type !== 'string' || !ALLOWED_HACCP_TYPES.has(ho.type)) continue;
            haccp_points.push({
                type: ho.type,
                threshold_value: typeof ho.threshold_value === 'number' ? ho.threshold_value : null,
                threshold_unit: typeof ho.threshold_unit === 'string' ? ho.threshold_unit : null,
                note: typeof ho.note === 'string' ? ho.note : null,
                ai_suggested: Boolean(ho.ai_suggested),
            });
        }
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
            allergens,
            haccp_points,
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
    if (v.ok === false) return NextResponse.json({ error: v.error }, { status: 400 });

    // Split nested writes uit (allergens + haccp gaan naar join-tables)
    const { allergens, haccp_points, ...componentData } = v.data;
    const now = new Date().toISOString();

    const { data, error } = await supabase
        .from('components')
        .insert({
            ...componentData,
            organization_id: membership.organization_id,
            approved_at: componentData.ai_suggested ? null : now,
            approved_by: componentData.ai_suggested ? null : user.id,
        })
        .select()
        .single();

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Nested writes — bewust niet-fataal: component is binnen, allergens/haccp best-effort.
    // Bij failure loggen we het maar geven 201 met component terug (UI kan retry op detail-page).
    const warnings: string[] = [];

    if (allergens && allergens.length > 0) {
        const rows = allergens.map(a => ({
            component_id: data.id,
            allergen_code: a.allergen_code,
            ai_suggested: a.ai_suggested ?? false,
            confirmed_at: a.ai_suggested ? null : now,
            confirmed_by: a.ai_suggested ? null : user.id,
            organization_id: membership.organization_id,
        }));
        const { error: allergenErr } = await supabase.from('component_allergens').insert(rows);
        if (allergenErr) warnings.push(`allergenen: ${allergenErr.message}`);
    }

    if (haccp_points && haccp_points.length > 0) {
        const rows = haccp_points.map(h => ({
            component_id: data.id,
            type: h.type,
            threshold_value: h.threshold_value,
            threshold_unit: h.threshold_unit,
            note: h.note,
            ai_suggested: h.ai_suggested ?? false,
            confirmed_at: h.ai_suggested ? null : now,
            confirmed_by: h.ai_suggested ? null : user.id,
            organization_id: membership.organization_id,
        }));
        const { error: haccpErr } = await supabase.from('component_haccp_points').insert(rows);
        if (haccpErr) warnings.push(`HACCP: ${haccpErr.message}`);
    }

    return NextResponse.json({
        component: data,
        ...(warnings.length > 0 ? { warnings } : {}),
    }, { status: 201 });
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
