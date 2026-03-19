'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

// ── Formateer AI-tekst ──────────────────────────────────────────────────────
function renderText(text) {
    if (!text) return null;
    return text.split('\n').map(function (line, i) {
        var rendered = [];
        var remaining = line;
        var key = 0;
        while (remaining.includes('**')) {
            var start = remaining.indexOf('**');
            var end = remaining.indexOf('**', start + 2);
            if (end === -1) break;
            if (start > 0) rendered.push(<span key={key++}>{remaining.slice(0, start)}</span>);
            rendered.push(<strong key={key++}>{remaining.slice(start + 2, end)}</strong>);
            remaining = remaining.slice(end + 2);
        }
        if (remaining) rendered.push(<span key={key++}>{remaining}</span>);
        return (
            <span key={i} style={{ display: 'block', marginBottom: 1 }}>
                {rendered.length ? rendered : '\u00A0'}
            </span>
        );
    });
}

var BRAINSTORM_CHIPS = [
    '20 gerechten met buikspek',
    'Thema-BBQ: Japans', 'Zomermenu 2025',
    'Hoe onderscheid ik me van concurrenten?',
    'Top 10 BBQ trends 2025',
];

var QA_CHIPS = [
    'Kerntemperatuur brisket?', 'Hoeveel vlees per persoon?',
    'Verschil rub vs marinade', 'Low & slow temperatuur instelling',
    'Wat kost een gemiddeld BBQ-event?',
];

