/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Bestelvoorstel DAL
 * ──────────────────
 * Groepeert "wat moet ik bestellen voor de events komende N dagen én om mijn
 * minimale voorraad op peil te houden" per leverancier. Math is server-side &
 * deterministic — AI bemoeit zich NIET met de getallen.
 *
 * Let op: sinds 2026-07-31 is par_level een bestel-ondergrens die BOVENOP de
 * event-vraag komt (zie inventoryDemand.ts). Een item zonder events kan dus
 * tóch op de lijst staan, puur omdat de voorraad onder par is gezakt.
 *
 * Nieuw t.o.v. v1:
 *  - Vaste leverancier-koppeling (inventory.preferred_supplier_product_id) bepaalt
 *    de leverancier-bucket én levert de pakmaat voor de afronding.
 *  - Pak-afronding: besteld = ceil(nodig / pak) × pak (packRounding.ts).
 *  - Elke regel draagt `qty_needed` (kaal tekort) én `qty_ordered` (afgerond).
 *  - Prijs-precedentie: last_price_eur → purchase_price → onbekend. NOOIT stil €0:
 *    onbekende prijs → price_unknown=true en telt niet mee in het subtotaal.
 *    (supplier_products.price_cents blijft buiten de prijs tot fase-2 de eenheid
 *    opschoont — die kolom is nu inconsistent pak- vs per-eenheid.)
 *  - `blocking`: ongekoppelde ingrediënten → verzenden op slot (onderbestelling).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { getInventoryWithDemand, type InventoryDemandRow, type UnmatchedIngredient } from './inventoryDemand';
import { ensureConceptOrder } from './inkoopOrders';
import { getOverridesForOrg, type OrderOverride } from './orderOverrides';
import { roundUpToPack, type RoundingReason } from './packRounding';
import { pakVoorstel } from '../voorraadTelling';
import { zoekKandidaten, searchTerms, leveranciersOpId } from '../ingredientMatchDb';
import { pickBestMatch, lineCostCents, normalizeIngredientName, coverageOf, type CostCandidate } from '../recipeMatch';

/* Voorraad-items heten naar waar ze gekocht worden: "kippendij makro", "gerookte
   bavette beef club 29". Dat woord staat nooit in de catalogus van een andere
   winkel, dus voor het zoeken gaat het eruit. Staat de eigen bedrijfsnaam erin
   ("hop&bites pulled pork"), dan is het eigen productie — dat koop je nergens. */
function zoeknaamZonderWinkel(naam: string, winkelWoorden: Set<string>, eigenWoorden: Set<string>): { zoeknaam: string; eigenProductie: boolean } {
  const tokens = normalizeIngredientName(naam).split(' ').filter(Boolean);
  const eigenProductie = eigenWoorden.size > 0 && tokens.some(function (t) { return eigenWoorden.has(t); });
  const rest = tokens.filter(function (t) { return !winkelWoorden.has(t) && !eigenWoorden.has(t); });
  return { zoeknaam: rest.join(' ') || naam, eigenProductie };
}

/** "5000 g" → "5 kg", "1500 ml" → "1,5 liter". Alleen voor het label; het
 *  bestelde aantal blijft in de eenheid van het voorraad-item staan. */
function netPak(size: number | null, unit: string | null): string {
  if (size == null || !unit) return `${size ?? '?'} ${unit ?? ''}`.trim();
  const pak = pakVoorstel({ pack_total_quantity: size, pack_total_unit: unit });
  const q = pak ? pak.inhoud : size;
  const u = pak ? pak.eenheid : unit;
  return `${String(Math.round(q * 1000) / 1000).replace('.', ',')} ${u}`;
}

