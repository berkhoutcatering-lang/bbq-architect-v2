'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { parseActions, executeAction, loadPageContextData } from '@/lib/ai-actions';
import RecipeMatrix from '@/components/RecipeMatrix';

export default function AiAssistant() {
    var pathname = usePathname();
    var [isOpen, setIsOpen] = useState(false);
    var [messages, setMessages] = useState([]);
    var [input, setInput] = useState('');
    var [isLoading, setIsLoading] = useState(false);
    var [contextData, setContextData] = useState(null);
    var [contextLoaded, setContextLoaded] = useState(false);
    var [contextLoading, setContextLoading] = useState(false);
    var [imageFile, setImageFile] = useState(null);
    var [imageBase64, setImageBase64] = useState(null);
    var messagesEndRef = useRef(null);
    var inputRef = useRef(null);
    var fileInputRef = useRef(null);
    var [activeConversation, setActiveConversation] = useState(null);
    var [folders, setFolders] = useState([]);
    var [conversations, setConversations] = useState([]);

    var pageName = (function () {
        var n = pathname === '/' ? 'Dashboard' : pathname.replace('/', '').replace(/-/g, ' ');
        return n.charAt(0).toUpperCase() + n.slice(1);
    })();

    // ── Reset gesprek bij pagina-wissel ──────────────────────────────────────
    useEffect(function () {
        setMessages([{
            role: 'assistant',
            content: 'Gegroet, vakman! Ik ben je **Digital Pitmaster**. Ik help je op **' + pageName + '**.\n\nWat staat er op het vuur vandaag?',
            actions: [],
        }]);
        setContextData(null);
        setContextLoaded(false);
    }, [pathname]);

    // ── Laad pagina-context als het venster opent ─────────────────────────────
    var loadContext = useCallback(async function () {
        if (contextLoaded || contextLoading || !supabase) return;
        setContextLoading(true);
        try {
            var data = await loadPageContextData(pathname, supabase);
            setContextData(data);
            setContextLoaded(true);
            if (data && Object.keys(data).length > 0) {
                setMessages(function (prev) {
                    return prev.map(function (m, i) {
                        if (i === 0) return Object.assign({}, m, { contextBadge: true });
                        return m;
                    });
                });
            }
        } catch (e) {
            console.warn('[AI] Context laden mislukt:', e.message);
        } finally {
            setContextLoading(false);
        }
    }, [pathname, contextLoaded, contextLoading]);

    useEffect(function () {
        if (isOpen && !contextLoaded) {
            loadContext();
        }
    }, [isOpen, contextLoaded, loadContext]);

    // ── Scroll naar beneden ──────────────────────────────────────────────────
    useEffect(function () {
        if (isOpen && messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages, isOpen]);

    // ── Focus input als venster opent ────────────────────────────────────────
    useEffect(function () {
        if (isOpen && inputRef.current) {
            setTimeout(function () { if (inputRef.current) inputRef.current.focus(); }, 100);
        }
    }, [isOpen]);

    // ── Image Handling ───────────────────────────────────────────────────────
    function handleImageSelect(e) {
        var file = e.target.files[0];
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) { alert("Afbeelding is te groot (max 5MB)"); return; }
        setImageFile(file);
        var reader = new FileReader();
        reader.onload = function (ev) { setImageBase64(ev.target.result); };
        reader.readAsDataURL(file);
    }
    function removeImage() {
        setImageFile(null);
        setImageBase64(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
    }

    // ── Bericht versturen ────────────────────────────────────────────────────
    async function sendMessage(e) {
        if (e) e.preventDefault();
        var text = input.trim();
        if (!text && !imageBase64 || isLoading) return;

        var userMsg = { role: 'user', content: text || '📸 Afbeelding geüpload', imageUrl: imageBase64 };

        var apiMessages = messages.map(function (m) {
            if (m.imageUrl) {
                return { role: m.role, content: [{ type: "text", text: m.content || "Zie afbeelding" }, { type: "image_url", image_url: { url: m.imageUrl } }] };
            }
            return { role: m.role, content: m.content };
        });

        if (imageBase64) {
            apiMessages.push({ role: 'user', content: [{ type: "text", text: text || "Lees dit bonnetje uit met process_receipt" }, { type: "image_url", image_url: { url: imageBase64 } }] });
        } else {
            apiMessages.push({ role: 'user', content: text });
        }

        setMessages(function (prev) { return [...prev, userMsg]; });
        setIsLoading(true);
        setInput('');
        removeImage();

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

        try {
            var msg = messages[msgIdx];
            var action = msg && msg.actions && msg.actions.find(function (a) { return a.id === actionId; });
            if (!action) return;

            var result = await executeAction(action, supabase);

            setMessages(function (prev) {
                return prev.map(function (m, i) {
                    if (i !== msgIdx) return m;
                    return Object.assign({}, m, {
                        actions: m.actions.map(function (a) {
                            return a.id === actionId ? Object.assign({}, a, { status: 'done', result: result }) : a;
                        }),
                    });
                });
            });

            setMessages(function (prev) {
                return [...prev, {
                    role: 'assistant',
                    content: '\u2705 **' + action.meta.label + '** is succesvol uitgevoerd!' + (result && result.id ? ' (ID: ' + result.id + ')' : ''),
                    actions: [],
                }];
            });

        } catch (err) {
            setMessages(function (prev) {
                return prev.map(function (m, i) {
                    if (i !== msgIdx) return m;
                    return Object.assign({}, m, {
                        actions: m.actions.map(function (a) {
                            return a.id === actionId ? Object.assign({}, a, { status: 'error', error: err.message }) : a;
                        }),
                    });
                });
            });
            setMessages(function (prev) {
                return [...prev, { role: 'assistant', content: '\u274C Actie mislukt: ' + err.message, actions: [] }];
            });
        }
    }

    // ── Actie afwijzen ───────────────────────────────────────────────────────
    function rejectAction(msgIdx, actionId) {
        setMessages(function (prev) {
            return prev.map(function (m, i) {
                if (i !== msgIdx) return m;
                return Object.assign({}, m, {
                    actions: m.actions.map(function (a) {
                        return a.id === actionId ? Object.assign({}, a, { status: 'rejected' }) : a;
                    }),
                });
            });
        });
        setMessages(function (prev) {
            return [...prev, { role: 'assistant', content: 'Begrepen, ik voer de actie niet uit.', actions: [] }];
        });
    }

    function handleKey(e) {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    }

    // ── Render markdown-achtige tekst ─────────────────────────────────────────
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
        if (action.type === 'render_recipe_matrix') {
            return <RecipeMatrix key={action.id} action={action} supabase={supabase} />;
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
        var isError = action.status === 'error' || action.status === 'failed';
        var meta = action.meta || { icon: 'fa-triangle-exclamation', color: '#ef4444', label: 'Systeem Actie' };

        return (
            <div key={action.id} style={{
                margin: '8px 0 0 0',
                padding: '10px 12px',
                borderRadius: 10,
                border: '1px solid',
                fontSize: 12,
                borderColor: isDone ? 'rgba(34,197,94,.4)' : isError ? 'rgba(239,68,68,.4)' : isRejected ? 'rgba(113,113,122,.3)' : 'rgba(255,191,0,.35)',
                background: isDone ? 'rgba(34,197,94,.08)' : isError ? 'rgba(239,68,68,.08)' : isRejected ? 'rgba(113,113,122,.08)' : 'rgba(255,191,0,.08)',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <i className={'fa-solid ' + (meta.icon || 'fa-bolt')} style={{ color: isDone ? '#22c55e' : isRejected ? '#71717a' : (meta.color || '#FFBF00'), fontSize: 13 }}></i>
                    <span style={{ fontWeight: 700, color: 'var(--text)' }}>{meta.label}</span>
                    {isDone && <span style={{ marginLeft: 'auto', color: '#22c55e', fontSize: 11 }}>&#10003; Uitgevoerd</span>}
                    {isRejected && <span style={{ marginLeft: 'auto', color: '#71717a', fontSize: 11 }}>Afgewezen</span>}
                    {isError && <span style={{ marginLeft: 'auto', color: '#ef4444', fontSize: 11 }}>Fout</span>}
                </div>
                <div style={{ color: 'var(--muted)', marginBottom: isPending ? 8 : 0, lineHeight: 1.4 }}>{action.description}</div>
                {action.data && Object.keys(action.data).length > 0 && (
                    <div style={{ fontFamily: 'monospace', fontSize: 10, color: 'var(--muted)', background: 'rgba(0,0,0,.3)', padding: '4px 6px', borderRadius: 6, marginBottom: isPending ? 8 : 0, wordBreak: 'break-all' }}>
                        {JSON.stringify(action.data, null, 1).slice(0, 200)}{JSON.stringify(action.data).length > 200 ? '\u2026' : ''}
                    </div>
                )}
                {isPending && (
                    <div style={{ display: 'flex', gap: 6 }}>
                        <button
                            onClick={function () { approveAction(msgIdx, action.id); }}
                            style={{ flex: 1, padding: '5px 0', borderRadius: 7, border: 'none', background: '#22c55e', color: '#000', fontWeight: 700, fontSize: 11, cursor: 'pointer' }}
                        >
                            <i className="fa-solid fa-check" style={{ marginRight: 4 }}></i>Uitvoeren
                        </button>
                        <button
                            onClick={function () { rejectAction(msgIdx, action.id); }}
                            style={{ flex: 1, padding: '5px 0', borderRadius: 7, border: '1px solid var(--border)', background: 'transparent', color: 'var(--muted)', fontSize: 11, cursor: 'pointer' }}
                        >
                            <i className="fa-solid fa-xmark" style={{ marginRight: 4 }}></i>Afwijzen
                        </button>
                    </div>
                )}
                {isExecuting && (
                    <div style={{ color: '#FFBF00', fontSize: 11 }}>
                        <i className="fa-solid fa-spinner fa-spin" style={{ marginRight: 4 }}></i>Bezig&hellip;
                    </div>
                )}
                {isError && action.error && (
                    <div style={{ color: '#ef4444', fontSize: 11, marginTop: 4 }}>{action.error}</div>
                )}
            </div>
        );
    }

    return (
        <div className="ai-assistant-container">
            <button
                className={'ai-toggle-btn' + (isOpen ? ' active' : '')}
                onClick={function () { setIsOpen(function (v) { return !v; }); }}
                title="BBQ Copilot"
                id="ai-toggle-btn"
            >
                <i className={'fa-solid ' + (isOpen ? 'fa-xmark' : 'fa-robot')}></i>
                {!isOpen && <span className="ai-pulse-ring"></span>}
            </button>

            {isOpen && (
                <div className="ai-chat-window panel" id="ai-chat-window">
                    {/* Header */}
                    <div className="ai-chat-header">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div className="ai-avatar-header">
                                <i className="fa-solid fa-robot"></i>
                            </div>
                            <div>
                                <div style={{ fontWeight: 800, fontSize: 14, color: '#000' }}>BBQ Copilot</div>
                                <div style={{ fontSize: 10, color: 'rgba(0,0,0,.65)', display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <span>&#128205;</span> {pageName}
                                    {contextLoading && <span style={{ fontSize: 9, background: 'rgba(0,0,0,.15)', borderRadius: 4, padding: '1px 4px' }}>context laden&hellip;</span>}
                                    {contextLoaded && contextData && <span style={{ fontSize: 9, background: 'rgba(0,0,0,.2)', borderRadius: 4, padding: '1px 4px' }}>&#10003; context</span>}
                                </div>
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: 6 }}>
                            <button
                                onClick={function () { setContextLoaded(false); setContextData(null); loadContext(); }}
                                className="ai-clear-btn"
                                title="Context herladen"
                            >
                                <i className="fa-solid fa-database" style={{ fontSize: 11 }}></i>
                            </button>
                            <button
                                onClick={function () { setMessages([{ role: 'assistant', content: 'Gesprek gewist. Hoe kan ik helpen?', actions: [] }]); }}
                                className="ai-clear-btn"
                                title="Gesprek wissen"
                            >
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
                                        {!isUser && (
                                            <div className="ai-avatar"><i className="fa-solid fa-fire-flame-curved"></i></div>
                                        )}
                                        <div className={'ai-message bubble ' + (isUser ? 'user-bubble' : 'assistant-bubble')}>
                                            {msg.contextBadge && (
                                                <div style={{ fontSize: 10, color: '#22c55e', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                                                    <i className="fa-solid fa-database"></i> Pagina-data geladen
                                                </div>
                                            )}
                                            {msg.imageUrl && (
                                                <div style={{ marginBottom: 8 }}>
                                                    <img src={msg.imageUrl} alt="Upload" style={{ maxWidth: '100%', maxHeight: 200, borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)' }} />
                                                </div>
                                            )}
                                            {renderText(msg.content)}
                                        </div>
                                    </div>
                                    {!isUser && msg.actions && msg.actions.length > 0 && (
                                        <div style={{ paddingLeft: 36 }}>
                                            {msg.actions.map(function (action) {
                                                return renderActionCard(action, idx);
                                            })}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                        {isLoading && (
                            <div className="ai-message-wrapper assistant">
                                <div className="ai-avatar"><i className="fa-solid fa-fire-flame-curved"></i></div>
                                <div className="ai-message bubble assistant-bubble loading-dots">
                                    <span></span><span></span><span></span>
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Input */}
                    <div className="ai-chat-input">
                        {imageBase64 && (
                            <div style={{ position: 'relative', display: 'inline-block', marginBottom: 8 }}>
                                <img src={imageBase64} alt="Upload preview" style={{ height: 60, borderRadius: 8, border: '1px solid var(--border)' }} />
                                <button type="button" onClick={removeImage} style={{ position: 'absolute', top: -5, right: -5, background: 'var(--red)', color: '#fff', border: 'none', borderRadius: '50%', width: 20, height: 20, fontSize: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <i className="fa-solid fa-times"></i>
                                </button>
                            </div>
                        )}
                        <form onSubmit={sendMessage} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <input type="file" accept="image/*" ref={fileInputRef} style={{ display: 'none' }} onChange={handleImageSelect} />
                            <button type="button" onClick={function () { if (fileInputRef.current) fileInputRef.current.click(); }} className="btn btn-ghost" style={{ padding: '0 12px', height: '36px', borderRadius: 8, background: 'rgba(255,255,255,0.05)' }} title="Upload Bonnetje (OCR)">
                                <i className="fa-solid fa-camera"></i>
                            </button>
                            <textarea
                                ref={inputRef}
                                value={input}
                                onChange={function (e) { setInput(e.target.value); }}
                                onKeyDown={handleKey}
                                placeholder={'Vraag of upload een bon\u2026'}
                                disabled={isLoading}
                                autoComplete="off"
                                rows={1}
                                className="ai-textarea"
                            />
                            <button type="submit" disabled={(!input.trim() && !imageBase64) || isLoading} className="send-btn" id="ai-send-btn">
                                <i className="fa-solid fa-paper-plane"></i>
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
