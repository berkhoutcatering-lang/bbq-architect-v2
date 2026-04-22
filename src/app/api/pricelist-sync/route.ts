/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';

export const runtime = 'nodejs';
export const maxDuration = 60;

/*
 * Synchroniseer een nieuwe parsed prijslijst met master_products:
 * - Fuzzy match tegen bestaande master_products van deze leverancier
 * - Hoge match → supplier_prices entry toevoegen, oude actief→false
 * - Nieuwe master_products aanmaken voor items die niet matchen
 * - Uit-assortiment detectie: master-products van deze leverancier+categorie
 *   die NIET in de nieuwe upload voorkomen → flag uit_assortiment=true
 *
 * Retourneert samenvatting: { nieuw, geupdate, uit_assortiment, duplicaten }
 */

function normalize(s: string): string {
    return (s || '').toLowerCase().trim().replace(/[^a-z0-9]/g, '');
}

/** Simpele fuzzy similarity — Jaccard over woord-bigrams */
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
            categorieFilter?: string; /* Als gevuld, doe uit-assortiment check alleen binnen deze categorie */
        };

        if (!leverancier || !Array.isArray(producten)) {
            return NextResponse.json({ error: 'leverancier + producten verplicht' }, { status: 400 });
        }

        const datum = new Date().toISOString().slice(0, 10);

        /* Haal bestaande master_products op voor deze org (niet alleen deze leverancier —
           zelfde product kan bij meerdere leveranciers zitten) */
        const { data: existingMasters } = await supabase
            .from('master_products')
            .select('id, naam, naam_normalized, categorie, standaard_leverancier')
            .eq('organization_id', orgId);

        const mastersByNorm = new Map<string, any>();
        for (const m of (existingMasters || [])) mastersByNorm.set(m.naam_normalized, m);

        /* Voor uit-assortiment detectie: welke masters hebben actieve prijs van deze leverancier? */
        const { data: existingActivePrices } = await supabase
            .from('supplier_prices')
            .select('master_product_id, product_naam, categorie')
            .eq('organization_id', orgId)
            .eq('leverancier', leverancier)
            .eq('actief', true);

        const existingMasterIds = new Set<number>();
        for (const p of (existingActivePrices || [])) {
            if (p.master_product_id) existingMasterIds.add(p.master_product_id);
        }

        const stats = { nieuw: 0, geupdate: 0, uit_assortiment: 0, duplicaten: 0 };
        const touchedMasterIds = new Set<number>();
        const newSupplierPrices: any[] = [];
        const deactivatePriceIds: number[] = [];

        for (const p of producten) {
            if (!p.product_naam || typeof p.prijs !== 'number') continue;

            const norm = normalize(p.product_naam);
            let masterId: number | null = null;

            /* Exact match eerst */
            const exact = mastersByNorm.get(norm);
            if (exact) {
                masterId = exact.id;
            } else {
                /* Fuzzy match: scan alle existing masters op >0.85 similarity */
                let bestScore = 0.85;
                let bestMatch: any = null;
                for (const [, m] of mastersByNorm) {
                    const score = similarity(p.product_naam, m.naam);
                    if (score > bestScore) { bestScore = score; bestMatch = m; }
                }
                if (bestMatch) {
                    masterId = bestMatch.id;
                } else {
                    /* Nieuw master_product */
                    const { data: newMaster, error: insErr } = await supabase
                        .from('master_products')
                        .insert({
                            organization_id: orgId,
                            naam: p.product_naam.trim(),
                            categorie: p.categorie || null,
                            standaard_eenheid: p.eenheid || 'stuks',
                            standaard_leverancier: leverancier,
                            uit_assortiment: false,
                        })
                        .select('id, naam, naam_normalized')
                        .single();
                    if (insErr || !newMaster) continue;
                    masterId = newMaster.id;
                    mastersByNorm.set(newMaster.naam_normalized, newMaster);
                    stats.nieuw++;
                }
            }

            if (!masterId) continue;
            touchedMasterIds.add(masterId);

            /* Nieuw supplier_prices entry toevoegen + oude active entries deactiveren */
            /* Eerst check of er al een actieve entry is met EXACT dezelfde prijs (dedup) */
            const { data: existing } = await supabase
                .from('supplier_prices')
                .select('id, prijs')
                .eq('organization_id', orgId)
                .eq('leverancier', leverancier)
                .eq('master_product_id', masterId)
                .eq('actief', true)
                .limit(1);

            if (existing && existing.length > 0 && Number(existing[0].prijs) === Number(p.prijs)) {
                /* Zelfde prijs als vorige actieve → geen update nodig */
                stats.duplicaten++;
                continue;
            }

            /* Deactiveer oude actieve entries voor deze master+leverancier combi */
            if (existing && existing.length > 0) {
                deactivatePriceIds.push(existing[0].id);
                stats.geupdate++;
            } else {
                stats.geupdate++;
            }

            /* Bereken prijs_per_kg / prijs_per_stuk (simpele heuristic) */
            const eenh = (p.eenheid || '').toLowerCase();
            let prijsPerKg: number | null = null;
            let prijsPerStuk: number | null = null;
            if (eenh.includes('kg') || eenh === 'kilo') prijsPerKg = p.prijs;
            else if (eenh === 'stuks' || eenh === 'stuk' || eenh.includes('pak')) prijsPerStuk = p.prijs;
            /* Voor L/ml: geen kg-prijs */

            newSupplierPrices.push({
                organization_id: orgId,
                master_product_id: masterId,
                leverancier,
                product_naam: p.product_naam.trim(),
                prijs: Number(p.prijs),
                eenheid: p.eenheid || 'stuks',
                categorie: p.categorie || null,
                datum,
                actief: true,
                prijs_per_kg: prijsPerKg,
                prijs_per_stuk: prijsPerStuk,
            });
        }

        /* Bulk deactivate oude entries */
        if (deactivatePriceIds.length > 0) {
            await supabase.from('supplier_prices').update({ actief: false }).in('id', deactivatePriceIds);
        }

        /* Bulk insert nieuwe entries */
        if (newSupplierPrices.length > 0) {
            await supabase.from('supplier_prices').insert(newSupplierPrices);
        }

        /* Uit-assortiment detectie: welke master_ids HAD deze leverancier actief, maar zijn NIET in deze upload? */
        const missingIds: number[] = [];
        for (const oldId of existingMasterIds) {
            if (!touchedMasterIds.has(oldId)) missingIds.push(oldId);
        }

        /* Als categorieFilter gezet: beperk uit-assortiment tot die categorie */
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

        /* Markeer als uit_assortiment + deactiveer hun supplier_prices bij deze leverancier */
        if (uitAssortimentMasterIds.length > 0) {
            await supabase.from('master_products')
                .update({ uit_assortiment: true, uit_assortiment_sinds: datum })
                .in('id', uitAssortimentMasterIds);
            await supabase.from('supplier_prices')
                .update({ actief: false })
                .eq('leverancier', leverancier)
                .in('master_product_id', uitAssortimentMasterIds);
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
