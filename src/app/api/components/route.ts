
/* PostgREST/Postgres melden een onbekende kolom als 42703 of PGRST204. Zolang
   migratie 20260729120000 niet gedraaid is, bestaat components.yield_factor niet
   en zou de rauwe melding als "Could not find the yield_factor column" bij de
   gebruiker landen. We vertalen dat naar mensentaal — en slaan bewust NIET stil
   zonder snijverlies op: dan zou Sam denken dat 70% verwerkt is terwijl zijn
   kostprijs 30% te laag blijft doorwerken in gerechten en marges. */
export function isMissingYieldColumn(err: { code?: string; message?: string } | null): boolean {
    if (!err) return false;
    const code = String(err.code || '');
    const msg = String(err.message || '');
    return (code === '42703' || code === 'PGRST204') && msg.includes('yield_factor');
}

export const YIELD_MIGRATIE_MELDING =
    'Snijverlies kan nog niet opgeslagen worden: de database-update ontbreekt nog '
    + '(migratie 20260729120000). Zet het snijverlies op 100% om nu op te slaan, '
    + 'of draai eerst die migratie.';
/* /api/components — Inspiratie Bibliotheek PR3
   POST: create a new component (prepared OR bought_in)
   GET:  list components (RLS doet org-filter, dus geen extra filtering)

   Validatie + re-auth gebeurt server-side ondanks RLS (defence-in-depth). */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';
import { syncComponentIngredients } from '@/lib/dal/componentIngredients';
import { formatEur, formatNumber } from '@/lib/format';

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
    /** Snijverlies: bruikbare fractie van de inkoop (0<y<=1). 1 = geen verlies. */
    yield_factor?: number;
    /** Koppeling aan de prijslijst-catalogus (Catalog A) — zodat de prijs later
     *  mee kan bewegen met de leverancier. */
    master_product_id?: number | null;
    supplier_price_id?: number | null;
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
            /* Snijverlies — buiten (0,1] of ontbrekend => 1 (geen verlies). */
            /* Volledige geldige range (gelijk aan de DB-CHECK 0<y<=1). Een
               strengere guard (<1) zou 100% weggooien en snijverlies tot een
               eenrichtingsdeur maken: eenmaal op 75% nooit meer terug. */
            ...(function () {
                const y = Number(b.yield_factor);
                return Number.isFinite(y) && y > 0 && y <= 1 ? { yield_factor: y } : {};
            })(),
            master_product_id: typeof b.master_product_id === 'number' ? b.master_product_id : null,
            supplier_price_id: typeof b.supplier_price_id === 'number' ? b.supplier_price_id : null,
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

/* ─── Dubbele bouwstenen tegenhouden ────────────────────────────────────────
   Er zijn vier ingangen die hier binnenkomen (handmatig, Ingekocht-drawer,
   scan-drawer, AI-voorstel) en de database heeft geen unieke sleutel op naam
   of op de prijslijst-koppeling. Zonder deze controle staat "Brioche bun" er
   na een herimport drie keer in, met drie verschillende prijzen — en weet Sam
   bij het bouwen van een gerecht niet meer welke de goede is. Daarom weigeren
   we een dubbele en wijzen we naar de bestaande; alleen een aanroeper die het
   expliciet wil (allow_duplicate) mag er langs. */

/** Naam-vergelijking voor dubbelen: hoofdletters en extra spaties tellen niet
 *  mee. 'Brioche Bun' en 'brioche  bun' zijn voor de keuken één bouwsteen. */