export interface BestelvoorstelItem {
  inventory_id: number;
  naam: string;
  qty: number; // = qty_ordered (backward-compat voor bestaande UI/PDF)
  qty_needed: number; // kaal tekort (na derving + onderweg)
  qty_ordered: number; // afgerond naar hele pakken
  packs: number | null;
  pack_label: string | null;
  pack_size: number | null;
  pack_unit: string | null;
  rounding_reason: RoundingReason;
  supplier_product_id: number | null;
  product_url: string | null; // deep-link naar de productpagina bij de leverancier (bestellen in 1 klik)
  unit: string;
  unit_price_eur: number | null;
  /** 'catalogus' = prijs uit de catalogus van de gekozen winkel (winkel-modus). */
  price_source: 'last_price' | 'purchase_price' | 'catalogus' | 'unknown';
  price_unknown: boolean;
  est_total_eur: number; // 0 bij onbekende prijs (zie price_unknown) — nooit "stil" een prijs verzinnen
  last_price_at: string | null;
  events_count: number;
  events: Array<{ event_id: number; event_name: string; event_date: string; qty: number }>;
  categorie: string | null;
  override_applied: boolean;
  original_qty: number;
  /* Opbouw van het aantal (fix #4: "waarom dit aantal"-uitklap). Alle stappen die
     samen het tekort vormen — zodat een sceptische operator het kan narekenen. */
  reserved_qty: number;          // som van de per-event vraag (vóór derving)
  derving_pct: number;           // buffer-percentage
  reserved_buffered_qty: number; // reserved + derving, vóór par
  par_level: number | null;      // minimale voorraad die je wilt overhouden
  target_qty: number;            // reserved + derving + par
  current_stock: number;         // wat er al ligt
  in_flight_qty: number;         // wat al onderweg is (verzonden, niet ontvangen)
  /* Winkel-modus ("vandaag naar de Sligro"): het product dat bij de gekozen
     winkel gevonden is voor dit voorraad-item, of null als die het niet heeft.
     De vaste koppeling blijft staan; dit geldt voor deze ronde. */
  winkel_product: {
    name: string;
    confidence: 'hoog' | 'middel' | 'laag';
    source: 'supplier' | 'supplier_product';
    ref_id: number;
  } | null;
  /* De leverancier waar dit item normaal heen gaat — in winkel-modus is dat
     de plek waar een niet-gevonden item alsnog besteld wordt. */
  vaste_leverancier_naam: string | null;
}

export interface BestelvoorstelLeverancier {
  leverancier_id: number | null;
  leverancier_naam: string;
  leverancier_type: string;
  leverancier_email: string | null;
  leverancier_phone: string | null;
  concept_order_id: string | null;
  /** Levertijd van deze leverancier in dagen (voor de bestel-vóór-deadline). null = onbekend → val terug op de default-lead. */
  lead_time_days: number | null;
  items: BestelvoorstelItem[];
  subtotal_eur: number;
  subtotal_incomplete: boolean; // true = er zitten items zonder prijs in deze bucket
}

export interface OrderBlocker {
  raw_name: string;
  qty_total: number;
  unit: string | null;
  affected_events: Array<{ event_id: number; event_name: string; event_date: string; qty: number }>;
}

export interface WinkelKeuze {
  id: number;
  naam: string;
  rang: number;
}

