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
    var [activeModal, setActiveModal] = useState(null);
    var [modalDishIndex, setModalDishIndex] = useState(0);
    var [checkedSteps, setCheckedSteps] = useState({});
    var modalTimerRef = useRef(null);
    var modalStartRef = useRef(null);
    var [modalElapsed, setModalElapsed] = useState(0);

    // ═══ HACCP Quick-Log State ═══
    var [tempPopup, setTempPopup] = useState(null);
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

    function startGang(slug) {
        var now = new Date();
        setBonStates(function (prev) { return Object.assign({}, prev, { [slug]: 'active' }); });
        setTimers(function (prev) { return Object.assign({}, prev, { [slug]: { start: now, elapsed: 0 } }); });

        intervalRef.current[slug] = setInterval(function () {
            setTimers(function (prev) {
                var t = prev[slug];
                if (!t || !t.start) return prev;
                var elapsed = Math.floor((Date.now() - t.start.getTime()) / 1000);
                return Object.assign({}, prev, { [slug]: { start: t.start, elapsed: elapsed } });
            });
        }, 1000);

        supabase.from('service_logs').insert([{
            offerte_id: selectedId,
            gang_slug: slug,
            started_at: now.toISOString()
        }]);

        setActiveModal(slug);
        setModalDishIndex(0);
        setCheckedSteps({});
        setModalElapsed(0);
        modalStartRef.current = now;

        if (modalTimerRef.current) clearInterval(modalTimerRef.current);
        modalTimerRef.current = setInterval(function () {
            if (modalStartRef.current) {
                setModalElapsed(Math.floor((Date.now() - modalStartRef.current.getTime()) / 1000));
            }
        }, 100);

        showToast('🔥 THE ARCHITECT — GO!', 'info');
    }

    function requestFinishGang(slug) {
        var dishNames = menuSelectie[slug] || [];
        var dishName = dishNames.length > 0 ? dishNames.join(', ') : slug;
        var defaultTemp = 75;
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
        if (modalTimerRef.current) { clearInterval(modalTimerRef.current); modalTimerRef.current = null; }
        if (intervalRef.current[slug]) { clearInterval(intervalRef.current[slug]); delete intervalRef.current[slug]; }
        setBonStates(function (prev) { return Object.assign({}, prev, { [slug]: 'served' }); });
        setFinalTimes(function (prev) { return Object.assign({}, prev, { [slug]: elapsed }); });
        setTimers(function (prev) { return Object.assign({}, prev, { [slug]: { start: null, elapsed: elapsed } }); });
        await supabase.from('service_logs').update({ served_at: now.toISOString(), duration_seconds: elapsed }).eq('offerte_id', selectedId).eq('gang_slug', slug).is('served_at', null);
        setActiveModal(null);
        modalStartRef.current = null;
        showToast('✅ GANG UITGESERVEERD! ' + formatTime(elapsed));
        loadHistorie();
    }

    async function saveBusLog() {
        try {
            await supabase.from('haccp_records').insert([
                { offerte_id: String(selectedId), type: 'koeling', check_type: 'opslag', wat: 'Koeling bus (vertrek)', temp: busLog.koelTemp, datum: new Date().toISOString().slice(0, 10), tijd: new Date().toTimeString().slice(0, 5), chef: 'Cor', status: busLog.koelTemp >= 0 && busLog.koelTemp <= 7 ? 'ok' : busLog.koelTemp <= 10 ? 'warn' : 'danger', auto_logged: false, notitie: 'Bus-Log vertrekcheck' },
                { offerte_id: String(selectedId), type: 'kern', check_type: 'bereiding', wat: 'Schoonmaak & hygiëne check', temp: 0, datum: new Date().toISOString().slice(0, 10), tijd: new Date().toTimeString().slice(0, 5), chef: 'Cor', status: busLog.schoonmaak ? 'ok' : 'danger', auto_logged: false, notitie: busLog.schoonmaak ? 'Materialen + Yoders OK' : 'Schoonmaak NIET bevestigd' }
            ]);
            setBusLog(Object.assign({}, busLog, { saved: true }));
            showToast('✅ BUS-LOG OPGESLAGEN');
        } catch (e) { showToast('Fout bij opslaan Bus-Log', 'error'); }
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

    var modalGang = activeModal ? gangen.find(function (g) { return g.slug === activeModal; }) : null;
    var modalDishNames = activeModal && menuSelectie[activeModal] ? menuSelectie[activeModal] : [];
    var modalDishes = modalDishNames.map(function (name) { return gerechtenDb.find(function (g) { return g.naam === name && g.gang_slug === activeModal; }) || { naam: name }; });
    var currentDish = modalDishes[modalDishIndex] || {};
    var currentSteps = currentDish.battle_plan_steps || [];
    var currentImage = currentDish.service_image || currentDish.foto_url || '';
    var targetTime = currentDish.target_prep_time || 0;
    var isOvertime = targetTime > 0 && modalElapsed > targetTime;

    function toggleStep(stepIdx) {
        var key = modalDishIndex + '_' + stepIdx;
        setCheckedSteps(function (prev) {
            var next = Object.assign({}, prev);
            next[key] = !next[key];
            return next;
        });
    }

    return (
        <div className="artisan-page service-page">
            <h1 className="hero-title mb-16" style={{ fontSize: 24 }}>SERVICE MODE — THE ARCHITECT</h1>

            {!selectedId ? (
                <div className="panel">
                    <div className="panel-head"><h3>SELECTEER EVENT</h3></div>
                    <div className="panel-body">
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            {offertes.map(function (o) {
                                return (
                                    <div key={o.id} className="side-row" onClick={function () { selectEvent(o); }} style={{ padding: 16 }}>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontWeight: 700, fontSize: 16 }}>{o.client_naam || 'Onbekend'}</div>
                                            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                                                {o.datum} • {o.aantal_gasten || '?'} gasten
                                                {o.aantal_vega > 0 && ' (' + o.aantal_vega + ' vega)'}
                                            </div>
                                        </div>
                                        <span className={'pill ' + (o.status === 'definitief' ? 'pill-green' : 'pill-amber')}>{o.status.toUpperCase()}</span>
                                    </div>
                                );
                            })}
                            {offertes.length === 0 && <div className="empty-state">Geen offertes met menu gevonden.</div>}
                        </div>

                        {historie.length > 0 && (
                            <div style={{ marginTop: 32 }}>
                                <button className="tab-btn" onClick={function () { setShowHistorie(!showHistorie); }}>
                                    {showHistorie ? 'HISTORIE VERBERGEN' : 'TIJDEN & HISTORIE TONEN'}
                                </button>
                                {showHistorie && (
                                    <div className="mt-20">
                                        <h4 style={{ color: 'var(--brand)', marginBottom: 12 }}>⏱️ GEMIDDELDE TIJDEN</h4>
                                        <div className="artisan-panel" style={{ padding: 16 }}>
                                            {gangen.map(function (gang) {
                                                var avg = getAvgTime(gang.slug);
                                                return (
                                                    <div key={gang.slug} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, borderBottom: '1px solid var(--border)', paddingBottom: 4 }}>
                                                        <span style={{ fontSize: 12 }}>{gang.naam}</span>
                                                        <span style={{ fontWeight: 700, color: avg ? 'var(--brand)' : 'var(--muted)' }}>{avg ? formatTime(avg) : '—'}</span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            ) : (
                <div className="service-active">
                    <div className="artisan-panel mb-16" style={{ padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <div style={{ fontWeight: 700, fontSize: 18, color: 'var(--brand)' }}>{selected.client_naam}</div>
                            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                                {selected.datum} • {selected.aantal_gasten} gasten •
                                <span style={{ color: 'var(--brand)', marginLeft: 8 }}>🍖 {aantalNormaal}</span>
                                {aantalVega > 0 && <span style={{ color: '#6B7A2F', marginLeft: 8 }}>🌿 {aantalVega}</span>}
                            </div>
                        </div>
                        <button className="tab-btn" onClick={function () { setSelectedId(null); }}>← EVENT SELECTIE</button>
                    </div>

                    <div className="bon-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20 }}>
                        {gangen.map(function (gang, idx) {
                            var state = bonStates[gang.slug] || 'idle';
                            var dishNames = menuSelectie[gang.slug] || [];
                            var elapsed = state === 'served' ? (finalTimes[gang.slug] || 0) : (timers[gang.slug] ? timers[gang.slug].elapsed : 0);
                            var isExpanded = expandedBon === gang.slug;
                            return (
                                <div key={gang.slug} className={'bon-card artisan-panel bon-' + state} style={{ padding: 0, overflow: 'hidden', borderLeft: '4px solid ' + (state === 'active' ? 'var(--brand)' : state === 'served' ? 'var(--green)' : 'transparent') }}>
                                    <div style={{ padding: '16px 20px', cursor: 'pointer' }} onClick={function () { setExpandedBon(isExpanded ? null : gang.slug); }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <div style={{ fontWeight: 800, fontSize: 15 }}>GANG {idx + 1} • {gang.naam.toUpperCase()}</div>
                                            <div style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 800, color: state === 'active' ? 'var(--brand)' : 'var(--muted)' }}>{formatTime(elapsed)}</div>
                                        </div>
                                    </div>
                                    <div style={{ padding: '0 20px 20px 20px' }}>
                                        {dishNames.map(function (dish, i) {
                                            return <div key={i} style={{ fontSize: 13, marginBottom: 4 }}><span style={{ color: 'var(--brand)', fontWeight: 700 }}>[{aantalNormaal}]</span> {dish}</div>;
                                        })}
                                        {aantalVega > 0 && (
                                            <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)', fontSize: 13, color: 'var(--green)' }}>
                                                <span style={{ fontWeight: 700 }}>[{aantalVega}]</span> 🌿 VEGA OPTIE
                                            </div>
                                        )}
                                        <div style={{ marginTop: 20 }}>
                                            {state === 'idle' && <button className="btn-brand" style={{ width: '100%' }} onClick={function () { startGang(gang.slug); }}>START GANG</button>}
                                            {state === 'active' && <button className="btn-brand" style={{ width: '100%', background: '#fff', color: '#000' }} onClick={function () { setActiveModal(gang.slug); }}>OPEN ARCHITECT</button>}
                                            {state === 'served' && <div style={{ color: 'var(--green)', fontWeight: 800, textAlign: 'center', fontSize: 12 }}>VOLTOOID</div>}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* THE ARCHITECT MODAL (COAL & GOLD FULLSCREEN) */}
            {activeModal && modalGang && (
                <div className="architect-overlay" style={{ position: 'fixed', inset: 0, background: 'var(--bg)', zIndex: 999, display: 'flex', flexDirection: 'column' }}>
                    <div className="architect-header" style={{ height: 80, padding: '0 40px', borderBottom: '1px solid var(--border-steel)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div>
                            <div style={{ color: 'var(--brand)', fontSize: 12, fontWeight: 800 }}>GANG {gangen.indexOf(modalGang) + 1}</div>
                            <div style={{ fontSize: 24, fontWeight: 800 }}>{modalGang.naam.toUpperCase()}</div>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                            <div className={isOvertime ? 'text-red' : ''} style={{ fontSize: 32, fontWeight: 900, fontVariantNumeric: 'tabular-nums' }}>{formatTime(modalElapsed)}</div>
                            {targetTime > 0 && <div style={{ fontSize: 10, color: 'var(--muted)' }}>TARGET: {formatTime(targetTime)}</div>}
                        </div>
                        <button className="tab-btn" onClick={function () { setActiveModal(null); }}>SLUITEN</button>
                    </div>

                    <div className="architect-body" style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 40, padding: 40, overflowY: 'auto' }}>
                        <div className="arch-left">
                            {currentImage && <img src={currentImage} style={{ width: '100%', height: 400, objectFit: 'cover', borderRadius: 12, border: '1px solid var(--border-steel)' }} />}
                            <div style={{ marginTop: 24 }}>
                                <h2 style={{ fontSize: 28, fontWeight: 800, color: 'var(--brand)' }}>{currentDish.naam}</h2>
                                <p style={{ color: 'var(--muted)', marginTop: 12, fontSize: 16 }}>{currentDish.beschrijving}</p>
                            </div>
                        </div>
                        <div className="arch-right">
                            <h3 style={{ borderBottom: '1px solid var(--border-steel)', paddingBottom: 12, marginBottom: 20 }}>BATTLE PLAN</h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                {currentSteps.map(function (step, i) {
                                    var isChecked = checkedSteps[modalDishIndex + '_' + i];
                                    return (
                                        <div key={i} className="side-row" onClick={function () { toggleStep(i); }} style={{ padding: 20, cursor: 'pointer', opacity: isChecked ? 0.4 : 1 }}>
                                            <div style={{ width: 30, height: 30, border: '2px solid var(--brand)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>{i + 1}</div>
                                            <div style={{ flex: 1, marginLeft: 16, fontSize: 18, fontWeight: 500 }}>{step}</div>
                                            {isChecked && <div style={{ color: 'var(--brand)' }}>✅</div>}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    <div className="architect-footer" style={{ height: 100, borderTop: '1px solid var(--border-steel)', padding: '0 40px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <button className="btn-brand" style={{ padding: '20px 60px', fontSize: 18 }} onClick={function () { requestFinishGang(activeModal); }}>GANG UITGESERVEERD</button>
                    </div>
                </div>
            )}

            {/* HACCP POPUP */}
            {tempPopup && (
                <div className="architect-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div className="artisan-panel" style={{ width: 400, padding: 32, textAlign: 'center' }}>
                        <h2 style={{ color: 'var(--brand)' }}>KERNTEMPERATUUR?</h2>
                        <p style={{ margin: '16px 0', opacity: 0.7 }}>{tempPopup.dishName}</p>
                        <div style={{ fontSize: 48, fontWeight: 900, color: 'var(--brand)', margin: '24px 0' }}>{tempPopup.temp}°C</div>
                        <div style={{ display: 'flex', gap: 12 }}>
                            <button className="btn-brand" style={{ flex: 1 }} onClick={confirmTempAndFinish}>OPSLAAN</button>
                            <button className="tab-btn" style={{ flex: 1 }} onClick={skipTempAndFinish}>SKIP</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