export default function AiChat() {
    // ── AI Studio state ───────────────────────────────────────────────────────
    var [mode, setMode] = useState('brainstorm'); // 'brainstorm' | 'qa'
    var [messages, setMessages] = useState([
        {
            role: 'assistant',
            content: '🔥 **Welkom in de AI Studio!**\n\nHier kun je ongestoord brainstormen en alles vragen. Ik heb toegang tot je hele systeem.\n\nWat wil je ontdekken, chef?'
        }
    ]);
    var [input, setInput] = useState('');
    var [isLoading, setIsLoading] = useState(false);

    // ── Sidebar / gesprekken state ─────────────────────────────────────────
    var [sidebarOpen, setSidebarOpen] = useState(true);
    var [folders, setFolders] = useState([]);
    var [conversations, setConversations] = useState([]);
    var [activeConvId, setActiveConvId] = useState(null);
    var [activeFolder, setActiveFolder] = useState(null);
    var [savingAs, setSavingAs] = useState(false); // toon save-formulier
    var [saveForm, setSaveForm] = useState({ titel: '', folder_id: '' });
    var [newFolderForm, setNewFolderForm] = useState({ show: false, naam: '', kleur: '#FFBF00' });
    var [loadingConvs, setLoadingConvs] = useState(false);

    var messagesEndRef = useRef(null);
    var inputRef = useRef(null);

    // ── Data laden ────────────────────────────────────────────────────────
    useEffect(function () { loadFolders(); loadConversations(); }, []);

    useEffect(function () {
        setTimeout(function () { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, 50);
    }, [messages]);

    async function loadFolders() {
        var { data } = await supabase.from('ai_conversation_folders').select('*').order('created_at', { ascending: false });
        if (data) setFolders(data);
    }

    async function loadConversations(folderId) {
        setLoadingConvs(true);
        var query = supabase.from('ai_conversations').select('id,titel,modus,updated_at,folder_id').order('updated_at', { ascending: false }).limit(50);
        if (folderId) query = query.eq('folder_id', folderId);
        var { data } = await query;
        if (data) setConversations(data);
        setLoadingConvs(false);
    }

    async function loadConversation(conv) {
        var { data } = await supabase.from('ai_conversations').select('messages,modus').eq('id', conv.id).single();
        if (data) {
            setMessages(data.messages || []);
            setMode(data.modus || 'brainstorm');
            setActiveConvId(conv.id);
        }
    }

    async function createFolder() {
        if (!newFolderForm.naam.trim()) return;
        var { data, error } = await supabase.from('ai_conversation_folders').insert([{
            naam: newFolderForm.naam.trim(),
            kleur: newFolderForm.kleur
        }]).select().single();
        if (data) {
            setFolders(function (prev) { return [data, ...prev]; });
            setNewFolderForm({ show: false, naam: '', kleur: '#FFBF00' });
        }
    }

    async function deleteFolder(id) {
        if (!window.confirm('Map verwijderen? Gesprekken blijven bestaan.')) return;
        await supabase.from('ai_conversation_folders').delete().eq('id', id);
        setFolders(function (prev) { return prev.filter(function (f) { return f.id !== id; }); });
        if (activeFolder === id) { setActiveFolder(null); loadConversations(); }
    }

    async function saveConversation() {
        if (!saveForm.titel.trim()) return;
        var payload = {
            titel: saveForm.titel.trim(),
            modus: mode,
            messages: messages,
            folder_id: saveForm.folder_id ? Number(saveForm.folder_id) : null,
            updated_at: new Date().toISOString()
        };
        if (activeConvId) {
            await supabase.from('ai_conversations').update(payload).eq('id', activeConvId);
        } else {
            var { data } = await supabase.from('ai_conversations').insert([payload]).select().single();
            if (data) setActiveConvId(data.id);
        }
        setSavingAs(false);
        setSaveForm({ titel: '', folder_id: '' });
        loadConversations(activeFolder);
    }

    async function deleteConversation(id) {
        if (!window.confirm('Gesprek verwijderen?')) return;
        await supabase.from('ai_conversations').delete().eq('id', id);
        setConversations(function (prev) { return prev.filter(function (c) { return c.id !== id; }); });
        if (activeConvId === id) { newConversation(); }
    }

    function newConversation() {
        setActiveConvId(null);
        setMessages([{
            role: 'assistant',
            content: mode === 'brainstorm'
                ? '🔥 Nieuw brainstorm-gesprek. Waar gaan we vandaag mee aan de slag, chef?'
                : '💡 Nieuw Q&A gesprek. Stel je vraag!'
        }]);
    }

    // ── Bericht sturen ────────────────────────────────────────────────────
    var sendMessage = useCallback(async function (e, overrideText) {
        if (e) e.preventDefault();
        var text = (overrideText || input).trim();
        if (!text || isLoading) return;
        setInput('');

        var userMsg = { role: 'user', content: text };
        var nextMessages = [...messages, userMsg];
        setMessages(nextMessages);
        setIsLoading(true);

        try {
            var apiMessages = nextMessages.map(function (m) {
                return { role: m.role, content: m.content || '' };
            });

            var res = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: apiMessages,
                    pathname: '/ai-chat',
                    mode: mode,
                }),
            });

            var data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Fout bij AI');

            var content = data.choices && data.choices[0] && data.choices[0].message.content || '';
            var finalMessages = [...nextMessages, { role: 'assistant', content: content }];
            setMessages(finalMessages);

            // Auto-save als actief gesprek
            if (activeConvId) {
                await supabase.from('ai_conversations').update({
                    messages: finalMessages,
                    updated_at: new Date().toISOString()
                }).eq('id', activeConvId);
            }

        } catch (err) {
            setMessages(function (prev) { return [...prev, { role: 'assistant', content: '❌ ' + err.message }]; });
        } finally {
            setIsLoading(false);
            setTimeout(function () { inputRef.current?.focus(); }, 50);
        }
    }, [input, isLoading, messages, mode, activeConvId]);

    var chips = mode === 'brainstorm' ? BRAINSTORM_CHIPS : QA_CHIPS;

    var filteredConvs = activeFolder
        ? conversations.filter(function (c) { return c.folder_id === activeFolder; })
        : conversations;

    return (
        <div className="main-area" style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>

            {/* ── Sidebar ─────────────────────────────────────────────────── */}
            <div className={'ai-studio-sidebar' + (sidebarOpen ? ' open' : '')}>
                {/* Nieuw gesprek */}
                <button
                    className="ai-new-conv-btn"
                    onClick={newConversation}
                    title="Nieuw gesprek"
                >
                    <i className="fa-solid fa-plus" /> Nieuw gesprek
                </button>

                {/* Folder header */}
                <div className="ai-sidebar-header">
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1 }}>Mappen</span>
                    <button
                        onClick={function () { setNewFolderForm(function (prev) { return Object.assign({}, prev, { show: !prev.show }); }); }}
                        style={{ background: 'none', border: 'none', color: 'var(--brand)', cursor: 'pointer', fontSize: 14 }}
                        title="Nieuwe map"
                    >
                        <i className="fa-solid fa-folder-plus" />
                    </button>
                </div>

                {/* Nieuwe map form */}
                {newFolderForm.show && (
                    <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', background: 'rgba(255,255,255,.03)' }}>
                        <input
                            value={newFolderForm.naam}
                            onChange={function (e) { setNewFolderForm(function (p) { return Object.assign({}, p, { naam: e.target.value }); }); }}
                            onKeyDown={function (e) { if (e.key === 'Enter') createFolder(); }}
                            placeholder="Map naam..."
                            autoFocus
                            style={{ width: '100%', background: 'rgba(255,255,255,.06)', border: '1px solid var(--border)', color: 'var(--text)', padding: '5px 8px', borderRadius: 6, fontSize: 12, marginBottom: 6 }}
                        />
                        <div style={{ display: 'flex', gap: 6 }}>
                            {['#FFBF00', '#4ade80', '#818cf8', '#fb923c', '#f472b6'].map(function (c) {
                                return (
                                    <button
                                        key={c}
                                        onClick={function () { setNewFolderForm(function (p) { return Object.assign({}, p, { kleur: c }); }); }}
                                        style={{ width: 18, height: 18, borderRadius: '50%', background: c, border: newFolderForm.kleur === c ? '2px solid #fff' : '2px solid transparent', cursor: 'pointer' }}
                                    />
                                );
                            })}
                            <button onClick={createFolder} style={{ marginLeft: 'auto', fontSize: 10, background: 'var(--brand)', color: '#000', border: 'none', padding: '2px 8px', borderRadius: 4, cursor: 'pointer', fontWeight: 700 }}>OK</button>
                        </div>
                    </div>
                )}

                {/* Alle gesprekken */}
                <div
                    className={'ai-folder-item' + (activeFolder === null ? ' active' : '')}
                    onClick={function () { setActiveFolder(null); loadConversations(null); }}
                >
                    <i className="fa-solid fa-clock" style={{ fontSize: 11 }} />
                    <span>Recente gesprekken</span>
                    <span className="ai-folder-count">{conversations.length}</span>
                </div>

                {/* Mappen */}
                {folders.map(function (folder) {
                    var count = conversations.filter(function (c) { return c.folder_id === folder.id; }).length;
                    return (
                        <div
                            key={folder.id}
                            className={'ai-folder-item' + (activeFolder === folder.id ? ' active' : '')}
                            onClick={function () { setActiveFolder(folder.id); loadConversations(folder.id); }}
                        >
                            <i className="fa-solid fa-folder" style={{ color: folder.kleur || 'var(--brand)', fontSize: 11 }} />
                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{folder.naam}</span>
                            <span className="ai-folder-count">{count}</span>
                            <button
                                className="ai-folder-delete"
                                onClick={function (e) { e.stopPropagation(); deleteFolder(folder.id); }}
                                style={{ opacity: 0, background: 'none', border: 'none', color: 'rgba(255,255,255,.4)', cursor: 'pointer', fontSize: 10, padding: '0 2px', transition: 'opacity .15s' }}
                                title="Map verwijderen"
                            >
                                ×
                            </button>
                        </div>
                    );
                })}

                {/* Gesprekken lijst */}
                <div className="ai-conv-list">
                    {loadingConvs && <div style={{ padding: '12px', fontSize: 11, color: 'var(--muted)', textAlign: 'center' }}>Laden...</div>}
                    {!loadingConvs && filteredConvs.length === 0 && (
                        <div style={{ padding: '16px 12px', fontSize: 11, color: 'var(--muted)', textAlign: 'center' }}>
                            Nog geen gesprekken opgeslagen
                        </div>
                    )}
                    {filteredConvs.map(function (conv) {
                        return (
                            <div
                                key={conv.id}
                                className={'ai-conv-item' + (activeConvId === conv.id ? ' active' : '')}
                                onClick={function () { loadConversation(conv); }}
                            >
                                <i className="fa-solid fa-message" style={{ fontSize: 10, color: 'var(--muted)', flexShrink: 0 }} />
                                <span style={{ fontSize: 11, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{conv.titel}</span>
                                <button
                                    className="ai-conv-delete"
                                    onClick={function (e) { e.stopPropagation(); deleteConversation(conv.id); }}
                                    style={{ opacity: 0, background: 'none', border: 'none', color: 'rgba(255,255,255,.4)', cursor: 'pointer', fontSize: 11, padding: '0 2px', transition: 'opacity .15s', flexShrink: 0 }}
                                    title="Verwijderen"
                                >
                                    ×
                                </button>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* ── Hoofdvenster ─────────────────────────────────────────────── */}
            <div className="ai-studio-main">
                {/* Topbar */}
                <div className="ai-studio-topbar">
                    <button
                        onClick={function () { setSidebarOpen(!sidebarOpen); }}
                        style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 16, padding: '4px 8px' }}
                        title={sidebarOpen ? 'Sidebar sluiten' : 'Sidebar openen'}
                    >
                        <i className="fa-solid fa-bars" />
                    </button>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                        <i className="fa-solid fa-robot" style={{ color: 'var(--brand)', fontSize: 16 }} />
                        <span style={{ fontWeight: 800, fontSize: 15 }}>AI Studio</span>
                        {activeConvId && (
                            <span style={{ fontSize: 11, color: 'var(--muted)', background: 'rgba(255,255,255,.05)', padding: '2px 8px', borderRadius: 10 }}>
                                {conversations.find(function (c) { return c.id === activeConvId; })?.titel || 'Gesprek'}
                            </span>
                        )}
                    </div>

                    {/* Modi */}
                    <div className="ai-mode-tabs">
                        <button
                            className={'ai-mode-tab' + (mode === 'brainstorm' ? ' active' : '')}
                            onClick={function () { setMode('brainstorm'); }}
                        >
                            🔥 Brainstorm
                        </button>
                        <button
                            className={'ai-mode-tab' + (mode === 'qa' ? ' active' : '')}
                            onClick={function () { setMode('qa'); }}
                        >
                            💡 Q&A
                        </button>
                    </div>

                    {/* Opslaan */}
                    <button
                        onClick={function () { setSavingAs(!savingAs); setSaveForm({ titel: activeConvId ? (conversations.find(function (c) { return c.id === activeConvId; })?.titel || '') : '', folder_id: activeFolder || '' }); }}
                        style={{ background: 'rgba(255,191,0,.12)', border: '1px solid rgba(255,191,0,.2)', color: 'var(--brand)', padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                    >
                        <i className="fa-solid fa-floppy-disk" style={{ marginRight: 5 }} />
                        {activeConvId ? 'Bijwerken' : 'Opslaan'}
                    </button>
                </div>

                {/* Save form */}
                {savingAs && (
                    <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', background: 'rgba(255,191,0,.04)', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                        <input
                            value={saveForm.titel}
                            onChange={function (e) { setSaveForm(function (p) { return Object.assign({}, p, { titel: e.target.value }); }); }}
                            onKeyDown={function (e) { if (e.key === 'Enter') saveConversation(); }}
                            placeholder="Titel gesprek..."
                            autoFocus
                            style={{ background: 'rgba(255,255,255,.06)', border: '1px solid var(--border)', color: 'var(--text)', padding: '7px 12px', borderRadius: 7, fontSize: 13, flex: 1, minWidth: 200 }}
                        />
                        <select
                            value={saveForm.folder_id}
                            onChange={function (e) { setSaveForm(function (p) { return Object.assign({}, p, { folder_id: e.target.value }); }); }}
                            style={{ background: 'rgba(255,255,255,.06)', border: '1px solid var(--border)', color: 'var(--text)', padding: '7px 10px', borderRadius: 7, fontSize: 13 }}
                        >
                            <option value="">Geen map</option>
                            {folders.map(function (f) { return <option key={f.id} value={f.id}>{f.naam}</option>; })}
                        </select>
                        <button onClick={saveConversation} style={{ background: 'var(--brand)', color: '#000', border: 'none', padding: '7px 16px', borderRadius: 7, fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>
                            💾 Opslaan
                        </button>
                        <button onClick={function () { setSavingAs(false); }} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 13 }}>
                            ✕
                        </button>
                    </div>
                )}

                {/* Berichten */}
                <div className="ai-studio-messages">
                    {messages.map(function (msg, i) {
                        var isUser = msg.role === 'user';
                        return (
                            <div key={i} className={'ai-studio-msg-row' + (isUser ? ' user' : '')}>
                                {!isUser && (
                                    <div className="ai-studio-avatar">
                                        <i className="fa-solid fa-robot" />
                                    </div>
                                )}
                                {isUser && (
                                    <div className="ai-studio-user-avatar">
                                        <i className="fa-solid fa-user" />
                                    </div>
                                )}
                                <div className={'ai-studio-bubble' + (isUser ? ' user' : '')}>
                                    {renderText(msg.content)}
                                </div>
                            </div>
                        );
                    })}

                    {isLoading && (
                        <div className="ai-studio-msg-row">
                            <div className="ai-studio-avatar">
                                <i className="fa-solid fa-robot" />
                            </div>
                            <div className="ai-studio-bubble loading-dots">
                                <span /><span /><span />
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>

                {/* Quick chips */}
                {messages.length <= 2 && (
                    <div style={{ padding: '8px 20px', display: 'flex', gap: 8, flexWrap: 'wrap', borderTop: '1px solid var(--border)' }}>
                        {chips.map(function (s) {
                            return (
                                <button
                                    key={s}
                                    onClick={function () { sendMessage(null, s); }}
                                    className="ai-suggestion-chip"
                                >
                                    {s}
                                </button>
                            );
                        })}
                    </div>
                )}

                {/* Input */}
                <div className="ai-studio-input-area">
                    <form onSubmit={sendMessage} style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
                        <div style={{ flex: 1, position: 'relative' }}>
                            <textarea
                                ref={inputRef}
                                value={input}
                                onChange={function (e) { setInput(e.target.value); }}
                                onKeyDown={function (e) {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        sendMessage(null);
                                    }
                                }}
                                placeholder={mode === 'brainstorm' ? '🔥 Brainstorm vrijuit... (Enter = verstuur, Shift+Enter = nieuw regel)' : '💡 Stel je vraag... (Enter = verstuur)'}
                                disabled={isLoading}
                                rows={2}
                                style={{
                                    width: '100%', background: 'rgba(255,255,255,.06)',
                                    border: '1px solid var(--border)', color: 'var(--text)',
                                    padding: '12px 14px', borderRadius: 10, fontSize: 14,
                                    resize: 'none', fontFamily: 'inherit', lineHeight: 1.5,
                                    transition: 'border-color .15s'
                                }}
                                onFocus={function (e) { e.target.style.borderColor = 'rgba(180,140,20,.4)'; }}
                                onBlur={function (e) { e.target.style.borderColor = 'var(--border)'; }}
                            />
                        </div>
                        <button
                            type="submit"
                            disabled={!input.trim() || isLoading}
                            style={{
                                background: !input.trim() || isLoading ? 'rgba(255,255,255,.08)' : 'var(--brand)',
                                color: !input.trim() || isLoading ? 'var(--muted)' : '#000',
                                border: 'none', padding: '12px 18px', borderRadius: 10,
                                cursor: !input.trim() || isLoading ? 'not-allowed' : 'pointer',
                                fontWeight: 700, fontSize: 16, transition: 'all .15s', flexShrink: 0,
                                alignSelf: 'flex-end'
                            }}
                        >
                            <i className="fa-solid fa-paper-plane" />
                        </button>
                    </form>
                    <div style={{ marginTop: 6, fontSize: 10, color: 'var(--muted)', textAlign: 'center' }}>
                        Groq ⚡ llama-3.3-70b-versatile • {mode === 'brainstorm' ? '🔥 Brainstorm modus' : '💡 Q&A modus'}
                    </div>
                </div>
            </div>
        </div>
    );
}
