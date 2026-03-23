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
        '/agenda':      ['Maak een prep-lijst', 'Open taken afvinken', 'Taak toevoegen voor event', 'Planning komende week'],
        '/recepten':    ['Nieuw recept aanmaken', 'Bereken vlees voor 80 gasten', 'Dry rub recept voor brisket', 'Pulled pork bereidingstijd'],
        '/gerechten':   ['20 gerechten met buikspek', 'Gerecht verwijderen', 'Vegetarische hapjes bedenken', 'Menubalans analyseren'],
        '/menu-engineering': ['Welke gerechten hebben beste marge?', 'Menu-analyse uitleggen', 'Stars vs Dogs in mijn menu', 'Gerecht verbeteren voor marge'],
        '/offertes':    ['Nieuwe offerte aanmaken', 'Welke offertes verlopen binnenkort?', 'Marge analyse', 'Omzet overzicht per status'],
        '/facturen':    ['Nieuwe factuur aanmaken', 'Welke facturen vervallen binnenkort?', 'Openstaand overzicht', 'Cashflow advies'],
        '/voorraad':    ['Wat staat op laag voorraad?', 'Bijbestellen wat ik nodig heb', 'Nieuw voorraad item toevoegen', 'Par levels uitleggen'],
        '/inkoop':      ['Inkooplijst aanmaken voor event', 'Leverancier toevoegen', 'Vleesinkoop calculeren voor 80p', 'Beste leverancier kiezen'],
        '/service':     ['Open prep-taken voor dit event', 'Temperatuur registreren', 'Hoe lang warm houden?', 'Snel probleem oplossen'],
        '/haccp':       ['Temperatuur registreren', 'Welke events missen HACCP?', 'Kerntemperaturen uitleggen', 'Gevaarlijke zone uitleg'],
        '/uren':        ['Uren registreren voor vandaag', 'Weekoverzicht medewerkers', 'Overuren berekenen', 'Wettelijke limieten NL'],
        '/materieel':   ['Welk materieel heeft onderhoud nodig?', 'Onderhoud registreren', 'Materieel toevoegen', 'Levensduur BBQ uitleggen'],
        '/logistiek':   ['Wat is nog niet afgevinkt?', 'Bus inlaadvolgorde tips', 'Koelboxen checklist', 'Vergeten items check'],
        '/boekhouding': ['KPI overzicht', 'Verlopen facturen actie', 'BTW-aangifte tips', 'Food cost ratio berekenen'],
        '/financien':   ['Beste maand analyse', 'Marge per maand vergelijken', 'Stille maanden aanpak', 'YoY groei berekenen'],
        '/price-intelligence': ['Leverancier vergelijken', 'Beste prijs-kwaliteit vlees', 'Inkoopprijs optimaliseren', 'Seizoensprijzen advies'],
        '/ai-chat':     ['20 gerechten met buikspek', 'Thema-BBQ concepten', 'Zomermenu brainstorm', 'Onderscheidend vermogen tips'],
    };
    var quickChips = PAGE_CHIPS[pathname] || ['Maak een prep-lijst', '20 gerechten met buikspek', 'Omzet overzicht', 'Lage voorraad check'];

    // ── Bericht versturen (streaming) ─────────────────────────────────────────
    async function sendMessage(e, overrideText) {
        if (e) e.preventDefault();
        var text = (overrideText || input).trim();
        if (!text || isLoading) return;
        setInput('');

        var userMsg = { role: 'user', content: text };
        var apiMessages = [...messages.map(function (m) { return { role: m.role, content: m.content }; }), { role: 'user', content: text }];

        // Voeg user msg + streaming placeholder in één keer toe
        var newMsgIdx = messages.length + 1; // AI-bericht index
        setMessages(function (prev) {
            return [...prev, userMsg, { role: 'assistant', content: '', actions: [], streaming: true }];
        });
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
            if (!res.ok) {
                var errJson = await res.json().catch(function () { return {}; });
                throw new Error(errJson.error || 'Fout opgetreden');
            }

            var reader = res.body.getReader();
            var decoder = new TextDecoder();
            var lineBuffer = '';

            while (true) {
                var chunk = await reader.read();
                if (chunk.done) break;
                lineBuffer += decoder.decode(chunk.value, { stream: true });
                var lines = lineBuffer.split('\n\n');
                lineBuffer = lines.pop();

                for (var line of lines) {
                    if (!line.startsWith('data: ')) continue;
                    try {
                        var chunkData = JSON.parse(line.slice(6));

                        if (chunkData.delta) {
                            // Voeg delta toe aan streaming bericht
                            setMessages(function (prev) {
                                return prev.map(function (m) {
                                    return m.streaming ? Object.assign({}, m, { content: m.content + chunkData.delta }) : m;
                                });
                            });
                        }

                        if (chunkData.done) {
                            // Stream klaar — parse actions en finaliseer bericht
                            var parsed = parseActions(chunkData.full);

                            // Initialiseer dish-selectie voor bulk gerechten
                            parsed.actions.forEach(function (action) {
                                if (action.type === 'bulk_create_gerechten' && action.data.gerechten) {
                                    var sel = {};
                                    action.data.gerechten.forEach(function (_, i) { sel[i] = true; });
                                    setDishSelections(function (prev) {
                                        return Object.assign({}, prev, { [newMsgIdx]: sel });
                                    });
                                }
                            });

                            setMessages(function (prev) {
                                return prev.map(function (m) {
                                    return m.streaming
                                        ? { role: 'assistant', content: parsed.cleanText, actions: parsed.actions }
                                        : m;
                                });
                            });
                        }
                    } catch (e) { /* ongeldige SSE-chunk — negeer */ }
                }
            }
        } catch (error) {
            setMessages(function (prev) {
                return prev.map(function (m) {
                    return m.streaming ? { role: 'assistant', content: '❌ ' + error.message, actions: [] } : m;
                });
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

    // ── Undo voor INSERT: verwijder het aangemaakte record ────────────────────
    async function undoInsertAction(table, id) {
        if (!supabase || !id) return;
        try {
            await supabase.from(table).delete().eq('id', id);
            setMessages(function (prev) {
                return [...prev, { role: 'assistant', content: '↩️ Ongedaan gemaakt — record verwijderd.', actions: [] }];
            });
        } catch (err) {
            setMessages(function (prev) {
                return [...prev, { role: 'assistant', content: '❌ Ongedaan maken mislukt: ' + err.message, actions: [] }];
            });
        }
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

            // ── Inkooplijst genereren ─────────────────────────────────────
            if (action.type === 'generate_inkooplijst') {
                var inkRes = await fetch('/api/ai-execute', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ tool: 'generateInkooplijst', params: action.data }),
                });
                var inkJson = await inkRes.json();
                if (!inkRes.ok || inkJson.error) throw new Error(inkJson.error || 'Tool mislukt');
                setActionStatus(msgIdx, actionId, 'done');
                setMessages(function (prev) {
                    return [...prev, { role: 'assistant', content: '', actions: [], inkooplijst: inkJson.result }];
                });
                return;
            }

            // ── Event briefing genereren ──────────────────────────────────
            if (action.type === 'generate_event_briefing') {
                var brfRes = await fetch('/api/ai-execute', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ tool: 'generateEventBriefing', params: action.data }),
                });
                var brfJson = await brfRes.json();
                if (!brfRes.ok || brfJson.error) throw new Error(brfJson.error || 'Tool mislukt');
                setActionStatus(msgIdx, actionId, 'done');
                setMessages(function (prev) {
                    return [...prev, { role: 'assistant', content: '', actions: [], eventBriefing: brfJson.result }];
                });
                return;
            }

            // ── Winstgevendheid per event ─────────────────────────────────
            if (action.type === 'get_event_winstgevendheid') {
                var winstRes = await fetch('/api/ai-execute', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ tool: 'getEventWinstgevendheid', params: action.data }),
                });
                var winstJson = await winstRes.json();
                if (!winstRes.ok || winstJson.error) throw new Error(winstJson.error || 'Tool mislukt');
                setActionStatus(msgIdx, actionId, 'done');
                setMessages(function (prev) {
                    return [...prev, { role: 'assistant', content: '', actions: [], winstgevendheid: winstJson.result }];
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
            var isInsert = action.meta && action.meta.op === 'insert';
            var resultId = result && result.id;
            var undoTable = action.meta && action.meta.table;
            setMessages(function (prev) {
                return [...prev, {
                    role: 'assistant',
                    content: '✅ **' + action.meta.label + '** uitgevoerd!' + (resultId ? ' (ID: ' + resultId + ')' : ''),
                    actions: [],
                    undoInsert: isInsert && resultId ? { table: undoTable, id: resultId } : null,
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
    function renderText(content, isStreaming) {
        if (!content && !isStreaming) return null;
        var lines = (content || '').split('\n');
        return lines.map(function (line, i) {
            var isLast = i === lines.length - 1;
            var parts = line.split(/(\*\*[^*]+\*\*)/g);
            var rendered = parts.map(function (part, j) {
                if (part.startsWith('**') && part.endsWith('**')) {
                    return <strong key={j}>{part.slice(2, -2)}</strong>;
                }
                return part;
            });
            return (
                <span key={i} style={{ display: 'block' }}>
                    {rendered.length ? rendered : '\u00A0'}
                    {isStreaming && isLast && (
                        <span style={{ display: 'inline-block', width: 2, height: '0.9em', background: 'var(--brand)', marginLeft: 1, verticalAlign: 'text-bottom', animation: 'blink 0.8s step-end infinite' }}></span>
                    )}
                </span>
            );
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

    // ── Render inkooplijst ────────────────────────────────────────────────────
    function renderInkooplijst(data) {
        if (!data) return null;
        var ev = data.event || {};
        var items = data.items || [];
        var teBestellen = items.filter(function (i) { return i.te_bestellen > 0; });
        var alInVoorraad = items.filter(function (i) { return i.te_bestellen === 0; });
        return (
            <div style={{ fontSize: 12, border: '1px solid rgba(78,205,196,.3)', borderRadius: 10, overflow: 'hidden', marginTop: 4 }}>
                <div style={{ background: 'rgba(78,205,196,.12)', padding: '8px 12px', borderBottom: '1px solid rgba(78,205,196,.2)' }}>
                    <div style={{ fontWeight: 800, color: '#4ECDC4', fontSize: 13 }}>
                        <i className="fa-solid fa-basket-shopping" style={{ marginRight: 6 }}></i>
                        Inkooplijst — {ev.naam || '?'}
                    </div>
                    <div style={{ color: 'var(--muted)', fontSize: 11 }}>
                        {ev.datum} · {ev.gasten} gasten · {teBestellen.length} te bestellen · {alInVoorraad.length} al in voorraad
                        {data.geschatte_inkoop_kosten > 0 && <span style={{ marginLeft: 8, color: '#4ECDC4', fontWeight: 700 }}>≈ €{data.geschatte_inkoop_kosten.toFixed(2)}</span>}
                    </div>
                </div>
                {teBestellen.length > 0 && (
                    <div style={{ padding: '6px 12px' }}>
                        <div style={{ fontWeight: 700, color: '#ef4444', fontSize: 10, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1 }}>Te bestellen ({teBestellen.length})</div>
                        {teBestellen.map(function (item, i) {
                            return (
                                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: '1px solid rgba(255,255,255,.04)', color: 'var(--text)' }}>
                                    <span style={{ fontWeight: 600 }}>{item.naam}</span>
                                    <span style={{ color: '#ef4444', fontWeight: 700 }}>{item.te_bestellen} {item.eenheid}</span>
                                </div>
                            );
                        })}
                    </div>
                )}
                {alInVoorraad.length > 0 && (
                    <div style={{ padding: '6px 12px' }}>
                        <div style={{ fontWeight: 700, color: '#22c55e', fontSize: 10, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1 }}>Al in voorraad ({alInVoorraad.length})</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {alInVoorraad.map(function (item, i) {
                                return <span key={i} style={{ background: 'rgba(34,197,94,.1)', color: '#22c55e', padding: '2px 6px', borderRadius: 4, fontSize: 10 }}>{item.naam}</span>;
                            })}
                        </div>
                    </div>
                )}
                {items.length === 0 && (
                    <div style={{ padding: '12px', color: 'var(--muted)', textAlign: 'center', fontSize: 11 }}>Geen recepten gekoppeld aan dit event.</div>
                )}
            </div>
        );
    }

    // ── Render event briefing ─────────────────────────────────────────────────
    function renderEventBriefing(data) {
        if (!data) return null;
        var ev = data.event || {};
        return (
            <div style={{ fontSize: 12, border: '1px solid rgba(245,158,11,.3)', borderRadius: 10, overflow: 'hidden', marginTop: 4 }}>
                <div style={{ background: 'rgba(245,158,11,.12)', padding: '8px 12px', borderBottom: '1px solid rgba(245,158,11,.2)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <i className="fa-solid fa-file-invoice" style={{ color: '#f59e0b' }}></i>
                    <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 800, color: '#f59e0b', fontSize: 13 }}>Teambriefing — {ev.naam || '?'}</div>
                        <div style={{ color: 'var(--muted)', fontSize: 11 }}>{ev.datum} · {ev.gasten} gasten · {ev.locatie || ''}</div>
                    </div>
                    <span style={{ fontSize: 10, color: '#f59e0b', background: 'rgba(245,158,11,.15)', padding: '2px 7px', borderRadius: 5 }}>{data.briefing_datum}</span>
                </div>
                {/* Contactinfo */}
                {(ev.contactpersoon || ev.telefoon) && (
                    <div style={{ padding: '6px 12px', borderBottom: '1px solid rgba(255,255,255,.04)' }}>
                        <span style={{ color: 'var(--muted)', fontSize: 10 }}>CONTACT </span>
                        <span style={{ color: 'var(--text)' }}>{ev.contactpersoon || ''}{ev.telefoon ? ' · ' + ev.telefoon : ''}</span>
                    </div>
                )}
                {/* Menu */}
                {data.menu && data.menu.length > 0 && (
                    <div style={{ padding: '6px 12px', borderBottom: '1px solid rgba(255,255,255,.04)' }}>
                        <div style={{ fontWeight: 700, color: '#f59e0b', fontSize: 10, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1 }}>Menu ({data.menu.length} recepten)</div>
                        {data.menu.map(function (r, i) {
                            return <div key={i} style={{ color: 'var(--text)', padding: '1px 0' }}>▸ {r.naam} <span style={{ color: 'var(--muted)', fontSize: 10 }}>({r.categorie})</span></div>;
                        })}
                    </div>
                )}
                {/* Prep-taken */}
                <div style={{ padding: '6px 12px', borderBottom: '1px solid rgba(255,255,255,.04)' }}>
                    <div style={{ fontWeight: 700, color: '#f59e0b', fontSize: 10, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1 }}>
                        Prep-taken: {data.prep_taken_klaar}/{data.prep_taken_klaar + data.prep_taken_open} klaar
                    </div>
                    {(data.prep_tasks || []).filter(function (t) { return !t.done; }).slice(0, 5).map(function (t, i) {
                        return <div key={i} style={{ color: '#ef4444', fontSize: 11 }}>☐ {t.text}</div>;
                    })}
                    {data.prep_taken_open === 0 && <div style={{ color: '#22c55e', fontSize: 11 }}>✓ Alle taken klaar!</div>}
                </div>
                {/* Status badges */}
                <div style={{ padding: '6px 12px', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ background: data.offerte ? 'rgba(34,197,94,.1)' : 'rgba(239,68,68,.1)', color: data.offerte ? '#22c55e' : '#ef4444', padding: '2px 8px', borderRadius: 5, fontSize: 10 }}>
                        {data.offerte ? '✓ Offerte aanwezig' : '✗ Geen offerte'}
                    </span>
                    <span style={{ background: data.haccp_count > 0 ? 'rgba(34,197,94,.1)' : 'rgba(245,158,11,.1)', color: data.haccp_count > 0 ? '#22c55e' : '#f59e0b', padding: '2px 8px', borderRadius: 5, fontSize: 10 }}>
                        {data.haccp_count > 0 ? '✓ HACCP: ' + data.haccp_count + ' metingen' : '⚠ Geen HACCP-log'}
                    </span>
                    <button onClick={function () { window.print(); }} style={{ marginLeft: 'auto', background: 'rgba(245,158,11,.15)', border: '1px solid rgba(245,158,11,.3)', color: '#f59e0b', padding: '2px 8px', borderRadius: 5, fontSize: 10, cursor: 'pointer', fontWeight: 600 }}>
                        <i className="fa-solid fa-print" style={{ marginRight: 3 }}></i>Printen
                    </button>
                </div>
            </div>
        );
    }

    // ── Render winstgevendheid ────────────────────────────────────────────────
    function renderWinstgevendheid(data) {
        if (!data) return null;
        var ev = data.event || {};
        var dq = data.datakwaliteit || {};
        var hasData = dq.heeft_facturen || dq.heeft_inkoop || dq.heeft_uren;
        function fmtEur(n) { return '€' + (n || 0).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
        var margeKleur = data.nettoMargePerc == null ? '#71717a' : data.nettoMargePerc >= 40 ? '#22c55e' : data.nettoMargePerc >= 20 ? '#f59e0b' : '#ef4444';
        return (
            <div style={{ fontSize: 12, border: '1px solid rgba(167,139,250,.3)', borderRadius: 10, overflow: 'hidden', marginTop: 4 }}>
                <div style={{ background: 'rgba(167,139,250,.12)', padding: '8px 12px', borderBottom: '1px solid rgba(167,139,250,.2)' }}>
                    <div style={{ fontWeight: 800, color: '#a78bfa', fontSize: 13 }}>
                        <i className="fa-solid fa-chart-line" style={{ marginRight: 6 }}></i>
                        Winstgevendheid — {ev.naam || '?'}
                    </div>
                    <div style={{ color: 'var(--muted)', fontSize: 11 }}>{ev.datum} · {ev.gasten} gasten</div>
                </div>
                {!hasData && (
                    <div style={{ padding: '12px', color: 'var(--muted)', fontSize: 11, textAlign: 'center' }}>
                        Nog geen financiële data gekoppeld aan dit event (facturen, inkoop of uren).
                    </div>
                )}
                {hasData && (
                    <div style={{ padding: '10px 12px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                            <div style={{ background: 'rgba(34,197,94,.08)', borderRadius: 7, padding: '7px 10px', border: '1px solid rgba(34,197,94,.2)' }}>
                                <div style={{ fontSize: 10, color: 'var(--muted)' }}>Omzet</div>
                                <div style={{ fontWeight: 800, color: '#22c55e', fontSize: 15 }}>{fmtEur(data.omzet)}</div>
                                <div style={{ fontSize: 9, color: 'var(--muted)' }}>{data.facturen_count} factuur/facturen</div>
                            </div>
                            <div style={{ background: 'rgba(239,68,68,.08)', borderRadius: 7, padding: '7px 10px', border: '1px solid rgba(239,68,68,.2)' }}>
                                <div style={{ fontSize: 10, color: 'var(--muted)' }}>Kosten (inkoop)</div>
                                <div style={{ fontWeight: 800, color: '#ef4444', fontSize: 15 }}>{fmtEur(data.inkoopKosten)}</div>
                                <div style={{ fontSize: 9, color: 'var(--muted)' }}>{data.inkoop_count} lijst/lijsten</div>
                            </div>
                            <div style={{ background: 'rgba(245,158,11,.08)', borderRadius: 7, padding: '7px 10px', border: '1px solid rgba(245,158,11,.2)' }}>
                                <div style={{ fontSize: 10, color: 'var(--muted)' }}>Arbeidskosten</div>
                                <div style={{ fontWeight: 800, color: '#f59e0b', fontSize: 15 }}>{fmtEur(data.arbeidskosten)}</div>
                                <div style={{ fontSize: 9, color: 'var(--muted)' }}>{data.totaalUren}u · {data.urenlog_count} logs</div>
                            </div>
                            <div style={{ background: 'rgba(167,139,250,.08)', borderRadius: 7, padding: '7px 10px', border: '1px solid rgba(167,139,250,.2)' }}>
                                <div style={{ fontSize: 10, color: 'var(--muted)' }}>Netto marge</div>
                                <div style={{ fontWeight: 800, color: margeKleur, fontSize: 15 }}>{fmtEur(data.nettoMarge)}</div>
                                <div style={{ fontSize: 9, color: margeKleur }}>{data.nettoMargePerc != null ? data.nettoMargePerc + '%' : '—'}</div>
                            </div>
                        </div>
                        {data.brutoMargePerc != null && (
                            <div style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'center', marginTop: 4 }}>
                                Bruto marge: <strong style={{ color: 'var(--text)' }}>{fmtEur(data.brutoMarge)} ({data.brutoMargePerc}%)</strong>
                            </div>
                        )}
                        {!dq.heeft_facturen && <div style={{ fontSize: 10, color: '#f59e0b', marginTop: 4 }}>⚠ Geen facturen gekoppeld — omzet is €0</div>}
                        {!dq.heeft_inkoop && <div style={{ fontSize: 10, color: '#f59e0b' }}>⚠ Geen inkooplijsten gekoppeld — inkoopkosten zijn €0</div>}
                        {!dq.heeft_uren && <div style={{ fontSize: 10, color: '#f59e0b' }}>⚠ Geen urenregistraties gekoppeld — arbeidskosten zijn €0</div>}
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
                    <div>
                        {action.meta && action.meta.op === 'delete' && (
                            <div style={{ fontSize: 11, color: '#ef4444', background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.2)', borderRadius: 6, padding: '5px 8px', marginBottom: 6 }}>
                                <i className="fa-solid fa-triangle-exclamation" style={{ marginRight: 4 }}></i>
                                <strong>Permanent verwijderen</strong> — dit kan niet ongedaan worden gemaakt!
                            </div>
                        )}
                        <div style={{ display: 'flex', gap: 6 }}>
                            <button
                                onClick={function () { approveAction(msgIdx, action.id); }}
                                style={{ flex: 1, padding: '5px 0', borderRadius: 7, border: 'none', background: action.meta && action.meta.op === 'delete' ? '#ef4444' : '#22c55e', color: '#fff', fontWeight: 700, fontSize: 11, cursor: 'pointer' }}
                            >
                                {action.meta && action.meta.op === 'delete'
                                    ? <><i className="fa-solid fa-trash" style={{ marginRight: 4 }}></i>Permanent verwijderen</>
                                    : <><i className="fa-solid fa-check" style={{ marginRight: 4 }}></i>Uitvoeren</>
                                }
                            </button>
                            <button onClick={function () { rejectAction(msgIdx, action.id); }} style={{ flex: 1, padding: '5px 0', borderRadius: 7, border: '1px solid var(--border)', background: 'transparent', color: 'var(--muted)', fontSize: 11, cursor: 'pointer' }}>
                                <i className="fa-solid fa-xmark" style={{ marginRight: 4 }}></i>Annuleren
                            </button>
                        </div>
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
                                            {(msg.content || msg.streaming) && renderText(msg.content, msg.streaming)}
                                            {/* Prep list ingebed in bericht */}
                                            {msg.prepList && renderPrepList(msg.prepList)}
                                            {/* Inkooplijst */}
                                            {msg.inkooplijst && renderInkooplijst(msg.inkooplijst)}
                                            {/* Event briefing */}
                                            {msg.eventBriefing && renderEventBriefing(msg.eventBriefing)}
                                            {/* Winstgevendheid */}
                                            {msg.winstgevendheid && renderWinstgevendheid(msg.winstgevendheid)}
                                            {/* Succes badge met link */}
                                            {msg.successBadge && msg.successLink && (
                                                <a href={msg.successLink} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 8, background: 'rgba(167,139,250,.15)', border: '1px solid rgba(167,139,250,.3)', color: '#a78bfa', padding: '4px 10px', borderRadius: 7, fontSize: 11, fontWeight: 700, textDecoration: 'none' }}>
                                                    <i className="fa-solid fa-arrow-right"></i>{msg.successBadge}
                                                </a>
                                            )}
                                            {/* Undo-knop voor INSERT acties */}
                                            {msg.undoInsert && (
                                                <button
                                                    onClick={function () { undoInsertAction(msg.undoInsert.table, msg.undoInsert.id); }}
                                                    style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 6, background: 'transparent', border: '1px solid rgba(239,68,68,.3)', color: '#ef4444', padding: '3px 9px', borderRadius: 7, fontSize: 10, fontWeight: 600, cursor: 'pointer' }}
                                                    title="Maak dit ongedaan"
                                                >
                                                    <i className="fa-solid fa-rotate-left"></i>Ongedaan maken
                                                </button>
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
