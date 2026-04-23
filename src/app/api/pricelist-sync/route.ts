/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';

export const runtime = 'nodejs';
export const maxDuration = 300;

/*
 * Synchroniseer een nieuwe parsed prijslijst met master_products.
 *
 * PERFORMANCE: geen N+1 queries. Alle existing data wordt 1× upfront geladen
 * in Maps, daarna doet de hoofdloop alleen in-memory werk. Alle writes gaan
 * als bulk-insert/bulk-update in het einde. Geschikt voor 500-1000 producten
 * per call zonder Vercel timeout.
 */

function normalize(s: string): string {
    return (s || '').toLowerCase().trim().replace(/[^a-z0-9]/g, '');
}

/** Simpele fuzzy similarity — Jaccard over char-bigrams */
function similarity(a: string, b: string): number {
    const aN = normalize(a), bN = normalize(b);
    if (aN === bN) return 1;
    if (aN.length < 3 || bN.length < 3) return 0;

    const bigrams = (s: string): Set<string> => {
        const set = new Set<string>();
        for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
        return set;
    };
    const aBi = bigrams(aN), bBi = bigrams(bN);
    let intersect = 0;
    aBi.forEach(x => { if (bBi.has(x)) intersect++; });
    return (2 * intersect) / (aBi.size + bBi.size);
}

interface ProductInput {
    product_naam: string;
    prijs: number;
    eenheid?: string;
    categorie?: string;
}

