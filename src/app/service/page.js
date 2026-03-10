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

    useEffect(function () {
        loadData();
        return function () {
            Object.values(intervalRef.current).forEach(clearInterval);
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

        showToast('⏱️ Gang gestart!', 'info');
    }

    async function serveGang(slug) {
        var now = new Date();
        var elapsed = timers[slug] ? timers[slug].elapsed : 0;

        if (intervalRef.current[slug]) {
            clearInterval(intervalRef.current[slug]);
            delete intervalRef.current[slug];
        }

        setBonStates(function (prev) { return Object.assign({}, prev, { [slug]: 'served' }); });
        setFinalTimes(function (prev) { return Object.assign({}, prev, { [slug]: elapsed }); });

        await supabase.from('service_logs')
            .update({ served_at: now.toISOString(), duration_seconds: elapsed })
            .eq('offerte_id', selectedId)
            .eq('gang_slug', slug)
            .is('served_at', null);

        showToast('✅ Gang geserveerd!');
        loadHistorie();
    }

    function formatTime(seconds) {
        var m = Math.floor(seconds / 60);
        var s = seconds % 60;
        return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
    }

    // Bereken gemiddelde tijd per gang slug uit historie
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

    // Groepeer historie per offerte
    function getHistoriePerEvent() {
        var eventMap = {};
        historie.forEach(function (log) {
            if (!eventMap[log.offerte_id]) eventMap[log.offerte_id] = [];
            eventMap[log.offerte_id].push(log);
        });
        // Match met offerte info
        return Object.keys(eventMap).map(function (oid) {
            var off = offertes.find(function (o) { return o.id === oid; });
            return {
                offerte_id: oid,
                naam: off ? off.client_naam : 'Onbekend',
                datum: off ? off.datum : '',
                logs: eventMap[oid]
            };
        }).slice(0, 10); // Max 10 events
    }

    return (
        <div className="main-content" style={{ maxWidth: 1200 }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 20 }}>📋 Service Mode</h2>

            {!selectedId ? (
                <div>
                    <p style={{ color: 'var(--muted)', marginBottom: 16 }}>Selecteer een event om de bonnen te starten:</p>
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

                            // Zoek de volledige gerecht-data voor elk dish in deze gang
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
                                            ▶ START
                                        </button>
                                    )}
                                    {state === 'active' && (
                                        <button className="bon-action-btn bon-serve-btn" onClick={function () { serveGang(gang.slug); }}>
                                            ✅ GESERVEERD
                                        </button>
                                    )}
                                    {state === 'served' && (
                                        <div style={{ marginTop: 12, textAlign: 'center', fontSize: 12, color: '#6B7A2F', fontWeight: 700 }}>
                                            ✓ Klaar in {formatTime(elapsed)}
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
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
