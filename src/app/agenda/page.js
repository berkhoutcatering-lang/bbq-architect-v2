'use client';
import { useState } from 'react';
import { useSupabase } from '@/lib/useSupabase';
import { useToast } from '@/components/Toast';
import { fmt, fmtNl, today, MAANDEN } from '@/lib/utils';

export default function Agenda() {
    var { data: events, insert: insertEvent } = useSupabase('events', []);
    var { data: prepTasks, insert: insertPrep, update: updatePrep, remove: removePrep } = useSupabase('prep_tasks', []);
    var { data: suggestions, remove: removeSuggestion } = useSupabase('prep_suggestions', []);
    var showToast = useToast();
    var [year, setYear] = useState(new Date().getFullYear());
    var [month, setMonth] = useState(new Date().getMonth());
    var [selected, setSelected] = useState(today());
    var [showPrepForm, setShowPrepForm] = useState(false);
    var [showEventForm, setShowEventForm] = useState(false);
    var [newTask, setNewTask] = useState({ event_id: '', text: '', dagen: -1 });
    var [newEvent, setNewEvent] = useState({ name: '', date: '', guests: 50, location: '', ppp: 45, status: 'pending', client_naam: '', client_adres: '', client_tel: '', client_email: '', type: 'Particulier', notitie: '' });

    function prevMonth() { if (month === 0) { setMonth(11); setYear(year - 1); } else { setMonth(month - 1); } }
    function nextMonth() { if (month === 11) { setMonth(0); setYear(year + 1); } else { setMonth(month + 1); } }
    function goToday() { var now = new Date(); setYear(now.getFullYear()); setMonth(now.getMonth()); setSelected(today()); }

    // Build calendar grid
    var firstDay = new Date(year, month, 1).getDay();
    var daysInMonth = new Date(year, month + 1, 0).getDate();
    var prevDays = new Date(year, month, 0).getDate();
    var startOffset = (firstDay + 6) % 7;

    var cells = [];
    for (var i = startOffset - 1; i >= 0; i--) {
        var pd = new Date(year, month, -i);
        cells.push({ day: prevDays - i, other: true, date: pd.getFullYear() + '-' + String(pd.getMonth() + 1).padStart(2, '0') + '-' + String(pd.getDate()).padStart(2, '0') });
    }
    for (var d = 1; d <= daysInMonth; d++) {
        var dateStr = year + '-' + String(month + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
        cells.push({ day: d, other: false, date: dateStr });
    }
    var remaining = 7 - (cells.length % 7);
    if (remaining < 7) {
        for (var r = 1; r <= remaining; r++) {
            var nd = new Date(year, month + 1, r);
            cells.push({ day: r, other: true, date: nd.getFullYear() + '-' + String(nd.getMonth() + 1).padStart(2, '0') + '-' + String(nd.getDate()).padStart(2, '0') });
        }
    }

    var todayStr = today();

    // Helper: get prep-task date
    function getPrepDate(task) {
        var ev = events.find(function (e) { return e.id === task.event_id; });
        if (!ev || !ev.date) return null;
        var evDate = new Date(ev.date + 'T00:00:00');
        var prepDate = new Date(evDate);
        prepDate.setDate(prepDate.getDate() + (task.dagen || 0));
        return prepDate.getFullYear() + '-' + String(prepDate.getMonth() + 1).padStart(2, '0') + '-' + String(prepDate.getDate()).padStart(2, '0');
    }

    // Get events for a date
    function eventsForDate(ds) { return events.filter(function (e) { return e.date === ds; }); }

    // Get prep tasks for a date
    function prepsForDate(ds) {
        return prepTasks.filter(function (pt) { return getPrepDate(pt) === ds; }).map(function (pt) {
            return { task: pt, event: events.find(function (e) { return e.id === pt.event_id; }) };
        });
    }

    // Selected day items
    var selEvents = eventsForDate(selected);
    var selPreps = prepsForDate(selected);
    var selDate = new Date(selected + 'T00:00:00');
    var dagNamen = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag'];
    var selLabel = dagNamen[selDate.getDay()] + ' ' + selDate.getDate() + ' ' + MAANDEN[selDate.getMonth()].toLowerCase();

    // All prep tasks sorted
    var allPreps = prepTasks.map(function (pt) {
        var ev = events.find(function (e) { return e.id === pt.event_id; });
        var pd = getPrepDate(pt);
        return { task: pt, event: ev, prepDate: pd };
    }).filter(function (p) { return p.prepDate; }).sort(function (a, b) { return a.prepDate < b.prepDate ? -1 : 1; });

    var undonePreps = allPreps.filter(function (p) { return !p.task.done; });
    var donePreps = allPreps.filter(function (p) { return p.task.done; });

    function toggleTask(task) {
        updatePrep(task.id, { done: !task.done }).then(function () { showToast(task.done ? 'Taak heropend' : 'Taak afgerond ✓', 'success'); });
    }

    function addPrepTask() {
        if (!newTask.event_id || !newTask.text) { showToast('Vul alle velden in', 'error'); return; }
        insertPrep({ event_id: parseInt(newTask.event_id), text: newTask.text, dagen: parseInt(newTask.dagen), done: false })
            .then(function () { showToast('Prep-taak toegevoegd', 'success'); setNewTask({ event_id: '', text: '', dagen: -1 }); setShowPrepForm(false); });
    }

    function addEvent() {
        if (!newEvent.name) { showToast('Vul een eventnaam in', 'error'); return; }
        var eventData = Object.assign({}, newEvent, { date: newEvent.date || selected });
        insertEvent(eventData).then(function () {
            showToast('Event "' + eventData.name + '" aangemaakt 🔥', 'success');
            setNewEvent({ name: '', date: '', guests: 50, location: '', ppp: 45, status: 'pending', client_naam: '', client_adres: '', client_tel: '', client_email: '', type: 'Particulier', notitie: '' });
            setShowEventForm(false);
        });
    }

    return (
        <>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
                <div>
                    <h1 style={{ fontSize: 20, fontWeight: 900, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <i className="fa-solid fa-calendar-days" style={{ color: 'var(--brand)' }}></i> Agenda
                    </h1>
                    <p style={{ color: 'var(--muted)', fontSize: 11, marginTop: 3 }}>
                        {events.length} events · {prepTasks.filter(function (p) { return !p.done; }).length} open prep-taken
                    </p>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-ghost btn-sm" onClick={goToday}>Vandaag</button>
                    <button className="btn btn-brand btn-sm" onClick={function () { setShowEventForm(!showEventForm); setShowPrepForm(false); }}>
                        <i className="fa-solid fa-plus"></i> Nieuw Event
                    </button>
                </div>
            </div>

            {/* Agenda layout: calendar + side panel */}
            <div className="agenda-layout">
                {/* Calendar */}
                <div>
                    <div className="calendar">
                        <div className="cal-header">
                            <button className="cal-nav" onClick={prevMonth}><i className="fa-solid fa-chevron-left"></i></button>
                            <h3>{MAANDEN[month]} {year}</h3>
                            <button className="cal-nav" onClick={nextMonth}><i className="fa-solid fa-chevron-right"></i></button>
                        </div>
                        <div className="cal-grid">
                            {['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo'].map(function (dn) { return <div key={dn} className="cal-day-name">{dn}</div>; })}
                            {cells.map(function (cell, idx) {
                                var dayEvts = eventsForDate(cell.date);
                                var dayPreps = prepsForDate(cell.date);
                                var cls = 'cal-cell' + (cell.other ? ' other-month' : '') + (cell.date === todayStr ? ' today' : '') + (cell.date === selected ? ' selected' : '');
                                return (
                                    <div key={idx} className={cls} onClick={function () { setSelected(cell.date); }}>
                                        <div className="cal-num">{cell.day}</div>
                                        {dayEvts.map(function (ev) {
                                            return <div key={ev.id} className="cal-dot cal-dot-event" title={ev.name}>
                                                <i className="fa-solid fa-fire" style={{ fontSize: 7, marginRight: 3 }}></i>
                                                {ev.name.split(' ').slice(0, 2).join(' ')}
                                            </div>;
                                        })}
                                        {dayPreps.slice(0, 2).map(function (pp, i) {
                                            return <div key={i} className="cal-dot cal-dot-prep" title={pp.task.text}>
                                                <i className="fa-solid fa-clipboard-check" style={{ fontSize: 7, marginRight: 3 }}></i>
                                                {pp.task.text.split(' ').slice(0, 3).join(' ')}
                                            </div>;
                                        })}
                                        {dayPreps.length > 2 && <div className="cal-dot cal-dot-prep" style={{ textAlign: 'center' }}>+{dayPreps.length - 2} meer</div>}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* Side panel */}
                <div className="agenda-side">
                    {/* Selected Day Detail */}
                    <div className="panel" style={{ marginBottom: 16 }}>
                        <div className="panel-head">
                            <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <i className="fa-solid fa-calendar-day" style={{ color: 'var(--brand)', fontSize: 12 }}></i> {selLabel}
                            </h3>
                        </div>
                        <div className="panel-body" style={{ padding: 14 }}>
                            {selEvents.length === 0 && selPreps.length === 0 && (
                                <div style={{ textAlign: 'center', padding: 16 }}>
                                    <div style={{ fontSize: 28, marginBottom: 6 }}>📭</div>
                                    <p style={{ color: 'var(--muted)', fontSize: 12, fontWeight: 700 }}>Geen items op deze dag</p>
                                </div>
                            )}

                            {/* Events on this day */}
                            {selEvents.map(function (ev) {
                                return (
                                    <div key={ev.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 10, background: 'rgba(255,140,0,.06)', border: '1px solid rgba(255,140,0,.2)', borderRadius: 10, marginBottom: 8 }}>
                                        <div style={{ width: 32, height: 32, borderRadius: 10, background: 'rgba(255,140,0,.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                            <i className="fa-solid fa-fire" style={{ color: 'var(--brand)', fontSize: 12 }}></i>
                                        </div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontWeight: 800, fontSize: 12 }}>{ev.name}</div>
                                            <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>
                                                {ev.guests} gasten · {ev.location || '—'} · {fmt((ev.guests || 0) * (ev.ppp || 0))}
                                            </div>
                                        </div>
                                        <span className={'pill ' + (ev.status === 'confirmed' ? 'pill-green' : 'pill-amber')} style={{ fontSize: 9, padding: '3px 8px' }}>
                                            {ev.status === 'confirmed' ? '✓' : '⏳'}
                                        </span>
                                    </div>
                                );
                            })}

                            {/* Prep tasks on this day */}
                            {selPreps.map(function (pp) {
                                var isDone = pp.task.done;
                                return (
                                    <div key={pp.task.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 8, background: 'rgba(167,139,250,.06)', border: '1px solid rgba(167,139,250,.15)', borderRadius: 10, marginBottom: 6, opacity: isDone ? 0.45 : 1 }}>
                                        <button className={'check-box' + (isDone ? ' checked' : '')} onClick={function () { toggleTask(pp.task); }} style={{ width: 24, height: 24, borderRadius: 8 }}>
                                            {isDone && <i className="fa-solid fa-check" style={{ fontSize: 9 }}></i>}
                                        </button>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontWeight: 700, fontSize: 11, textDecoration: isDone ? 'line-through' : 'none', color: isDone ? 'var(--muted)' : 'var(--text)' }}>{pp.task.text}</div>
                                            <div style={{ fontSize: 9, color: 'var(--muted)', marginTop: 1 }}>📌 {pp.event ? pp.event.name : 'Onbekend'}</div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* New Event Form */}
                    {showEventForm && (
                        <div className="panel" style={{ marginBottom: 16 }}>
                            <div className="panel-head">
                                <h3 style={{ color: 'var(--brand)' }}><i className="fa-solid fa-fire" style={{ marginRight: 6, fontSize: 12 }}></i> Nieuw Event</h3>
                                <button className="btn btn-ghost btn-sm" onClick={function () { setShowEventForm(false); }}>
                                    <i className="fa-solid fa-xmark"></i>
                                </button>
                            </div>
                            <div className="panel-body">
                                <div className="form-grid">
                                    <div className="field full">
                                        <label>Event Naam</label>
                                        <input value={newEvent.name} onChange={function (e) { setNewEvent(Object.assign({}, newEvent, { name: e.target.value })); }} placeholder="bijv. Familie BBQ de Vries" />
                                    </div>
                                    <div className="field">
                                        <label>Datum</label>
                                        <input type="date" value={newEvent.date || selected} onChange={function (e) { setNewEvent(Object.assign({}, newEvent, { date: e.target.value })); }} />
                                    </div>
                                    <div className="field">
                                        <label>Locatie</label>
                                        <input value={newEvent.location} onChange={function (e) { setNewEvent(Object.assign({}, newEvent, { location: e.target.value })); }} placeholder="bijv. Assen" />
                                    </div>
                                    <div className="field">
                                        <label>Aantal Gasten</label>
                                        <input type="number" value={newEvent.guests} onChange={function (e) { setNewEvent(Object.assign({}, newEvent, { guests: parseInt(e.target.value) || 0 })); }} />
                                    </div>
                                    <div className="field">
                                        <label>Prijs per Persoon</label>
                                        <input type="number" step="0.50" value={newEvent.ppp} onChange={function (e) { setNewEvent(Object.assign({}, newEvent, { ppp: parseFloat(e.target.value) || 0 })); }} />
                                    </div>
                                    <div className="field">
                                        <label>Type</label>
                                        <select value={newEvent.type} onChange={function (e) { setNewEvent(Object.assign({}, newEvent, { type: e.target.value })); }}>
                                            {['Particulier', 'Zakelijk', 'Festival', 'Bruiloft'].map(function (t) { return <option key={t}>{t}</option>; })}
                                        </select>
                                    </div>
                                    <div className="field">
                                        <label>Status</label>
                                        <select value={newEvent.status} onChange={function (e) { setNewEvent(Object.assign({}, newEvent, { status: e.target.value })); }}>
                                            <option value="pending">In afwachting</option>
                                            <option value="confirmed">Bevestigd</option>
                                        </select>
                                    </div>
                                </div>
                                {/* Geschatte omzet */}
                                <div style={{ marginTop: 12, padding: 10, background: 'var(--bg)', borderRadius: 10, border: '1px solid var(--border)', textAlign: 'center' }}>
                                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>Geschatte omzet: </span>
                                    <span style={{ fontSize: 16, fontWeight: 900, color: 'var(--brand)' }}>{fmt((newEvent.guests || 0) * (newEvent.ppp || 0))}</span>
                                </div>
                                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                                    <button className="btn btn-brand btn-sm" onClick={addEvent} style={{ flex: 1, justifyContent: 'center' }}>
                                        <i className="fa-solid fa-plus"></i> Event Aanmaken
                                    </button>
                                    <button className="btn btn-ghost btn-sm" onClick={function () { setShowEventForm(false); }}>Annuleren</button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Smart Prep Suggestions from Data Center */}
                    {suggestions.filter(function (s) { return s.status === 'pending'; }).length > 0 && (
                        <div className="panel" style={{ marginBottom: 16 }}>
                            <div className="panel-head">
                                <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <i className="fa-solid fa-robot" style={{ color: 'var(--purple)', fontSize: 12 }}></i> Smart Suggesties
                                </h3>
                                <span className="pill pill-amber" style={{ fontSize: 9 }}>
                                    {suggestions.filter(function (s) { return s.status === 'pending'; }).length} actief
                                </span>
                            </div>
                            <div className="panel-body" style={{ padding: 10 }}>
                                {suggestions.filter(function (s) { return s.status === 'pending'; }).map(function (sug) {
                                    return (
                                        <div key={sug.id} className="prep-suggestion">
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                                                <i className="fa-solid fa-lightbulb" style={{ color: '#FFBF00', fontSize: 11 }}></i>
                                                <span style={{ fontWeight: 800, fontSize: 12 }}>{sug.task_name}</span>
                                            </div>
                                            <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 8 }}>
                                                Tekort: <span style={{ color: 'var(--red)', fontWeight: 700 }}>{sug.tekort} {sug.unit}</span> · {sug.ingredient_naam}
                                            </div>
                                            <div style={{ display: 'flex', gap: 6 }}>
                                                <button className="btn btn-brand btn-sm" style={{ fontSize: 10, padding: '3px 10px' }}
                                                    onClick={function () {
                                                        // Find next empty day
                                                        var tomorrow = new Date();
                                                        tomorrow.setDate(tomorrow.getDate() + 1);
                                                        var sugDate = tomorrow.getFullYear() + '-' + String(tomorrow.getMonth() + 1).padStart(2, '0') + '-' + String(tomorrow.getDate()).padStart(2, '0');
                                                        // Find any event to link to, or use first event
                                                        var firstEvent = events[0];
                                                        if (firstEvent) {
                                                            insertPrep({ event_id: firstEvent.id, text: sug.task_name, dagen: 0, done: false })
                                                                .then(function () {
                                                                    removeSuggestion(sug.id);
                                                                    showToast('✅ Prep-taak ingepland', 'success');
                                                                });
                                                        } else {
                                                            removeSuggestion(sug.id);
                                                            showToast('Geen event om aan te koppelen', 'info');
                                                        }
                                                    }}>
                                                    <i className="fa-solid fa-check" style={{ fontSize: 8 }}></i> Accepteer
                                                </button>
                                                <button className="btn btn-ghost btn-sm" style={{ fontSize: 10, padding: '3px 10px' }}
                                                    onClick={function () { removeSuggestion(sug.id); }}>
                                                    <i className="fa-solid fa-xmark" style={{ fontSize: 8 }}></i> Negeer
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}


                    {/* Prep Tasks Overview */}
                    <div className="panel">
                        <div className="panel-head">
                            <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <i className="fa-solid fa-clipboard-list" style={{ color: 'var(--purple)', fontSize: 12 }}></i> Prep-Taken
                            </h3>
                            <button className="btn btn-ghost btn-sm" onClick={function () { setShowPrepForm(!showPrepForm); setShowEventForm(false); }}>
                                <i className="fa-solid fa-plus"></i> Taak
                            </button>
                        </div>
                        <div className="panel-body" style={{ padding: 10 }}>
                            {/* Add prep form */}
                            {showPrepForm && (
                                <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 12, padding: 12, marginBottom: 10 }}>
                                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--brand)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Nieuwe Prep-taak</div>
                                    <div className="field" style={{ marginBottom: 8 }}>
                                        <label>Event</label>
                                        <select value={newTask.event_id} onChange={function (e) { setNewTask(Object.assign({}, newTask, { event_id: e.target.value })); }}>
                                            <option value="">Kies event...</option>
                                            {events.map(function (ev) { return <option key={ev.id} value={ev.id}>{ev.name} ({ev.date})</option>; })}
                                        </select>
                                    </div>
                                    <div className="field" style={{ marginBottom: 8 }}>
                                        <label>Taak</label>
                                        <input value={newTask.text} onChange={function (e) { setNewTask(Object.assign({}, newTask, { text: e.target.value })); }} placeholder="bijv. Vlees marineren..." />
                                    </div>
                                    <div className="field" style={{ marginBottom: 10 }}>
                                        <label>Dagen voor event</label>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <input type="number" value={Math.abs(newTask.dagen)} min="0" max="30" style={{ width: 70 }}
                                                onChange={function (e) { setNewTask(Object.assign({}, newTask, { dagen: -Math.abs(parseInt(e.target.value) || 1) })); }} />
                                            <span style={{ fontSize: 10, color: 'var(--muted)' }}>dagen van tevoren</span>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: 8 }}>
                                        <button className="btn btn-brand btn-sm" onClick={addPrepTask}><i className="fa-solid fa-plus" style={{ fontSize: 9 }}></i> Toevoegen</button>
                                        <button className="btn btn-ghost btn-sm" onClick={function () { setShowPrepForm(false); }}>Annuleren</button>
                                    </div>
                                </div>
                            )}

                            {/* Undone prep tasks */}
                            {undonePreps.length === 0 && donePreps.length === 0 && !showPrepForm && (
                                <div style={{ textAlign: 'center', padding: 16 }}>
                                    <p style={{ color: 'var(--muted)', fontSize: 12 }}>Geen prep-taken</p>
                                </div>
                            )}
                            {undonePreps.map(function (pp) {
                                var isPast = pp.prepDate < todayStr;
                                var isNow = pp.prepDate === todayStr;
                                return (
                                    <div key={pp.task.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 10, background: '#111', border: '2px solid ' + (isPast ? 'rgba(239,68,68,.4)' : isNow ? 'rgba(255,140,0,.4)' : 'var(--border)'), borderRadius: 12, marginBottom: 6 }}>
                                        <button className={'check-box'} onClick={function () { toggleTask(pp.task); }} style={{ width: 24, height: 24, borderRadius: 8 }}>
                                            <div style={{ width: 6, height: 6, borderRadius: 3, background: isPast ? 'var(--red)' : isNow ? 'var(--brand)' : '#52525b' }}></div>
                                        </button>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontWeight: 800, fontSize: 12 }}>{pp.task.text}</div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                                                <span className="pill pill-amber" style={{ fontSize: 9, padding: '2px 8px', background: 'rgba(255,140,0,.12)', color: 'var(--brand)', border: 'none' }}>
                                                    {pp.event ? pp.event.name.split(' ').slice(0, 2).join(' ') : '?'}
                                                </span>
                                                <span style={{ fontSize: 9, color: 'var(--muted)' }}>
                                                    {isPast ? '⚠ Te laat!' : isNow ? '🔥 Vandaag' : '📅 ' + fmtNl(pp.prepDate)}
                                                </span>
                                            </div>
                                        </div>
                                        <button className="del-btn" onClick={function () { removePrep(pp.task.id); }} style={{ fontSize: 11 }}>
                                            <i className="fa-solid fa-xmark"></i>
                                        </button>
                                    </div>
                                );
                            })}

                            {/* Done prep tasks */}
                            {donePreps.length > 0 && (
                                <>
                                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1, padding: '8px 0 4px', marginTop: 4 }}>
                                        <i className="fa-solid fa-check" style={{ color: 'var(--green)', fontSize: 8, marginRight: 4 }}></i>
                                        Afgerond ({donePreps.length})
                                    </div>
                                    {donePreps.map(function (pp) {
                                        return (
                                            <div key={pp.task.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 8, opacity: 0.5, borderRadius: 10, marginBottom: 4 }}>
                                                <button className="check-box checked" onClick={function () { toggleTask(pp.task); }} style={{ width: 22, height: 22, borderRadius: 7 }}>
                                                    <i className="fa-solid fa-check" style={{ fontSize: 9 }}></i>
                                                </button>
                                                <span style={{ flex: 1, fontSize: 11, textDecoration: 'line-through', color: 'var(--muted)' }}>{pp.task.text}</span>
                                            </div>
                                        );
                                    })}
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}
