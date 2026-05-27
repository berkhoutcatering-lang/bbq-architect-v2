'use client';
/* CashflowTab — Pillar #1 (Create / Performance)
   13-weken kasstroom-prognose obv accepted offertes + vaste kosten + openstaande facturen.
   Geen AI in de loop — pure berekening via computeCashflow() in financeAnalytics.ts. */

import { useMemo, useState } from 'react';
import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, Cell } from 'recharts';
import { AlertTriangle, TrendingDown, TrendingUp, Wallet, Settings, X } from 'lucide-react';
import MetallicCard from '@/components/MetallicCard';
import { fmt } from '@/lib/utils';
import { computeCashflow, type CashflowInputs, type OfferteMin, type FactuurMin, type EventMin, type BonMin } from '@/lib/financeAnalytics';

interface Props {
    offertes: OfferteMin[];
    facturen: FactuurMin[];
    events: EventMin[];
    bonnen: BonMin[];
    /** Initial inputs uit settings (komt later via useSettings). */
    initialInputs?: CashflowInputs;
    /** Callback wanneer user vaste-kosten edit (later persisten via Server Action). */
    onSaveInputs?: (inputs: CashflowInputs) => void;
}

export default function CashflowTab({ offertes, facturen, events, bonnen, initialInputs, onSaveInputs }: Props) {
    const [inputs, setInputs] = useState<CashflowInputs>(initialInputs ?? {
        start_balance: 0,
        buffer_grens: 2500,
        monthly_fixed_costs: 0,
    });
    const [editOpen, setEditOpen] = useState(false);

    const cashflow = useMemo(
        () => computeCashflow(offertes, facturen, events, bonnen, inputs),
        [offertes, facturen, events, bonnen, inputs],
    );

    const chartData = cashflow.weeks.map(w => ({
        week: w.week_label,
        Inkomend: w.inkomend,
        Uitgaand: -w.uitgaand, /* negatief voor visuele tegen-richting */
        Cumulatief: w.cumulatief,
        risico: w.risico,
    }));

    const risk_week = cashflow.first_risk_week_index >= 0 ? cashflow.weeks[cashflow.first_risk_week_index] : null;
    const week4_cum = cashflow.weeks[3]?.cumulatief ?? 0;
    const week13_cum = cashflow.weeks[12]?.cumulatief ?? 0;

    return (
        <div data-testid="cashflow-tab">
            {/* Top stat strip */}
            <div className="stat-grid mb-24" style={{ marginTop: 16 }}>
                <div className="stat-card">
                    <div className="stat-icon" style={{ background: 'rgba(96,165,250,.12)', color: 'var(--blue)' }}><Wallet size={14} /></div>
                    <div className="stat-val">{fmt(cashflow.start_balance)}</div>
                    <div className="stat-label">Huidig saldo</div>
                    <div className="stat-sub">handmatig invullen</div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon" style={{ background: 'rgba(34,197,94,.12)', color: 'var(--green)' }}><TrendingUp size={14} /></div>
                    <div className="stat-val">{fmt(week4_cum)}</div>
                    <div className="stat-label">Over 4 weken</div>
                    <div className="stat-sub">netto cumulatief</div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon" style={{ background: 'rgba(167,139,250,.12)', color: 'var(--purple)' }}><TrendingUp size={14} /></div>
                    <div className="stat-val">{fmt(week13_cum)}</div>
                    <div className="stat-label">Over 13 weken</div>
                    <div className="stat-sub">netto cumulatief</div>
                </div>
                <div className="stat-card" style={{ background: risk_week ? 'rgba(239,68,68,.08)' : undefined, border: risk_week ? '1px solid rgba(239,68,68,.25)' : undefined }}>
                    <div className="stat-icon" style={{ background: risk_week ? 'rgba(239,68,68,.15)' : 'rgba(130,130,130,.08)', color: risk_week ? 'var(--red)' : 'var(--muted)' }}><AlertTriangle size={14} /></div>
                    <div className="stat-val" style={{ color: risk_week ? 'var(--red)' : undefined }}>
                        {risk_week ? risk_week.week_label : '—'}
                    </div>
                    <div className="stat-label">Risico-week</div>
                    <div className="stat-sub">onder buffer {fmt(cashflow.buffer_grens)}</div>
                </div>
            </div>

            {/* Chart */}
            <MetallicCard hover={false}>
                <div className="panel-head">
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <TrendingUp size={12} style={{ color: 'var(--brand)' }} /> 13-weken cashflow-prognose
                    </h3>
                    <button
                        onClick={() => setEditOpen(true)}
                        className="btn btn-ghost btn-sm"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                    >
                        <Settings size={12} /> Aanpassen
                    </button>
                </div>
                <div style={{ height: 280, padding: '16px 8px' }}>
                    <ResponsiveContainer width="100%" height="100%" minWidth={100} minHeight={100}>
                        <ComposedChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                            <XAxis dataKey="week" tick={{ fill: 'var(--zinc)', fontSize: 10 }} axisLine={false} tickLine={false} />
                            <YAxis yAxisId="left" tick={{ fill: 'var(--zinc)', fontSize: 9 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => v >= 1000 ? '€' + Math.round(v / 1000) + 'k' : '€' + v} />
                            <YAxis yAxisId="right" orientation="right" tick={{ fill: 'var(--zinc)', fontSize: 9 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => v >= 1000 ? '€' + Math.round(v / 1000) + 'k' : '€' + v} />
                            <Tooltip
                                formatter={(v: number, name: string) => ['€' + Math.abs(v).toLocaleString('nl-NL'), name]}
                                contentStyle={{ background: '#18181b', border: '1px solid rgba(255,191,0,.15)', borderRadius: 8, fontSize: 11 }}
                                cursor={{ fill: 'rgba(255,191,0,.06)' }}
                            />
                            <ReferenceLine yAxisId="right" y={cashflow.buffer_grens} stroke="var(--red)" strokeDasharray="3 3" />
                            <Bar yAxisId="left" dataKey="Inkomend" radius={[4, 4, 0, 0]}>
                                {chartData.map((d, i) => <Cell key={i} fill={d.risico ? 'var(--red)' : 'var(--green)'} />)}
                            </Bar>
                            <Bar yAxisId="left" dataKey="Uitgaand" radius={[0, 0, 4, 4]} fill="var(--muted-weak, #888)" />
                            <Line yAxisId="right" type="monotone" dataKey="Cumulatief" stroke="var(--purple)" strokeWidth={2} dot={false} />
                        </ComposedChart>
                    </ResponsiveContainer>
                </div>
                <div style={{ display: 'flex', gap: 16, padding: '0 16px 12px', fontSize: 11, color: 'var(--muted)' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 10, height: 10, background: 'var(--green)', borderRadius: 2 }} /> Inkomend</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 10, height: 10, background: 'var(--muted-weak, #888)', borderRadius: 2 }} /> Uitgaand</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 12, height: 2, background: 'var(--purple)' }} /> Cumulatief saldo</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 12, height: 2, background: 'var(--red)', borderTop: '2px dashed var(--red)' }} /> Buffer {fmt(cashflow.buffer_grens)}</span>
                </div>
            </MetallicCard>

            {/* Detail tabel per week */}
            <MetallicCard hover={false} className="mt-4">
                <div className="panel-head">
                    <h3>Week-detail</h3>
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                        Totaal inkomend: {fmt(cashflow.totaal_inkomend_13w)} · uitgaand: {fmt(cashflow.totaal_uitgaand_13w)}
                    </span>
                </div>
                <div className="tbl-wrap">
                    <table className="tbl">
                        <thead>
                            <tr>
                                <th>Week</th>
                                <th style={{ textAlign: 'right' }}>Inkomend</th>
                                <th style={{ textAlign: 'right' }}>Uitgaand</th>
                                <th style={{ textAlign: 'right' }}>Netto</th>
                                <th style={{ textAlign: 'right' }}>Cumulatief</th>
                            </tr>
                        </thead>
                        <tbody>
                            {cashflow.weeks.map((w, i) => (
                                <tr key={i} style={w.risico ? { background: 'rgba(239,68,68,.04)' } : undefined}>
                                    <td>
                                        <span style={{ fontWeight: 600 }}>{w.week_label}</span>
                                        <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--muted)' }}>{w.week_start}</span>
                                    </td>
                                    <td style={{ textAlign: 'right', color: w.inkomend > 0 ? 'var(--green)' : 'var(--muted)' }}>{w.inkomend > 0 ? fmt(w.inkomend) : '—'}</td>
                                    <td style={{ textAlign: 'right', color: 'var(--muted)' }}>−{fmt(w.uitgaand)}</td>
                                    <td style={{ textAlign: 'right', fontWeight: 600, color: w.netto >= 0 ? 'var(--green)' : 'var(--red)' }}>{w.netto >= 0 ? '+' : ''}{fmt(w.netto)}</td>
                                    <td style={{ textAlign: 'right', fontWeight: 700, color: w.risico ? 'var(--red)' : 'var(--text)' }}>
                                        {fmt(w.cumulatief)}
                                        {w.risico && <AlertTriangle size={11} style={{ marginLeft: 4, verticalAlign: 'middle' }} />}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </MetallicCard>

            {/* Edit drawer */}
            {editOpen && (
                <>
                    <div onClick={() => setEditOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', backdropFilter: 'blur(4px)', zIndex: 9998 }} />
                    <aside style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 380, maxWidth: '90vw', background: 'var(--bg-elevated, #16161a)', borderLeft: '1px solid var(--border)', zIndex: 9999, animation: 'slideInRight .35s cubic-bezier(.16,1,.3,1)', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <h3 style={{ fontSize: 16, fontWeight: 600 }}>Cashflow-instellingen</h3>
                            <button onClick={() => setEditOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: 8, minWidth: 44, minHeight: 44 }}>
                                <X size={18} />
                            </button>
                        </div>
                        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
                            <div>
                                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6, color: 'var(--muted)' }}>Huidig banksaldo</label>
                                <input
                                    type="number"
                                    value={inputs.start_balance ?? 0}
                                    onChange={e => setInputs({ ...inputs, start_balance: Number(e.target.value) })}
                                    style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-subtle)', color: 'var(--text)', fontSize: 14 }}
                                />
                                <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>Voer je actuele banksaldo in om de prognose accuraat te maken.</p>
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6, color: 'var(--muted)' }}>Vaste maandlasten</label>
                                <input
                                    type="number"
                                    value={inputs.monthly_fixed_costs ?? 0}
                                    onChange={e => setInputs({ ...inputs, monthly_fixed_costs: Number(e.target.value) })}
                                    style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-subtle)', color: 'var(--text)', fontSize: 14 }}
                                />
                                <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>Huur, abonnementen, verzekeringen. Wordt door 4,33 gedeeld voor wekelijks.</p>
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6, color: 'var(--muted)' }}>Buffer-grens</label>
                                <input
                                    type="number"
                                    value={inputs.buffer_grens ?? 2500}
                                    onChange={e => setInputs({ ...inputs, buffer_grens: Number(e.target.value) })}
                                    style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-subtle)', color: 'var(--text)', fontSize: 14 }}
                                />
                                <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>Weken waar het saldo onder deze grens komt worden rood.</p>
                            </div>
                            <div style={{ padding: '12px 14px', background: 'rgba(96,165,250,.06)', border: '1px solid rgba(96,165,250,.18)', borderRadius: 8, fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>
                                <strong style={{ color: 'var(--blue)' }}>Heads up:</strong> deze waardes worden lokaal opgeslagen tot bank-koppeling live is (P2). Bij refresh blijven ze niet — voer ze opnieuw in.
                            </div>
                        </div>
                        <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', gap: 12 }}>
                            <button onClick={() => setEditOpen(false)} className="btn btn-ghost" style={{ flex: 1 }}>Annuleer</button>
                            <button
                                onClick={() => {
                                    onSaveInputs?.(inputs);
                                    setEditOpen(false);
                                }}
                                className="btn btn-brand"
                                style={{ flex: 1 }}
                            >
                                Opslaan
                            </button>
                        </div>
                    </aside>
                </>
            )}

            {/* Empty state hint when no incoming/outgoing */}
            {cashflow.totaal_inkomend_13w === 0 && cashflow.totaal_uitgaand_13w === 0 && (
                <div style={{ marginTop: 16, padding: '16px 18px', background: 'rgba(245,158,11,.06)', border: '1px solid rgba(245,158,11,.18)', borderRadius: 10, fontSize: 13, color: 'var(--muted)' }}>
                    <strong style={{ color: 'var(--amber)' }}>Lege prognose:</strong> nog geen offertes met event-datum binnen 13 weken én geen vaste lasten ingevoerd. Klik <em>Aanpassen</em> om vaste lasten + banksaldo te zetten.
                </div>
            )}

            {risk_week && (
                <div style={{ marginTop: 16, padding: '14px 16px', background: 'rgba(239,68,68,.06)', border: '1px solid rgba(239,68,68,.25)', borderRadius: 10, fontSize: 13, color: 'var(--text)' }}>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                        <TrendingDown size={16} color="var(--red)" style={{ flexShrink: 0, marginTop: 2 }} />
                        <div>
                            <div style={{ fontWeight: 600, marginBottom: 4, color: 'var(--red)' }}>Risico in {risk_week.week_label} ({risk_week.week_start})</div>
                            <div style={{ color: 'var(--muted)', lineHeight: 1.5 }}>
                                Cumulatief saldo zakt naar {fmt(risk_week.cumulatief)} — onder buffer-grens {fmt(cashflow.buffer_grens)}.
                                Versnel facturatie of stel een uitgave uit om de buffer te houden.
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
