'use client';
/* AangifteTab — Pillar #3 (Create / Must-be)
   Q-deadline-countdown + voorbereiding-checklist + BTW-concept generator.
   Geen AI in de loop — bedragen komen uit financeAnalytics.computeBtwAangifte(). */

import { useMemo, useState } from 'react';
import { Calendar, CheckCircle2, Circle, Download, ShieldCheck, FileText, AlertTriangle } from 'lucide-react';
import MetallicCard from '@/components/MetallicCard';
import { fmt } from '@/lib/utils';
import {
    currentQuarterPeriod,
    computeBtwAangifte,
    computeBoekhoudChecks,
    type FactuurMin,
    type BonMin,
    type BtwAangifteRubrieken,
} from '@/lib/financeAnalytics';

interface Props {
    facturen: FactuurMin[];
    bonnen: Array<BonMin & { btw_laag_bedrag?: number | string; btw_hoog_bedrag?: number | string; ai_classify_status?: string }>;
}

export default function AangifteTab({ facturen, bonnen }: Props) {
    const period = useMemo(() => currentQuarterPeriod(), []);
    const rubrieken = useMemo(() => computeBtwAangifte(facturen, bonnen, period), [facturen, bonnen, period]);
    const [generating, setGenerating] = useState(false);
    const [generated, setGenerated] = useState<BtwAangifteRubrieken | null>(null);

    /* "Klopt het?"-controle — vangt fouten vóór de aangifte de deur uit gaat. */
    const checks = useMemo(() => computeBoekhoudChecks(facturen, bonnen, period), [facturen, bonnen, period]);
    const errorCount = checks.filter(c => c.severity === 'error').length;
    const warnCount = checks.filter(c => c.severity === 'warning').length;
    const allOk = errorCount === 0 && warnCount === 0;

    async function generateConcept() {
        setGenerating(true);
        try {
            const res = await fetch('/api/financien/btw-aangifte-concept', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ year: period.year, quarter: period.quarter }),
            });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.error || `HTTP ${res.status}`);
            }
            const body = await res.json();
            setGenerated(body.rubrieken);
        } catch (e) {
            console.error('[aangifte] generate failed', e);
        } finally {
            setGenerating(false);
        }
    }

    function downloadJSON() {
        const payload = {
            period,
            rubrieken: generated || rubrieken,
            generated_at: new Date().toISOString(),
            disclaimer: 'Concept-aangifte — boekhouder valideert en dient in.',
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `btw-aangifte-concept-${period.year}Q${period.quarter}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }

    const isOverdue = period.days_until_deadline < 0;
    const isUrgent = period.days_until_deadline >= 0 && period.days_until_deadline <= 14;

    return (
        <div data-testid="aangifte-tab">
            {/* Deadline countdown banner */}
            <div
                style={{
                    marginTop: 16,
                    padding: '18px 22px',
                    background: isOverdue
                        ? 'linear-gradient(135deg, rgba(239,68,68,.1), rgba(239,68,68,.04))'
                        : isUrgent
                            ? 'linear-gradient(135deg, rgba(245,158,11,.1), rgba(245,158,11,.04))'
                            : 'linear-gradient(135deg, rgba(96,165,250,.06), rgba(96,165,250,.02))',
                    border: `1px solid ${isOverdue ? 'rgba(239,68,68,.3)' : isUrgent ? 'rgba(245,158,11,.3)' : 'rgba(96,165,250,.18)'}`,
                    borderRadius: 14,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 14,
                    marginBottom: 20,
                }}
            >
                <div style={{ width: 44, height: 44, borderRadius: 12, background: isOverdue ? 'rgba(239,68,68,.15)' : isUrgent ? 'rgba(245,158,11,.15)' : 'rgba(96,165,250,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Calendar size={20} color={isOverdue ? 'var(--red)' : isUrgent ? 'var(--amber)' : 'var(--blue)'} />
                </div>
                <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>
                        Q{period.quarter} {period.year} BTW-aangifte
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>
                        {isOverdue
                            ? `${Math.abs(period.days_until_deadline)} dagen verlopen — direct indienen, boete €68 + 3% rente`
                            : isUrgent
                                ? `Nog ${period.days_until_deadline} dagen tot deadline ${period.deadline}`
                                : `Deadline ${period.deadline} (over ${period.days_until_deadline} dagen)`}
                        <span style={{ marginLeft: 12, color: 'var(--muted-weak, #888)' }}>
                            periode: {period.start_date} — {period.end_date}
                        </span>
                    </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 22, fontWeight: 700, color: rubrieken.saldo >= 0 ? 'var(--red)' : 'var(--green)', fontVariantNumeric: 'tabular-nums' }}>
                        {rubrieken.saldo >= 0 ? fmt(rubrieken.saldo) : '+' + fmt(Math.abs(rubrieken.saldo))}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>{rubrieken.saldo >= 0 ? 'te betalen' : 'terug te vorderen'}</div>
                </div>
            </div>

            {/* Two-column: "Klopt het?"-controle + rubrieken */}
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.2fr)', gap: 16 }}>
                {/* Klopt het?-controle */}
                <MetallicCard hover={false}>
                    <div className="panel-head">
                        <h3>Klopt het?</h3>
                        <span style={{ fontSize: 12, fontWeight: 600, color: errorCount ? 'var(--red)' : warnCount ? 'var(--amber)' : 'var(--green)' }}>
                            {allOk ? 'Alles in orde' : errorCount ? `${errorCount} te fixen` : `${warnCount} om te checken`}
                        </span>
                    </div>
                    <div style={{ padding: 4 }}>
                        {checks.map(item => {
                            const isOk = item.severity === 'ok';
                            const isError = item.severity === 'error';
                            const tone = isError ? 'var(--red)' : 'var(--amber)';
                            return (
                                <div
                                    key={item.id}
                                    data-testid={`aangifte-check-${item.id}`}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'flex-start',
                                        gap: 12,
                                        padding: '12px 16px',
                                        borderBottom: '1px solid var(--border)',
                                    }}
                                >
                                    {isOk
                                        ? <CheckCircle2 size={18} color="var(--green)" style={{ flexShrink: 0, marginTop: 1 }} />
                                        : <Circle size={18} color={tone} style={{ flexShrink: 0, marginTop: 1 }} />
                                    }
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontSize: 13, fontWeight: 600, color: isOk ? 'var(--muted)' : 'var(--text)' }}>
                                            {item.label}
                                        </div>
                                        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                                            {item.detail}
                                        </div>
                                        {!isOk && item.refs && item.refs.length > 0 && (
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                                                {item.refs.map(ref => (
                                                    <span key={ref} style={{ fontSize: 10, fontWeight: 600, color: tone, background: 'rgba(130,130,130,.08)', border: `1px solid ${tone}`, padding: '1px 7px', borderRadius: 999, fontVariantNumeric: 'tabular-nums' }}>
                                                        {ref}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                    {isError && (
                                        <AlertTriangle size={14} color={tone} style={{ flexShrink: 0, marginTop: 2 }} />
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </MetallicCard>

                {/* Rubrieken preview */}
                <MetallicCard hover={false}>
                    <div className="panel-head">
                        <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <FileText size={12} style={{ color: 'var(--brand)' }} /> Concept-rubrieken
                        </h3>
                        <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--muted)', background: 'rgba(130,130,130,.08)', padding: '2px 8px', borderRadius: 999, border: '1px solid var(--border)' }}>
                            <ShieldCheck size={9} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 3 }} /> Boekhouder beslist
                        </span>
                    </div>
                    <div className="tbl-wrap">
                        <table className="tbl">
                            <tbody>
                                <tr>
                                    <td style={{ width: 60, fontWeight: 700, fontFamily: 'var(--font-mono, ui-monospace)' }}>1a</td>
                                    <td>Hoog tarief (21%)</td>
                                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--muted)' }}>{fmt(rubrieken.rubriek_1a.omzet)}</td>
                                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{fmt(rubrieken.rubriek_1a.btw)}</td>
                                </tr>
                                <tr>
                                    <td style={{ fontWeight: 700, fontFamily: 'var(--font-mono, ui-monospace)' }}>1b</td>
                                    <td>Laag tarief (9%)</td>
                                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--muted)' }}>{fmt(rubrieken.rubriek_1b.omzet)}</td>
                                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{fmt(rubrieken.rubriek_1b.btw)}</td>
                                </tr>
                                <tr style={{ background: 'rgba(130,130,130,.04)' }}>
                                    <td style={{ fontWeight: 700, fontFamily: 'var(--font-mono, ui-monospace)' }}>5a</td>
                                    <td colSpan={2} style={{ color: 'var(--muted)' }}>Verschuldigde BTW (1a + 1b)</td>
                                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: 'var(--brand)' }}>{fmt(rubrieken.rubriek_5a)}</td>
                                </tr>
                                <tr>
                                    <td style={{ fontWeight: 700, fontFamily: 'var(--font-mono, ui-monospace)' }}>5b</td>
                                    <td colSpan={2}>Voorbelasting (bonnen)</td>
                                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: 'var(--green)' }}>−{fmt(rubrieken.rubriek_5b)}</td>
                                </tr>
                                <tr style={{ background: 'rgba(167,139,250,.04)' }}>
                                    <td colSpan={3} style={{ fontWeight: 700 }}>Saldo</td>
                                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700, fontSize: 16, color: rubrieken.saldo >= 0 ? 'var(--brand)' : 'var(--green)' }}>
                                        {rubrieken.saldo >= 0 ? fmt(rubrieken.saldo) : '+' + fmt(Math.abs(rubrieken.saldo))}
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </MetallicCard>
            </div>

            {/* Generate concept actions */}
            <div style={{ marginTop: 16, padding: '18px 22px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 2 }}>Concept genereren voor boekhouder</div>
                        <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                            JSON-export met alle 6 rubrieken + bron-facturen + bonnen. Importeer direct in boekhouder-software.
                        </div>
                    </div>
                    <button
                        data-testid="aangifte-generate-btn"
                        onClick={generateConcept}
                        disabled={generating}
                        className="btn btn-brand"
                        style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center', gap: 6, opacity: generating ? 0.6 : 1 }}
                    >
                        {generating ? 'Genereren…' : 'Genereer concept'}
                    </button>
                    <button
                        data-testid="aangifte-download-json"
                        onClick={downloadJSON}
                        className="btn btn-ghost"
                        style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                    >
                        <Download size={14} /> Download JSON
                    </button>
                </div>
                {generated && (
                    <div style={{ marginTop: 12, padding: '10px 14px', background: 'rgba(34,197,94,.06)', border: '1px solid rgba(34,197,94,.2)', borderRadius: 8, fontSize: 12, color: 'var(--green)' }}>
                        ✓ Concept gegenereerd via server — bedragen geverifieerd. Saldo: <strong>{fmt(generated.saldo)}</strong>
                    </div>
                )}
            </div>

            {/* Permanent disclaimer */}
            <div style={{ marginTop: 16, display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 16px', background: 'rgba(244,114,182,.06)', border: '1px solid rgba(244,114,182,.18)', borderRadius: 10 }}>
                <ShieldCheck size={14} color="#f472b6" style={{ marginTop: 1, flexShrink: 0 }} />
                <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.6 }}>
                    Dit is een <strong style={{ color: 'var(--text)' }}>concept</strong> obv betaalde facturen + bonnen-voorbelasting.
                    Bedragen zijn server-berekend, geen AI in de loop. Je boekhouder valideert posten zoals 2a (B2B verlegd) en 3a/3b (export EU/buiten EU) die we hier niet auto-vullen.
                </div>
            </div>
        </div>
    );
}