export function normalizeComponentName(name: string): string {
    return String(name ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Zoekpatroon voor de naam-lookup. De jokertekens van de database (%, _, *)
 *  in een productnaam zouden anders als joker gelezen worden — daarom worden
 *  ze onschadelijk gemaakt. Het patroon mag ruim matchen: de echte
 *  vergelijking gebeurt daarna in vindDuplicaat(). */
export function likePatternForName(name: string): string {
    return String(name ?? '')
        .trim()
        .replace(/[%_*\\]/g, '_')
        .replace(/\s+/g, '%');
}

export interface BestaandeBouwsteen {
    id: number;
    name: string;
    type?: string | null;
    base_quantity?: number | string | null;
    base_unit?: string | null;
    base_cost_cents?: number | null;
    supplier_product_id?: number | null;
    master_product_id?: number | null;
}

export type DuplicaatReden = 'naam' | 'product';

/** Zoekt in de kandidaten de bouwsteen die dezelfde is als wat er binnenkomt.
 *  Een koppeling aan hetzelfde prijslijst-product weegt zwaarder dan de naam:
 *  dezelfde regel uit de leverancierslijst is per definitie hetzelfde spul,
 *  ook als de naam ondertussen aangepast is. */
export function vindDuplicaat(
    kandidaten: BestaandeBouwsteen[],
    input: { name: string; supplier_product_id?: number | null; master_product_id?: number | null },
): { bestaand: BestaandeBouwsteen; reden: DuplicaatReden } | null {
    const sp = typeof input.supplier_product_id === 'number' && input.supplier_product_id > 0
        ? input.supplier_product_id : null;
    const mp = typeof input.master_product_id === 'number' && input.master_product_id > 0
        ? input.master_product_id : null;

    for (const k of kandidaten) {
        if (sp !== null && k.supplier_product_id === sp) return { bestaand: k, reden: 'product' };
        if (mp !== null && k.master_product_id === mp) return { bestaand: k, reden: 'product' };
    }

    const doel = normalizeComponentName(input.name);
    if (doel.length > 0) {
        for (const k of kandidaten) {
            if (normalizeComponentName(k.name) === doel) return { bestaand: k, reden: 'naam' };
        }
    }
    return null;
}

/** "€ 4,50 voor 12 stuk" — geld altijd via format.ts, nooit zelf afronden. */
function prijsRegel(b: BestaandeBouwsteen): string {
    const cents = Number(b.base_cost_cents ?? 0);
    const qty = Number(b.base_quantity ?? 0);
    const bedrag = formatEur(cents / 100);
    if (!Number.isFinite(qty) || qty <= 0 || !b.base_unit) return bedrag;
    const decimalen = Number.isInteger(qty) ? 0 : 3;
    return `${bedrag} voor ${formatNumber(qty, decimalen)} ${b.base_unit}`;
}

/** Melding in mensentaal. Geen tabel- of kolomnamen, en geen verwijzing naar
 *  een knop die niet bestaat — alleen wat Sam nú kan doen. */
export function duplicaatMelding(bestaand: BestaandeBouwsteen, reden: DuplicaatReden): string {
    if (reden === 'product') {
        return `Dit product uit je prijslijst zit al in je bouwstenen als "${bestaand.name}" `
            + `(${prijsRegel(bestaand)}). Werk die bij — dan verandert de kostprijs meteen in `
            + 'alle gerechten waar hij in zit.';
    }
    return `Je hebt "${bestaand.name}" al als bouwsteen (${prijsRegel(bestaand)}). `
        + 'Werk die bij in plaats van er een tweede naast te zetten, of geef deze een andere '
        + 'naam als het echt iets anders is.';
}

type ServerSupabase = Awaited<ReturnType<typeof createServerSupabase>>;

const DUPLICAAT_KOLOMMEN = 'id, name, type, base_quantity, base_unit, base_cost_cents, supplier_product_id, master_product_id';

/** Haalt de handvol bouwstenen op die op deze nieuwe kunnen lijken: dezelfde
 *  naam, of dezelfde koppeling aan de prijslijst. Twee smalle queries in
 *  plaats van de hele bibliotheek ophalen. */
async function zoekBestaandeBouwsteen(
    supabase: ServerSupabase,
    organizationId: string,
    input: { name: string; supplier_product_id?: number | null; master_product_id?: number | null },
): Promise<{ treffer: { bestaand: BestaandeBouwsteen; reden: DuplicaatReden } | null; error: string | null }> {
    const koppelFilters: string[] = [];
    if (typeof input.supplier_product_id === 'number' && input.supplier_product_id > 0) {
        koppelFilters.push(`supplier_product_id.eq.${input.supplier_product_id}`);
    }
    if (typeof input.master_product_id === 'number' && input.master_product_id > 0) {
        koppelFilters.push(`master_product_id.eq.${input.master_product_id}`);
    }

    /* organization_id expliciet erbij ondanks RLS (defence-in-depth, zoals de
       rest van deze route). Anders zou een verkeerd beleid ons naar een
       bouwsteen van een andere cateraar laten wijzen. */
    const naamQuery = supabase
        .from('components')
        .select(DUPLICAAT_KOLOMMEN)
        .eq('organization_id', organizationId)
        .ilike('name', likePatternForName(input.name))
        .limit(25);

    const koppelQuery = koppelFilters.length > 0
        ? supabase
            .from('components')
            .select(DUPLICAAT_KOLOMMEN)
            .eq('organization_id', organizationId)
            .or(koppelFilters.join(','))
            .limit(25)
        : null;

    const [naamRes, koppelRes] = await Promise.all([
        naamQuery,
        koppelQuery ?? Promise.resolve({ data: [], error: null }),
    ]);

    const fout = naamRes.error?.message ?? koppelRes.error?.message ?? null;
    const kandidaten = [
        ...((koppelRes.data ?? []) as unknown as BestaandeBouwsteen[]),
        ...((naamRes.data ?? []) as unknown as BestaandeBouwsteen[]),
    ];

    return { treffer: vindDuplicaat(kandidaten, input), error: fout };
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
    const warnings: string[] = [];

    /* Bewuste ontsnapping: een aanroeper die écht een tweede exemplaar wil
       (bijv. twee verschillende broodjes die toevallig gelijk heten) stuurt
       allow_duplicate mee. Zonder die vlag wint de bescherming. */
    const staDubbelToe = typeof body === 'object' && body !== null
        && (body as Record<string, unknown>).allow_duplicate === true;

    if (!staDubbelToe) {
        const check = await zoekBestaandeBouwsteen(supabase, membership.organization_id, componentData);
        if (check.treffer) {
            return NextResponse.json({
                error: duplicaatMelding(check.treffer.bestaand, check.treffer.reden),
                bestaande_bouwsteen: check.treffer.bestaand,
                reden: check.treffer.reden,
            }, { status: 409 });
        }
        /* Kan de controle niet draaien, dan blokkeren we het opslaan niet — dat
           zou Sam buitensluiten om een storing die niets met zijn invoer te
           maken heeft. Wel eerlijk melden dat er níet op dubbelen gekeken is. */
        if (check.error) {
            console.warn('[components] dubbel-controle mislukt:', check.error);
            warnings.push('kon niet controleren of je deze bouwsteen al had');
        }
    }

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
        if (isMissingYieldColumn(error)) {
            return NextResponse.json({ error: YIELD_MIGRATIE_MELDING }, { status: 409 });
        }
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Nested writes — bewust niet-fataal: component is binnen, allergens/haccp best-effort.
    // Bij failure loggen we het maar geven 201 met component terug (UI kan retry op detail-page).

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

/* ─── Ophalen zonder stil plafond ───────────────────────────────────────────
   Een query zonder .range() wordt door de database afgekapt op max-rows
   (standaard 1000) zónder dat er iets van te merken is. Voor de koppeltabel
   gerecht-component gebeurt dat als eerste — die groeit met gerechten ×
   bouwstenen — en dan gaan "In gebruik" en "Ongebruikt" liegen: een bouwsteen
   die wél in een gerecht zit komt als ongebruikt in beeld. Daarom halen we
   expliciet pagina voor pagina op, tot een hard plafond, en vertellen we in
   het antwoord of we alles hebben. */
const PAGINA_GROOTTE = 1000;
/* Ruim boven wat een cateraar-bibliotheek realistisch is; puur een noodrem
   zodat één tenant de server nooit leegtrekt. */
const MAX_COMPONENTEN = 5000;
const MAX_GEBRUIK_RIJEN = 20000;

interface PaginaResultaat<T> {
    rijen: T[];
    totaal: number | null;
    afgekapt: boolean;
    error: string | null;
}

export async function haalAlleRijen<T>(
    pagina: (van: number, tot: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null; count: number | null }>,
    plafond: number,
): Promise<PaginaResultaat<T>> {
    const rijen: T[] = [];
    let totaal: number | null = null;

    for (;;) {
        const res = await pagina(rijen.length, rijen.length + PAGINA_GROOTTE - 1);
        if (res.error) return { rijen, totaal, afgekapt: false, error: res.error.message };
        const batch = res.data ?? [];
        if (res.count != null) totaal = res.count;
        rijen.push(...batch);

        if (batch.length === 0) break;
        if (totaal != null && rijen.length >= totaal) break;
        /* Zonder telling weten we alleen aan een niet-volle pagina dat we er
           zijn. Mét telling doen we dat niet: de server mag een kleinere
           max-rows hanteren dan onze paginagrootte. */
        if (totaal == null && batch.length < PAGINA_GROOTTE) break;
        if (rijen.length >= plafond) {
            return { rijen, totaal, afgekapt: totaal == null || totaal > rijen.length, error: null };
        }
    }

    return { rijen, totaal, afgekapt: false, error: null };
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
        /* Tweede sorteersleutel is geen sier: met alleen created_at kunnen twee
           bouwstenen uit dezelfde seconde tussen twee pagina's in dubbel of
           helemaal niet terugkomen. */
        haalAlleRijen<Record<string, unknown>>(
            (van, tot) => supabase
                .from('components')
                .select('*', { count: 'exact' })
                .order('created_at', { ascending: false })
                .order('id', { ascending: false })
                .range(van, tot),
            MAX_COMPONENTEN,
        ),
        haalAlleRijen<{ component_id: number; gerecht_id: string }>(
            (van, tot) => supabase
                .from('gerecht_components')
                .select('component_id, gerecht_id', { count: 'exact' })
                .order('component_id', { ascending: true })
                .order('gerecht_id', { ascending: true })
                .range(van, tot),
            MAX_GEBRUIK_RIJEN,
        ),
    ]);

    if (compRes.error) {
        return NextResponse.json({ error: compRes.error }, { status: 500 });
    }

    /* Distinct gerechten per component (een gerecht kan een component
       in theorie 2× bevatten; dat telt als 1 gerecht). */
    const usage: Record<number, number> = {};
    const seen = new Set<string>();
    for (const row of usageRes.rijen) {
        const key = `${row.component_id}:${row.gerecht_id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        usage[row.component_id] = (usage[row.component_id] ?? 0) + 1;
    }

    const getoond = compRes.rijen.length;
    const totaalComponenten = compRes.totaal ?? getoond;
    /* Weten we niet zeker dat we élke koppeling hebben, dan is "in gebruik" /
       "ongebruikt" een gok. Dat zeggen we hardop in plaats van het cijfer als
       waarheid te presenteren. */
    const gebruikCompleet = !usageRes.error && !usageRes.afgekapt;

    const waarschuwingen: string[] = [];
    if (usageRes.error) {
        console.warn('[components] gebruik-telling mislukt:', usageRes.error);
        waarschuwingen.push('We konden niet ophalen in welke gerechten je bouwstenen zitten — "in gebruik" en "ongebruikt" kloppen nu niet.');
    } else if (usageRes.afgekapt) {
        waarschuwingen.push('Je hebt zoveel gerechten dat we niet alle koppelingen konden nalopen — "ongebruikt" kan er meer tonen dan het zijn.');
    }
    if (compRes.afgekapt) {
        waarschuwingen.push(`We tonen ${getoond} van je ${totaalComponenten} bouwstenen — de rest valt buiten deze lijst.`);
    }

    return NextResponse.json({
        components: compRes.rijen,
        usage,
        /* Eerlijk over de horizon: een lijst die vol lijkt maar stilzwijgend
           rijen weglaat, leest als "meer is er niet". */
        totalen: {
            componenten_totaal: totaalComponenten,
            componenten_getoond: getoond,
            meer: Math.max(0, totaalComponenten - getoond),
            gebruik_compleet: gebruikCompleet,
        },
        ...(waarschuwingen.length > 0 ? { warnings: waarschuwingen } : {}),
    });
}
