'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { parseActions, executeAction } from '@/lib/ai-actions';
import RecipeMatrix from '@/components/RecipeMatrix';

var BRAINSTORM_SUGGESTIONS = [
    'Bedenk 5 thema-BBQ concepten voor de zomer',
    'Welke trendy menu-items kan ik toevoegen?',
    'Ideeen voor een vegetarisch BBQ-menu',
    'Hoe kan ik mijn catering onderscheiden?',
    'Brainstorm over een winter-event concept',
    'Marketingtips voor BBQ-catering',
];

var QA_SUGGESTIONS = [
    'Hoeveel kilo vlees voor 100 gasten?',
    'Wat is een goede marge voor catering?',
    'Hoe maak ik een perfecte dry rub?',
    'Tips voor efficiente mise en place',
    'Wat moet ik meenemen in de bus?',
    'Hoe bereken ik mijn uurtarief?',
    'HACCP-kerntemperaturen vlees',
    'Hoeveel voorloopdagen voor een event?',
];

var FOLDER_COLORS = ['#FFBF00', '#22c55e', '#3b82f6', '#a78bfa', '#ef4444', '#f59e0b', '#4ECDC4', '#ec4899'];

export default function AiStudioPage() {
    var [mode, setMode] = useState('brainstorm');
    var [messages, setMessages] = useState([]);
    var [input, setInput] = useState('');
    var [isLoading, setIsLoading] = useState(false);
    var [sidebarOpen, setSidebarOpen] = useState(true);

    // ── Mappen & gesprekken ──────────────────────────────────────────────────
    var [folders, setFolders] = useState([]);
    var [conversations, setConversations] = useState([]);
    var [activeConversation, setActiveConversation] = useState(null);
    var [activeFolder, setActiveFolder] = useState(null);
    var [loadingFolders, setLoadingFolders] = useState(true);

    // ── Map aanmaken UI ──────────────────────────────────────────────────────
    var [showNewFolder, setShowNewFolder] = useState(false);
    var [newFolderName, setNewFolderName] = useState('');
    var [newFolderColor, setNewFolderColor] = useState('#FFBF00');

    var messagesEndRef = useRef(null);
    var inputRef = useRef(null);

    // ── Init begroeting bij modus-wissel ─────────────────────────────────────
    useEffect(function () {
        setMessages([{
            role: 'assistant',
            content: mode === 'brainstorm'
                ? '\uD83D\uDD25 **Brainstorm Modus actief!**\n\nWelkom in de AI Studio van Hop & Bites. Hier denk ik creatief met je mee over menu\'s, events, marketing en alles wat BBQ-catering groot maakt.\n\nWaar wil je over brainstormen?'
                : '\uD83D\uDCA1 **Vraag & Antwoord Modus**\n\nStel me directe vragen over catering, BBQ-technieken, calculaties, planning of bedrijfsvoering. Ik geef concrete, praktische antwoorden.\n\nWat wil je weten?',
            actions: [],
        }]);
    }, [mode]);

    // ── Scroll ───────────────────────────────────────────────────────────────
    useEffect(function () {
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages]);

    // ── Laad mappen en gesprekken ────────────────────────────────────────────
    var loadFoldersAndConversations = useCallback(async function () {
        if (!supabase) { setLoadingFolders(false); return; }
        setLoadingFolders(true);
        try {
            var fRes = await supabase.from('ai_conversation_folders').select('*').order('id');
            var cRes = await supabase.from('ai_conversations').select('id,folder_id,titel,modus,created_at,updated_at').order('updated_at', { ascending: false });
            setFolders(fRes.data || []);
            setConversations(cRes.data || []);
        } catch (e) {
            console.warn('[AI Studio] Mappen laden mislukt:', e.message);
        } finally {
            setLoadingFolders(false);
        }
    }, []);

    useEffect(function () { loadFoldersAndConversations(); }, [loadFoldersAndConversations]);

    // ── Gesprek laden ─────────────────────────────────────────────────────────
    async function loadConversation(conv) {
        if (!supabase) return;
        try {
            var res = await supabase.from('ai_conversations').select('*').eq('id', conv.id).single();
            if (res.data && res.data.messages) {
                setActiveConversation(res.data);
                setMessages(res.data.messages.map(function (m) {
                    return Object.assign({ actions: [] }, m);
                }));
                setMode(res.data.modus || 'brainstorm');
            }
        } catch (e) {
            console.warn('[AI Studio] Gesprek laden mislukt:', e.message);
        }
    }

    // ── Gesprek opslaan ───────────────────────────────────────────────────────
    async function saveConversation(folderId, titel) {
        if (!supabase || messages.length < 2) return null;
        var msgToSave = messages.map(function (m) {
            return { role: m.role, content: m.content };
        });
        try {
            var res = await supabase.from('ai_conversations').insert({
                folder_id: folderId || null,
                titel: titel || 'Gesprek ' + new Date().toLocaleDateString('nl-NL'),
                modus: mode,
                messages: msgToSave,
            }).select().single();
            if (res.data) {
                setActiveConversation(res.data);
                setConversations(function (prev) { return [res.data, ...prev]; });
                return res.data;
            }
        } catch (e) {
            console.warn('[AI Studio] Opslaan mislukt:', e.message);
        }
        return null;
    }

    // ── Gesprek bijwerken ────────────────────────────────────────────────────
    async function updateConversation() {
        if (!supabase || !activeConversation) return;
        var msgToSave = messages.map(function (m) {
            return { role: m.role, content: m.content };
        });
        try {
            await supabase.from('ai_conversations').update({
                messages: msgToSave,
                updated_at: new Date().toISOString(),
            }).eq('id', activeConversation.id);
        } catch (e) {
            console.warn('[AI Studio] Bijwerken mislukt:', e.message);
        }
    }

    // ── Map aanmaken ──────────────────────────────────────────────────────────
    async function createFolder() {
        if (!newFolderName.trim() || !supabase) return;
        try {
            var res = await supabase.from('ai_conversation_folders').insert({
                naam: newFolderName.trim(),
                kleur: newFolderColor,
            }).select().single();
            if (res.data) {
                setFolders(function (prev) { return [...prev, res.data]; });
                setNewFolderName('');
                setShowNewFolder(false);
            }
        } catch (e) {
            console.warn('[AI Studio] Map aanmaken mislukt:', e.message);
        }
    }

    // ── Map verwijderen ───────────────────────────────────────────────────────
    async function deleteFolder(folderId) {
        if (!supabase || !window.confirm('Map verwijderen? Gesprekken in deze map blijven behouden.')) return;
        try {
            await supabase.from('ai_conversation_folders').delete().eq('id', folderId);
            setFolders(function (prev) { return prev.filter(function (f) { return f.id !== folderId; }); });
            if (activeFolder === folderId) setActiveFolder(null);
        } catch (e) {
            console.warn('[AI Studio] Map verwijderen mislukt:', e.message);
        }
    }

    // ── Gesprek verwijderen ───────────────────────────────────────────────────
    async function deleteConversation(convId) {
        if (!supabase || !window.confirm('Dit gesprek definitief verwijderen?')) return;
        try {
            await supabase.from('ai_conversations').delete().eq('id', convId);
            setConversations(function (prev) { return prev.filter(function (c) { return c.id !== convId; }); });
            if (activeConversation && activeConversation.id === convId) {
                setActiveConversation(null);
                startNewConversation();
            }
        } catch (e) {
            console.warn('[AI Studio] Gesprek verwijderen mislukt:', e.message);
        }
    }

    // ── Nieuw gesprek starten ─────────────────────────────────────────────────
    function startNewConversation() {
        setActiveConversation(null);
        setMessages([{
            role: 'assistant',
            content: mode === 'brainstorm'
                ? '\uD83D\uDD25 **Nieuw brainstorm gesprek**\n\nWaar wil je over brainstormen?'
                : '\uD83D\uDCA1 **Nieuw Q&A gesprek**\n\nWat wil je weten?',
            actions: [],
        }]);
    }

    // ── Bericht versturen ─────────────────────────────────────────────────────
    async function sendMessage(e, overrideText) {
        if (e) e.preventDefault();
        var text = (overrideText || input).trim();
        if (!text || isLoading) return;
        setInput('');

        var userMsg = { role: 'user', content: text, actions: [] };
        var apiMessages = [
            ...messages.map(function (m) { return { role: m.role, content: m.content }; }),
            { role: 'user', content: text }
        ];
        setMessages(function (prev) { return [...prev, userMsg]; });
        setIsLoading(true);

        // Mappen-context meegeven aan AI
        var ctxData = null;
        if (folders.length > 0) {
            ctxData = {
                folders: folders.map(function (f) {
                    return {
                        id: f.id,
                        naam: f.naam,
                        gesprekken: conversations.filter(function (c) { return c.folder_id === f.id; }).length,
                    };
                }),
            };
        }

        try {
            var res = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: apiMessages,
                    pageContext: '/ai-chat',
                    mode: mode === 'brainstorm' ? 'brainstorm' : 'qa',
                    contextData: ctxData,
                }),
            });
            var data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Fout opgetreden');

            var rawReply = data.choices[0].message.content;
            var parsed = parseActions(rawReply);

            setMessages(function (prev) {
                return [...prev, {
                    role: 'assistant',
                    content: parsed.cleanText,
                    actions: parsed.actions,
                }];
            });

            if (activeConversation) {
                setTimeout(updateConversation, 500);
            }

        } catch (error) {
            setMessages(function (prev) {
                return [...prev, { role: 'assistant', content: '\u274C ' + error.message, actions: [] }];
            });
        } finally {
            setIsLoading(false);
        }
    }

    // ── Actie goedkeuren ─────────────────────────────────────────────────────
    async function approveAction(msgIdx, actionId) {
        var msg = messages[msgIdx];
        var action = msg && msg.actions && msg.actions.find(function (a) { return a.id === actionId; });
        if (!action) return;

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
            if (action.type === 'save_conversation') {
                var saved = await saveConversation(action.data.folder_id || null, action.data.titel || null);
                setMessages(function (prev) {
                    return prev.map(function (m, i) {
                        if (i !== msgIdx) return m;
                        return Object.assign({}, m, {
                            actions: m.actions.map(function (a) {
                                return a.id === actionId ? Object.assign({}, a, { status: 'done' }) : a;
                            }),
                        });
                    });
                });
                setMessages(function (prev) {
                    return [...prev, {
                        role: 'assistant',
                        content: '\u2705 Gesprek opgeslagen' + (saved ? ' (ID: ' + saved.id + ')' : '') + '!',
                        actions: [],
                    }];
                });
                await loadFoldersAndConversations();
                return;
            }

            if (action.type === 'create_folder') {
                var fRes = await supabase.from('ai_conversation_folders').insert({
                    naam: action.data.naam,
                    kleur: action.data.kleur || '#FFBF00',
                }).select().single();
                if (fRes.data) {
                    setFolders(function (prev) { return [...prev, fRes.data]; });
                    setMessages(function (prev) {
                        return prev.map(function (m, i) {
                            if (i !== msgIdx) return m;
                            return Object.assign({}, m, {
                                actions: m.actions.map(function (a) {
                                    return a.id === actionId ? Object.assign({}, a, { status: 'done' }) : a;
                                }),
                            });
                        });
                    });
                    setMessages(function (prev) {
                        return [...prev, {
                            role: 'assistant',
                            content: '\u2705 Map **' + action.data.naam + '** aangemaakt!',
                            actions: [],
                        }];
                    });
                }
                return;
            }

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
                    content: '\u2705 **' + action.meta.label + '** is uitgevoerd!',
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
                return [...prev, { role: 'assistant', content: '\u274C Mislukt: ' + err.message, actions: [] }];
            });
        }
    }

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
            return [...prev, { role: 'assistant', content: 'Begrepen, ik sla het niet op.', actions: [] }];
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

    // ── Render actiekaart ─────────────────────────────────────────────────────
    function renderActionCard(action, msgIdx) {
        if (action.type === 'render_recipe_matrix') {
            return <RecipeMatrix key={action.id} action={action} supabase={supabase} />;
        }

        var isPending = action.status === 'pending';
        var isExecuting = action.status === 'executing';
        var isDone = action.status === 'done';
        var isRejected = action.status === 'rejected';
        var isError = action.status === 'error';

        return (
            <div key={action.id} style={{
                margin: '10px 0 0 0',
                padding: '12px 14px',
                borderRadius: 12,
                border: '1px solid',
                borderColor: isDone ? 'rgba(34,197,94,.4)' : isError ? 'rgba(239,68,68,.4)' : isRejected ? 'rgba(113,113,122,.3)' : 'rgba(255,191,0,.4)',
                background: isDone ? 'rgba(34,197,94,.06)' : isError ? 'rgba(239,68,68,.06)' : isRejected ? 'rgba(113,113,122,.06)' : 'rgba(255,191,0,.06)',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <i className={'fa-solid ' + (action.meta.icon || 'fa-bolt')} style={{ color: isDone ? '#22c55e' : isRejected ? '#71717a' : (action.meta.color || '#FFBF00'), fontSize: 15 }}></i>
                    <span style={{ fontWeight: 700, fontSize: 13 }}>{action.meta.label}</span>
                    {isDone && <span style={{ marginLeft: 'auto', color: '#22c55e', fontSize: 12, fontWeight: 600 }}>&#10003; Uitgevoerd</span>}
                    {isRejected && <span style={{ marginLeft: 'auto', color: '#71717a', fontSize: 12 }}>Afgewezen</span>}
                    {isError && <span style={{ marginLeft: 'auto', color: '#ef4444', fontSize: 12 }}>Fout</span>}
                </div>
                <div style={{ color: 'var(--muted)', fontSize: 13, marginBottom: isPending ? 10 : 0, lineHeight: 1.5 }}>{action.description}</div>
                {action.data && Object.keys(action.data).length > 0 && action.type !== 'save_conversation' && (
                    <div style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--muted)', background: 'rgba(0,0,0,.3)', padding: '6px 8px', borderRadius: 7, marginBottom: isPending ? 10 : 0 }}>
                        {JSON.stringify(action.data, null, 2).slice(0, 300)}
                    </div>
                )}
                {isPending && (
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button
                            onClick={function () { approveAction(msgIdx, action.id); }}
                            style={{ flex: 1, padding: '8px 0', borderRadius: 8, border: 'none', background: '#22c55e', color: '#000', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
                        >
                            <i className="fa-solid fa-check" style={{ marginRight: 6 }}></i>Goedkeuren & uitvoeren
                        </button>
                        <button
                            onClick={function () { rejectAction(msgIdx, action.id); }}
                            style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--muted)', fontSize: 13, cursor: 'pointer' }}
                        >
                            <i className="fa-solid fa-xmark"></i>
                        </button>
                    </div>
                )}
                {isExecuting && (
                    <div style={{ color: '#FFBF00', fontSize: 13 }}>
                        <i className="fa-solid fa-spinner fa-spin" style={{ marginRight: 6 }}></i>Bezig met uitvoeren&hellip;
                    </div>
                )}
                {isError && action.error && (
                    <div style={{ color: '#ef4444', fontSize: 12, marginTop: 6 }}>{action.error}</div>
                )}
            </div>
        );
    }

    var visibleConversations = activeFolder
        ? conversations.filter(function (c) { return c.folder_id === activeFolder; })
        : conversations;

    var suggestions = mode === 'brainstorm' ? BRAINSTORM_SUGGESTIONS : QA_SUGGESTIONS;

    return (
        <div className="ai-studio-layout">
            {/* ── Sidebar ────────────────────────────────────────────────── */}
            <div className={'ai-studio-sidebar' + (sidebarOpen ? ' open' : '')}>
                <div className="ai-sidebar-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <i className="fa-solid fa-folder-tree" style={{ color: 'var(--brand)' }}></i>
                        <span style={{ fontWeight: 700, fontSize: 13 }}>Gespreksmappen</span>
                    </div>
                    <button
                        onClick={function () { setShowNewFolder(function (v) { return !v; }); }}
                        style={{ background: 'rgba(255,191,0,.15)', border: 'none', color: 'var(--brand)', width: 26, height: 26, borderRadius: 6, cursor: 'pointer', fontSize: 13 }}
                        title="Nieuwe map"
                    >
                        <i className="fa-solid fa-plus"></i>
                    </button>
                </div>

                {showNewFolder && (
                    <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', background: 'rgba(255,191,0,.04)' }}>
                        <input
                            value={newFolderName}
                            onChange={function (e) { setNewFolderName(e.target.value); }}
                            placeholder="Mapnaam&hellip;"
                            style={{ width: '100%', background: 'var(--card-solid)', border: '1px solid var(--border)', color: 'var(--text)', padding: '5px 8px', borderRadius: 6, fontSize: 12, marginBottom: 6 }}
                            onKeyDown={function (e) { if (e.key === 'Enter') createFolder(); }}
                            autoFocus
                        />
                        <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
                            {FOLDER_COLORS.map(function (c) {
                                return (
                                    <div
                                        key={c}
                                        onClick={function () { setNewFolderColor(c); }}
                                        style={{ width: 18, height: 18, borderRadius: '50%', background: c, cursor: 'pointer', outline: newFolderColor === c ? '2px solid #fff' : 'none', outlineOffset: 1 }}
                                    ></div>
                                );
                            })}
                        </div>
                        <div style={{ display: 'flex', gap: 6 }}>
                            <button onClick={createFolder} style={{ flex: 1, padding: '4px 0', borderRadius: 6, border: 'none', background: 'var(--brand)', color: '#000', fontWeight: 700, fontSize: 11, cursor: 'pointer' }}>Aanmaken</button>
                            <button onClick={function () { setShowNewFolder(false); setNewFolderName(''); }} style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--muted)', fontSize: 11, cursor: 'pointer' }}>Annuleer</button>
                        </div>
                    </div>
                )}

                <button onClick={startNewConversation} className="ai-new-conv-btn">
                    <i className="fa-solid fa-plus"></i> Nieuw gesprek
                </button>

                <div
                    className={'ai-folder-item' + (!activeFolder ? ' active' : '')}
                    onClick={function () { setActiveFolder(null); }}
                >
                    <i className="fa-solid fa-comments" style={{ color: 'var(--muted)', fontSize: 13 }}></i>
                    <span>Alle gesprekken</span>
                    <span className="ai-folder-count">{conversations.length}</span>
                </div>

                {loadingFolders ? (
                    <div style={{ padding: '8px 12px', color: 'var(--muted)', fontSize: 11 }}>Laden&hellip;</div>
                ) : (
                    folders.map(function (folder) {
                        var count = conversations.filter(function (c) { return c.folder_id === folder.id; }).length;
                        return (
                            <div key={folder.id} className={'ai-folder-item' + (activeFolder === folder.id ? ' active' : '')}>
                                <div
                                    style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
                                    onClick={function () { setActiveFolder(folder.id === activeFolder ? null : folder.id); }}
                                >
                                    <i className="fa-solid fa-folder" style={{ color: folder.kleur || 'var(--brand)', fontSize: 13 }}></i>
                                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{folder.naam}</span>
                                    <span className="ai-folder-count">{count}</span>
                                </div>
                                <button
                                    onClick={function (e) { e.stopPropagation(); deleteFolder(folder.id); }}
                                    style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: '0 2px', fontSize: 11, opacity: 0, transition: 'opacity .15s' }}
                                    className="ai-folder-delete"
                                    title="Map verwijderen"
                                >
                                    <i className="fa-solid fa-trash"></i>
                                </button>
                            </div>
                        );
                    })
                )}

                <div className="ai-conv-list">
                    {visibleConversations.length === 0 && !loadingFolders && (
                        <div style={{ padding: '12px', color: 'var(--muted)', fontSize: 11, textAlign: 'center' }}>
                            Nog geen gesprekken opgeslagen
                        </div>
                    )}
                    {visibleConversations.map(function (conv) {
                        var isActive = activeConversation && activeConversation.id === conv.id;
                        return (
                            <div key={conv.id} className={'ai-conv-item' + (isActive ? ' active' : '')}>
                                <div style={{ flex: 1, cursor: 'pointer', overflow: 'hidden' }} onClick={function () { loadConversation(conv); }}>
                                    <div style={{ fontSize: 12, fontWeight: isActive ? 700 : 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{conv.titel}</div>
                                    <div style={{ fontSize: 10, color: 'var(--muted)', display: 'flex', gap: 6, alignItems: 'center', marginTop: 2 }}>
                                        <span style={{ background: conv.modus === 'brainstorm' ? 'rgba(255,191,0,.2)' : 'rgba(59,130,246,.2)', color: conv.modus === 'brainstorm' ? '#FFBF00' : '#3b82f6', padding: '1px 5px', borderRadius: 4, fontSize: 9, fontWeight: 700 }}>
                                            {conv.modus === 'brainstorm' ? 'Brainstorm' : 'Q&A'}
                                        </span>
                                        {new Date(conv.updated_at || conv.created_at).toLocaleDateString('nl-NL')}
                                    </div>
                                </div>
                                <button
                                    onClick={function (e) { e.stopPropagation(); deleteConversation(conv.id); }}
                                    style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: '2px 4px', fontSize: 11, opacity: 0, transition: 'opacity .15s' }}
                                    className="ai-conv-delete"
                                >
                                    <i className="fa-solid fa-trash"></i>
                                </button>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* ── Hoofdvenster ───────────────────────────────────────────── */}
            <div className="ai-studio-main">
                {/* Topbar */}
                <div className="ai-studio-topbar">
                    <button
                        onClick={function () { setSidebarOpen(function (v) { return !v; }); }}
                        style={{ background: 'rgba(255,255,255,.06)', border: 'none', color: 'var(--text)', width: 32, height: 32, borderRadius: 8, cursor: 'pointer', fontSize: 14 }}
                        title="Sidebar toggling"
                    >
                        <i className={'fa-solid ' + (sidebarOpen ? 'fa-chevron-left' : 'fa-bars')}></i>
                    </button>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--brand)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#000', fontSize: 16 }}>
                            <i className="fa-solid fa-robot"></i>
                        </div>
                        <div>
                            <div style={{ fontWeight: 800, fontSize: 15 }}>BBQ AI Studio</div>
                            <div style={{ fontSize: 11, color: 'var(--muted)' }}>Hop &amp; Bites &mdash; Powered by Groq</div>
                        </div>
                    </div>

                    <div className="ai-mode-tabs">
                        <button
                            onClick={function () { setMode('brainstorm'); }}
                            className={'ai-mode-tab' + (mode === 'brainstorm' ? ' active' : '')}
                        >
                            <i className="fa-solid fa-fire" style={{ marginRight: 5 }}></i>Brainstorm
                        </button>
                        <button
                            onClick={function () { setMode('qa'); }}
                            className={'ai-mode-tab' + (mode === 'qa' ? ' active' : '')}
                        >
                            <i className="fa-solid fa-circle-question" style={{ marginRight: 5 }}></i>Vragen
                        </button>
                    </div>

                    <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
                        {messages.length > 2 && !activeConversation && (
                            <SaveButton
                                folders={folders}
                                onSave={saveConversation}
                                onRefresh={loadFoldersAndConversations}
                            />
                        )}
                        {activeConversation && (
                            <div style={{ fontSize: 11, color: '#22c55e', display: 'flex', alignItems: 'center', gap: 4 }}>
                                <i className="fa-solid fa-floppy-disk"></i>
                                {activeConversation.titel}
                            </div>
                        )}
                    </div>
                </div>

                {/* Berichten */}
                <div className="ai-studio-messages">
                    {messages.map(function (msg, idx) {
                        var isUser = msg.role === 'user';
                        return (
                            <div key={idx}>
                                <div className={'ai-studio-msg-row' + (isUser ? ' user' : '')}>
                                    {!isUser && (
                                        <div className="ai-studio-avatar">
                                            <i className="fa-solid fa-robot"></i>
                                        </div>
                                    )}
                                    <div className={'ai-studio-bubble' + (isUser ? ' user' : '')}>
                                        {renderText(msg.content)}
                                    </div>
                                    {isUser && (
                                        <div className="ai-studio-user-avatar">
                                            <i className="fa-solid fa-user"></i>
                                        </div>
                                    )}
                                </div>
                                {!isUser && msg.actions && msg.actions.length > 0 && (
                                    <div style={{ paddingLeft: 50, maxWidth: 640 }}>
                                        {msg.actions.map(function (action) {
                                            return renderActionCard(action, idx);
                                        })}
                                    </div>
                                )}
                            </div>
                        );
                    })}

                    {isLoading && (
                        <div className="ai-studio-msg-row">
                            <div className="ai-studio-avatar">
                                <i className="fa-solid fa-robot"></i>
                            </div>
                            <div className="ai-studio-bubble loading-dots">
                                <span></span><span></span><span></span>
                            </div>
                        </div>
                    )}

                    {messages.length <= 1 && !isLoading && (
                        <div style={{ maxWidth: 600, margin: '16px auto 0 50px' }}>
                            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>
                                {mode === 'brainstorm' ? '\uD83D\uDD25 Brainstorm-starters:' : '\uD83D\uDCA1 Veelgestelde vragen:'}
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                {suggestions.map(function (s, i) {
                                    return (
                                        <button
                                            key={i}
                                            onClick={function () { sendMessage(null, s); }}
                                            className="ai-suggestion-chip"
                                        >
                                            {s}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    <div ref={messagesEndRef} />
                </div>

                {/* Input */}
                <div className="ai-studio-input-area">
                    <form onSubmit={sendMessage} style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
                        <textarea
                            ref={inputRef}
                            value={input}
                            onChange={function (e) { setInput(e.target.value); }}
                            onKeyDown={handleKey}
                            placeholder={mode === 'brainstorm' ? 'Waar wil je over brainstormen? (Enter = versturen)' : 'Stel een vraag\u2026 (Enter = versturen)'}
                            disabled={isLoading}
                            rows={2}
                            autoComplete="off"
                            className="ai-textarea general"
                            style={{ flex: 1, resize: 'none' }}
                        />
                        <button
                            type="submit"
                            disabled={!input.trim() || isLoading}
                            className="send-btn"
                            style={{ padding: '12px 18px', fontSize: 16 }}
                        >
                            <i className="fa-solid fa-paper-plane"></i>
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}

// ─── Opslaan knop met folder-selectie dropdown ─────────────────────────────
function SaveButton({ folders, onSave, onRefresh }) {
    var [open, setOpen] = useState(false);
    var [titel, setTitel] = useState('');
    var [folderId, setFolderId] = useState(null);
    var [saving, setSaving] = useState(false);

    async function doSave() {
        if (!titel.trim()) return;
        setSaving(true);
        try {
            await onSave(folderId, titel.trim());
            await onRefresh();
            setOpen(false);
            setTitel('');
        } catch (e) {
            console.warn('Opslaan mislukt:', e.message);
        } finally {
            setSaving(false);
        }
    }

    return (
        <div style={{ position: 'relative' }}>
            <button
                onClick={function () { setOpen(function (v) { return !v; }); }}
                style={{ background: 'rgba(255,191,0,.15)', border: '1px solid rgba(255,191,0,.3)', color: 'var(--brand)', padding: '6px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
            >
                <i className="fa-solid fa-floppy-disk" style={{ marginRight: 5 }}></i>Opslaan
            </button>
            {open && (
                <div style={{ position: 'absolute', right: 0, top: '110%', width: 240, background: 'var(--card-solid)', border: '1px solid var(--border)', borderRadius: 10, padding: 12, zIndex: 100, boxShadow: '0 8px 24px rgba(0,0,0,.5)' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8, color: 'var(--text)' }}>Gesprek opslaan</div>
                    <input
                        value={titel}
                        onChange={function (e) { setTitel(e.target.value); }}
                        placeholder="Geef een titel&hellip;"
                        style={{ width: '100%', background: 'rgba(255,255,255,.05)', border: '1px solid var(--border)', color: 'var(--text)', padding: '5px 8px', borderRadius: 6, fontSize: 12, marginBottom: 8, boxSizing: 'border-box' }}
                        onKeyDown={function (e) { if (e.key === 'Enter') doSave(); }}
                        autoFocus
                    />
                    <select
                        value={folderId || ''}
                        onChange={function (e) { setFolderId(e.target.value ? parseInt(e.target.value) : null); }}
                        style={{ width: '100%', background: 'rgba(255,255,255,.05)', border: '1px solid var(--border)', color: 'var(--text)', padding: '5px 8px', borderRadius: 6, fontSize: 12, marginBottom: 8 }}
                    >
                        <option value="">Geen map (los)</option>
                        {folders.map(function (f) {
                            return <option key={f.id} value={f.id}>{f.naam}</option>;
                        })}
                    </select>
                    <div style={{ display: 'flex', gap: 6 }}>
                        <button
                            onClick={doSave}
                            disabled={!titel.trim() || saving}
                            style={{ flex: 1, padding: '6px 0', borderRadius: 7, border: 'none', background: 'var(--brand)', color: '#000', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}
                        >
                            {saving ? 'Opslaan\u2026' : 'Opslaan'}
                        </button>
                        <button
                            onClick={function () { setOpen(false); }}
                            style={{ padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'transparent', color: 'var(--muted)', fontSize: 12, cursor: 'pointer' }}
                        >
                            &#x2715;
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
