/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Marge-alert DAL
 * ───────────────
 * Pillar #4 — detecteert leverancier-prijsshifts >5% en koppelt aan lopende
 * offertes met dat ingredient. Stopt de "stille margelek" — offertes die nog
 * niet uitgevoerd zijn maar wel marge-impact ondergaan door inkoop-prijs-shift.
 *
 * Engine wordt periodiek aangeroepen (cron of handmatig via API). Math:
 *   marge_delta_eur = (new_price - old_price) × qty_pp × aantal_gasten
 *
 * Dedup via UNIQUE INDEX op (org, inventory, leverancier, day-bucket) bij status='open'.
 * Bestaande open alerts voor zelfde dag-bucket worden geupdate, niet gedupliceerd.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

const PCT_THRESHOLD = 5;          // alleen alerts bij >=5% shift
const LOOKBACK_DAYS = 30;         // vergelijk met prijs van 30 dagen geleden
const RELEVANT_OFFERTE_STATUSES = ['concept', 'verstuurd', 'goedgekeurd', 'open', 'sent', 'pending'];

interface PriceHistoryRow {
  inventory_id: number;
  leverancier_id: number | null;
  unit_price: number;
  datum: string;
  source?: string;
}

interface AffectedOfferte {
  offerte_id: number;
  klant_naam: string;
  marge_delta_eur: number;
  datum: string;
}

function normName(s: string | undefined | null): string {
  return String(s || '').replace(/^\s*\[seed\]\s*/i, '').toLowerCase().trim();
}

/** Parse menu_selectie / menu naar lijst gerecht-namen (zie inventoryDemand). */
function extractDishNames(menuField: unknown): string[] {
  if (!menuField) return [];
  let m: any = menuField;
  if (typeof m === 'string') {
    try { m = JSON.parse(m); } catch { return []; }
  }
  if (Array.isArray(m)) {
    return m.map(function (x) {
      if (typeof x === 'string') return x;
      if (x && typeof x === 'object') return String(x.gerecht_naam || x.naam || '');
      return '';
    }).filter(Boolean);
  }
  if (typeof m === 'object') {
    const out: string[] = [];
    Object.keys(m).forEach(function (gangKey) {
      if (gangKey.endsWith('_vega')) return;
      const items = m[gangKey];
      if (!Array.isArray(items)) return;
      items.forEach(function (it) {
        if (typeof it === 'string') out.push(it);
        else if (it && typeof it === 'object') out.push(String(it.gerecht_naam || it.naam || ''));
      });
    });
    return out.filter(Boolean);
  }
  return [];
}

export interface MargeAlertScanResult {
  scanned_at: string;
  inventory_items_checked: number;
  alerts_created: number;
  alerts_updated: number;
  details: Array<{
    inventory_id: number;
    inventory_naam: string;
    old_price: number;
    new_price: number;
    pct_change: number;
    leverancier_id: number | null;
    affected_offertes_count: number;
    total_impact_eur: number;
    action: 'created' | 'updated' | 'skipped_below_threshold';
  }>;
}

