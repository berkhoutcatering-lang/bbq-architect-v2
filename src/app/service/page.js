'use client';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/components/Toast';

export default function ServiceMode() {
    var showToast = useToast();
    var [offertes, setOffertes] = useState([]);
    var [selectedId, setSelectedId] = useState(null);
    var [gangen, setGangen] = useState([]);
    var [gerechtenDb, setGerechtenDb] = useState([]);
    var [bonStates, setBonStates] = useState({});
    var [timers, setTimers] = useState({});
    var [finalTimes, setFinalTimes] = useState({});
    var [expandedBon, setExpandedBon] = useState(null);
    var [historie, setHistorie] = useState([]);
    var [showHistorie, setShowHistorie] = useState(false);
    var intervalRef = useRef({});

    // ═══ THE ARCHITECT — Action Modal State ═══
    var [activeModal, setActiveModal] = useState(null); // gang slug or null
    var [modalDishIndex, setModalDishIndex] = useState(0);
    var [checkedSteps, setCheckedSteps] = useState({});
    var modalTimerRef = useRef(null);
    var modalStartRef = useRef(null);
    var [modalElapsed, setModalElapsed] = useState(0);

    // ═══ HACCP Quick-Log State ═══
    var [tempPopup, setTempPopup] = useState(null); // { slug, temp, dishName, defaultTemp }
    var [busLog, setBusLog] = useState({ koelTemp: 4, schoonmaak: false, saved: false });

    useEffect(function () {
        loadData();
        return function () {
            Object.values(intervalRef.current).forEach(clearInterval);
            if (modalTimerRef.current) clearInterval(modalTimerRef.current);
        };
    }, []);

    async function loadData() {
        var o = await supabase.from('offertes').select('*').not('menu_selectie', 'is', null).order('datum', { ascending: false });
        if (o.data) setOffertes(o.data);
        var g = await supabase.from('gangen').select('*').order('volgorde');
        if (g.data) setGangen(g.data);
        var d = await supabase.from('gerechten').select('*').order('volgorde');
        if (d.data) setGerechtenDb(d.data);
    }

    function selectEvent(offerte) {
        setSelectedId(offerte.id);
        setExpandedBon(null);
        var states = {};
        var tims = {};
        gangen.forEach(function (g) {
            states[g.slug] = 'idle';
            tims[g.slug] = { start: null, elapsed: 0 };
        });
        setBonStates(states);
        setTimers(tims);
        setFinalTimes({});
        Object.values(intervalRef.current).forEach(clearInterval);
        intervalRef.current = {};

        supabase.from('service_logs').select('*').eq('offerte_id', offerte.id).then(function (res) {
            if (res.data && res.data.length > 0) {
                var s = Object.assign({}, states);
                var ft = {};
                res.data.forEach(function (log) {
                    if (log.served_at) {
                        s[log.gang_slug] = 'served';
                        ft[log.gang_slug] = log.duration_seconds || 0;
                    } else if (log.started_at) {
                        s[log.gang_slug] = 'active';
                    }
                });
                setBonStates(s);
                setFinalTimes(ft);
            }
        });

        loadHistorie();
    }

    async function loadHistorie() {
        var res = await supabase.from('service_logs').select('*').not('served_at', 'is', null).order('started_at', { ascending: false });
        if (res.data) setHistorie(res.data);
    }

    // ═══ START GANG — Opens The Architect Modal ═══
    function startGang(slug) {
        var now = new Date();
        setBonStates(function (prev) { return Object.assign({}, prev, { [slug]: 'active' }); });
        setTimers(function (prev) { return Object.assign({}, prev, { [slug]: { start: now, elapsed: 0 } }); });

        // Start background timer for bon card
        intervalRef.current[slug] = setInterval(function () {
            setTimers(function (prev) {
                var t = prev[slug];
                if (!t || !t.start) return prev;
                var elapsed = Math.floor((Date.now() - t.start.getTime()) / 1000);
                return Object.assign({}, prev, { [slug]: { start: t.start, elapsed: elapsed } });
            });
        }, 1000);

        // Save to DB
        supabase.from('service_logs').insert([{
            offerte_id: selectedId,
            gang_slug: slug,
            started_at: now.toISOString()
        }]);

        // Open The Architect modal
        setActiveModal(slug);
        setModalDishIndex(0);
        setCheckedSteps({});
        setModalElapsed(0);
        modalStartRef.current = now;

        // Start modal timer
        if (modalTimerRef.current) clearInterval(modalTimerRef.current);
        modalTimerRef.current = setInterval(function () {
            if (modalStartRef.current) {
                setModalElapsed(Math.floor((Date.now() - modalStartRef.current.getTime()) / 1000));
            }
        }, 100);

        showToast('🔥 The Architect — GO!', 'info');
    }

    // ═══ FINISH GANG — Now shows Quick-Log popup first ═══
    function requestFinishGang(slug) {
        // Find dish names for this gang
        var dishNames = menuSelectie[slug] || [];
        var dishName = dishNames.length > 0 ? dishNames.join(', ') : slug;
        // Smart default temp based on gang type
        var defaultTemp = 75; // kern temp default
        var gangObj = gangen.find(function (g) { return g.slug === slug; });
        if (gangObj) {
            var gangNaam = (gangObj.naam || '').toLowerCase();
            if (gangNaam.indexOf('dessert') >= 0 || gangNaam.indexOf('ijs') >= 0) defaultTemp = 4;
            else if (gangNaam.indexOf('amuse') >= 0 || gangNaam.indexOf('bite') >= 0) defaultTemp = 65;
        }
        setTempPopup({ slug: slug, temp: defaultTemp, dishName: dishName, defaultTemp: defaultTemp });
    }

    async function confirmTempAndFinish() {
        if (!tempPopup) return;
        var slug = tempPopup.slug;
        // Save HACCP record
        try {
            await supabase.from('haccp_records').insert([{
                event_id: null,
                offerte_id: String(selectedId),
                gang_slug: slug,
                type: 'kern',
                check_type: 'uitgifte',
                wat: tempPopup.dishName,
                temp: tempPopup.temp,
                datum: new Date().toISOString().slice(0, 10),
                tijd: new Date().toTimeString().slice(0, 5),
                chef: 'Cor',
                status: tempPopup.temp >= 75 ? 'ok' : tempPopup.temp >= 65 ? 'warn' : tempPopup.temp <= 7 ? 'ok' : 'danger',
                auto_logged: true,
                notitie: 'Quick-log via Service Mode'
            }]);
        } catch (e) { console.error('[HACCP] Quick-log error:', e); }
        setTempPopup(null);
        finishGang(slug);
    }

    function skipTempAndFinish() {
        if (!tempPopup) return;
        var slug = tempPopup.slug;
        setTempPopup(null);
        finishGang(slug);
    }

    async function finishGang(slug) {
        var now = new Date();
        var elapsed = modalElapsed;

        // Stop modal timer
        if (modalTimerRef.current) {
            clearInterval(modalTimerRef.current);
            modalTimerRef.current = null;
        }

        // Stop bon timer
        if (intervalRef.current[slug]) {
            clearInterval(intervalRef.current[slug]);
            delete intervalRef.current[slug];
        }

        // Update states
        setBonStates(function (prev) { return Object.assign({}, prev, { [slug]: 'served' }); });
        setFinalTimes(function (prev) { return Object.assign({}, prev, { [slug]: elapsed }); });
        setTimers(function (prev) { return Object.assign({}, prev, { [slug]: { start: null, elapsed: elapsed } }); });

        // Save to DB
        await supabase.from('service_logs')
            .update({
                served_at: now.toISOString(),
                duration_seconds: elapsed
            })
            .eq('offerte_id', selectedId)
            .eq('gang_slug', slug)
            .is('served_at', null);

        // Close modal
        setActiveModal(null);
        modalStartRef.current = null;

        showToast('✅ Gang uitgeserveerd! ' + formatTime(elapsed));
        loadHistorie();
    }

    // ═══ BUS-LOG — Pre-departure HACCP checks ═══
    async function saveBusLog() {
        try {
            await supabase.from('haccp_records').insert([
                {
                    offerte_id: String(selectedId),
                    type: 'koeling',
                    check_type: 'opslag',
                    wat: 'Koeling bus (vertrek)',
                    temp: busLog.koelTemp,
                    datum: new Date().toISOString().slice(0, 10),
                    tijd: new Date().toTimeString().slice(0, 5),
                    chef: 'Cor',
                    status: busLog.koelTemp >= 0 && busLog.koelTemp <= 7 ? 'ok' : busLog.koelTemp <= 10 ? 'warn' : 'danger',
                    auto_logged: false,
                    notitie: 'Bus-Log vertrekcheck'
                },
                {
                    offerte_id: String(selectedId),
                    type: 'kern',
                    check_type: 'bereiding',
                    wat: 'Schoonmaak & hygiëne check',
                    temp: 0,
                    datum: new Date().toISOString().slice(0, 10),
                    tijd: new Date().toTimeString().slice(0, 5),
                    chef: 'Cor',
                    status: busLog.schoonmaak ? 'ok' : 'danger',
                    auto_logged: false,
                    notitie: busLog.schoonmaak ? 'Materialen + Yoders OK' : 'Schoonmaak NIET bevestigd'
                }
            ]);
            setBusLog(Object.assign({}, busLog, { saved: true }));
            showToast('✅ Bus-Log opgeslagen — HACCP dossier compleet');
        } catch (e) {
            console.error('[HACCP] Bus-Log error:', e);
            showToast('Fout bij opslaan Bus-Log', 'error');
        }
    }

    function formatTime(seconds) {
        var m = Math.floor(seconds / 60);
        var s = seconds % 60;
        return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
    }

    function getAvgTime(slug) {
        var gangLogs = historie.filter(function (h) { return h.gang_slug === slug && h.duration_seconds > 0; });
        if (gangLogs.length === 0) return null;
        var total = gangLogs.reduce(function (sum, h) { return sum + h.duration_seconds; }, 0);
        return Math.round(total / gangLogs.length);
    }

    var selected = offertes.find(function (o) { return o.id === selectedId; });
    var menuSelectie = selected && selected.menu_selectie ? (typeof selected.menu_selectie === 'string' ? JSON.parse(selected.menu_selectie) : selected.menu_selectie) : {};
    var aantalNormaal = (selected ? (selected.aantal_gasten || 0) - (selected.aantal_vega || 0) : 0);
    var aantalVega = selected ? (selected.aantal_vega || 0) : 0;

    var allServed = gangen.length > 0 && gangen.every(function (g) { return bonStates[g.slug] === 'served'; });

    function getHistoriePerEvent() {
        var eventMap = {};
        historie.forEach(function (log) {
            if (!eventMap[log.offerte_id]) eventMap[log.offerte_id] = [];
            eventMap[log.offerte_id].push(log);
        });
        return Object.keys(eventMap).map(function (oid) {
            var off = offertes.find(function (o) { return o.id === oid; });
            return {
                offerte_id: oid,
                naam: off ? off.client_naam : 'Onbekend',
                datum: off ? off.datum : '',
                logs: eventMap[oid]
            };
        }).slice(0, 10);
    }

    // ═══ ARCHITECT MODAL — Get dishes for active gang ═══
    var modalGang = activeModal ? gangen.find(function (g) { return g.slug === activeModal; }) : null;
    var modalDishNames = activeModal && menuSelectie[activeModal] ? menuSelectie[activeModal] : [];
    var modalDishes = modalDishNames.map(function (name) {
        return gerechtenDb.find(function (g) { return g.naam === name && g.gang_slug === activeModal; }) || { naam: name };
    });
    var currentDish = modalDishes[modalDishIndex] || {};
    var currentSteps = currentDish.battle_plan_steps || [];
    var currentImage = currentDish.service_image || currentDish.foto_url || '';
    var targetTime = currentDish.target_prep_time || 0;
    var isOvertime = targetTime > 0 && modalElapsed > targetTime;

    // Toggle check step
    function toggleStep(stepIdx) {
        var key = modalDishIndex + '_' + stepIdx;
        setCheckedSteps(function (prev) {
            var next = Object.assign({}, prev);
            next[key] = !next[key];
            return next;
        });
    }

    return (
        <div className="main-content" style={{ maxWidth: 1200 }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 20 }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#B48C14" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'text-bottom', marginRight: 8 }}><path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" /></svg>
                Service Mode — The Architect
            </h2>

            {!selectedId ? (
                <div>
                    <p style={{ color: 'var(--muted)', marginBottom: 16 }}>Selecteer een event om de service te starten:</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {offertes.map(function (o) {
                            return (
                                <div key={o.id} className="ev-row" onClick={function () { selectEvent(o); }}>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontWeight: 600 }}>{o.client_naam || 'Onbekend'}</div>
                                        <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                                            {o.datum} • {o.aantal_gasten || '?'} gasten
                                            {o.aantal_vega > 0 && ' (' + o.aantal_vega + ' vega)'}
                                        </div>
                                    </div>
                                    <span className={'pill pill-' + (o.status === 'definitief' ? 'green' : 'amber')}>{o.status}</span>
                                </div>
                            );
                        })}
                        {offertes.length === 0 && (
                            <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>
                                Geen offertes met menu gevonden. Maak eerst een menu-offerte aan.
                            </div>
                        )}
                    </div>

                    {/* Timing Historie */}
                    {historie.length > 0 && (
                        <div style={{ marginTop: 32 }}>
                            <button className="btn btn-ghost btn-sm" onClick={function () { setShowHistorie(!showHistorie); }} style={{ marginBottom: 12 }}>
                                📊 {showHistorie ? 'Verberg' : 'Toon'} Timing Historie
                            </button>
                            {showHistorie && (
                                <div className="timing-history">
                                    <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1 }}>
                                        ⏱️ Gemiddelde Tijden per Gang
                                    </h3>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 20 }}>
                                        {gangen.map(function (gang) {
                                            var avg = getAvgTime(gang.slug);
                                            return (
                                                <div key={gang.slug} className="timing-avg-row">
                                                    <span>{gang.naam}</span>
                                                    <span style={{ fontWeight: 700, color: avg ? '#B48C14' : 'var(--muted)' }}>
                                                        {avg ? formatTime(avg) : '—'}
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>

                                    <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1 }}>
                                        📅 Eerdere Events
                                    </h3>
                                    {getHistoriePerEvent().map(function (ev) {
                                        return (
                                            <div key={ev.offerte_id} className="timing-event-card">
                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                                                    <span style={{ fontWeight: 600 }}>{ev.naam}</span>
                                                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>{ev.datum}</span>
                                                </div>
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                                    {ev.logs.map(function (log, i) {
                                                        var gang = gangen.find(function (g) { return g.slug === log.gang_slug; });
                                                        return (
                                                            <span key={i} className="timing-event-tag">
                                                                {gang ? gang.naam : log.gang_slug}: {formatTime(log.duration_seconds || 0)}
                                                            </span>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            ) : (
                <div>
                    {/* Event Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, padding: '16px 20px', background: 'var(--card)', borderRadius: 14, border: 'var(--glass-border)' }}>
                        <div>
                            <div style={{ fontWeight: 700, fontSize: 16 }}>{selected.client_naam}</div>
                            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                                {selected.datum} • {selected.aantal_gasten} gasten
                                <span style={{ color: '#B48C14', marginLeft: 8 }}>🍖 {aantalNormaal} normaal</span>
                                {aantalVega > 0 && <span style={{ color: '#6B7A2F', marginLeft: 8 }}>🌿 {aantalVega} vega</span>}
                            </div>
                        </div>
                        <button className="btn btn-ghost btn-sm" onClick={function () { setSelectedId(null); }}>← Terug</button>
                    </div>

                    {/* Bonnen Grid */}
                    <div className="bon-grid">
                        {gangen.map(function (gang, idx) {
                            var state = bonStates[gang.slug] || 'idle';
                            var dishNames = menuSelectie[gang.slug] || [];
                            var elapsed = state === 'served' ? (finalTimes[gang.slug] || 0) : (timers[gang.slug] ? timers[gang.slug].elapsed : 0);
                            var isExpanded = expandedBon === gang.slug;
                            var avgTime = getAvgTime(gang.slug);

                            var dishDetails = dishNames.map(function (name) {
                                return gerechtenDb.find(function (g) { return g.naam === name && g.gang_slug === gang.slug; }) || { naam: name };
                            });

                            return (
                                <div key={gang.slug} className={'bon-card bon-' + state + (isExpanded ? ' bon-expanded' : '')}>
                                    {/* Bon Header */}
                                    <div
                                        className="bon-header-clickable"
                                        onClick={function () { setExpandedBon(isExpanded ? null : gang.slug); }}
                                    >
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <div className="bon-gang-title">Gang {idx + 1} — {gang.naam}</div>
                                            <span style={{ fontSize: 18, opacity: 0.4, transition: 'transform .2s', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0)' }}>▼</span>
                                        </div>
                                        {avgTime && state === 'idle' && (
                                            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: -8, marginBottom: 4 }}>
                                                Gem. {formatTime(avgTime)}
                                            </div>
                                        )}
                                    </div>

                                    {/* Compact: alleen dishes + qty */}
                                    {!isExpanded && (
                                        <div>
                                            {dishNames.map(function (dish, i) {
                                                return (
                                                    <div key={i} className="bon-dish-line">
                                                        <span className="bon-dish-qty">[{aantalNormaal}]x</span>
                                                        {dish}
                                                    </div>
                                                );
                                            })}
                                            {aantalVega > 0 && (
                                                <div className="bon-dish-line" style={{ marginTop: 6, borderTop: '1px solid rgba(255,255,255,.06)', paddingTop: 6 }}>
                                                    <span className="bon-dish-qty" style={{ color: '#6B7A2F' }}>[{aantalVega}]x</span>
                                                    <span style={{ color: '#6B7A2F' }}>🌿 Vega Menu</span>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Expanded: prep schema met foto's en ingrediënten */}
                                    {isExpanded && (
                                        <div className="bon-prep-schema">
                                            {dishDetails.map(function (dish, i) {
                                                return (
                                                    <div key={i} className="bon-prep-item">
                                                        <div className="bon-prep-header">
                                                            {dish.foto_url && (
                                                                <img src={dish.foto_url} alt={dish.naam} className="bon-prep-foto" />
                                                            )}
                                                            <div className="bon-prep-info">
                                                                <div className="bon-prep-name">
                                                                    <span className="bon-dish-qty">[{aantalNormaal}]x</span>
                                                                    {dish.naam}
                                                                </div>
                                                                {dish.beschrijving && (
                                                                    <div className="bon-prep-desc">{dish.beschrijving}</div>
                                                                )}
                                                            </div>
                                                        </div>

                                                        {dish.ingredienten && dish.ingredienten.length > 0 && (
                                                            <div className="bon-ingredient-list">
                                                                <span className="bon-ingredient-label">Ingrediënten:</span>
                                                                {dish.ingredienten.map(function (ing, j) {
                                                                    return <span key={j} className="bon-ingredient-chip">{ing}</span>;
                                                                })}
                                                            </div>
                                                        )}

                                                        {dish.bereidingswijze && (
                                                            <div className="bon-prep-text">
                                                                👨‍🍳 {dish.bereidingswijze}
                                                            </div>
                                                        )}

                                                        {/* Battle Plan preview */}
                                                        {dish.battle_plan_steps && dish.battle_plan_steps.length > 0 && (
                                                            <div style={{ marginTop: 8, padding: '8px 10px', background: 'rgba(180,140,20,.06)', borderRadius: 8, borderLeft: '3px solid #B48C14' }}>
                                                                <div style={{ fontSize: 10, fontWeight: 700, color: '#B48C14', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>⚔️ Battle Plan</div>
                                                                {dish.battle_plan_steps.map(function (step, j) {
                                                                    return <div key={j} style={{ fontSize: 12, padding: '2px 0', color: 'var(--text)' }}>{j + 1}. {step}</div>;
                                                                })}
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}

                                            {aantalVega > 0 && (
                                                <div className="bon-prep-item" style={{ borderLeft: '3px solid #6B7A2F' }}>
                                                    <div className="bon-prep-header">
                                                        <div className="bon-prep-info">
                                                            <div className="bon-prep-name" style={{ color: '#6B7A2F' }}>
                                                                <span className="bon-dish-qty" style={{ color: '#6B7A2F' }}>[{aantalVega}]x</span>
                                                                🌿 Vega Menu
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Timer */}
                                    <div className="bon-timer">{formatTime(elapsed)}</div>

                                    {/* Action Button */}
                                    {state === 'idle' && (
                                        <button className="bon-action-btn bon-start-btn" onClick={function () { startGang(gang.slug); }}>
                                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 6, verticalAlign: 'text-bottom' }}><polygon points="5 3 19 12 5 21 5 3" /></svg>
                                            START
                                        </button>
                                    )}
                                    {state === 'active' && (
                                        <button className="bon-action-btn bon-serve-btn" onClick={function () { setActiveModal(gang.slug); setModalDishIndex(0); setCheckedSteps({}); }}>
                                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 6, verticalAlign: 'text-bottom' }}><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" /></svg>
                                            OPEN ARCHITECT
                                        </button>
                                    )}
                                    {state === 'served' && (
                                        <div style={{ marginTop: 12, textAlign: 'center', fontSize: 13, color: '#6B7A2F', fontWeight: 700 }}>
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6B7A2F" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 4, verticalAlign: 'text-bottom' }}><polyline points="20 6 9 17 4 12" /></svg>
                                            Gereed in {formatTime(elapsed)}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {/* Summary after all served */}
                    {allServed && (
                        <div className="panel" style={{ marginTop: 24, padding: 20 }}>
                            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>🏁 Alle gangen geserveerd!</h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                {gangen.map(function (gang) {
                                    var secs = finalTimes[gang.slug] || 0;
                                    var avg = getAvgTime(gang.slug);
                                    return (
                                        <div key={gang.slug} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                                            <span>{gang.naam}</span>
                                            <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                                                {avg && (
                                                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>gem. {formatTime(avg)}</span>
                                                )}
                                                <span style={{ fontWeight: 700, color: '#6B7A2F' }}>{formatTime(secs)}</span>
                                            </div>
                                        </div>
                                    );
                                })}
                                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontWeight: 700 }}>
                                    <span>Totale tijd</span>
                                    <span style={{ color: '#B48C14' }}>
                                        {formatTime(Object.values(finalTimes).reduce(function (a, b) { return a + b; }, 0))}
                                    </span>
                                </div>
                            </div>

                            {/* ═══ BUS-LOG — Critical Control Points ═══ */}
                            {!busLog.saved ? (
                                <div className="bus-log-panel">
                                    <div className="bus-log-head">
                                        <i className="fa-solid fa-clipboard-check" style={{ color: '#B48C14' }}></i>
                                        <span>Bus-Log — Vertrekcheck</span>
                                    </div>

                                    <div className="bus-log-item">
                                        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>🌡️ Koeling Bus Temperatuur</div>
                                        <div className="temp-adjust-row">
                                            <button type="button" className="temp-adjust-btn" onClick={function () { setBusLog(Object.assign({}, busLog, { koelTemp: busLog.koelTemp - 1 })); }}>−</button>
                                            <div className={'temp-display' + (busLog.koelTemp >= 0 && busLog.koelTemp <= 7 ? ' temp-ok' : busLog.koelTemp <= 10 ? ' temp-warn' : ' temp-danger')}>
                                                {busLog.koelTemp}°C
                                            </div>
                                            <button type="button" className="temp-adjust-btn" onClick={function () { setBusLog(Object.assign({}, busLog, { koelTemp: busLog.koelTemp + 1 })); }}>+</button>
                                        </div>
                                        <div style={{ fontSize: 10, color: 'var(--muted)', textAlign: 'center', marginTop: 4 }}>Norm: 0-7°C</div>
                                    </div>

                                    <div className="bus-log-item">
                                        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>🧹 Schoonmaak & Hygiëne</div>
                                        <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>Materialen en Yoders gecontroleerd op hygiëne voor vertrek</div>
                                        <div style={{ display: 'flex', gap: 8 }}>
                                            <button type="button" className={'btn btn-sm ' + (busLog.schoonmaak ? 'btn-green' : 'btn-ghost')}
                                                style={{ flex: 1, fontSize: 16, padding: '12px 0' }}
                                                onClick={function () { setBusLog(Object.assign({}, busLog, { schoonmaak: true })); }}>✅ JA</button>
                                            <button type="button" className={'btn btn-sm ' + (!busLog.schoonmaak ? 'btn-red' : 'btn-ghost')}
                                                style={{ flex: 1, fontSize: 16, padding: '12px 0' }}
                                                onClick={function () { setBusLog(Object.assign({}, busLog, { schoonmaak: false })); }}>❌ NEE</button>
                                        </div>
                                    </div>

                                    <button className="btn btn-brand" style={{ width: '100%', marginTop: 12, padding: '14px 0', fontSize: 14 }} onClick={saveBusLog}>
                                        <i className="fa-solid fa-check-double"></i> Bus-Log Opslaan
                                    </button>
                                </div>
                            ) : (
                                <div style={{ marginTop: 16, padding: 16, background: 'rgba(34,197,94,.08)', border: '1px solid rgba(34,197,94,.2)', borderRadius: 12, textAlign: 'center' }}>
                                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--green)' }}>✅ Bus-Log Compleet</div>
                                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>HACCP dossier voor dit event is afgesloten</div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* ═══ THE ARCHITECT — FULLSCREEN ACTION MODAL ═══ */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            {activeModal && modalGang && (
                <div className="architect-overlay">
                    <div className="architect-modal">

                        {/* ─── TOP BAR: Timer + Gang Info ─── */}
                        <div className="architect-topbar">
                            <div className="architect-topbar-left">
                                <div className="architect-gang-badge">
                                    Gang {gangen.indexOf(modalGang) + 1}
                                </div>
                                <div className="architect-gang-name">{modalGang.naam}</div>
                                <div className="architect-guests">
                                    <span>🍖 {aantalNormaal}</span>
                                    {aantalVega > 0 && <span style={{ color: '#6B7A2F' }}>🌿 {aantalVega}</span>}
                                </div>
                            </div>

                            <div className={'architect-timer' + (isOvertime ? ' architect-timer-overtime' : '')}>
                                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="architect-timer-icon">
                                    <path d="M12 2v4" /><path d="M12 18v4" /><circle cx="12" cy="12" r="8" /><path d="M12 8v4l2 2" />
                                </svg>
                                <span className="architect-timer-digits">{formatTime(modalElapsed)}</span>
                                {targetTime > 0 && (
                                    <span className="architect-timer-target">
                                        / {formatTime(targetTime)}
                                    </span>
                                )}
                            </div>

                            <button className="architect-close-btn" onClick={function () { setActiveModal(null); }}>
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                            </button>
                        </div>

                        {/* ─── DISH NAVIGATION (tabs for multiple dishes) ─── */}
                        {modalDishes.length > 1 && (
                            <div className="architect-dish-nav">
                                {modalDishes.map(function (dish, i) {
                                    return (
                                        <button
                                            key={i}
                                            className={'architect-dish-tab' + (i === modalDishIndex ? ' active' : '')}
                                            onClick={function () { setModalDishIndex(i); }}
                                        >
                                            <span className="architect-dish-tab-num">{i + 1}</span>
                                            {dish.naam}
                                        </button>
                                    );
                                })}
                            </div>
                        )}

                        {/* ─── MAIN CONTENT: Split Layout ─── */}
                        <div className="architect-content">

                            {/* LEFT: Service Image */}
                            <div className="architect-left">
                                {currentImage ? (
                                    <img src={currentImage} alt={currentDish.naam} className="architect-hero-image" />
                                ) : (
                                    <div className="architect-no-image">
                                        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="rgba(180,140,20,.3)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>
                                        <span>Geen service foto</span>
                                    </div>
                                )}

                                {/* Dish info below image */}
                                <div className="architect-dish-meta">
                                    <div className="architect-dish-title">
                                        <span className="architect-dish-qty">[{aantalNormaal}]x</span>
                                        {currentDish.naam}
                                    </div>
                                    {currentDish.beschrijving && (
                                        <div className="architect-dish-desc">{currentDish.beschrijving}</div>
                                    )}
                                    {currentDish.ingredienten && currentDish.ingredienten.length > 0 && (
                                        <div className="architect-ingredients">
                                            {currentDish.ingredienten.map(function (ing, i) {
                                                return <span key={i} className="architect-ing-chip">{ing}</span>;
                                            })}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* RIGHT: Battle Plan Steps */}
                            <div className="architect-right">
                                <div className="architect-steps-header">
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#B48C14" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" /></svg>
                                    <span>Battle Plan</span>
                                </div>

                                {currentSteps.length > 0 ? (
                                    <div className="architect-steps-list">
                                        {currentSteps.map(function (step, i) {
                                            var stepKey = modalDishIndex + '_' + i;
                                            var isChecked = checkedSteps[stepKey] || false;
                                            return (
                                                <button
                                                    key={i}
                                                    className={'architect-step' + (isChecked ? ' checked' : '')}
                                                    onClick={function () { toggleStep(i); }}
                                                >
                                                    <div className="architect-step-check">
                                                        {isChecked ? (
                                                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#6B7A2F" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                                                        ) : (
                                                            <div className="architect-step-circle" />
                                                        )}
                                                    </div>
                                                    <span className="architect-step-num">{i + 1}</span>
                                                    <span className="architect-step-text">{step}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <div className="architect-no-steps">
                                        {currentDish.bereidingswijze ? (
                                            <div className="architect-bereiding-fallback">
                                                <div style={{ fontWeight: 700, marginBottom: 8, color: '#B48C14' }}>👨‍🍳 Bereidingswijze</div>
                                                {currentDish.bereidingswijze}
                                            </div>
                                        ) : (
                                            <div>
                                                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="rgba(180,140,20,.2)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
                                                <p style={{ color: 'var(--muted)', marginTop: 12 }}>Geen battle plan. Voeg stappen toe in Gerechten beheer.</p>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* ─── BOTTOM: Finish Button ─── */}
                        <div className="architect-bottom">
                            <button
                                className="architect-finish-btn"
                                onClick={function () { requestFinishGang(activeModal); }}
                            >
                                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                                <span>GANG UITGESERVEERD</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ═══ HACCP Quick-Log Temperature Popup ═══ */}
            {tempPopup && (
                <div className="temp-popup-overlay">
                    <div className="temp-popup">
                        <div className="temp-popup-head">
                            <span>🌡️ Kern Temperatuur?</span>
                            <button className="temp-popup-skip" onClick={skipTempAndFinish}>Skip →</button>
                        </div>
                        <div className="temp-popup-dish">{tempPopup.dishName}</div>
                        <div className="temp-adjust-row">
                            <button type="button" className="temp-adjust-btn temp-minus" onClick={function () { setTempPopup(Object.assign({}, tempPopup, { temp: tempPopup.temp - 1 })); }}>−</button>
                            <div className={'temp-display temp-display-lg' + (tempPopup.temp >= 75 ? ' temp-ok' : tempPopup.temp >= 65 ? ' temp-warn' : tempPopup.temp <= 7 ? ' temp-ok' : ' temp-danger')}>
                                {tempPopup.temp}°C
                            </div>
                            <button type="button" className="temp-adjust-btn temp-plus" onClick={function () { setTempPopup(Object.assign({}, tempPopup, { temp: tempPopup.temp + 1 })); }}>+</button>
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--muted)', textAlign: 'center', marginTop: 4 }}>Standaard: {tempPopup.defaultTemp}°C — tik +/− om aan te passen</div>
                        <button className="btn btn-brand temp-popup-confirm" onClick={confirmTempAndFinish}>
                            <i className="fa-solid fa-check"></i> Bevestig & Serveer
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
