/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';
import { Suspense, useState, useMemo, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useSupabase, useSettings } from '@/lib/useSupabase';
import { fmt, MAANDEN_KORT } from '@/lib/utils';
import {
    BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
    ComposedChart, Line, PieChart, Pie, Legend,
} from 'recharts';
import EmptyState from '@/components/EmptyState';
import { LoadingState } from '@/components/LoadingState';
import PageHeader from '@/components/PageHeader';
import PageSection from '@/components/PageSection';
import MetallicCard from '@/components/MetallicCard';
import {
    BarChart3, Calculator, ChevronLeft, ChevronRight, Clock, Coins, Crosshair,
    Euro, Flame, LineChart, Lock, Percent, PieChart as PieChartIcon, Receipt as ReceiptIcon,
    Star, Truck, UserCog, Users,
} from 'lucide-react';
import PageGuideNote from '@/components/PageGuideNote';
import TransportBlock from '@/components/TransportBlock';
import type { Offerte, Gerecht, InventoryItem, TimeLog, Factuur, Event as DbEvent, Bon } from '@/types';
import { calcDishCostPP } from '@/lib/costCalculations';

interface Leverancier { id: number; naam: string; type?: string }

type Tab = 'dashboard' | 'wv' | 'uitgaven' | 'btw' | 'clients';
const TAB_LABELS: Record<Tab, string> = {
    dashboard: 'Dashboard',
    wv: 'Winst & Verlies',
    uitgaven: 'Uitgaven',
    btw: 'BTW',
    clients: 'Top Klanten',
};
const TAB_ORDER: Tab[] = ['dashboard', 'wv', 'uitgaven', 'btw', 'clients'];

function parseTab(value: string | null): Tab {
    if (value === 'wv' || value === 'uitgaven' || value === 'btw' || value === 'clients') return value;
    return 'dashboard';
}

export default function FinancienPage() {
    return (
        <Suspense fallback={<LoadingState label="Financiën laden" />}>
            <FinancienInner />
        </Suspense>
    );
}

