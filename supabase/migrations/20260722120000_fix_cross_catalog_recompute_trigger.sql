-- Fix cross-catalog corruption in enqueue_components_after_mutation_approve.
--
-- The trigger (migration 20260601100000) enqueued a recipe recompute with:
--     where c.supplier_product_id = new.master_product_id
-- but components.supplier_product_id is a FK to supplier_products.id (Catalog B),
-- while org_price_mutations.master_product_id lives in master_products/supplier_prices
-- (Catalog A). Those are two INDEPENDENT bigint identity sequences with no shared key.
-- So an approved price-list mutation could, on a coincidental id collision, overwrite the
-- base_cost_cents of an UNRELATED component — which then cascades into
-- gerechten.total_cost_cents. In the non-colliding case it silently did nothing.
--
-- There is no correct join between the two catalogs today, and the downstream RPC
-- (process_recipe_recompute_queue) sets base_cost_cents = a single price, which is also
-- wrong for multi-ingredient prepared components. So we make the trigger INERT: approving
-- a price list no longer silently mutates recipe costs. Recipe cost now follows the
-- ingredient rows in the editor (the sum is adopted automatically on save). A correct,
-- re-summing price-list -> recipe propagation is a separate, future feature.
--
-- Idempotent (create or replace); the trigger binding from 20260601100000 stays intact.

create or replace function public.enqueue_components_after_mutation_approve()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
    -- Intentionally a no-op: the previous cross-catalog predicate
    -- (components.supplier_product_id = org_price_mutations.master_product_id) compared two
    -- unrelated id-spaces and could corrupt an unrelated component's base_cost_cents.
    return new;
end;
$$;

-- Drain any rows the OLD buggy trigger already enqueued, so the daily cron
-- (process_recipe_recompute_queue, called by /api/cron/recipe-cost-recompute) cannot
-- replay them and set an unrelated component's base_cost_cents to a wrong single price.
-- Every pending row was produced by the meaningless cross-catalog join, so marking them
-- all processed is safe and correct. (Verified empty on the primary tenant at write time;
-- this guards any rows enqueued between now and when this migration runs, plus other tenants.)
update public.recipe_recompute_queue
   set processed_at = now(),
       last_error   = 'geneutraliseerd: cross-catalog recompute-bug (mig 20260722120000)'
 where processed_at is null;
