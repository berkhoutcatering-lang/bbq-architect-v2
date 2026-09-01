/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';
import { matchInventory } from '@/lib/inventoryDeduction';
import { matchLeverancier, summarizeBon } from '@/lib/bonProcessing';
import type { BonItemRow } from '@/types';

export const runtime = 'nodejs';
export const maxDuration = 30;

/*
 * Bon-processing API — sluit de hele loop in 1 call.
 * ──────────────────────────────────────────────────────
 * Input:
 *   - bon_id: bestaande rij in bonnen-tabel waarvan raw_analysis al gevuld is
 *      (na AI-scan in inkoop/page.tsx + saveToArchive)
 *   OF
 *   - winkel + datum + items[] direct (voor handmatige invoer)
 *
 * Doet in één transactie-achtige sequentie:
 *   1. Leverancier upsert (fuzzy match op winkel-string)
 *   2. Per item:
 *      a. matchInventory of insert nieuw item met leverancier_id
 *      b. UPDATE inventory.current_stock += aantal (de PRIJS blijft staan — zie
 *         de toelichting bij die update; een factuurprijs overschrijft nooit een
 *         catalogusprijs). Alleen een gloednieuw voorraaditem krijgt de
 *         factuurprijs als startwaarde, want daar valt niets te overschrijven.
 *      c. INSERT stock_movement type='receive' met unit_price + bon_id
 *      d. INSERT price_history (inventory_id, leverancier_id, datum, unit_price)
 *   3. UPDATE bonnen: leverancier_id, bon_items, btw_breakdown, processed_at
 *
 * Resultaat: het hele systeem (voorraad, prijzen, leveranciers, boekhouding)
 * is up-to-date met 1 bon-foto.
 *
 * Best-effort: per-item fouten worden gelogd maar stoppen niet de hele
 * batch. Eindresultaat geeft details per item.
 */

interface ProcessRequest {
    bon_id?: number;
    /* Direct input (zonder bon-rij): */
    winkel?: string;
    datum?: string;
    totaal_bedrag?: number;
    items?: any[];
    raw_analysis?: any;
}

interface ItemResult {
    naam: string;
    action: 'created' | 'updated' | 'skipped';
    inventory_id?: number;
    movement_id?: number;
    qty: number;
    unit_price: number;
    error?: string;
}

interface ProcessResult {
    success: boolean;
    leverancier?: { id: number; naam: string; created: boolean };
    bon_id?: number;
    items_results: ItemResult[];
    btw: { laag: number; hoog: number; netto: number };
    error?: string;
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

        const body = await req.json() as ProcessRequest;

        /* Stap 0: input normaliseren — bon_id óf direct fields */
        let bonRow: any = null;
        let summary;
        if (body.bon_id) {
            const { data, error } = await supabase
                .from('bonnen')
                .select('*')
                .eq('id', body.bon_id)
                .single();
            if (error || !data) return NextResponse.json({ error: 'Bon niet gevonden' }, { status: 404 });
            if (data.processed_at) {
                return NextResponse.json({
                    error: 'Bon is al verwerkt op ' + data.processed_at,
                    success: false,
                }, { status: 409 });
            }
            bonRow = data;
            summary = summarizeBon(data.raw_analysis);
            /* Override met DB-velden indien aanwezig (winkel/datum/totaal kunnen
               beter zijn dan AI-summary als user 'm handmatig heeft gecorrigeerd). */
            summary.winkel = data.winkel || summary.winkel;
            summary.datum = data.datum || summary.datum;
            summary.totaal_bedrag = data.totaal_bedrag || summary.totaal_bedrag;
        } else {
            const items: BonItemRow[] = (body.items || []).map((i: any) => ({
                naam: String(i.naam || i.name || ''),
                aantal: Number(i.aantal || i.qty || 1),
                unit: String(i.unit || i.eenheid || 'stuks').toLowerCase(),
                prijs: Number(i.prijs || i.price || 0),
                btw_pct: Number(i.btw_pct ?? i.btw ?? 0),
                totaal: Number(i.totaal || (Number(i.aantal || 1) * Number(i.prijs || 0))),
            })).filter(i => i.naam);
            summary = {
                winkel: body.winkel || '',
                datum: body.datum || new Date().toISOString().slice(0, 10),
                totaal_bedrag: body.totaal_bedrag || 0,
                items,
                btw: { btw_laag_bedrag: 0, btw_hoog_bedrag: 0, netto_bedrag: 0, bruto_bedrag: 0 },
            };
            /* Re-bereken BTW met genormaliseerde items. */
            const { parseBonBtw } = await import('@/lib/bonProcessing');
            summary.btw = parseBonBtw(items);
        }

        if (summary.items.length === 0) {
            return NextResponse.json({
                error: 'Geen items om te verwerken',
                success: false,
            }, { status: 400 });
        }

