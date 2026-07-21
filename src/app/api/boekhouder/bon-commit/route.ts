/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';
import { RGS_BY_CODE } from '@/lib/rgsCategories';
import { applyStockDelta } from '@/lib/dal/stockMutation';

export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * POST /api/boekhouder/bon-commit
 * ───────────────────────────────
 * Commit de bevestigde bon: persist bon-row + stock_movements voor items
 * die de cateraar als "ook voorraad" heeft aangevinkt + price_history.
 *
 * Body (gevalideerd inline):
 * {
 *   image_data_url?: string,         // origineel beeld voor archief
 *   leverancier_id?: number | null,
 *   leverancier_naam_hint?: string,  // fallback als geen id
 *   datum: "YYYY-MM-DD",
 *   totaal_bedrag: number,
 *   btw_laag_bedrag: number,
 *   btw_hoog_bedrag: number,
 *   netto_bedrag: number,
 *   rgs_code?: string,
 *   event_id?: number | null,
 *   items: [{ naam, qty, unit, unit_price, btw_pct,
 *             add_to_inventory: boolean, inventory_id?: number | null,
 *             create_new_inventory?: boolean }]
 * }
 *
 * Hard rules:
 *  - BTW-bedragen uit bron-data (frontend stuurde wat user bevestigde).
 *  - RGS-code uit constants, niet AI-derived.
 *  - Production qty uit user-confirm, niet AI-derived.
 *  - Re-authorize binnen action.
 *  - Insert in stock_movements alleen voor items met add_to_inventory=true
 *    EN inventory_id geset (of create_new_inventory=true).
 */

interface CommitItem {
  naam: string;
  qty: number;
  unit: string;
  unit_price: number;
  btw_pct: number;
  add_to_inventory: boolean;
  inventory_id?: number | null;
  create_new_inventory?: boolean;
  /* Optioneel: categorie + par-niveau voor een NIEUW voorraad-item. Vult de
     gebruiker (of AI) in het review-scherm; anders vallen we terug op een
     trefwoord-gok + de gekochte hoeveelheid als start-par. */
  categorie?: string | null;
  par_level?: number | null;
}

/* Deterministische categorie-gok op productnaam — géén AI-rekenwerk, alleen
   trefwoorden. Zorgt dat een stelling/machine/zak niet als "Overig" binnenkomt.
   De gebruiker kan 'm altijd overschrijven vanuit /voorraad. */
function guessCategory(naam: string): string {
  const n = (naam || '').toLowerCase();
  if (/folie|vacu[uü]m|\bzak|handschoen|servet|\bbeker|krat|disposable|\btape|snijplank|braadpan|machine|stelling|apparaat|thermometer|weegschaal|\bmes\b|gastronorm|\bgn\b/.test(n)) return 'Materieel';
  if (/zalm|\bvis\b|garnaal|forel|tonijn|kabeljauw|makreel/.test(n)) return 'Vis';
  if (/rund|varken|kip|kalf|\blam\b|vlees|worst|\bspek|bavette|picanha|\bribs?\b|pulled|pastrami|burger|hotdog|gehakt|filet|\bdij\b|entrecote|brisket/.test(n)) return 'Vlees';
  if (/melk|\broom\b|\bkaas|\bboter|yoghurt|\beieren?\b/.test(n)) return 'Zuivel';
  if (/\bbrood|\bbun\b|broodje|stok\b/.test(n)) return 'Brood';
  if (/\bsaus|\bmayo|ketchup|mosterd|dressing|marinade|\brub\b|olijfolie|\bolie\b|azijn/.test(n)) return 'Sauzen';
  if (/\bsla\b|tomaat|\bui\b|paprika|groente|knolselderij|aardappel|wortel|komkommer|champignon/.test(n)) return 'Groenten';
  if (/\bpeper|\bzout|kruid|specerij|knoflook|piri|paprikapoeder/.test(n)) return 'Kruiden';
  if (/\bcola|\bfris|\bbier|\bwijn|\bwater\b|\bsap\b|\bdrank/.test(n)) return 'Dranken';
  return 'Overig';
}

interface CommitBody {
  image_data_url?: string;
  leverancier_id?: number | null;
  leverancier_naam_hint?: string;
  datum: string;
  totaal_bedrag: number;
  btw_laag_bedrag?: number;
  btw_hoog_bedrag?: number;
  netto_bedrag?: number;
  rgs_code?: string;
  event_id?: number | null;
  notities?: string;
  items: CommitItem[];
}

