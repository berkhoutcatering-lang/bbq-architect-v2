'use client';
import { useState, useRef, useEffect } from 'react';

export default function AiAssistant() {
    var [isOpen, setIsOpen] = useState(false);
    var [messages, setMessages] = useState([
        { role: 'assistant', content: 'Hallo! Ik ben BBQ Copilot. Hoe kan ik je vandaag helpen?' }
    ]);
    var [input, setInput] = useState('');
    var [isLoading, setIsLoading] = useState(false);
    var messagesEndRef = useRef(null);
    var inputRef = useRef(null);

    useEffect(function () {
        function scrollToBottom() {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }

        if (isOpen) {
            scrollToBottom();
            setTimeout(function () { inputRef.current?.focus(); }, 100);
        }
    }, [messages, isOpen]);

    async function sendMessage(e) {
        e?.preventDefault();

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
                    messages: newMessages.map(m => ({ role: m.role, content: m.content }))
                }),
            });

            var data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Er is een fout opgetreden');
            }

            var assistantMessage = data.choices[0].message.content;
            setMessages(prev => [...prev, { role: 'assistant', content: assistantMessage }]);

        } catch (error) {
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: `❌ Oeps, er is iets misgegaan: ${error.message}. Is de Groq API Key ingesteld?`
            }]);
        } finally {
            setIsLoading(false);
        }
    }

    return (
        <div className="ai-assistant-container">
            {/* Toggle Button */}
            <button
                className={`ai-toggle-btn ${isOpen ? 'active' : ''}`}
                onClick={function () { setIsOpen(!isOpen); }}
                title="Open BBQ Copilot"
            >
                {isOpen ? (
                    <i className="fa-solid fa-xmark"></i>
                ) : (
                    <i className="fa-solid fa-robot"></i>
                )}
            </button>

            {/* Chat Window */}
            {isOpen && (
                <div className="ai-chat-window panel">
                    <div className="panel-head" style={{ padding: '16px', borderBottom: '1px solid var(--border)', background: 'var(--brand)', color: '#000' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <i className="fa-solid fa-robot" style={{ fontSize: '18px' }}></i>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800 }}>BBQ Copilot</h3>
                                <p style={{ margin: 0, fontSize: '11px', opacity: 0.8 }}>Powered by Groq ⚡️</p>
                            </div>
                        </div>
                    </div>

                    <div className="ai-chat-messages">
                        {messages.map(function (msg, idx) {
                            var isUser = msg.role === 'user';
                            return (
                                <div key={idx} className={`ai-message-wrapper ${isUser ? 'user' : 'assistant'}`}>
                                    {!isUser && (
                                        <div className="ai-avatar">
                                            <i className="fa-solid fa-robot"></i>
                                        </div>
                                    )}
                                    <div className={`ai-message bubble ${isUser ? 'user-bubble' : 'assistant-bubble'}`}>
                                        {/* Basic formatting support for markdown-like text */}
                                        {msg.content.split('\n').map((line, i) => (
                                            <span key={i}>
                                                {line}
                                                {i !== msg.content.split('\n').length - 1 && <br />}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            );
                        })}

                        {isLoading && (
                            <div className="ai-message-wrapper assistant">
                                <div className="ai-avatar">
                                    <i className="fa-solid fa-robot"></i>
                                </div>
                                <div className="ai-message bubble assistant-bubble loading-dots">
                                    <span>.</span><span>.</span><span>.</span>
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    <div className="ai-chat-input">
                        <form onSubmit={sendMessage} style={{ display: 'flex', gap: '8px' }}>
                            <input
                                ref={inputRef}
                                type="text"
                                value={input}
                                onChange={function (e) { setInput(e.target.value); }}
                                placeholder="Stel een vraag aan de copilot..."
                                disabled={isLoading}
                                autoComplete="off"
                            />
                            <button type="submit" disabled={!input.trim() || isLoading} className="send-btn">
                                <i className="fa-solid fa-paper-plane"></i>
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