export async function scanMargeAlerts(
  supabase: SupabaseClient,
  orgId: string
): Promise<MargeAlertScanResult> {
  const now = new Date();
  const lookback = new Date(now.getTime() - LOOKBACK_DAYS * 86400000);
  const result: MargeAlertScanResult = {
    scanned_at: now.toISOString(),
    inventory_items_checked: 0,
    alerts_created: 0,
    alerts_updated: 0,
    details: [],
  };

  // 1. Inventory met laatste prijs
  const { data: inventory } = await supabase
    .from('inventory')
    .select('id, naam, unit, last_price_eur, last_price_at, last_price_leverancier_id, purchase_price')
    .eq('organization_id', orgId);
  if (!inventory || inventory.length === 0) return result;
  result.inventory_items_checked = inventory.length;

  // 2. Prijshistorie laatste 60d (lookback + buffer)
  const { data: history } = await supabase
    .from('price_history')
    .select('inventory_id, leverancier_id, unit_price, datum, source')
    .eq('organization_id', orgId)
    .gte('datum', new Date(now.getTime() - (LOOKBACK_DAYS + 30) * 86400000).toISOString())
    .order('datum', { ascending: false });
  const histByInv = new Map<number, PriceHistoryRow[]>();
  (history || []).forEach(function (h: any) {
    const list = histByInv.get(h.inventory_id) || [];
    list.push(h);
    histByInv.set(h.inventory_id, list);
  });

  // 3. Open offertes en gerechten (voor impact-berekening)
  const { data: offertes } = await supabase
    .from('offertes')
    .select('id, nummer, client_naam, status, datum, menu_selectie, aantal_gasten')
    .eq('organization_id', orgId)
    .in('status', RELEVANT_OFFERTE_STATUSES);
  const { data: gerechten } = await supabase
    .from('gerechten')
    .select('id, naam, ingredient_costs')
    .eq('organization_id', orgId);

  const gerechtByNorm = new Map<string, any>();
  (gerechten || []).forEach(function (g: any) { gerechtByNorm.set(normName(g.naam), g); });

  // 4. Per inventory-item: detecteer shift
  for (const inv of inventory) {
    const newPrice = Number(inv.last_price_eur) || 0;
    if (newPrice <= 0) continue;
    const histRows = histByInv.get(inv.id) || [];
    // Eerste rij ouder dan lookback-periode
    const oldRow = histRows.find(function (h) {
      const d = new Date(h.datum);
      return !isNaN(d.getTime()) && d <= lookback;
    });
    if (!oldRow) continue;
    const oldPrice = Number(oldRow.unit_price) || 0;
    if (oldPrice <= 0) continue;

    const pctChange = ((newPrice - oldPrice) / oldPrice) * 100;
    if (Math.abs(pctChange) < PCT_THRESHOLD) continue;

    // 5. Vind offertes die dit ingredient gebruiken
    const invNameNorm = normName(inv.naam);
    const affected: AffectedOfferte[] = [];
    (offertes || []).forEach(function (off: any) {
      const dishNames = extractDishNames(off.menu_selectie);
      let qtyPerPax = 0;
      dishNames.forEach(function (dn: string) {
        const g = gerechtByNorm.get(normName(dn));
        if (!g) return;
        const costs = Array.isArray(g.ingredient_costs) ? g.ingredient_costs : [];
        costs.forEach(function (ic: any) {
          if (!ic || normName(ic.naam) !== invNameNorm) return;
          let factor = 1;
          if (ic.unit === 'g' && inv.unit === 'kg') factor = 0.001;
          if (ic.unit === 'ml' && inv.unit === 'L') factor = 0.001;
          qtyPerPax += (Number(ic.qty_pp) || 0) * factor;
        });
      });
      if (qtyPerPax <= 0) return;
      const guests = Number(off.aantal_gasten) || 0;
      if (guests <= 0) return;
      const margeDelta = (newPrice - oldPrice) * qtyPerPax * guests;
      affected.push({
        offerte_id: off.id,
        klant_naam: off.client_naam || off.nummer || `Offerte #${off.id}`,
        marge_delta_eur: Math.round(margeDelta * 100) / 100,
        datum: off.datum || '',
      });
    });

    const totalImpact = affected.reduce(function (s, a) { return s + a.marge_delta_eur; }, 0);

    // 6. Upsert in marge_alerts (dedup via UNIQUE INDEX op day-bucket)
    const detail = {
      inventory_id: inv.id,
      inventory_naam: inv.naam,
      old_price: Math.round(oldPrice * 10000) / 10000,
      new_price: Math.round(newPrice * 10000) / 10000,
      pct_change: Math.round(pctChange * 100) / 100,
      leverancier_id: inv.last_price_leverancier_id ?? null,
      affected_offertes_count: affected.length,
      total_impact_eur: Math.round(totalImpact * 100) / 100,
      action: 'skipped_below_threshold' as 'created' | 'updated' | 'skipped_below_threshold',
    };

    // Probeer eerst update bestaand-open alert van vandaag (zelfde inv+lev+dag-bucket)
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();
    const { data: existing } = await supabase
      .from('marge_alerts')
      .select('id')
      .eq('organization_id', orgId)
      .eq('inventory_id', inv.id)
      .eq('status', 'open')
      .gte('detected_at', todayStart)
      .lt('detected_at', todayEnd)
      .limit(1);

    if (existing && existing.length > 0) {
      await supabase.from('marge_alerts').update({
        old_price: detail.old_price,
        new_price: detail.new_price,
        pct_change: detail.pct_change,
        leverancier_id: detail.leverancier_id,
        affected_offertes: affected,
        total_marge_impact_eur: detail.total_impact_eur,
      }).eq('id', existing[0].id);
      detail.action = 'updated';
      result.alerts_updated += 1;
    } else {
      const { error } = await supabase.from('marge_alerts').insert({
        organization_id: orgId,
        inventory_id: inv.id,
        leverancier_id: detail.leverancier_id,
        old_price: detail.old_price,
        new_price: detail.new_price,
        pct_change: detail.pct_change,
        affected_offertes: affected,
        total_marge_impact_eur: detail.total_impact_eur,
        status: 'open',
      });
      if (!error) {
        detail.action = 'created';
        result.alerts_created += 1;
      }
    }
    result.details.push(detail);
  }

  return result;
}
