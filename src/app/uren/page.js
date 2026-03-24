'use client';
import { useState, useEffect } from 'react';
import { useSupabase } from '@/lib/useSupabase';
import { useToast } from '@/components/Toast';
import { useConfirm } from '@/components/ConfirmDialog';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, Legend } from 'recharts';
import { MAANDEN_KORT } from '@/lib/utils';

export default function Uren() {
    var { data: logs, insert, update, remove } = useSupabase('time_logs', []);
    var showToast = useToast();
    var showConfirm = useConfirm();
    var [now, setNow] = useState(new Date());
    var [selectedWeek, setSelectedWeek] = useState(getWeekNumber(new Date()));
    var [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

    // IBA settings
    var IBA_JAARNORM = 1225;

    // Live clock refresh
    useEffect(function () {
        var interval = setInterval(function () { setNow(new Date()); }, 1000);
        return function () { clearInterval(interval); };
    }, []);

    // Get week number
    function getWeekNumber(d) {
        var date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
        date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
        var yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
        return Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
    }

    // Active session
    var activeLog = (logs || []).find(function (l) { return l.status === 'active'; });

    function calcHours(log) {
        var start = new Date(log.start_time);
        var end = log.end_time ? new Date(log.end_time) : now;
        return Math.max(0, (end - start) / 3600000);
    }

    function fmtDuration(hours) {
        var h = Math.floor(hours);
        var m = Math.floor((hours - h) * 60);
        return h + 'u ' + (m < 10 ? '0' : '') + m + 'm';
    }

    function fmtTime(dateStr) {
        if (!dateStr) return '—';
        var d = new Date(dateStr);
        return (d.getHours() < 10 ? '0' : '') + d.getHours() + ':' + (d.getMinutes() < 10 ? '0' : '') + d.getMinutes();
    }

    function punchIn() {
        insert({ start_time: new Date().toISOString(), status: 'active', locatie: '', notitie: '' })
            .then(function () { showToast('⏱️ Ingeklokt!', 'success'); });
    }

    function punchOut() {
        if (!activeLog) return;
        var hours = calcHours(activeLog);
        update(activeLog.id, { end_time: new Date().toISOString(), status: 'completed' })
            .then(function () { showToast('✅ Uitgeklokt — ' + fmtDuration(hours) + ' gewerkt', 'success'); });
    }

    var completedLogs = (logs || []).filter(function (l) { return l.status === 'completed' || l.status === 'signed'; });
    var yearLogs = completedLogs.filter(function (l) { return new Date(l.start_time).getFullYear() === selectedYear; });

    var totalYearHours = 0;
    yearLogs.forEach(function (l) { totalYearHours += calcHours(l); });

    // Chart: Last 12 Weeks
    var weekData = [];
    for (var i = 11; i >= 0; i--) {
        var w = selectedWeek - i;
        var y = selectedYear;
        if (w <= 0) { w += 52; y -= 1; }
        var wLogs = completedLogs.filter(function (l) {
            var d = new Date(l.start_time);
            return getWeekNumber(d) === w && d.getFullYear() === y;
        });
        var wHrs = 0;
        wLogs.forEach(function (l) { wHrs += calcHours(l); });
        weekData.push({ label: 'W' + w, week: w, hours: Math.round(wHrs * 10) / 10 });
    }

    // Chart: Monthly Hours
    var monthlyHours = new Array(12).fill(0);
    yearLogs.forEach(function (l) {
        var m = new Date(l.start_time).getMonth();
        monthlyHours[m] += calcHours(l);
    });
    var monthlyChartData = MAANDEN_KORT.map(function (naam, i) {
        return { naam: naam, uren: Math.round(monthlyHours[i]) };
    });

    return (
        <div style={{ animation: 'fadeIn 0.4s ease-out' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
                <div>
                    <h1 style={{ fontSize: 20, fontWeight: 900, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <i className="fa-solid fa-clock" style={{ color: 'var(--brand)' }}></i> Workforce & Uren
                    </h1>
                </div>
            </div>

            {/* Punch Section */}
            <div className="uren-punch-section mb-24" style={{ textAlign: 'center', padding: '32px 16px', borderRadius: 20, background: 'var(--panel)', border: '1px solid var(--border)' }}>
                {activeLog ? (
                    <>
                        <div style={{ fontSize: 11, color: 'var(--brand)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 8 }}>
                            <i className="fa-solid fa-circle" style={{ fontSize: 8, marginRight: 6, animation: 'pulse 1.5s infinite' }}></i> AAN HET WERK
                        </div>
                        <div style={{ fontSize: 44, fontWeight: 900, color: 'var(--text)', marginBottom: 8 }}>{fmtDuration(calcHours(activeLog))}</div>
                        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 24 }}>Ingeklokt om {fmtTime(activeLog.start_time)}</div>
                        <button className="btn btn-red btn-lg" onClick={punchOut} style={{ padding: '12px 32px' }}>
                            <i className="fa-solid fa-stop"></i> Punch Out
                        </button>
                    </>
                ) : (
                    <>
                        <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 20 }}>NIET INGEKLOKT</div>
                        <button className="btn btn-brand btn-lg" onClick={punchIn} style={{ padding: '12px 40px' }}>
                            <i className="fa-solid fa-play"></i> Punch In
                        </button>
                    </>
                )}
            </div>

            {/* Stats */}
            <div className="stat-grid mb-24">
                <div className="stat-card uren-glass">
                    <div className="stat-icon" style={{ background: 'var(--brand-light)', color: 'var(--brand)' }}><i className="fa-solid fa-calendar-week"></i></div>
                    <div className="stat-val">{fmtDuration(weekData[11].hours)}</div>
                    <div className="stat-label">Deze Week</div>
                </div>
                <div className="stat-card uren-glass">
                    <div className="stat-icon" style={{ background: 'rgba(34,197,94,.12)', color: 'var(--green)' }}><i className="fa-solid fa-chart-line"></i></div>
                    <div className="stat-val">{fmtDuration(totalYearHours)}</div>
                    <div className="stat-label">Totaal {selectedYear}</div>
                </div>
                <div className="stat-card uren-glass">
                    <div className="stat-icon" style={{ background: 'rgba(167,139,250,.12)', color: 'var(--purple)' }}><i className="fa-solid fa-bullseye"></i></div>
                    <div className="stat-val">{Math.max(0, IBA_JAARNORM - Math.round(totalYearHours))}u</div>
                    <div className="stat-label">IBA Resterend</div>
                </div>
            </div>

            {/* Charts */}
            <div className="analytics-grid mb-24">
                <div className="panel inv-glass">
                    <div className="panel-head">
                        <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <i className="fa-solid fa-chart-column" style={{ color: 'var(--brand)', fontSize: 12 }}></i> Laatste 12 Weken
                        </h3>
                    </div>
                    <div style={{ height: 180, marginTop: 16 }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={weekData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }} barCategoryGap="25%">
                                <XAxis dataKey="label" tick={{ fill: '#71717a', fontSize: 10 }} axisLine={false} tickLine={false} />
                                <YAxis tick={{ fill: '#71717a', fontSize: 9 }} axisLine={false} tickLine={false} />
                                <Tooltip formatter={function (v) { return [v + ' uur', 'Gewerkt']; }} contentStyle={{ background: '#18181b', border: '1px solid rgba(255,191,0,.15)', borderRadius: 8, fontSize: 11 }} cursor={{ fill: 'rgba(255,191,0,.06)' }} />
                                <Bar dataKey="hours" radius={[3, 3, 0, 0]}>
                                    {weekData.map(function (d, i) { return <Cell key={i} fill={d.week === selectedWeek ? '#FFBF00' : 'rgba(255,191,0,.25)'} />; })}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
                <div className="panel inv-glass">
                    <div className="panel-head">
                        <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <i className="fa-solid fa-chart-line" style={{ color: 'var(--purple)', fontSize: 12 }}></i> Uren per Maand
                        </h3>
                    </div>
                    <div style={{ height: 180, marginTop: 16 }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={monthlyChartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }} barCategoryGap="30%">
                                <XAxis dataKey="naam" tick={{ fill: '#71717a', fontSize: 10 }} axisLine={false} tickLine={false} />
                                <YAxis tick={{ fill: '#71717a', fontSize: 9 }} axisLine={false} tickLine={false} />
                                <Tooltip formatter={function (v) { return [v + ' uur', 'Totaal']; }} contentStyle={{ background: '#18181b', border: '1px solid rgba(167,139,250,.15)', borderRadius: 8, fontSize: 11 }} cursor={{ fill: 'rgba(167,139,250,.06)' }} />
                                <Bar dataKey="uren" fill="#a78bfa" radius={[3, 3, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            <div className="panel inv-glass">
                <div className="panel-head"><h3>IBA Progressie</h3></div>
                <div style={{ padding: 20 }}>
                    <div style={{ height: 12, borderRadius: 6, background: 'var(--border)', overflow: 'hidden' }}>
                        <div style={{ width: Math.min(100, (totalYearHours / IBA_JAARNORM) * 100) + '%', height: '100%', background: 'linear-gradient(90deg, var(--brand), #fbbf24)', borderRadius: 6 }}></div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, fontSize: 11, fontWeight: 700 }}>
                        <span style={{ color: 'var(--muted)' }}>0u</span>
                        <span style={{ color: 'var(--brand)' }}>{Math.round(totalYearHours)}u gewerkt</span>
                        <span style={{ color: 'var(--muted)' }}>{IBA_JAARNORM}u norm</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
