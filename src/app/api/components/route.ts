/* /api/components — Inspiratie Bibliotheek PR3
   POST: create a new component (prepared OR bought_in)
   GET:  list components (RLS doet org-filter, dus geen extra filtering)

   Validatie + re-auth gebeurt server-side ondanks RLS (defence-in-depth). */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';
import { syncComponentIngredients } from '@/lib/dal/componentIngredients';

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
    /* food = menu-bouwsteen (telt mee in statistieken); non_food = verpakking/materieel. */
    category: 'food' | 'non_food';
    base_quantity: number;
    base_unit: string;
    base_cost_cents: number;
    /* Pak-prijs administratie (2026-06-12): wat is er bij de groothandel betaald,
       voor welke inhoud. base_* blijft de reken-canon; dit is de bron ervan. */
    pack_price_cents?: number | null;
    pack_quantity?: number | null;
    pack_unit?: string | null;
    ingredients?: unknown;
    preparation_steps?: unknown;
    flavor_tags?: string[];
    supplier_product_id?: number | null;
    ai_suggested?: boolean;
    /* Optionele koppeling aan component_folders (S2-deel-3). NULL = root. */
    folder_id?: string | null;
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

    /* Pak-prijs trio: alle drie of geen — een halve verpakkingsadministratie
       is erger dan geen. */
    const PACK_UNITS = new Set(['g', 'kg', 'ml', 'liter', 'stuk', 'portie']);
    const hasAnyPack = b.pack_price_cents != null || b.pack_quantity != null || b.pack_unit != null;
    let pack: { pack_price_cents: number; pack_quantity: number; pack_unit: string } | null = null;
    if (hasAnyPack) {
        if (typeof b.pack_price_cents !== 'number' || !Number.isInteger(b.pack_price_cents) || b.pack_price_cents < 0) {
            return { ok: false, error: 'pack_price_cents moet een niet-negatieve integer zijn (cents)' };
        }
        if (typeof b.pack_quantity !== 'number' || !(b.pack_quantity > 0)) {
            return { ok: false, error: 'pack_quantity > 0 verplicht als pak-prijs is gezet' };
        }
        if (typeof b.pack_unit !== 'string' || !PACK_UNITS.has(b.pack_unit)) {
            return { ok: false, error: 'pack_unit moet g/kg/ml/liter/stuk/portie zijn' };
        }
        pack = { pack_price_cents: b.pack_price_cents, pack_quantity: b.pack_quantity, pack_unit: b.pack_unit };
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
            /* Whitelist: alles wat geen non_food is wordt food (default). */
            category: b.category === 'non_food' ? 'non_food' : 'food',
            base_quantity: b.base_quantity,
            base_unit: b.base_unit.trim(),
            base_cost_cents: b.base_cost_cents,
            pack_price_cents: pack?.pack_price_cents ?? null,
            pack_quantity: pack?.pack_quantity ?? null,
            pack_unit: pack?.pack_unit ?? null,
            ingredients: b.ingredients ?? null,
            preparation_steps: b.preparation_steps ?? null,
            flavor_tags: Array.isArray(b.flavor_tags) ? b.flavor_tags.filter((t): t is string => typeof t === 'string') : [],
            supplier_product_id: typeof b.supplier_product_id === 'number' ? b.supplier_product_id : null,
            ai_suggested: typeof b.ai_suggested === 'boolean' ? b.ai_suggested : false,
            /* folder_id: alleen accepteren als UUID-achtige string; anders null. */
            folder_id: typeof b.folder_id === 'string' && /^[0-9a-f-]{36}$/i.test(b.folder_id) ? b.folder_id : null,
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
    const { allergens, haccp_points, folder_id, ...componentData } = v.data;
    const now = new Date().toISOString();

    const { data, error } = await supabase
        .from('components')
        .insert({
            ...componentData,
            /* Defensief (2026-06-12): folder_id alleen meesturen als gezet —
               de component_folders-migration is niet op elke omgeving gerund
               en een NULL-key op een ontbrekende kolom laat PostgREST 500'en. */
            ...(folder_id ? { folder_id } : {}),
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

    // Genormaliseerde ingrediënt-koppeling (component_ingredients) bijwerken zodat
    // de bestelmotor het component-pad kan volgen. Best-effort — nooit fataal.
    if (componentData.ingredients != null) {
        const sync = await syncComponentIngredients(supabase, membership.organization_id, data.id, componentData.ingredients);
        if (sync.error) warnings.push(`ingrediënt-koppeling: ${sync.error}`);
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

    // RLS filtert op organization_id automatisch.
    // gerecht_components erbij zodat de UI per component "in N gerechten"
    // kan tonen — de zichtbare lijn van inkoopprijs naar gerecht.
    const [compRes, usageRes] = await Promise.all([
        supabase.from('components').select('*').order('created_at', { ascending: false }),
        supabase.from('gerecht_components').select('component_id, gerecht_id'),
    ]);

    if (compRes.error) {
        return NextResponse.json({ error: compRes.error.message }, { status: 500 });
    }

    /* Distinct gerechten per component (een gerecht kan een component
       in theorie 2× bevatten; dat telt als 1 gerecht). */
    const usage: Record<number, number> = {};
    if (usageRes.data) {
        const seen = new Set<string>();
        for (const row of usageRes.data) {
            const key = `${row.component_id}:${row.gerecht_id}`;
            if (seen.has(key)) continue;
            seen.add(key);
            usage[row.component_id as number] = (usage[row.component_id as number] ?? 0) + 1;
        }
    }

    return NextResponse.json({ components: compRes.data ?? [], usage });
}
