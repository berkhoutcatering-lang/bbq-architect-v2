'use client';
import { useState, useMemo } from 'react';
import { useSupabase, useSettings } from '@/lib/useSupabase';
import { fmt, addDays } from '@/lib/utils';
import { supabase } from '@/lib/supabase';

// Helper to calc unit conversions
function getInvPrice(inventoryData, naam) {
    if (!naam) return null;
    var inv = inventoryData.find(function (i) { return i.naam && i.naam.toLowerCase() === String(naam).toLowerCase(); });
    return inv ? { price: inv.purchase_price || 0, unit: inv.unit || 'kg', yield_factor: inv.yield_factor || 1.0 } : null;
}

function calcDishCostPP(gerechtenData, inventoryData, gerechtNaam) {
    if (!gerechtNaam) return 0;
    var gerecht = gerechtenData.find(function (g) { return g.naam === gerechtNaam; });
    if (!gerecht || !gerecht.ingredient_costs) return 0;

    var costsArray = Array.isArray(gerecht.ingredient_costs) ? gerecht.ingredient_costs : [];

    return costsArray.reduce(function (sum, item) {
        if (!item || !item.naam) return sum;
        var inv = getInvPrice(inventoryData, item.naam);
        var price = inv ? inv.price : 0;
        var yld = (item.yield || (inv ? inv.yield_factor : 1.0)) || 1.0;
        var unitFactor = 1;
        if (item.unit === 'g' && inv && inv.unit === 'kg') unitFactor = 0.001;
        if (item.unit === 'ml' && inv && inv.unit === 'L') unitFactor = 0.001;
        return sum + ((item.qty_pp || 0) * unitFactor / yld) * price;
    }, 0);
}

