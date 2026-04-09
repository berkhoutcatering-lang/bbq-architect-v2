/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { parseActions, executeAction } from '@/lib/ai-actions';
import { Bot, Check, Flame, Folder, FolderTree, HelpCircle, Loader2, Menu, MessageSquare, PanelLeft, Plus, Save, Send, Trash2, User, X, Zap } from 'lucide-react';

const BRAINSTORM_SUGGESTIONS = [
    'Bedenk 5 thema-BBQ concepten voor de zomer',
    'Welke trendy menu-items kan ik toevoegen?',
    'Ideeën voor een vegetarisch BBQ-menu',
    'Hoe kan ik mijn catering onderscheiden?',
    'Brainstorm over een winter-event concept',
    'Marketingtips voor BBQ-catering',
];

const QA_SUGGESTIONS = [
    'Hoeveel kilo vlees voor 100 gasten?',
    'Wat is een goede marge voor catering?',
    'Hoe maak ik een perfecte dry rub?',
    'Tips voor efficiënte mise en place',
    'Wat moet ik meenemen in de bus?',
    'Hoe bereken ik mijn uurtarief?',
    'HACCP-kerntemperaturen vlees',
    'Hoeveel voorloopdagen voor een event?',
];

interface ChatMsg {
    role: string;
    content: string;
    actions: any[];
}

interface Folder {
    id: number;
    naam: string;
    kleur: string;
    created_at?: string;
}

interface Conversation {
    id: number;
    folder_id: number | null;
    titel: string;
    modus: string;
    messages?: any[];
    created_at: string;
    updated_at: string;
}

