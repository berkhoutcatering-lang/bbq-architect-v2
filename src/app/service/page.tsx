/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/components/Toast';
import PageHint from '@/components/PageHint';

interface TempPopup {
    slug: string;
    temp: number;
    dishName: string;
    defaultTemp: number;
}

interface BusLog {
    koelTemp: number;
    schoonmaak: boolean;
    saved: boolean;
}

export default function ServiceMode() {
    const showToast = useToast();
    const [offertes, setOffertes] = useState<any[]>([]);
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const [gangen, setGangen] = useState<any[]>([]);
    const [gerechtenDb, setGerechtenDb] = useState<any[]>([]);
    const [bonStates, setBonStates] = useState<Record<string, string>>({});
    const [timers, setTimers] = useState<Record<string, { start: Date | null; elapsed: number }>>({});
    const [finalTimes, setFinalTimes] = useState<Record<string, number>>({});
    const [expandedBon, setExpandedBon] = useState<string | null>(null);
    const [historie, setHistorie] = useState<any[]>([]);
    const [showHistorie, setShowHistorie] = useState(false);
    const intervalRef = useRef<Record<string, ReturnType<typeof setInterval>>>({});

    const [activeModal, setActiveModal] = useState<string | null>(null);
    const [modalDishIndex, setModalDishIndex] = useState(0);
    const [checkedSteps, setCheckedSteps] = useState<Record<string, boolean>>({});
    const modalTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const modalStartRef = useRef<Date | null>(null);
    const [modalElapsed, setModalElapsed] = useState(0);

    const [tempPopup, setTempPopup] = useState<TempPopup | null>(null);
    const [busLog, setBusLog] = useState<BusLog>({ koelTemp: 4, schoonmaak: false, saved: false });
    const [vegaInputs, setVegaInputs] = useState<Record<string, string>>({});
    const [completedDishes, setCompletedDishes] = useState<Record<string, boolean>>({});

    useEffect(function () {
        loadData();
        return function () {
            Object.values(intervalRef.current).forEach(clearInterval);
            if (modalTimerRef.current) clearInterval(modalTimerRef.current);
        };
    }, []);

    async function loadData() {
        const o = await supabase.from('offertes').select('*').not('menu_selectie', 'is', null).order('datum', { ascending: false });
        if (o.data) setOffertes(o.data);
        const g = await supabase.from('gangen').select('*').order('volgorde');
        if (g.data) setGangen(g.data);
        const d = await supabase.from('gerechten').select('*').order('volgorde');
        if (d.data) setGerechtenDb(d.data);
    }

    // Get vega dishes per gang from DB (gerechten with "Vega" tag or "Dieet" in name)
    function getVegaDishesForGang(gangSlug: string): string[] {
        return gerechtenDb
            .filter(function (g: any) {
                if (g.gang_slug !== gangSlug) return false;
                const naam = (g.naam || '').toLowerCase();
                const tags = Array.isArray(g.tags) ? g.tags.map(function (t: string) { return t.toLowerCase(); }) : [];
                return naam.includes('dieet') || tags.includes('vega') || tags.includes('vegetarisch') || tags.includes('dieet');
            })
            .map(function (g: any) { return g.naam; });
    }

    function selectEvent(offerte: any) {
        setSelectedId(offerte.id);
        setExpandedBon(null);
        setCompletedDishes({});
        const states: Record<string, string> = {};
        const tims: Record<string, { start: Date | null; elapsed: number }> = {};
        gangen.forEach(function (g: any) {
            states[g.slug] = 'idle';
            tims[g.slug] = { start: null, elapsed: 0 };
        });
        setBonStates(states);
        setTimers(tims);
        setFinalTimes({});
        Object.values(intervalRef.current).forEach(clearInterval);
        intervalRef.current = {};

        supabase.from('service_logs').select('*').eq('offerte_id', offerte.id).then(function (res: any) {
            if (res.data && res.data.length > 0) {
                const s = Object.assign({}, states);
                const ft: Record<string, number> = {};
                res.data.forEach(function (log: any) {
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
        const res = await supabase.from('service_logs').select('*').not('served_at', 'is', null).order('started_at', { ascending: false });
        if (res.data) setHistorie(res.data);
    }

    function startGang(slug: string) {
        const now = new Date();
        setBonStates(function (prev) { return Object.assign({}, prev, { [slug]: 'active' }); });
        setTimers(function (prev) { return Object.assign({}, prev, { [slug]: { start: now, elapsed: 0 } }); });

        intervalRef.current[slug] = setInterval(function () {
            setTimers(function (prev) {
                const t = prev[slug];
                if (!t || !t.start) return prev;
                const elapsed = Math.floor((Date.now() - t.start.getTime()) / 1000);
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

        showToast('\ud83d\udd25 THE ARCHITECT \u2014 GO!', 'info');
    }

    function requestFinishGang(slug: string) {
        const normaalNames = menuSelectie[slug] || [];
        const vegaNames = menuSelectie[slug + '_vega'] || [];
        const allNames = normaalNames.concat(vegaNames);
        const dishName = allNames.length > 0 ? allNames.join(', ') : slug;
        let defaultTemp = 75;
        const gangObj = gangen.find(function (g: any) { return g.slug === slug; });
        if (gangObj) {
            const gangNaam = (gangObj.naam || '').toLowerCase();
            if (gangNaam.indexOf('dessert') >= 0 || gangNaam.indexOf('ijs') >= 0) defaultTemp = 4;
            else if (gangNaam.indexOf('amuse') >= 0 || gangNaam.indexOf('bite') >= 0) defaultTemp = 65;
        }
        setTempPopup({ slug: slug, temp: defaultTemp, dishName: dishName, defaultTemp: defaultTemp });
    }

    async function confirmTempAndFinish() {
        if (!tempPopup) return;
        const slug = tempPopup.slug;
        const temp = typeof tempPopup.temp === 'number' ? tempPopup.temp : parseFloat(String(tempPopup.temp)) || 0;
        try {
            await supabase.from('haccp_records').insert([{
                event_id: null,
                offerte_id: String(selectedId),
                gang_slug: slug,
                type: 'kern',
                check_type: 'uitgifte',
                wat: tempPopup.dishName,
                temp: temp,
                datum: new Date().toISOString().slice(0, 10),
                tijd: new Date().toTimeString().slice(0, 5),
                chef: 'Cor',
                status: temp >= 75 ? 'ok' : temp >= 65 ? 'warn' : temp <= 7 ? 'ok' : 'danger',
                auto_logged: true,
                notitie: 'Quick-log via Service Mode'
            }]);
        } catch (e) { console.error('[HACCP] Quick-log error:', e); }
        setTempPopup(null);
        finishGang(slug);
    }

    function skipTempAndFinish() {
        if (!tempPopup) return;
        const slug = tempPopup.slug;
        setTempPopup(null);
        finishGang(slug);
    }

    async function finishGang(slug: string) {
        const now = new Date();
        const elapsed = modalElapsed;
        if (modalTimerRef.current) { clearInterval(modalTimerRef.current); modalTimerRef.current = null; }
        if (intervalRef.current[slug]) { clearInterval(intervalRef.current[slug]); delete intervalRef.current[slug]; }
        setBonStates(function (prev) { return Object.assign({}, prev, { [slug]: 'served' }); });
        setFinalTimes(function (prev) { return Object.assign({}, prev, { [slug]: elapsed }); });
        setTimers(function (prev) { return Object.assign({}, prev, { [slug]: { start: null, elapsed: elapsed } }); });
        await supabase.from('service_logs').update({ served_at: now.toISOString(), duration_seconds: elapsed }).eq('offerte_id', selectedId).eq('gang_slug', slug).is('served_at', null);
        setActiveModal(null);
        modalStartRef.current = null;
        showToast('\u2705 GANG UITGESERVEERD! ' + formatTime(elapsed));
        loadHistorie();
    }

    async function saveBusLog() {
        try {
            await supabase.from('haccp_records').insert([
                { offerte_id: String(selectedId), type: 'koeling', check_type: 'opslag', wat: 'Koeling bus (vertrek)', temp: busLog.koelTemp, datum: new Date().toISOString().slice(0, 10), tijd: new Date().toTimeString().slice(0, 5), chef: 'Cor', status: busLog.koelTemp >= 0 && busLog.koelTemp <= 7 ? 'ok' : busLog.koelTemp <= 10 ? 'warn' : 'danger', auto_logged: false, notitie: 'Bus-Log vertrekcheck' },
                { offerte_id: String(selectedId), type: 'kern', check_type: 'bereiding', wat: 'Schoonmaak & hygi\u00ebne check', temp: 0, datum: new Date().toISOString().slice(0, 10), tijd: new Date().toTimeString().slice(0, 5), chef: 'Cor', status: busLog.schoonmaak ? 'ok' : 'danger', auto_logged: false, notitie: busLog.schoonmaak ? 'Materialen + Yoders OK' : 'Schoonmaak NIET bevestigd' }
            ]);
            setBusLog(Object.assign({}, busLog, { saved: true }));
            showToast('\u2705 BUS-LOG OPGESLAGEN');
        } catch (e) { showToast('Fout bij opslaan Bus-Log', 'error'); }
    }

    async function saveVegaDish(gangSlug: string) {
        const vegaDish = vegaInputs[gangSlug];
        if (!vegaDish || !selectedId || !selected) return;
        const updatedMenu = Object.assign({}, menuSelectie, { [gangSlug + '_vega']: [vegaDish] });
        await supabase.from('offertes').update({ menu_selectie: updatedMenu }).eq('id', selectedId);
        // Refresh local state
        setOffertes(function (prev: any[]) {
            return prev.map(function (o: any) { return o.id === selectedId ? Object.assign({}, o, { menu_selectie: updatedMenu }) : o; });
        });
        setVegaInputs(function (prev) { const n = Object.assign({}, prev); delete n[gangSlug]; return n; });
        showToast('🌿 Vega gerecht opgeslagen voor ' + gangSlug);
    }

    function formatTime(seconds: number): string {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
    }

    function getAvgTime(slug: string): number | null {
        const gangLogs = historie.filter(function (h: any) { return h.gang_slug === slug && h.duration_seconds > 0; });
        if (gangLogs.length === 0) return null;
        const total = gangLogs.reduce(function (sum: number, h: any) { return sum + h.duration_seconds; }, 0);
        return Math.round(total / gangLogs.length);
    }

    const selected = offertes.find(function (o: any) { return o.id === selectedId; });
    const menuSelectie: Record<string, string[]> = selected && selected.menu_selectie ? (typeof selected.menu_selectie === 'string' ? JSON.parse(selected.menu_selectie) : selected.menu_selectie) : {};
    const aantalNormaal = (selected ? (selected.aantal_gasten || 0) - (selected.aantal_vega || 0) : 0);
    const aantalVega = selected ? (selected.aantal_vega || 0) : 0;
    const allServed = gangen.length > 0 && gangen.every(function (g: any) { return bonStates[g.slug] === 'served'; });

    const modalGang = activeModal ? gangen.find(function (g: any) { return g.slug === activeModal; }) : null;
    const modalDishNamesNormaal = activeModal && menuSelectie[activeModal] ? menuSelectie[activeModal] : [];
    // Vega: first check menu_selectie, then fallback to DB lookup
    const modalDishNamesVega = activeModal ? (menuSelectie[activeModal + '_vega'] || (aantalVega > 0 ? getVegaDishesForGang(activeModal) : [])) : [];
    const modalDishesAll: { naam: string; isVega: boolean; count: number; db: any; key: string }[] = [];
    modalDishNamesNormaal.forEach(function (name: string, i: number) {
        const db = gerechtenDb.find(function (g: any) { return g.naam === name && g.gang_slug === activeModal; }) || { naam: name };
        modalDishesAll.push({ naam: name, isVega: false, count: aantalNormaal, db: db, key: activeModal + '_n_' + i });
    });
    modalDishNamesVega.forEach(function (name: string, i: number) {
        const db = gerechtenDb.find(function (g: any) { return g.naam === name; }) || { naam: name };
        modalDishesAll.push({ naam: name, isVega: true, count: aantalVega, db: db, key: activeModal + '_v_' + i });
    });
    const currentDishEntry = modalDishesAll[modalDishIndex] || { naam: '', isVega: false, count: 0, db: {}, key: '_empty' };
    const currentDish: any = currentDishEntry.db || {};
    const currentSteps: string[] = currentDish.battle_plan_steps || [];
    const currentImage: string = currentDish.service_image || currentDish.foto_url || '';
    const targetTime: number = currentDish.target_prep_time || 0;
    const isOvertime = targetTime > 0 && modalElapsed > targetTime;

    function toggleStep(stepIdx: number) {
        const key = modalDishIndex + '_' + stepIdx;
        setCheckedSteps(function (prev) {
            const next = Object.assign({}, prev);
            next[key] = !next[key];
            return next;
        });
    }

    return (
        <div className="artisan-page service-page">
            <h1 className="hero-title mb-16" style={{ fontSize: 24 }}>SERVICE MODE — THE ARCHITECT</h1>

            <PageHint id="service" title="Service Mode" description="Beheer je serviceteam en taken tijdens events. Gebruik de keukenmodus voor real-time overzicht." />

            {!selectedId ? (
                <div className="panel">
                    <div className="panel-head"><h3>SELECTEER EVENT</h3></div>
                    <div className="panel-body">
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            {offertes.map(function (o: any) {
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
                                            {gangen.map(function (gang: any) {
                                                const avg = getAvgTime(gang.slug);
                                                return (
                                                    <div key={gang.slug} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, borderBottom: '1px solid var(--border)', paddingBottom: 4 }}>
                                                        <span style={{ fontSize: 12 }}>{gang.naam}</span>
                                                        <span style={{ fontWeight: 700, color: avg ? 'var(--brand)' : 'var(--muted)' }}>{avg ? formatTime(avg) : '\u2014'}</span>
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

                    <div className="bon-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 20 }}>
                        {gangen.map(function (gang: any, idx: number) {
                            const state = bonStates[gang.slug] || 'idle';
                            const dishNames = menuSelectie[gang.slug] || [];
                            const elapsed = state === 'served' ? (finalTimes[gang.slug] || 0) : (timers[gang.slug] ? timers[gang.slug].elapsed : 0);
                            const isExpanded = expandedBon === gang.slug;
                            return (
                                <div key={gang.slug} className={'bon-card artisan-panel bon-' + state} style={{ padding: 0, overflow: 'hidden', borderLeft: '4px solid ' + (state === 'active' ? 'var(--brand)' : state === 'served' ? 'var(--green)' : 'transparent') }}>
                                    <div style={{ padding: '16px 20px', cursor: 'pointer' }} onClick={function () { setExpandedBon(isExpanded ? null : gang.slug); }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <div style={{ fontWeight: 800, fontSize: 15 }}>GANG {idx + 1} • {gang.naam.toUpperCase()}</div>
                                            <div style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 800, color: state === 'active' ? 'var(--brand)' : 'var(--muted)' }}>{formatTime(elapsed)}</div>
                                        </div>
                                    </div>
                                    <div style={{ padding: '0 20px 20px 20px' }}>
                                        {/* Normaal gerechten */}
                                        {dishNames.map(function (dish: string, i: number) {
                                            const gerechtData = gerechtenDb.find(function (g: any) { return g.naam === dish && g.gang_slug === gang.slug; });
                                            return (
                                                <div key={i} style={{ fontSize: 13, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                                                    <span style={{ fontSize: 10 }}>🍖</span>
                                                    <span style={{ color: 'var(--brand)', fontWeight: 700, fontSize: 11, minWidth: 28 }}>{aantalNormaal}×</span>
                                                    <span style={{ flex: 1 }}>{dish}</span>
                                                    {gerechtData && gerechtData.foto_url && (
                                                        <img src={gerechtData.foto_url} style={{ width: 28, height: 28, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} />
                                                    )}
                                                </div>
                                            );
                                        })}

                                        {/* Vega gerechten */}
                                        {aantalVega > 0 && (function () {
                                            const hasOverride = Array.isArray(menuSelectie[gang.slug + '_vega']) && menuSelectie[gang.slug + '_vega'].length > 0;
                                            const dbVega = getVegaDishesForGang(gang.slug);
                                            const vegaDishes: string[] = hasOverride ? menuSelectie[gang.slug + '_vega'] : dbVega;
                                            const isEditing = vegaInputs['_editing_' + gang.slug] === '1';
                                            const sourceLabel = hasOverride ? 'Offerte' : (dbVega.length > 0 ? 'Standaard dieet' : '');
                                            return (
                                                <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px dashed var(--border)' }}>
                                                    {/* Source label */}
                                                    {sourceLabel && !isEditing && (
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                                                            <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#6B7A2F', opacity: 0.6 }}>{sourceLabel}</span>
                                                            <button onClick={function (e: React.MouseEvent) { e.stopPropagation(); setVegaInputs(function (prev) { return Object.assign({}, prev, { ['_editing_' + gang.slug]: '1', [gang.slug]: '' }); }); }}
                                                                style={{ fontSize: 9, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
                                                                wijzig
                                                            </button>
                                                        </div>
                                                    )}

                                                    {/* Show vega dishes or edit mode */}
                                                    {!isEditing && vegaDishes.length > 0 ? vegaDishes.map(function (vDish: string, vi: number) {
                                                        const vGerechtData = gerechtenDb.find(function (g: any) { return g.naam === vDish; });
                                                        return (
                                                            <div key={vi} style={{ fontSize: 13, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                                                                <span style={{ fontSize: 10 }}>🌿</span>
                                                                <span style={{ color: '#6B7A2F', fontWeight: 700, fontSize: 11, minWidth: 28 }}>{aantalVega}×</span>
                                                                <span style={{ flex: 1, color: '#6B7A2F' }}>{vDish}</span>
                                                                {vGerechtData && vGerechtData.foto_url && (
                                                                    <img src={vGerechtData.foto_url} style={{ width: 28, height: 28, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} />
                                                                )}
                                                            </div>
                                                        );
                                                    }) : (
                                                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                                            <span style={{ fontSize: 10 }}>🌿</span>
                                                            <span style={{ color: '#6B7A2F', fontWeight: 700, fontSize: 11, minWidth: 28 }}>{aantalVega}×</span>
                                                            <input
                                                                value={vegaInputs[gang.slug] || ''}
                                                                onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setVegaInputs(function (prev) { return Object.assign({}, prev, { [gang.slug]: e.target.value }); }); }}
                                                                placeholder="Vega gerecht naam..."
                                                                onClick={function (e: React.MouseEvent) { e.stopPropagation(); }}
                                                                style={{ flex: 1, padding: '4px 8px', fontSize: 12, background: 'var(--bg)', border: '1px solid rgba(107,122,47,.3)', borderRadius: 6, color: '#6B7A2F' }}
                                                            />
                                                            {vegaInputs[gang.slug] && (
                                                                <button onClick={function (e: React.MouseEvent) {
                                                                    e.stopPropagation();
                                                                    saveVegaDish(gang.slug);
                                                                    setVegaInputs(function (prev) { const n = Object.assign({}, prev); delete n['_editing_' + gang.slug]; return n; });
                                                                }}
                                                                    style={{ padding: '4px 10px', fontSize: 11, fontWeight: 700, background: 'rgba(107,122,47,.15)', border: '1px solid rgba(107,122,47,.3)', borderRadius: 6, color: '#6B7A2F', cursor: 'pointer' }}>
                                                                    ✓
                                                                </button>
                                                            )}
                                                            {isEditing && (
                                                                <button onClick={function (e: React.MouseEvent) {
                                                                    e.stopPropagation();
                                                                    setVegaInputs(function (prev) { const n = Object.assign({}, prev); delete n['_editing_' + gang.slug]; delete n[gang.slug]; return n; });
                                                                }}
                                                                    style={{ padding: '4px 8px', fontSize: 11, background: 'none', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--muted)', cursor: 'pointer' }}>
                                                                    ✕
                                                                </button>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })()}

                                        <div style={{ marginTop: 16 }}>
                                            {state === 'idle' && <button className="btn-brand" style={{ width: '100%' }} onClick={function () { startGang(gang.slug); }}>START GANG</button>}
                                            {state === 'active' && <button className="btn-brand" style={{ width: '100%', background: '#fff', color: '#000' }} onClick={function () { setActiveModal(gang.slug); }}>OPEN ARCHITECT</button>}
                                            {state === 'served' && <div style={{ color: 'var(--green)', fontWeight: 800, textAlign: 'center', fontSize: 12 }}>✓ UITGESERVEERD</div>}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {activeModal && modalGang && (
                <div className="architect-overlay" style={{ position: 'fixed', inset: 0, background: 'var(--bg)', zIndex: 999, display: 'flex', flexDirection: 'column' }}>
                    <div className="architect-header" style={{ height: 'auto', padding: '16px 24px md:padding-0-40px', borderBottom: '1px solid var(--border-steel)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                        <div>
                            <div style={{ color: 'var(--brand)', fontSize: 12, fontWeight: 800 }}>GANG {gangen.indexOf(modalGang) + 1} • {modalGang.naam.toUpperCase()}</div>
                            <div style={{ fontSize: 20, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span>{currentDishEntry.isVega ? '🌿' : '🍖'}</span>
                                <span style={{ color: currentDishEntry.isVega ? '#6B7A2F' : 'var(--text)' }}>{currentDish.naam || 'Gerecht'}</span>
                                <span style={{ fontSize: 12, fontWeight: 700, color: currentDishEntry.isVega ? '#6B7A2F' : 'var(--brand)', background: currentDishEntry.isVega ? 'rgba(107,122,47,.1)' : 'rgba(196,163,90,.1)', padding: '2px 8px', borderRadius: 6 }}>{currentDishEntry.count}×</span>
                            </div>
                            {/* Dish navigation tabs */}
                            {modalDishesAll.length > 1 && (
                                <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                                    {modalDishesAll.map(function (d, i) {
                                        const isDone = completedDishes[d.key];
                                        const isCurrent = i === modalDishIndex;
                                        return (
                                            <button key={i} onClick={function () { setModalDishIndex(i); setCheckedSteps({}); }}
                                                style={{
                                                    padding: '8px 16px', fontSize: 13, fontWeight: 700, borderRadius: 10, cursor: 'pointer',
                                                    border: isDone ? '2px solid #10b981' : (isCurrent ? '2px solid var(--brand)' : '1px solid var(--border)'),
                                                    background: isDone ? 'rgba(16,185,129,.1)' : (isCurrent ? 'rgba(196,163,90,.15)' : 'transparent'),
                                                    color: isDone ? '#10b981' : (d.isVega ? '#6B7A2F' : (isCurrent ? 'var(--brand)' : 'var(--muted)')),
                                                    display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.15s'
                                                }}>
                                                {isDone ? '✓' : (d.isVega ? '🌿' : '🍖')}
                                                {d.naam}
                                                <span style={{ fontSize: 10, opacity: 0.6 }}>{d.count}×</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                        <div style={{ textAlign: 'center' }}>
                            <div className={isOvertime ? 'text-red' : ''} style={{ fontSize: 32, fontWeight: 900, fontVariantNumeric: 'tabular-nums' }}>{formatTime(modalElapsed)}</div>
                            {targetTime > 0 && <div style={{ fontSize: 10, color: 'var(--muted)' }}>TARGET: {formatTime(targetTime)}</div>}
                        </div>
                        <button className="tab-btn" onClick={function () { setActiveModal(null); }}>SLUITEN</button>
                    </div>

                    <div className="architect-body grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-10 p-4 md:p-10 flex-1 overflow-y-auto">
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
                                {currentSteps.map(function (step: string, i: number) {
                                    const isChecked = checkedSteps[modalDishIndex + '_' + i];
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

                    <div className="architect-footer" style={{ borderTop: '1px solid var(--border-steel)', padding: '16px 24px' }}>
                        {/* Per-dish status bar */}
                        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
                            {modalDishesAll.map(function (d, i) {
                                const isDone = completedDishes[d.key];
                                return (
                                    <div key={d.key} style={{
                                        display: 'flex', alignItems: 'center', gap: 6,
                                        padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                                        background: isDone ? 'rgba(16,185,129,.12)' : (i === modalDishIndex ? 'rgba(196,163,90,.12)' : 'rgba(255,255,255,.04)'),
                                        border: isDone ? '1px solid rgba(16,185,129,.3)' : (i === modalDishIndex ? '1px solid rgba(196,163,90,.3)' : '1px solid var(--border)'),
                                        color: isDone ? '#10b981' : (i === modalDishIndex ? 'var(--brand)' : 'var(--muted)')
                                    }}>
                                        {isDone ? '✓' : (d.isVega ? '🌿' : '🍖')}
                                        <span>{d.naam}</span>
                                        <span style={{ fontSize: 10, opacity: 0.6 }}>{d.count}×</span>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Action buttons */}
                        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                            {!completedDishes[currentDishEntry.key] ? (
                                <button className="btn-brand" style={{ padding: '16px 48px', fontSize: 16, fontWeight: 800 }}
                                    onClick={function () {
                                        setCompletedDishes(function (prev) { return Object.assign({}, prev, { [currentDishEntry.key]: true }); });
                                        // Auto-advance to next unfinished dish
                                        const nextIdx = modalDishesAll.findIndex(function (d, i) { return i > modalDishIndex && !completedDishes[d.key]; });
                                        if (nextIdx >= 0) {
                                            setModalDishIndex(nextIdx);
                                            setCheckedSteps({});
                                        }
                                        showToast('✓ ' + currentDishEntry.naam + ' meegegeven (' + currentDishEntry.count + '×)');
                                    }}>
                                    {currentDishEntry.isVega ? '🌿' : '🍖'} GERECHT MEEGEVEN
                                </button>
                            ) : (
                                /* All dishes done? Show finish gang button */
                                modalDishesAll.every(function (d) { return completedDishes[d.key]; }) ? (
                                    <button className="btn-brand" style={{ padding: '16px 48px', fontSize: 16, fontWeight: 800, background: '#10b981' }}
                                        onClick={function () { requestFinishGang(activeModal!); }}>
                                        ✓ GANG UITGESERVEERD — ALLES MEE
                                    </button>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                                        <span style={{ color: '#10b981', fontSize: 14, fontWeight: 700 }}>✓ {currentDishEntry.naam} is meegegeven</span>
                                        <button className="tab-btn" style={{ padding: '12px 32px' }}
                                            onClick={function () {
                                                const nextIdx = modalDishesAll.findIndex(function (d) { return !completedDishes[d.key]; });
                                                if (nextIdx >= 0) { setModalDishIndex(nextIdx); setCheckedSteps({}); }
                                            }}>
                                            VOLGENDE GERECHT →
                                        </button>
                                    </div>
                                )
                            )}
                        </div>
                    </div>
                </div>
            )}

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
