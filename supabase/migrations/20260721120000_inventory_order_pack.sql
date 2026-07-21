-- ════════════════════════════════════════════════════════════════════════════
--  Migration — inventory.order_pack_qty (besteleenheid per product)
--
--  Sam: sommige producten bestel je altijd per een vast aantal (Beef Club
--  Burgers altijd per 100, nooit per 10 of 5). Dit veld legt die besteleenheid
--  vast op het product zelf. De bestellijst rondt het tekort dan op naar een
--  heel veelvoud hiervan (in de eigen eenheid van het item).
--
--  Los van preferred_supplier_product_id: dit is de simpele, directe pak-maat
--  die de cateraar zelf per product invult. Neemt voorrang op de pakmaat uit
--  een gekoppeld supplier_product.
--
--  Additief + idempotent. Nullable = geen afronding als 'ie leeg is.
-- ════════════════════════════════════════════════════════════════════════════

alter table public.inventory
  add column if not exists order_pack_qty numeric(12,3)
    check (order_pack_qty is null or order_pack_qty > 0);
