/* /api/components/[id] — Inspiratie Bibliotheek
   GET:    component + allergens + haccp_points joined (voor edit-drawer in PR3b)
   PATCH:  update een component, optioneel met replace van allergens/haccp_points
   DELETE: verwijder een component (RESTRICT als in gerecht_components) */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';
import { costAtUseCents } from '@/lib/unitPrice';
import { isMissingYieldColumn, YIELD_MIGRATIE_MELDING } from '../route';
import { syncComponentIngredients } from '@/lib/dal/componentIngredients';
import { supplierProductBaseCost } from '@/lib/supplierSync/recipeCost';

const ALLOWED_HACCP_TYPES = new Set([
    'kerntemp', 'koeltemp', 'tijd_uit_koeling',
    'handhygiene', 'kruisbesmetting', 'oppervlakte_reiniging', 'overig',
]);

type DbFout = { code?: string; message?: string; details?: string; hint?: string } | null | undefined;

/* Rauwe Postgres-tekst is voor een kok geen informatie maar paniek: bij
   "Could not find the 'pack_unit' column" weet hij niet of hij zelf iets fout
   deed, of het opgeslagen is, of dat hij door kan werken. Daarom vertalen we
   elke databasefout naar één zin in mensentaal, en houden we de technische
   tekst in de serverlog voor onszelf. Zonder deze helper lekt élke nieuwe
   foutsituatie weer als databasejargon het scherm op. */
function menselijkeDbFout(err: DbFout, waar: string, actie: 'opslaan' | 'laden' | 'verwijderen' = 'opslaan'): string {
    const code = String(err?.code ?? '');
    console.error(`[api/components/[id]] ${waar} — code=${code || 'geen'} :: ${err?.message ?? ''} :: ${err?.details ?? ''}`);

    switch (code) {
        case '42703':
        case 'PGRST204':
            return 'Deze app kent een veld dat de database nog niet heeft. Er moet eerst een database-update gedraaid worden; daarna kun je dit gewoon opslaan.';
        case '23505':
            return 'Dit bestaat al — er staat al een bouwsteen met deze gegevens in de bibliotheek.';
        case '23503':
            return 'Iets waar deze bouwsteen aan vasthangt bestaat niet (meer) — bijvoorbeeld de map of het gekoppelde inkoopproduct. Ververs de pagina en probeer het opnieuw.';
        case '23514':
            return 'Een van de ingevulde waardes mag zo niet. Controleer de hoeveelheid, de kostprijs en het snijverlies.';
        case '42501':
        case 'PGRST301':
            return 'Je hebt geen toegang tot deze bouwsteen.';
        default: {
            const staart = code ? ` Geef deze foutcode door als het blijft misgaan: ${code}.` : '';
            return `Het ${actie} is niet gelukt. Probeer het zo nog een keer.${staart}`;
        }
    }
}

const CONFLICT_MELDING =
    'Iemand anders — of een automatische prijs-update — heeft deze bouwsteen net gewijzigd. '
    + 'Sluit dit venster en open de bouwsteen opnieuw, anders overschrijf je die wijziging.';

