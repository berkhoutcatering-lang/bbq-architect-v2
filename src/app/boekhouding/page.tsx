'use client';
import { useState } from 'react';
import { useSupabase } from '@/lib/useSupabase';
import { fmt, MAANDEN_KORT } from '@/lib/utils';
import {
    BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
    ComposedChart, Line, PieChart, Pie, Legend,
} from 'recharts';
import EmptyState from '@/components/EmptyState';
import PageHeader from '@/components/PageHeader';
import PageSection from '@/components/PageSection';
import { BarChart3, Calculator, Clock, Euro, Flame, LineChart, Percent, PieChart as PieChartIcon, Star, Users } from 'lucide-react';
import MetallicCard from '@/components/MetallicCard';
import type { Factuur, Event as DbEvent } from '@/types';

export default function Boekhouding() {
    const { data: facturen, loading } = useSupabase<Factuur>('facturen', []);
    const { data: events } = useSupabase<DbEvent>('events', []);
    const [tab, setTab] = useState('wv');

    const betaald = facturen.filter(function (f) { return f.status === 'betaald'; });
    const open = facturen.filter(function (f) { return f.status !== 'betaald' && f.status !== 'geannuleerd'; });

    let omzet = 0;
    betaald.forEach(function (f) {
        (f.items || []).forEach(function (item: { qty?: number; prijs?: number }) { omzet += (item.qty || 0) * (item.prijs || 0); });
    });

    let openstaand = 0;
    open.forEach(function (f) {
        (f.items || []).forEach(function (item: { qty?: number; prijs?: number }) { openstaand += (item.qty || 0) * (item.prijs || 0); });
    });

    let prognose = 0;
    events.forEach(function (e) {
        if (e.status === 'confirmed' || e.status === 'optie') {
            prognose += (e.guests || 0) * (e.ppp || 0);
        }
    });

    const monthlyData = new Array(12).fill(0);
    const yearStr = new Date().getFullYear().toString();
    betaald.forEach(function (f) {
        if (!f.datum || !f.datum.startsWith(yearStr)) return;
        const month = parseInt(f.datum.split('-')[1], 10) - 1;
        (f.items || []).forEach(function (item: { qty?: number; prijs?: number }) { monthlyData[month] += (item.qty || 0) * (item.prijs || 0); });
    });

    let cumulative = 0;
    const omzetChartData = MAANDEN_KORT.map(function (naam: string, i: number) {
        cumulative += monthlyData[i];
        return { naam: naam, omzet: Math.round(monthlyData[i]), cumulatief: Math.round(cumulative) };
    });

    const statusCounts: Record<string, number> = {};
    facturen.forEach(function (f) {
        const s = f.status || 'onbekend';
        statusCounts[s] = (statusCounts[s] || 0) + 1;
    });
    const statusKleuren: Record<string, string> = { betaald: 'var(--green)', verzonden: 'var(--brand)', concept: 'var(--muted)', vervallen: 'var(--red)' };
    const statusLabels: Record<string, string> = { betaald: 'Betaald', verzonden: 'Verzonden', concept: 'Concept', vervallen: 'Vervallen' };
    const statusPieData = Object.keys(statusCounts).map(function (s) {
        return { name: statusLabels[s] || s, value: statusCounts[s], color: statusKleuren[s] || 'var(--purple)' };
    }).filter(function (d) { return d.value > 0; });

    const clientTotals: Record<string, number> = {};
    betaald.forEach(function (f) {
        const naam = f.client_naam || 'Onbekend';
        if (!clientTotals[naam]) clientTotals[naam] = 0;
        (f.items || []).forEach(function (item: { qty?: number; prijs?: number }) { clientTotals[naam] += (item.qty || 0) * (item.prijs || 0); });
    });
    const topClients = Object.keys(clientTotals)
        .map(function (naam) { return { naam: naam, omzet: clientTotals[naam] }; })
        .sort(function (a, b) { return b.omzet - a.omzet; })
        .slice(0, 5);

    const btwMap: Record<string, { netto: number; btw: number }> = {};
    facturen.forEach(function (f) {
        (f.items || []).forEach(function (item: { qty?: number; prijs?: number; btw?: number }) {
            const pct = item.btw || 0;
            const line = (item.qty || 0) * (item.prijs || 0);
            const btwBedrag = line * (pct / 100);
            if (!btwMap[pct]) btwMap[pct] = { netto: 0, btw: 0 };
            btwMap[pct].netto += line;
            btwMap[pct].btw += btwBedrag;
        });
    });

    if (loading) return (
        <div className="min-h-screen bg-[var(--color-bg-primary)] flex items-center justify-center">
            <Flame className="w-8 h-8 text-[var(--color-accent-gold)] animate-pulse" />
        </div>
    );

    if (facturen.length === 0) {
        return (
            <div style={{ animation: 'fadeIn 0.4s ease-out' }}>
                <EmptyState page="/boekhouding" />
            </div>
        );
    }

    return (
        <div style={{ animation: 'fadeIn 0.4s ease-out' }}>
            <PageHeader title="Boekhouding" />
            <div className="tab-bar">
                <button className={'tab-btn' + (tab === 'wv' ? ' active' : '')} onClick={function () { setTab('wv'); }}>Winst &amp; Verlies</button>
                <button className={'tab-btn' + (tab === 'btw' ? ' active' : '')} onClick={function () { setTab('btw'); }}>BTW Overzicht</button>
                <button className={'tab-btn' + (tab === 'clients' ? ' active' : '')} onClick={function () { setTab('clients'); }}>Top Klanten</button>
            </div>

            {tab === 'wv' && (
                <PageSection>
                    <div className="stat-grid mb-24" style={{ marginTop: 16 }}>
                        <div className="stat-card">
                            <div className="stat-icon" style={{ background: 'rgba(34,197,94,.12)', color: 'var(--green)' }}><Euro size={14} /></div>
                            <div className="stat-val">{fmt(omzet)}</div>
                            <div className="stat-label">Omzet (betaald)</div>
                            <div className="stat-sub">{betaald.length} facturen</div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-icon" style={{ background: 'rgba(245,158,11,.12)', color: 'var(--amber)' }}><Clock size={14} /></div>
                            <div className="stat-val">{fmt(openstaand)}</div>
                            <div className="stat-label">Openstaand</div>
                            <div className="stat-sub">{open.length} facturen</div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-icon" style={{ background: 'rgba(167,139,250,.12)', color: 'var(--purple)' }}><LineChart size={14} /></div>
                            <div className="stat-val">{fmt(prognose)}</div>
                            <div className="stat-label">Prognose (events)</div>
                            <div className="stat-sub">{events.length} events</div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-icon" style={{ background: 'rgba(255,191,0,.12)', color: 'var(--brand)' }}><Percent size={14} /></div>
                            <div className="stat-val">{omzet + openstaand > 0 ? Math.round((omzet / (omzet + openstaand)) * 100) + '%' : '—'}</div>
                            <div className="stat-label">Betaald Ratio</div>
                            <div className="stat-sub">{facturen.length} facturen totaal</div>
                        </div>
                    </div>

                    <div className="analytics-grid">
                        <MetallicCard hover={false}>
                            <div className="panel-head">
                                <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <BarChart3 size={12} style={{ color: 'var(--brand)' }} /> Maandomzet &amp; Cumulatief
                                </h3>
                                <span style={{ fontSize: 12, color: 'var(--muted)' }}>betaalde facturen</span>
                            </div>
                            <div className="panel-body" style={{ height: 200, marginTop: 12 }}>
                                <ResponsiveContainer width="100%" height="100%" minWidth={100} minHeight={100}>
                                    <ComposedChart data={omzetChartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }} barCategoryGap="30%">
                                        <XAxis dataKey="naam" tick={{ fill: 'var(--zinc)', fontSize: 10 }} axisLine={false} tickLine={false} />
                                        <YAxis yAxisId="left" tick={{ fill: 'var(--zinc)', fontSize: 9 }} axisLine={false} tickLine={false} tickFormatter={function (v: number) { return v >= 1000 ? '€' + Math.round(v / 1000) + 'k' : '€' + v; }} />
                                        <YAxis yAxisId="right" orientation="right" tick={{ fill: 'var(--zinc)', fontSize: 9 }} axisLine={false} tickLine={false} tickFormatter={function (v: number) { return v >= 1000 ? '€' + Math.round(v / 1000) + 'k' : '€' + v; }} />
                                        <Tooltip formatter={function (v: number, name: string) { return ['€' + v.toLocaleString('nl-NL'), name === 'omzet' ? 'Maandomzet' : 'Cumulatief']; }} contentStyle={{ background: '#18181b', border: '1px solid rgba(255,191,0,.15)', borderRadius: 8, fontSize: 11 }} cursor={{ fill: 'rgba(255,191,0,.06)' }} />
                                        <Bar yAxisId="left" dataKey="omzet" radius={[4, 4, 0, 0]}>
                                            {omzetChartData.map(function (d, i) { return <Cell key={i} fill={d.omzet > 0 ? 'var(--brand)' : '#27272a'} />; })}
                                        </Bar>
                                        <Line yAxisId="right" type="monotone" dataKey="cumulatief" stroke="var(--purple)" strokeWidth={2} dot={false} />
                                    </ComposedChart>
                                </ResponsiveContainer>
                            </div>
                        </MetallicCard>

                        {statusPieData.length > 0 && (
                            <MetallicCard hover={false}>
                                <div className="panel-head">
                                    <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <PieChartIcon size={12} style={{ color: 'var(--purple)' }} /> Facturen Status
                                    </h3>
                                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>{facturen.length} totaal</span>
                                </div>
                                <div style={{ height: 200, marginTop: 12 }}>
                                    <ResponsiveContainer width="100%" height="100%" minWidth={100} minHeight={100}>
                                        <PieChart>
                                            <Pie data={statusPieData} dataKey="value" cx="45%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={3}>
                                                {statusPieData.map(function (entry, i) { return <Cell key={i} fill={entry.color} />; })}
                                            </Pie>
                                            <Tooltip formatter={function (v: number, n: string) { return [v + ' facturen', n]; }} contentStyle={{ background: '#18181b', border: '1px solid rgba(255,191,0,.15)', borderRadius: 8, fontSize: 11 }} />
                                            <Legend iconSize={8} wrapperStyle={{ fontSize: 10, color: 'var(--zinc)' }} />
                                        </PieChart>
                                    </ResponsiveContainer>
                                </div>
                            </MetallicCard>
                        )}
                    </div>
                </PageSection>
            )}

            {tab === 'btw' && (
                <PageSection>
                <MetallicCard hover={false} className="mt-4">
                    <div className="panel-head"><h3>BTW Overzicht</h3></div>
                    <div className="panel-body">
                        {Object.keys(btwMap).length === 0 && <div className="empty-state"><Calculator size={14} /><p>Geen BTW data beschikbaar</p></div>}
                        <div className="tbl-wrap">
                        <table className="tbl">
                            <thead><tr><th>BTW %</th><th style={{ textAlign: 'right' }}>Netto Omzet</th><th style={{ textAlign: 'right' }}>BTW Bedrag</th><th style={{ textAlign: 'right' }}>Bruto</th></tr></thead>
                            <tbody>
                                {Object.keys(btwMap).sort().map(function (pct) {
                                    const row = btwMap[pct];
                                    return (
                                        <tr key={pct}>
                                            <td><span className="pill pill-blue">{pct}%</span></td>
                                            <td style={{ textAlign: 'right' }}>{fmt(row.netto)}</td>
                                            <td style={{ textAlign: 'right' }}>{fmt(row.btw)}</td>
                                            <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(row.netto + row.btw)}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                        </div>
                        <div style={{ marginTop: 16, padding: 16, background: 'var(--bg)', borderRadius: 12, border: '1px solid var(--border)', textAlign: 'right' }}>
                            <span style={{ color: 'var(--muted)', marginRight: 12 }}>Totaal af te dragen BTW:</span>
                            <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--brand)' }}>
                                {fmt(Object.values(btwMap).reduce(function (sum, r) { return sum + r.btw; }, 0))}
                            </span>
                        </div>
                    </div>
                </MetallicCard>
                </PageSection>
            )}

            {tab === 'clients' && (
                <PageSection>
                <MetallicCard hover={false} className="mt-4">
                    <div className="panel-head">
                        <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Star size={12} style={{ color: 'var(--brand)' }} /> Top Klanten
                        </h3>
                        <span style={{ fontSize: 12, color: 'var(--muted)' }}>betaalde facturen</span>
                    </div>
                    {topClients.length === 0 && <div className="empty-state"><Users size={14} /><p>Geen data beschikbaar</p></div>}
                    {topClients.length > 0 && (
                        <>
                            <div style={{ height: 250, padding: '16px 0' }}>
                                <ResponsiveContainer width="100%" height="100%" minWidth={100} minHeight={100}>
                                    <BarChart data={topClients} layout="vertical" margin={{ top: 4, right: 32, left: 80, bottom: 4 }} barCategoryGap="25%">
                                        <XAxis type="number" tick={{ fill: 'var(--zinc)', fontSize: 9 }} axisLine={false} tickLine={false} tickFormatter={function (v: number) { return v >= 1000 ? '€' + Math.round(v / 1000) + 'k' : '€' + v; }} />
                                        <YAxis type="category" dataKey="naam" tick={{ fill: '#f4f4f5', fontSize: 11, fontWeight: 600 }} axisLine={false} tickLine={false} width={76} />
                                        <Tooltip formatter={function (v: number) { return ['€' + v.toLocaleString('nl-NL'), 'Omzet']; }} contentStyle={{ background: '#18181b', border: '1px solid rgba(255,191,0,.15)', borderRadius: 8, fontSize: 11 }} cursor={{ fill: 'rgba(255,191,0,.06)' }} />
                                        <Bar dataKey="omzet" radius={[0, 4, 4, 0]} fill="var(--brand)" />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                            <div style={{ padding: '0 16px 16px' }}>
                                {topClients.map(function (c, i) {
                                    const pct = omzet > 0 ? (c.omzet / omzet) * 100 : 0;
                                    return (
                                        <div key={c.naam} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                                            <span style={{ fontSize: 12, fontWeight: 900, color: 'var(--brand)', width: 20 }}>#{i + 1}</span>
                                            <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{c.naam}</span>
                                            <span style={{ fontSize: 12, color: 'var(--muted)' }}>{pct.toFixed(1)}%</span>
                                            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--brand)' }}>{fmt(c.omzet)}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </>
                    )}
                </MetallicCard>
                </PageSection>
            )}
        </div>
    );
}
