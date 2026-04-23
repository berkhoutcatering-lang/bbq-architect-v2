/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';

export const runtime = 'nodejs';
export const maxDuration = 300;

/*
 * ═══════════════════════════════════════════════════════════════════════
 *  PRIJSLIJST-SYNC — robuuste versie
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Doel: een geparste prijslijst (N producten) van één leverancier
 * synchroniseren met `master_products` + `supplier_prices`.
 *
 * Garanties (in volgorde van belangrijkheid):
 *  1. Idempotent — 2× dezelfde call mag dezelfde output geven.
 *  2. Geen duplicate-key errors, ook niet als Claude dezelfde productnaam
 *     2× teruggeeft (case-verschil of whitespace).
 *  3. Schaalt naar 1000+ producten/call zonder Vercel-timeout (geen N+1).
 *  4. Historie bewaren (oude prijzen blijven, alleen `actief` wisselt).
 *
 * DB-constraints die we moeten respecteren:
 *  - master_products UNIQUE (organization_id, naam_normalized)
 *    waar naam_normalized = lower(trim(naam))   ← DB-generated
 *  - supplier_prices UNIQUE INDEX op
 *    (org, lower(trim(leverancier)), lower(trim(product_naam)),
 *     lower(trim(eenheid)), prijs)
 */

/** Moet EXACT hetzelfde zijn als DB `naam_normalized` generated column. */
function dbNormalize(s: string): string {
    return (s || '').toLowerCase().trim();
}

/** Strikte key voor fuzzy matching (ook interpunctie weggooien) */
function strictNorm(s: string): string {
    return (s || '').toLowerCase().trim().replace(/[^a-z0-9]/g, '');
}

/**
 * "Base-name" zonder trailing size-suffix en zonder decoratieve tekens.
 * "Bebo Omega Light 250 g" → "bebo omega light"
 * "aro Mozzarella 125 g *" → "aro mozzarella"
 *
 * Uitsluitend gebruikt om een bestaande master te vinden wanneer Claude in
 * het ene bakje de eenheid-info mee-noemt en in het andere niet. Nooit
 * gebruikt om twee producten te MERGEN — alleen om een enkele match te
 * vinden (bij >1 kandidaat → nieuw master, veilig).
 */
function cleanBase(s: string): string {
    return (s || '')
        .toLowerCase()
        .trim()
        .replace(/[\*\u2605\u2606]+\s*$/g, '')
        .replace(/\s+(ca\.?\s+)?\d+([.,]\d+)?\s*(x\s*\d+\s*)?(kg|g|l|ml|stuks?|pak|stks?|krat|fles|doos|bakje|kist|cl|liter)\s*$/i, '')
        .replace(/\s+/g, ' ')
        .trim();
}