function FinancienInner() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const tabParam = searchParams.get('tab');
    const [tab, setTab] = useState<Tab>(parseTab(tabParam));

    // Sync URL ↔ state
    useEffect(() => {
        setTab(parseTab(searchParams.get('tab')));
    }, [searchParams]);

    function selectTab(t: Tab) {
        setTab(t);
        const params = new URLSearchParams(searchParams.toString());
        if (t === 'dashboard') params.delete('tab'); else params.set('tab', t);
        const qs = params.toString();
        router.replace(qs ? `/financien?${qs}` : '/financien', { scroll: false });
    }

    // Data sources — alle tabs delen deze
    const { data: offertes, loading: offertesLoading } = useSupabase<Offerte>('offertes', []);
    const { data: facturen, loading: facturenLoading } = useSupabase<Factuur>('facturen', []);
    const { data: events } = useSupabase<DbEvent>('events', []);
    const { data: bonnen } = useSupabase<Bon>('bonnen', []);
    const { data: leveranciers } = useSupabase<Leverancier>('leveranciers', []);
    const { data: gerechtenData } = useSupabase<Gerecht>('gerechten', []);
    const { data: inventoryData } = useSupabase<InventoryItem>('inventory', []);
    const { data: urenLogs } = useSupabase<TimeLog>('time_logs', []);
    const { settings: _settings } = useSettings();

    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
    const LABOR_COST_PER_HOUR = 35.00;

    /* ── Forecast/Dashboard data: P&L op basis van GEACCEPTEERDE offertes + uren ── */
    const forecast = useMemo(function () {
        if (!offertes.length) return { months: [] as any[], totalOmzet: 0, totalNetto: 0, overalMarge: 0, totalFoodcost: 0, totalLabor: 0 };

        const monthsMap: Record<string, any> = {};
        for (let i = 1; i <= 12; i++) {
            const mStr = String(i).padStart(2, '0');
            monthsMap[mStr] = {
                monthNum: i,
                monthName: new Date(selectedYear, i - 1, 1).toLocaleString('nl-NL', { month: 'short' }),
                omzet: 0, foodcost: 0, laborHours: 0, laborCost: 0, nettoWinst: 0, offerteCount: 0,
            };
        }

        const validOffertes = offertes.filter((o: any) => ['goedgekeurd', 'geaccepteerd', 'voltooid'].includes(o.status || '') && (o.datum || '').startsWith(String(selectedYear)));
        validOffertes.forEach(function (offerte: any) {
            const mStr = offerte.datum.split('-')[1];
            if (!monthsMap[mStr]) return;
            const gasten = offerte.aantal_gasten || (offerte.items && offerte.items[0] ? offerte.items[0].qty : 0) || 0;
            const prijsPP = offerte.basis_prijs_pp || 0;
            const vk = (Array.isArray(offerte.vaste_kosten) ? offerte.vaste_kosten : []).reduce((s: number, k: any) => s + (parseFloat(k.bedrag) || 0), 0);
            const omzet = (gasten * prijsPP) + vk;
            let foodcostTotaal = 0;
            // menu_selectie kan drie shapes hebben in de praktijk:
            //  - legacy array van objects: [{gerecht_naam}, ...]
            //  - object met arrays van objects: {voorgerecht: [{gerecht_naam}, ...]}
            //  - object met arrays van strings: {voorgerecht: ["Pinsa", "Carpaccio"]}  ← huidig in productie-DB
            // De laatste vorm wordt gebruikt door zowel handmatige selectie als AI Wizard.
            const ms = offerte.menu_selectie;
            const menuOpties: any[] = Array.isArray(ms)
                ? ms
                : (ms && typeof ms === 'object' ? Object.values(ms).flat() : []);
            menuOpties.forEach(function (sel: any) {
                const naam = typeof sel === 'string'
                    ? sel
                    : (sel && (sel.gerecht_naam || sel.naam)) || '';
                if (naam) {
                    foodcostTotaal += calcDishCostPP(gerechtenData as any[], inventoryData as any, naam) * gasten;
                }
            });
            monthsMap[mStr].omzet += omzet;
            monthsMap[mStr].foodcost += foodcostTotaal;
            monthsMap[mStr].offerteCount += 1;
        });

        const completedLogs = urenLogs.filter((l: any) => (l.status === 'completed' || l.status === 'signed') && (l.start_time || '').startsWith(String(selectedYear)));
        completedLogs.forEach(function (log: any) {
            const start = new Date(log.start_time);
            const end = new Date(log.end_time);
            const hours = Math.max(0, (end.getTime() - start.getTime()) / 3600000);
            const mStr = String(start.getMonth() + 1).padStart(2, '0');
            if (monthsMap[mStr]) {
                // Gebruik per-log uurtarief_snapshot (team-uren systeem). Bestaande
                // logs zonder snapshot vallen terug op LABOR_COST_PER_HOUR default.
                const rate = typeof log.uurtarief_snapshot === 'number' && log.uurtarief_snapshot > 0
                    ? log.uurtarief_snapshot
                    : LABOR_COST_PER_HOUR;
                monthsMap[mStr].laborHours += hours;
                monthsMap[mStr].laborCost += (hours * rate);
            }
        });

        let totalOmzet = 0, totalFoodcost = 0, totalLabor = 0, totalNetto = 0;
        const monthsArr = Object.values(monthsMap).map(function (m: any) {
            m.nettoWinst = m.omzet - m.foodcost - m.laborCost;
            m.margePct = m.omzet > 0 ? (m.nettoWinst / m.omzet) * 100 : 0;
            totalOmzet += m.omzet;
            totalFoodcost += m.foodcost;
            totalLabor += m.laborCost;
            totalNetto += m.nettoWinst;
            return m;
        });

        return {
            months: monthsArr,
            totalOmzet, totalFoodcost, totalLabor, totalNetto,
            overalMarge: totalOmzet > 0 ? (totalNetto / totalOmzet) * 100 : 0,
        };
    }, [offertes, gerechtenData, inventoryData, urenLogs, selectedYear]);

    /* ── Realisatie-data: van facturen + bonnen ── */
    const realisatie = useMemo(function () {
        const statusKleuren: Record<string, string> = { betaald: 'var(--green)', verzonden: 'var(--brand)', concept: 'var(--muted)', vervallen: 'var(--red)' };
        const statusLabels: Record<string, string> = { betaald: 'Betaald', verzonden: 'Verzonden', concept: 'Concept', vervallen: 'Vervallen' };
        const yearStr = new Date().getFullYear().toString();

        const betaald = facturen.filter(function (f) { return f.status === 'betaald'; });
        const open = facturen.filter(function (f) { return f.status !== 'betaald' && f.status !== 'geannuleerd'; });

        let omzet = 0;
        betaald.forEach(function (f) { (f.items || []).forEach(function (item: any) { omzet += (item.qty || 0) * (item.prijs || 0); }); });
        let openstaand = 0;
        open.forEach(function (f) { (f.items || []).forEach(function (item: any) { openstaand += (item.qty || 0) * (item.prijs || 0); }); });
        let prognose = 0;
        events.forEach(function (e) { if (e.status === 'confirmed' || e.status === 'optie') prognose += (e.guests || 0) * (e.ppp || 0); });

        const monthlyData = new Array(12).fill(0);
        betaald.forEach(function (f) {
            if (!f.datum || !f.datum.startsWith(yearStr)) return;
            const month = parseInt(f.datum.split('-')[1], 10) - 1;
            (f.items || []).forEach(function (item: any) { monthlyData[month] += (item.qty || 0) * (item.prijs || 0); });
        });
        let cumulative = 0;
        const omzetChartData = MAANDEN_KORT.map(function (naam: string, i: number) {
            cumulative += monthlyData[i];
            return { naam, omzet: Math.round(monthlyData[i]), cumulatief: Math.round(cumulative) };
        });

        const statusCounts: Record<string, number> = {};
        facturen.forEach(function (f) { const s = f.status || 'onbekend'; statusCounts[s] = (statusCounts[s] || 0) + 1; });
        const statusPieData = Object.keys(statusCounts).map(function (s) {
            return { name: statusLabels[s] || s, value: statusCounts[s], color: statusKleuren[s] || 'var(--purple)' };
        }).filter(function (d) { return d.value > 0; });

        const clientTotals: Record<string, number> = {};
        betaald.forEach(function (f) {
            const naam = f.client_naam || 'Onbekend';
            if (!clientTotals[naam]) clientTotals[naam] = 0;
            (f.items || []).forEach(function (item: any) { clientTotals[naam] += (item.qty || 0) * (item.prijs || 0); });
        });
        const topClients = Object.keys(clientTotals).map(function (naam) { return { naam, omzet: clientTotals[naam] }; }).sort(function (a, b) { return b.omzet - a.omzet; }).slice(0, 5);

        const btwMap: Record<string, { netto: number; btw: number }> = {};
        facturen.forEach(function (f) {
            (f.items || []).forEach(function (item: any) {
                const pct = item.btw || 0;
                const line = (item.qty || 0) * (item.prijs || 0);
                const btwBedrag = line * (pct / 100);
                if (!btwMap[pct]) btwMap[pct] = { netto: 0, btw: 0 };
                btwMap[pct].netto += line;
                btwMap[pct].btw += btwBedrag;
            });
        });

        const monthlyExpenses = new Array(12).fill(0);
        let totaalUitgaven = 0, voorbelastingLaag = 0, voorbelastingHoog = 0;
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
            if (!expensesPerSupplierMap[supplierKey]) expensesPerSupplierMap[supplierKey] = { naam: supplierKey, totaal: 0, bonCount: 0 };
            expensesPerSupplierMap[supplierKey].totaal += totaal;
            expensesPerSupplierMap[supplierKey].bonCount += 1;
        });
        const uitgavenChartData = MAANDEN_KORT.map(function (naam: string, i: number) {
            return { naam, uitgaven: Math.round(monthlyExpenses[i]), omzet: omzetChartData[i].omzet };
        });
        const expensesPerSupplier = Object.values(expensesPerSupplierMap).sort(function (a, b) { return b.totaal - a.totaal; }).slice(0, 8);
        const totaalVoorbelasting = voorbelastingLaag + voorbelastingHoog;
        const btwAfdracht = Object.values(btwMap).reduce(function (s, v) { return s + v.btw; }, 0);
        const btwSaldo = btwAfdracht - totaalVoorbelasting;

        return {
            omzet, openstaand, prognose, omzetChartData, statusPieData, topClients,
            btwMap, betaaldCount: betaald.length, openCount: open.length,
            uitgavenChartData, totaalUitgaven, totaalVoorbelasting, voorbelastingLaag,
            voorbelastingHoog, expensesPerSupplier, btwSaldo,
        };
    }, [facturen, events, bonnen, leveranciers]);

    const currentMonthStr = String(new Date().getMonth() + 1).padStart(2, '0');
    const currentMonthData = forecast.months.find((m: any) => String(m.monthNum).padStart(2, '0') === currentMonthStr) || { omzet: 0, foodcost: 0, laborHours: 0, laborCost: 0, nettoWinst: 0, margePct: 0, offerteCount: 0 };
    const maxOmzet = Math.max(...forecast.months.map((m: any) => m.omzet), 1000);

    if (offertesLoading || facturenLoading) {
        return <LoadingState label="Financiën laden" />;
    }

    const noData = forecast.totalOmzet === 0 && forecast.totalFoodcost === 0 && forecast.totalLabor === 0 && facturen.length === 0;
    if (noData) {
        return (
            <div style={{ animation: 'fadeIn 0.4s ease-out' }}>
                <PageHeader title="Financiën" />
                <EmptyState page="/financien" />
            </div>
        );
    }

    return (
        <div className="mobile-safe-bottom" style={{ animation: 'fadeIn 0.4s ease-out' }}>
            <PageHeader
                title="Financiën"
                description={tab === 'dashboard' ? `Live Profit & Loss Dashboard over ${selectedYear}` : `Boekhouding · ${TAB_LABELS[tab]}`}
                actions={tab === 'dashboard' ? <>
                    <button onClick={() => setSelectedYear(selectedYear - 1)} className="btn btn-ghost btn-sm" aria-label="Vorig jaar"><ChevronLeft size={14} /></button>
                    <span style={{ fontWeight: 700, fontSize: 14, fontVariantNumeric: 'tabular-nums', minWidth: 48, textAlign: 'center' }}>{selectedYear}</span>
                    <button onClick={() => setSelectedYear(selectedYear + 1)} className="btn btn-ghost btn-sm" aria-label="Volgend jaar"><ChevronRight size={14} /></button>
                </> : undefined}
            />

            <PageGuideNote
                id="financien"
                accent="#10b981"
                intro="Live winst-en-verliesrekening uit je echte events — geen Excel-werk meer aan het eind van het kwartaal."
                actions={[
                    { lead: 'Wissel jaar via de pijltjes', text: 'om historische omzet en kosten te vergelijken.' },
                    { lead: 'Wissel tabbladen', text: '— Dashboard voor de grote lijn, Uitgaven en BTW voor de boekhouder-details.' },
                    { lead: 'Top-klanten en marge-mix', text: 'tonen welke evenementen écht renderen — niet alleen de grootste in omzet.' },
                ]}
            />

            <div className="tab-bar">
                {TAB_ORDER.map(t => (
                    <button key={t} className={'tab-btn' + (tab === t ? ' active' : '')} onClick={() => selectTab(t)}>
                        {TAB_LABELS[t]}
                    </button>
                ))}
            </div>

            {/* ── DASHBOARD: forecast P&L op offerte-basis ── */}
            {tab === 'dashboard' && (
                <>
                    <PageSection>
                        <div style={{ marginBottom: 20 }}>
                            <TransportBlock year={selectedYear} />
                        </div>
                        <div className="stat-grid" style={{ marginBottom: 30 }}>
                            <div className="stat-card uren-glass" style={{ background: 'rgba(255,255,255,0.02)' }}>
                                <div className="stat-icon" style={{ background: 'rgba(255,140,0,.15)', color: 'var(--brand)' }}><Coins size={14} /></div>
                                <div className="stat-val">{fmt(forecast.totalOmzet)}</div>
                                <div className="stat-label">Totale Omzet (Geaccepteerd)</div>
                            </div>
                            <div className="stat-card uren-glass" style={{ background: 'rgba(255,255,255,0.02)' }}>
                                <div className="stat-icon" style={{ background: 'rgba(239,68,68,.15)', color: 'var(--red)' }}><Flame size={14} /></div>
                                <div className="stat-val">{fmt(forecast.totalFoodcost)}</div>
                                <div className="stat-label">Foodcost Theoretisch</div>
                            </div>
                            <div className="stat-card uren-glass" style={{ background: 'rgba(255,255,255,0.02)' }}>
                                <div className="stat-icon" style={{ background: 'rgba(167,139,250,.15)', color: 'var(--purple)' }}><UserCog size={14} /></div>
                                <div className="stat-val">{fmt(forecast.totalLabor)}</div>
                                <div className="stat-label">Personeelskosten</div>
                            </div>
                            <div className="stat-card uren-glass" style={{ background: 'rgba(34,197,94,.15)', border: '1px solid rgba(34,197,94,.3)' }}>
                                <div className="stat-icon" style={{ background: 'rgba(34,197,94,.2)', color: 'var(--green)' }}><Lock size={14} /></div>
                                <div className="stat-val" style={{ color: 'var(--green)' }}>{fmt(forecast.totalNetto)}</div>
                                <div className="stat-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span>Netto Winst</span>
                                    <span style={{ fontWeight: 800 }}>{forecast.overalMarge.toFixed(1)}%</span>
                                </div>
                            </div>
                        </div>
                    </PageSection>

                    <PageSection>
                        <div className="grid gap-5 grid-cols-1 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]" style={{ alignItems: 'flex-start' }}>
                            <div className="panel uren-glass" style={{ padding: 24, overflow: 'hidden' }}>
                                <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <BarChart3 size={14} style={{ color: 'var(--brand)' }} /> Cashflow per maand (forecast)
                                </h3>
                                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 260, paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>
                                    {forecast.months.map((m: any, idx: number) => {
                                        const heightPct = (m.omzet / maxOmzet) * 100;
                                        const profitHeightPct = m.omzet > 0 ? (m.nettoWinst / m.omzet) * 100 : 0;
                                        return (
                                            <div key={idx} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                                                <div style={{ width: '100%', height: 200, display: 'flex', alignItems: 'flex-end', position: 'relative' }}>
                                                    <div style={{ position: 'absolute', bottom: 0, left: '10%', right: '10%', height: heightPct + '%', background: 'rgba(255,255,255,0.05)', borderRadius: '6px 6px 0 0', transition: 'height 1s cubic-bezier(0.16, 1, 0.3, 1)', zIndex: 1 }} />
                                                    <div style={{ position: 'absolute', bottom: 0, left: '10%', right: '10%', height: (heightPct * (profitHeightPct / 100)) + '%', background: profitHeightPct > 60 ? 'linear-gradient(0deg, var(--green), #4ade80)' : profitHeightPct > 30 ? 'linear-gradient(0deg, var(--brand), #fbbf24)' : 'linear-gradient(0deg, var(--red), #ff7070)', borderRadius: '6px 6px 0 0', transition: 'height 1s cubic-bezier(0.16, 1, 0.3, 1) 0.2s', zIndex: 2, boxShadow: '0 0 10px rgba(0,0,0,0.5)' }} />
                                                </div>
                                                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>{m.monthName}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'center', gap: 24, marginTop: 16, fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><div style={{ width: 12, height: 12, background: 'rgba(255,255,255,0.05)', borderRadius: 2 }} /> Bruto Omzet</div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><div style={{ width: 12, height: 12, background: 'var(--green)', borderRadius: 2 }} /> Netto Winst</div>
                                </div>
                            </div>

                            <div className="panel uren-glass" style={{ padding: 24 }}>
                                <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <Crosshair size={14} style={{ color: 'var(--brand)' }} /> Focus huidige maand
                                </h3>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                    <div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
                                            <span style={{ color: 'var(--muted)' }}>Omzet ({currentMonthData.offerteCount} events)</span>
                                            <span style={{ fontWeight: 800 }}>{fmt(currentMonthData.omzet)}</span>
                                        </div>
                                        <div style={{ height: 6, background: 'rgba(255,255,255,0.05)', borderRadius: 4, overflow: 'hidden' }}>
                                            <div style={{ height: '100%', width: '100%', background: 'var(--text)' }} />
                                        </div>
                                    </div>
                                    <div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
                                            <span style={{ color: 'var(--muted)' }}>Foodcost (Theoretisch)</span>
                                            <span style={{ fontWeight: 800, color: 'var(--red)' }}>- {fmt(currentMonthData.foodcost)}</span>
                                        </div>
                                        <div style={{ height: 6, background: 'rgba(255,255,255,0.05)', borderRadius: 4, overflow: 'hidden' }}>
                                            <div style={{ height: '100%', width: (currentMonthData.omzet ? (currentMonthData.foodcost / currentMonthData.omzet) * 100 : 0) + '%', background: 'var(--red)' }} />
                                        </div>
                                    </div>
                                    <div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
                                            <span style={{ color: 'var(--muted)' }}>Arbeid ({currentMonthData.laborHours.toFixed(0)} uur)</span>
                                            <span style={{ fontWeight: 800, color: 'var(--purple)' }}>- {fmt(currentMonthData.laborCost)}</span>
                                        </div>
                                        <div style={{ height: 6, background: 'rgba(255,255,255,0.05)', borderRadius: 4, overflow: 'hidden' }}>
                                            <div style={{ height: '100%', width: (currentMonthData.omzet ? (currentMonthData.laborCost / currentMonthData.omzet) * 100 : 0) + '%', background: 'var(--purple)' }} />
                                        </div>
                                    </div>
                                    <div style={{ marginTop: 10, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)' }}>Netto</span>
                                            <span style={{ fontSize: 24, fontWeight: 800, color: currentMonthData.nettoWinst > 0 ? 'var(--green)' : 'var(--text)' }}>
                                                {fmt(currentMonthData.nettoWinst)}
                                            </span>
                                        </div>
                                        <div style={{ textAlign: 'right', fontSize: 12, fontWeight: 700, color: currentMonthData.margePct >= 60 ? 'var(--green)' : currentMonthData.margePct >= 30 ? 'var(--brand)' : 'var(--red)' }}>
                                            Marge: {currentMonthData.margePct.toFixed(1)}%
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </PageSection>
                </>
            )}

            {/* ── WINST & VERLIES: realisatie uit facturen ── */}
            {tab === 'wv' && (
                <PageSection>
                    <div className="stat-grid mb-24" style={{ marginTop: 16 }}>
                        <div className="stat-card">
                            <div className="stat-icon" style={{ background: 'rgba(34,197,94,.12)', color: 'var(--green)' }}><Euro size={14} /></div>
                            <div className="stat-val">{fmt(realisatie.omzet)}</div>
                            <div className="stat-label">Omzet (betaald)</div>
                            <div className="stat-sub">{realisatie.betaaldCount} facturen</div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-icon" style={{ background: 'rgba(245,158,11,.12)', color: 'var(--amber)' }}><Clock size={14} /></div>
                            <div className="stat-val">{fmt(realisatie.openstaand)}</div>
                            <div className="stat-label">Openstaand</div>
                            <div className="stat-sub">{realisatie.openCount} facturen</div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-icon" style={{ background: 'rgba(167,139,250,.12)', color: 'var(--purple)' }}><LineChart size={14} /></div>
                            <div className="stat-val">{fmt(realisatie.prognose)}</div>
                            <div className="stat-label">Prognose (events)</div>
                            <div className="stat-sub">{events.length} events</div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-icon" style={{ background: 'rgba(255,191,0,.12)', color: 'var(--brand)' }}><Percent size={14} /></div>
                            <div className="stat-val">{realisatie.omzet + realisatie.openstaand > 0 ? Math.round((realisatie.omzet / (realisatie.omzet + realisatie.openstaand)) * 100) + '%' : '—'}</div>
                            <div className="stat-label">Betaald Ratio</div>
                            <div className="stat-sub">{facturen.length} facturen totaal</div>
                        </div>
                    </div>

                    <div className="analytics-grid">
                        <MetallicCard hover={false}>
                            <div className="panel-head">
                                <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <BarChart3 size={12} style={{ color: 'var(--brand)' }} /> Maandomzet & Cumulatief
                                </h3>
                                <span style={{ fontSize: 12, color: 'var(--muted)' }}>betaalde facturen</span>
                            </div>
                            <div className="panel-body" style={{ height: 200, marginTop: 12 }}>
                                <ResponsiveContainer width="100%" height="100%" minWidth={100} minHeight={100}>
                                    <ComposedChart data={realisatie.omzetChartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }} barCategoryGap="30%">
                                        <XAxis dataKey="naam" tick={{ fill: 'var(--zinc)', fontSize: 10 }} axisLine={false} tickLine={false} />
                                        <YAxis yAxisId="left" tick={{ fill: 'var(--zinc)', fontSize: 9 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => v >= 1000 ? '€' + Math.round(v / 1000) + 'k' : '€' + v} />
                                        <YAxis yAxisId="right" orientation="right" tick={{ fill: 'var(--zinc)', fontSize: 9 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => v >= 1000 ? '€' + Math.round(v / 1000) + 'k' : '€' + v} />
                                        <Tooltip formatter={(v: number, name: string) => ['€' + v.toLocaleString('nl-NL'), name === 'omzet' ? 'Maandomzet' : 'Cumulatief']} contentStyle={{ background: '#18181b', border: '1px solid rgba(255,191,0,.15)', borderRadius: 8, fontSize: 11 }} cursor={{ fill: 'rgba(255,191,0,.06)' }} />
                                        <Bar yAxisId="left" dataKey="omzet" radius={[4, 4, 0, 0]}>
                                            {realisatie.omzetChartData.map((d, i) => <Cell key={i} fill={d.omzet > 0 ? 'var(--brand)' : '#27272a'} />)}
                                        </Bar>
                                        <Line yAxisId="right" type="monotone" dataKey="cumulatief" stroke="var(--purple)" strokeWidth={2} dot={false} />
                                    </ComposedChart>
                                </ResponsiveContainer>
                            </div>
                        </MetallicCard>

                        {realisatie.statusPieData.length > 0 && (
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
                                            <Pie data={realisatie.statusPieData} dataKey="value" cx="45%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={3}>
                                                {realisatie.statusPieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                                            </Pie>
                                            <Tooltip formatter={(v: number, n: string) => [v + ' facturen', n]} contentStyle={{ background: '#18181b', border: '1px solid rgba(255,191,0,.15)', borderRadius: 8, fontSize: 11 }} />
                                            <Legend iconSize={8} wrapperStyle={{ fontSize: 10, color: 'var(--zinc)' }} />
                                        </PieChart>
                                    </ResponsiveContainer>
                                </div>
                            </MetallicCard>
                        )}
                    </div>
                </PageSection>
            )}

            {/* ── UITGAVEN: bonnen + leveranciers ── */}
            {tab === 'uitgaven' && (
                <PageSection>
                    <div className="stat-grid mb-24" style={{ marginTop: 16 }}>
                        <div className="stat-card">
                            <div className="stat-icon" style={{ background: 'rgba(239,68,68,.12)', color: 'var(--red)' }}><ReceiptIcon size={14} /></div>
                            <div className="stat-val">{fmt(realisatie.totaalUitgaven)}</div>
                            <div className="stat-label">Totale uitgaven</div>
                            <div className="stat-sub">{bonnen.length} bonnen verwerkt</div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-icon" style={{ background: 'rgba(34,197,94,.12)', color: 'var(--green)' }}><Calculator size={14} /></div>
                            <div className="stat-val">{fmt(realisatie.totaalVoorbelasting)}</div>
                            <div className="stat-label">Voorbelasting BTW</div>
                            <div className="stat-sub">terug te vragen</div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-icon" style={{ background: 'rgba(96,165,250,.12)', color: 'var(--blue)' }}><Percent size={14} /></div>
                            <div className="stat-val">{fmt(realisatie.voorbelastingLaag)}</div>
                            <div className="stat-label">Voorbelasting 9%</div>
                            <div className="stat-sub">food/dranken</div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-icon" style={{ background: 'rgba(167,139,250,.12)', color: 'var(--purple)' }}><Percent size={14} /></div>
                            <div className="stat-val">{fmt(realisatie.voorbelastingHoog)}</div>
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
                                <BarChart data={realisatie.uitgavenChartData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
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
                            <span style={{ fontSize: 12, color: 'var(--muted)' }}>{realisatie.expensesPerSupplier.length} leveranciers</span>
                        </div>
                        {realisatie.expensesPerSupplier.length === 0 && (
                            <div className="empty-state"><ReceiptIcon size={14} /><p>Nog geen bonnen verwerkt — scan een bon op de Inkoop-pagina.</p></div>
                        )}
                        {realisatie.expensesPerSupplier.length > 0 && (
                            <div style={{ padding: '8px 16px 16px' }}>
                                {realisatie.expensesPerSupplier.map(function (s, i) {
                                    const pct = realisatie.totaalUitgaven > 0 ? (s.totaal / realisatie.totaalUitgaven) * 100 : 0;
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

            {/* ── BTW: te dragen + voorbelasting + saldo ── */}
            {tab === 'btw' && (
                <PageSection>
                    <MetallicCard hover={false} className="mt-4">
                        <div className="panel-head"><h3>BTW Overzicht</h3></div>
                        <div className="panel-body">
                            {Object.keys(realisatie.btwMap).length === 0 && <div className="empty-state"><Calculator size={14} /><p>Geen BTW data beschikbaar</p></div>}
                            <div className="tbl-wrap">
                                <table className="tbl">
                                    <thead><tr><th colSpan={4} style={{ paddingTop: 4, color: 'var(--brand)', fontSize: 13, fontWeight: 600, textTransform: 'none', letterSpacing: 0 }}>Te dragen BTW (uit facturen)</th></tr></thead>
                                    <thead><tr><th>BTW %</th><th style={{ textAlign: 'right' }}>Netto Omzet</th><th style={{ textAlign: 'right' }}>BTW Bedrag</th><th style={{ textAlign: 'right' }}>Bruto</th></tr></thead>
                                    <tbody>
                                        {Object.keys(realisatie.btwMap).sort().map(function (pct) {
                                            const row = realisatie.btwMap[pct];
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
                                    <thead><tr><th colSpan={4} style={{ paddingTop: 16, color: 'var(--green)', fontSize: 13, fontWeight: 600, textTransform: 'none', letterSpacing: 0 }}>Voorbelasting (uit bonnen — terug te vragen)</th></tr></thead>
                                    <tbody>
                                        <tr><td><span className="pill" style={{ background: 'rgba(34,197,94,.12)', color: 'var(--green)' }}>9%</span></td><td colSpan={2} style={{ textAlign: 'right', color: 'var(--muted)' }}>food/dranken</td><td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(realisatie.voorbelastingLaag)}</td></tr>
                                        <tr><td><span className="pill" style={{ background: 'rgba(34,197,94,.12)', color: 'var(--green)' }}>21%</span></td><td colSpan={2} style={{ textAlign: 'right', color: 'var(--muted)' }}>non-food</td><td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(realisatie.voorbelastingHoog)}</td></tr>
                                    </tbody>
                                </table>
                            </div>
                            <div style={{ marginTop: 16, padding: 16, background: 'var(--bg)', borderRadius: 12, border: '1px solid var(--border)', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                                <div>
                                    <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 500 }}>Te dragen</div>
                                    <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--brand)', marginTop: 2 }}>{fmt(Object.values(realisatie.btwMap).reduce(function (sum, r) { return sum + r.btw; }, 0))}</div>
                                </div>
                                <div>
                                    <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 500 }}>Voorbelasting</div>
                                    <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--green)', marginTop: 2 }}>−{fmt(realisatie.totaalVoorbelasting)}</div>
                                </div>
                                <div style={{ borderLeft: '1px solid var(--border)', paddingLeft: 12 }}>
                                    <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 500 }}>Saldo BTW</div>
                                    <div style={{ fontSize: 20, fontWeight: 700, color: realisatie.btwSaldo >= 0 ? 'var(--brand)' : 'var(--green)', marginTop: 2 }}>
                                        {realisatie.btwSaldo >= 0 ? fmt(realisatie.btwSaldo) : '+' + fmt(Math.abs(realisatie.btwSaldo))}
                                    </div>
                                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{realisatie.btwSaldo >= 0 ? 'aan Belastingdienst' : 'terug te vorderen'}</div>
                                </div>
                            </div>
                        </div>
                    </MetallicCard>
                </PageSection>
            )}

            {/* ── TOP KLANTEN ── */}
            {tab === 'clients' && (
                <PageSection>
                    <MetallicCard hover={false} className="mt-4">
                        <div className="panel-head">
                            <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <Star size={12} style={{ color: 'var(--brand)' }} /> Top Klanten
                            </h3>
                            <span style={{ fontSize: 12, color: 'var(--muted)' }}>betaalde facturen</span>
                        </div>
                        {realisatie.topClients.length === 0 && <div className="empty-state"><Users size={14} /><p>Geen data beschikbaar</p></div>}
                        {realisatie.topClients.length > 0 && (
                            <>
                                <div style={{ height: 250, padding: '16px 0' }}>
                                    <ResponsiveContainer width="100%" height="100%" minWidth={100} minHeight={100}>
                                        <BarChart data={realisatie.topClients} layout="vertical" margin={{ top: 4, right: 32, left: 80, bottom: 4 }} barCategoryGap="25%">
                                            <XAxis type="number" tick={{ fill: 'var(--zinc)', fontSize: 9 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => v >= 1000 ? '€' + Math.round(v / 1000) + 'k' : '€' + v} />
                                            <YAxis type="category" dataKey="naam" tick={{ fill: '#f4f4f5', fontSize: 11, fontWeight: 600 }} axisLine={false} tickLine={false} width={76} />
                                            <Tooltip formatter={(v: number) => ['€' + v.toLocaleString('nl-NL'), 'Omzet']} contentStyle={{ background: '#18181b', border: '1px solid rgba(255,191,0,.15)', borderRadius: 8, fontSize: 11 }} cursor={{ fill: 'rgba(255,191,0,.06)' }} />
                                            <Bar dataKey="omzet" radius={[0, 4, 4, 0]} fill="var(--brand)" />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                                <div style={{ padding: '0 16px 16px' }}>
                                    {realisatie.topClients.map(function (c, i) {
                                        const pct = realisatie.omzet > 0 ? (c.omzet / realisatie.omzet) * 100 : 0;
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