async function authorize(supabase: Awaited<ReturnType<typeof createServerSupabase>>) {
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return { error: 'Niet ingelogd', status: 401 as const, user: null, orgId: null as string | null };

    const { data: membership, error: memberErr } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .limit(1)
        .maybeSingle();
    if (memberErr || !membership) {
        return { error: 'Geen actieve organisatie-membership', status: 403 as const, user, orgId: null };
    }
    return { user, orgId: membership.organization_id as string, error: null, status: 200 as const };
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    const { id } = await ctx.params;
    const componentId = Number(id);
    if (!Number.isInteger(componentId) || componentId <= 0) {
        return NextResponse.json({ error: 'Ongeldig component-id' }, { status: 400 });
    }
    const supabase = await createServerSupabase();
    const auth = await authorize(supabase);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const [compRes, allRes, haccpRes] = await Promise.all([
        supabase.from('components').select('*').eq('id', componentId).eq('organization_id', auth.orgId!).maybeSingle(),
        supabase.from('component_allergens').select('*').eq('component_id', componentId),
        supabase.from('component_haccp_points').select('*').eq('component_id', componentId).order('id'),
    ]);
    if (compRes.error) {
        return NextResponse.json({ error: menselijkeDbFout(compRes.error, 'GET component', 'laden') }, { status: 500 });
    }
    if (!compRes.data) return NextResponse.json({ error: 'Component niet gevonden' }, { status: 404 });

    /* Een mislukte allergenen- of HACCP-query mag NOOIT als lege lijst het scherm
       in. De bewerk-lade vult haar vinkjes met wat hier terugkomt en stuurt die
       lijst bij Opslaan één-op-één terug; een leeg vak zou dan de échte gluten en
       noten definitief uit de bibliotheek wissen, terwijl Sam alleen de prijs
       aanpaste. Liever helemaal niet openen dan openen met een leeg allergenenvak. */
    if (allRes.error || haccpRes.error) {
        menselijkeDbFout(allRes.error ?? haccpRes.error, 'GET allergenen/HACCP', 'laden');
        return NextResponse.json({
            error: 'De allergenen en HACCP-punten van deze bouwsteen konden niet opgehaald worden. '
                + 'We tonen ze liever niet dan half — anders sla je ze per ongeluk leeg op. Probeer het zo nog een keer.',
            allergens_unavailable: true,
        }, { status: 500 });
    }

    /* Gekoppeld aan een leverancier? Geef de ACTUELE rij mee (genormaliseerd)
       zodat de editor de badge toont én de kostprijs kan meebewegen. Twee bronnen:
       Catalog A (supplier_prices) of Catalog B (supplier_products). */
    const compRow = compRes.data as Record<string, unknown>;
    let linkedPrice: Record<string, unknown> | null = null;
    const spId = compRow.supplier_price_id as number | null | undefined;
    const sprodId = compRow.supplier_product_id as number | null | undefined;
    if (spId) {
        const { data: sp } = await supabase
            .from('supplier_prices')
            .select('leverancier, product_naam, prijs_per_kg, prijs_per_stuk, actief')
            .eq('id', spId).eq('organization_id', auth.orgId!).maybeSingle();
        if (sp) linkedPrice = {
            source: 'price_list', leverancier: sp.leverancier, naam: sp.product_naam,
            actief: sp.actief, prijs_per_kg: sp.prijs_per_kg, prijs_per_stuk: sp.prijs_per_stuk,
        };
    } else if (sprodId) {
        const { data: sprod } = await supabase
            .from('supplier_products')
            .select('name, supplier_id, price_cents, unit, package_size, package_unit, total_base_quantity, base_unit, active')
            .eq('id', sprodId).eq('organization_id', auth.orgId!).maybeSingle();
        if (sprod) {
            const base = supplierProductBaseCost({
                price_cents: sprod.price_cents as number, unit: sprod.unit as string | null,
                package_size: sprod.package_size as number | null, package_unit: sprod.package_unit as string | null,
                total_base_quantity: sprod.total_base_quantity as number | null, base_unit: sprod.base_unit as string | null,
            });
            let levNaam: string | null = null;
            if (sprod.supplier_id != null) {
                const { data: l } = await supabase.from('leveranciers').select('naam').eq('id', sprod.supplier_id).maybeSingle();
                levNaam = (l?.naam as string) ?? null;
            }
            linkedPrice = {
                source: 'supplier_product', leverancier: levNaam, naam: sprod.name, actief: sprod.active,
                base_cost_cents: base?.base_cost_cents ?? null, base_quantity: base?.base_quantity ?? null, base_unit: base?.base_unit ?? null,
            };
        }
    }

    return NextResponse.json({
        component: compRes.data,
        allergens: allRes.data ?? [],
        haccp_points: haccpRes.data ?? [],
        linked_price: linkedPrice,
    });
}

/* ── Allergenen: verschil-schrijven i.p.v. wissen-en-opnieuw-invoegen ────────
   Het oude patroon verwijderde eerst álle allergenen en zette daarna de nieuwe
   terug. Ging dat tweede deel mis (en dat gebeurde structureel: de lade stuurt
   codes mee die de database niet kent), dan stond een gerecht met noten daarna
   als allergeenvrij te boek — terwijl het scherm "opgeslagen" zei. Nu voegen we
   eerst toe en verwijderen we pas daarna wat écht weg moet, zodat er geen moment
   bestaat waarop de bouwsteen leeg is. Wat ongewijzigd blijft, blijft staan —
   inclusief de herkomst (AI-voorstel of door een mens bevestigd), want die kan
   de lade niet doorgeven en mag dus niet overschreven worden. */
type AllergeenPayload = { allergen_code: string; ai_suggested?: boolean };