        /* Stap 1: Leverancier upsert (fuzzy match op winkel) */
        const { data: existingLevs } = await supabase
            .from('leveranciers')
            .select('id, naam, type');
        let leverancier: { id: number; naam: string; created: boolean } | null = null;
        if (summary.winkel) {
            const matched = matchLeverancier(summary.winkel, existingLevs || []);
            if (matched) {
                leverancier = { id: matched.id, naam: matched.naam, created: false };
            } else {
                /* Nieuw aanmaken — type proberen te raden uit winkel-naam. */
                const lower = summary.winkel.toLowerCase();
                let type = 'Overig';
                if (/sligro|hanos|makro/.test(lower)) type = 'Groothandel';
                else if (/crisp|albert heijn|jumbo|plus/.test(lower)) type = 'Supermarkt';
                else if (/bakker|brood/.test(lower)) type = 'Bakker';
                else if (/slager|vlees/.test(lower)) type = 'Slager';

                const { data: newLev, error: levErr } = await supabase
                    .from('leveranciers')
                    .insert({ naam: summary.winkel, type, organization_id: orgId })
                    .select('id, naam')
                    .single();
                if (levErr) {
                    console.warn('[bon-process] Leverancier insert failed:', levErr.message);
                } else if (newLev) {
                    leverancier = { id: newLev.id, naam: newLev.naam, created: true };
                }
            }
        }

        /* Stap 2: Per item — upsert inventory + stock_movement + price_history.
           Cast naar bredere type omdat matchInventory's InventoryRow alleen
           id+naam+current_stock+unit kent — wij willen ook purchase_price +
           leverancier_id voor de upsert-beslissingen. */
        const { data: existingInv } = await supabase
            .from('inventory')
            .select('id, naam, current_stock, unit, purchase_price, leverancier_id');
        const invRows = (existingInv || []) as Array<{
            id: number; naam: string; current_stock: number | null; unit: string | null;
            purchase_price: number | null; leverancier_id: number | null;
        }>;

        const itemsResults: ItemResult[] = [];

        for (const item of summary.items) {
            try {
                const matchedBase = matchInventory(item.naam, invRows);
                /* Hydrateer met de extra kolommen die we vooraf hebben opgehaald. */
                const matched = matchedBase ? invRows.find(r => r.id === matchedBase.id) : null;
                let inventoryId: number;
                let action: 'created' | 'updated';
                /* unit_price = prijs uit bon (per unit, exclusief totaal-multiplier). */
                const unit_price = item.prijs > 0 ? item.prijs : (item.totaal && item.aantal ? item.totaal / item.aantal : 0);
                const newStock = (matched?.current_stock || 0) + item.aantal;

                if (matched) {
                    inventoryId = matched.id;
                    action = 'updated';
                    /* Voorraad bij, prijs niet.
                       
                       Deze regel schreef de factuurprijs over `purchase_price`
                       heen. Dat leek logisch — je hebt het immers net betaald —
                       maar het is precies wat je niet wilt. De prijs in dit
                       systeem is de groothandelsprijs uit de catalogus. Wat er
                       op één factuur stond verschilt per levering: dezelfde
                       kipdij kwam op de ene bon exact op de lijstprijs uit en op
                       de andere dertien procent erboven. Een inkoopprijs die met
                       elke bon meebeweegt is geen prijs meer maar ruis, en hij
                       lekt door naar de marge op je offertes.
                       
                       Mathijs, 2026-09-01: "puur groothandelprijzen, niet van de
                       bonnen."
                       
                       Wat er wél gebeurt met de factuurprijs staat hieronder: hij
                       gaat als momentopname naar `price_history` en als
                       `unit_price` op de voorraadmutatie. Daar is hij een
                       vastlegging van wat je betaalde, en overschrijft hij niets. */
                    const updates: any = {
                        current_stock: newStock,
                        last_count_at: new Date().toISOString(),
                    };
                    if (leverancier && !matched.leverancier_id) updates.leverancier_id = leverancier.id;
                    await supabase.from('inventory').update(updates).eq('id', inventoryId);
                } else {
                    /* Nieuw item — minimum-velden. categorie/min_stock/par_level
                       laten we leeg zodat user die later kan finetunen via voorraad-page. */
                    const { data: newInv, error: invErr } = await supabase
                        .from('inventory')
                        .insert({
                            naam: item.naam,
                            categorie: 'Overig',
                            current_stock: item.aantal,
                            min_stock: 0,
                            par_level: 0,
                            unit: item.unit || 'stuks',
                            /* Nieuw item: er is nog geen catalogusprijs om te
                               bewaren, dus de factuurprijs is beter dan niets.
                               Overschrijven doet hij niemand. */
                            purchase_price: unit_price,
                            supplier: leverancier?.naam || summary.winkel || '',
                            leverancier_id: leverancier?.id || null,
                            organization_id: orgId,
                        })
                        .select('id')
                        .single();
                    if (invErr || !newInv) throw new Error('Inventory insert failed: ' + invErr?.message);
                    inventoryId = Number(newInv.id);
                    action = 'created';
                }

                /* stock_movement type=receive met unit_price snapshot.
                   NB (fix #1 follow-up): dit inkoop-pad (geen live UI-caller) draait
                   nog niet via de atomaire RPC — bon wordt hier pas ná verwerking
                   aangemaakt, dus bonId is nog niet bekend bij de mutatie. */
                const { data: mov } = await supabase
                    .from('stock_movements')
                    .insert({
                        organization_id: orgId,
                        inventory_id: inventoryId,
                        type: 'receive',
                        qty: item.aantal,
                        unit_price,
                        resulting_stock: newStock,
                        bon_id: bonRow?.id || null,
                        note: `Bon: ${summary.winkel} ${summary.datum}`,
                        by_user: user.email || '',
                        by_user_id: user.id,
                    })
                    .select('id')
                    .single();

                /* price_history snapshot — alleen als prijs > 0 */
                if (unit_price > 0) {
                    await supabase.from('price_history').insert({
                        inventory_id: inventoryId,
                        leverancier_id: leverancier?.id || null,
                        bon_id: bonRow?.id || null,
                        datum: summary.datum,
                        unit_price,
                        unit: item.unit || 'stuks',
                        source: 'bon',
                        organization_id: orgId,
                    });
                }

                itemsResults.push({
                    naam: item.naam,
                    action,
                    inventory_id: inventoryId,
                    movement_id: mov?.id,
                    qty: item.aantal,
                    unit_price,
                });
            } catch (e: any) {
                console.warn('[bon-process] Item failed:', item.naam, e?.message);
                itemsResults.push({
                    naam: item.naam,
                    action: 'skipped',
                    qty: item.aantal,
                    unit_price: item.prijs,
                    error: e?.message,
                });
            }
        }

