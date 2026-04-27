'use client';
import { useState, useMemo } from 'react';
import { useSupabase } from '@/lib/useSupabase';
import { fmt, MAANDEN_KORT } from '@/lib/utils';
import {
    BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
    ComposedChart, Line, PieChart, Pie, Legend,
} from 'recharts';
import EmptyState from '@/components/EmptyState';
import { LoadingState } from '@/components/LoadingState';
import PageHeader from '@/components/PageHeader';
import PageSection from '@/components/PageSection';
import { BarChart3, Calculator, Clock, Euro, LineChart, Percent, PieChart as PieChartIcon, Star, Users, Truck, Receipt as ReceiptIcon } from 'lucide-react';
import MetallicCard from '@/components/MetallicCard';
import type { Factuur, Event as DbEvent, Bon } from '@/types';

interface Leverancier { id: number; naam: string; type?: string }

export default function Boekhouding() {
    const { data: facturen, loading } = useSupabase<Factuur>('facturen', []);
    const { data: events } = useSupabase<DbEvent>('events', []);
    const { data: bonnen } = useSupabase<Bon>('bonnen', []);
    const { data: leveranciers } = useSupabase<Leverancier>('leveranciers', []);
    const [tab, setTab] = useState('wv');

    /* Alle aggregaties in één useMemo zodat we niet bij elke render alle
       facturen + events + bonnen her-itereren. Re-computed alleen als de
       brondata daadwerkelijk verandert. */
    const {
        omzet, openstaand, prognose, omzetChartData, statusPieData, topClients,
        btwMap, betaaldCount, openCount,
        /* Bon-aggregaten — uitgaven & voorbelasting BTW. */
        uitgavenChartData, totaalUitgaven, totaalVoorbelasting, voorbelastingLaag,
        voorbelastingHoog, expensesPerSupplier, btwSaldo,
    } = useMemo(function () {
        const statusKleuren: Record<string, string> = { betaald: 'var(--green)', verzonden: 'var(--brand)', concept: 'var(--muted)', vervallen: 'var(--red)' };
        const statusLabels: Record<string, string> = { betaald: 'Betaald', verzonden: 'Verzonden', concept: 'Concept', vervallen: 'Vervallen' };
        const yearStr = new Date().getFullYear().toString();

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

        /* ── Bon-aggregaten: uitgaven & voorbelasting BTW per maand ───── */
        const monthlyExpenses = new Array(12).fill(0);
        let totaalUitgaven = 0;
        let voorbelastingLaag = 0;
        let voorbelastingHoog = 0;
        const expensesPerSupplierMap: Record<string, { naam: string; totaal: number; bonCount: number }> = {};

        const supplierNameById: Record<number, string> = {};
        for (const l of leveranciers) supplierNameById[l.id] = l.naam;

        bonnen.forEach(function (b) {
            const totaal = Number(b.totaal_bedrag) || 0;
            totaalUitgaven += totaal;
            voorbelastingLaag += Number(b.btw_laag_bedrag) || 0;
            voorbelastingHoog += Number(b.btw_hoog_bedrag) || 0;

            if (b.datum && b.datum.startsWith(yearStr)) {
                const month = parseInt(b.datum.split('-')[1], 10) - 1;
                if (month >= 0 && month <= 11) monthlyExpenses[month] += totaal;
            }

            const supplierKey = b.leverancier_id ? supplierNameById[b.leverancier_id] || b.winkel : (b.winkel || 'Onbekend');
            if (!expensesPerSupplierMap[supplierKey]) {
                expensesPerSupplierMap[supplierKey] = { naam: supplierKey, totaal: 0, bonCount: 0 };
            }
            expensesPerSupplierMap[supplierKey].totaal += totaal;
            expensesPerSupplierMap[supplierKey].bonCount += 1;
        });

        const uitgavenChartData = MAANDEN_KORT.map(function (naam: string, i: number) {
            return { naam, uitgaven: Math.round(monthlyExpenses[i]), omzet: omzetChartData[i].omzet };
        });

        const expensesPerSupplier = Object.values(expensesPerSupplierMap)
            .sort(function (a, b) { return b.totaal - a.totaal; })
            .slice(0, 8);

        const totaalVoorbelasting = voorbelastingLaag + voorbelastingHoog;
        /* BTW-saldo: totaal te dragen BTW (uit facturen) − voorbelasting (uit bonnen). */
        const btwAfdracht = Object.values(btwMap).reduce(function (s, v) { return s + v.btw; }, 0);
        const btwSaldo = btwAfdracht - totaalVoorbelasting;

        return {
            omzet, openstaand, prognose, omzetChartData, statusPieData, topClients,
            btwMap, betaaldCount: betaald.length, openCount: open.length,
            uitgavenChartData, totaalUitgaven, totaalVoorbelasting, voorbelastingLaag,
            voorbelastingHoog, expensesPerSupplier, btwSaldo,
        };
    }, [facturen, events, bonnen, leveranciers]);

    if (loading) return <LoadingState label="Boekhouding laden" />;

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
                <button className={'tab-btn' + (tab === 'uitgaven' ? ' active' : '')} onClick={function () { setTab('uitgaven'); }}>Uitgaven</button>
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
                            <div className="stat-sub">{betaaldCount} facturen</div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-icon" style={{ background: 'rgba(245,158,11,.12)', color: 'var(--amber)' }}><Clock size={14} /></div>
                            <div className="stat-val">{fmt(openstaand)}</div>
                            <div className="stat-label">Openstaand</div>
                            <div className="stat-sub">{openCount} facturen</div>
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

            {tab === 'uitgaven' && (
                <PageSection>
                    <div className="stat-grid mb-24" style={{ marginTop: 16 }}>
                        <div className="stat-card">
                            <div className="stat-icon" style={{ background: 'rgba(239,68,68,.12)', color: 'var(--red)' }}><ReceiptIcon size={14} /></div>
                            <div className="stat-val">{fmt(totaalUitgaven)}</div>
                            <div className="stat-label">Totale uitgaven</div>
                            <div className="stat-sub">{bonnen.length} bonnen verwerkt</div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-icon" style={{ background: 'rgba(34,197,94,.12)', color: 'var(--green)' }}><Calculator size={14} /></div>
                            <div className="stat-val">{fmt(totaalVoorbelasting)}</div>
                            <div className="stat-label">Voorbelasting BTW</div>
                            <div className="stat-sub">terug te vragen</div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-icon" style={{ background: 'rgba(96,165,250,.12)', color: 'var(--blue)' }}><Percent size={14} /></div>
                            <div className="stat-val">{fmt(voorbelastingLaag)}</div>
                            <div className="stat-label">Voorbelasting 9%</div>
                            <div className="stat-sub">food/dranken</div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-icon" style={{ background: 'rgba(167,139,250,.12)', color: 'var(--purple)' }}><Percent size={14} /></div>
                            <div className="stat-val">{fmt(voorbelastingHoog)}</div>
                            <div className="stat-label">Voorbelasting 21%</div>
                            <div className="stat-sub">non-food</div>
                        </div>
                    </div>

                    <MetallicCard hover={false}>
                        <div className="panel-head">
                            <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <BarChart3 size={12} /> Omzet vs Uitgaven · {new Date().getFullYear()}
                            </h3>
                            <span style={{ fontSize: 12, color: 'var(--muted)' }}>maandelijks</span>
                        </div>
                        <div style={{ height: 280, padding: '16px 8px' }}>
                            <ResponsiveContainer width="100%" height="100%" minWidth={100} minHeight={100}>
                                <BarChart data={uitgavenChartData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                                    <XAxis dataKey="naam" tick={{ fill: 'var(--zinc)', fontSize: 10 }} axisLine={false} tickLine={false} />
                                    <YAxis tick={{ fill: 'var(--zinc)', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => v >= 1000 ? '€' + Math.round(v / 1000) + 'k' : '€' + v} />
                                    <Tooltip formatter={(v: number) => '€' + v.toLocaleString('nl-NL')} contentStyle={{ background: '#18181b', border: '1px solid rgba(255,191,0,.15)', borderRadius: 8, fontSize: 11 }} />
                                    <Legend iconSize={8} wrapperStyle={{ fontSize: 10, color: 'var(--zinc)' }} />
                                    <Bar dataKey="omzet" name="Omzet" fill="var(--brand)" radius={[4, 4, 0, 0]} />
                                    <Bar dataKey="uitgaven" name="Uitgaven" fill="var(--red)" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </MetallicCard>

                    <MetallicCard hover={false} className="mt-4">
                        <div className="panel-head">
                            <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <Truck size={12} style={{ color: 'var(--brand)' }} /> Top leveranciers · uitgaven
                            </h3>
                            <span style={{ fontSize: 12, color: 'var(--muted)' }}>{expensesPerSupplier.length} leveranciers</span>
                        </div>
                        {expensesPerSupplier.length === 0 && (
                            <div className="empty-state"><ReceiptIcon size={14} /><p>Nog geen bonnen verwerkt — scan een bon op de Inkoop-pagina.</p></div>
                        )}
                        {expensesPerSupplier.length > 0 && (
                            <div style={{ padding: '8px 16px 16px' }}>
                                {expensesPerSupplier.map(function (s, i) {
                                    const pct = totaalUitgaven > 0 ? (s.totaal / totaalUitgaven) * 100 : 0;
                                    return (
                                        <div key={s.naam} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                                            <span style={{ fontSize: 12, fontWeight: 900, color: 'var(--brand)', width: 20 }}>#{i + 1}</span>
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontSize: 13, fontWeight: 600 }}>{s.naam}</div>
                                                <div style={{ fontSize: 11, color: 'var(--muted)' }}>{s.bonCount} {s.bonCount === 1 ? 'bon' : 'bonnen'} · {pct.toFixed(1)}% van uitgaven</div>
                                            </div>
                                            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--red)' }}>−{fmt(s.totaal)}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </MetallicCard>
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
                            <thead><tr><th colSpan={4} style={{ paddingTop: 4, color: 'var(--brand)', fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase' }}>Te dragen BTW (uit facturen)</th></tr></thead>
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
                            <thead><tr><th colSpan={4} style={{ paddingTop: 16, color: 'var(--green)', fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase' }}>Voorbelasting (uit bonnen — terug te vragen)</th></tr></thead>
                            <tbody>
                                <tr><td><span className="pill" style={{ background: 'rgba(34,197,94,.12)', color: 'var(--green)' }}>9%</span></td><td colSpan={2} style={{ textAlign: 'right', color: 'var(--muted)' }}>food/dranken</td><td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(voorbelastingLaag)}</td></tr>
                                <tr><td><span className="pill" style={{ background: 'rgba(34,197,94,.12)', color: 'var(--green)' }}>21%</span></td><td colSpan={2} style={{ textAlign: 'right', color: 'var(--muted)' }}>non-food</td><td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(voorbelastingHoog)}</td></tr>
                            </tbody>
                        </table>
                        </div>
                        <div style={{ marginTop: 16, padding: 16, background: 'var(--bg)', borderRadius: 12, border: '1px solid var(--border)', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                            <div>
                                <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1 }}>Te dragen</div>
                                <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--brand)' }}>{fmt(Object.values(btwMap).reduce(function (sum, r) { return sum + r.btw; }, 0))}</div>
                            </div>
                            <div>
                                <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1 }}>Voorbelasting</div>
                                <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--green)' }}>−{fmt(totaalVoorbelasting)}</div>
                            </div>
                            <div style={{ borderLeft: '1px solid var(--border)', paddingLeft: 12 }}>
                                <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1 }}>Saldo BTW</div>
                                <div style={{ fontSize: 20, fontWeight: 700, color: btwSaldo >= 0 ? 'var(--brand)' : 'var(--green)' }}>
                                    {btwSaldo >= 0 ? fmt(btwSaldo) : '+' + fmt(Math.abs(btwSaldo))}
                                </div>
                                <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>{btwSaldo >= 0 ? 'aan Belastingdienst' : 'terug te vorderen'}</div>
                            </div>
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
