/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/components/Toast';
import PageHint from '@/components/PageHint';
import EmptyState from '@/components/EmptyState';
import './service-kds.css';

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
    const [nowTs, setNowTs] = useState<number>(0);

    /* Per-gerecht state: eigen timer, eigen battle-plan progress, extra vega-gerechten */
    const [dishTimers, setDishTimers] = useState<Record<string, { start: Date | null; elapsed: number }>>({});
    const [dishChecked, setDishChecked] = useState<Record<string, Record<number, boolean>>>({});
    const [extraVegaDishes, setExtraVegaDishes] = useState<Record<string, string[]>>({});
    const [newVegaInputs, setNewVegaInputs] = useState<Record<string, string>>({});
    const [focusedGang, setFocusedGang] = useState<string | null>(null);
    const dishIntervalsRef = useRef<Record<string, ReturnType<typeof setInterval>>>({});

    /* Service-brede timer die loopt zodra er een dish actief is */
    const [serviceStart, setServiceStart] = useState<Date | null>(null);
    const [serviceElapsed, setServiceElapsed] = useState<number>(0);
    const serviceIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(function () {
        setNowTs(Date.now());
        const interval = setInterval(() => setNowTs(Date.now()), 60_000);
        return () => clearInterval(interval);
    }, []);

    const loadData = async () => {
        const o = await supabase.from('offertes').select('*').not('menu_selectie', 'is', null).order('datum', { ascending: false });
        if (o.data) setOffertes(o.data);
        const g = await supabase.from('gangen').select('*').order('volgorde');
        if (g.data) setGangen(g.data);
        const d = await supabase.from('gerechten').select('*').order('volgorde');
        if (d.data) setGerechtenDb(d.data);
    };

    useEffect(function () {
        loadData();
        return function () {
            Object.values(intervalRef.current).forEach(clearInterval);
            Object.values(dishIntervalsRef.current).forEach(clearInterval);
            if (modalTimerRef.current) clearInterval(modalTimerRef.current);
            if (serviceIntervalRef.current) clearInterval(serviceIntervalRef.current);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    /* Start/stop service-brede timer zodra er iets loopt */
    function ensureServiceTimerRunning() {
        if (serviceIntervalRef.current) return;
        const start = serviceStart || new Date();
        if (!serviceStart) setServiceStart(start);
        serviceIntervalRef.current = setInterval(() => {
            setServiceElapsed(Math.floor((Date.now() - start.getTime()) / 1000));
        }, 1000);
    }

    /* Per-gerecht timer starten */
    function startDishTimer(dishKey: string) {
        ensureServiceTimerRunning();
        if (dishIntervalsRef.current[dishKey]) return;
        const start = new Date();
        setDishTimers(prev => Object.assign({}, prev, { [dishKey]: { start, elapsed: 0 } }));
        dishIntervalsRef.current[dishKey] = setInterval(() => {
            setDishTimers(prev => {
                const t = prev[dishKey];
                if (!t || !t.start) return prev;
                return Object.assign({}, prev, { [dishKey]: { start: t.start, elapsed: Math.floor((Date.now() - t.start.getTime()) / 1000) } });
            });
        }, 1000);
    }

    function stopDishTimer(dishKey: string) {
        if (dishIntervalsRef.current[dishKey]) {
            clearInterval(dishIntervalsRef.current[dishKey]);
            delete dishIntervalsRef.current[dishKey];
        }
    }

    function toggleDishStep(dishKey: string, stepIdx: number) {
        setDishChecked(prev => {
            const existing = prev[dishKey] || {};
            return Object.assign({}, prev, { [dishKey]: Object.assign({}, existing, { [stepIdx]: !existing[stepIdx] }) });
        });
    }

    function markDishDone(dishKey: string, dishName: string, count: number) {
        stopDishTimer(dishKey);
        setCompletedDishes(prev => Object.assign({}, prev, { [dishKey]: true }));
        showToast('✓ ' + dishName + ' meegegeven (' + count + '×)');
    }

    function addExtraVegaDish(gangSlug: string) {
        const naam = (newVegaInputs[gangSlug] || '').trim();
        if (!naam) return;
        setExtraVegaDishes(prev => Object.assign({}, prev, { [gangSlug]: [...(prev[gangSlug] || []), naam] }));
        setNewVegaInputs(prev => { const n = Object.assign({}, prev); delete n[gangSlug]; return n; });
        showToast('🌿 Extra vega-gerecht toegevoegd');
    }

    function removeExtraVegaDish(gangSlug: string, idx: number) {
        setExtraVegaDishes(prev => {
            const list = [...(prev[gangSlug] || [])];
            list.splice(idx, 1);
            return Object.assign({}, prev, { [gangSlug]: list });
        });
    }

    function dishKey(gangSlug: string, isVega: boolean, index: number, extra: boolean = false) {
        return gangSlug + '_' + (extra ? 'x' : (isVega ? 'v' : 'n')) + '_' + index;
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

    /* Zijn alle gerechten in deze gang al meegegeven? */
    function allDishesDone(gangSlug: string, meatNames: string[], vegaNames: string[], extraVega: string[]): boolean {
        const allKeys: string[] = [
            ...meatNames.map((_, i) => dishKey(gangSlug, false, i)),
            ...vegaNames.map((_, i) => dishKey(gangSlug, true, i)),
            ...extraVega.map((_, i) => dishKey(gangSlug, true, i, true)),
        ];
        if (allKeys.length === 0) return false;
        return allKeys.every(k => completedDishes[k]);
    }

    /* Per-gerecht dashboard — eigen foto, eigen timer, eigen battle plan, eigen actie */
    function renderDishCard(opts: { key: string; dishName: string; count: number; isVega: boolean; isExtra?: boolean; extraIdx?: number; gangSlug: string; gangState: string }) {
        const { key, dishName, count, isVega, isExtra, extraIdx, gangSlug, gangState } = opts;
        /* Case-insensitive lookup zodat "Miso Panna Cotta" matcht met "miso panna cotta" */
        const normalize = (n: string) => (n || '').toLowerCase().trim();
        const gd: any = gerechtenDb.find((g: any) => normalize(g.naam) === normalize(dishName) && (isVega || g.gang_slug === gangSlug))
            || gerechtenDb.find((g: any) => normalize(g.naam) === normalize(dishName));
        const inDb = !!gd;
        const foto = gd?.foto_url || gd?.service_image;
        const desc = gd?.beschrijving || '';
        const steps: string[] = gd?.battle_plan_steps || [];
        const target = gd?.target_prep_time || 0;
        const isDone = !!completedDishes[key];
        const timer = dishTimers[key];
        const running = !!timer?.start && !isDone;
        const elapsed = timer?.elapsed || 0;
        const isOver = target > 0 && elapsed > target;
        const checks = dishChecked[key] || {};
        const doneSteps = Object.values(checks).filter(Boolean).length;
        const stepProgress = steps.length > 0 ? Math.round((doneSteps / steps.length) * 100) : 0;
        const dishLocked = gangState === 'idle'; /* Kan pas starten als gang actief is */

        return (
            <div key={key} className={'dish-dash' + (isVega ? ' vega' : ' meat') + (running ? ' running' : '') + (isDone ? ' done' : '') + (isOver ? ' overtime' : '')}>
                {/* COVER: foto full-width met gradient-overlay */}
                <div className="dish-cover">
                    {foto ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={foto} alt={dishName} className="dish-cover-img" />
                    ) : (
                        <div className={'dish-cover-ph' + (isVega ? ' vega' : '')}>
                            <span className="dish-cover-ph-icon">{isVega ? '🌿' : '🔥'}</span>
                        </div>
                    )}
                    {/* Dark gradient overlay */}
                    <div className="dish-cover-gradient" />
                    {/* Top-row: status-chips */}
                    <div className="dish-cover-topbar">
                        <span className={'dish-type-chip' + (isVega ? ' vega' : ' meat')}>{isVega ? '🌿 VEGA' : '🔥 VLEES'}</span>
                        {isExtra && <span className="dish-extra-chip">✨ EXTRA</span>}
                        {isDone && <span className="dish-status-chip done">✓ KLAAR</span>}
                        {running && <span className="dish-status-chip live">● LIVE</span>}
                        {isOver && <span className="dish-status-chip over">⚠ OVER TIJD</span>}
                    </div>
                    {/* Bottom-row: naam + XL count-badge */}
                    <div className="dish-cover-bottom">
                        <div className="dish-cover-title-wrap">
                            <h3 className="dish-cover-name">{dishName}</h3>
                            {desc && <p className="dish-cover-desc">{desc}</p>}
                        </div>
                        <div className="dish-cover-count-xl">
                            <span className="dcx-num">{count}</span>
                            <span className="dcx-mult">×</span>
                        </div>
                    </div>
                </div>

                {/* Timer + progress */}
                <div className="dish-dash-timeline">
                    <div className="dish-dash-timer-wrap">
                        <div className="dish-dash-timer-label">{isDone ? 'Eindtijd' : running ? 'Bereiding' : target > 0 ? 'Richttijd' : 'Nog niet gestart'}</div>
                        <div className={'dish-dash-timer' + (running ? ' running' : '') + (isOver ? ' overtime' : '')}>
                            {running ? formatTime(elapsed) : target > 0 ? formatTime(target) : '00:00'}
                        </div>
                        {target > 0 && running && (
                            <div className="dish-dash-target">target {formatTime(target)}</div>
                        )}
                    </div>
                    {steps.length > 0 && (
                        <div className="dish-dash-progress-wrap">
                            <div className="dish-dash-progress-label">{doneSteps}/{steps.length} stappen · {stepProgress}%</div>
                            <div className="dish-dash-progress-bar">
                                <div className="dish-dash-progress-fill" style={{ width: stepProgress + '%' }} />
                            </div>
                        </div>
                    )}
                </div>

                {/* Battle plan checklist */}
                {steps.length > 0 ? (
                    <ol className="dish-dash-plan">
                        {steps.map((step: string, i: number) => {
                            const checked = !!checks[i];
                            return (
                                <li key={i} onClick={() => toggleDishStep(key, i)} className={'dish-plan-step' + (checked ? ' checked' : '')}>
                                    <span className="dish-plan-no">{checked ? '✓' : i + 1}</span>
                                    <span className="dish-plan-txt">{step}</span>
                                </li>
                            );
                        })}
                    </ol>
                ) : !inDb ? (
                    <div className="dish-dash-plan-new">
                        <div className="dpn-icon">✨</div>
                        <div className="dpn-body">
                            <div className="dpn-title">Nieuw gerecht</div>
                            <div className="dpn-desc">&quot;{dishName}&quot; staat nog niet in je keuken. Voeg toe voor foto, beschrijving en battle plan.</div>
                        </div>
                        <a href={'/recepten?new=' + encodeURIComponent(dishName)} className="dpn-cta">+ Toevoegen</a>
                    </div>
                ) : (
                    <div className="dish-dash-plan-empty">
                        Geen battle-plan stappen ingesteld. Voeg toe in <a href="/recepten" className="dish-link">Recepten</a>.
                    </div>
                )}

                {/* Actie-row */}
                <div className="dish-dash-actions">
                    {dishLocked ? (
                        <div className="dish-locked-hint">Start eerst de gang hierboven</div>
                    ) : !running && !isDone ? (
                        <button className="dish-btn dish-btn-start" onClick={() => startDishTimer(key)}>
                            ▶ Start bereiding
                        </button>
                    ) : running && !isDone ? (
                        <button className="dish-btn dish-btn-done" onClick={() => markDishDone(key, dishName, count)}>
                            ✓ Meegegeven · {count}×
                        </button>
                    ) : (
                        <div className="dish-done-row">
                            <span className="dish-done-txt">✓ Meegegeven {timer ? '· ' + formatTime(elapsed) : ''}</span>
                        </div>
                    )}
                    {isExtra && typeof extraIdx === 'number' && !isDone && (
                        <button className="dish-btn-remove" onClick={() => removeExtraVegaDish(gangSlug, extraIdx)} title="Verwijder extra gerecht">×</button>
                    )}
                </div>
            </div>
        );
    }

    /* ──────────────────────────────────────────────────────────────
       SERVICE MODE — KDS (Kitchen Display System) Hop & Bites stijl
       ────────────────────────────────────────────────────────────── */
    const servedCount = gangen.filter((g: any) => bonStates[g.slug] === 'served').length;
    const activeCount = gangen.filter((g: any) => bonStates[g.slug] === 'active').length;
    const totalGangen = gangen.length;
    const avgAllTimes = (() => {
        const times = gangen.map((g: any) => getAvgTime(g.slug)).filter(Boolean) as number[];
        if (!times.length) return null;
        return Math.round(times.reduce((a, b) => a + b, 0) / times.length);
    })();

    return (
        <div className="service-kds-wrap">
            <PageHint id="service" title="Kitchen Display" description="Live service-flow. Bonnen per gang, timers lopen realtime, bump bij uitserveren." />

            {!selectedId ? (
                /* ═══════════ EVENT-SELECTIE ═══════════ */
                <>
                    <div className="service-hero">
                        <div className="service-hero-eyebrow">● KITCHEN DISPLAY · SERVICE MODE</div>
                        <h1 className="service-hero-title">Selecteer event</h1>
                        <p className="service-hero-sub">Start de service voor één van de aankomende caterings. Timers lopen vanaf &quot;start gang&quot; en worden geregistreerd in HACCP.</p>
                    </div>

                    {offertes.length === 0 ? (
                        <div className="service-empty"><EmptyState page="/service" /></div>
                    ) : (
                        <div className="service-event-grid">
                            {offertes.map((o: any) => {
                                const gangenCount = o.menu_selectie ? Object.keys(typeof o.menu_selectie === 'string' ? JSON.parse(o.menu_selectie) : o.menu_selectie).filter(k => !k.endsWith('_vega')).length : 0;
                                const evDate = o.datum ? new Date(o.datum + 'T17:00:00') : null;
                                const daysLeft = evDate ? Math.ceil((evDate.getTime() - nowTs) / 86400000) : null;
                                const isToday = daysLeft === 0;
                                const isPast = daysLeft !== null && daysLeft < 0;
                                return (
                                    <button key={o.id} onClick={() => selectEvent(o)} className={'service-event-card' + (isToday ? ' today' : '')}>
                                        <div className="service-event-top">
                                            <div className="service-event-date">
                                                {evDate ? evDate.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' }) : '—'}
                                            </div>
                                            <span className={'service-pill ' + (isToday ? 'live' : o.status === 'definitief' ? 'ok' : 'pending')}>
                                                {isToday ? '● VANDAAG' : isPast ? 'AFGELOPEN' : o.status?.toUpperCase() || 'CONCEPT'}
                                            </span>
                                        </div>
                                        <div className="service-event-name">{o.client_naam || 'Naamloos event'}</div>
                                        <div className="service-event-meta">
                                            <div><span className="mlabel">Gasten</span><span className="mval">{o.aantal_gasten || 0}{o.aantal_vega > 0 && <span className="vega"> · {o.aantal_vega}🌿</span>}</span></div>
                                            <div><span className="mlabel">Gangen</span><span className="mval">{gangenCount || '—'}</span></div>
                                            <div><span className="mlabel">Tijd</span><span className="mval">{daysLeft !== null && daysLeft >= 0 ? (isToday ? 'Nu' : `T-${daysLeft}d`) : '—'}</span></div>
                                        </div>
                                        <div className="service-event-start">Start service →</div>
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    {historie.length > 0 && (
                        <div className="service-stats-wrap">
                            <button className="service-stats-toggle" onClick={() => setShowHistorie(!showHistorie)}>
                                {showHistorie ? 'Verberg statistieken' : `Gemiddelde servicetijden (${historie.length} bonnen)`}
                                <span style={{ marginLeft: 8, opacity: 0.5 }}>{showHistorie ? '▾' : '▸'}</span>
                            </button>
                            {showHistorie && (
                                <div className="service-stats-grid">
                                    {gangen.map((gang: any) => {
                                        const avg = getAvgTime(gang.slug);
                                        return (
                                            <div key={gang.slug} className="service-stat-tile">
                                                <div className="stat-label">{gang.naam}</div>
                                                <div className="stat-val">{avg ? formatTime(avg) : '—'}</div>
                                                <div className="stat-sub">{avg ? 'gem. servicetijd' : 'nog geen data'}</div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}
                </>
            ) : (
                /* ═══════════ ACTIEVE SERVICE — KDS VIEW ═══════════ */
                <div className="service-active-wrap">
                    {/* HERO: event info + overall timer + progress */}
                    <div className="service-cockpit">
                        <button className="service-back-btn" onClick={() => setSelectedId(null)}>← Andere event</button>
                        <div className="service-cockpit-grid">
                            <div className="cockpit-left">
                                <div className="cockpit-eyebrow">● LIVE SERVICE · {selected.datum}</div>
                                <h1 className="cockpit-title">{selected.client_naam || 'Event'}</h1>
                                <div className="cockpit-meta">
                                    <span><strong>{selected.aantal_gasten}</strong> gasten</span>
                                    <span className="dot">·</span>
                                    <span>🔥 {aantalNormaal}× vlees</span>
                                    {aantalVega > 0 && <><span className="dot">·</span><span className="vega-text">🌿 {aantalVega}× vega</span></>}
                                </div>
                            </div>
                            <div className="cockpit-right">
                                {serviceStart && (
                                    <div className="cockpit-service-timer">
                                        <div className="cst-eyebrow">SERVICE LIVE</div>
                                        <div className="cst-val">{formatTime(serviceElapsed)}</div>
                                    </div>
                                )}
                                <div className="cockpit-kpis-stack">
                                    <div className="cockpit-kpi">
                                        <div className="kpi-val">{servedCount}<span className="kpi-sep">/</span>{totalGangen}</div>
                                        <div className="kpi-lbl">Gangen klaar</div>
                                    </div>
                                    <div className="cockpit-kpi">
                                        <div className={'kpi-val' + (activeCount ? ' pulse' : '')}>{Object.keys(dishTimers).filter(k => dishTimers[k]?.start && !completedDishes[k]).length || (activeCount > 0 ? '●' : '○')}</div>
                                        <div className="kpi-lbl">{Object.keys(dishTimers).filter(k => dishTimers[k]?.start && !completedDishes[k]).length > 0 ? 'Gerechten live' : activeCount > 0 ? 'In actie' : 'Idle'}</div>
                                    </div>
                                    {avgAllTimes && (
                                        <div className="cockpit-kpi">
                                            <div className="kpi-val small">{formatTime(avgAllTimes)}</div>
                                            <div className="kpi-lbl">Gem. tijd</div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Progress track — gangen als stippen */}
                        <div className="service-progress-track">
                            {gangen.map((g: any, i: number) => {
                                const state = bonStates[g.slug] || 'idle';
                                return (
                                    <div key={g.slug} className={'track-step state-' + state}>
                                        <div className="track-dot">{state === 'served' ? '✓' : i + 1}</div>
                                        <div className="track-lbl">{g.naam}</div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {allServed && (
                        <div className="service-all-done">
                            🏁 <span>Alle gangen uitgeserveerd. Service compleet.</span>
                        </div>
                    )}

                    {/* ═══════════ GANGEN — elk met eigen dish-dashboards ═══════════ */}
                    {gangen.map((gang: any, idx: number) => {
                        const state = bonStates[gang.slug] || 'idle';
                        const gangElapsed = state === 'served' ? (finalTimes[gang.slug] || 0) : (timers[gang.slug] ? timers[gang.slug].elapsed : 0);
                        const avgTime = getAvgTime(gang.slug);

                        /* Alle gerechten voor deze gang — vlees + vega + extra ad-hoc */
                        const meatNames: string[] = menuSelectie[gang.slug] || [];
                        const hasOverride = Array.isArray(menuSelectie[gang.slug + '_vega']) && menuSelectie[gang.slug + '_vega'].length > 0;
                        const dbVega = aantalVega > 0 ? getVegaDishesForGang(gang.slug) : [];
                        const vegaNames: string[] = hasOverride ? menuSelectie[gang.slug + '_vega'] : dbVega;
                        const extraVega: string[] = extraVegaDishes[gang.slug] || [];

                        const focused = focusedGang === gang.slug || (focusedGang === null && state === 'active') || (focusedGang === null && state === 'idle' && idx === 0);
                        const compact = !focused;

                        if (compact && state === 'served') {
                            /* Compacte strook voor voltooide gangen */
                            return (
                                <div key={gang.slug} className="gang-section gang-done" onClick={() => setFocusedGang(gang.slug)}>
                                    <div className="gang-done-no">{String(idx + 1).padStart(2, '0')}</div>
                                    <div className="gang-done-info">
                                        <div className="gang-done-name">{gang.naam}</div>
                                        <div className="gang-done-sub">✓ Uitgeserveerd · {formatTime(gangElapsed)}{avgTime && ' · gem. ' + formatTime(avgTime)}</div>
                                    </div>
                                    <div className="gang-done-time">{formatTime(gangElapsed)}</div>
                                </div>
                            );
                        }

                        if (compact) {
                            /* Preview-card voor wachtende / volgende gangen */
                            const previewDishes = meatNames.slice(0, 2);
                            return (
                                <div key={gang.slug} className={'gang-section gang-preview state-' + state} onClick={() => setFocusedGang(gang.slug)}>
                                    <div className="gang-preview-left">
                                        <div className="gang-preview-no">{String(idx + 1).padStart(2, '0')}</div>
                                        <div>
                                            <div className="gang-preview-name">{gang.naam}</div>
                                            <div className="gang-preview-dishes">
                                                {previewDishes.map(d => d).join(' · ')}
                                                {meatNames.length > 2 && ' + ' + (meatNames.length - 2)}
                                                {vegaNames.length > 0 && <span className="gang-preview-vega"> · 🌿 {vegaNames.length} vega</span>}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="gang-preview-action">
                                        <span className="gang-preview-status">{state === 'active' ? '● Actief' : '○ Wacht'}</span>
                                        <button className="gang-preview-btn" onClick={(e) => { e.stopPropagation(); setFocusedGang(gang.slug); }}>Open →</button>
                                    </div>
                                </div>
                            );
                        }

                        /* GEFOCUSTE GANG — volledig dashboard met dish-cards per gerecht */
                        return (
                            <div key={gang.slug} className={'gang-section gang-focused state-' + state}>
                                {/* Gang-header */}
                                <div className="gang-focused-head">
                                    <div className="gang-focused-left">
                                        <div className="gang-focused-eyebrow">Gang {idx + 1} · {state === 'served' ? 'VOLTOOID' : state === 'active' ? '● IN ACTIE' : '○ KLAAR VOOR START'}</div>
                                        <h2 className="gang-focused-title">{gang.naam}</h2>
                                        <div className="gang-focused-meta">
                                            <span>🔥 {meatNames.length} vlees</span>
                                            {(vegaNames.length + extraVega.length) > 0 && <><span className="dot">·</span><span className="vega-text">🌿 {vegaNames.length + extraVega.length} vega</span></>}
                                            {avgTime && <><span className="dot">·</span><span>gem. {formatTime(avgTime)}</span></>}
                                        </div>
                                    </div>
                                    <div className="gang-focused-right">
                                        <div className={'gang-focused-timer' + (state === 'active' ? ' live' : '')}>
                                            <div className="gfl-label">{state === 'served' ? 'Eindtijd' : state === 'active' ? 'Live service' : 'Gang-timer'}</div>
                                            <div className="gfl-val">{formatTime(gangElapsed)}</div>
                                        </div>
                                        {state === 'idle' && (
                                            <button className="gang-focused-start" onClick={() => startGang(gang.slug)}>▶ Start gang</button>
                                        )}
                                        {state === 'active' && allDishesDone(gang.slug, meatNames, vegaNames, extraVega) && (
                                            <button className="gang-focused-finish" onClick={() => requestFinishGang(gang.slug)}>✓ Gang uitserveren</button>
                                        )}
                                    </div>
                                </div>

                                {/* Dish-grid: per gerecht eigen dashboard (vlees + vega parallel) */}
                                <div className="dish-dashboard-grid">
                                    {/* VLEES gerechten */}
                                    {meatNames.map((dish: string, i: number) => {
                                        const key = dishKey(gang.slug, false, i);
                                        return renderDishCard({
                                            key,
                                            dishName: dish,
                                            count: aantalNormaal,
                                            isVega: false,
                                            gangSlug: gang.slug,
                                            gangState: state,
                                        });
                                    })}

                                    {/* VEGA gerechten — parallel twin */}
                                    {vegaNames.map((dish: string, i: number) => {
                                        const key = dishKey(gang.slug, true, i);
                                        return renderDishCard({
                                            key,
                                            dishName: dish,
                                            count: aantalVega,
                                            isVega: true,
                                            gangSlug: gang.slug,
                                            gangState: state,
                                        });
                                    })}

                                    {/* Ad-hoc extra vega */}
                                    {extraVega.map((dish: string, i: number) => {
                                        const key = dishKey(gang.slug, true, i, true);
                                        return renderDishCard({
                                            key,
                                            dishName: dish,
                                            count: 1,
                                            isVega: true,
                                            isExtra: true,
                                            extraIdx: i,
                                            gangSlug: gang.slug,
                                            gangState: state,
                                        });
                                    })}
                                </div>

                                {/* + Nog een vega toevoegen */}
                                <div className="dish-addvega-wrap">
                                    {newVegaInputs[gang.slug] !== undefined ? (
                                        <div className="dish-addvega-form">
                                            <input
                                                autoFocus
                                                value={newVegaInputs[gang.slug] || ''}
                                                onChange={(e) => setNewVegaInputs(prev => Object.assign({}, prev, { [gang.slug]: e.target.value }))}
                                                onKeyDown={(e) => { if (e.key === 'Enter') addExtraVegaDish(gang.slug); if (e.key === 'Escape') setNewVegaInputs(prev => { const n = Object.assign({}, prev); delete n[gang.slug]; return n; }); }}
                                                placeholder="Naam van vega-gerecht..."
                                                className="dish-addvega-input"
                                            />
                                            <button className="dish-addvega-ok" onClick={() => addExtraVegaDish(gang.slug)}>✓ Toevoegen</button>
                                            <button className="dish-addvega-cancel" onClick={() => setNewVegaInputs(prev => { const n = Object.assign({}, prev); delete n[gang.slug]; return n; })}>Annuleer</button>
                                        </div>
                                    ) : (
                                        <button className="dish-addvega-btn" onClick={() => setNewVegaInputs(prev => Object.assign({}, prev, { [gang.slug]: '' }))}>
                                            <span className="dish-addvega-icon">🌿</span>
                                            <span>+ Extra vega-gerecht voor deze gang</span>
                                            <span className="dish-addvega-hint">parallel prep mogelijk</span>
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* ═══════════ ARCHITECT MODAL — schoner ═══════════ */}
            {activeModal && modalGang && (
                <div className="architect-modal">
                    <header className="architect-top">
                        <div className="architect-breadcrumb">
                            <button className="architect-close" onClick={() => setActiveModal(null)}>← Terug naar service</button>
                            <div className="architect-gang-pill">Gang {gangen.indexOf(modalGang) + 1} · {modalGang.naam}</div>
                        </div>
                        <div className={'architect-timer' + (isOvertime ? ' overtime' : '')}>
                            <div className="architect-timer-val">{formatTime(modalElapsed)}</div>
                            {targetTime > 0 && <div className="architect-timer-target">target {formatTime(targetTime)}</div>}
                        </div>
                    </header>

                    {/* Dish tabs */}
                    {modalDishesAll.length > 1 && (
                        <div className="architect-dishtabs">
                            {modalDishesAll.map((d, i) => {
                                const isDone = completedDishes[d.key];
                                const isCurrent = i === modalDishIndex;
                                return (
                                    <button key={i} onClick={() => { setModalDishIndex(i); setCheckedSteps({}); }}
                                        className={'arch-tab' + (isCurrent ? ' current' : '') + (isDone ? ' done' : '') + (d.isVega ? ' vega' : '')}>
                                        <span className="arch-tab-icon">{isDone ? '✓' : (d.isVega ? '🌿' : '🔥')}</span>
                                        <span className="arch-tab-name">{d.naam}</span>
                                        <span className="arch-tab-count">{d.count}×</span>
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    <div className="architect-main">
                        <div className="architect-dish">
                            {currentImage && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={currentImage} alt={currentDish.naam} className="architect-dish-img" />
                            )}
                            <div className="architect-dish-hdr">
                                <div className="architect-dish-eyebrow">
                                    {currentDishEntry.isVega ? '🌿 Vega-variant' : '🔥 Vlees-gerecht'} · {currentDishEntry.count}×
                                </div>
                                <h2 className="architect-dish-name">{currentDish.naam || 'Gerecht'}</h2>
                                {currentDish.beschrijving && <p className="architect-dish-desc">{currentDish.beschrijving}</p>}
                            </div>
                        </div>

                        <div className="architect-plan">
                            <div className="architect-plan-head">Battle plan</div>
                            {currentSteps.length === 0 ? (
                                <div className="architect-plan-empty">Geen stappen ingesteld voor dit gerecht.</div>
                            ) : (
                                <ol className="architect-plan-steps">
                                    {currentSteps.map((step: string, i: number) => {
                                        const isChecked = checkedSteps[modalDishIndex + '_' + i];
                                        return (
                                            <li key={i} onClick={() => toggleStep(i)} className={'arch-step' + (isChecked ? ' checked' : '')}>
                                                <div className="arch-step-no">{isChecked ? '✓' : i + 1}</div>
                                                <div className="arch-step-txt">{step}</div>
                                            </li>
                                        );
                                    })}
                                </ol>
                            )}
                        </div>
                    </div>

                    <footer className="architect-bottom">
                        <div className="architect-mini-bar">
                            {modalDishesAll.map((d, i) => {
                                const isDone = completedDishes[d.key];
                                return (
                                    <div key={d.key} className={'arch-mini' + (isDone ? ' done' : '') + (i === modalDishIndex ? ' current' : '')}>
                                        <span>{isDone ? '✓' : (d.isVega ? '🌿' : '🔥')}</span>
                                        <span>{d.naam}</span>
                                        <span className="arch-mini-count">{d.count}×</span>
                                    </div>
                                );
                            })}
                        </div>

                        <div className="architect-actions">
                            {!completedDishes[currentDishEntry.key] ? (
                                <button className="architect-cta" onClick={() => {
                                    setCompletedDishes(prev => Object.assign({}, prev, { [currentDishEntry.key]: true }));
                                    const nextIdx = modalDishesAll.findIndex((d, i) => i > modalDishIndex && !completedDishes[d.key]);
                                    if (nextIdx >= 0) { setModalDishIndex(nextIdx); setCheckedSteps({}); }
                                    showToast('✓ ' + currentDishEntry.naam + ' meegegeven (' + currentDishEntry.count + '×)');
                                }}>
                                    {currentDishEntry.isVega ? '🌿' : '🔥'} Gerecht meegeven
                                </button>
                            ) : modalDishesAll.every(d => completedDishes[d.key]) ? (
                                <button className="architect-cta finish" onClick={() => requestFinishGang(activeModal!)}>
                                    ✓ Gang uitserveren — alle gerechten mee
                                </button>
                            ) : (
                                <div className="architect-next">
                                    <span className="architect-next-done">✓ {currentDishEntry.naam} meegegeven</span>
                                    <button className="architect-next-btn" onClick={() => {
                                        const nextIdx = modalDishesAll.findIndex(d => !completedDishes[d.key]);
                                        if (nextIdx >= 0) { setModalDishIndex(nextIdx); setCheckedSteps({}); }
                                    }}>Volgende gerecht →</button>
                                </div>
                            )}
                        </div>
                    </footer>
                </div>
            )}

            {/* ═══════════ TEMP POPUP — HACCP ═══════════ */}
            {tempPopup && (
                <div className="temp-popup-overlay" onClick={skipTempAndFinish}>
                    <div className="temp-popup" onClick={(e) => e.stopPropagation()}>
                        <div className="temp-eyebrow">● HACCP · Kerntemperatuur registreren</div>
                        <h2 className="temp-title">{tempPopup.dishName}</h2>
                        <div className="temp-slider-wrap">
                            <div className="temp-val">{tempPopup.temp}<span className="temp-unit">°C</span></div>
                            <input type="range" min={0} max={120} step={1} value={tempPopup.temp}
                                onChange={(e) => setTempPopup(p => p ? { ...p, temp: parseInt(e.target.value) } : null)}
                                className="temp-slider" />
                            <div className="temp-hint">
                                {tempPopup.temp >= 75 ? '✓ Veilig · ≥75°C' :
                                    tempPopup.temp <= 7 ? '✓ Koeling · ≤7°C' :
                                        tempPopup.temp >= 65 ? '⚠ Zorgwekkend · 65–74°C' : '✗ Onveilig'}
                            </div>
                        </div>
                        <div className="temp-actions">
                            <button className="temp-btn cancel" onClick={skipTempAndFinish}>Overslaan</button>
                            <button className="temp-btn save" onClick={confirmTempAndFinish}>Opslaan & uitserveren</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
