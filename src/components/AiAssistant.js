'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { parseActions, executeAction, loadPageContextData } from '@/lib/ai-actions';

// ─── AI System Operator — floating widget ─────────────────────────────────────
export default function AiAssistant() {
    var pathname = usePathname();
    var [isOpen, setIsOpen] = useState(false);
    var [messages, setMessages] = useState([]);
    var [input, setInput] = useState('');
    var [isLoading, setIsLoading] = useState(false);
    var [contextData, setContextData] = useState(null);
    var [contextLoaded, setContextLoaded] = useState(false);
    var [contextLoading, setContextLoading] = useState(false);
    // Bijhouden welke bulk-dish selecties actief zijn per bericht (msgIdx -> Set<index>)
    var [dishSelections, setDishSelections] = useState({});
    var messagesEndRef = useRef(null);
    var inputRef = useRef(null);

    var pageName = pathname === '/' ? 'Dashboard' : pathname.replace('/', '').replace(/-/g, ' ');
    pageName = pageName.charAt(0).toUpperCase() + pageName.slice(1);

    // ── Reset bij pagina-wissel ───────────────────────────────────────────────
    useEffect(function () {
        setMessages([{
            role: 'assistant',
            content: 'Hallo! Ik ben je **BBQ System Operator** op ' + pageName + '.\n\nIk kan data lezen, acties uitvoeren en gerechten direct in je systeem zetten. Wat wil je doen?',
            actions: [],
        }]);
        setContextData(null);
        setContextLoaded(false);
        setDishSelections({});
    }, [pathname]);

    // ── Context laden bij openen ──────────────────────────────────────────────
    var loadContext = useCallback(async function () {
        if (contextLoaded || contextLoading || !supabase) return;
        setContextLoading(true);
        try {
            // Laad cross-module context via server-side tool als het dashboard/events is
            var data;
            if (pathname === '/' || pathname === '/events' || pathname === '/agenda') {
                var res = await fetch('/api/ai-execute', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ tool: 'getCrossModuleContext', params: {} }),
                });
                var json = await res.json();
                data = json.result || null;
            } else {
                data = await loadPageContextData(pathname, supabase);
            }
            setContextData(data);
            setContextLoaded(true);
            if (data) {
                setMessages(function (prev) {
                    return prev.map(function (m, i) {
                        return i === 0 ? Object.assign({}, m, { contextBadge: true }) : m;
                    });
                });
            }
        } catch (e) {
            console.warn('[AI] Context laden mislukt:', e.message);
            setContextLoaded(true);
        } finally {
            setContextLoading(false);
        }
    }, [pathname, contextLoaded, contextLoading]);

    useEffect(function () {
        if (isOpen && !contextLoaded) loadContext();
    }, [isOpen, contextLoaded, loadContext]);

    useEffect(function () {
        if (isOpen && messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages, isOpen]);

    useEffect(function () {
        if (isOpen && inputRef.current) {
            setTimeout(function () { if (inputRef.current) inputRef.current.focus(); }, 100);
        }
    }, [isOpen]);

    // ── Snelkoppelingen per pagina ────────────────────────────────────────────
    var PAGE_CHIPS = {
        '/':            ['Wat moet ik vandaag regelen?', 'Maak een prep-lijst', 'Lage voorraad check', 'Omzet overzicht'],
        '/events':      ['Voeg een nieuw event toe', 'Welke events komen eraan?', 'Maak een prep-lijst', 'Tip voor grote groepen'],
        '/agenda':      ['Maak een prep-lijst', 'Planning voor komende week', 'Wat staat er dit weekend?', 'Aankomende taken'],
        '/recepten':    ['Bereken vlees voor 80 gasten', 'Dry rub recept voor brisket', 'Pulled pork bereidingstijd', 'Salade voor 50 gasten'],
        '/gerechten':   ['20 gerechten met buikspek', 'Vegetarische hapjes bedenken', 'Dessert-ideeën voor BBQ', 'Menubalans analyseren'],
        '/menu-engineering': ['Welke gerechten hebben beste marge?', 'Menu-analyse uitleggen', 'Stars vs Dogs in mijn menu', 'Gerecht verbeteren voor marge'],
        '/offertes':    ['Nieuwe offerte aanmaken', 'Welke offertes verlopen binnenkort?', 'Marge analyse', 'Omzet overzicht per status'],
        '/facturen':    ['Openstaande facturen overzicht', 'Vervallen facturen check', 'Cashflow advies', 'Debiteurenbeheer tips'],
        '/voorraad':    ['Lage voorraad check', 'Wat moet ik bijbestellen?', 'Par levels uitleggen', 'FIFO-systeem tips'],
        '/inkoop':      ['Inkooplijst voor weekend-event', 'Beste leverancier kiezen', 'Vleesinkoop calculeren', 'Bulk-voordelen berekenen'],
        '/service':     ['HACCP temperaturen checklist', 'Hoe lang warm houden?', 'Tijdlijn voor service', 'Snel probleem oplossen'],
        '/haccp':       ['Kerntemperaturen vlees', 'Koelketen checklist', 'Temperatuur registreren', 'HACCP-regels uitleggen'],
        '/uren':        ['Uren registreren', 'Overuren berekenen', 'Wettelijke regels urenregistratie', 'Pauzetijden checken'],
        '/materieel':   ['BBQ onderhoudstips', 'Welk materieel meenemen?', 'Levensduur kamado', 'Materieel checklist'],
        '/logistiek':   ['Bus inlaadvolgorde', 'Koelboxen tips', 'Vergeten items check', 'Materieel voor 100 gasten'],
        '/boekhouding': ['Omzet dit kwartaal', 'BTW-aangifte tips', 'Food cost ratio berekenen', 'Winst-verlies analyse'],
        '/price-intelligence': ['Leverancier vergelijken', 'Beste prijs-kwaliteit vlees', 'Inkoopprijs optimaliseren', 'Seizoensprijzen advies'],
        '/ai-chat':     ['20 gerechten met buikspek', 'Thema-BBQ concepten', 'Zomermenu brainstorm', 'Onderscheidend vermogen tips'],
    };
    var quickChips = PAGE_CHIPS[pathname] || ['Maak een prep-lijst', '20 gerechten met buikspek', 'Omzet overzicht', 'Lage voorraad check'];

    // ── Bericht versturen ─────────────────────────────────────────────────────
    async function sendMessage(e, overrideText) {
        if (e) e.preventDefault();
        var text = (overrideText || input).trim();
        if (!text || isLoading) return;
        setInput('');

        var userMsg = { role: 'user', content: text };
        var apiMessages = [...messages.map(function (m) { return { role: m.role, content: m.content }; }), { role: 'user', content: text }];
        setMessages(function (prev) { return [...prev, userMsg]; });
        setIsLoading(true);

        try {
            var res = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: apiMessages,
                    pageContext: pathname,
                    mode: 'context',
                    contextData: contextData,
                }),
            });
            var data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Fout opgetreden');

            var rawReply = data.choices[0].message.content;
            var parsed = parseActions(rawReply);

            var newMsgIdx = messages.length + 1; // index van het nieuwe bericht

            // Initialiseer dish-selectie voor bulk gerechten
            parsed.actions.forEach(function (action) {
                if (action.type === 'bulk_create_gerechten' && action.data.gerechten) {
                    var sel = {};
                    action.data.gerechten.forEach(function (_, i) { sel[i] = true; });
                    setDishSelections(function (prev) {
                        var next = Object.assign({}, prev);
                        next[newMsgIdx] = sel;
                        return next;
                    });
                }
            });

            setMessages(function (prev) {
                return [...prev, {
                    role: 'assistant',
                    content: parsed.cleanText,
                    actions: parsed.actions,
                }];
            });
        } catch (error) {
            setMessages(function (prev) {
                return [...prev, { role: 'assistant', content: '❌ ' + error.message, actions: [] }];
            });
        } finally {
            setIsLoading(false);
        }
    }

    // ── Dish selectie togglen ─────────────────────────────────────────────────
    function toggleDish(msgIdx, dishIdx) {
        setDishSelections(function (prev) {
            var sel = Object.assign({}, prev[msgIdx] || {});
            sel[dishIdx] = !sel[dishIdx];
            return Object.assign({}, prev, { [msgIdx]: sel });
        });
    }

    // ── Actie goedkeuren ──────────────────────────────────────────────────────
    async function approveAction(msgIdx, actionId) {
        var msg = messages[msgIdx];
        var action = msg && msg.actions && msg.actions.find(function (a) { return a.id === actionId; });
        if (!action) return;

        setActionStatus(msgIdx, actionId, 'executing');

        try {
            // ── Prep-lijst genereren (server-side tool) ───────────────────
            if (action.type === 'generate_prep_list') {
                var res = await fetch('/api/ai-execute', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ tool: 'generatePrepList', params: action.data }),
                });
                var json = await res.json();
                if (!res.ok || json.error) throw new Error(json.error || 'Tool mislukt');

                setActionStatus(msgIdx, actionId, 'done');
                setMessages(function (prev) {
                    return [...prev, {
                        role: 'assistant',
                        content: '',
                        actions: [],
                        prepList: json.result,
                    }];
                });
                return;
            }

            // ── Bulk gerechten toevoegen ───────────────────────────────────
            if (action.type === 'bulk_create_gerechten') {
                var sel = dishSelections[msgIdx] || {};
                var gerechtenToAdd = (action.data.gerechten || []).filter(function (_, i) { return sel[i] !== false; });

                if (gerechtenToAdd.length === 0) {
                    setActionStatus(msgIdx, actionId, 'rejected');
                    setMessages(function (prev) {
                        return [...prev, { role: 'assistant', content: 'Geen gerechten geselecteerd.', actions: [] }];
                    });
                    return;
                }

                var bulkRes = await fetch('/api/ai-execute', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ tool: 'bulkCreateGerechten', params: { gerechten: gerechtenToAdd } }),
                });
                var bulkJson = await bulkRes.json();
                if (!bulkRes.ok || bulkJson.error) throw new Error(bulkJson.error || 'Insert mislukt');

                setActionStatus(msgIdx, actionId, 'done');
                setMessages(function (prev) {
                    return [...prev, {
                        role: 'assistant',
                        content: '✅ **' + bulkJson.result.inserted + ' gerechten** zijn toegevoegd aan de **Menu Ontwikkelaar**!\n\nJe kunt ze daar nu bekijken, activeren en finetunen. ' + (bulkJson.result.errors.length > 0 ? bulkJson.result.errors.length + ' mislukt.' : ''),
                        actions: [],
                        successBadge: 'Ga naar Menu Ontwikkelaar →',
                        successLink: '/gerechten',
                    }];
                });
                return;
            }

            // ── Filter/verwijder gerechten ────────────────────────────────
            if (action.type === 'filter_gerechten') {
                var filtRes = await fetch('/api/ai-execute', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ tool: 'filterGerechten', params: action.data }),
                });
                var filtJson = await filtRes.json();
                if (!filtRes.ok || filtJson.error) throw new Error(filtJson.error || 'Filter mislukt');

                setActionStatus(msgIdx, actionId, 'done');
                setMessages(function (prev) {
                    return [...prev, {
                        role: 'assistant',
                        content: '✅ **' + filtJson.result.processed + ' gerechten** zijn ' + filtJson.result.action + '.',
                        actions: [],
                    }];
                });
                return;
            }

            // ── Mark weak dishes (client-only, past selectie aan) ─────────
            if (action.type === 'mark_weak_dishes') {
                setActionStatus(msgIdx, actionId, 'done');
                // Zoek het bericht met de bulk dishes en pas de selectie aan
                var weakIndices = action.data.weak_indices || [];
                // Vind het meest recente bulk_create_gerechten bericht
                var bulkMsgIdx = -1;
                for (var i = msgIdx - 1; i >= 0; i--) {
                    var m = messages[i];
                    if (m.actions && m.actions.some(function (a) { return a.type === 'bulk_create_gerechten'; })) {
                        bulkMsgIdx = i;
                        break;
                    }
                }
                if (bulkMsgIdx >= 0) {
                    setDishSelections(function (prev) {
                        var sel = Object.assign({}, prev[bulkMsgIdx] || {});
                        weakIndices.forEach(function (idx) { sel[idx] = false; });
                        return Object.assign({}, prev, { [bulkMsgIdx]: sel });
                    });
                    var reasons = action.data.reasons || [];
                    setMessages(function (prev) {
                        return [...prev, {
                            role: 'assistant',
                            content: '🔍 Ik heb ' + weakIndices.length + ' gerechten rood gemarkeerd:\n\n' +
                                weakIndices.map(function (idx, i) {
                                    return '- Gerecht ' + (idx + 1) + (reasons[i] ? ': ' + reasons[i] : '');
                                }).join('\n') +
                                '\n\nDeze zijn nu uitgevinkt. Klik **Toevoegen** om de rest toe te voegen, of vinkt ze handmatig opnieuw aan.',
                            actions: [],
                        }];
                    });
                }
                return;
            }

            // ── Standaard acties via Supabase ─────────────────────────────
            var result = await executeAction(action, supabase);
            setActionStatus(msgIdx, actionId, 'done');
            setMessages(function (prev) {
                return [...prev, {
                    role: 'assistant',
                    content: '✅ **' + action.meta.label + '** uitgevoerd!' + (result && result.id ? ' (ID: ' + result.id + ')' : ''),
                    actions: [],
                }];
            });

        } catch (err) {
            setActionStatus(msgIdx, actionId, 'error', err.message);
            setMessages(function (prev) {
                return [...prev, { role: 'assistant', content: '❌ Mislukt: ' + err.message, actions: [] }];
            });
        }
    }

    function setActionStatus(msgIdx, actionId, status, error) {
        setMessages(function (prev) {
            return prev.map(function (m, i) {
                if (i !== msgIdx) return m;
                return Object.assign({}, m, {
                    actions: (m.actions || []).map(function (a) {
                        return a.id === actionId ? Object.assign({}, a, { status: status, error: error }) : a;
                    }),
                });
            });
        });
    }

    function rejectAction(msgIdx, actionId) {
        setActionStatus(msgIdx, actionId, 'rejected');
        setMessages(function (prev) {
            return [...prev, { role: 'assistant', content: 'Actie geannuleerd.', actions: [] }];
        });
    }

    function handleKey(e) {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    }

    // ── Render tekst met basis markdown ───────────────────────────────────────
    function renderText(content) {
        if (!content) return null;
        return content.split('\n').map(function (line, i) {
            var parts = line.split(/(\*\*[^*]+\*\*)/g);
            var rendered = parts.map(function (part, j) {
                if (part.startsWith('**') && part.endsWith('**')) {
                    return <strong key={j}>{part.slice(2, -2)}</strong>;
                }
                return part;
            });
            return <span key={i} style={{ display: 'block' }}>{rendered.length ? rendered : '\u00A0'}</span>;
        });
    }

    // ── Render prep-lijst ─────────────────────────────────────────────────────
    function renderPrepList(prepList) {
        if (!prepList) return null;
        var ev = prepList.event || {};
        return (
            <div style={{ fontSize: 12, border: '1px solid rgba(34,197,94,.3)', borderRadius: 10, overflow: 'hidden', marginTop: 4 }}>
                {/* Header */}
                <div style={{ background: 'rgba(34,197,94,.12)', padding: '8px 12px', borderBottom: '1px solid rgba(34,197,94,.2)' }}>
                    <div style={{ fontWeight: 800, color: '#22c55e', fontSize: 13 }}>
                        <i className="fa-solid fa-list-check" style={{ marginRight: 6 }}></i>
                        Prep-lijst — {ev.naam || '?'}
                    </div>
                    <div style={{ color: 'var(--muted)', fontSize: 11 }}>
                        {ev.datum} · {ev.gasten} gasten · {ev.locatie || ''}
                    </div>
                </div>

                {/* Tijdlijn */}
                {(prepList.prep_timeline || []).map(function (dag, i) {
                    return (
                        <div key={i} style={{ padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,.04)' }}>
                            <div style={{ fontWeight: 700, color: 'var(--brand)', marginBottom: 4, fontSize: 11 }}>
                                📅 {dag.dag}
                            </div>
                            {dag.taken.map(function (taak, j) {
                                return (
                                    <div key={j} style={{ display: 'flex', gap: 6, alignItems: 'flex-start', marginBottom: 2, color: 'var(--text)' }}>
                                        <span style={{ color: 'var(--muted)', marginTop: 1 }}>▸</span>
                                        <span>{taak}</span>
                                    </div>
                                );
                            })}
                        </div>
                    );
                })}

                {/* MEP lijst */}
                {prepList.mep_lijst && prepList.mep_lijst.length > 0 && (
                    <div style={{ padding: '8px 12px' }}>
                        <div style={{ fontWeight: 700, color: 'var(--cyan)', marginBottom: 6, fontSize: 11 }}>
                            🔪 MEP (Mise-en-place) — {prepList.mep_lijst.length} ingrediënten
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3 }}>
                            {prepList.mep_lijst.slice(0, 16).map(function (ing, i) {
                                return (
                                    <div key={i} style={{ fontSize: 11, color: 'var(--muted)' }}>
                                        <strong style={{ color: 'var(--text)' }}>{ing.naam}</strong>
                                        {' '}{ing.hoeveelheid > 0 ? Math.round(ing.hoeveelheid * 10) / 10 + ' ' + ing.eenheid : ''}
                                    </div>
                                );
                            })}
                        </div>
                        {prepList.mep_lijst.length > 16 && (
                            <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4 }}>+ {prepList.mep_lijst.length - 16} meer...</div>
                        )}
                    </div>
                )}

                {/* Print knop */}
                <div style={{ padding: '6px 12px', borderTop: '1px solid rgba(255,255,255,.04)', display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                        onClick={function () { window.print(); }}
                        style={{ background: 'rgba(34,197,94,.15)', border: '1px solid rgba(34,197,94,.3)', color: '#22c55e', padding: '4px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer', fontWeight: 600 }}
                    >
                        <i className="fa-solid fa-print" style={{ marginRight: 4 }}></i>Printen
                    </button>
                </div>
            </div>
        );
    }

    // ── Render bulk dish cards ────────────────────────────────────────────────
    function renderDishCards(action, msgIdx) {
        var gerechten = action.data.gerechten || [];
        var sel = dishSelections[msgIdx] || {};
        var selectedCount = Object.values(sel).filter(Boolean).length;
        var isDone = action.status === 'done';
        var isExecuting = action.status === 'executing';
        var isRejected = action.status === 'rejected';

        return (
            <div style={{ marginTop: 8, border: '1px solid rgba(167,139,250,.3)', borderRadius: 10, overflow: 'hidden', fontSize: 12 }}>
                {/* Header */}
                <div style={{ background: 'rgba(167,139,250,.1)', padding: '8px 12px', borderBottom: '1px solid rgba(167,139,250,.2)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <i className="fa-solid fa-utensils" style={{ color: '#a78bfa' }}></i>
                    <span style={{ fontWeight: 800, color: '#a78bfa' }}>{gerechten.length} gerechten voor Menu Ontwikkelaar</span>
                    {!isDone && !isRejected && (
                        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--muted)' }}>
                            {selectedCount}/{gerechten.length} geselecteerd
                        </span>
                    )}
                    {isDone && <span style={{ marginLeft: 'auto', color: '#22c55e', fontSize: 11, fontWeight: 700 }}>✓ Toegevoegd</span>}
                    {isRejected && <span style={{ marginLeft: 'auto', color: '#71717a', fontSize: 11 }}>Geannuleerd</span>}
                </div>

                {/* Dish grid */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, background: 'rgba(255,255,255,.03)', maxHeight: 280, overflowY: 'auto' }}>
                    {gerechten.map(function (g, i) {
                        var isSelected = sel[i] !== false;
                        var isWeak = sel[i] === false && action.status !== 'done';
                        return (
                            <div
                                key={i}
                                onClick={function () { if (!isDone && !isExecuting) toggleDish(msgIdx, i); }}
                                style={{
                                    padding: '7px 9px',
                                    background: isWeak ? 'rgba(239,68,68,.08)' : isSelected ? 'rgba(167,139,250,.07)' : 'rgba(255,255,255,.02)',
                                    borderBottom: '1px solid rgba(255,255,255,.03)',
                                    cursor: isDone ? 'default' : 'pointer',
                                    opacity: isDone ? 0.7 : 1,
                                    transition: 'background .15s',
                                    display: 'flex',
                                    gap: 6,
                                    alignItems: 'flex-start',
                                }}
                            >
                                {/* Checkbox */}
                                {!isDone && (
                                    <div style={{
                                        width: 14, height: 14, borderRadius: 3, border: '1.5px solid',
                                        borderColor: isWeak ? '#ef4444' : isSelected ? '#a78bfa' : 'var(--muted)',
                                        background: isSelected && !isWeak ? '#a78bfa' : 'transparent',
                                        flexShrink: 0, marginTop: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    }}>
                                        {isSelected && !isWeak && <i className="fa-solid fa-check" style={{ fontSize: 8, color: '#fff' }}></i>}
                                        {isWeak && <i className="fa-solid fa-xmark" style={{ fontSize: 8, color: '#ef4444' }}></i>}
                                    </div>
                                )}
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontWeight: 700, fontSize: 11, color: isWeak ? '#ef4444' : 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {g.naam}
                                    </div>
                                    <div style={{ fontSize: 10, color: 'var(--muted)' }}>
                                        {g.gang_slug || '?'}
                                        {g.beschrijving && <span> · {g.beschrijving.slice(0, 40)}{g.beschrijving.length > 40 ? '…' : ''}</span>}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Acties */}
                {!isDone && !isRejected && (
                    <div style={{ padding: '8px 12px', borderTop: '1px solid rgba(255,255,255,.04)', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <button
                            onClick={function () { approveAction(msgIdx, action.id); }}
                            disabled={isExecuting || selectedCount === 0}
                            style={{ flex: 1, padding: '6px 0', borderRadius: 7, border: 'none', background: selectedCount > 0 ? '#a78bfa' : 'rgba(255,255,255,.1)', color: selectedCount > 0 ? '#000' : 'var(--muted)', fontWeight: 700, fontSize: 11, cursor: selectedCount > 0 ? 'pointer' : 'not-allowed', minWidth: 120 }}
                        >
                            {isExecuting ? <><i className="fa-solid fa-spinner fa-spin" style={{ marginRight: 4 }}></i>Bezig…</> : <><i className="fa-solid fa-check" style={{ marginRight: 4 }}></i>Toevoegen ({selectedCount})</>}
                        </button>
                        <button
                            onClick={function () {
                                sendMessage(null, 'Welke ' + Math.round(gerechten.length * 0.25) + ' gerechten zijn culinair het minst interessant? Analyseer ze en markeer de zwakste.');
                            }}
                            disabled={isExecuting}
                            style={{ padding: '6px 10px', borderRadius: 7, border: '1px solid rgba(245,158,11,.3)', background: 'rgba(245,158,11,.08)', color: '#f59e0b', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
                            title="Laat de AI de zwakste gerechten markeren"
                        >
                            <i className="fa-solid fa-star-half-stroke" style={{ marginRight: 4 }}></i>AI Filter
                        </button>
                        <button
                            onClick={function () { rejectAction(msgIdx, action.id); }}
                            disabled={isExecuting}
                            style={{ padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'transparent', color: 'var(--muted)', fontSize: 11, cursor: 'pointer' }}
                        >
                            <i className="fa-solid fa-xmark"></i>
                        </button>
                    </div>
                )}
                {isExecuting && (
                    <div style={{ padding: '6px 12px', textAlign: 'center', color: '#a78bfa', fontSize: 11 }}>
                        <i className="fa-solid fa-spinner fa-spin" style={{ marginRight: 4 }}></i>Gerechten worden toegevoegd…
                    </div>
                )}
            </div>
        );
    }

    // ── Render standaard actiekaart ───────────────────────────────────────────
    function renderActionCard(action, msgIdx) {
        // Speciale renderers
        if (action.type === 'bulk_create_gerechten') {
            return <div key={action.id}>{renderDishCards(action, msgIdx)}</div>;
        }

        var isPending = action.status === 'pending';
        var isExecuting = action.status === 'executing';
        var isDone = action.status === 'done';
        var isRejected = action.status === 'rejected';
        var isError = action.status === 'error';

        return (
            <div key={action.id} style={{
                margin: '8px 0 0 0', padding: '10px 12px', borderRadius: 10, border: '1px solid', fontSize: 12,
                borderColor: isDone ? 'rgba(34,197,94,.4)' : isError ? 'rgba(239,68,68,.4)' : isRejected ? 'rgba(113,113,122,.3)' : 'rgba(255,191,0,.35)',
                background: isDone ? 'rgba(34,197,94,.08)' : isError ? 'rgba(239,68,68,.08)' : isRejected ? 'rgba(113,113,122,.06)' : 'rgba(255,191,0,.08)',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <i className={'fa-solid ' + (action.meta.icon || 'fa-bolt')} style={{ color: isDone ? '#22c55e' : isRejected ? '#71717a' : (action.meta.color || '#FFBF00'), fontSize: 13 }}></i>
                    <span style={{ fontWeight: 700, color: 'var(--text)' }}>{action.meta.label}</span>
                    {isDone && <span style={{ marginLeft: 'auto', color: '#22c55e', fontSize: 11 }}>✓ Klaar</span>}
                    {isRejected && <span style={{ marginLeft: 'auto', color: '#71717a', fontSize: 11 }}>Geannuleerd</span>}
                    {isError && <span style={{ marginLeft: 'auto', color: '#ef4444', fontSize: 11 }}>Fout</span>}
                </div>
                <div style={{ color: 'var(--muted)', marginBottom: isPending ? 8 : 0, lineHeight: 1.4 }}>{action.description}</div>
                {action.data && Object.keys(action.data).length > 0 && action.type !== 'mark_weak_dishes' && (
                    <div style={{ fontFamily: 'monospace', fontSize: 10, color: 'var(--muted)', background: 'rgba(0,0,0,.3)', padding: '3px 6px', borderRadius: 5, marginBottom: isPending ? 8 : 0, wordBreak: 'break-all' }}>
                        {JSON.stringify(action.data).slice(0, 150)}{JSON.stringify(action.data).length > 150 ? '…' : ''}
                    </div>
                )}
                {isPending && (
                    <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={function () { approveAction(msgIdx, action.id); }} style={{ flex: 1, padding: '5px 0', borderRadius: 7, border: 'none', background: '#22c55e', color: '#000', fontWeight: 700, fontSize: 11, cursor: 'pointer' }}>
                            <i className="fa-solid fa-check" style={{ marginRight: 4 }}></i>Uitvoeren
                        </button>
                        <button onClick={function () { rejectAction(msgIdx, action.id); }} style={{ flex: 1, padding: '5px 0', borderRadius: 7, border: '1px solid var(--border)', background: 'transparent', color: 'var(--muted)', fontSize: 11, cursor: 'pointer' }}>
                            <i className="fa-solid fa-xmark" style={{ marginRight: 4 }}></i>Annuleren
                        </button>
                    </div>
                )}
                {isExecuting && <div style={{ color: '#FFBF00', fontSize: 11 }}><i className="fa-solid fa-spinner fa-spin" style={{ marginRight: 4 }}></i>Bezig…</div>}
                {isError && action.error && <div style={{ color: '#ef4444', fontSize: 11, marginTop: 4 }}>{action.error}</div>}
            </div>
        );
    }

    return (
        <div className="ai-assistant-container">
            <button
                className={'ai-toggle-btn' + (isOpen ? ' active' : '')}
                onClick={function () { setIsOpen(function (v) { return !v; }); }}
                title="BBQ System Operator"
                id="ai-toggle-btn"
            >
                <i className={'fa-solid ' + (isOpen ? 'fa-xmark' : 'fa-robot')}></i>
                {!isOpen && <span className="ai-pulse-ring"></span>}
            </button>

            {isOpen && (
                <div className="ai-chat-window panel" id="ai-chat-window" style={{ width: 380, height: 560 }}>
                    {/* Header */}
                    <div className="ai-chat-header">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div className="ai-avatar-header"><i className="fa-solid fa-robot"></i></div>
                            <div>
                                <div style={{ fontWeight: 800, fontSize: 14, color: '#000' }}>System Operator</div>
                                <div style={{ fontSize: 10, color: 'rgba(0,0,0,.65)', display: 'flex', alignItems: 'center', gap: 4 }}>
                                    📍 {pageName}
                                    {contextLoading && <span style={{ fontSize: 9, background: 'rgba(0,0,0,.15)', borderRadius: 4, padding: '1px 4px' }}>laden…</span>}
                                    {contextLoaded && contextData && <span style={{ fontSize: 9, background: 'rgba(0,0,0,.25)', borderRadius: 4, padding: '1px 4px' }}>✓ context</span>}
                                </div>
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: 6 }}>
                            <button onClick={function () { setContextLoaded(false); setContextData(null); loadContext(); }} className="ai-clear-btn" title="Data herladen">
                                <i className="fa-solid fa-database" style={{ fontSize: 11 }}></i>
                            </button>
                            <button onClick={function () { setMessages([{ role: 'assistant', content: 'Gesprek gewist. Wat wil je doen?', actions: [] }]); setDishSelections({}); }} className="ai-clear-btn" title="Gesprek wissen">
                                <i className="fa-solid fa-rotate-left"></i>
                            </button>
                        </div>
                    </div>

                    {/* Berichten */}
                    <div className="ai-chat-messages" id="ai-chat-messages">
                        {messages.map(function (msg, idx) {
                            var isUser = msg.role === 'user';
                            return (
                                <div key={idx}>
                                    <div className={'ai-message-wrapper ' + (isUser ? 'user' : 'assistant')}>
                                        {!isUser && <div className="ai-avatar"><i className="fa-solid fa-robot"></i></div>}
                                        <div className={'ai-message bubble ' + (isUser ? 'user-bubble' : 'assistant-bubble')}>
                                            {msg.contextBadge && (
                                                <div style={{ fontSize: 10, color: '#22c55e', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                                                    <i className="fa-solid fa-database"></i> Live data geladen
                                                </div>
                                            )}
                                            {msg.content && renderText(msg.content)}
                                            {/* Prep list ingebed in bericht */}
                                            {msg.prepList && renderPrepList(msg.prepList)}
                                            {/* Succes badge met link */}
                                            {msg.successBadge && msg.successLink && (
                                                <a href={msg.successLink} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 8, background: 'rgba(167,139,250,.15)', border: '1px solid rgba(167,139,250,.3)', color: '#a78bfa', padding: '4px 10px', borderRadius: 7, fontSize: 11, fontWeight: 700, textDecoration: 'none' }}>
                                                    <i className="fa-solid fa-arrow-right"></i>{msg.successBadge}
                                                </a>
                                            )}
                                        </div>
                                    </div>
                                    {/* Actiekaarten */}
                                    {!isUser && msg.actions && msg.actions.length > 0 && (
                                        <div style={{ paddingLeft: 36 }}>
                                            {msg.actions.map(function (action) { return renderActionCard(action, idx); })}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                        {isLoading && (
                            <div className="ai-message-wrapper assistant">
                                <div className="ai-avatar"><i className="fa-solid fa-robot"></i></div>
                                <div className="ai-message bubble assistant-bubble loading-dots">
                                    <span></span><span></span><span></span>
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Snelkoppelingen */}
                    {messages.length <= 2 && !isLoading && (
                        <div style={{ padding: '6px 12px', borderTop: '1px solid var(--border)', display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                            {quickChips.map(function (s) {
                                return (
                                    <button key={s} onClick={function () { sendMessage(null, s); }} style={{ background: 'rgba(255,191,0,.08)', border: '1px solid rgba(255,191,0,.2)', color: 'var(--brand)', padding: '3px 8px', borderRadius: 20, fontSize: 10, cursor: 'pointer', fontWeight: 600 }}>
                                        {s}
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    {/* Input */}
                    <div className="ai-chat-input">
                        <form onSubmit={sendMessage} style={{ display: 'flex', gap: 8 }}>
                            <textarea
                                ref={inputRef}
                                value={input}
                                onChange={function (e) { setInput(e.target.value); }}
                                onKeyDown={handleKey}
                                placeholder="Opdracht of vraag… (Enter = versturen)"
                                disabled={isLoading}
                                autoComplete="off"
                                rows={1}
                                className="ai-textarea"
                            />
                            <button type="submit" disabled={!input.trim() || isLoading} className="send-btn" id="ai-send-btn">
                                <i className="fa-solid fa-paper-plane"></i>
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
