/**
 * Tenant-specifieke accounting-overrides (Pillar #4 — Geld).
 *
 * Stored in `settings.accounting_config` jsonb. Server-side helpers
 * lezen deze en vallen terug op env-vars/defaults waar leeg.
 */

export interface AccountingConfig {
    /** Standaard grootboekrekening voor omzet (NL RGS, bijv. '8000'). */
    grootboekrekening_omzet?: string;
    /** Standaard grootboekrekening voor kosten (bijv. '7000'). */
    grootboekrekening_kosten?: string;
    /** Betaaltermijn in dagen (default 14). */
    payment_terms_dagen?: number;
    /** Subject-template voor factuur-email. Placeholders: {nummer}, {bedrijfsnaam}, {klant}. */
    email_template_subject?: string;
    /** Body-template voor factuur-email. */
    email_template_body?: string;
    /** Default land voor nieuwe contacten (ISO-2, default 'NL'). */
    contact_default_country?: string;

    /** Moneybird BTW tax_rate_ids per percentage. Ophalen via /tax_rates.json. */
    moneybird_tax_rate_21?: string;
    moneybird_tax_rate_9?: string;
    moneybird_tax_rate_0?: string;
    moneybird_administration_id?: string;

    /** Exact Online division-code per administratie. */
    exact_division_code?: string;
}

/**
 * Default-config — gebruikt voor alle velden die niet expliciet zijn gezet
 * voor de tenant. Houdt huidige hardcoded-defaults compatible.
 */
export const ACCOUNTING_DEFAULTS: Required<Omit<AccountingConfig,
    'moneybird_tax_rate_21' | 'moneybird_tax_rate_9' | 'moneybird_tax_rate_0'
    | 'moneybird_administration_id' | 'exact_division_code'
>> = {
    grootboekrekening_omzet: '8000',
    grootboekrekening_kosten: '7000',
    payment_terms_dagen: 14,
    email_template_subject: 'Factuur {nummer} van {bedrijfsnaam}',
    email_template_body: 'Beste {klant},\n\nBijgaand ontvangt u factuur {nummer}.\n\nMet vriendelijke groet,\n{bedrijfsnaam}',
    contact_default_country: 'NL',
};

/**
 * Lees `accounting_config` uit `settings` voor een tenant. Tolerant: bij
 * fout of ontbrekende kolom returnt lege config; caller valt terug op
 * defaults + env-vars.
 */
export function mergedAccountingConfig(cfg: AccountingConfig | null | undefined): Required<typeof ACCOUNTING_DEFAULTS> & Pick<AccountingConfig,
    'moneybird_tax_rate_21' | 'moneybird_tax_rate_9' | 'moneybird_tax_rate_0'
    | 'moneybird_administration_id' | 'exact_division_code'
> {
    const c = cfg || {};
    return {
        grootboekrekening_omzet: c.grootboekrekening_omzet ?? ACCOUNTING_DEFAULTS.grootboekrekening_omzet,
        grootboekrekening_kosten: c.grootboekrekening_kosten ?? ACCOUNTING_DEFAULTS.grootboekrekening_kosten,
        payment_terms_dagen: c.payment_terms_dagen ?? ACCOUNTING_DEFAULTS.payment_terms_dagen,
        email_template_subject: c.email_template_subject ?? ACCOUNTING_DEFAULTS.email_template_subject,
        email_template_body: c.email_template_body ?? ACCOUNTING_DEFAULTS.email_template_body,
        contact_default_country: c.contact_default_country ?? ACCOUNTING_DEFAULTS.contact_default_country,
        moneybird_tax_rate_21: c.moneybird_tax_rate_21,
        moneybird_tax_rate_9: c.moneybird_tax_rate_9,
        moneybird_tax_rate_0: c.moneybird_tax_rate_0,
        moneybird_administration_id: c.moneybird_administration_id,
        exact_division_code: c.exact_division_code,
    };
}

/**
 * Vervang placeholders in een template-string. Onbekende placeholders
 * blijven staan (niet stilzwijgend verwijderen).
 */
export function fillTemplate(template: string, vars: Record<string, string>): string {
    return template.replace(/\{(\w+)\}/g, function (m, key) {
        return key in vars ? vars[key] : m;
    });
}