export default function Financien() {
    var { data: offertes } = useSupabase('offertes', []);
    var { data: gerechtenData } = useSupabase('gerechten', []);
    var { data: inventoryData } = useSupabase('inventory', []);
    var { data: urenLogs } = useSupabase('time_logs', []);
    var { settings } = useSettings();

    var [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
    var LABOR_COST_PER_HOUR = 35.00; // Average internal cost per hour

    var financialData = useMemo(function () {
        if (!offertes.length || !gerechtenData.length || !urenLogs.length) return { months: [], totalOmzet: 0, totalNetto: 0, overalMarge: 0 };

        var monthsMap = {};
        for (var i = 1; i <= 12; i++) {
            var mStr = String(i).padStart(2, '0');
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

        // 1. Calculate Omzet en FoodCost uit Geaccepteerde Offertes
        var validOffertes = offertes.filter(o => ['goedgekeurd', 'geaccepteerd', 'voltooid'].includes(o.status || '') && (o.datum || '').startsWith(String(selectedYear)));

        validOffertes.forEach(function (offerte) {
            var mStr = offerte.datum.split('-')[1];
            if (!monthsMap[mStr]) return;

            var gasten = offerte.aantal_gasten || (offerte.items && offerte.items[0] ? offerte.items[0].qty : 0) || 0;
            var prijsPP = offerte.basis_prijs_pp || 0;
            var vk = (Array.isArray(offerte.vaste_kosten) ? offerte.vaste_kosten : []).reduce((s, k) => s + (parseFloat(k.bedrag) || 0), 0);

            var omzet = (gasten * prijsPP) + vk;

            var menuOpties = Array.isArray(offerte.menu_selectie) ? offerte.menu_selectie : [];
            menuOpties.forEach(function (sel) {
                if (sel && (sel.gerecht_naam || sel.naam)) {
                    foodcostTotaal += calcDishCostPP(gerechtenData, inventoryData, sel.gerecht_naam || sel.naam) * gasten;
                }
            });

            monthsMap[mStr].omzet += omzet;
            monthsMap[mStr].foodcost += foodcostTotaal;
            monthsMap[mStr].offerteCount += 1;
        });

        // 2. Calculate Labor Cost uit Urenregistratie
        var completedLogs = urenLogs.filter(l => (l.status === 'completed' || l.status === 'signed') && (l.start_time || '').startsWith(String(selectedYear)));
        completedLogs.forEach(function (log) {
            var start = new Date(log.start_time);
            var end = new Date(log.end_time);
            var hours = Math.max(0, (end - start) / 3600000);
            var mStr = String(start.getMonth() + 1).padStart(2, '0');

            if (monthsMap[mStr]) {
                monthsMap[mStr].laborHours += hours;
                monthsMap[mStr].laborCost += (hours * LABOR_COST_PER_HOUR);
            }
        });

        // 3. Finalize Netto Winst
        var totalOmzet = 0;
        var totalFoodcost = 0;
        var totalLabor = 0;
        var totalNetto = 0;

        var monthsArr = Object.values(monthsMap).map(function (m) {
            m.nettoWinst = m.omzet - m.foodcost - m.laborCost;
            m.margePct = m.omzet > 0 ? (m.nettoWinst / m.omzet) * 100 : 0;

            totalOmzet += m.omzet;
            totalFoodcost += m.foodcost;
            totalLabor += m.laborCost;
            totalNetto += m.nettoWinst;
            return m;
        });

        var overalMarge = totalOmzet > 0 ? (totalNetto / totalOmzet) * 100 : 0;

        return {
            months: monthsArr,
            totalOmzet,
            totalFoodcost,
            totalLabor,
            totalNetto,
            overalMarge
        };

    }, [offertes, gerechtenData, inventoryData, urenLogs, selectedYear]);

    // Current Month Metrics
    var currentMonthStr = String(new Date().getMonth() + 1).padStart(2, '0');
    var currentMonthData = financialData.months.find(m => String(m.monthNum).padStart(2, '0') === currentMonthStr) || { omzet: 0, foodcost: 0, laborHours: 0, laborCost: 0, nettoWinst: 0, margePct: 0, offerteCount: 0 };

    var maxOmzet = Math.max(...financialData.months.map(m => m.omzet), 1000);

    return (
        <div style={{ animation: 'fadeIn 0.4s ease-out' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <div>
                    <h1 style={{ fontSize: 24, fontWeight: 900, display: 'flex', alignItems: 'center', gap: 10 }}>
                        <i className="fa-solid fa-vault" style={{ color: 'var(--brand)' }}></i> The Vault Analytics
                    </h1>
                    <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 4 }}>Live Profit & Loss Dashboard over {selectedYear}</p>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                    <button onClick={() => setSelectedYear(selectedYear - 1)} className="btn btn-ghost"><i className="fa-solid fa-chevron-left"></i></button>
                    <div style={{ background: 'var(--card)', padding: '8px 16px', borderRadius: 8, fontWeight: 800 }}>{selectedYear}</div>
                    <button onClick={() => setSelectedYear(selectedYear + 1)} className="btn btn-ghost"><i className="fa-solid fa-chevron-right"></i></button>
                </div>
            </div>

            {/* Top Stat Cards */}
            <div className="stat-grid" style={{ marginBottom: 30 }}>
                <div className="stat-card uren-glass" style={{ background: 'rgba(255,255,255,0.02)' }}>
                    <div className="stat-icon" style={{ background: 'rgba(255,140,0,.15)', color: 'var(--brand)' }}><i className="fa-solid fa-coins"></i></div>
                    <div className="stat-val">{fmt(financialData.totalOmzet)}</div>
                    <div className="stat-label">Totale Omzet (Geaccepteerd)</div>
                </div>
                <div className="stat-card uren-glass" style={{ background: 'rgba(255,255,255,0.02)' }}>
                    <div className="stat-icon" style={{ background: 'rgba(239,68,68,.15)', color: 'var(--red)' }}><i className="fa-solid fa-fire"></i></div>
                    <div className="stat-val">{fmt(financialData.totalFoodcost)}</div>
                    <div className="stat-label">Foodcost Theoretisch</div>
                </div>
                <div className="stat-card uren-glass" style={{ background: 'rgba(255,255,255,0.02)' }}>
                    <div className="stat-icon" style={{ background: 'rgba(167,139,250,.15)', color: 'var(--purple)' }}><i className="fa-solid fa-users-gear"></i></div>
                    <div className="stat-val">{fmt(financialData.totalLabor)}</div>
                    <div className="stat-label">Personeelskosten</div>
                </div>
                <div className="stat-card uren-glass" style={{ background: 'rgba(34,197,94,.15)', border: '1px solid rgba(34,197,94,.3)' }}>
                    <div className="stat-icon" style={{ background: 'rgba(34,197,94,.2)', color: 'var(--green)' }}><i className="fa-solid fa-vault"></i></div>
                    <div className="stat-val" style={{ color: 'var(--green)' }}>{fmt(financialData.totalNetto)}</div>
                    <div className="stat-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>Netto Winst</span>
                        <span style={{ fontWeight: 800 }}>{financialData.overalMarge.toFixed(1)}%</span>
                    </div>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)', gap: 20, alignItems: 'flex-start' }}>

                {/* Cashflow Bar Chart (Native CSS) */}
                <div className="panel uren-glass" style={{ padding: 24 }}>
                    <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 24, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <i className="fa-solid fa-chart-simple" style={{ color: 'var(--brand)' }}></i> Cashflow per Maand
                    </h3>
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, height: 260, paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>
                        {financialData.months.map((m, idx) => {
                            var heightPct = (m.omzet / maxOmzet) * 100;
                            var profitHeightPct = m.omzet > 0 ? (m.nettoWinst / m.omzet) * 100 : 0;

                            return (
                                <div key={idx} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                                    <div style={{ width: '100%', height: 200, display: 'flex', alignItems: 'flex-end', position: 'relative' }}>
                                        {/* Bar Background (Omzet) */}
                                        <div style={{
                                            position: 'absolute', bottom: 0, left: '10%', right: '10%', height: heightPct + '%',
                                            background: 'rgba(255,255,255,0.05)', borderRadius: '6px 6px 0 0',
                                            transition: 'height 1s cubic-bezier(0.16, 1, 0.3, 1)', zIndex: 1
                                        }}></div>
                                        {/* Bar Foreground (Profit) */}
                                        <div style={{
                                            position: 'absolute', bottom: 0, left: '10%', right: '10%', height: (heightPct * (profitHeightPct / 100)) + '%',
                                            background: profitHeightPct > 60 ? 'linear-gradient(0deg, var(--green), #4ade80)' : profitHeightPct > 30 ? 'linear-gradient(0deg, var(--brand), #fbbf24)' : 'linear-gradient(0deg, var(--red), #fca5a5)',
                                            borderRadius: '6px 6px 0 0',
                                            transition: 'height 1s cubic-bezier(0.16, 1, 0.3, 1) 0.2s', zIndex: 2,
                                            boxShadow: '0 0 10px rgba(0,0,0,0.5)'
                                        }}></div>
                                    </div>
                                    <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>{m.monthName}</span>
                                </div>
                            );
                        })}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'center', gap: 24, marginTop: 16, fontSize: 11, fontWeight: 700, color: 'var(--muted)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><div style={{ width: 12, height: 12, background: 'rgba(255,255,255,0.05)', borderRadius: 2 }}></div> Bruto Omzet</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><div style={{ width: 12, height: 12, background: 'var(--green)', borderRadius: 2 }}></div> Netto Winst</div>
                    </div>
                </div>

                {/* Huidige Maand Zoom-in */}
                <div className="panel uren-glass" style={{ padding: 24 }}>
                    <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 24, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <i className="fa-solid fa-crosshairs" style={{ color: 'var(--brand)' }}></i> Focus Huidige Maand
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