export default function AiStudioPage() {
    const [mode, setMode] = useState('brainstorm');
    const [messages, setMessages] = useState<ChatMsg[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [sidebarOpen, setSidebarOpen] = useState(true);

    const [folders, setFolders] = useState<Folder[]>([]);
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
    const [activeFolder, setActiveFolder] = useState<number | null>(null);
    const [loadingFolders, setLoadingFolders] = useState(true);

    const [showNewFolder, setShowNewFolder] = useState(false);
    const [newFolderName, setNewFolderName] = useState('');
    const [newFolderColor, setNewFolderColor] = useState('#FFBF00');

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    const FOLDER_COLORS = ['#FFBF00', '#22c55e', '#3b82f6', '#a78bfa', '#ef4444', '#f59e0b', '#4ECDC4', '#ec4899'];

    useEffect(function () {
        setMessages([{
            role: 'assistant',
            content: mode === 'brainstorm'
                ? '🔥 **Brainstorm Modus actief!**\n\nWelkom in de AI Studio van Hop & Bites. Hier denk ik creatief met je mee over menu\'s, events, marketing en alles wat BBQ-catering groot maakt.\n\nWaar wil je over brainstormen?'
                : '💡 **Vraag & Antwoord Modus**\n\nStel me directe vragen over catering, BBQ-technieken, calculaties, planning of bedrijfsvoering. Ik geef concrete, praktische antwoorden.\n\nWat wil je weten?',
            actions: [],
        }]);
    }, [mode]);

    useEffect(function () {
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages]);

    const loadFoldersAndConversations = useCallback(async function () {
        if (!supabase) { setLoadingFolders(false); return; }
        setLoadingFolders(true);
        try {
            const fRes = await supabase.from('ai_conversation_folders').select('*').order('id');
            const cRes = await supabase.from('ai_conversations').select('id,folder_id,titel,modus,created_at,updated_at').order('updated_at', { ascending: false });
            setFolders(fRes.data || []);
            setConversations(cRes.data || []);
        } catch (e: any) {
            // load error handled silently
        } finally {
            setLoadingFolders(false);
        }
    }, []);

    useEffect(function () { loadFoldersAndConversations(); }, [loadFoldersAndConversations]);

    async function loadConversation(conv: Conversation) {
        if (!supabase) return;
        try {
            const res = await supabase.from('ai_conversations').select('*').eq('id', conv.id).single();
            if (res.data && res.data.messages) {
                setActiveConversation(res.data);
                setMessages(res.data.messages.map(function (m: any) {
                    return Object.assign({ actions: [] }, m);
                }));
                setMode(res.data.modus || 'brainstorm');
            }
        } catch (e: any) {
            // load error handled silently
        }
    }

    async function saveConversation(folderId: number | null, titel: string | null) {
        if (!supabase || messages.length < 2) return null;
        const msgToSave = messages.map(function (m) {
            return { role: m.role, content: m.content };
        });
        try {
            const res = await supabase.from('ai_conversations').insert({
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
        } catch (e: any) {
            // save error handled silently
        }
        return null;
    }

    async function updateConversation() {
        if (!supabase || !activeConversation) return;
        const msgToSave = messages.map(function (m) {
            return { role: m.role, content: m.content };
        });
        try {
            await supabase.from('ai_conversations').update({
                messages: msgToSave,
                updated_at: new Date().toISOString(),
            }).eq('id', activeConversation.id);
        } catch (e: any) {
            // update error handled silently
        }
    }

    async function createFolder() {
        if (!newFolderName.trim() || !supabase) return;
        try {
            const res = await supabase.from('ai_conversation_folders').insert({
                naam: newFolderName.trim(),
                kleur: newFolderColor,
            }).select().single();
            if (res.data) {
                setFolders(function (prev) { return [...prev, res.data]; });
                setNewFolderName('');
                setShowNewFolder(false);
            }
        } catch (e: any) {
            // folder create error handled silently
        }
    }

    async function deleteFolder(folderId: number) {
        if (!supabase || !window.confirm('Map verwijderen? Gesprekken in deze map blijven behouden.')) return;
        try {
            await supabase.from('ai_conversation_folders').delete().eq('id', folderId);
            setFolders(function (prev) { return prev.filter(function (f) { return f.id !== folderId; }); });
            if (activeFolder === folderId) setActiveFolder(null);
        } catch (e: any) {
            // folder delete error handled silently
        }
    }

    async function deleteConversation(convId: number) {
        if (!supabase || !window.confirm('Dit gesprek definitief verwijderen?')) return;
        try {
            await supabase.from('ai_conversations').delete().eq('id', convId);
            setConversations(function (prev) { return prev.filter(function (c) { return c.id !== convId; }); });
            if (activeConversation && activeConversation.id === convId) {
                setActiveConversation(null);
                startNewConversation();
            }
        } catch (e: any) {
            // conversation delete error handled silently
        }
    }

    function startNewConversation() {
        setActiveConversation(null);
        setMessages([{
            role: 'assistant',
            content: mode === 'brainstorm'
                ? '🔥 **Nieuw brainstorm gesprek**\n\nWaar wil je over brainstormen?'
                : '💡 **Nieuw Q&A gesprek**\n\nWat wil je weten?',
            actions: [],
        }]);
    }

    async function sendMessage(e?: React.FormEvent | null, overrideText?: string) {
        if (e) e.preventDefault();
        const text = (overrideText || input).trim();
        if (!text || isLoading) return;
        setInput('');

        const userMsg: ChatMsg = { role: 'user', content: text, actions: [] };
        const apiMessages = [...messages.map(function (m) { return { role: m.role, content: m.content }; }), { role: 'user', content: text }];
        setMessages(function (prev) { return [...prev, userMsg]; });
        setIsLoading(true);

        let ctxData: any = null;
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
            const res = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: apiMessages,
                    pageContext: '/ai-chat',
                    mode: mode === 'brainstorm' ? 'brainstorm' : 'qa',
                    contextData: ctxData,
                }),
            });

            if (!res.ok) {
                var errBody = await res.text();
                try { errBody = JSON.parse(errBody).error || errBody; } catch (_e) { /* plain text */ }
                throw new Error(errBody || 'Fout opgetreden');
            }

            // Stream SSE response
            var rawReply = '';
            var reader = res.body!.getReader();
            var decoder = new TextDecoder();
            var streamBuffer = '';

            // Add placeholder assistant message for streaming
            var streamMsgIdx = messages.length + 1; // +1 because user msg was already added
            setMessages(function (prev) { return [...prev, { role: 'assistant' as const, content: '', actions: [] }]; });

            while (true) {
                var chunk = await reader.read();
                if (chunk.done) break;
                streamBuffer += decoder.decode(chunk.value, { stream: true });
                var sseLines = streamBuffer.split('\n');
                streamBuffer = sseLines.pop()!;
                for (var si = 0; si < sseLines.length; si++) {
                    var sseLine = sseLines[si].trim();
                    if (!sseLine.startsWith('data: ')) continue;
                    var sseRaw = sseLine.slice(6);
                    try {
                        var sseData = JSON.parse(sseRaw);
                        if (sseData.delta) {
                            rawReply += sseData.delta;
                            var streamParsed = parseActions(rawReply);
                            setMessages(function (prev) {
                                return prev.map(function (m, i) {
                                    if (i !== streamMsgIdx) return m;
                                    return { role: 'assistant' as const, content: streamParsed.cleanText, actions: streamParsed.actions };
                                });
                            });
                        }
                        if (sseData.done && sseData.full) {
                            rawReply = sseData.full;
                        }
                    } catch (_e) { /* invalid chunk */ }
                }
            }

            // Final parse with complete text
            var finalParsed = parseActions(rawReply);
            setMessages(function (prev) {
                return prev.map(function (m, i) {
                    if (i !== streamMsgIdx) return m;
                    return { role: 'assistant' as const, content: finalParsed.cleanText, actions: finalParsed.actions };
                });
            });

        } catch (error: any) {
            setMessages(function (prev) {
                return [...prev, { role: 'assistant', content: '❌ ' + error.message, actions: [] }];
            });
        } finally {
            setIsLoading(false);
            if (activeConversation) {
                setTimeout(updateConversation, 300);
            }
        }
    }

    async function approveAction(msgIdx: number, actionId: string) {
        const msg = messages[msgIdx];
        const action = msg && msg.actions && msg.actions.find(function (a: any) { return a.id === actionId; });
        if (!action) return;

        setMessages(function (prev) {
            return prev.map(function (m, i) {
                if (i !== msgIdx) return m;
                return Object.assign({}, m, {
                    actions: m.actions.map(function (a: any) {
                        return a.id === actionId ? Object.assign({}, a, { status: 'executing' }) : a;
                    }),
                });
            });
        });

        try {
            if (action.type === 'save_conversation') {
                const saved = await saveConversation(
                    action.data.folder_id || null,
                    action.data.titel || null
                );
                setMessages(function (prev) {
                    return prev.map(function (m, i) {
                        if (i !== msgIdx) return m;
                        return Object.assign({}, m, {
                            actions: m.actions.map(function (a: any) {
                                return a.id === actionId ? Object.assign({}, a, { status: 'done' }) : a;
                            }),
                        });
                    });
                });
                setMessages(function (prev) {
                    return [...prev, {
                        role: 'assistant',
                        content: '✅ Gesprek opgeslagen' + (saved ? ' (ID: ' + saved.id + ')' : '') + '!',
                        actions: [],
                    }];
                });
                await loadFoldersAndConversations();
                return;
            }

            if (action.type === 'create_folder') {
                const fRes = await supabase.from('ai_conversation_folders').insert({
                    naam: action.data.naam,
                    kleur: action.data.kleur || '#FFBF00',
                }).select().single();
                if (fRes.data) {
                    setFolders(function (prev) { return [...prev, fRes.data]; });
                    setMessages(function (prev) {
                        return prev.map(function (m, i) {
                            if (i !== msgIdx) return m;
                            return Object.assign({}, m, {
                                actions: m.actions.map(function (a: any) {
                                    return a.id === actionId ? Object.assign({}, a, { status: 'done' }) : a;
                                }),
                            });
                        });
                    });
                    setMessages(function (prev) {
                        return [...prev, {
                            role: 'assistant',
                            content: '✅ Map **' + action.data.naam + '** aangemaakt!',
                            actions: [],
                        }];
                    });
                }
                return;
            }

            const result = await executeAction(action, supabase);
            setMessages(function (prev) {
                return prev.map(function (m, i) {
                    if (i !== msgIdx) return m;
                    return Object.assign({}, m, {
                        actions: m.actions.map(function (a: any) {
                            return a.id === actionId ? Object.assign({}, a, { status: 'done', result: result }) : a;
                        }),
                    });
                });
            });
            setMessages(function (prev) {
                return [...prev, {
                    role: 'assistant',
                    content: '✅ **' + action.meta.label + '** is uitgevoerd!',
                    actions: [],
                }];
            });

        } catch (err: any) {
            setMessages(function (prev) {
                return prev.map(function (m, i) {
                    if (i !== msgIdx) return m;
                    return Object.assign({}, m, {
                        actions: m.actions.map(function (a: any) {
                            return a.id === actionId ? Object.assign({}, a, { status: 'error', error: err.message }) : a;
                        }),
                    });
                });
            });
            setMessages(function (prev) {
                return [...prev, { role: 'assistant', content: '❌ Mislukt: ' + err.message, actions: [] }];
            });
        }
    }

    function rejectAction(msgIdx: number, actionId: string) {
        setMessages(function (prev) {
            return prev.map(function (m, i) {
                if (i !== msgIdx) return m;
                return Object.assign({}, m, {
                    actions: m.actions.map(function (a: any) {
                        return a.id === actionId ? Object.assign({}, a, { status: 'rejected' }) : a;
                    }),
                });
            });
        });
        setMessages(function (prev) {
            return [...prev, { role: 'assistant', content: 'Begrepen, ik sla het niet op.', actions: [] }];
        });
    }

    function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    }

    function renderInline(text: string) {
        // Bold, italic, inline code
        var parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g);
        return parts.map(function (part: string, j: number) {
            if (part.startsWith('**') && part.endsWith('**')) {
                return <strong key={j}>{part.slice(2, -2)}</strong>;
            }
            if (part.startsWith('`') && part.endsWith('`')) {
                return <code key={j} style={{ background: 'rgba(255,191,0,.1)', padding: '1px 5px', borderRadius: 4, fontSize: '0.9em', fontFamily: 'monospace' }}>{part.slice(1, -1)}</code>;
            }
            if (part.startsWith('*') && part.endsWith('*') && !part.startsWith('**')) {
                return <em key={j}>{part.slice(1, -1)}</em>;
            }
            return part;
        });
    }

    function renderText(content: string) {
        if (!content) return null;
        var lines = content.split('\n');
        var elements: React.ReactNode[] = [];
        var listBuffer: { type: 'ul' | 'ol'; items: string[] } | null = null;

        function flushList() {
            if (!listBuffer) return;
            var Tag = listBuffer.type;
            var items = listBuffer.items;
            elements.push(
                <Tag key={'list-' + elements.length} style={{ margin: '6px 0', paddingLeft: 20, lineHeight: 1.7 }}>
                    {items.map(function (item, idx) { return <li key={idx}>{renderInline(item)}</li>; })}
                </Tag>
            );
            listBuffer = null;
        }

        for (var i = 0; i < lines.length; i++) {
            var line = lines[i];
            var trimmed = line.trim();

            // Headings
            if (trimmed.startsWith('#### ')) {
                flushList();
                elements.push(<h5 key={i} style={{ fontSize: 13, fontWeight: 800, margin: '14px 0 4px', color: 'var(--text)' }}>{renderInline(trimmed.slice(5))}</h5>);
                continue;
            }
            if (trimmed.startsWith('### ')) {
                flushList();
                elements.push(<h4 key={i} style={{ fontSize: 14, fontWeight: 800, margin: '16px 0 6px', color: 'var(--text)' }}>{renderInline(trimmed.slice(4))}</h4>);
                continue;
            }
            if (trimmed.startsWith('## ')) {
                flushList();
                elements.push(<h3 key={i} style={{ fontSize: 15, fontWeight: 900, margin: '18px 0 6px', color: 'var(--text)' }}>{renderInline(trimmed.slice(3))}</h3>);
                continue;
            }

            // Unordered list
            if (/^[-*]\s/.test(trimmed)) {
                var itemText = trimmed.replace(/^[-*]\s+/, '');
                if (!listBuffer || listBuffer.type !== 'ul') {
                    flushList();
                    listBuffer = { type: 'ul', items: [] };
                }
                listBuffer.items.push(itemText);
                continue;
            }

            // Ordered list
            if (/^\d+\.\s/.test(trimmed)) {
                var olText = trimmed.replace(/^\d+\.\s+/, '');
                if (!listBuffer || listBuffer.type !== 'ol') {
                    flushList();
                    listBuffer = { type: 'ol', items: [] };
                }
                listBuffer.items.push(olText);
                continue;
            }

            // Horizontal rule
            if (/^-{3,}$/.test(trimmed) || /^\*{3,}$/.test(trimmed)) {
                flushList();
                elements.push(<hr key={i} style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '12px 0' }} />);
                continue;
            }

            // Empty line
            if (!trimmed) {
                flushList();
                elements.push(<span key={i} style={{ display: 'block', height: 6 }}>{'\u00A0'}</span>);
                continue;
            }

            // Regular paragraph
            flushList();
            elements.push(<span key={i} style={{ display: 'block', lineHeight: 1.7 }}>{renderInline(trimmed)}</span>);
        }
        flushList();
        return elements;
    }

    function renderActionCard(action: any, msgIdx: number) {
        const isPending = action.status === 'pending';
        const isExecuting = action.status === 'executing';
        const isDone = action.status === 'done';
        const isRejected = action.status === 'rejected';
        const isError = action.status === 'error';

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
                    <Zap size={15} style={{ color: isDone ? '#22c55e' : isRejected ? '#71717a' : (action.meta.color || '#FFBF00') }} />
                    <span style={{ fontWeight: 700, fontSize: 13 }}>{action.meta.label}</span>
                    {isDone && <span style={{ marginLeft: 'auto', color: '#22c55e', fontSize: 12, fontWeight: 600 }}>✓ Uitgevoerd</span>}
                    {isRejected && <span style={{ marginLeft: 'auto', color: '#71717a', fontSize: 12 }}>Afgewezen</span>}
                    {isError && <span style={{ marginLeft: 'auto', color: '#ef4444', fontSize: 12 }}>Fout</span>}
                </div>
                <div style={{ color: 'var(--muted)', fontSize: 13, marginBottom: isPending ? 10 : 0, lineHeight: 1.5 }}>{action.description}</div>
                {action.data && Object.keys(action.data).length > 0 && (action.type !== 'save_conversation') && (
                    <div style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--muted)', background: 'rgba(0,0,0,.3)', padding: '6px 8px', borderRadius: 7, marginBottom: isPending ? 10 : 0 }}>
                        {JSON.stringify(action.data, null, 2).slice(0, 300)}
                    </div>
                )}
                {isPending && (
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button
                            onClick={function () { approveAction(msgIdx, action.id); }}
                            style={{ flex: 1, padding: '8px 0', borderRadius: 8, border: 'none', background: '#22c55e', color: '#000', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
                        >
                            <Check size={14} className="mr-1.5" />Goedkeuren & uitvoeren
                        </button>
                        <button
                            onClick={function () { rejectAction(msgIdx, action.id); }}
                            style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--muted)', fontSize: 13, cursor: 'pointer' }}
                        >
                            <X size={14} />
                        </button>
                    </div>
                )}
                {isExecuting && (
                    <div style={{ color: '#FFBF00', fontSize: 13 }}>
                        <Loader2 size={14} className="animate-spin mr-1.5" />Bezig met uitvoeren…
                    </div>
                )}
                {isError && action.error && (
                    <div style={{ color: '#ef4444', fontSize: 12, marginTop: 6 }}>{action.error}</div>
                )}
            </div>
        );
    }

    const visibleConversations = activeFolder
        ? conversations.filter(function (c) { return c.folder_id === activeFolder; })
        : conversations;

    const suggestions = mode === 'brainstorm' ? BRAINSTORM_SUGGESTIONS : QA_SUGGESTIONS;

    return (
        <div className="ai-studio-layout">
            <div className={'ai-studio-sidebar' + (sidebarOpen ? ' open' : '')}>
                <div className="ai-sidebar-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <FolderTree size={14} style={{ color: 'var(--brand)' }} />
                        <span style={{ fontWeight: 700, fontSize: 13 }}>Gespreksmappen</span>
                    </div>
                    <button
                        onClick={function () { setShowNewFolder(function (v) { return !v; }); }}
                        style={{ background: 'rgba(255,191,0,.15)', border: 'none', color: 'var(--brand)', width: 26, height: 26, borderRadius: 6, cursor: 'pointer', fontSize: 13 }}
                        title="Nieuwe map"
                    >
                        <Plus size={14} />
                    </button>
                </div>

                {showNewFolder && (
                    <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', background: 'rgba(255,191,0,.04)' }}>
                        <input
                            value={newFolderName}
                            onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setNewFolderName(e.target.value); }}
                            placeholder="Mapnaam…"
                            aria-label="Mapnaam"
                            style={{ width: '100%', background: 'var(--card-solid)', border: '1px solid var(--border)', color: 'var(--text)', padding: '5px 8px', borderRadius: 6, fontSize: 12, marginBottom: 6 }}
                            onKeyDown={function (e: React.KeyboardEvent<HTMLInputElement>) { if (e.key === 'Enter') createFolder(); }}
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
                            <button onClick={createFolder} style={{ flex: 1, padding: '6px 12px', borderRadius: 6, border: 'none', background: 'var(--brand)', color: '#000', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>Aanmaken</button>
                            <button onClick={function () { setShowNewFolder(false); setNewFolderName(''); }} style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--muted)', fontSize: 12, cursor: 'pointer' }}>Annuleer</button>
                        </div>
                    </div>
                )}

                <button
                    onClick={startNewConversation}
                    className="ai-new-conv-btn"
                >
                    <Plus size={14} /> Nieuw gesprek
                </button>

                <div
                    className={'ai-folder-item' + (!activeFolder ? ' active' : '')}
                    onClick={function () { setActiveFolder(null); }}
                >
                    <MessageSquare size={13} style={{ color: 'var(--muted)' }} />
                    <span>Alle gesprekken</span>
                    <span className="ai-folder-count">{conversations.length}</span>
                </div>

                {loadingFolders ? (
                    <div style={{ padding: '8px 12px', color: 'var(--muted)', fontSize: 12 }}>Laden…</div>
                ) : (
                    folders.map(function (folder) {
                        const count = conversations.filter(function (c) { return c.folder_id === folder.id; }).length;
                        return (
                            <div key={folder.id} className={'ai-folder-item' + (activeFolder === folder.id ? ' active' : '')}>
                                <div
                                    style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
                                    onClick={function () { setActiveFolder(folder.id === activeFolder ? null : folder.id); }}
                                >
                                    <Folder size={13} />
                                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{folder.naam}</span>
                                    <span className="ai-folder-count">{count}</span>
                                </div>
                                <button
                                    onClick={function (e: React.MouseEvent) { e.stopPropagation(); deleteFolder(folder.id); }}
                                    style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: '4px 8px', fontSize: 12, opacity: 0, transition: 'opacity .15s' }}
                                    className="ai-folder-delete"
                                    title="Map verwijderen"
                                >
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        );
                    })
                )}

                <div className="ai-conv-list">
                    {visibleConversations.length === 0 && !loadingFolders && (
                        <div style={{ padding: '12px', color: 'var(--muted)', fontSize: 12, textAlign: 'center' }}>
                            Nog geen gesprekken opgeslagen
                        </div>
                    )}
                    {visibleConversations.map(function (conv) {
                        const isActive = activeConversation && activeConversation.id === conv.id;
                        return (
                            <div
                                key={conv.id}
                                className={'ai-conv-item' + (isActive ? ' active' : '')}
                            >
                                <div style={{ flex: 1, cursor: 'pointer', overflow: 'hidden' }} onClick={function () { loadConversation(conv); }}>
                                    <div style={{ fontSize: 12, fontWeight: isActive ? 700 : 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{conv.titel}</div>
                                    <div style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', gap: 6, alignItems: 'center', marginTop: 2 }}>
                                        <span style={{ background: conv.modus === 'brainstorm' ? 'rgba(255,191,0,.2)' : 'rgba(59,130,246,.2)', color: conv.modus === 'brainstorm' ? '#FFBF00' : '#3b82f6', padding: '4px 8px', borderRadius: 4, fontSize: 12, fontWeight: 700 }}>
                                            {conv.modus === 'brainstorm' ? 'Brainstorm' : 'Q&A'}
                                        </span>
                                        {new Date(conv.updated_at || conv.created_at).toLocaleDateString('nl-NL')}
                                    </div>
                                </div>
                                <button
                                    onClick={function (e: React.MouseEvent) { e.stopPropagation(); deleteConversation(conv.id); }}
                                    style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: '4px 8px', fontSize: 12, opacity: 0, transition: 'opacity .15s' }}
                                    className="ai-conv-delete"
                                >
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        );
                    })}
                </div>
            </div>

            <div className="ai-studio-main">
                <div className="ai-studio-topbar">
                    <button
                        onClick={function () { setSidebarOpen(function (v) { return !v; }); }}
                        style={{ background: 'rgba(255,255,255,.06)', border: 'none', color: 'var(--text)', width: 32, height: 32, borderRadius: 8, cursor: 'pointer', fontSize: 14 }}
                        title="Sidebar toggling"
                    >
                        {sidebarOpen ? <PanelLeft size={14} /> : <Menu size={14} />}
                    </button>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--brand)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#000', fontSize: 16 }}>
                            <Bot size={14} />
                        </div>
                        <div>
                            <div style={{ fontWeight: 800, fontSize: 15 }}>BBQ AI Studio</div>
                            <div style={{ fontSize: 12, color: 'var(--muted)' }}>Hop & Bites — Powered by Groq</div>
                        </div>
                    </div>

                    <div className="ai-mode-tabs">
                        <button
                            onClick={function () { setMode('brainstorm'); }}
                            className={'ai-mode-tab' + (mode === 'brainstorm' ? ' active' : '')}
                        >
                            <Flame size={14} className="mr-1.5" />Brainstorm
                        </button>
                        <button
                            onClick={function () { setMode('qa'); }}
                            className={'ai-mode-tab' + (mode === 'qa' ? ' active' : '')}
                        >
                            <HelpCircle size={14} className="mr-1.5" />Vragen
                        </button>
                    </div>

                    <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                        {messages.length > 2 && !activeConversation && (
                            <div className="ai-save-dropdown">
                                <SaveButton
                                    folders={folders}
                                    onSave={saveConversation}
                                    onRefresh={loadFoldersAndConversations}
                                />
                            </div>
                        )}
                        {activeConversation && (
                            <div style={{ fontSize: 12, color: '#22c55e', display: 'flex', alignItems: 'center', gap: 4 }}>
                                <Save size={14} />
                                {activeConversation.titel}
                            </div>
                        )}
                    </div>
                </div>

                <div className="ai-studio-messages">
                    {messages.map(function (msg, idx) {
                        const isUser = msg.role === 'user';
                        return (
                            <div key={idx}>
                                <div className={'ai-studio-msg-row' + (isUser ? ' user' : '')}>
                                    {!isUser && (
                                        <div className="ai-studio-avatar">
                                            <Bot size={14} />
                                        </div>
                                    )}
                                    <div className={'ai-studio-bubble' + (isUser ? ' user' : '')}>
                                        {renderText(msg.content)}
                                    </div>
                                    {isUser && (
                                        <div className="ai-studio-user-avatar">
                                            <User size={14} />
                                        </div>
                                    )}
                                </div>
                                {!isUser && msg.actions && msg.actions.length > 0 && (
                                    <div style={{ paddingLeft: 50, maxWidth: 640 }}>
                                        {msg.actions.map(function (action: any) {
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
                                <Bot size={14} />
                            </div>
                            <div className="ai-studio-bubble loading-dots">
                                <span></span><span></span><span></span>
                            </div>
                        </div>
                    )}

                    {messages.length === 1 && !isLoading && (
                        <div style={{ maxWidth: 600, margin: '16px auto 0 50px' }}>
                            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>
                                {mode === 'brainstorm' ? '🔥 Brainstorm-starters:' : '💡 Veelgestelde vragen:'}
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

                <div className="ai-studio-input-area">
                    <form onSubmit={(e: React.FormEvent) => sendMessage(e)} style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
                        <textarea
                            ref={inputRef}
                            value={input}
                            onChange={function (e: React.ChangeEvent<HTMLTextAreaElement>) { setInput(e.target.value); }}
                            onKeyDown={handleKey}
                            placeholder={mode === 'brainstorm' ? 'Waar wil je over brainstormen? (Enter = versturen)' : 'Stel een vraag… (Enter = versturen)'}
                            aria-label="Bericht invoeren"
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
                            <Send size={14} />
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}

function SaveButton({ folders, onSave, onRefresh }: { folders: Folder[]; onSave: (folderId: number | null, titel: string | null) => Promise<any>; onRefresh: () => Promise<void> }) {
    const [open, setOpen] = useState(false);
    const [titel, setTitel] = useState('');
    const [folderId, setFolderId] = useState<number | null>(null);
    const [saving, setSaving] = useState(false);

    async function doSave() {
        if (!titel.trim()) return;
        setSaving(true);
        try {
            await onSave(folderId, titel.trim());
            await onRefresh();
            setOpen(false);
            setTitel('');
        } catch (e: any) {
            // save error handled silently
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
                <Save size={14} className="mr-1.5" />Opslaan
            </button>
            {open && (
                <div style={{ position: 'absolute', right: 0, top: '110%', width: 240, background: 'var(--card-solid)', border: '1px solid var(--border)', borderRadius: 10, padding: 12, zIndex: 100, boxShadow: '0 8px 24px rgba(0,0,0,.5)' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8, color: 'var(--text)' }}>Gesprek opslaan</div>
                    <input
                        value={titel}
                        onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setTitel(e.target.value); }}
                        placeholder="Geef een titel…"
                        aria-label="Gesprekstitel"
                        style={{ width: '100%', background: 'rgba(255,255,255,.05)', border: '1px solid var(--border)', color: 'var(--text)', padding: '5px 8px', borderRadius: 6, fontSize: 12, marginBottom: 8 }}
                        onKeyDown={function (e: React.KeyboardEvent<HTMLInputElement>) { if (e.key === 'Enter') doSave(); }}
                        autoFocus
                    />
                    <select
                        value={folderId || ''}
                        onChange={function (e: React.ChangeEvent<HTMLSelectElement>) { setFolderId(e.target.value ? parseInt(e.target.value) : null); }}
                        aria-label="Map selecteren"
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
                            {saving ? 'Opslaan…' : 'Opslaan'}
                        </button>
                        <button
                            onClick={function () { setOpen(false); }}
                            style={{ padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'transparent', color: 'var(--muted)', fontSize: 12, cursor: 'pointer' }}
                        >
                            ✕
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
