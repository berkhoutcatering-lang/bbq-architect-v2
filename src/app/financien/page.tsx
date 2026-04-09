/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';
import { useState, useMemo } from 'react';
import { useSupabase, useSettings } from '@/lib/useSupabase';
import { fmt, addDays } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import EmptyState from '@/components/EmptyState';
import { BarChart3, ChevronLeft, ChevronRight, Coins, Crosshair, Flame, Lock, UserCog } from 'lucide-react';
import type { Offerte, Gerecht, InventoryItem, TimeLog } from '@/types';

function getInvPrice(inventoryData: InventoryItem[], naam: string) {
    if (!naam) return null;
    const inv = inventoryData.find(function (i) { return i.naam && i.naam.toLowerCase() === String(naam).toLowerCase(); });
    return inv ? { price: inv.purchase_price || 0, unit: inv.unit || 'kg', yield_factor: inv.yield_factor || 1.0 } : null;
}

function calcDishCostPP(gerechtenData: any[], inventoryData: InventoryItem[], gerechtNaam: string) {
    if (!gerechtNaam) return 0;
    const gerecht = gerechtenData.find(function (g: any) { return g.naam === gerechtNaam; });
    if (!gerecht || !gerecht.ingredient_costs) return 0;

    const costsArray = Array.isArray(gerecht.ingredient_costs) ? gerecht.ingredient_costs : [];

    return costsArray.reduce(function (sum: number, item: any) {
        if (!item || !item.naam) return sum;
        const inv = getInvPrice(inventoryData, item.naam);
        const price = inv ? inv.price : 0;
        const yld = (item.yield || (inv ? inv.yield_factor : 1.0)) || 1.0;
        let unitFactor = 1;
        if (item.unit === 'g' && inv && inv.unit === 'kg') unitFactor = 0.001;
        if (item.unit === 'ml' && inv && inv.unit === 'L') unitFactor = 0.001;
        return sum + ((item.qty_pp || 0) * unitFactor / yld) * price;
    }, 0);
}