/** Chunk helper voor bulk-insert (Supabase heeft ~1000 row limiet) */
function chunk<T>(arr: T[], size: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
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

        const body = await req.json();
        const { leverancier, producten, categorieFilter } = body as {
            leverancier: string;
            producten: ProductInput[];
            categorieFilter?: string;
        };

        if (!leverancier || !Array.isArray(producten)) {
            return NextResponse.json({ error: 'leverancier + producten verplicht' }, { status: 400 });
        }

        const datum = new Date().toISOString().slice(0, 10);

        /* ═══ STAP 1: Preload alles 1× ═══ */

        /* Alle master_products in deze org (voor fuzzy match) */
        const { data: existingMasters, error: mErr } = await supabase
            .from('master_products')
            .select('id, naam, naam_normalized, categorie, standaard_leverancier')
            .eq('organization_id', orgId);
        if (mErr) return NextResponse.json({ error: 'Master-query: ' + mErr.message }, { status: 500 });

        const mastersByNorm = new Map<string, any>();
        const mastersArray: any[] = existingMasters || [];
        for (const m of mastersArray) mastersByNorm.set(m.naam_normalized, m);

        /* Alle actieve supplier_prices voor deze leverancier — voor dedup + update */
        const { data: existingActivePrices, error: pErr } = await supabase
            .from('supplier_prices')
            .select('id, master_product_id, prijs')
            .eq('organization_id', orgId)
            .eq('leverancier', leverancier)
            .eq('actief', true);
        if (pErr) return NextResponse.json({ error: 'Prices-query: ' + pErr.message }, { status: 500 });

        /* Map: master_product_id → { id, prijs } voor O(1) dedup-check */
        const activePriceByMasterId = new Map<number, { id: number; prijs: number }>();
        const existingMasterIds = new Set<number>();
        for (const p of (existingActivePrices || [])) {
            if (p.master_product_id) {
                activePriceByMasterId.set(p.master_product_id, { id: p.id, prijs: Number(p.prijs) });
                existingMasterIds.add(p.master_product_id);
            }
        }

        /* ═══ STAP 2: In-memory verwerking ═══ */

        const stats = { nieuw: 0, geupdate: 0, uit_assortiment: 0, duplicaten: 0 };
        const touchedMasterIds = new Set<number>();
        const deactivatePriceIds: number[] = [];

        /* Producten die een NIEUW master_product nodig hebben → bulk-insert later */
        type PendingNew = { input: ProductInput; masterId?: number };
        const pendingNewMasters: PendingNew[] = [];
        const pendingExistingMatches: { input: ProductInput; masterId: number }[] = [];

        for (const p of producten) {
            if (!p.product_naam || typeof p.prijs !== 'number') continue;

            const norm = normalize(p.product_naam);
            let masterId: number | null = null;

            const exact = mastersByNorm.get(norm);
            if (exact) {
                masterId = exact.id;
            } else {
                /* Fuzzy scan — O(n) per product, maar puur in-memory */
                let bestScore = 0.85;
                let bestMatch: any = null;
                for (const m of mastersArray) {
                    const score = similarity(p.product_naam, m.naam);
                    if (score > bestScore) { bestScore = score; bestMatch = m; }
                }
                if (bestMatch) masterId = bestMatch.id;
            }

            if (masterId) {
                pendingExistingMatches.push({ input: p, masterId });
            } else {
                pendingNewMasters.push({ input: p });
            }
        }

        /* ═══ STAP 3: Bulk-insert nieuwe master_products ═══ */

        if (pendingNewMasters.length > 0) {
            const newMasterRows = pendingNewMasters.map(pm => ({
                organization_id: orgId,
                naam: pm.input.product_naam.trim(),
                categorie: pm.input.categorie || null,
                standaard_eenheid: pm.input.eenheid || 'stuks',
                standaard_leverancier: leverancier,
                uit_assortiment: false,
            }));

            /* Chunk van 500 om Supabase-limieten te respecteren */
            const insertedAll: any[] = [];
            for (const batch of chunk(newMasterRows, 500)) {
                const { data: inserted, error: insErr } = await supabase
                    .from('master_products')
                    .insert(batch)
                    .select('id, naam, naam_normalized');
                if (insErr) return NextResponse.json({ error: 'Master-insert: ' + insErr.message }, { status: 500 });
                if (inserted) insertedAll.push(...inserted);
            }

            /* Link masterId terug aan elke pendingNewMaster via naam_normalized */
            const newByNorm = new Map<string, any>();
            for (const m of insertedAll) newByNorm.set(m.naam_normalized, m);
            for (const pm of pendingNewMasters) {
                const match = newByNorm.get(normalize(pm.input.product_naam));
                if (match) {
                    pm.masterId = match.id;
                    stats.nieuw++;
                }
            }
        }

        /* ═══ STAP 4: Bouw supplier_prices rows ═══ */

        const newSupplierPrices: any[] = [];

        const addPriceRow = (input: ProductInput, masterId: number) => {
            touchedMasterIds.add(masterId);
            const existing = activePriceByMasterId.get(masterId);

            if (existing && existing.prijs === Number(input.prijs)) {
                stats.duplicaten++;
                return;
            }
            if (existing) {
                deactivatePriceIds.push(existing.id);
            }
            stats.geupdate++;

            const eenh = (input.eenheid || '').toLowerCase();
            let prijsPerKg: number | null = null;
            let prijsPerStuk: number | null = null;
            if (eenh.includes('kg') || eenh === 'kilo') prijsPerKg = input.prijs;
            else if (eenh === 'stuks' || eenh === 'stuk' || eenh.includes('pak')) prijsPerStuk = input.prijs;

            newSupplierPrices.push({
                organization_id: orgId,
                master_product_id: masterId,
                leverancier,
                product_naam: input.product_naam.trim(),
                prijs: Number(input.prijs),
                eenheid: input.eenheid || 'stuks',
                categorie: input.categorie || null,
                datum,
                actief: true,
                prijs_per_kg: prijsPerKg,
                prijs_per_stuk: prijsPerStuk,
            });
        };

        for (const pe of pendingExistingMatches) addPriceRow(pe.input, pe.masterId);
        for (const pn of pendingNewMasters) {
            if (pn.masterId) {
                /* Nieuwe master heeft per definitie geen actieve prijs, dus gewoon toevoegen */
                touchedMasterIds.add(pn.masterId);
                const eenh = (pn.input.eenheid || '').toLowerCase();
                let prijsPerKg: number | null = null;
                let prijsPerStuk: number | null = null;
                if (eenh.includes('kg') || eenh === 'kilo') prijsPerKg = pn.input.prijs;
                else if (eenh === 'stuks' || eenh === 'stuk' || eenh.includes('pak')) prijsPerStuk = pn.input.prijs;

                newSupplierPrices.push({
                    organization_id: orgId,
                    master_product_id: pn.masterId,
                    leverancier,
                    product_naam: pn.input.product_naam.trim(),
                    prijs: Number(pn.input.prijs),
                    eenheid: pn.input.eenheid || 'stuks',
                    categorie: pn.input.categorie || null,
                    datum,
                    actief: true,
                    prijs_per_kg: prijsPerKg,
                    prijs_per_stuk: prijsPerStuk,
                });
            }
        }

        /* ═══ STAP 5: Bulk writes ═══ */

        /* Deactiveer oude actieve prijzen in chunks */
        for (const idChunk of chunk(deactivatePriceIds, 500)) {
            if (idChunk.length === 0) continue;
            const { error } = await supabase.from('supplier_prices').update({ actief: false }).in('id', idChunk);
            if (error) return NextResponse.json({ error: 'Deactivate: ' + error.message }, { status: 500 });
        }

        /* Bulk-insert nieuwe supplier_prices in chunks */
        for (const rowChunk of chunk(newSupplierPrices, 500)) {
            if (rowChunk.length === 0) continue;
            const { error } = await supabase.from('supplier_prices').insert(rowChunk);
            if (error) return NextResponse.json({ error: 'Prices-insert: ' + error.message }, { status: 500 });
        }

        /* ═══ STAP 6: Uit-assortiment detectie ═══ */

        const missingIds: number[] = [];
        for (const oldId of existingMasterIds) {
            if (!touchedMasterIds.has(oldId)) missingIds.push(oldId);
        }

        let uitAssortimentMasterIds = missingIds;
        if (categorieFilter && missingIds.length > 0) {
            const { data: catFiltered } = await supabase
                .from('master_products')
                .select('id')
                .eq('organization_id', orgId)
                .eq('categorie', categorieFilter)
                .in('id', missingIds);
            uitAssortimentMasterIds = (catFiltered || []).map((m: any) => m.id);
        }

        if (uitAssortimentMasterIds.length > 0) {
            for (const idChunk of chunk(uitAssortimentMasterIds, 500)) {
                await supabase.from('master_products')
                    .update({ uit_assortiment: true, uit_assortiment_sinds: datum })
                    .in('id', idChunk);
                await supabase.from('supplier_prices')
                    .update({ actief: false })
                    .eq('leverancier', leverancier)
                    .in('master_product_id', idChunk);
            }
            stats.uit_assortiment = uitAssortimentMasterIds.length;
        }

        return NextResponse.json({
            success: true,
            stats,
            uit_assortiment_master_ids: uitAssortimentMasterIds,
        });
    } catch (e: any) {
        console.error('[pricelist-sync]', e);
        return NextResponse.json({ error: e?.message || 'Onbekende fout' }, { status: 500 });
    }
}
