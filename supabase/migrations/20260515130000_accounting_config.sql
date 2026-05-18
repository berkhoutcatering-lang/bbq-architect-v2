-- Pillar #4 (Geld) — tenant-instelbare accounting-config.
-- Resolt 11 TODO-comments in /api/accounting/{moneybird,exact} en
-- /api/payments/mollie die nu hardcoded Hop & Bites-defaults gebruiken
-- (grootboekrekening, payment_terms, email_template, contact_attrs).
-- Pro-tier-tenants kunnen nu hun eigen Moneybird/Exact-setup koppelen
-- zonder code-wijziging.

ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS accounting_config jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Document-format: zie src/lib/featureFlags.ts → AccountingConfig type.
-- Voorbeeld:
--   {
--     "grootboekrekening_omzet": "8000",
--     "grootboekrekening_kosten": "7000",
--     "payment_terms_dagen": 14,
--     "email_template_subject": "Factuur {nummer} van {bedrijfsnaam}",
--     "email_template_body": "Beste {klant},\n\nBijgaand de factuur...",
--     "contact_default_country": "NL",
--     "moneybird_tax_rate_21": "...",
--     "moneybird_tax_rate_9": "...",
--     "moneybird_tax_rate_0": "...",
--     "moneybird_administration_id": "...",
--     "exact_division_code": "..."
--   }

COMMENT ON COLUMN settings.accounting_config IS
  'Tenant-specifieke accounting-override; vult/replacest env-vars MONEYBIRD_TAX_RATE_*, MONEYBIRD_ADMINISTRATION_ID en Exact-defaults. Zie /instellingen/integraties/accounting.';