function validBody(body: any): { ok: true; data: CommitBody } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Body verplicht' };
  if (typeof body.datum !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.datum)) {
    return { ok: false, error: 'datum YYYY-MM-DD verplicht' };
  }
  const totaal = Number(body.totaal_bedrag);
  if (!(totaal > 0)) return { ok: false, error: 'totaal_bedrag > 0 verplicht' };
  if (body.rgs_code && !RGS_BY_CODE[body.rgs_code]) {
    return { ok: false, error: `Onbekende RGS-code: ${body.rgs_code}` };
  }
  const items = Array.isArray(body.items) ? body.items : [];
  if (items.length > 50) return { ok: false, error: 'Max 50 items per bon' };
  for (const it of items) {
    if (typeof it !== 'object' || !it) return { ok: false, error: 'Items moeten objecten zijn' };
    if (typeof it.naam !== 'string' || it.naam.trim() === '') return { ok: false, error: 'Item-naam verplicht' };
    if (!(Number(it.qty) >= 0)) return { ok: false, error: `Ongeldige qty voor "${it.naam}"` };
    if (it.add_to_inventory && !it.inventory_id && !it.create_new_inventory) {
      return { ok: false, error: `"${it.naam}": add_to_inventory zonder inventory_id of create_new_inventory` };
    }
  }
  return { ok: true, data: body as CommitBody };
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

    const raw = await req.json();
    const v = validBody(raw);
    if (v.ok === false) return NextResponse.json({ error: v.error }, { status: 400 });
    const data = v.data;

    const { data: memberships } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .limit(1);
    const orgId = memberships?.[0]?.organization_id;
    if (!orgId) return NextResponse.json({ error: 'Geen organisatie' }, { status: 403 });

    // Insert bon
    const cat = data.rgs_code ? RGS_BY_CODE[data.rgs_code] : null;

    // P0.1 — bouw searchable text uit alle bekende velden zodat search_vec
    // (Dutch tsvector) direct gevuld is. extracted_text voedt ook pg_trgm
    // similarity voor typo-tolerante zoek ("baktoaal" → "baktotaal").
    const extractedTextParts = [
      data.notities ?? '',
      cat?.label ?? '',
      data.datum ?? '',
      data.datum
        ? new Date(data.datum).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })
        : '',
    ].filter(Boolean);

    const bonPayload: Record<string, unknown> = {
      organization_id: orgId,
      datum: data.datum,
      totaal_bedrag: data.totaal_bedrag,
      btw_laag_bedrag: data.btw_laag_bedrag ?? null,
      btw_hoog_bedrag: data.btw_hoog_bedrag ?? null,
      netto_bedrag: data.netto_bedrag ?? null,
      leverancier_id: data.leverancier_id ?? null,
      event_id: data.event_id ?? null,
      rgs_code: data.rgs_code ?? null,
      rgs_category_label: cat?.label ?? null,
      ai_classify_status: 'manual',
      classified_at: new Date().toISOString(),
      classified_by_user_id: user.id,
      processed_at: new Date().toISOString(),
      status: 'processed',
      source: 'upload',                                // P0.1 — bron-flag
      notities: data.notities ?? null,
      image_url: data.image_data_url ?? null,
      extracted_text: extractedTextParts.join(' ').trim(),  // P0.1
    };
    const { data: bonRow, error: bonErr } = await supabase
      .from('bonnen')
      .insert(bonPayload)
      .select('id')
      .single();
    if (bonErr || !bonRow) {
      console.error('[bon-commit] insert bon', bonErr);
      return NextResponse.json({ error: bonErr?.message || 'Bon insert mislukt' }, { status: 500 });
    }
    const bonId = bonRow.id;

    // Per item: stock_movement + inventory update + price_history
    let stockMovementsCreated = 0;
    let inventoryItemsCreated = 0;
    const itemErrors: Array<{ naam: string; reason: string }> = [];

    for (const item of data.items) {
      if (!item.add_to_inventory) continue;
      const qty = Number(item.qty);
      if (!(qty > 0)) continue;

      let invId: number | null = item.inventory_id ?? null;

      // Optioneel: nieuw inventory-item aanmaken
      if (!invId && item.create_new_inventory) {
        const { data: newInv, error: newInvErr } = await supabase
          .from('inventory')
          .insert({
            organization_id: orgId,
            naam: item.naam,
            current_stock: 0, // wordt direct verhoogd via stock_movement
            unit: item.unit || 'stuks',
            purchase_price: item.unit_price,
            leverancier_id: data.leverancier_id ?? null,
            // Echte categorie: door de gebruiker/AI meegegeven, anders trefwoord-gok
            // (niet meer altijd 'Overig'). Materieel/machines/zakjes vallen nu goed.
            categorie: (typeof item.categorie === 'string' && item.categorie.trim())
              ? item.categorie.trim().slice(0, 100)
              : guessCategory(item.naam),
            // Par-niveau bij een nieuw item: meegegeven waarde, anders de gekochte
            // hoeveelheid als start-baseline (gebruiker past 'm aan op /voorraad).
            par_level: (item.par_level != null && Number(item.par_level) >= 0) ? Number(item.par_level) : qty,
          })
          .select('id')
          .single();
        if (newInvErr || !newInv) {
          itemErrors.push({ naam: item.naam, reason: 'Inventory-aanmaak mislukt: ' + (newInvErr?.message || '?') });
          continue;
        }
        invId = newInv.id;
        inventoryItemsCreated += 1;
      }

      if (!invId) continue;

      // Ontvangst atomair via de gedeelde RPC: current_stock ophogen +
      // stock_movements-insert (met bon-koppeling) in één transactie (fix #1).
      const newStock = await applyStockDelta(supabase, orgId, {
        inventoryId: invId,
        delta: qty,
        type: 'receive',
        unitPrice: item.unit_price,
        bonId,
        note: `Via bon-toevoegen flow (${item.naam})`,
      });
      if (newStock == null) {
        itemErrors.push({ naam: item.naam, reason: 'Voorraad-mutatie mislukt' });
        continue;
      }

      // Price history (sync_inventory_last_price-trigger updatet inventory.last_price_eur)
      if (item.unit_price > 0) {
        await supabase
          .from('price_history')
          .insert({
            organization_id: orgId,
            inventory_id: invId,
            leverancier_id: data.leverancier_id ?? null,
            bon_id: bonId,
            datum: data.datum,
            unit_price: item.unit_price,
            unit: item.unit || 'stuks',
            source: 'bon',
          });
      }

      stockMovementsCreated += 1;
    }

    return NextResponse.json({
      ok: true,
      bon_id: bonId,
      stock_movements_created: stockMovementsCreated,
      inventory_items_created: inventoryItemsCreated,
      item_errors: itemErrors,
    });
  } catch (err: any) {
    console.error('[boekhouder/bon-commit]', err);
    return NextResponse.json({ error: err?.message || 'Onbekende fout' }, { status: 500 });
  }
}
