'use client';

// ============================================================
// PaletteAiInput — "Vraag Rook" mode binnen ⌘K command palette
// ------------------------------------------------------------
// Wanneer gebruiker in palette de Tab-toets drukt of de "Vraag Rook"
// chip klikt, vervangt deze component de search-input+results.
//
// Self-contained:
//   - eigen input (autofocus)
//   - eigen fetch naar /api/chat met page-context
//   - eigen BlockRenderer compact-mode
//   - eigen onNavigate hook (sluit palette → pad naar nav_card.route)
//
// Geen state-pollutie naar de parent CommandPalette — die houdt z'n
// eigen mode-state bij en mount/unmount deze.
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ArrowLeft, Bot, Loader2, Send } from 'lucide-react';
import BlockRenderer from './BlockRenderer';
import { useActionDispatcher } from './ActionDispatcher';
import { coerceBlocks, type Block } from '@/lib/ai/blocks';
import { supabase } from '@/lib/supabase';
import { useOrg } from '@/lib/OrgContext';
import { loadPageContextData } from '@/lib/ai-actions';

const ACTION_REGEX = /<<<ACTION:([\s\S]*?)>>>/;

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

function stripActionMarker(text: string): string {
    return text.replace(/<<<ACTION:[\s\S]*?>>>/g, '').trim();
}

interface Props {
    initialQuery?: string;
    onClose: () => void;          // sluit hele palette (bv na nav_card-klik)
    onSwitchToSearch: () => void; // schakel terug naar search-mode
}

export default function PaletteAiInput({ initialQuery = '', onClose, onSwitchToSearch }: Props) {
    const [input, setInput] = useState(initialQuery);
    const [busy, setBusy] = useState(false);
    const [text, setText] = useState('');
    const [blocks, setBlocks] = useState<Block[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const pathname = usePathname() || '/';
    const router = useRouter();
    const { org } = useOrg();
    const orgId = org?.id ?? null;
    const execute = useActionDispatcher();

    useEffect(function () {
        // Autofocus op input zodra mount
        setTimeout(function () { inputRef.current?.focus(); }, 30);
        // Als initialQuery niet leeg is, automatisch versturen — gebruiker
        // typte al iets in search-mode en switchte daarna over.
        if (initialQuery.trim().length >= 3) {
            void submit(initialQuery);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const submit = useCallback(
        async function (q: string) {
            const text = q.trim();
            if (!text || busy) return;
            setBusy(true);
            setBlocks(null);
            setText('');
            setError(null);

            try {
                let contextData: Record<string, unknown> = {};
                if (supabase && orgId) {
                    try {
                        contextData = (await loadPageContextData(pathname, supabase, orgId)) || {};
                    } catch {
                        // niet-blokkerend
                    }
                }

                const res = await fetch('/api/chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        messages: [{ role: 'user', content: text }],
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
                            const parsed = tryParseBlocks(assembled);
                            setText(stripActionMarker(assembled));
                            if (parsed) setBlocks(parsed);
                        } catch {
                            // ignore
                        }
                    }
                }
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Onbekende fout');
            } finally {
                setBusy(false);
            }
        },
        [busy, pathname, orgId]
    );

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        void submit(input);
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
            {/* Input row — visueel hetzelfde als search-input voor consistent gevoel */}
            <form
                onSubmit={handleSubmit}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '14px 18px',
                    borderBottom: '1px solid var(--border)',
                }}
            >
                <button
                    type="button"
                    onClick={onSwitchToSearch}
                    aria-label="Terug naar zoeken"
                    style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '4px 8px',
                        background: 'var(--muted-extra-light)',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius-md)',
                        color: 'var(--muted-light)',
                        fontSize: 11,
                        cursor: 'pointer',
                    }}
                >
                    <ArrowLeft size={12} aria-hidden="true" />
                    Zoek
                </button>
                <Bot size={18} style={{ color: 'var(--brand)', flexShrink: 0 }} aria-hidden="true" />
                <input
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Vraag iets aan Rook over deze pagina…"
                    aria-label="Vraag aan Rook"
                    disabled={busy}
                    style={{
                        flex: 1,
                        background: 'none',
                        border: 'none',
                        outline: 'none',
                        color: 'var(--text)',
                        fontSize: 15,
                        fontFamily: 'inherit',
                    }}
                />
                <button
                    type="submit"
                    disabled={busy || !input.trim()}
                    aria-label="Verstuur"
                    className="btn btn-brand"
                    style={{ minHeight: 30, padding: '4px 10px' }}
                >
                    {busy ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={12} />}
                </button>
            </form>

            {/* Result-area — blocks of streaming-text */}
            <div style={{ maxHeight: 400, overflowY: 'auto', padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                {!busy && !blocks && !text && !error && (
                    <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>
                        Antwoord komt in blokken — klikbaar naar de juiste pagina.
                        Bijvoorbeeld: <em>&ldquo;wat word de inkooplijst?&rdquo;</em>,{' '}
                        <em>&ldquo;welke offertes lopen?&rdquo;</em>,{' '}
                        <em>&ldquo;hoe staat mijn marge?&rdquo;</em>.
                        <br />
                        <span style={{ color: 'var(--muted-weak)' }}>Page-context: {pathname}</span>
                    </div>
                )}

                {busy && !blocks && (
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: 12, color: 'var(--muted-light)' }}>
                        <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} aria-hidden="true" />
                        Rook denkt na…
                    </div>
                )}

                {error && (
                    <div
                        style={{
                            background: 'var(--status-danger-bg)',
                            border: '1px solid var(--status-danger-border)',
                            borderRadius: 'var(--radius-md)',
                            padding: 'var(--space-3)',
                            color: 'var(--status-danger-text)',
                            fontSize: 13,
                        }}
                    >
                        {error}
                    </div>
                )}

                {/* Plain-text fallback (alleen als er nog geen blocks zijn) */}
                {text && !blocks && (
                    <div style={{ fontSize: 13, color: 'var(--muted-light)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                        {text}
                    </div>
                )}

                {blocks && blocks.length > 0 && (
                    <BlockRenderer
                        blocks={blocks}
                        compact
                        onNavigate={() => {
                            // Sluit palette zodat Next.js Link normaal navigeert.
                            // Geen extra router.push nodig — <Link> doet dat al.
                            onClose();
                        }}
                        onExecute={async (action) => {
                            await execute(action);
                        }}
                    />
                )}
            </div>
        </div>
    );
}
