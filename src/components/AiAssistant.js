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
    var fileInputRef = useRef(null);
    var [activeConversation, setActiveConversation] = useState(null);
    var [folders, setFolders] = useState([]);
    var [conversations, setConversations] = useState([]);

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
            if (pathname === '/') {
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
        '/': ['Wat moet ik vandaag regelen?', 'Maak een prep-lijst', 'Lage voorraad check', 'Omzet overzicht'],
        '/events': ['Voeg een nieuw event toe', 'Welke events komen eraan?', 'Maak een prep-lijst', 'Tip voor grote groepen'],
        '/agenda': ['Maak een prep-lijst', 'Open taken afvinken', 'Taak toevoegen voor event', 'Planning komende week'],
        '/recepten': ['Nieuw recept aanmaken', 'Bereken vlees voor 80 gasten', 'Dry rub recept voor brisket', 'Pulled pork bereidingstijd'],
        '/gerechten': ['20 gerechten met buikspek', 'Gerecht verwijderen', 'Vegetarische hapjes bedenken', 'Menubalans analyseren'],
        '/menu-engineering': ['Welke gerechten hebben beste marge?', 'Menu-analyse uitleggen', 'Stars vs Dogs in mijn menu', 'Gerecht verbeteren voor marge'],
        '/offertes': ['Nieuwe offerte aanmaken', 'Welke offertes verlopen binnenkort?', 'Marge analyse', 'Omzet overzicht per status'],
        '/facturen': ['Nieuwe factuur aanmaken', 'Welke facturen vervallen binnenkort?', 'Openstaand overzicht', 'Cashflow advies'],
        '/voorraad': ['Wat staat op laag voorraad?', 'Bijbestellen wat ik nodig heb', 'Nieuw voorraad item toevoegen', 'Par levels uitleggen'],
        '/inkoop': ['Inkooplijst aanmaken voor event', 'Leverancier toevoegen', 'Vleesinkoop calculeren voor 80p', 'Beste leverancier kiezen'],
        '/service': ['Open prep-taken voor dit event', 'Temperatuur registreren', 'Hoe lang warm houden?', 'Snel probleem oplossen'],
        '/haccp': ['Temperatuur registreren', 'Welke events missen HACCP?', 'Kerntemperaturen uitleggen', 'Gevaarlijke zone uitleg'],
        '/uren': ['Uren registreren voor vandaag', 'Weekoverzicht medewerkers', 'Overuren berekenen', 'Wettelijke limieten NL'],
        '/materieel': ['Welk materieel heeft onderhoud nodig?', 'Onderhoud registreren', 'Materieel toevoegen', 'Levensduur BBQ uitleggen'],
        '/logistiek': ['Wat is nog niet afgevinkt?', 'Bus inlaadvolgorde tips', 'Koelboxen checklist', 'Vergeten items check'],
        '/boekhouding': ['KPI overzicht', 'Verlopen facturen actie', 'BTW-aangifte tips', 'Food cost ratio berekenen'],
        '/financien': ['Beste maand analyse', 'Marge per maand vergelijken', 'Stille maanden aanpak', 'YoY groei berekenen'],
        '/price-intelligence': ['Leverancier vergelijken', 'Beste prijs-kwaliteit vlees', 'Inkoopprijs optimaliseren', 'Seizoensprijzen advies'],
        '/ai-chat': ['20 gerechten met buikspek', 'Thema-BBQ concepten', 'Zomermenu brainstorm', 'Onderscheidend vermogen tips'],
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

            if (!res.ok) throw new Error('Netwerkfout');

            // ── Streaming afhandeling ───────────────────────────────────────
            var assistantMsg = { role: 'assistant', content: '', actions: [], isStreaming: true };
            setMessages(function (prev) { return [...prev, assistantMsg]; });

            var reader = res.body.getReader();
            var decoder = new TextDecoder();
            var accumulatedText = '';

            while (true) {
                var chunk = await reader.read();
                if (chunk.done) break;
                var text = decoder.decode(chunk.value);
                var lines = text.split('\n');
                for (var line of lines) {
                    if (line.startsWith('data: ')) {
                        var raw = line.slice(6);
                        try {
                            var parsedChunk = JSON.parse(raw);
                            if (parsedChunk.delta) {
                                accumulatedText += parsedChunk.delta;
                                setMessages(function (prev) {
                                    var last = prev[prev.length - 1];
                                    if (last && last.role === 'assistant') {
                                        return [...prev.slice(0, -1), Object.assign({}, last, { content: accumulatedText })];
                                    }
                                    return prev;
                                });
                            }
                            if (parsedChunk.done) {
                                var finalOutput = parseActions(accumulatedText);
                                setMessages(function (prev) {
                                    return [...prev.slice(0, -1), {
                                        role: 'assistant',
                                        content: finalOutput.cleanText,
                                        actions: finalOutput.actions,
                                    }];
                                });
                            }
                        } catch (e) { }
                    }
                }
            }

            // Auto-save als dit gesprek al opgeslagen was
            if (activeConversation) {
                setTimeout(updateConversation, 500);
            }

        } catch (error) {
            setMessages(function (prev) {
                return [...prev, { role: 'assistant', content: '❌ ' + error.message, actions: [] }];
            });
        } finally {
            setIsLoading(false);
            // Auto-save nadat AI response verwerkt is (state is dan bijgewerkt)
            if (activeConversation) {
                setTimeout(updateConversation, 300);
            }
        }
    }

    async function updateConversation() {
        if (!activeConversation || !supabase) return;
        try {
            await supabase.from('ai_conversations').update({
                messages: messages,
                updated_at: new Date().toISOString()
            }).eq('id', activeConversation.id);
        } catch (e) { console.error('Auto-save error:', e); }
    }

    // ── Actie goedkeuren ─────────────────────────────────────────────────────
    async function approveAction(msgIdx, actionId) {
        setMessages(function (prev) {
            return prev.map(function (m, i) {
                if (i !== msgIdx) return m;
                return Object.assign({}, m, {
                    actions: m.actions.map(function (a) {
                        return a.id === actionId ? Object.assign({}, a, { status: 'executing' }) : a;
                    }),
                });
            });
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

    // ── Tool renders ────────────────────────────────────────────────────────
    function renderInkooplijst(data) {
        if (!data) return null;
        return (
            <div className="tool-card" style={{ background: 'rgba(255,191,0,0.05)', border: '1px solid rgba(255,191,0,0.2)' }}>
                <div style={{ fontWeight: 800, marginBottom: 8, color: '#FFBF00' }}>
                    <i className="fa-solid fa-cart-shopping" style={{ marginRight: 6 }}></i>
                    Inkooplijst: {data.event?.naam}
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 10 }}>
                    {data.gasten} gasten &bull; {data.items?.length} ingrediënten &bull; Geschatte kosten: &euro;{data.geschatte_inkoop_kosten}
                </div>
                <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                            <th style={{ padding: '4px 0' }}>Item</th>
                            <th style={{ padding: '4px 0' }}>Nodig</th>
                            <th style={{ padding: '4px 0' }}>Bestellen</th>
                        </tr>
                    </thead>
                    <tbody>
                        {(data.items || []).slice(0, 8).map(function (item, k) {
                            return (
                                <tr key={k} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                    <td style={{ padding: '4px 0' }}>{item.naam}</td>
                                    <td style={{ padding: '4px 0' }}>{item.benodigdheid} {item.eenheid}</td>
                                    <td style={{ padding: '4px 0', fontWeight: item.te_bestellen > 0 ? 700 : 400, color: item.te_bestellen > 0 ? '#FFBF00' : '#22c55e' }}>
                                        {item.te_bestellen > 0 ? item.te_bestellen + ' ' + item.eenheid : '\u2713'}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
                {data.items?.length > 8 && <div style={{ fontSize: 10, marginTop: 6, opacity: .6 }}>+ {data.items.length - 8} meer items...</div>}
                <button onClick={function () { window.location.href = '/inkoop?event=' + data.event?.id; }} className="btn btn-xs btn-primary" style={{ marginTop: 12, width: '100%' }}>
                    Open in Inkoop Module
                </button>
            </div>
        );
    }

    function renderEventBriefing(data) {
        if (!data) return null;
        return (
            <div className="tool-card" style={{ background: 'rgba(56,189,248,0.05)', border: '1px solid rgba(56,189,248,0.2)' }}>
                <div style={{ fontWeight: 800, marginBottom: 8, color: '#38bdf8' }}>
                    <i className="fa-solid fa-file-lines" style={{ marginRight: 6 }}></i>
                    Event Briefing: {data.event?.naam}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 11 }}>
                    <div><strong>Datum:</strong> {data.event?.datum}</div>
                    <div><strong>Gasten:</strong> {data.event?.gasten}</div>
                    <div><strong>Locatie:</strong> {data.event?.locatie}</div>
                    <div><strong>Status:</strong> {data.event?.status}</div>
                </div>
                <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 4 }}>Menu Progress</div>
                    <div style={{ display: 'flex', gap: 4 }}>
                        {(data.menu || []).map(function (m, i) {
                            return <span key={i} title={m.naam} style={{ padding: '2px 6px', background: 'rgba(56,189,248,0.15)', borderRadius: 4, fontSize: 9 }}>{m.naam}</span>;
                        })}
                    </div>
                </div>
                <div style={{ marginTop: 10, fontSize: 11 }}>
                    <i className="fa-solid fa-list-check" style={{ marginRight: 4 }}></i> {data.prep_taken_open} open prep taken
                </div>
            </div>
        );
    }

    function renderWinstgevendheid(data) {
        if (!data) return null;
        var isGood = data.nettoMargePerc > 40;
        return (
            <div className="tool-card" style={{ background: isGood ? 'rgba(34,197,94,0.05)' : 'rgba(239,68,68,0.05)', border: isGood ? '1px solid rgba(34,197,94,0.2)' : '1px solid rgba(239,68,68,0.2)' }}>
                <div style={{ fontWeight: 800, marginBottom: 8, color: isGood ? '#22c55e' : '#ef4444' }}>
                    <i className="fa-solid fa-chart-pie" style={{ marginRight: 6 }}></i>
                    Rendement: {data.event?.naam}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                    <div className="stat-mini">
                        <div className="label">Omzet</div>
                        <div className="val">&euro;{data.omzet}</div>
                    </div>
                    <div className="stat-mini">
                        <div className="label">Inkoop</div>
                        <div className="val">&euro;{data.inkoopKosten}</div>
                    </div>
                    <div className="stat-mini">
                        <div className="label">Arbeid</div>
                        <div className="val">&euro;{data.arbeidskosten}</div>
                    </div>
                    <div className="stat-mini">
                        <div className="label">Netto Winst</div>
                        <div className="val" style={{ color: isGood ? '#22c55e' : '#ef4444' }}>&euro;{data.nettoMarge}</div>
                    </div>
                </div>
                <div style={{ height: 6, background: 'rgba(0,0,0,0.2)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ width: data.nettoMargePerc + '%', height: '100%', background: isGood ? '#22c55e' : '#ef4444' }}></div>
                </div>
                <div style={{ textAlign: 'right', fontSize: 10, marginTop: 4, fontWeight: 700 }}>{data.nettoMargePerc}% Netto Marge</div>
            </div>
        );
    }

    // ── Render actiekaart ─────────────────────────────────────────────────────
    function renderActionCard(action, msgIdx) {
        // Speciale renderers
        if (action.type === 'bulk_create_gerechten') {
            return <div key={action.id}>{renderDishCards(action, msgIdx)}</div>;
        }
        if (action.type === 'tool_result') {
            if (action.tool === 'generateInkooplijst') return renderInkooplijst(action.result);
            if (action.tool === 'generateEventBriefing') return renderEventBriefing(action.result);
            if (action.tool === 'getEventWinstgevendheid') return renderWinstgevendheid(action.result);
        }

        var isPending = action.status === 'pending';
        var isExecuting = action.status === 'executing';
        var isDone = action.status === 'done';
        var isRejected = action.status === 'rejected';
        var isError = action.status === 'error';

        return (
            <div key={action.id} style={{
                margin: '8px 0 0 0', padding: '10px 12px', borderRadius: 10, border: '1px solid', fontSize: 12,
                borderColor: isDone ? 'rgba(34,197,94,.4)' : isError ? 'rgba(239,68,68,.4)' : isRejected ? 'var(--border)' : 'rgba(255,191,0,.35)',
                background: isDone ? 'rgba(34,197,94,.08)' : isError ? 'rgba(239,68,68,.08)' : isRejected ? 'var(--muted-extra-light)' : 'rgba(255,191,0,.08)',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <i className={'fa-solid ' + (action.meta.icon || 'fa-bolt')} style={{ color: isDone ? '#22c55e' : isRejected ? 'var(--muted)' : (action.meta.color || '#FFBF00'), fontSize: 13 }}></i>
                    <span style={{ fontWeight: 700, color: 'var(--text)' }}>{action.meta.label}</span>
                    {isDone && <span style={{ marginLeft: 'auto', color: '#22c55e', fontSize: 11 }}>✓ Klaar</span>}
                    {isRejected && <span style={{ marginLeft: 'auto', color: 'var(--muted)', fontSize: 11 }}>Geannuleerd</span>}
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
