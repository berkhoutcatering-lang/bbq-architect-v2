'use client';
import { useState, useRef, useEffect } from 'react';

function renderMarkdown(text) {
    return text.split('\n').map(function (line, i) {
        var parts = line.split(/(\*\*[^*]+\*\*)/g).map(function (part, j) {
            if (part.startsWith('**') && part.endsWith('**')) {
                return <strong key={j}>{part.slice(2, -2)}</strong>;
            }
            return part;
        });
        var isBullet = line.trim().startsWith('- ') || line.trim().startsWith('• ');
        var isHeader = line.trim().startsWith('## ') || line.trim().startsWith('# ');
        if (isHeader) {
            return (
                <span key={i} style={{ display: 'block', fontWeight: 800, fontSize: 15, color: 'var(--brand)', marginTop: 10, marginBottom: 4 }}>
                    {line.replace(/^#{1,3} /, '')}
                </span>
            );
        }
        return (
            <span key={i} style={{ display: 'block', paddingLeft: isBullet ? 12 : 0, marginBottom: isBullet ? 2 : 0 }}>
                {isBullet && <span style={{ color: 'var(--brand)', marginRight: 6 }}>•</span>}
                {isBullet ? parts.slice(1) : parts}
            </span>
        );
    });
}

var SUGGESTIONS = [
    'Hoeveel kilo vlees voor 100 gasten?',
    'Wat is een goede marge voor catering?',
    'Hoe maak ik een perfecte dry rub?',
    'Tips voor efficiënte mise en place',
    'Wat moet ik meenemen in de bus?',
    'Hoe bereken ik mijn uurtarief?',
];

export default function AiGeneralChat() {
    var [messages, setMessages] = useState([
        { role: 'assistant', content: 'Hallo! Ik ben BBQ Copilot. In dit venster kan ik je helpen met **algemene catering vragen** — recepten, calculaties, tips, planning, alles! Wat wil je weten?' }
    ]);
    var [input, setInput] = useState('');
    var [isLoading, setIsLoading] = useState(false);
    var messagesEndRef = useRef(null);
    var inputRef = useRef(null);

    useEffect(function () {
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages]);

    async function sendMessage(e, overrideText) {
        if (e) e.preventDefault();
        var text = (overrideText || input).trim();
        if (!text || isLoading) return;
        setInput('');
        var newMessages = [...messages, { role: 'user', content: text }];
        setMessages(newMessages);
        setIsLoading(true);
        try {
            var res = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: newMessages.map(function (m) { return { role: m.role, content: m.content }; }),
                    mode: 'general',
                }),
            });
            var data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Fout opgetreden');
            var reply = data.choices[0].message.content;
            setMessages(function (prev) { return [...prev, { role: 'assistant', content: reply }]; });
        } catch (error) {
            setMessages(function (prev) { return [...prev, { role: 'assistant', content: '❌ ' + error.message }]; });
        } finally {
            setIsLoading(false);
        }
    }

    function handleKey(e) {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    }

    return (
        <>
            <div className="panel" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 140px)', minHeight: 500 }}>
                {/* Header */}
                <div className="panel-head" style={{ background: 'var(--brand)', borderRadius: '12px 12px 0 0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(0,0,0,.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#000', fontSize: 18 }}>
                            <i className="fa-solid fa-robot"></i>
                        </div>
                        <div>
                            <h3 style={{ margin: 0, color: '#000', fontWeight: 900 }}>BBQ Copilot — Algemeen</h3>
                            <div style={{ fontSize: 11, color: 'rgba(0,0,0,.6)' }}>Powered by Groq ⚡️ · Stel elke catering vraag</div>
                        </div>
                    </div>
                    <button
                        onClick={function () { setMessages([{ role: 'assistant', content: 'Gesprek gewist! Wat wil je weten?' }]); }}
                        style={{ background: 'rgba(0,0,0,.15)', border: 'none', color: '#000', padding: '6px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
                    >
                        <i className="fa-solid fa-rotate-left" style={{ marginRight: 4 }}></i>Nieuw gesprek
                    </button>
                </div>

                {/* Messages */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {messages.map(function (msg, idx) {
                        var isUser = msg.role === 'user';
                        return (
                            <div key={idx} className={'ai-message-wrapper ' + (isUser ? 'user' : 'assistant')}>
                                {!isUser && (
                                    <div className="ai-avatar"><i className="fa-solid fa-robot"></i></div>
                                )}
                                <div className={'ai-message bubble ' + (isUser ? 'user-bubble' : 'assistant-bubble') + ' general-bubble'}>
                                    {renderMarkdown(msg.content)}
                                </div>
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
                    {messages.length === 1 && !isLoading && (
                        <div style={{ marginTop: 8 }}>
                            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>💡 Suggesties:</div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                {SUGGESTIONS.map(function (s, i) {
                                    return (
                                        <button
                                            key={i}
                                            onClick={function () { sendMessage(null, s); }}
                                            style={{ background: 'var(--card-solid)', border: '1px solid var(--border)', color: 'var(--text)', padding: '6px 12px', borderRadius: 20, fontSize: 12, cursor: 'pointer', transition: 'all .15s' }}
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
                <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', background: 'var(--card-solid)', borderRadius: '0 0 12px 12px' }}>
                    <form onSubmit={sendMessage} style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
                        <textarea
                            ref={inputRef}
                            value={input}
                            onChange={function (e) { setInput(e.target.value); }}
                            onKeyDown={handleKey}
                            placeholder="Stel een vraag... (Enter = verzenden, Shift+Enter = nieuwe regel)"
                            disabled={isLoading}
                            rows={2}
                            autoComplete="off"
                            className="ai-textarea general"
                            id="ai-general-input"
                            style={{ flex: 1, resize: 'none' }}
                        />
                        <button
                            type="submit"
                            disabled={!input.trim() || isLoading}
                            className="send-btn"
                            id="ai-general-send-btn"
                            style={{ padding: '12px 16px', fontSize: 16 }}
                        >
                            <i className="fa-solid fa-paper-plane"></i>
                        </button>
                    </form>
                </div>
            </div>
        </>
    );
}