function normaliseerAllergenen(input: unknown[]): AllergeenPayload[] {
    const uniek = new Map<string, AllergeenPayload>();
    for (const a of input) {
        if (typeof a !== 'object' || a === null) continue;
        const rij = a as Record<string, unknown>;
        if (typeof rij.allergen_code !== 'string') continue;
        const code = rij.allergen_code.trim().toUpperCase();
        if (code.length === 0 || code.length > 5) continue;
        if (!uniek.has(code)) uniek.set(code, { allergen_code: code, ai_suggested: Boolean(rij.ai_suggested) });
    }
    return Array.from(uniek.values());
}

/* ── HACCP-punten: zelfde verschil-gedachte, maar zonder natuurlijke sleutel ──
   Twee punten zijn "hetzelfde" als soort, grenswaarde, eenheid en notitie
   gelijk zijn. Zo houden we bestaande rijen (met hun herkomst) in leven en
   raken we nooit alle punten kwijt door één mislukte invoeging. */
function haccpSleutel(r: { type: unknown; threshold_value: unknown; threshold_unit: unknown; note: unknown }): string {
    const waarde = r.threshold_value == null || r.threshold_value === '' ? '' : String(Number(r.threshold_value));
    const eenheid = typeof r.threshold_unit === 'string' ? r.threshold_unit.trim() : '';
    const notitie = typeof r.note === 'string' ? r.note.trim() : '';
    return [String(r.type ?? ''), waarde, eenheid, notitie].join('|');
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    const { id } = await ctx.params;
    const componentId = Number(id);
    if (!Number.isInteger(componentId) || componentId <= 0) {
        return NextResponse.json({ error: 'Ongeldig component-id' }, { status: 400 });
    }

    const supabase = await createServerSupabase();
    const auth = await authorize(supabase);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const body = await req.json().catch(() => null);
    if (typeof body !== 'object' || body === null) {
        return NextResponse.json({ error: 'Body moet een object zijn' }, { status: 400 });
    }

    // Whitelist van editable velden
    const updateData: Record<string, unknown> = {};
    const b = body as Record<string, unknown>;
    if (typeof b.name === 'string' && b.name.trim().length > 0) updateData.name = b.name.trim();
    if (typeof b.description === 'string' || b.description === null) updateData.description = b.description;
    if (typeof b.base_quantity === 'number' && b.base_quantity > 0) updateData.base_quantity = b.base_quantity;
    if (typeof b.base_unit === 'string' && b.base_unit.trim().length > 0) updateData.base_unit = b.base_unit.trim();
    if (typeof b.base_cost_cents === 'number' && b.base_cost_cents >= 0 && Number.isInteger(b.base_cost_cents)) {
        updateData.base_cost_cents = b.base_cost_cents;
    }
    if (Array.isArray(b.flavor_tags)) {
        updateData.flavor_tags = b.flavor_tags.filter((t): t is string => typeof t === 'string');
    }
    /* food/non-food scheiding (2026-06-12) — whitelist. */
    if (b.category === 'food' || b.category === 'non_food') updateData.category = b.category;
    /* Pak-prijs administratie (2026-06-12): per veld updatebaar, null = wissen.
       De UI stuurt het trio altijd samen; base_* blijft de reken-canon. */
    if (b.pack_price_cents === null || (typeof b.pack_price_cents === 'number' && Number.isInteger(b.pack_price_cents) && b.pack_price_cents >= 0)) {
        updateData.pack_price_cents = b.pack_price_cents;
    }
    if (b.pack_quantity === null || (typeof b.pack_quantity === 'number' && b.pack_quantity > 0)) {
        updateData.pack_quantity = b.pack_quantity;
    }
    if (b.pack_unit === null || (typeof b.pack_unit === 'string' && ['g', 'kg', 'ml', 'liter', 'stuk', 'portie'].includes(b.pack_unit))) {
        updateData.pack_unit = b.pack_unit;
    }
    /* Snijverlies (0<y<=1). Buiten bereik => negeren i.p.v. stil klemmen, zodat
       een typfout (7 i.p.v. 70) niet ongemerkt de kostprijs 14× opblaast. */
    /* Volledige geldige range (gelijk aan de DB-CHECK 0<y<=1). Met een guard op
       <1 kon je snijverlies nooit meer terugzetten naar 100%: de waarde 1 viel
       uit de update en de DB hield de oude 0,75 vast — een eenrichtingsdeur op
       de kostprijs van élk gerecht met dat component. */
    if (typeof b.yield_factor === 'number' && Number.isFinite(b.yield_factor) && b.yield_factor > 0 && b.yield_factor <= 1) {
        updateData.yield_factor = b.yield_factor;
    }
    if (b.ingredients !== undefined) updateData.ingredients = b.ingredients;
    if (b.preparation_steps !== undefined) updateData.preparation_steps = b.preparation_steps;
    /* GP-5 (2026-05-25): drag-drop verplaatsing tussen folders.
       Accepteert string (folder UUID) of null (= "zonder folder"). */
    if (b.folder_id === null || typeof b.folder_id === 'string') {
        updateData.folder_id = b.folder_id;
    }
    /* Blijvende koppeling aan een leverancier-prijs (Catalog A). null = ontkoppelen. */
    if (b.master_product_id === null || (typeof b.master_product_id === 'number' && Number.isInteger(b.master_product_id))) {
        updateData.master_product_id = b.master_product_id;
    }
    if (b.supplier_price_id === null || (typeof b.supplier_price_id === 'number' && Number.isInteger(b.supplier_price_id))) {
        updateData.supplier_price_id = b.supplier_price_id;
    }
    if (b.supplier_product_id === null || (typeof b.supplier_product_id === 'number' && Number.isInteger(b.supplier_product_id))) {
        updateData.supplier_product_id = b.supplier_product_id;
    }

    // Optionele nested replace-arrays
    const replaceAllergens = Array.isArray(b.allergens) ? b.allergens : null;
    const replaceHaccp = Array.isArray(b.haccp_points) ? b.haccp_points : null;

    if (Object.keys(updateData).length === 0 && replaceAllergens === null && replaceHaccp === null) {
        return NextResponse.json({ error: 'Geen wijzigingen' }, { status: 400 });
    }

    /* Huidige rij ophalen vóór we iets schrijven. Die dient drie doelen:
       eigenaarschap bevestigen, de oude kostprijs kennen voor het doorrekenen,
       en de versie (updated_at) vastpakken waarop we straks schrijven. */
    const { data: huidig, error: huidigErr } = await supabase
        .from('components')
        .select('*')
        .eq('id', componentId)
        .eq('organization_id', auth.orgId!)
        .maybeSingle();
    if (huidigErr) {
        return NextResponse.json({ error: menselijkeDbFout(huidigErr, 'PATCH pre-read', 'opslaan') }, { status: 500 });
    }
    if (!huidig) return NextResponse.json({ error: 'Component niet gevonden of geen toegang' }, { status: 404 });

    const huidigeRij = huidig as Record<string, unknown>;
    const huidigeVersie = typeof huidigeRij.updated_at === 'string' ? huidigeRij.updated_at : null;

    /* Gelijktijdig opslaan: wie het laatst op Opslaan drukt, won altijd — ook als
       hij een uur oude gegevens in beeld had. Een prijs-verversing van de
       leverancier of een collega die net 'noten' aanvinkte werd zo zonder één
       waarschuwing teruggedraaid, inclusief het doorrekenen naar alle gerechten.
       De lade stuurt de versie mee die ze bij het openen kreeg; klopt die niet
       meer, dan slaan we niets op en zeggen we wat er aan de hand is. */
    if (typeof b.expected_updated_at === 'string' && huidigeVersie) {
        const verwacht = Date.parse(b.expected_updated_at);
        const gevonden = Date.parse(huidigeVersie);
        if (Number.isFinite(verwacht) && Number.isFinite(gevonden) && verwacht !== gevonden) {
            return NextResponse.json({ error: CONFLICT_MELDING, conflict: true, updated_at: huidigeVersie }, { status: 409 });
        }
    }

    const now = new Date().toISOString();
    const warnings: string[] = [];
    let lijstenGewijzigd = false;

    /* Volgorde: eerst de lijsten (allergenen/HACCP), dan pas de velden van de
       bouwsteen zelf. Loopt er iets mis in een lijst, dan is er nog niets anders
       geschreven en werkt gewoon opnieuw opslaan — bij de omgekeerde volgorde
       zou de tweede poging op zijn eigen versie-controle stuklopen. */
    if (replaceAllergens !== null) {
        const gewenst = normaliseerAllergenen(replaceAllergens);

        const bestaandRes = await supabase
            .from('component_allergens')
            .select('allergen_code')
            .eq('component_id', componentId)
            .eq('organization_id', auth.orgId!);
        if (bestaandRes.error) {
            return NextResponse.json({
                error: menselijkeDbFout(bestaandRes.error, 'PATCH allergenen lezen', 'opslaan')
                    + ' De allergenen staan nog zoals ze waren; er is niets gewijzigd.',
            }, { status: 500 });
        }
        const bestaandeCodes = new Set(
            (bestaandRes.data ?? []).map(r => String((r as { allergen_code: unknown }).allergen_code)),
        );

        /* De vinkjes in de lade en de allergenenlijst van de database zijn ooit
           uit elkaar gelopen (de lade kent codes die daar niet bestaan). Zo'n code
           liet de invoeging klappen — en in het oude patroon was op dat moment
           alles al gewist. We controleren het daarom vooraf en raken niets aan. */
        const toevoegen = gewenst.filter(a => !bestaandeCodes.has(a.allergen_code));

        /* Alleen NIEUWE codes toetsen, niet alles wat er al stond.
           Toetsten we de hele lijst, dan kon een bouwsteen waar ooit een code op
           gezet is die de database niet (meer) kent helemaal niet meer opgeslagen
           worden — ook niet als je alleen de prijs aanpaste. Dan zet je iemand
           klem op een fout die hij niet gemaakt heeft en niet kán herstellen.
           Wat er al staat laten we met rust; wat erbij komt moet kloppen. */
        const masterRes = await supabase.from('allergens').select('code');
        if (!masterRes.error && masterRes.data && toevoegen.length > 0) {
            const geldig = new Set((masterRes.data as { code: unknown }[]).map(r => String(r.code)));
            const onbekend = toevoegen.map(a => a.allergen_code).filter(c => !geldig.has(c));
            if (onbekend.length > 0) {
                return NextResponse.json({
                    error: `Deze allergeen-vinkjes kent de database niet (${onbekend.join(', ')}), dus is er aan de allergenen niets gewijzigd. `
                        + 'Dit is een fout in de app zelf — geef het even door.',
                }, { status: 409 });
            }
        }

        const verwijderen = Array.from(bestaandeCodes).filter(c => !gewenst.some(a => a.allergen_code === c));
        if (toevoegen.length > 0 || verwijderen.length > 0) lijstenGewijzigd = true;

        if (toevoegen.length > 0) {
            const rows = toevoegen.map(a => ({
                component_id: componentId,
                allergen_code: a.allergen_code,
                ai_suggested: Boolean(a.ai_suggested),
                /* Alleen een mens bevestigt. Een AI-voorstel afstempelen als
                   "door mens bevestigd" maakt de bewijsketen bij een controle op
                   etikettering waardeloos — dan staat álles als handmatig gecheckt. */
                confirmed_at: a.ai_suggested ? null : now,
                confirmed_by: a.ai_suggested ? null : auth.user!.id,
                organization_id: auth.orgId!,
            }));
            const { error: insErr } = await supabase.from('component_allergens').insert(rows);
            if (insErr) {
                return NextResponse.json({
                    error: menselijkeDbFout(insErr, 'PATCH allergenen toevoegen', 'opslaan')
                        + ' De allergenen zijn niet gewijzigd — de oude staan er nog. Er is verder niets opgeslagen.',
                }, { status: 409 });
            }
        }

        if (verwijderen.length > 0) {
            const { error: delErr } = await supabase
                .from('component_allergens')
                .delete()
                .eq('component_id', componentId)
                .eq('organization_id', auth.orgId!)
                .in('allergen_code', verwijderen);
            if (delErr) {
                return NextResponse.json({
                    error: menselijkeDbFout(delErr, 'PATCH allergenen verwijderen', 'opslaan')
                        + ' De weggehaalde allergenen staan er nog; probeer opnieuw op te slaan.',
                }, { status: 409 });
            }
        }
    }

    if (replaceHaccp !== null) {
        const gewenst = replaceHaccp
            .filter((h: unknown): h is Record<string, unknown> => typeof h === 'object' && h !== null)
            .filter(h => typeof h.type === 'string' && ALLOWED_HACCP_TYPES.has(h.type as string));

        const bestaandRes = await supabase
            .from('component_haccp_points')
            .select('id, type, threshold_value, threshold_unit, note')
            .eq('component_id', componentId)
            .eq('organization_id', auth.orgId!);
        if (bestaandRes.error) {
            return NextResponse.json({
                error: menselijkeDbFout(bestaandRes.error, 'PATCH HACCP lezen', 'opslaan')
                    + ' De HACCP-punten staan nog zoals ze waren; er is niets gewijzigd.',
            }, { status: 500 });
        }

        /* Per sleutel een voorraadje bestaande rij-ids: elke gewenste rij die er
           al staat, verbruikt er één. Wat overblijft moet weg. */
        const pool = new Map<string, number[]>();
        for (const r of (bestaandRes.data ?? []) as Record<string, unknown>[]) {
            const key = haccpSleutel({ type: r.type, threshold_value: r.threshold_value, threshold_unit: r.threshold_unit, note: r.note });
            const lijst = pool.get(key) ?? [];
            lijst.push(Number(r.id));
            pool.set(key, lijst);
        }

        const nieuweRijen: Record<string, unknown>[] = [];
        for (const h of gewenst) {
            const key = haccpSleutel({ type: h.type, threshold_value: h.threshold_value, threshold_unit: h.threshold_unit, note: h.note });
            const lijst = pool.get(key);
            if (lijst && lijst.length > 0) { lijst.shift(); continue; }
            const aiVoorstel = Boolean(h.ai_suggested);
            nieuweRijen.push({
                component_id: componentId,
                type: h.type as string,
                threshold_value: typeof h.threshold_value === 'number' ? h.threshold_value : null,
                threshold_unit: typeof h.threshold_unit === 'string' ? h.threshold_unit : null,
                note: typeof h.note === 'string' ? h.note : null,
                ai_suggested: aiVoorstel,
                /* Zelfde regel als bij allergenen: een AI-voorstel is geen
                   menselijke bevestiging, anders liegt de rij over zichzelf. */
                confirmed_at: aiVoorstel ? null : now,
                confirmed_by: aiVoorstel ? null : auth.user!.id,
                organization_id: auth.orgId!,
            });
        }
        const overbodig = Array.from(pool.values()).flat();
        if (nieuweRijen.length > 0 || overbodig.length > 0) lijstenGewijzigd = true;

        if (nieuweRijen.length > 0) {
            const { error: insErr } = await supabase.from('component_haccp_points').insert(nieuweRijen);
            if (insErr) {
                return NextResponse.json({
                    error: menselijkeDbFout(insErr, 'PATCH HACCP toevoegen', 'opslaan')
                        + ' De HACCP-punten zijn niet gewijzigd — de oude staan er nog. Er is verder niets opgeslagen.',
                }, { status: 409 });
            }
        }

        if (overbodig.length > 0) {
            const { error: delErr } = await supabase
                .from('component_haccp_points')
                .delete()
                .eq('component_id', componentId)
                .eq('organization_id', auth.orgId!)
                .in('id', overbodig);
            if (delErr) {
                return NextResponse.json({
                    error: menselijkeDbFout(delErr, 'PATCH HACCP verwijderen', 'opslaan')
                        + ' De weggehaalde HACCP-punten staan er nog; probeer opnieuw op te slaan.',
                }, { status: 409 });
            }
        }
    }

    /* Alleen allergenen of HACCP gewijzigd? Tik dan tóch de versie van de
       bouwsteen op. Anders "ziet" een lade die al openstond niet dat er net
       noten zijn bijgezet, en draait de volgende Opslaan dat stil terug. */
    if (lijstenGewijzigd && Object.keys(updateData).length === 0) {
        const { error: tikErr } = await supabase
            .from('components')
            .update({ updated_at: now })
            .eq('id', componentId)
            .eq('organization_id', auth.orgId!);
        if (tikErr) menselijkeDbFout(tikErr, 'PATCH versie bijwerken', 'opslaan');
    }

    /* Bucket-C GP-4 (2026-05-25): bij base_cost_cents-wijziging moet de
       cost_at_use_cents van alle gerecht_components-rijen herrekend worden
       en de gerechten.total_cost_cents auto-rollup. Anders blijft de
       kostprijs in gerechten stale en klopt /q/[id] niet meer.
       De oude waarden komen uit de rij die we hierboven al lazen. */
    const oldBaseCostCents = (huidigeRij.base_cost_cents as number | null) ?? null;
    const oldBaseQuantity = (huidigeRij.base_quantity as number | null) ?? null;
    const oldYieldFactor = (huidigeRij.yield_factor as number | null) ?? null;

    // Update component zelf (alleen als er velden zijn) — anders skip + ga door naar joins
    let componentRow: Record<string, unknown> | null = null;
    if (Object.keys(updateData).length > 0) {
        /* updated_at zetten we zelf: de database doet dat niet (de trigger die
           het probeert is een AFTER-trigger en heeft geen effect). Zonder deze
           regel blijft de versie eeuwig staan en betekent de versie-controle
           hierboven niets. */
        updateData.updated_at = now;

        let q = supabase
            .from('components')
            .update(updateData)
            .eq('id', componentId)
            .eq('organization_id', auth.orgId!);
        /* Schrijven op de versie die we net lazen. Wijzigt er iets tussen lezen
           en schrijven (bijvoorbeeld de nachtelijke leveranciersprijs), dan raakt
           deze update 0 rijen in plaats van die wijziging stil te overschrijven. */
        if (huidigeVersie) q = q.eq('updated_at', huidigeVersie);

        const { data, error } = await q.select().maybeSingle();
        if (error) {
            if (isMissingYieldColumn(error)) {
                return NextResponse.json({ error: YIELD_MIGRATIE_MELDING }, { status: 409 });
            }
            return NextResponse.json({ error: menselijkeDbFout(error, 'PATCH update', 'opslaan') }, { status: 500 });
        }
        if (!data) {
            /* Nul rijen geraakt: óf de versie klopte niet meer, óf de bouwsteen
               is intussen weg. Beide gevallen krijgen hun eigen zin. */
            const { data: bestaatNog } = await supabase
                .from('components').select('id').eq('id', componentId).eq('organization_id', auth.orgId!).maybeSingle();
            if (!bestaatNog) {
                return NextResponse.json({ error: 'Deze bouwsteen bestaat niet meer.' }, { status: 404 });
            }
            return NextResponse.json({ error: CONFLICT_MELDING, conflict: true }, { status: 409 });
        }
        componentRow = data;
    }

    // Genormaliseerde ingrediënt-koppeling bijwerken zodra de ingredients-JSONB
    // is meegestuurd. Best-effort — nooit fataal voor de component-update.
    if (b.ingredients !== undefined) {
        const sync = await syncComponentIngredients(supabase, auth.orgId!, componentId, b.ingredients);
        if (sync.error) warnings.push(`ingrediënt-koppeling: ${sync.error}`);
    }

    /* GP-4 cascading recompute — uitvoeren ná component-update zodat we
       de NIEUWE base_cost_cents kennen. We re-fetchen het component en
       updaten elke gerecht_components-rij + sommeren gerechten.total_cost_cents. */
    let recomputedGerechten = 0;
    if ((typeof updateData.base_cost_cents === 'number' || typeof updateData.yield_factor === 'number') && componentRow) {
        const newBaseCost = componentRow.base_cost_cents as number;
        const newBaseQty = (componentRow.base_quantity as number) ?? oldBaseQuantity ?? 1;
        const newYield = (componentRow as { yield_factor?: number }).yield_factor ?? 1;

        if ((newBaseCost !== oldBaseCostCents || newYield !== oldYieldFactor) && newBaseQty > 0) {
            /* Stap 1: fetch alle gerecht_components-rijen met dit component_id.
               De tabel heeft géén `id` — de sleutel is (gerecht_id, component_id),
               zie migratie 20260510130000. Vragen om `id` liet de hele query
               falen, waardoor kostprijzen nooit doorgerekend werden. */
            const { data: gcRows, error: gcErr } = await supabase
                .from('gerecht_components')
                .select('gerecht_id, quantity_used, unit')
                .eq('component_id', componentId)
                .eq('organization_id', auth.orgId!);

            if (gcErr) {
                warnings.push(`cost-recompute fetch: ${gcErr.message}`);
            } else if (gcRows && gcRows.length > 0) {
                /* Stap 2: per rij nieuwe cost_at_use_cents berekenen + updaten.
                   Sequential ipv batch om RLS-policy-checks niet te verzwakken. */
                const updatePromises = gcRows.map(row => {
                    /* Zelfde formule als de DB-trigger (migratie 20260729120000)
                       via de gedeelde canon, zodat app en DB niet uit elkaar lopen. */
                    const newCost = costAtUseCents({
                        quantityUsed: Number(row.quantity_used),
                        usedUnit: (row as { unit?: string }).unit,
                        baseQuantity: newBaseQty,
                        baseUnit: (componentRow as { base_unit?: string }).base_unit,
                        baseCostCents: newBaseCost,
                        yieldFactor: newYield,
                    });
                    /* Rij aanwijzen op de échte primaire sleutel; org-filter erbij
                       zodat een update nooit buiten de eigen organisatie kan vallen. */
                    return supabase
                        .from('gerecht_components')
                        .update({ cost_at_use_cents: newCost })
                        .eq('gerecht_id', row.gerecht_id)
                        .eq('component_id', componentId)
                        .eq('organization_id', auth.orgId!);
                });
                const results = await Promise.all(updatePromises);
                const failures = results.filter(r => r.error).length;
                if (failures > 0) warnings.push(`${failures} gerecht_components-rows failed to recompute`);

                /* Stap 3: gerechten.total_cost_cents per geraakt gerecht aggregeren.
                   Unique gerecht_id's verzamelen, dan per gerecht SUM(cost_at_use_cents). */
                const affectedGerechten = Array.from(new Set(gcRows.map(r => r.gerecht_id)));
                for (const gid of affectedGerechten) {
                    const { data: sumRow } = await supabase
                        .from('gerecht_components')
                        .select('cost_at_use_cents')
                        .eq('gerecht_id', gid)
                        .eq('organization_id', auth.orgId!);
                    if (sumRow) {
                        const totalCost = sumRow.reduce((s, r) => s + Number(r.cost_at_use_cents ?? 0), 0);
                        await supabase
                            .from('gerechten')
                            .update({ total_cost_cents: totalCost })
                            .eq('id', gid)
                            .eq('organization_id', auth.orgId!);
                    }
                }
                recomputedGerechten = affectedGerechten.length;
            }
        }
    }

    // Re-fetch full state na replace (kleine extra call, geeft UI clean basis)
    let finalComponent = componentRow;
    if (!finalComponent) {
        /* Org-filter erbij: nooit een rij teruggeven die buiten de eigen
           organisatie valt, ook niet als RLS ooit anders staat afgesteld. */
        const { data } = await supabase
            .from('components').select('*').eq('id', componentId).eq('organization_id', auth.orgId!).maybeSingle();
        finalComponent = data;
    }

    return NextResponse.json({
        component: finalComponent,
        ...(warnings.length > 0 ? { warnings } : {}),
        ...(recomputedGerechten > 0 ? { recomputed_gerechten: recomputedGerechten } : {}),
    });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    const { id } = await ctx.params;
    const componentId = Number(id);
    if (!Number.isInteger(componentId) || componentId <= 0) {
        return NextResponse.json({ error: 'Ongeldig component-id' }, { status: 400 });
    }

    const supabase = await createServerSupabase();
    const auth = await authorize(supabase);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { error } = await supabase
        .from('components')
        .delete()
        .eq('id', componentId)
        .eq('organization_id', auth.orgId!);

    if (error) {
        /* FK RESTRICT op gerecht_components → 23503. De database beschermt hier
           terecht tegen dataverlies, maar "verwijder eerst die referenties" is
           geen taal waar een kok iets mee kan: het zegt niet wát er in de weg
           staat en niet waar hij moet zijn. Dus noemen we de gerechten bij naam. */
        if (error.code === '23503') {
            const { data: inGebruik } = await supabase
                .from('gerecht_components')
                .select('gerechten(id, naam)')
                .eq('component_id', componentId)
                .eq('organization_id', auth.orgId!)
                .limit(20);
            const namen = (inGebruik ?? [])
                .map((r) => (r as { gerechten?: { naam?: string } | null }).gerechten?.naam)
                .filter((n): n is string => !!n);
            const uniek = Array.from(new Set(namen));
            const opsomming = uniek.length === 0
                ? ''
                : uniek.length <= 3
                    ? ` (${uniek.join(', ')})`
                    : ` (${uniek.slice(0, 3).join(', ')} en nog ${uniek.length - 3})`;
            return NextResponse.json({
                error: uniek.length === 1
                    ? `Deze bouwsteen zit nog in het gerecht${opsomming}. Haal 'm daar eerst uit, dan kun je 'm verwijderen.`
                    : `Deze bouwsteen zit nog in ${uniek.length || 'meerdere'} gerechten${opsomming}. Haal 'm daar eerst uit, dan kun je 'm verwijderen.`,
                gerechten: uniek,
            }, { status: 409 });
        }
        return NextResponse.json({ error: menselijkeDbFout(error, 'DELETE component', 'verwijderen') }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
}