        /* Stap 3: bon-rij updaten met BTW-breakdown + processed_at */
        let savedBonId: number | undefined = bonRow?.id;

        /* P0.1 — bouw searchable extracted_text uit items + winkel + datum.
           Voedt search_vec (Dutch tsvector) + pg_trgm (fuzzy) zodat zoeken
           op item-naam ("baktotaal", "spareribs") direct werkt. */
        const itemsText = summary.items
            .map((i: any) => [i.naam, i.eenheid, i.prijs].filter(Boolean).join(' '))
            .join(' ');
        const datumNl = summary.datum
            ? new Date(summary.datum).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })
            : '';
        const extractedText = [itemsText, summary.winkel ?? '', summary.datum ?? '', datumNl]
            .filter(Boolean)
            .join(' ')
            .trim();

        if (bonRow?.id) {
            await supabase.from('bonnen').update({
                leverancier_id: leverancier?.id || null,
                bon_items: summary.items,
                btw_laag_bedrag: summary.btw.btw_laag_bedrag,
                btw_hoog_bedrag: summary.btw.btw_hoog_bedrag,
                netto_bedrag: summary.btw.netto_bedrag,
                processed_at: new Date().toISOString(),
                extracted_text: extractedText,           // P0.1
            }).eq('id', bonRow.id);
        } else if (summary.winkel) {
            /* Geen bestaande bon — maak er nu één aan zodat de FKs op
               stock_movements/price_history alsnog te koppelen zijn. */
            const { data: newBon } = await supabase
                .from('bonnen')
                .insert({
                    winkel: summary.winkel,
                    datum: summary.datum,
                    totaal_bedrag: summary.totaal_bedrag,
                    leverancier_id: leverancier?.id || null,
                    bon_items: summary.items,
                    btw_laag_bedrag: summary.btw.btw_laag_bedrag,
                    btw_hoog_bedrag: summary.btw.btw_hoog_bedrag,
                    netto_bedrag: summary.btw.netto_bedrag,
                    processed_at: new Date().toISOString(),
                    raw_analysis: body.raw_analysis || [],
                    organization_id: orgId,
                    source: 'upload',                    // P0.1
                    extracted_text: extractedText,       // P0.1
                })
                .select('id')
                .single();
            savedBonId = newBon?.id;

            /* Backfill bon_id op de zojuist aangemaakte movements. */
            if (savedBonId) {
                const movIds = itemsResults.map(r => r.movement_id).filter((id): id is number => !!id);
                if (movIds.length > 0) {
                    await supabase.from('stock_movements').update({ bon_id: savedBonId }).in('id', movIds);
                    await supabase.from('price_history').update({ bon_id: savedBonId })
                        .in('inventory_id', itemsResults.map(r => r.inventory_id).filter((id): id is number => !!id))
                        .eq('datum', summary.datum)
                        .eq('source', 'bon');
                }
            }
        }

        const result: ProcessResult = {
            success: true,
            leverancier: leverancier || undefined,
            bon_id: savedBonId,
            items_results: itemsResults,
            btw: {
                laag: summary.btw.btw_laag_bedrag,
                hoog: summary.btw.btw_hoog_bedrag,
                netto: summary.btw.netto_bedrag,
            },
        };

        return NextResponse.json(result);
    } catch (e: any) {
        console.error('[bon-process]', e);
        return NextResponse.json({
            success: false,
            error: e?.message || 'Onbekende fout',
            items_results: [],
            btw: { laag: 0, hoog: 0, netto: 0 },
        } satisfies ProcessResult, { status: 500 });
    }
}
