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
            if (modalTimerRef.current) clearInterval(modalTimerRef.current);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

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
                                <div className="cockpit-kpi">
                                    <div className="kpi-val">{servedCount}<span className="kpi-sep">/</span>{totalGangen}</div>
                                    <div className="kpi-lbl">Gangen klaar</div>
                                </div>
                                <div className="cockpit-kpi">
                                    <div className={'kpi-val' + (activeCount ? ' pulse' : '')}>{activeCount > 0 ? '●' : '○'}</div>
                                    <div className="kpi-lbl">{activeCount > 0 ? 'In actie' : 'Idle'}</div>
                                </div>
                                {avgAllTimes && (
                                    <div className="cockpit-kpi">
                                        <div className="kpi-val small">{formatTime(avgAllTimes)}</div>
                                        <div className="kpi-lbl">Gem. tijd</div>
                                    </div>
                                )}
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

                    {/* KDS TICKET GRID */}
                    <div className="service-ticket-grid">
                        {gangen.map((gang: any, idx: number) => {
                            const state = bonStates[gang.slug] || 'idle';
                            const dishNames = menuSelectie[gang.slug] || [];
                            const elapsed = state === 'served' ? (finalTimes[gang.slug] || 0) : (timers[gang.slug] ? timers[gang.slug].elapsed : 0);
                            const hasOverride = Array.isArray(menuSelectie[gang.slug + '_vega']) && menuSelectie[gang.slug + '_vega'].length > 0;
                            const dbVega = aantalVega > 0 ? getVegaDishesForGang(gang.slug) : [];
                            const vegaDishes: string[] = hasOverride ? menuSelectie[gang.slug + '_vega'] : dbVega;
                            const isEditing = vegaInputs['_editing_' + gang.slug] === '1';
                            const avgTime = getAvgTime(gang.slug);
                            return (
                                <div key={gang.slug} className={'service-ticket state-' + state}>
                                    <div className="ticket-head">
                                        <div className="ticket-gang-no">{String(idx + 1).padStart(2, '0')}</div>
                                        <div className="ticket-gang-info">
                                            <div className="ticket-gang-name">{gang.naam}</div>
                                            <div className="ticket-gang-sub">
                                                {state === 'active' && <span className="status-active">● In actie</span>}
                                                {state === 'served' && <span className="status-done">✓ Uitgeserveerd</span>}
                                                {state === 'idle' && <span className="status-wait">○ Wacht</span>}
                                                {avgTime && <span className="avg-time">· gem. {formatTime(avgTime)}</span>}
                                            </div>
                                        </div>
                                        <div className="ticket-timer">{formatTime(elapsed)}</div>
                                    </div>

                                    <div className="ticket-dishes">
                                        {/* Normaal */}
                                        {dishNames.map((dish: string, i: number) => {
                                            const gd = gerechtenDb.find((g: any) => g.naam === dish && g.gang_slug === gang.slug);
                                            return (
                                                <div key={'n_' + i} className="ticket-dish">
                                                    {gd?.foto_url ? (
                                                        // eslint-disable-next-line @next/next/no-img-element
                                                        <img src={gd.foto_url} alt="" className="ticket-dish-img" />
                                                    ) : (
                                                        <div className="ticket-dish-img ph">🔥</div>
                                                    )}
                                                    <div className="ticket-dish-name">{dish}</div>
                                                    <div className="ticket-dish-count">{aantalNormaal}×</div>
                                                </div>
                                            );
                                        })}
                                        {/* Vega */}
                                        {aantalVega > 0 && !isEditing && vegaDishes.length > 0 && vegaDishes.map((v: string, i: number) => {
                                            const gd = gerechtenDb.find((g: any) => g.naam === v);
                                            return (
                                                <div key={'v_' + i} className="ticket-dish vega-row">
                                                    {gd?.foto_url ? (
                                                        // eslint-disable-next-line @next/next/no-img-element
                                                        <img src={gd.foto_url} alt="" className="ticket-dish-img" />
                                                    ) : (
                                                        <div className="ticket-dish-img ph vega">🌿</div>
                                                    )}
                                                    <div className="ticket-dish-name vega-name">{v}</div>
                                                    <div className="ticket-dish-count vega-count">{aantalVega}×</div>
                                                </div>
                                            );
                                        })}
                                        {aantalVega > 0 && vegaDishes.length === 0 && !isEditing && (
                                            <button className="ticket-add-vega" onClick={(e) => { e.stopPropagation(); setVegaInputs(prev => Object.assign({}, prev, { ['_editing_' + gang.slug]: '1', [gang.slug]: '' })); }}>
                                                🌿 Vega-variant toevoegen
                                            </button>
                                        )}
                                        {aantalVega > 0 && isEditing && (
                                            <div className="ticket-vega-edit">
                                                <input value={vegaInputs[gang.slug] || ''}
                                                    onChange={(e) => setVegaInputs(prev => Object.assign({}, prev, { [gang.slug]: e.target.value }))}
                                                    placeholder="Vega gerecht..."
                                                    onClick={(e) => e.stopPropagation()} />
                                                {vegaInputs[gang.slug] && (
                                                    <button onClick={(e) => {
                                                        e.stopPropagation();
                                                        saveVegaDish(gang.slug);
                                                        setVegaInputs(prev => { const n = Object.assign({}, prev); delete n['_editing_' + gang.slug]; return n; });
                                                    }} className="ticket-vega-ok">✓</button>
                                                )}
                                                <button onClick={(e) => {
                                                    e.stopPropagation();
                                                    setVegaInputs(prev => { const n = Object.assign({}, prev); delete n['_editing_' + gang.slug]; delete n[gang.slug]; return n; });
                                                }} className="ticket-vega-cancel">×</button>
                                            </div>
                                        )}
                                    </div>

                                    <div className="ticket-action">
                                        {state === 'idle' && <button className="ticket-btn btn-start" onClick={() => startGang(gang.slug)}>▶ Start gang</button>}
                                        {state === 'active' && <button className="ticket-btn btn-architect" onClick={() => setActiveModal(gang.slug)}>→ Open Architect</button>}
                                        {state === 'served' && <div className="ticket-btn-done">✓ Uitgeserveerd · {formatTime(elapsed)}</div>}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
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
