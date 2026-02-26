'use client';
import { useState, useEffect } from 'react';
import { useSupabase } from '@/lib/useSupabase';
import { useToast } from '@/components/Toast';
import { useConfirm } from '@/components/ConfirmDialog';

export default function Uren() {
    var { data: logs, insert, update, remove, refetch } = useSupabase('time_logs', []);
    var showToast = useToast();
    var showConfirm = useConfirm();
    var [now, setNow] = useState(new Date());
    var [viewMode, setViewMode] = useState('week'); // week | month
    var [selectedWeek, setSelectedWeek] = useState(getWeekNumber(new Date()));
    var [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

    // IBA settings
    var IBA_JAARNORM = 1225;

    // Live clock refresh
    useEffect(function () {
        var interval = setInterval(function () { setNow(new Date()); }, 1000);
        return function () { clearInterval(interval); };
    }, []);

    // Active session (status === 'active')
    var activeLog = logs.find(function (l) { return l.status === 'active'; });

    // Calculate hours for a log
    function calcHours(log) {
        var start = new Date(log.start_time);
        var end = log.end_time ? new Date(log.end_time) : now;
        return Math.max(0, (end - start) / 3600000);
    }

    // Format duration
    function fmtDuration(hours) {
        var h = Math.floor(hours);
        var m = Math.floor((hours - h) * 60);
        return h + 'u ' + (m < 10 ? '0' : '') + m + 'm';
    }

    // Format time
    function fmtTime(dateStr) {
        if (!dateStr) return '—';
        var d = new Date(dateStr);
        return (d.getHours() < 10 ? '0' : '') + d.getHours() + ':' + (d.getMinutes() < 10 ? '0' : '') + d.getMinutes();
    }

    // Format date
    function fmtDate(dateStr) {
        if (!dateStr) return '';
        var d = new Date(dateStr);
        var dagen = ['Zo', 'Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za'];
        return dagen[d.getDay()] + ' ' + d.getDate() + '/' + (d.getMonth() + 1);
    }

    // Get week number
    function getWeekNumber(d) {
        var date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
        date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
        var yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
        return Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
    }

    // Get start of week (Monday)
    function getWeekStart(weekNum, year) {
        var jan1 = new Date(year, 0, 1);
        var days = (weekNum - 1) * 7;
        var weekStart = new Date(jan1);
        weekStart.setDate(jan1.getDate() + days - ((jan1.getDay() + 6) % 7));
        return weekStart;
    }

    // Punch In
    function punchIn() {
        insert({ start_time: new Date().toISOString(), status: 'active', locatie: '', notitie: '' })
            .then(function () { showToast('⏱️ Ingeklokt!', 'success'); });
    }

    // Punch Out
    function punchOut() {
        if (!activeLog) return;
        var hours = calcHours(activeLog);
        update(activeLog.id, { end_time: new Date().toISOString(), status: 'completed' })
            .then(function () { showToast('✅ Uitgeklokt — ' + fmtDuration(hours) + ' gewerkt', 'success'); });
    }

    // Total hours this year (completed logs)
    var completedLogs = logs.filter(function (l) { return l.status === 'completed' || l.status === 'signed'; });
    var yearLogs = completedLogs.filter(function (l) {
        return new Date(l.start_time).getFullYear() === selectedYear;
    });
    var totalYearHours = 0;
    yearLogs.forEach(function (l) { totalYearHours += calcHours(l); });

    // Week logs
    var weekStart = getWeekStart(selectedWeek, selectedYear);
    var weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);
    var weekLogs = completedLogs.filter(function (l) {
        var d = new Date(l.start_time);
        return d >= weekStart && d < weekEnd;
    });
    var weekHours = 0;
    weekLogs.forEach(function (l) { weekHours += calcHours(l); });

    // Group by day for week view
    var dagNamen = ['Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrijdag', 'Zaterdag', 'Zondag'];
    var weekDays = [];
    for (var i = 0; i < 7; i++) {
        var dayDate = new Date(weekStart);
        dayDate.setDate(dayDate.getDate() + i);
        var dayStr = dayDate.getFullYear() + '-' + String(dayDate.getMonth() + 1).padStart(2, '0') + '-' + String(dayDate.getDate()).padStart(2, '0');
        var dayLogs = completedLogs.filter(function (l) {
            return l.start_time && l.start_time.startsWith(dayStr);
        });
        var dayHours = 0;
        dayLogs.forEach(function (l) { dayHours += calcHours(l); });
        weekDays.push({ name: dagNamen[i], date: dayDate, dateStr: dayStr, logs: dayLogs, hours: dayHours });
    }

    // IBA progress
    var ibaProgress = Math.min(100, (totalYearHours / IBA_JAARNORM) * 100);
    var ibaRemaining = Math.max(0, IBA_JAARNORM - totalYearHours);

    // Sign off week
    function signOffWeek() {
        showConfirm('Week ' + selectedWeek + ' definitief aftekenen? Dit kan niet ongedaan worden.', function () {
            var promises = weekLogs.filter(function (l) { return l.status === 'completed'; }).map(function (l) {
                return update(l.id, { status: 'signed' });
            });
            Promise.all(promises).then(function () {
                showToast('✍️ Week ' + selectedWeek + ' afgetekend (' + fmtDuration(weekHours) + ')', 'success');
            });
        });
    }

    // Check if week is signed
    var weekSigned = weekLogs.length > 0 && weekLogs.every(function (l) { return l.status === 'signed'; });

    // Nav week
    function prevWeek() {
        if (selectedWeek <= 1) { setSelectedWeek(52); setSelectedYear(selectedYear - 1); }
        else { setSelectedWeek(selectedWeek - 1); }
    }
    function nextWeek() {
        if (selectedWeek >= 52) { setSelectedWeek(1); setSelectedYear(selectedYear + 1); }
        else { setSelectedWeek(selectedWeek + 1); }
    }

    return (
        <>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
                <div>
                    <h1 style={{ fontSize: 20, fontWeight: 900, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <i className="fa-solid fa-clock" style={{ color: 'var(--brand)' }}></i> Workforce & Uren
                    </h1>
                    <p style={{ color: 'var(--muted)', fontSize: 11, marginTop: 3 }}>
                        {completedLogs.length} shifts · {fmtDuration(totalYearHours)} dit jaar
                    </p>
                </div>
            </div>

            {/* Punch In/Out Section */}
            <div className="uren-punch-section" style={{ textAlign: 'center', padding: 32, marginBottom: 20 }}>
                {activeLog ? (
                    <>
                        <div style={{ fontSize: 11, color: 'var(--brand)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 8 }}>
                            <i className="fa-solid fa-circle" style={{ fontSize: 8, marginRight: 6, animation: 'punchGlow 1.5s ease-in-out infinite' }}></i>
                            AAN HET WERK
                        </div>
                        <div style={{ fontSize: 42, fontWeight: 900, fontFamily: "'DM Sans', monospace", color: 'var(--text)', marginBottom: 4 }}>
                            {fmtDuration(calcHours(activeLog))}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 20 }}>
                            Ingeklokt om {fmtTime(activeLog.start_time)}
                        </div>
                        <button className="punch-btn punch-out" onClick={punchOut}>
                            <i className="fa-solid fa-stop"></i> Punch Out
                        </button>
                    </>
                ) : (
                    <>
                        <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 12 }}>
                            NIET INGEKLOKT
                        </div>
                        <button className="punch-btn punch-in" onClick={punchIn}>
                            <i className="fa-solid fa-play"></i> Punch In
                        </button>
                    </>
                )}
            </div>

            {/* Stats Row */}
            <div className="stat-grid" style={{ marginBottom: 20 }}>
                <div className="stat-card uren-glass">
                    <div className="stat-icon" style={{ background: 'var(--brand-light)', color: 'var(--brand)' }}><i className="fa-solid fa-calendar-week"></i></div>
                    <div className="stat-val">{fmtDuration(weekHours)}</div>
                    <div className="stat-label">Week {selectedWeek}</div>
                </div>
                <div className="stat-card uren-glass">
                    <div className="stat-icon" style={{ background: 'rgba(34,197,94,.12)', color: 'var(--green)' }}><i className="fa-solid fa-chart-line"></i></div>
                    <div className="stat-val">{fmtDuration(totalYearHours)}</div>
                    <div className="stat-label">Totaal {selectedYear}</div>
                </div>
                <div className="stat-card uren-glass">
                    <div className="stat-icon" style={{ background: 'rgba(167,139,250,.12)', color: 'var(--purple)' }}><i className="fa-solid fa-bullseye"></i></div>
                    <div className="stat-val">{fmtDuration(ibaRemaining)}</div>
                    <div className="stat-label">IBA Resterend</div>
                </div>
            </div>

            {/* IBA Progress Bar */}
            <div className="panel uren-glass" style={{ marginBottom: 20 }}>
                <div className="panel-head">
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <i className="fa-solid fa-bullseye" style={{ color: 'var(--purple)', fontSize: 12 }}></i> IBA Compliance — {selectedYear}
                    </h3>
                    <span style={{ fontSize: 12, fontWeight: 800, color: ibaProgress >= 100 ? 'var(--green)' : 'var(--brand)' }}>
                        {ibaProgress.toFixed(1)}%
                    </span>
                </div>
                <div style={{ padding: 16 }}>
                    <div style={{ height: 24, borderRadius: 12, background: 'rgba(255,255,255,.06)', overflow: 'hidden', position: 'relative' }}>
                        <div style={{
                            width: ibaProgress + '%',
                            height: '100%',
                            borderRadius: 12,
                            background: ibaProgress >= 100
                                ? 'linear-gradient(90deg, #22c55e, #4ade80)'
                                : ibaProgress >= 75
                                    ? 'linear-gradient(90deg, var(--brand), #fbbf24)'
                                    : 'linear-gradient(90deg, var(--brand), #f97316)',
                            transition: 'width .5s ease',
                            position: 'relative',
                        }}>
                            <div style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 10, fontWeight: 800, color: '#000' }}>
                                {Math.round(totalYearHours)}u / {IBA_JAARNORM}u
                            </div>
                        </div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 10, color: 'var(--muted)' }}>
                        <span>0 uur</span>
                        <span>{Math.round(IBA_JAARNORM / 4)}u (Q1)</span>
                        <span>{Math.round(IBA_JAARNORM / 2)}u (Q2)</span>
                        <span>{Math.round(IBA_JAARNORM * 3 / 4)}u (Q3)</span>
                        <span>{IBA_JAARNORM}u (doel)</span>
                    </div>
                </div>
            </div>

            {/* Week Navigation */}
            <div className="panel uren-glass">
                <div className="panel-head">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <button className="btn btn-ghost btn-sm" onClick={prevWeek}><i className="fa-solid fa-chevron-left"></i></button>
                        <h3>Week {selectedWeek} — {selectedYear}</h3>
                        <button className="btn btn-ghost btn-sm" onClick={nextWeek}><i className="fa-solid fa-chevron-right"></i></button>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        {weekSigned && <span className="pill pill-green" style={{ fontSize: 10 }}>✍ Afgetekend</span>}
                        {!weekSigned && weekLogs.length > 0 && (
                            <button className="btn btn-brand btn-sm" onClick={signOffWeek}>
                                <i className="fa-solid fa-signature"></i> Sign-off
                            </button>
                        )}
                        <span style={{ fontSize: 14, fontWeight: 900, color: 'var(--brand)' }}>{fmtDuration(weekHours)}</span>
                    </div>
                </div>
                <div style={{ padding: 0 }}>
                    {weekDays.map(function (wd) {
                        var isToday = wd.dateStr === new Date().getFullYear() + '-' + String(new Date().getMonth() + 1).padStart(2, '0') + '-' + String(new Date().getDate()).padStart(2, '0');
                        return (
                            <div key={wd.dateStr} className={'uren-day-row' + (isToday ? ' uren-day-today' : '')} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                                <div style={{ width: 80 }}>
                                    <div style={{ fontWeight: 800, fontSize: 12, color: isToday ? 'var(--brand)' : 'var(--text)' }}>{wd.name}</div>
                                    <div style={{ fontSize: 10, color: 'var(--muted)' }}>{wd.date.getDate()}/{wd.date.getMonth() + 1}</div>
                                </div>
                                <div style={{ flex: 1 }}>
                                    {wd.logs.length === 0 && <span style={{ fontSize: 11, color: 'var(--muted)' }}>—</span>}
                                    {wd.logs.map(function (l) {
                                        var hrs = calcHours(l);
                                        var isSigned = l.status === 'signed';
                                        return (
                                            <div key={l.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 10px', marginRight: 6, marginBottom: 4, background: isSigned ? 'rgba(34,197,94,.08)' : 'rgba(255,140,0,.08)', border: '1px solid ' + (isSigned ? 'rgba(34,197,94,.2)' : 'rgba(255,140,0,.2)'), borderRadius: 8, fontSize: 11 }}>
                                                <span style={{ fontWeight: 700 }}>{fmtTime(l.start_time)} - {fmtTime(l.end_time)}</span>
                                                <span style={{ color: 'var(--muted)', fontSize: 10 }}>({fmtDuration(hrs)})</span>
                                                {isSigned && <i className="fa-solid fa-lock" style={{ fontSize: 8, color: 'var(--green)' }}></i>}
                                            </div>
                                        );
                                    })}
                                </div>
                                <div style={{ fontWeight: 800, fontSize: 13, color: wd.hours > 0 ? 'var(--brand)' : 'var(--muted)', minWidth: 60, textAlign: 'right' }}>
                                    {wd.hours > 0 ? fmtDuration(wd.hours) : ''}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </>
    );
}
