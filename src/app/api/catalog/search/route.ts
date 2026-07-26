/**
 * GET /api/catalog/search?q=sparerib
 *
 * Zoekt de prijslijst-catalogus (master_products + supplier_prices — "Catalog A",
 * gevuld door de leverancier-prijslijst-import) op productnaam en geeft ÉÉN rij
 * terug per (product × leverancier met een actieve prijs). Zo kan de cateraar in
 * de component-editor bv. "sparerib" tikken en de juiste leverancier-versie
 * aanvinken (Beef Club 29 / Bitfood / Hanos), elk met eigen prijs.
 *
 * Belangrijk: we koppelen bewust NIET via components.supplier_product_id — dat is
 * een FK naar de andere catalogus (supplier_products) en levert een verkeerde
 * join op (bekende id-mismatch). De koppeling landt op ingrediënt-niveau in de
 * component-JSONB, met master_product_id + supplier_price_id als harde sleutels.
 *
 * Prijs = code-rekenwerk, nooit AI. We geven de opgeslagen leverancier-prijs
 * (prijs_per_kg / prijs_per_stuk) door; de kostprijs-som gebeurt client-side
 * deterministisch.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';
import { supplierProductBaseCost } from '@/lib/supplierSync/recipeCost';
import { tokenSetSimilarity, fuzzyShingles } from '@/lib/fuzzy';

export const runtime = 'nodejs';

/* Fuzzy-fallback: alleen aanzetten als de gewone (substring) zoek weinig oplevert,
   zodat een tikfout ("komkomer", "bidfoud") tóch de juiste producten opdiept.
   THIN = drempel waaronder we fuzzy erbij zoeken; FUZZY_MIN = minimale
   trigram-similarity (pg_trgm-default 0.3); CAND = max kandidaten om te wegen. */
const THIN_RESULTS = 6;
const FUZZY_MIN = 0.35;
const FUZZY_CANDIDATES = 200;

/* Interne rang-velden — worden vóór verzending gestript. */
type RankedHit = CatalogSearchHit & { _fuzzy?: boolean; _score?: number };

export interface CatalogSearchHit {
    /* 'price_list' = Catalog A (master_products+supplier_prices, prijslijst-import).
       'supplier_product' = Catalog B (supplier_products, gescande bestel-catalogus,
       bv. Bidfood). Default undefined = price_list (back-compat). */
    source?: 'price_list' | 'supplier_product';
    master_product_id: number;
    supplier_price_id: number;
    /* Alleen bij source==='supplier_product'. */
    supplier_product_id?: number | null;
    naam: string;
    categorie: string | null;
    leverancier: string | null;
    prijs: number;
    eenheid: string | null;
    prijs_per_kg: number | null;
    prijs_per_stuk: number | null;
    datum: string | null;
    /* Voor-berekende base-kostprijs (alleen supplier_product) — client hoeft niet te rekenen. */
    base_cost_cents?: number | null;
    base_quantity?: number | null;
    base_unit?: string | null;
}