/** Jaccard over char-bigrams — in-memory fuzzy similarity */
function similarity(a: string, b: string): number {
    const aN = strictNorm(a), bN = strictNorm(b);
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

function chunk<T>(arr: T[], size: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
}

function priceKey(p: { product_naam: string; eenheid?: string; prijs: number }): string {
    return `${dbNormalize(p.product_naam)}|${dbNormalize(p.eenheid || 'stuks')}|${Number(p.prijs)}`;
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

        /* ─── STAP 1: Filter + dedup input ─── */

        /* Filter onbruikbare rijen weg */
        const cleanInput: ProductInput[] = [];
        for (const p of producten) {
            if (!p || typeof p.product_naam !== 'string') continue;
            const naam = p.product_naam.trim();
            if (naam.length === 0) continue;
            const prijs = Number(p.prijs);
            if (!Number.isFinite(prijs) || prijs <= 0) continue;
            cleanInput.push({
                product_naam: naam,
                prijs,
                eenheid: p.eenheid?.trim() || 'stuks',
                categorie: p.categorie?.trim() || undefined,
            });
        }

        /* Dedup op DB-normalized naam (1 product = 1 master_product) */
        const byNormName = new Map<string, ProductInput>();
        for (const p of cleanInput) {
            const key = dbNormalize(p.product_naam);
            if (!key) continue;
            /* Laatste voorkomen wint — later bakje > eerder bakje */
            byNormName.set(key, p);
        }
        const dedupedInput = Array.from(byNormName.values());

        /* ─── STAP 2: Preload bestaande data in Maps ─── */

        const { data: existingMasters, error: mErr } = await supabase
            .from('master_products')
            .select('id, naam, naam_normalized, categorie')
            .eq('organization_id', orgId);
        if (mErr) return NextResponse.json({ error: 'Master-query: ' + mErr.message }, { status: 500 });

        const masterByNorm = new Map<string, { id: number; naam: string }>();
        /*
         * byCleanBase: clean-base (zonder size-suffix) → list van masters.
         * Gebruikt als fallback wanneer exact-match faalt. We gebruiken
         * alleen als er precies 1 kandidaat is — bij >1 is het te riskant
         * om te raden en maken we liever een nieuwe master.
         */
        const byCleanBase = new Map<string, { id: number; naam: string }[]>();
        const mastersArray = (existingMasters || []) as { id: number; naam: string; naam_normalized: string }[];
        for (const m of mastersArray) {
            masterByNorm.set(m.naam_normalized, { id: m.id, naam: m.naam });
            const base = cleanBase(m.naam);
            if (!base) continue;
            const list = byCleanBase.get(base);
            if (list) list.push({ id: m.id, naam: m.naam });
            else byCleanBase.set(base, [{ id: m.id, naam: m.naam }]);
        }

        /* Alle supplier_prices (actief + inactief) voor deze leverancier — gebruikt voor
           reactivate-or-insert strategie, voorkomt duplicate-key op unique index */
        const { data: existingPrices, error: pErr } = await supabase
            .from('supplier_prices')
            .select('id, master_product_id, product_naam, eenheid, prijs, actief')
            .eq('organization_id', orgId)
            .eq('leverancier', leverancier);
        if (pErr) return NextResponse.json({ error: 'Prices-query: ' + pErr.message }, { status: 500 });

        /* Key: dbNormalize(product_naam)|dbNormalize(eenheid)|prijs → entry */
        const priceByKey = new Map<number, { id: number; actief: boolean; masterId: number | null }>();
        const priceByKeyStr = new Map<string, { id: number; actief: boolean; masterId: number | null }>();
        /* Ook: welke master_ids hebben op dit moment een actieve prijs bij deze leverancier */
        const previouslyActiveMasterIds = new Set<number>();
        for (const ep of (existingPrices || [])) {
            const k = priceKey({ product_naam: ep.product_naam, eenheid: ep.eenheid, prijs: Number(ep.prijs) });
            priceByKeyStr.set(k, { id: ep.id, actief: !!ep.actief, masterId: ep.master_product_id });
            priceByKey.set(ep.id, { id: ep.id, actief: !!ep.actief, masterId: ep.master_product_id });
            if (ep.actief && ep.master_product_id) previouslyActiveMasterIds.add(ep.master_product_id);
        }

        /* ─── STAP 3: Match input tegen masters (in-memory) ─── */

        const stats = { nieuw: 0, geupdate: 0, uit_assortiment: 0, duplicaten: 0 };

        type Matched = { input: ProductInput; masterId: number };
        type Unmatched = { input: ProductInput };
        const matched: Matched[] = [];
        const unmatched: Unmatched[] = [];

        for (const p of dedupedInput) {
            const norm = dbNormalize(p.product_naam);

            /* 1. Exact-match (case-insensitive trimmed) */
            const exact = masterByNorm.get(norm);
            if (exact) {
                matched.push({ input: p, masterId: exact.id });
                continue;
            }

            /* 2. Clean-base match — zelfde product zonder size-suffix.
               Alleen gebruikt als er PRECIES 1 kandidaat is (anders te risky). */
            const base = cleanBase(p.product_naam);
            if (base) {
                const candidates = byCleanBase.get(base);
                if (candidates && candidates.length === 1) {
                    matched.push({ input: p, masterId: candidates[0].id });
                    continue;
                }
            }

            /* 3. Fuzzy fallback (>0.88) voor kleine typo's */
            let bestScore = 0.88;
            let bestMatch: { id: number; naam: string } | null = null;
            for (const m of mastersArray) {
                const score = similarity(p.product_naam, m.naam);
                if (score > bestScore) { bestScore = score; bestMatch = { id: m.id, naam: m.naam }; }
            }
            if (bestMatch) {
                matched.push({ input: p, masterId: bestMatch.id });
            } else {
                unmatched.push({ input: p });
            }
        }

        /* ─── STAP 4: Upsert nieuwe masters (race-safe) ─── */

        /*
         * Dedup unmatched op cleanBase: als 2 unmatched rijen dezelfde base-naam
         * hebben, één met size-suffix en één zonder, zijn het vrijwel zeker
         * hetzelfde product (Claude rapporteerde inconsistent tussen bakjes).
         * In dat geval: hou de variant met size-suffix aan (meest informatief).
         * Als ALLE varianten size hebben → verschillende maten → allemaal
         * behouden.
         */
        const hasSize = (s: string) =>
            /\d+([.,]\d+)?\s*(kg|g|l|ml|stuks?|pak|stks?|krat|fles|doos|bakje|kist|cl|liter)\s*$/i.test(s.trim());

        const unmatchedByBase = new Map<string, Unmatched[]>();
        for (const u of unmatched) {
            const base = cleanBase(u.input.product_naam);
            if (!base) continue;
            const list = unmatchedByBase.get(base);
            if (list) list.push(u);
            else unmatchedByBase.set(base, [u]);
        }
        const dedupedUnmatched: Unmatched[] = [];
        for (const [, list] of unmatchedByBase) {
            if (list.length === 1) { dedupedUnmatched.push(list[0]); continue; }
            const withSize = list.filter(u => hasSize(u.input.product_naam));
            const noSize = list.filter(u => !hasSize(u.input.product_naam));
            if (withSize.length > 0 && noSize.length > 0) {
                /* No-size zijn waarschijnlijk dupes van de size-variants → drop */
                dedupedUnmatched.push(...withSize);
            } else {
                dedupedUnmatched.push(...list);
            }
        }
        /* Vervang unmatched door de gededupeerde lijst — stats.nieuw wordt
           later geteld na upsert zodat duplicate-key-via-race ook goed gaat */
        unmatched.length = 0;
        unmatched.push(...dedupedUnmatched);

        if (unmatched.length > 0) {
            const rows = unmatched.map(u => ({
                organization_id: orgId,
                naam: u.input.product_naam,
                categorie: u.input.categorie || null,
                standaard_eenheid: u.input.eenheid || 'stuks',
                standaard_leverancier: leverancier,
                uit_assortiment: false,
            }));

            for (const batch of chunk(rows, 500)) {
                /*
                 * upsert met onConflict op de unique constraint — als een andere
                 * parallel-request al een master met deze normalized naam heeft
                 * ingevoegd, krijgen we die rij terug zonder crash.
                 */
                const { data: upserted, error: upErr } = await supabase
                    .from('master_products')
                    .upsert(batch, {
                        onConflict: 'organization_id,naam_normalized',
                        ignoreDuplicates: false,
                    })
                    .select('id, naam, naam_normalized');
                if (upErr) {
                    return NextResponse.json({ error: 'Master-upsert: ' + upErr.message }, { status: 500 });
                }
                for (const m of (upserted || [])) {
                    masterByNorm.set(m.naam_normalized, { id: m.id, naam: m.naam });
                }
            }

            /* Link unmatched → masterId via refreshed map, en telling bijwerken */
            for (const u of unmatched) {
                const norm = dbNormalize(u.input.product_naam);
                const m = masterByNorm.get(norm);
                if (m) {
                    matched.push({ input: u.input, masterId: m.id });
                    stats.nieuw++;
                }
            }
        }

        /* ─── STAP 5: Supplier_prices via reactivate-or-insert ─── */

        /* Per master-id: welke prijs komt nu binnen (voor uit-assortiment detectie) */
        const touchedMasterIds = new Set<number>();
        /* IDs die we willen (re)activeren — zowel nieuwe inserts als reactivates */
        const reactivateIds: number[] = [];
        /* IDs die we willen deactiveren (oude active rows voor zelfde master) */
        const deactivateIds: number[] = [];
        /* Nieuwe rijen die nog niet in DB staan */
        const newRows: any[] = [];

        /* Per master kunnen er meerdere keys matchen (verschillende eenheid),
           dus we groeperen niet per master maar gaan per input-row */
        for (const { input, masterId } of matched) {
            touchedMasterIds.add(masterId);
            const k = priceKey({ product_naam: input.product_naam, eenheid: input.eenheid, prijs: input.prijs });
            const existing = priceByKeyStr.get(k);

            if (existing) {
                /* Exacte combinatie bestaat al in DB */
                if (existing.actief) {
                    stats.duplicaten++;
                } else {
                    reactivateIds.push(existing.id);
                    stats.geupdate++;
                }
            } else {
                /* Nieuwe rij — insert */
                const eenh = (input.eenheid || '').toLowerCase();
                const prijsPerKg = (eenh.includes('kg') || eenh === 'kilo') ? input.prijs : null;
                const prijsPerStuk = (eenh === 'stuks' || eenh === 'stuk' || eenh.includes('pak')) ? input.prijs : null;
                newRows.push({
                    organization_id: orgId,
                    master_product_id: masterId,
                    leverancier,
                    product_naam: input.product_naam,
                    prijs: Number(input.prijs),
                    eenheid: input.eenheid || 'stuks',
                    categorie: input.categorie || null,
                    datum,
                    actief: true,
                    prijs_per_kg: prijsPerKg,
                    prijs_per_stuk: prijsPerStuk,
                });
                stats.geupdate++;
            }
        }

        /*
         * Voor elke master die we hebben aangeraakt: deactiveer ALLE andere actieve
         * rijen van deze leverancier die niet in onze "keep-active" set zitten.
         * Die set = de reactivate-IDs + de IDs die we net gaan inserten (deduced via key-match).
         */
        const keepActiveIdSet = new Set<number>(reactivateIds);
        for (const ep of (existingPrices || [])) {
            if (!ep.actief) continue;
            if (!ep.master_product_id) continue;
            if (!touchedMasterIds.has(ep.master_product_id)) continue;
            /* Master komt terug — check of deze specifieke rij "keep-active" is */
            if (keepActiveIdSet.has(ep.id)) continue;
            /* Check of deze rij exact dezelfde key heeft als een nieuwe insert (dan mag hij blijven) */
            const k = priceKey({ product_naam: ep.product_naam, eenheid: ep.eenheid, prijs: Number(ep.prijs) });
            const stillInInput = newRows.some(n => priceKey(n) === k);
            if (stillInInput) continue;
            /* Anders: deactiveer */
            deactivateIds.push(ep.id);
        }

        /* ─── STAP 6: DB-writes in chunks ─── */

        /* 6a. Deactiveer oude rijen */
        for (const idChunk of chunk(deactivateIds, 500)) {
            if (idChunk.length === 0) continue;
            const { error } = await supabase.from('supplier_prices').update({ actief: false }).in('id', idChunk);
            if (error) return NextResponse.json({ error: 'Deactivate: ' + error.message }, { status: 500 });
        }

        /* 6b. Reactiveer bestaande rijen */
        for (const idChunk of chunk(reactivateIds, 500)) {
            if (idChunk.length === 0) continue;
            const { error } = await supabase.from('supplier_prices')
                .update({ actief: true, datum })
                .in('id', idChunk);
            if (error) return NextResponse.json({ error: 'Reactivate: ' + error.message }, { status: 500 });
        }

        /* 6c. Bulk-insert nieuwe rijen (zonder upsert — we hebben al gecheckt op bestaan) */
        for (const rowChunk of chunk(newRows, 500)) {
            if (rowChunk.length === 0) continue;
            const { error } = await supabase.from('supplier_prices').insert(rowChunk);
            if (error) {
                /* Fallback: als toch duplicate (race condition), probeer upsert met ignoreDuplicates */
                if (error.code === '23505') {
                    const { error: upErr } = await supabase.from('supplier_prices')
                        .upsert(rowChunk, { ignoreDuplicates: true });
                    if (upErr) return NextResponse.json({ error: 'Prices-upsert: ' + upErr.message }, { status: 500 });
                } else {
                    return NextResponse.json({ error: 'Prices-insert: ' + error.message }, { status: 500 });
                }
            }
        }

        /* ─── STAP 7: Uit-assortiment detectie ─── */

        const missingIds: number[] = [];
        for (const oldId of previouslyActiveMasterIds) {
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
            debug: {
                input_received: producten.length,
                input_deduped: dedupedInput.length,
                matched: matched.length,
                new_masters: unmatched.length,
            },
        });
    } catch (e: any) {
        console.error('[pricelist-sync]', e);
        return NextResponse.json({ error: e?.message || 'Onbekende fout' }, { status: 500 });
    }
}