export default function Financien() {
    const { data: offertes, loading: offertesLoading } = useSupabase<Offerte>('offertes', []);
    const { data: gerechtenData } = useSupabase<Gerecht>('gerechten', []);
    const { data: inventoryData } = useSupabase<InventoryItem>('inventory', []);
    const { data: urenLogs } = useSupabase<TimeLog>('time_logs', []);
    const { settings } = useSettings();

    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
    const LABOR_COST_PER_HOUR = 35.00;

    const financialData = useMemo(function () {
        if (!offertes.length || !gerechtenData.length || !urenLogs.length) return { months: [] as any[], totalOmzet: 0, totalNetto: 0, overalMarge: 0, totalFoodcost: 0, totalLabor: 0 };

        const monthsMap: Record<string, any> = {};
        for (let i = 1; i <= 12; i++) {
            const mStr = String(i).padStart(2, '0');
            monthsMap[mStr] = {
                monthNum: i,
                monthName: new Date(selectedYear, i - 1, 1).toLocaleString('nl-NL', { month: 'short' }),
                omzet: 0,
                foodcost: 0,
                laborHours: 0,
                laborCost: 0,
                nettoWinst: 0,
                offerteCount: 0
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
            const menuOpties = Array.isArray(offerte.menu_selectie) ? offerte.menu_selectie : [];
            menuOpties.forEach(function (sel: any) {
                if (sel && (sel.gerecht_naam || sel.naam)) {
                    foodcostTotaal += calcDishCostPP(gerechtenData as any[], inventoryData, sel.gerecht_naam || sel.naam) * gasten;
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
                monthsMap[mStr].laborHours += hours;
                monthsMap[mStr].laborCost += (hours * LABOR_COST_PER_HOUR);
            }
        });

        let totalOmzet = 0;
        let totalFoodcost = 0;
        let totalLabor = 0;
        let totalNetto = 0;

        const monthsArr = Object.values(monthsMap).map(function (m: any) {
            m.nettoWinst = m.omzet - m.foodcost - m.laborCost;
            m.margePct = m.omzet > 0 ? (m.nettoWinst / m.omzet) * 100 : 0;

            totalOmzet += m.omzet;
            totalFoodcost += m.foodcost;
            totalLabor += m.laborCost;
            totalNetto += m.nettoWinst;
            return m;
        });

        const overalMarge = totalOmzet > 0 ? (totalNetto / totalOmzet) * 100 : 0;

        return {
            months: monthsArr,
            totalOmzet,
            totalFoodcost,
            totalLabor,
            totalNetto,
            overalMarge
        };

    }, [offertes, gerechtenData, inventoryData, urenLogs, selectedYear]);

    const currentMonthStr = String(new Date().getMonth() + 1).padStart(2, '0');
    const currentMonthData = financialData.months.find((m: any) => String(m.monthNum).padStart(2, '0') === currentMonthStr) || { omzet: 0, foodcost: 0, laborHours: 0, laborCost: 0, nettoWinst: 0, margePct: 0, offerteCount: 0 };

    const maxOmzet = Math.max(...financialData.months.map((m: any) => m.omzet), 1000);

    if (offertesLoading) {
        return (
            <div className="min-h-screen bg-[#121215] flex items-center justify-center">
                <Flame className="w-8 h-8 text-[#c4a35a] animate-pulse" />
            </div>
        );
    }

    if (financialData.totalOmzet === 0 && financialData.totalFoodcost === 0 && financialData.totalLabor === 0) {
        return (
            <div style={{ animation: 'fadeIn 0.4s ease-out' }}>
                <div style={{ marginBottom: 20 }}>
                    <h1 style={{ fontSize: 24, fontWeight: 900, display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Lock size={14} style={{ color: 'var(--brand)' }} /> The Vault Analytics
                    </h1>
                </div>
                <EmptyState page="/financien" />
            </div>
        );
    }

    return (
        <div style={{ animation: 'fadeIn 0.4s ease-out' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <div>
                    <h1 style={{ fontSize: 24, fontWeight: 900, display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Lock size={14} style={{ color: 'var(--brand)' }} /> The Vault Analytics
                    </h1>
                    <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 4 }}>Live Profit & Loss Dashboard over {selectedYear}</p>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                    <button onClick={() => setSelectedYear(selectedYear - 1)} className="btn btn-ghost" aria-label="Vorig jaar"><ChevronLeft size={14} /></button>
                    <div style={{ background: 'var(--card)', padding: '8px 16px', borderRadius: 8, fontWeight: 800 }}>{selectedYear}</div>
                    <button onClick={() => setSelectedYear(selectedYear + 1)} className="btn btn-ghost" aria-label="Volgend jaar"><ChevronRight size={14} /></button>
                </div>
            </div>

            <div className="stat-grid" style={{ marginBottom: 30 }}>
                <div className="stat-card uren-glass" style={{ background: 'rgba(255,255,255,0.02)' }}>
                    <div className="stat-icon" style={{ background: 'rgba(255,140,0,.15)', color: 'var(--brand)' }}><Coins size={14} /></div>
                    <div className="stat-val">{fmt(financialData.totalOmzet)}</div>
                    <div className="stat-label">Totale Omzet (Geaccepteerd)</div>
                </div>
                <div className="stat-card uren-glass" style={{ background: 'rgba(255,255,255,0.02)' }}>
                    <div className="stat-icon" style={{ background: 'rgba(239,68,68,.15)', color: 'var(--red)' }}><Flame size={14} /></div>
                    <div className="stat-val">{fmt(financialData.totalFoodcost)}</div>
                    <div className="stat-label">Foodcost Theoretisch</div>
                </div>
                <div className="stat-card uren-glass" style={{ background: 'rgba(255,255,255,0.02)' }}>
                    <div className="stat-icon" style={{ background: 'rgba(167,139,250,.15)', color: 'var(--purple)' }}><UserCog size={14} /></div>
                    <div className="stat-val">{fmt(financialData.totalLabor)}</div>
                    <div className="stat-label">Personeelskosten</div>
                </div>
                <div className="stat-card uren-glass" style={{ background: 'rgba(34,197,94,.15)', border: '1px solid rgba(34,197,94,.3)' }}>
                    <div className="stat-icon" style={{ background: 'rgba(34,197,94,.2)', color: 'var(--green)' }}><Lock size={14} /></div>
                    <div className="stat-val" style={{ color: 'var(--green)' }}>{fmt(financialData.totalNetto)}</div>
                    <div className="stat-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>Netto Winst</span>
                        <span style={{ fontWeight: 800 }}>{financialData.overalMarge.toFixed(1)}%</span>
                    </div>
                </div>
            </div>

            <div className="grid gap-5 grid-cols-1 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]" style={{ alignItems: 'flex-start' }}>

                <div className="panel uren-glass" style={{ padding: 24, overflow: 'hidden' }}>
                    <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 24, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <BarChart3 size={14} style={{ color: 'var(--brand)' }} /> Cashflow per Maand
                    </h3>
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 260, paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>
                        {financialData.months.map((m: any, idx: number) => {
                            const heightPct = (m.omzet / maxOmzet) * 100;
                            const profitHeightPct = m.omzet > 0 ? (m.nettoWinst / m.omzet) * 100 : 0;

                            return (
                                <div key={idx} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                                    <div style={{ width: '100%', height: 200, display: 'flex', alignItems: 'flex-end', position: 'relative' }}>
                                        <div style={{
                                            position: 'absolute', bottom: 0, left: '10%', right: '10%', height: heightPct + '%',
                                            background: 'rgba(255,255,255,0.05)', borderRadius: '6px 6px 0 0',
                                            transition: 'height 1s cubic-bezier(0.16, 1, 0.3, 1)', zIndex: 1
                                        }}></div>
                                        <div style={{
                                            position: 'absolute', bottom: 0, left: '10%', right: '10%', height: (heightPct * (profitHeightPct / 100)) + '%',
                                            background: profitHeightPct > 60 ? 'linear-gradient(0deg, var(--green), #4ade80)' : profitHeightPct > 30 ? 'linear-gradient(0deg, var(--brand), #fbbf24)' : 'linear-gradient(0deg, var(--red), #fca5a5)',
                                            borderRadius: '6px 6px 0 0',
                                            transition: 'height 1s cubic-bezier(0.16, 1, 0.3, 1) 0.2s', zIndex: 2,
                                            boxShadow: '0 0 10px rgba(0,0,0,0.5)'
                                        }}></div>
                                    </div>
                                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>{m.monthName}</span>
                                </div>
                            );
                        })}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'center', gap: 24, marginTop: 16, fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><div style={{ width: 12, height: 12, background: 'rgba(255,255,255,0.05)', borderRadius: 2 }}></div> Bruto Omzet</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><div style={{ width: 12, height: 12, background: 'var(--green)', borderRadius: 2 }}></div> Netto Winst</div>
                    </div>
                </div>

                <div className="panel uren-glass" style={{ padding: 24 }}>
                    <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 24, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Crosshair size={14} style={{ color: 'var(--brand)' }} /> Focus Huidige Maand
                    </h3>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
                                <span style={{ color: 'var(--muted)' }}>Omzet ({currentMonthData.offerteCount} events)</span>
                                <span style={{ fontWeight: 800 }}>{fmt(currentMonthData.omzet)}</span>
                            </div>
                            <div style={{ height: 6, background: 'rgba(255,255,255,0.05)', borderRadius: 4, overflow: 'hidden' }}>
                                <div style={{ height: '100%', width: '100%', background: 'var(--text)' }}></div>
                            </div>
                        </div>

                        <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
                                <span style={{ color: 'var(--muted)' }}>Foodcost (Theoretisch)</span>
                                <span style={{ fontWeight: 800, color: 'var(--red)' }}>- {fmt(currentMonthData.foodcost)}</span>
                            </div>
                            <div style={{ height: 6, background: 'rgba(255,255,255,0.05)', borderRadius: 4, overflow: 'hidden' }}>
                                <div style={{ height: '100%', width: (currentMonthData.omzet ? (currentMonthData.foodcost / currentMonthData.omzet) * 100 : 0) + '%', background: 'var(--red)' }}></div>
                            </div>
                        </div>

                        <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
                                <span style={{ color: 'var(--muted)' }}>Arbeid ({currentMonthData.laborHours.toFixed(0)} uur)</span>
                                <span style={{ fontWeight: 800, color: 'var(--purple)' }}>- {fmt(currentMonthData.laborCost)}</span>
                            </div>
                            <div style={{ height: 6, background: 'rgba(255,255,255,0.05)', borderRadius: 4, overflow: 'hidden' }}>
                                <div style={{ height: '100%', width: (currentMonthData.omzet ? (currentMonthData.laborCost / currentMonthData.omzet) * 100 : 0) + '%', background: 'var(--purple)' }}></div>
                            </div>
                        </div>

                        <div style={{ marginTop: 10, paddingTop: 16, borderTop: '1px dashed rgba(255,255,255,0.1)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1 }}>Netto</span>
                                <span style={{ fontSize: 24, fontWeight: 900, color: currentMonthData.nettoWinst > 0 ? 'var(--green)' : 'var(--text)' }}>
                                    {fmt(currentMonthData.nettoWinst)}
                                </span>
                            </div>
                            <div style={{ textAlign: 'right', fontSize: 12, fontWeight: 800, color: currentMonthData.margePct >= 60 ? 'var(--green)' : currentMonthData.margePct >= 30 ? 'var(--brand)' : 'var(--red)' }}>
                                Marge: {currentMonthData.margePct.toFixed(1)}%
                            </div>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
}
