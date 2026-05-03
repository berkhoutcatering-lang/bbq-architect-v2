'use client';

// ============================================================
// ChatPanel v2 — block-first AI drawer
// ------------------------------------------------------------
// De vervanger voor de monolithische AiAssistant.tsx (1865r). Drie
// taken, drie modules:
//   - ChatPanel.tsx          : UI shell (deze file, ~280r)
//   - BlockRenderer.tsx      : rendert AI-output als typed blocks
//   - ActionDispatcher (hook): voert action_card.action uit via Supabase
//
// ChatPanel houdt z'n eigen messages-state (geen persist nu — komt
// in Sprint 5 met cross-page memory). Stream-parsing volgt het bestaande
// SSE-protocol van /api/chat: data: {delta} of data: {full, done}.
// Tool-use output komt als <<<ACTION:{type:'info_blocks',data:{blocks}}>>>
// blok in de stream — die parsen we hier en geven we aan BlockRenderer.
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Bot, Loader2, Send, X, Maximize2, Minimize2 } from 'lucide-react';
import BlockRenderer from './BlockRenderer';
import { useActionDispatcher } from './ActionDispatcher';
import { coerceBlocks, type Block } from '@/lib/ai/blocks';
import { supabase } from '@/lib/supabase';
import { useOrg } from '@/lib/OrgContext';
import { loadPageContextData } from '@/lib/ai-actions';

interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    text?: string;        // plain delta text (voor partial of fallback)
    blocks?: Block[];     // geparsed uit info_blocks ACTION
    streaming?: boolean;
}

const ACTION_REGEX = /<<<ACTION:([\s\S]*?)>>>/;

// Strip de ACTION-marker uit zichtbare tekst — we tonen 'm via blocks.
function stripActionMarker(text: string): string {
    return text.replace(/<<<ACTION:[\s\S]*?>>>/g, '').trim();
}

function tryParseBlocks(text: string): Block[] | null {
    const m = text.match(ACTION_REGEX);
    if (!m) return null;
    try {
        const obj = JSON.parse(m[1]);
        if (obj?.type === 'info_blocks' && Array.isArray(obj?.data?.blocks)) {
            return coerceBlocks(obj.data.blocks);
        }
        return null;
    } catch {
        return null;
    }
}

