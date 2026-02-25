'use client';
import { useState, useEffect, useRef } from 'react';
import { useSupabase } from '@/lib/useSupabase';
import { fmt, MAANDEN_KORT } from '@/lib/utils';

export default function Boekhouding() {
    var { data: facturen } = useSupabase('facturen', []);
    var { data: events } = useSupabase('events', []);
    var [tab, setTab] = useState('wv');
    var canvasRef = useRef(null);

    // Calculations
    var betaald = facturen.filter(function (f) { return f.status === 'betaald'; });
    var open = facturen.filter(function (f) { return f.status !== 'betaald'; });

    function sumItems(facs) {
        var total = 0;
        facs.forEach(function (f) {
            (f.items || []).forEach(function (item) { total += (item.qty || 0) * (item.prijs || 0); });
        });
        return total;
    }

    var omzet = sumItems(betaald);
    var openstaand = sumItems(open);
    var prognose = 0;
    events.forEach(function (e) { prognose += (e.guests || 0) * (e.ppp || 0); });

    // BTW breakdown
    var btwMap = {};
    facturen.forEach(function (f) {
        (f.items || []).forEach(function (item) {
            var pct = item.btw || 0;
            var line = (item.qty || 0) * (item.prijs || 0);
            var btwBedrag = line * (pct / 100);
            if (!btwMap[pct]) btwMap[pct] = { netto: 0, btw: 0 };
            btwMap[pct].netto += line;
            btwMap[pct].btw += btwBedrag;
        });
    });

    // Monthly revenue for chart
    var monthlyData = new Array(12).fill(0);
    betaald.forEach(function (f) {
        var month = f.datum ? parseInt(f.datum.split('-')[1]) - 1 : 0;
        (f.items || []).forEach(function (item) { monthlyData[month] += (item.qty || 0) * (item.prijs || 0); });
    });

    // Draw chart
    useEffect(function () {
        if (tab !== 'wv' || !canvasRef.current) return;
        var canvas = canvasRef.current;
        var ctx = canvas.getContext('2d');
        var w = canvas.width = canvas.offsetWidth * 2;
        var h = canvas.height = 300;
        ctx.scale(2, 1);
        var realW = w / 2;

        ctx.clearRect(0, 0, realW, h);
        var max = Math.max.apply(null, monthlyData) || 1;
        var barW = (realW - 60) / 12;
        var barGap = 4;

        ctx.fillStyle = '#71717a';
        ctx.font = '10px DM Sans,sans-serif';
        ctx.textAlign = 'center';

        for (var i = 0; i < 12; i++) {
            var val = monthlyData[i];
            var barH = (val / max) * (h - 50);
            var x = 30 + i * barW;
            var y = h - 30 - barH;

            ctx.fillStyle = val > 0 ? '#FF8C00' : '#27272a';
            ctx.beginPath();
            ctx.roundRect(x + barGap, y, barW - barGap * 2, barH, [4, 4, 0, 0]);
            ctx.fill();

            ctx.fillStyle = '#71717a';
            ctx.fillText(MAANDEN_KORT[i], x + barW / 2, h - 10);
            if (val > 0) {
                ctx.fillStyle = '#f4f4f5';
                ctx.fillText(Math.round(val), x + barW / 2, y - 6);
            }
        }
    }, [tab, monthlyData]);

    return (
        <>
            <div className="tab-bar">
                <button className={'tab-btn' + (tab === 'wv' ? ' active' : '')} onClick={function () { setTab('wv'); }}>Winst &amp; Verlies</button>
                <button className={'tab-btn' + (tab === 'btw' ? ' active' : '')} onClick={function () { setTab('btw'); }}>BTW Overzicht</button>
            </div>

            {tab === 'wv' && (
                <>
                    <div className="stat-grid">
                        <div className="stat-card">
                            <div className="stat-icon" style={{ background: 'rgba(34,197,94,.12)', color: 'var(--green)' }}><i className="fa-solid fa-euro-sign"></i></div>
                            <div className="stat-val">{fmt(omzet)}</div>
                            <div className="stat-label">Omzet (betaald)</div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-icon" style={{ background: 'rgba(245,158,11,.12)', color: 'var(--amber)' }}><i className="fa-solid fa-clock"></i></div>
                            <div className="stat-val">{fmt(openstaand)}</div>
                            <div className="stat-label">Openstaand</div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-icon" style={{ background: 'rgba(167,139,250,.12)', color: 'var(--purple)' }}><i className="fa-solid fa-chart-line"></i></div>
                            <div className="stat-val">{fmt(prognose)}</div>
                            <div className="stat-label">Prognose (events)</div>
                        </div>
                    </div>
                    <div className="panel">
                        <div className="panel-head"><h3>Maandomzet</h3></div>
                        <div className="panel-body">
                            <canvas ref={canvasRef} style={{ width: '100%', height: 150 }}></canvas>
                        </div>
                    </div>
                </>
            )}

            {tab === 'btw' && (
                <div className="panel">
                    <div className="panel-head"><h3>BTW Overzicht</h3></div>
                    <div className="panel-body">
                        {Object.keys(btwMap).length === 0 && <div className="empty-state"><i className="fa-solid fa-calculator"></i><p>Geen BTW data beschikbaar</p></div>}
                        <table className="tbl">
                            <thead><tr><th>BTW %</th><th style={{ textAlign: 'right' }}>Netto Omzet</th><th style={{ textAlign: 'right' }}>BTW Bedrag</th><th style={{ textAlign: 'right' }}>Bruto</th></tr></thead>
                            <tbody>
                                {Object.keys(btwMap).sort().map(function (pct) {
                                    var row = btwMap[pct];
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
                        <div style={{ marginTop: 16, padding: 16, background: 'var(--bg)', borderRadius: 12, border: '1px solid var(--border)', textAlign: 'right' }}>
                            <span style={{ color: 'var(--muted)', marginRight: 12 }}>Totaal af te dragen BTW:</span>
                            <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--brand)' }}>
                                {fmt(Object.values(btwMap).reduce(function (sum, r) { return sum + r.btw; }, 0))}
                            </span>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
