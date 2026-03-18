'use client';
import { useState, useRef, useEffect } from 'react';
import { usePathname } from 'next/navigation';

function renderMarkdown(text) {
    return text
        .split('\n')
        .map(function (line, i) {
            // bold **text**
            var parts = line.split(/(\*\*[^*]+\*\*)/g).map(function (part, j) {
                if (part.startsWith('**') && part.endsWith('**')) {
                    return <strong key={j}>{part.slice(2, -2)}</strong>;
                }
                return part;
            });
            // bullet points
            var isBullet = line.trim().startsWith('- ') || line.trim().startsWith('• ');
            return (
                <span key={i} style={{ display: 'block', paddingLeft: isBullet ? 12 : 0 }}>
                    {isBullet && <span style={{ color: 'var(--brand)', marginRight: 6 }}>•</span>}
                    {isBullet ? parts.slice(1) : parts}
                </span>
            );
        });
}

export default function AiAssistant() {
    var pathname = usePathname();
    var [isOpen, setIsOpen] = useState(false);
    var [messages, setMessages] = useState([
        { role: 'assistant', content: 'Hallo! Ik ben BBQ Copilot. Ik help je op deze pagina. Wat wil je weten?' }
    ]);
    var [input, setInput] = useState('');
    var [isLoading, setIsLoading] = useState(false);
    var messagesEndRef = useRef(null);
    var inputRef = useRef(null);

    // Reset conversation when page changes
    useEffect(function () {
        setMessages([{ role: 'assistant', content: 'Hallo! Ik ben BBQ Copilot. Ik help je op **' + (pathname === '/' ? 'het Dashboard' : pathname.replace('/', '')) + '**. Wat wil je weten?' }]);
    }, [pathname]);

    useEffect(function () {
        if (isOpen && messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages, isOpen]);

    useEffect(function () {
        if (isOpen && inputRef.current) {
            setTimeout(function () { inputRef.current?.focus(); }, 100);
        }
    }, [isOpen]);

    async function sendMessage(e) {
        if (e) e.preventDefault();
        var text = input.trim();
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
                    pageContext: pathname,
                    mode: 'context',
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
        <div className="ai-assistant-container">
            {/* Floating toggle button */}
            <button
                className={'ai-toggle-btn' + (isOpen ? ' active' : '')}
                onClick={function () { setIsOpen(function (v) { return !v; }); }}
                title="BBQ Copilot"
                id="ai-toggle-btn"
            >
                <i className={'fa-solid ' + (isOpen ? 'fa-xmark' : 'fa-robot')}></i>
                {!isOpen && <span className="ai-pulse-ring"></span>}
            </button>

            {/* Chat window */}
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
                                <div style={{ fontSize: 10, opacity: 0.7, color: '#000' }}>
                                    📍 {pathname === '/' ? 'Dashboard' : pathname.replace('/', '').replace(/-/g, ' ')}
                                </div>
                            </div>
                        </div>
                        <button onClick={function () { setMessages([{ role: 'assistant', content: 'Gesprek gewist. Hoe kan ik helpen?' }]); }} className="ai-clear-btn" title="Gesprek wissen">
                            <i className="fa-solid fa-rotate-left"></i>
                        </button>
                    </div>

                    {/* Messages */}
                    <div className="ai-chat-messages" id="ai-chat-messages">
                        {messages.map(function (msg, idx) {
                            var isUser = msg.role === 'user';
                            return (
                                <div key={idx} className={'ai-message-wrapper ' + (isUser ? 'user' : 'assistant')}>
                                    {!isUser && (
                                        <div className="ai-avatar"><i className="fa-solid fa-robot"></i></div>
                                    )}
                                    <div className={'ai-message bubble ' + (isUser ? 'user-bubble' : 'assistant-bubble')}>
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
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Input */}
                    <div className="ai-chat-input">
                        <form onSubmit={sendMessage} style={{ display: 'flex', gap: 8 }}>
                            <textarea
                                ref={inputRef}
                                value={input}
                                onChange={function (e) { setInput(e.target.value); }}
                                onKeyDown={handleKey}
                                placeholder={'Vraag iets over ' + (pathname === '/' ? 'het dashboard' : pathname.replace('/', '').replace(/-/g, ' ')) + '...'}
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
