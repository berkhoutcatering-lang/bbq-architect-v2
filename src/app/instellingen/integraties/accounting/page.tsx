'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Receipt, Save, ShieldCheck } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useOrg } from '@/lib/OrgContext';
import { useToast } from '@/components/Toast';
import { mergedAccountingConfig, type AccountingConfig } from '@/lib/accountingConfig';

/**
 * /instellingen/integraties/accounting
 *
 * Pillar #4 (Geld) — tenant-instelbare accounting-config. Resolt 11 TODO's
 * in /api/accounting/{moneybird,exact} en /api/payments/mollie.
 *
 * Drie kolommen:
 *   1. Algemeen (grootboek + termijnen + email-template)
 *   2. Moneybird (administratie-ID + 3× tax_rate_id)
 *   3. Exact Online (division-code)
 */
export default function AccountingConfigPage() {
    const { orgId, organization } = useOrg();
    const showToast = useToast();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [cfg, setCfg] = useState<AccountingConfig>({});

    useEffect(function () {
        if (!orgId || !supabase) return;
        supabase
            .from('settings')
            .select('accounting_config')
            .eq('organization_id', orgId)
            .maybeSingle()
            .then(function ({ data }) {
                setCfg(((data?.accounting_config as AccountingConfig) || {}));
                setLoading(false);
            });
    }, [orgId]);

    async function save() {
        if (!orgId || !supabase) return;
        setSaving(true);
        const { error } = await supabase
            .from('settings')
            .update({ accounting_config: cfg })
            .eq('organization_id', orgId);
        setSaving(false);
        if (error) {
            showToast('Opslaan mislukt: ' + error.message, 'error');
            return;
        }
        showToast('Accounting-config opgeslagen', 'success');
    }

    function update<K extends keyof AccountingConfig>(key: K, value: AccountingConfig[K]) {
        setCfg(function (prev) { return { ...prev, [key]: value }; });
    }

    const merged = mergedAccountingConfig(cfg);

    return (
        <div className="max-w-[860px] mx-auto px-6 py-10">
            <Link
                href="/instellingen/integraties"
                className="inline-flex items-center gap-2 text-[12px] text-[var(--muted)] hover:text-[var(--text)] no-underline mb-6"
            >
                <ArrowLeft className="w-3.5 h-3.5" />
                Terug naar integraties
            </Link>

            <div className="flex items-start gap-3 mb-2">
                <div className="w-10 h-10 rounded-lg bg-[var(--color-accent-gold)]/10 border border-[var(--color-accent-gold)]/20 flex items-center justify-center shrink-0">
                    <Receipt className="w-4 h-4 text-[var(--color-accent-gold)]" />
                </div>
                <div>
                    <h1 className="text-2xl font-extralight text-[var(--text)]">Boekhouding-instellingen</h1>
                    <p className="text-[13px] text-[var(--muted)] mt-1">
                        Tenant-specifieke defaults voor Moneybird, Exact en factuur-templates van{' '}
                        <strong className="text-[var(--text)]">{organization?.name || '...'}</strong>.
                    </p>
                </div>
            </div>

            <div className="mt-4 mb-8 p-3 rounded-lg border border-[var(--card-solid)] bg-[var(--card)]/40 flex items-start gap-2">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                <p className="text-[11px] text-[var(--muted)] leading-relaxed">
                    BTW-percentages worden niet door AI bepaald. Wij rekenen 21%/9%/0% server-side uit
                    code; deze instellingen mappen alleen onze percentages naar Moneybird/Exact-codes.
                </p>
            </div>

            {loading ? (
                <p className="text-[13px] text-[var(--muted)]">Laden…</p>
            ) : (
                <div className="flex flex-col gap-6">

                    {/* Algemene defaults */}
                    <section className="rounded-2xl border border-[var(--card-solid)] bg-[var(--card)] p-6">
                        <h2 className="text-[15px] font-bold text-[var(--text)] mb-1">Algemeen</h2>
                        <p className="text-[12px] text-[var(--muted)] mb-5">
                            Grootboekrekening, betaaltermijn en email-template voor verzonden facturen.
                        </p>

                        <div className="grid sm:grid-cols-2 gap-4">
                            <Field
                                label="Grootboekrekening omzet"
                                placeholder={merged.grootboekrekening_omzet}
                                value={cfg.grootboekrekening_omzet ?? ''}
                                onChange={function (v) { update('grootboekrekening_omzet', v || undefined); }}
                                hint="NL RGS-code, bijv. 8000 voor verkoopopbrengsten."
                            />
                            <Field
                                label="Grootboekrekening kosten"
                                placeholder={merged.grootboekrekening_kosten}
                                value={cfg.grootboekrekening_kosten ?? ''}
                                onChange={function (v) { update('grootboekrekening_kosten', v || undefined); }}
                                hint="Voor inkoopbonnen, bijv. 7000."
                            />
                            <Field
                                label="Betaaltermijn (dagen)"
                                type="number"
                                placeholder={String(merged.payment_terms_dagen)}
                                value={cfg.payment_terms_dagen != null ? String(cfg.payment_terms_dagen) : ''}
                                onChange={function (v) {
                                    const n = parseInt(v, 10);
                                    update('payment_terms_dagen', isNaN(n) ? undefined : n);
                                }}
                                hint="Default 14 dagen na factuurdatum."
                            />
                            <Field
                                label="Land contact-default (ISO-2)"
                                placeholder={merged.contact_default_country}
                                value={cfg.contact_default_country ?? ''}
                                onChange={function (v) { update('contact_default_country', v || undefined); }}
                                hint="Default NL — voor nieuw aangemaakte contacten."
                            />
                        </div>

                        <div className="mt-5 grid grid-cols-1 gap-4">
                            <Field
                                label="Email-onderwerp template"
                                placeholder={merged.email_template_subject}
                                value={cfg.email_template_subject ?? ''}
                                onChange={function (v) { update('email_template_subject', v || undefined); }}
                                hint="Placeholders {nummer}, {bedrijfsnaam}, {klant}."
                            />
                            <FieldArea
                                label="Email-body template"
                                placeholder={merged.email_template_body}
                                value={cfg.email_template_body ?? ''}
                                onChange={function (v) { update('email_template_body', v || undefined); }}
                                hint="Plain text. Placeholders {nummer}, {bedrijfsnaam}, {klant} worden vervangen."
                            />
                        </div>
                    </section>

                    {/* Moneybird */}
                    <section className="rounded-2xl border border-[var(--card-solid)] bg-[var(--card)] p-6">
                        <h2 className="text-[15px] font-bold text-[var(--text)] mb-1">Moneybird</h2>
                        <p className="text-[12px] text-[var(--muted)] mb-5">
                            Vul de administratie-ID + drie BTW tax_rate_ids in.
                            Ophalen via <code className="text-[var(--text)]">GET /tax_rates.json</code> in Moneybird.
                            Bij leeg veld vallen we terug op env-vars.
                        </p>

                        <div className="grid sm:grid-cols-2 gap-4">
                            <Field
                                label="Administratie-ID"
                                placeholder="123456789012345678"
                                value={cfg.moneybird_administration_id ?? ''}
                                onChange={function (v) { update('moneybird_administration_id', v || undefined); }}
                                hint="Staat in de URL van Moneybird (cijfer-reeks)."
                            />
                            <Field
                                label="Tax rate ID — 21%"
                                placeholder="..."
                                value={cfg.moneybird_tax_rate_21 ?? ''}
                                onChange={function (v) { update('moneybird_tax_rate_21', v || undefined); }}
                                hint="Standaard NL BTW-tarief."
                            />
                            <Field
                                label="Tax rate ID — 9%"
                                placeholder="..."
                                value={cfg.moneybird_tax_rate_9 ?? ''}
                                onChange={function (v) { update('moneybird_tax_rate_9', v || undefined); }}
                                hint="NL laag tarief (voeding)."
                            />
                            <Field
                                label="Tax rate ID — 0%"
                                placeholder="..."
                                value={cfg.moneybird_tax_rate_0 ?? ''}
                                onChange={function (v) { update('moneybird_tax_rate_0', v || undefined); }}
                                hint="Vrijgesteld / intracommunautair."
                            />
                        </div>
                    </section>

                    {/* Exact */}
                    <section className="rounded-2xl border border-[var(--card-solid)] bg-[var(--card)] p-6">
                        <h2 className="text-[15px] font-bold text-[var(--text)] mb-1">Exact Online</h2>
                        <p className="text-[12px] text-[var(--muted)] mb-5">
                            Per administratie. Bij leeg veld valt de route terug op env-var EXACT_DIVISION.
                        </p>

                        <Field
                            label="Division-code"
                            placeholder="12345"
                            value={cfg.exact_division_code ?? ''}
                            onChange={function (v) { update('exact_division_code', v || undefined); }}
                            hint="Numerieke administratie-ID in Exact Online."
                        />
                    </section>

                    <div className="sticky bottom-4 flex items-center justify-end gap-3">
                        <button
                            onClick={save}
                            disabled={saving}
                            className="inline-flex items-center gap-2 px-5 py-3 rounded-lg text-[13px] font-bold bg-[var(--color-accent-gold)] text-black hover:brightness-110 disabled:opacity-40"
                            style={{ minHeight: 44 }}
                        >
                            <Save className="w-4 h-4" />
                            {saving ? 'Opslaan…' : 'Opslaan'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

function Field({
    label, value, onChange, placeholder, hint, type = 'text',
}: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
    hint?: string;
    type?: string;
}) {
    return (
        <label className="flex flex-col gap-1.5">
            <span className="text-[11px] uppercase tracking-wider text-[var(--muted)] font-bold">{label}</span>
            <input
                type={type}
                value={value}
                placeholder={placeholder}
                onChange={function (e) { onChange(e.target.value); }}
                className="px-3 py-2.5 rounded-lg border border-[var(--card-solid)] bg-[var(--card-solid)]/40 text-[13px] text-[var(--text)] focus:outline-none focus:border-[var(--color-accent-gold)]"
            />
            {hint && <span className="text-[11px] text-[var(--muted)]">{hint}</span>}
        </label>
    );
}

function FieldArea({
    label, value, onChange, placeholder, hint,
}: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
    hint?: string;
}) {
    return (
        <label className="flex flex-col gap-1.5">
            <span className="text-[11px] uppercase tracking-wider text-[var(--muted)] font-bold">{label}</span>
            <textarea
                value={value}
                placeholder={placeholder}
                onChange={function (e) { onChange(e.target.value); }}
                rows={4}
                className="px-3 py-2.5 rounded-lg border border-[var(--card-solid)] bg-[var(--card-solid)]/40 text-[13px] text-[var(--text)] focus:outline-none focus:border-[var(--color-accent-gold)] font-mono"
            />
            {hint && <span className="text-[11px] text-[var(--muted)]">{hint}</span>}
        </label>
    );
}
