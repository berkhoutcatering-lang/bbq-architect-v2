/* packRounding — order-qty = ceil(demand / pak) × pak, deterministisch.
 *
 * Hard rule: dit is code-rekenwerk, nooit AI-rekenwerk. De pakmaat komt uit het
 * gekoppelde supplier_product (Sam-beslissing: vaste leverancier per product).
 * Geen pakmaat bekend → 1-op-1 doorgeven, expliciet gemarkeerd (nooit stil).
 *
 * Sam-voorbeeld: 80 nodig, 40 op voorraad → tekort 40; pak = 100 → besteld 100.
 */

export interface PackSpec {
  package_size: number | null; // supplier_products.package_size
  package_unit: string | null; // supplier_products.package_unit ('g','kg','ml','liter','stuk',...)
  moq_packs?: number | null; // minimale afname in hele pakken (default 1)
}

export type RoundingReason = 'ok' | 'no_pack' | 'incompatible_unit' | 'zero_demand';

export interface PackResult {
  qty_needed: number; // kale demand (in inventory-basis-eenheid)
  qty_ordered: number; // afgerond naar hele pakken (in inventory-basis-eenheid)
  packs: number | null; // aantal hele pakken (null als geen pakmaat)
  pack_size: number | null;
  pack_unit: string | null;
  rounded: boolean; // true = er is naar boven afgerond
  reason: RoundingReason;
}

/** g↔kg / ml↔liter / stuk-familie conversie tussen pak-eenheid en inventory-eenheid.
 *  null = onverenigbaar (bv. pak in 'stuk' maar inventory in 'kg') → niet veilig af te ronden. */
export function packConvFactor(from: string, to: string): number | null {
  const f = (from || '').toLowerCase().trim();
  const t = (to || '').toLowerCase().trim();
  if (!f || !t) return null;
  if (f === t) return 1;
  if (f === 'g' && t === 'kg') return 0.001;
  if (f === 'kg' && t === 'g') return 1000;
  if (f === 'ml' && (t === 'l' || t === 'liter')) return 0.001;
  if ((f === 'l' || f === 'liter') && t === 'ml') return 1000;
  const stukFamily = ['stuk', 'stuks', 'stk', 'portie', 'porties'];
  if (stukFamily.includes(f) && stukFamily.includes(t)) return 1;
  return null;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export function roundUpToPack(
  demandInInvUnit: number,
  invUnit: string,
  pack: PackSpec,
): PackResult {
  const qty_needed = round3(Math.max(0, Number(demandInInvUnit) || 0));
  const base: PackResult = {
    qty_needed,
    qty_ordered: qty_needed,
    packs: null,
    pack_size: pack.package_size ?? null,
    pack_unit: pack.package_unit ?? null,
    rounded: false,
    reason: 'ok',
  };

  if (qty_needed <= 0) return { ...base, qty_ordered: 0, reason: 'zero_demand' };

  // Geen pakmaat bekend → 1-op-1, expliciet gemarkeerd (niet stil).
  if (!pack.package_size || pack.package_size <= 0 || !pack.package_unit) {
    return { ...base, reason: 'no_pack' };
  }

  const factor = packConvFactor(pack.package_unit, invUnit);
  if (factor == null) {
    return { ...base, reason: 'incompatible_unit' };
  }

  const packInInvUnit = pack.package_size * factor; // grootte van 1 pak in inventory-eenheid
  const moq = Math.max(1, Math.ceil(Number(pack.moq_packs) || 1));
  const packs = Math.max(moq, Math.ceil(qty_needed / packInInvUnit));
  const qty_ordered = round3(packs * packInInvUnit);

  return {
    qty_needed,
    qty_ordered,
    packs,
    pack_size: pack.package_size,
    pack_unit: pack.package_unit,
    rounded: qty_ordered > qty_needed,
    reason: 'ok',
  };
}
