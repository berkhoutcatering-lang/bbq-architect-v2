-- Fix: pos_order_items.product_id moet nullable zijn
-- Reden: FK heeft ON DELETE SET NULL, maar kolom was NOT NULL → conflict bij delete
-- product_name blijft bewaard als text (NOT NULL) dus POS-historie blijft leesbaar

ALTER TABLE pos_order_items ALTER COLUMN product_id DROP NOT NULL;
