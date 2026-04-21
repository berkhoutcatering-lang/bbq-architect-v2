-- Fix: pos_inventory.product_id FK moet ON DELETE CASCADE zijn (was SET NULL)
-- Reden: inventory_target CHECK vereist product_id OR ingredient_id NOT NULL.
-- Bij SET NULL op een rij die alleen product_id had, faalt de check constraint.
-- CASCADE verwijdert zulke rijen netjes mee wanneer het gerecht verdwijnt.

ALTER TABLE pos_inventory DROP CONSTRAINT IF EXISTS pos_inventory_product_id_fkey;
ALTER TABLE pos_inventory ADD CONSTRAINT pos_inventory_product_id_fkey
  FOREIGN KEY (product_id) REFERENCES gerechten(id) ON DELETE CASCADE;