export default function ChatPanel() {
    const [open, setOpen] = useState(false);
    const [expanded, setExpanded] = useState(false);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [busy, setBusy] = useState(false);
    const pathname = usePathname() || '/';
    const { orgId } = useOrg();
    const execute = useActionDispatcher();
    const scrollerRef = useRef<HTMLDivElement>(null);

    // Auto-scroll naar onder bij nieuwe message of streaming delta
    useEffect(function () {
        if (scrollerRef.current) {
            scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
        }
    }, [messages]);

    const send = useCallback(
        async function () {
            const text = input.trim();
            if (!text || busy) return;

            const userMsg: ChatMessage = {
                id: 'u-' + Date.now(),
                role: 'user',
                text,
            };
            const placeholder: ChatMessage = {
                id: 'a-' + Date.now(),
                role: 'assistant',
                text: '',
                streaming: true,
            };
            setMessages((prev) => [...prev, userMsg, placeholder]);
            setInput('');
            setBusy(true);

            try {
                // Page context-data laden (zelfde route als oude AiAssistant).
                // Bewust unknown getypt — gaat alleen JSON-encoded naar /api/chat,
                // server kent z'n eigen schema per page.
                let contextData: unknown = {};
                if (supabase && orgId) {
                    try {
                        contextData = (await loadPageContextData(pathname, supabase)) || {};
                    } catch {
                        // Niet-blokkerend — context is bonus
                    }
                }

                const res = await fetch('/api/chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        messages: [
                            ...messages.filter((m) => m.role !== 'assistant' || !m.streaming).map((m) => ({
                                role: m.role,
                                content: m.text || '',
                            })),
                            { role: 'user', content: text },
                        ],
                        pageContext: pathname,
                        mode: 'page',
                        thinkingMode: 'standard',
                        contextData,
                    }),
                });

                if (!res.ok || !res.body) {
                    throw new Error('chat-fetch-failed:' + res.status);
                }

                const reader = res.body.getReader();
                const decoder = new TextDecoder();
                let buffer = '';
                let assembled = '';

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n');
                    buffer = lines.pop() || '';
                    for (const line of lines) {
                        if (!line.startsWith('data: ')) continue;
                        try {
                            const obj = JSON.parse(line.slice(6));
                            if (obj.delta) assembled += obj.delta;
                            if (obj.full) assembled = obj.full;
                            // Live update: parse zodra we ACTION zien
                            const blocks = tryParseBlocks(assembled);
                            const visibleText = stripActionMarker(assembled);
                            setMessages((prev) =>
                                prev.map((m) =>
                                    m.id === placeholder.id
                                        ? { ...m, text: visibleText, blocks: blocks || undefined, streaming: !obj.done }
                                        : m
                                )
                            );
                        } catch {
                            // niet-JSON line — negeren
                        }
                    }
                }

                // Streaming klaar — markeer message als af
                setMessages((prev) =>
                    prev.map((m) => (m.id === placeholder.id ? { ...m, streaming: false } : m))
                );
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Onbekende fout';
                setMessages((prev) =>
                    prev.map((m) =>
                        m.id === placeholder.id
                            ? { ...m, text: 'Fout: ' + message, streaming: false }
                            : m
                    )
                );
            } finally {
                setBusy(false);
            }
        },
        [busy, input, messages, pathname, orgId, execute]
    );

    // Op phone (<=767) = full-screen sheet (100vw); op tablet+ = drawer met max-width
    const drawerWidth = expanded ? 'min(720px, 100vw)' : 'min(420px, 100vw)';

    return (
        <>
            {/* Floating trigger — alleen tonen als drawer dicht is */}
            {!open && (
                <button
                    type="button"
                    onClick={() => setOpen(true)}
                    aria-label="Open Rook AI assistent"
                    className="btn btn-brand"
                    style={{
                        position: 'fixed',
                        bottom: 24,
                        right: 24,
                        zIndex: 50,
                        borderRadius: 'var(--radius-full)',
                        padding: '12px 18px',
                        boxShadow: 'var(--lift-shadow)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 8,
                        minHeight: 48,
                    }}
                >
                    <Bot size={18} aria-hidden="true" />
                    Vraag Rook
                </button>
            )}

            {/* Drawer — phone: full-screen incl. safe-area, tablet+: side-drawer */}
            {open && (
                <aside
                    role="complementary"
                    aria-label="AI assistent"
                    style={{
                        position: 'fixed',
                        top: 0,
                        right: 0,
                        bottom: 0,
                        width: drawerWidth,
                        background: 'var(--card-solid)',
                        borderLeft: '1px solid var(--border)',
                        boxShadow: 'var(--shadow-lg)',
                        zIndex: 60,
                        display: 'flex',
                        flexDirection: 'column',
                        color: 'var(--text)',
                        paddingTop: 'env(safe-area-inset-top, 0px)',
                        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
                    }}
                >
                    {/* Header */}
                    <header
                        style={{
                            padding: 'var(--space-3) var(--space-4)',
                            borderBottom: '1px solid var(--border)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 'var(--space-2)',
                        }}
                    >
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                            <Bot size={16} color="var(--brand)" aria-hidden="true" />
                            <strong style={{ fontSize: 'var(--text-sm)' }}>Rook</strong>
                            <span style={{ fontSize: 11, color: 'var(--muted)' }}>· {pathname}</span>
                        </div>
                        <div style={{ display: 'inline-flex', gap: 4 }}>
                            <button
                                type="button"
                                onClick={() => setExpanded((v) => !v)}
                                aria-label={expanded ? 'Verkleinen' : 'Vergroten'}
                                className="btn btn-ghost"
                                style={{ minHeight: 32, padding: '6px 8px' }}
                            >
                                {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                            </button>
                            <button
                                type="button"
                                onClick={() => setOpen(false)}
                                aria-label="Sluit assistent"
                                className="btn btn-ghost"
                                style={{ minHeight: 32, padding: '6px 8px' }}
                            >
                                <X size={14} />
                            </button>
                        </div>
                    </header>

                    {/* Messages */}
                    <div
                        ref={scrollerRef}
                        style={{
                            flex: 1,
                            overflowY: 'auto',
                            padding: 'var(--space-4)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 'var(--space-4)',
                        }}
                    >
                        {messages.length === 0 && (
                            <div
                                style={{
                                    fontSize: 'var(--text-sm)',
                                    color: 'var(--muted-light)',
                                    background: 'var(--card)',
                                    border: '1px dashed var(--border)',
                                    borderRadius: 'var(--radius-lg)',
                                    padding: 'var(--space-4)',
                                    textAlign: 'center',
                                }}
                            >
                                Vraag iets over deze pagina — bv <em>"wat moet ik vandaag?"</em> of
                                {' '}<em>"wat word de inkooplijst?"</em>. Antwoorden komen in blokken,
                                {' '}klikbaar naar de juiste plek.
                            </div>
                        )}

                        {messages.map((m) => (
                            <div key={m.id}>
                                {m.role === 'user' ? (
                                    <div
                                        style={{
                                            background: 'var(--brand-tint-subtle)',
                                            border: '1px solid var(--brand-tint-border)',
                                            borderRadius: 'var(--radius-lg)',
                                            padding: 'var(--space-3) var(--space-4)',
                                            fontSize: 'var(--text-sm)',
                                            color: 'var(--text)',
                                            alignSelf: 'flex-end',
                                            maxWidth: '85%',
                                            marginLeft: 'auto',
                                        }}
                                    >
                                        {m.text}
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                                        {m.text && (
                                            <div
                                                style={{
                                                    fontSize: 'var(--text-sm)',
                                                    color: 'var(--muted-light)',
                                                    lineHeight: 1.5,
                                                    whiteSpace: 'pre-wrap',
                                                }}
                                            >
                                                {m.text}
                                            </div>
                                        )}
                                        {m.blocks && m.blocks.length > 0 && (
                                            <BlockRenderer
                                                blocks={m.blocks}
                                                onNavigate={() => setOpen(false)}
                                                onExecute={async (action) => {
                                                    await execute(action);
                                                }}
                                            />
                                        )}
                                        {m.streaming && (
                                            <div
                                                style={{
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: 'var(--space-2)',
                                                    fontSize: 'var(--text-xs)',
                                                    color: 'var(--muted)',
                                                }}
                                            >
                                                <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} aria-hidden="true" />
                                                Rook denkt na…
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>

                    {/* Composer */}
                    <form
                        onSubmit={(e) => {
                            e.preventDefault();
                            send();
                        }}
                        style={{
                            padding: 'var(--space-3) var(--space-4)',
                            borderTop: '1px solid var(--border)',
                            display: 'flex',
                            gap: 'var(--space-2)',
                            alignItems: 'flex-end',
                        }}
                    >
                        <textarea
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    send();
                                }
                            }}
                            placeholder="Vraag iets over deze pagina…"
                            rows={1}
                            aria-label="Vraag aan AI"
                            style={{
                                flex: 1,
                                background: 'var(--card)',
                                border: '1px solid var(--border)',
                                borderRadius: 'var(--radius-md)',
                                padding: 'var(--space-2) var(--space-3)',
                                color: 'var(--text)',
                                fontSize: 16, // 16px voorkomt iOS auto-zoom on focus
                                resize: 'none',
                                fontFamily: 'inherit',
                                minHeight: 44,
                                maxHeight: 120,
                            }}
                            disabled={busy}
                        />
                        <button
                            type="submit"
                            disabled={busy || !input.trim()}
                            className="btn btn-brand touch-manipulation"
                            style={{ minHeight: 44, minWidth: 44, padding: '8px 12px' }}
                            aria-label="Verstuur"
                        >
                            {busy ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={14} />}
                        </button>
                    </form>
                </aside>
            )}
        </>
    );
}
