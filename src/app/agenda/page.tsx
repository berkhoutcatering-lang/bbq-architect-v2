/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';
import { useState, useEffect } from 'react';
import { useSupabase } from '@/lib/useSupabase';
import { useToast } from '@/components/Toast';
import { fmt, fmtNl, today, MAANDEN } from '@/lib/utils';
import type { Event as DbEvent, PrepTask, PrepSuggestion } from '@/types';

export default function Agenda() {
    const { data: events, insert: insertEvent } = useSupabase<DbEvent>('events', []);
    const { data: prepTasks, insert: insertPrep, update: updatePrep, remove: removePrep } = useSupabase<PrepTask>('prep_tasks', []);
    const { data: suggestions, remove: removeSuggestion } = useSupabase<PrepSuggestion>('prep_suggestions', []);
    const showToast = useToast();
    const [year, setYear] = useState(new Date().getFullYear());
    const [month, setMonth] = useState(new Date().getMonth());
    const [selected, setSelected] = useState(today());
    const [showPrepForm, setShowPrepForm] = useState(false);
    const [showEventForm, setShowEventForm] = useState(false);
    const [mobileView, setMobileView] = useState<'list' | 'calendar'>('list');
    const [isMobile, setIsMobile] = useState(false);

    useEffect(() => {
        const check = () => setIsMobile(window.innerWidth < 768);
        check();
        window.addEventListener('resize', check);
        return () => window.removeEventListener('resize', check);
    }, []);
    const [newTask, setNewTask] = useState<Record<string, any>>({ event_id: '', text: '', dagen: -1 });
    const [newEvent, setNewEvent] = useState<Record<string, any>>({ name: '', date: '', guests: 50, location: '', ppp: 45, status: 'pending', client_naam: '', client_adres: '', client_tel: '', client_email: '', type: 'Particulier', notitie: '' });

    function prevMonth() { if (month === 0) { setMonth(11); setYear(year - 1); } else { setMonth(month - 1); } }
    function nextMonth() { if (month === 11) { setMonth(0); setYear(year + 1); } else { setMonth(month + 1); } }
    function goToday() { const now = new Date(); setYear(now.getFullYear()); setMonth(now.getMonth()); setSelected(today()); }

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const prevDays = new Date(year, month, 0).getDate();
    const startOffset = (firstDay + 6) % 7;

    const cells: { day: number; other: boolean; date: string }[] = [];
    for (let i = startOffset - 1; i >= 0; i--) {
        const pd = new Date(year, month, -i);
        cells.push({ day: prevDays - i, other: true, date: pd.getFullYear() + '-' + String(pd.getMonth() + 1).padStart(2, '0') + '-' + String(pd.getDate()).padStart(2, '0') });
    }
    for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = year + '-' + String(month + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
        cells.push({ day: d, other: false, date: dateStr });
    }
    const remaining = 7 - (cells.length % 7);
    if (remaining < 7) {
        for (let r = 1; r <= remaining; r++) {
            const nd = new Date(year, month + 1, r);
            cells.push({ day: r, other: true, date: nd.getFullYear() + '-' + String(nd.getMonth() + 1).padStart(2, '0') + '-' + String(nd.getDate()).padStart(2, '0') });
        }
    }

    const todayStr = today();

    function getPrepDate(task: PrepTask): string | null {
        const ev = events.find(function (e) { return e.id === task.event_id; });
        if (!ev || !ev.date) return null;
        const evDate = new Date(ev.date + 'T00:00:00');
        const prepDate = new Date(evDate);
        prepDate.setDate(prepDate.getDate() + (task.dagen || 0));
        return prepDate.getFullYear() + '-' + String(prepDate.getMonth() + 1).padStart(2, '0') + '-' + String(prepDate.getDate()).padStart(2, '0');
    }

    function eventsForDate(ds: string) { return events.filter(function (e) { return e.date === ds; }); }
    function prepsForDate(ds: string) {
        return prepTasks.filter(function (pt) { return getPrepDate(pt) === ds; }).map(function (pt) {
            return { task: pt, event: events.find(function (e) { return e.id === pt.event_id; }) };
        });
    }

    const selEvents = eventsForDate(selected);
    const selPreps = prepsForDate(selected);
    const selDate = new Date(selected + 'T00:00:00');
    const dagNamen = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag'];
    const selLabel = dagNamen[selDate.getDay()].toUpperCase() + ' ' + selDate.getDate() + ' ' + MAANDEN[selDate.getMonth()].toUpperCase();

    const allPreps = prepTasks.map(function (pt) {
        const ev = events.find(function (e) { return e.id === pt.event_id; });
        const pd = getPrepDate(pt);
        return { task: pt, event: ev, prepDate: pd };
    }).filter(function (p) { return p.prepDate; }).sort(function (a, b) { return (a.prepDate as string) < (b.prepDate as string) ? -1 : 1; });

    const undonePreps = allPreps.filter(function (p) { return !p.task.done; });
    const donePreps = allPreps.filter(function (p) { return p.task.done; });

    function toggleTask(task: PrepTask) {
        updatePrep(task.id, { done: !task.done }).then(function () { showToast(task.done ? 'Taak heropend' : 'Taak afgerond ✓', 'success'); }).catch(function(err: any) { showToast('Fout: ' + (err.message || 'onbekend'), 'error'); });
    }

    function addPrepTask() {
        if (!newTask.event_id || !newTask.text) { showToast('Vul alle velden in', 'error'); return; }
        insertPrep({ event_id: parseInt(newTask.event_id), text: newTask.text, dagen: parseInt(newTask.dagen), done: false })
            .then(function () { showToast('Prep-taak toegevoegd', 'success'); setNewTask({ event_id: '', text: '', dagen: -1 }); setShowPrepForm(false); }).catch(function(err: any) { showToast('Fout: ' + (err.message || 'onbekend'), 'error'); });
    }

    function addEvent() {
        if (!newEvent.name) { showToast('Vul een eventnaam in', 'error'); return; }
        const eventData = Object.assign({}, newEvent, { date: newEvent.date || selected });
        insertEvent(eventData).then(function () {
            showToast('Event "' + eventData.name + '" aangemaakt 🔥', 'success');
            setNewEvent({ name: '', date: '', guests: 50, location: '', ppp: 45, status: 'pending', client_naam: '', client_adres: '', client_tel: '', client_email: '', type: 'Particulier', notitie: '' });
            setShowEventForm(false);
        }).catch(function(err: any) { showToast('Fout: ' + (err.message || 'onbekend'), 'error'); });
    }

    return (
        <div className="artisan-page agenda-page">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 24 }}>
                <div>
                    <h1 className="hero-title" style={{ fontSize: 24, margin: 0 }}>AGENDA & PLANNING</h1>
                    <p style={{ color: 'var(--muted)', fontSize: 11, marginTop: 4, letterSpacing: 1 }}>
                        {events.length} EVENTS • {prepTasks.filter(function (p) { return !p.done; }).length} OPEN PREP-TAKEN
                    </p>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {isMobile && (
                        <div style={{ display: 'flex', borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)' }}>
                            <button onClick={function () { setMobileView('list'); }} aria-label="Lijstweergave" style={{ padding: '8px 14px', fontSize: 12, fontWeight: 600, background: mobileView === 'list' ? 'var(--brand)' : 'transparent', color: mobileView === 'list' ? '#000' : 'var(--muted)', border: 'none', cursor: 'pointer' }}>
                                <i className="fa-solid fa-list"></i>
                            </button>
                            <button onClick={function () { setMobileView('calendar'); }} aria-label="Kalenderweergave" style={{ padding: '8px 14px', fontSize: 12, fontWeight: 600, background: mobileView === 'calendar' ? 'var(--brand)' : 'transparent', color: mobileView === 'calendar' ? '#000' : 'var(--muted)', border: 'none', cursor: 'pointer' }}>
                                <i className="fa-solid fa-calendar"></i>
                            </button>
                        </div>
                    )}
                    <button className="tab-btn" onClick={goToday}>VANDAAG</button>
                    <button className="btn-brand" onClick={function () { setShowEventForm(!showEventForm); setShowPrepForm(false); }}>
                        <i className="fa-solid fa-plus"></i> {isMobile ? 'EVENT' : 'NIEUW EVENT'}
                    </button>
                </div>
            </div>

            {/* Mobile List View */}
            {isMobile && mobileView === 'list' && (
                <div style={{ marginBottom: 24 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                        <button onClick={prevMonth} style={{ background: 'transparent', border: 'none', color: 'var(--brand)', cursor: 'pointer', padding: 8, fontSize: 16 }} aria-label="Vorige maand"><i className="fa-solid fa-chevron-left"></i></button>
                        <h3 style={{ margin: 0, fontWeight: 700, letterSpacing: 2, color: 'var(--brand)', fontSize: 14 }}>{MAANDEN[month].toUpperCase()} {year}</h3>
                        <button onClick={nextMonth} style={{ background: 'transparent', border: 'none', color: 'var(--brand)', cursor: 'pointer', padding: 8, fontSize: 16 }} aria-label="Volgende maand"><i className="fa-solid fa-chevron-right"></i></button>
                    </div>

                    {(function () {
                        const daysWithItems: { date: string; dayNum: number; dayName: string; evts: DbEvent[]; preps: { task: PrepTask; event: DbEvent | undefined }[] }[] = [];
                        for (let d = 1; d <= daysInMonth; d++) {
                            const dateStr = year + '-' + String(month + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
                            const evts = eventsForDate(dateStr);
                            const preps = prepsForDate(dateStr);
                            if (evts.length > 0 || preps.length > 0 || dateStr === todayStr || dateStr === selected) {
                                const dt = new Date(dateStr + 'T00:00:00');
                                daysWithItems.push({ date: dateStr, dayNum: d, dayName: dagNamen[dt.getDay()], evts, preps });
                            }
                        }
                        if (daysWithItems.length === 0) {
                            return <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>Geen events deze maand</div>;
                        }
                        return daysWithItems.map(function (day) {
                            const isToday = day.date === todayStr;
                            const isSel = day.date === selected;
                            return (
                                <div key={day.date} onClick={function () { setSelected(day.date); }}
                                    style={{
                                        padding: '14px 16px', marginBottom: 8, borderRadius: 14, cursor: 'pointer',
                                        background: isSel ? 'rgba(213,178,98,0.06)' : 'var(--card)',
                                        border: isSel ? '1px solid rgba(213,178,98,0.2)' : '1px solid var(--border)',
                                        backdropFilter: 'blur(8px)',
                                    }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                                        <div style={{
                                            width: 52, height: 52, borderRadius: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                                            background: isToday ? 'var(--brand)' : 'rgba(255,255,255,0.04)',
                                            color: isToday ? '#000' : 'var(--text)',
                                        }}>
                                            <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', lineHeight: 1 }}>{day.dayName.substring(0, 2)}</span>
                                            <span style={{ fontSize: 20, fontWeight: 800, lineHeight: 1.1 }}>{day.dayNum}</span>
                                        </div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            {day.evts.map(function (ev) {
                                                return (
                                                    <div key={ev.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                                                        <div style={{ fontWeight: 700, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.name}</div>
                                                        <span style={{
                                                            fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 6,
                                                            background: ev.status === 'confirmed' ? 'rgba(34,197,94,.12)' : 'rgba(255,191,0,.12)',
                                                            color: ev.status === 'confirmed' ? 'var(--green)' : 'var(--brand)',
                                                        }}>{{ confirmed: 'Bevestigd', completed: 'Klaar', pending: 'Nieuw', optie: 'Optie' }[ev.status] || ev.status}</span>
                                                    </div>
                                                );
                                            })}
                                            {day.preps.map(function (pp, i) {
                                                return (
                                                    <div key={i} style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: pp.task.done ? 'var(--green)' : 'var(--muted)', flexShrink: 0 }} />
                                                        <span style={{ textDecoration: pp.task.done ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pp.task.text}</span>
                                                    </div>
                                                );
                                            })}
                                            {day.evts.length === 0 && day.preps.length === 0 && <span style={{ fontSize: 12, color: 'var(--muted)' }}>Vandaag</span>}
                                        </div>
                                    </div>
                                </div>
                            );
                        });
                    })()}
                </div>
            )}

            {/* Calendar Grid — desktop always, mobile only when calendar mode selected */}
            <div className="agenda-layout grid gap-6 grid-cols-1 md:grid-cols-[minmax(0,1fr)_380px]" style={isMobile && mobileView === 'list' ? { display: 'none' } : {}}>
                <div className="panel" style={{ height: 'fit-content' }}>
                    <div className="calendar">
                        <div className="cal-header" style={{ padding: '20px', borderBottom: '1px solid var(--border-steel)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <button className="cal-nav" onClick={prevMonth} style={{ background: 'transparent', border: 'none', color: 'var(--brand)', cursor: 'pointer' }}><i className="fa-solid fa-chevron-left"></i></button>
                            <h3 style={{ margin: 0, fontFamily: 'var(--font-artisan)', letterSpacing: 2, color: 'var(--brand)' }}>{MAANDEN[month].toUpperCase()} {year}</h3>
                            <button className="cal-nav" onClick={nextMonth} style={{ background: 'transparent', border: 'none', color: 'var(--brand)', cursor: 'pointer' }}><i className="fa-solid fa-chevron-right"></i></button>
                        </div>
                        <div className="cal-grid" style={{ padding: 10 }}>
                            {['MA', 'DI', 'WO', 'DO', 'VR', 'ZA', 'ZO'].map(function (dn) { return <div key={dn} className="cal-day-name" style={{ textAlign: 'center', fontSize: 10, fontWeight: 800, color: 'var(--muted)', padding: '10px 0' }}>{dn}</div>; })}
                            {cells.map(function (cell, idx) {
                                const dayEvts = eventsForDate(cell.date);
                                const dayPreps = prepsForDate(cell.date);
                                const isSelected = cell.date === selected;
                                const isToday = cell.date === todayStr;
                                return (
                                    <div key={idx} className={'cal-cell' + (cell.other ? ' other-month' : '')}
                                        onClick={function () { setSelected(cell.date); }}
                                        style={{ minHeight: 100, padding: 8, border: '1px solid var(--border)', cursor: 'pointer', background: isSelected ? 'rgba(213,178,98,0.05)' : isToday ? 'rgba(255,255,255,0.02)' : 'transparent', position: 'relative' }}>
                                        <div className="cal-num" style={{ fontWeight: 800, fontSize: 12, color: isSelected ? 'var(--brand)' : isToday ? '#fff' : 'var(--muted)', marginBottom: 6 }}>{cell.day}</div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                            {dayEvts.map(function (ev) {
                                                return <div key={ev.id} style={{ fontSize: 9, background: 'var(--brand)', color: '#1a1a1a', padding: '2px 4px', borderRadius: 4, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                    {ev.name.toUpperCase()}
                                                </div>;
                                            })}
                                            {dayPreps.map(function (pp, i) {
                                                if (i > 1) return null;
                                                return <div key={i} style={{ fontSize: 9, background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', color: 'var(--text)', padding: '2px 4px', borderRadius: 4, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                    {pp.task.text}
                                                </div>;
                                            })}
                                            {dayPreps.length > 2 && <div style={{ fontSize: 8, color: 'var(--muted)', textAlign: 'center' }}>+{dayPreps.length - 2}</div>}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                <div className="agenda-side">
                    <div className="panel mb-16">
                        <div className="panel-head"><h3><i className="fa-solid fa-calendar-day"></i> {selLabel}</h3></div>
                        <div className="panel-body">
                            {selEvents.length === 0 && selPreps.length === 0 && <div className="empty-state">Geen items op deze dag</div>}
                            {selEvents.map(function (ev) {
                                return (
                                    <div key={ev.id} className="side-row" style={{ padding: 12, marginBottom: 8, borderLeft: '3px solid var(--brand)' }}>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontWeight: 800, fontSize: 13 }}>{ev.name.toUpperCase()}</div>
                                            <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>{ev.guests} GASTEN • {ev.location || '—'}</div>
                                        </div>
                                        <span className={'pill pill-' + (ev.status === 'confirmed' ? 'green' : ev.status === 'completed' ? 'green' : 'amber')} style={{ fontSize: 9 }}>{{ confirmed: 'Bevestigd', completed: 'Afgerond', pending: 'Nieuw', optie: 'Optie' }[ev.status] || ev.status}</span>
                                    </div>
                                );
                            })}
                            {selPreps.map(function (pp) {
                                return (
                                    <div key={pp.task.id} className="side-row" style={{ padding: 12, marginBottom: 8, opacity: pp.task.done ? 0.4 : 1 }}>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontWeight: 600, fontSize: 12, textDecoration: pp.task.done ? 'line-through' : 'none' }}>{pp.task.text}</div>
                                            <div style={{ fontSize: 9, color: 'var(--muted)', marginTop: 2 }}>📌 {pp.event ? pp.event.name : '—'}</div>
                                        </div>
                                        <button className="tab-btn" style={{ padding: '4px 8px' }} onClick={function () { toggleTask(pp.task); }}>{pp.task.done ? 'UNDO' : 'DONE'}</button>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {showEventForm && (
                        <div className="panel mb-16">
                            <div className="panel-head"><h3>NIEUW EVENT</h3></div>
                            <div className="panel-body">
                                <div className="form-grid">
                                    <div className="field full"><label>Event Naam</label><input value={newEvent.name} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setNewEvent(Object.assign({}, newEvent, { name: e.target.value })); }} /></div>
                                    <div className="field"><label>Datum</label><input type="date" value={newEvent.date || selected} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setNewEvent(Object.assign({}, newEvent, { date: e.target.value })); }} /></div>
                                    <div className="field"><label>Gasten</label><input type="number" value={newEvent.guests} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setNewEvent(Object.assign({}, newEvent, { guests: parseInt(e.target.value) || 0 })); }} /></div>
                                </div>
                                <button className="btn-brand mt-20" style={{ width: '100%' }} onClick={addEvent}>OPSLAAN</button>
                            </div>
                        </div>
                    )}

                    <div className="panel">
                        <div className="panel-head">
                            <h3>PREP-TAKEN</h3>
                            <button className="tab-btn" onClick={function () { setShowPrepForm(!showPrepForm); }}>+ TAAK</button>
                        </div>
                        <div className="panel-body">
                            {showPrepForm && (
                                <div className="artisan-panel mb-16" style={{ padding: 16 }}>
                                    <div className="field mb-16"><label>Taak</label><input value={newTask.text} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setNewTask(Object.assign({}, newTask, { text: e.target.value })); }} /></div>
                                    <button className="btn-brand" onClick={addPrepTask}>TOEVOEGEN</button>
                                </div>
                            )}
                            {undonePreps.slice(0, 5).map(function (pp) {
                                return (
                                    <div key={pp.task.id} style={{ fontSize: 12, padding: '8px 0', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between' }}>
                                        <span>{pp.task.text}</span>
                                        <span style={{ fontSize: 10, color: 'var(--brand)' }}>{fmtNl(pp.prepDate as string)}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