export interface BestelvoorstelSummary {
  per_leverancier: BestelvoorstelLeverancier[];
  /* Winkel-modus. null = "zoals gekoppeld" (elk item bij zijn vaste leverancier). */
  winkel: WinkelKeuze | null;
  /* Leveranciers met een voorkeur-rang, in volgorde — de knoppen bovenaan. */
  winkel_keuzes: WinkelKeuze[];
  /* Items die de gekozen winkel niet heeft; die blijven bij hun vaste leverancier. */
  niet_bij_winkel: BestelvoorstelItem[];
  totals: {
    items_total: number;
    leveranciers_count: number;
    estimated_total_eur: number;
    window_days: number;
  };
  has_unknown_supplier: boolean;
  unmatched_ingredients: UnmatchedIngredient[];
  // Blokkerende koppel-waarschuwing: zolang is_blocked, mag "verstuur alle orders" niet.
  blocking: {
    is_blocked: boolean;
    unmatched_count: number;
    affected_event_count: number;
    items: OrderBlocker[];
    message: string;
  };
  window: { start: string; end: string };
  /* Afgeleid uit de demand-snapshot die hieronder toch al berekend wordt.
     /inkoop had die snapshot ook zelf opgehaald voor de empty-state, waardoor
     getInventoryWithDemand — acht queries op een rij — twee keer draaide per
     paginaload. Deze twee getallen is alles wat de pagina ervan nodig had. */
  demand_meta: {
    events_in_window_count: number;
    has_menu_items: boolean;
  };
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function buildBestelvoorstel(
  supabase: SupabaseClient,
  orgId: string,
  windowDays: number = 14,
  opts: { persistConcepts?: boolean; winkel?: number | null } = {},
): Promise<BestelvoorstelSummary> {
  const persistConcepts = opts.persistConcepts !== false;

  /* Winkelkeuze (docs/leveranciersvoorkeur-plan.md, golf 3): leveranciers met
     een voorkeur-rang zijn de knoppen; is er één gekozen, dan gaat élke regel
     naar die winkel — voor deze ronde, de vaste koppeling blijft staan. */
  const { data: rangRows } = await supabase
    .from('leveranciers').select('id, naam, voorkeur_rang')
    .eq('organization_id', orgId).not('voorkeur_rang', 'is', null).is('archived_at', null)
    .order('voorkeur_rang', { ascending: true });
  const winkelKeuzes: WinkelKeuze[] = (rangRows || []).map(function (l: any) {
    return { id: l.id as number, naam: l.naam as string, rang: Number(l.voorkeur_rang) };
  });
  const winkel: WinkelKeuze | null = opts.winkel != null
    ? (winkelKeuzes.find(function (k) { return k.id === opts.winkel; }) ?? null)
    : null;

  // 1. Demand-snapshot (bevat al derving + par + in-flight in de shortfall).
  const demand = await getInventoryWithDemand(supabase, orgId, windowDays);
  const shortItems = demand.rows.filter(function (r) { return r.shortfall > 0; });
  const demandMeta = {
    events_in_window_count: demand.events_in_window?.length ?? 0,
    has_menu_items: demand.rows.some(function (r) { return r.reserved_qty > 0; }),
  };

  const now = new Date();
  const windowEnd = new Date(now.getTime() + windowDays * 86400000);
  const windowStartIso = toIsoDate(now);
  const windowEndIso = toIsoDate(windowEnd);

  const blocking = buildBlocking(demand.unmatched);

  if (shortItems.length === 0) {
    return {
      per_leverancier: [],
      winkel,
      winkel_keuzes: winkelKeuzes,
      niet_bij_winkel: [],
      totals: { items_total: 0, leveranciers_count: 0, estimated_total_eur: 0, window_days: windowDays },
      has_unknown_supplier: demand.unmatched.length > 0,
      unmatched_ingredients: demand.unmatched,
      blocking,
      window: { start: windowStartIso, end: windowEndIso },
      demand_meta: demandMeta,
    };
  }

  // 2. Inventory-meta (last_price + leverancier + vaste supplier_product-koppeling).
  const inventoryIds = shortItems.map(function (r) { return r.id; });
  const { data: invRows } = await supabase
    .from('inventory')
    .select('id, leverancier_id, last_price_eur, last_price_at, last_price_leverancier_id, purchase_price, categorie, preferred_supplier_product_id, order_pack_qty')
    .in('id', inventoryIds);
  const invMap = new Map<number, any>();
  (invRows || []).forEach(function (r: any) { invMap.set(r.id, r); });

  // 2b. Gekoppelde supplier_products (leverancier + pakmaat).
  const spIds: number[] = [];
  (invRows || []).forEach(function (r: any) {
    if (typeof r.preferred_supplier_product_id === 'number') spIds.push(r.preferred_supplier_product_id);
  });
  const spById = new Map<number, any>();
  if (spIds.length > 0) {
    const { data: spRows } = await supabase
      .from('supplier_products')
      .select('id, supplier_id, package_size, package_unit, product_url')
      .eq('organization_id', orgId)
      .in('id', spIds);
    (spRows || []).forEach(function (s: any) { spById.set(s.id, s); });
  }

  // 3. Overrides (P0-5).
  const overrides: OrderOverride[] = await getOverridesForOrg(supabase, orgId).catch(() => []);
  const overridesByInv = new Map<number, OrderOverride>();
  overrides.forEach(function (o) { overridesByInv.set(o.inventory_id, o); });

  // 4. Leveranciers-meta (vaste binding, override-doel, last-price, legacy FK).
  const supplierIdsSet = new Set<number>();
  (invRows || []).forEach(function (r: any) {
    const sp = typeof r.preferred_supplier_product_id === 'number' ? spById.get(r.preferred_supplier_product_id) : null;
    const supId = sp?.supplier_id ?? r.last_price_leverancier_id ?? r.leverancier_id;
    if (supId) supplierIdsSet.add(supId);
  });
  overrides.forEach(function (o) {
    if (o.override_leverancier_id) supplierIdsSet.add(o.override_leverancier_id);
  });
  const supplierIds = Array.from(supplierIdsSet);

  type SupplierMeta = { naam: string; type: string; email: string | null; phone: string | null; lead_time_days: number | null };
  const suppliers: Record<number, SupplierMeta> = {};
  if (supplierIds.length > 0) {
    const { data: levRows } = await supabase
      .from('leveranciers')
      .select('id, naam, type, email, tel, lead_time_days')
      .in('id', supplierIds);
    (levRows || []).forEach(function (l: any) {
      suppliers[l.id] = {
        naam: l.naam, type: l.type || 'Overig', email: l.email || null, phone: l.tel || null,
        lead_time_days: (l.lead_time_days != null && Number.isFinite(Number(l.lead_time_days))) ? Number(l.lead_time_days) : null,
      };
    });
  }

  // 4b. Winkel-modus: elk item op naam koppelen aan een product van de winkel.
  //     Zelfde matcher als de receptuur (naam-overlap, middenprijs, uitschieter-
  //     rem), beperkt tot deze leverancier. Niets gevonden → blijft bij de vaste
  //     leverancier en komt in "niet bij …".
  type WinkelTreffer = { cand: CostCandidate; confidence: 'hoog' | 'middel' | 'laag' };
  const winkelTreffer = new Map<number, WinkelTreffer>();
  const winkelSpMeta = new Map<number, any>();
  const eigenProductie = new Set<number>();
  if (winkel) {
    const levById = await leveranciersOpId(supabase, orgId);
    const scope = { id: winkel.id, naam: winkel.naam };
    /* Woorden die naar een winkel of naar onszelf verwijzen, uit de zoeknaam. */
    const winkelWoorden = new Set<string>();
    levById.forEach(function (naam) {
      normalizeIngredientName(naam).split(' ').filter(function (t) { return t.length >= 2; }).forEach(function (t) { winkelWoorden.add(t); });
    });
    const { data: org } = await supabase.from('organizations').select('name').eq('id', orgId).maybeSingle();
    const eigenWoorden = new Set<string>(
      normalizeIngredientName(String(org?.name ?? '')).split(' ').filter(function (t) { return t.length >= 3; }),
    );
    /* "Hop & Bites" wordt "hop bites"; in itemnamen staat vaak "hop&bites" → "hop bites" na normalisatie, dus dat dekt elkaar. */
    await Promise.all(shortItems.map(async function (r) {
      const invMeta = invMap.get(r.id) || {};
      const spGekoppeld = typeof invMeta.preferred_supplier_product_id === 'number'
        ? spById.get(invMeta.preferred_supplier_product_id) : null;
      /* Al vast aan deze winkel gekoppeld → dat product, geen zoekwerk. */
      if (spGekoppeld && spGekoppeld.supplier_id === winkel.id) return;
      const { zoeknaam, eigenProductie: eigen } = zoeknaamZonderWinkel(r.naam, winkelWoorden, eigenWoorden);
      if (eigen) { eigenProductie.add(r.id); return; }
      const terms = searchTerms(zoeknaam);
      const kandidaten = (await zoekKandidaten(supabase, orgId, terms, scope, levById))
        .filter(function (c) { return c.source === 'supplier' || c.source === 'supplier_product'; });
      const best = pickBestMatch(zoeknaam, kandidaten, undefined, r.unit);
      /* Strenger dan bij een recept: een bestelling gaat de deur uit. Alle
         woorden van het item moeten in het product zitten — "hotdog broodjes"
         mag niet op "Hotdog halal, blik 32 stuks" landen. Twijfel → "niet bij". */
      if (best && best.confidence !== 'laag' && coverageOf(zoeknaam, best.candidate.name) === 1) {
        winkelTreffer.set(r.id, { cand: best.candidate, confidence: best.confidence });
      }
    }));
    /* Pakmaat + productlink van de gevonden catalogus-B-producten. */
    const ids = Array.from(winkelTreffer.values())
      .map(function (t) { return t.cand.supplierProductId; })
      .filter(function (id): id is number { return typeof id === 'number'; });
    if (ids.length > 0) {
      const { data: rows } = await supabase
        .from('supplier_products')
        .select('id, supplier_id, package_size, package_unit, product_url')
        .eq('organization_id', orgId)
        .in('id', ids);
      (rows || []).forEach(function (s: any) { winkelSpMeta.set(s.id, s); });
    }
    if (!(winkel.id in suppliers)) {
      const { data: l } = await supabase
        .from('leveranciers').select('id, naam, type, email, tel, lead_time_days').eq('id', winkel.id).maybeSingle();
      if (l) {
        suppliers[winkel.id] = {
          naam: l.naam, type: l.type || 'Overig', email: l.email || null, phone: l.tel || null,
          lead_time_days: (l.lead_time_days != null && Number.isFinite(Number(l.lead_time_days))) ? Number(l.lead_time_days) : null,
        };
      }
    }
  }
  const nietBijWinkel: BestelvoorstelItem[] = [];

  // 5. Groeperen + overrides + pak-afronding + prijs.
  const grouped = new Map<number | string, BestelvoorstelLeverancier>();

  function getBucket(key: number | null): BestelvoorstelLeverancier {
    const k: number | string = key == null ? '__unknown' : key;
    let b = grouped.get(k);
    if (!b) {
      const meta = key != null ? suppliers[key] : null;
      b = {
        leverancier_id: key,
        leverancier_naam: meta ? meta.naam : 'Nog te kiezen',
        leverancier_type: meta ? meta.type : 'Overig',
        leverancier_email: meta ? meta.email : null,
        leverancier_phone: meta ? meta.phone : null,
        concept_order_id: null,
        lead_time_days: meta ? meta.lead_time_days : null,
        items: [],
        subtotal_eur: 0,
        subtotal_incomplete: false,
      };
      grouped.set(k, b);
    }
    return b;
  }

  shortItems.forEach(function (r: InventoryDemandRow) {
    const ov = overridesByInv.get(r.id);
    if (ov?.removed) return;

    const invMeta = invMap.get(r.id) || {};
    const spVast = typeof invMeta.preferred_supplier_product_id === 'number'
      ? spById.get(invMeta.preferred_supplier_product_id)
      : null;

    // Leverancier-bucket: order-override → vaste binding → last-price → legacy FK.
    const defaultSupId: number | null =
      spVast?.supplier_id ?? invMeta.last_price_leverancier_id ?? invMeta.leverancier_id ?? r.leverancier_id ?? null;
    const vasteSupId = ov?.override_leverancier_id ?? defaultSupId;

    /* Winkel-modus: gevonden bij de winkel → die bucket, met het gevonden
       product (pakmaat, link, catalogusprijs). Niet gevonden → apart blok,
       en de regel houdt zijn vaste leverancier. */
    const treffer = winkel ? winkelTreffer.get(r.id) : undefined;
    const alVastBijWinkel = !!(winkel && spVast && spVast.supplier_id === winkel.id);
    const bijWinkel = !!winkel && (alVastBijWinkel || !!treffer);
    const spTreffer = treffer?.cand.supplierProductId != null ? winkelSpMeta.get(treffer.cand.supplierProductId) : null;
    const sp = bijWinkel ? (alVastBijWinkel ? spVast : spTreffer) : spVast;
    const effectiveSupId = bijWinkel ? winkel!.id : vasteSupId;

    // Nodig (kaal tekort of user-override) → afronden op pakmaat van het supplier_product.
    const originalQty = r.shortfall;
    const needed = ov?.override_qty != null ? Number(ov.override_qty) : originalQty;
    if (needed <= 0) return;

    // Besteleenheid op het product (bv. "per 100") wint van de supplier_product-pakmaat.
    const hasProductPack = invMeta.order_pack_qty != null && Number(invMeta.order_pack_qty) > 0;
    const packed = roundUpToPack(needed, r.unit, {
      package_size: hasProductPack ? Number(invMeta.order_pack_qty) : (sp?.package_size ?? null),
      package_unit: hasProductPack ? r.unit : (sp?.package_unit ?? null),
      moq_packs: null,
    });

    // Prijs per inventory-eenheid: last_price (bon-historie) → purchase_price → onbekend.
    let unitPriceEur: number | null = null;
    let priceSource: BestelvoorstelItem['price_source'];
    if (invMeta.last_price_eur != null) {
      unitPriceEur = Number(invMeta.last_price_eur);
      priceSource = 'last_price';
    } else if (invMeta.purchase_price != null) {
      unitPriceEur = Number(invMeta.purchase_price);
      priceSource = 'purchase_price';
    } else {
      priceSource = 'unknown';
    }
    /* Winkel-modus met een gevonden catalogusproduct: de catalogusprijs van
       díe winkel is wat je straks betaalt — die gaat vóór de laatste bonprijs
       (die kan van een andere leverancier zijn). Eenheden onvergelijkbaar →
       terug naar de bonprijs. */
    if (treffer) {
      const cents = lineCostCents(1, r.unit, treffer.cand);
      if (cents != null && cents > 0) {
        unitPriceEur = cents / 100;
        priceSource = 'catalogus';
      }
    }
    const priceUnknown = priceSource === 'unknown' || unitPriceEur == null || !(unitPriceEur > 0);
    const estTotal = priceUnknown ? 0 : Math.round(packed.qty_ordered * (unitPriceEur as number) * 100) / 100;

    const item: BestelvoorstelItem = {
      inventory_id: r.id,
      naam: r.naam,
      qty: packed.qty_ordered,
      qty_needed: packed.qty_needed,
      qty_ordered: packed.qty_ordered,
      packs: packed.packs,
      /* Label alleen netter schrijven, niet omrekenen: de leverancier levert
         "5000 g" maar de rest van de regel staat in kg ("nodig 3.00 kg"). Twee
         eenheden in één zin laten staan maakt een kloppende bestelling
         onleesbaar. qty_ordered blijft ongemoeid — dit is puur weergave. */
      pack_label: packed.packs != null ? `${packed.packs}× ${netPak(packed.pack_size, packed.pack_unit)}` : null,
      pack_size: packed.pack_size,
      pack_unit: packed.pack_unit,
      rounding_reason: packed.reason,
      supplier_product_id: sp?.id ?? null,
      product_url: sp?.product_url ?? null,
      unit: r.unit,
      unit_price_eur: priceUnknown ? null : unitPriceEur,
      price_source: priceSource,
      price_unknown: priceUnknown,
      est_total_eur: estTotal,
      last_price_at: invMeta.last_price_at || null,
      events_count: r.events.length,
      events: r.events.map(function (e) {
        return { event_id: e.event_id, event_name: e.event_name, event_date: e.event_date, qty: e.qty };
      }),
      categorie: invMeta.categorie ?? r.categorie ?? null,
      override_applied: !!ov && (ov.override_qty != null || ov.override_leverancier_id != null),
      original_qty: originalQty,
      reserved_qty: r.reserved_qty,
      derving_pct: r.derving_pct,
      reserved_buffered_qty: r.reserved_buffered_qty,
      par_level: r.par_level,
      target_qty: r.target_qty,
      current_stock: r.current_stock,
      in_flight_qty: r.in_flight_qty,
      winkel_product: treffer
        ? { name: treffer.cand.name, confidence: treffer.confidence, source: treffer.cand.source as 'supplier' | 'supplier_product', ref_id: treffer.cand.ref_id }
        : (alVastBijWinkel && spVast ? { name: r.naam, confidence: 'hoog', source: 'supplier_product', ref_id: spVast.id } : null),
      vaste_leverancier_naam: eigenProductie.has(r.id)
        ? 'eigen productie'
        : (vasteSupId != null ? (suppliers[vasteSupId]?.naam ?? null) : null),
    };

    if (winkel && !bijWinkel) {
      nietBijWinkel.push(item);
      return;
    }

    const bucket = getBucket(effectiveSupId);
    bucket.items.push(item);
    if (item.price_unknown) bucket.subtotal_incomplete = true;
    else bucket.subtotal_eur += estTotal;
  });

  // Sorteer.
  const list = Array.from(grouped.values()).sort(function (a, b) {
    if (a.leverancier_id == null && b.leverancier_id != null) return 1;
    if (b.leverancier_id == null && a.leverancier_id != null) return -1;
    return a.leverancier_naam.localeCompare(b.leverancier_naam, 'nl');
  });
  list.forEach(function (l) {
    l.items.sort(function (a, b) { return b.qty - a.qty; });
    l.subtotal_eur = Math.round(l.subtotal_eur * 100) / 100;
  });

  // 6. Per bucket een concept-order garanderen.
  if (persistConcepts) {
    for (const bucket of list) {
      if (bucket.items.length === 0) continue;
      try {
        bucket.concept_order_id = await ensureConceptOrder(
          supabase, orgId, bucket.leverancier_id, windowStartIso, windowEndIso,
        );
      } catch (e) {
        console.warn('[bestelvoorstel] ensureConceptOrder failed for', bucket.leverancier_naam, e);
      }
    }
  }

  const totalItems = list.reduce(function (s, l) { return s + l.items.length; }, 0);
  const totalEur = list.reduce(function (s, l) { return s + l.subtotal_eur; }, 0);

  return {
    per_leverancier: list,
    winkel,
    winkel_keuzes: winkelKeuzes,
    niet_bij_winkel: nietBijWinkel.sort(function (a, b) { return b.qty - a.qty; }),
    totals: {
      items_total: totalItems,
      leveranciers_count: list.filter(function (l) { return l.leverancier_id != null; }).length,
      estimated_total_eur: Math.round(totalEur * 100) / 100,
      window_days: windowDays,
    },
    has_unknown_supplier: list.some(function (l) { return l.leverancier_id == null; }) || demand.unmatched.length > 0,
    unmatched_ingredients: demand.unmatched,
    blocking,
    window: { start: windowStartIso, end: windowEndIso },
    demand_meta: demandMeta,
  };
}

function buildBlocking(unmatched: UnmatchedIngredient[]) {
  const affectedEvents = new Set<number>();
  unmatched.forEach(function (u) { u.events.forEach(function (e) { affectedEvents.add(e.event_id); }); });
  return {
    is_blocked: unmatched.length > 0,
    unmatched_count: unmatched.length,
    affected_event_count: affectedEvents.size,
    items: unmatched.map(function (u): OrderBlocker {
      return { raw_name: u.raw_name, qty_total: u.qty_total, unit: u.unit, affected_events: u.events };
    }),
    message: unmatched.length > 0
      ? `${unmatched.length} ingrediënt(en) van ${affectedEvents.size} event(s) zijn niet gekoppeld aan voorraad — hierdoor bestel je te weinig. Koppel ze eerst.`
      : '',
  };
}