export async function GET(req: NextRequest) {
    /* Sanitize: houd letters/cijfers/spatie/koppelteken over. Weg met de tekens
       die een PostgREST-filterwaarde kunnen breken (%, _, komma, haakjes, *). */
    const raw = (req.nextUrl.searchParams.get('q') || '').trim();
    const q = raw.replace(/[%_,()*]/g, ' ').replace(/\s+/g, ' ').trim();
    if (q.length < 2) return NextResponse.json({ results: [] });

    /* Zoek per woord (AND), volgorde-onafhankelijk, i.p.v. de hele zin als één
       substring. Zo vindt "coppa ham" ook "Brasvar Coppa Ham" / "Zwijnscoppaham"
       en "brasvar coppa" de juiste versie — anders val je bij 2+ woorden in een
       leeg gat omdat geen product letterlijk "coppa ham" heet. Elk woord ≥2
       tekens; max 6 om de query begrensd te houden. */
    const tokens = q.split(' ').filter((t) => t.length >= 2).slice(0, 6);
    const searchTokens = tokens.length > 0 ? tokens : [q];

    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

    const { data: member } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .limit(1)
        .maybeSingle();
    const orgId = member?.organization_id;
    if (!orgId) return NextResponse.json({ error: 'Geen organisatie' }, { status: 400 });

    /* 1) Matchende producten. RLS scoped + expliciete org-filter (defensief). */
    let masterQuery = supabase
        .from('master_products')
        .select('id, naam, categorie, standaard_eenheid')
        .eq('organization_id', orgId)
        .eq('uit_assortiment', false);
    for (const t of searchTokens) masterQuery = masterQuery.ilike('naam', `%${t}%`);
    const { data: masters, error: mErr } = await masterQuery.limit(60);
    if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 });

    const wantSupplierProducts = req.nextUrl.searchParams.get('supplierProducts') === '1';
    const results: RankedHit[] = [];

    /* ── Catalog A: prijslijst (master_products + supplier_prices) ── */
    type MasterMeta = { naam: string; categorie: string | null; standaard_eenheid: string | null; fuzzy: boolean; score: number };
    const masterById = new Map<number, MasterMeta>();
    for (const m of (masters || [])) {
        masterById.set(m.id as number, {
            naam: (m.naam as string) ?? '',
            categorie: (m.categorie as string | null) ?? null,
            standaard_eenheid: (m.standaard_eenheid as string | null) ?? null,
            fuzzy: false,
            score: 1,
        });
    }

    /* Fuzzy-fallback (Catalog A): weinig exacte treffers → haal kandidaten op die
       ≥1 trigram met de zoekterm delen en weeg ze met trigram-similarity. */
    if ((masters?.length ?? 0) < THIN_RESULTS) {
        const shingles = fuzzyShingles(q);
        if (shingles.length > 0) {
            const orFilter = shingles.map((s) => `naam.ilike.%${s}%`).join(',');
            const { data: cand } = await supabase
                .from('master_products')
                .select('id, naam, categorie, standaard_eenheid')
                .eq('organization_id', orgId)
                .eq('uit_assortiment', false)
                .or(orFilter)
                .limit(FUZZY_CANDIDATES);
            for (const c of cand || []) {
                const id = c.id as number;
                if (masterById.has(id)) continue;
                const score = tokenSetSimilarity(q, (c.naam as string) ?? '');
                if (score >= FUZZY_MIN) {
                    masterById.set(id, {
                        naam: (c.naam as string) ?? '',
                        categorie: (c.categorie as string | null) ?? null,
                        standaard_eenheid: (c.standaard_eenheid as string | null) ?? null,
                        fuzzy: true,
                        score,
                    });
                }
            }
        }
    }

    if (masterById.size > 0) {
        const { data: prices, error: pErr } = await supabase
            .from('supplier_prices')
            .select('id, master_product_id, leverancier, prijs, eenheid, prijs_per_kg, prijs_per_stuk, datum')
            .eq('organization_id', orgId)
            .in('master_product_id', Array.from(masterById.keys()))
            .eq('actief', true)
            .order('datum', { ascending: false, nullsFirst: false })
            .order('id', { ascending: false });
        if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });

        const seen = new Set<string>();
        for (const p of prices || []) {
            const masterId = p.master_product_id as number;
            const m = masterById.get(masterId);
            if (!m) continue;
            const key = `${masterId}|${(p.leverancier as string | null || '').toLowerCase()}`;
            if (seen.has(key)) continue;
            seen.add(key);
            results.push({
                source: 'price_list',
                master_product_id: masterId,
                supplier_price_id: p.id as number,
                naam: m.naam,
                categorie: m.categorie,
                leverancier: (p.leverancier as string | null) ?? null,
                prijs: Number(p.prijs) || 0,
                eenheid: (p.eenheid as string | null) ?? m.standaard_eenheid ?? null,
                prijs_per_kg: p.prijs_per_kg != null ? Number(p.prijs_per_kg) : null,
                prijs_per_stuk: p.prijs_per_stuk != null ? Number(p.prijs_per_stuk) : null,
                datum: (p.datum as string | null) ?? null,
                _fuzzy: m.fuzzy,
                _score: m.score,
            });
        }
    }

    /* ── Catalog B: gescande bestel-catalogus (supplier_products) — opt-in via
       ?supplierProducts=1. Zo kan bv. een Bidfood-coppa (die alleen gescand is,
       niet in de prijslijst) tóch aan een component gekoppeld worden. Kostprijs
       via supplierProductBaseCost (deterministisch). NOOIT id-join met Catalog A. */
    if (wantSupplierProducts) {
        type SpRow = {
            id: number; name: string; supplier_id: number | null; price_cents: number;
            unit: string | null; package_size: number | null; package_unit: string | null;
            total_base_quantity: number | null; base_unit: string | null;
        };
        const spCols = 'id, name, supplier_id, price_cents, unit, package_size, package_unit, total_base_quantity, base_unit';

        let spQuery = supabase
            .from('supplier_products')
            .select(spCols)
            .eq('organization_id', orgId)
            .eq('active', true);
        for (const t of searchTokens) spQuery = spQuery.ilike('name', `%${t}%`);
        const { data: spsExact } = await spQuery.limit(30);

        const spById = new Map<number, { row: SpRow; fuzzy: boolean; score: number }>();
        for (const s of (spsExact || []) as SpRow[]) spById.set(s.id, { row: s, fuzzy: false, score: 1 });

        /* Fuzzy-fallback (Catalog B) — zelfde principe als hierboven. */
        if ((spsExact?.length ?? 0) < THIN_RESULTS) {
            const shingles = fuzzyShingles(q);
            if (shingles.length > 0) {
                const orFilter = shingles.map((s) => `name.ilike.%${s}%`).join(',');
                const { data: cand } = await supabase
                    .from('supplier_products')
                    .select(spCols)
                    .eq('organization_id', orgId)
                    .eq('active', true)
                    .or(orFilter)
                    .limit(FUZZY_CANDIDATES);
                for (const s of (cand || []) as SpRow[]) {
                    if (spById.has(s.id)) continue;
                    const score = tokenSetSimilarity(q, s.name ?? '');
                    if (score >= FUZZY_MIN) spById.set(s.id, { row: s, fuzzy: true, score });
                }
            }
        }

        const sps = Array.from(spById.values());
        if (sps.length > 0) {
            const supIds = Array.from(new Set(sps.map((s) => s.row.supplier_id).filter(Boolean)));
            const levMap = new Map<number, string>();
            if (supIds.length > 0) {
                const { data: levs } = await supabase
                    .from('leveranciers').select('id, naam')
                    .eq('organization_id', orgId).in('id', supIds as number[]);
                for (const l of (levs || [])) levMap.set(l.id as number, (l.naam as string) ?? '');
            }
            for (const { row: s, fuzzy, score } of sps) {
                const base = supplierProductBaseCost({
                    price_cents: s.price_cents,
                    unit: s.unit,
                    package_size: s.package_size,
                    package_unit: s.package_unit,
                    total_base_quantity: s.total_base_quantity,
                    base_unit: s.base_unit,
                });
                results.push({
                    source: 'supplier_product',
                    master_product_id: 0,
                    supplier_price_id: 0,
                    supplier_product_id: s.id,
                    naam: s.name,
                    categorie: null,
                    leverancier: (s.supplier_id != null ? levMap.get(s.supplier_id) : null) ?? null,
                    prijs: (Number(s.price_cents) || 0) / 100,
                    eenheid: s.unit ?? null,
                    prijs_per_kg: null,
                    prijs_per_stuk: null,
                    datum: null,
                    base_cost_cents: base?.base_cost_cents ?? null,
                    base_quantity: base?.base_quantity ?? null,
                    base_unit: base?.base_unit ?? null,
                    _fuzzy: fuzzy,
                    _score: score,
                });
            }
        }
    }

    /* Exacte treffers eerst (alfabetisch), daarna de fuzzy-treffers op aflopende
       gelijkenis — zo staat wat je écht typte bovenaan en zijn tikfout-suggesties
       een vangnet eronder. Interne rang-velden strippen we vóór verzending. */
    results.sort((a, b) => {
        const fa = a._fuzzy ? 1 : 0;
        const fb = b._fuzzy ? 1 : 0;
        if (fa !== fb) return fa - fb;
        if (fa === 1) {
            const d = (b._score ?? 0) - (a._score ?? 0);
            if (Math.abs(d) > 1e-6) return d;
        }
        return a.naam.localeCompare(b.naam, 'nl') ||
            (a.leverancier || '').localeCompare(b.leverancier || '', 'nl');
    });

    const clean: CatalogSearchHit[] = results.slice(0, 50).map(({ _fuzzy, _score, ...hit }) => {
        void _fuzzy; void _score;
        return hit;
    });
    return NextResponse.json({ results: clean });
}
