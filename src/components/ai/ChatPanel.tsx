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
import { Bot, Loader2, Send, X, Maximize2, Minimize2, Paperclip } from 'lucide-react';
import BlockRenderer from './BlockRenderer';
import { useActionDispatcher } from './ActionDispatcher';
import { coerceBlocks, type Block } from '@/lib/ai/blocks';
import { supabase } from '@/lib/supabase';
import { useOrg } from '@/lib/OrgContext';
import { loadPageContextData } from '@/lib/ai-actions';

// Foto-attachments uit composer (paperclip, paste, drop) → base64 voor /api/chat
const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;
type ImageMediaType = typeof ACCEPTED_IMAGE_TYPES[number];
const MAX_ATTACHMENTS = 4;
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;   // 3MB per foto (server cap)
const MAX_TOTAL_BYTES = 4 * 1024 * 1024;   // 4MB combined — onder Vercel 4.5MB body-cap

interface Attachment {
    id: string;
    filename: string;
    mediaType: ImageMediaType;
    base64: string;          // raw base64, geen data:URL prefix — server verwacht het zonder
    previewUrl: string;       // data:URL voor thumbnail (heeft prefix wél nodig)
}

interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    text?: string;        // plain delta text (voor partial of fallback)
    blocks?: Block[];     // geparsed uit info_blocks ACTION
    streaming?: boolean;
    attachmentPreviews?: string[]; // data:URLs van foto's die met deze user-msg meegingen
}

// Strip de "data:image/png;base64," prefix → server wil raw base64
function stripDataUrlPrefix(dataUrl: string): string {
    const idx = dataUrl.indexOf('base64,');
    return idx >= 0 ? dataUrl.slice(idx + 'base64,'.length) : dataUrl;
}

function isAcceptedImage(file: File): file is File & { type: ImageMediaType } {
    return (ACCEPTED_IMAGE_TYPES as readonly string[]).includes(file.type);
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
    const [attachments, setAttachments] = useState<Attachment[]>([]);
    const [attachmentError, setAttachmentError] = useState<string | null>(null);
    const [dragActive, setDragActive] = useState(false);
    const pathname = usePathname() || '/';
    const { orgId } = useOrg();
    const execute = useActionDispatcher();
    const scrollerRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Files → Attachment[]. Filter + cap + base64-encode. Returnt zodra alle
    // FileReaders klaar zijn. Niet-image files worden stil geskipt; per-file
    // errors zetten attachmentError voor UI-feedback.
    const acceptFiles = useCallback(async function (files: FileList | File[]): Promise<void> {
        setAttachmentError(null);
        const arr = Array.from(files);
        const room = MAX_ATTACHMENTS - attachments.length;
        if (room <= 0) {
            setAttachmentError('Max ' + MAX_ATTACHMENTS + " foto's per bericht.");
            return;
        }
        const candidates = arr.slice(0, room);
        const next: Attachment[] = [];
        // Loopt totaal-bytes van bestaande attachments mee — voorkomt 4.5MB body-cap
        let runningTotal = attachments.reduce((s, a) => s + a.base64.length * 0.75, 0);
        for (const file of candidates) {
            if (!isAcceptedImage(file)) {
                setAttachmentError('Alleen JPG, PNG, WebP of GIF — "' + file.name + '" overgeslagen.');
                continue;
            }
            if (file.size > MAX_IMAGE_BYTES) {
                setAttachmentError('"' + file.name + '" is groter dan 3MB.');
                continue;
            }
            if (runningTotal + file.size > MAX_TOTAL_BYTES) {
                setAttachmentError("Samen te groot — max 4MB aan foto's per bericht.");
                continue;
            }
            runningTotal += file.size;
            const dataUrl = await new Promise<string>(function (resolve, reject) {
                const reader = new FileReader();
                reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
                reader.onerror = () => reject(new Error('FileReader failed'));
                reader.readAsDataURL(file);
            }).catch(function () { return ''; });
            if (!dataUrl) continue;
            next.push({
                id: 'att-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
                filename: file.name || 'foto',
                mediaType: file.type as ImageMediaType,
                base64: stripDataUrlPrefix(dataUrl),
                previewUrl: dataUrl,
            });
        }
        if (next.length > 0) {
            setAttachments((prev) => [...prev, ...next]);
        }
    }, [attachments.length]);

    const removeAttachment = useCallback(function (id: string): void {
        setAttachments((prev) => prev.filter((a) => a.id !== id));
    }, []);

    // Paste — onderschep image-blobs uit clipboard (screenshot-paste ChatGPT-pattern)
    const handlePaste = useCallback(function (e: React.ClipboardEvent<HTMLTextAreaElement>): void {
        const items = e.clipboardData?.items;
        if (!items) return;
        const files: File[] = [];
        for (let i = 0; i < items.length; i++) {
            const it = items[i];
            if (it.kind === 'file') {
                const f = it.getAsFile();
                if (f && isAcceptedImage(f)) files.push(f);
            }
        }
        if (files.length > 0) {
            e.preventDefault();
            void acceptFiles(files);
        }
    }, [acceptFiles]);

    // Auto-scroll naar onder bij nieuwe message of streaming delta
    useEffect(function () {
        if (scrollerRef.current) {
            scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
        }
    }, [messages]);

    // Luister naar FAB-trigger zodat geen tweede floating knop nodig is
    useEffect(function () {
        const handler = () => setOpen(true);
        window.addEventListener('open-chat', handler);
        return () => window.removeEventListener('open-chat', handler);
    }, []);

    const send = useCallback(
        async function () {
            const text = input.trim();
            const hasAttachments = attachments.length > 0;
            // Sturen mag óók met alleen foto's en geen tekst (vision-only vraag)
            if ((!text && !hasAttachments) || busy) return;

            const userMsg: ChatMessage = {
                id: 'u-' + Date.now(),
                role: 'user',
                text: text || (hasAttachments ? '(' + attachments.length + " foto's)" : ''),
                attachmentPreviews: hasAttachments ? attachments.map((a) => a.previewUrl) : undefined,
            };
            const placeholder: ChatMessage = {
                id: 'a-' + Date.now(),
                role: 'assistant',
                text: '',
                streaming: true,
            };
            setMessages((prev) => [...prev, userMsg, placeholder]);
            // Snapshot attachments lokaal — we clearen ze direct uit composer-state
            const attachmentsToSend = attachments.map((a) => ({
                mediaType: a.mediaType,
                base64: a.base64,
                filename: a.filename,
            }));
            setInput('');
            setAttachments([]);
            setAttachmentError(null);
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
                            { role: 'user', content: text || '(foto bijgevoegd)' },
                        ],
                        pageContext: pathname,
                        mode: 'page',
                        thinkingMode: 'standard',
                        contextData,
                        attachments: attachmentsToSend.length > 0 ? attachmentsToSend : undefined,
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
        [busy, input, messages, pathname, orgId, execute, attachments]
    );

    // Op phone (<=767) = full-screen sheet (100vw); op tablet+ = drawer met max-width
    const drawerWidth = expanded ? 'min(720px, 100vw)' : 'min(420px, 100vw)';

    return (
        <>
            {/* Drawer — phone: full-screen incl. safe-area, tablet+: side-drawer */}
            {open && (
                <aside
                    role="complementary"
                    aria-label="AI assistent"
                    onDragOver={(e) => {
                        if (e.dataTransfer?.types?.includes('Files')) {
                            e.preventDefault();
                            setDragActive(true);
                        }
                    }}
                    onDragLeave={(e) => {
                        // Alleen reset bij leave-uit-aside, niet bij kind-elementen
                        if (e.currentTarget === e.target) setDragActive(false);
                    }}
                    onDrop={(e) => {
                        if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
                            e.preventDefault();
                            setDragActive(false);
                            void acceptFiles(e.dataTransfer.files);
                        }
                    }}
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
                        outline: dragActive ? '2px dashed var(--brand)' : 'none',
                        outlineOffset: -4,
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
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: 'var(--space-2)',
                                        }}
                                    >
                                        {m.attachmentPreviews && m.attachmentPreviews.length > 0 && (
                                            <div
                                                role="list"
                                                aria-label="Bijgevoegde foto's"
                                                style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}
                                            >
                                                {m.attachmentPreviews.map((src, i) => (
                                                    // eslint-disable-next-line @next/next/no-img-element
                                                    <img
                                                        key={i}
                                                        role="listitem"
                                                        src={src}
                                                        alt={'Bijgevoegde foto ' + (i + 1)}
                                                        style={{
                                                            width: 96,
                                                            height: 96,
                                                            objectFit: 'cover',
                                                            borderRadius: 'var(--radius-md)',
                                                            border: '1px solid var(--border)',
                                                        }}
                                                    />
                                                ))}
                                            </div>
                                        )}
                                        {m.text && <div>{m.text}</div>}
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
                                                {(() => {
                                                    // Lookup vorige user-msg in messages om te bepalen of er foto's bij gingen
                                                    const idx = messages.findIndex((x) => x.id === m.id);
                                                    const prev = idx > 0 ? messages[idx - 1] : null;
                                                    const hasFoto = prev?.attachmentPreviews && prev.attachmentPreviews.length > 0;
                                                    return hasFoto ? 'Rook bekijkt je foto…' : 'Rook denkt na…';
                                                })()}
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
                            flexDirection: 'column',
                            gap: 'var(--space-2)',
                        }}
                    >
                        {/* Attachment-strip (alleen zichtbaar bij ≥1 foto) */}
                        {attachments.length > 0 && (
                            <div
                                role="list"
                                aria-label="Bijgevoegde foto's"
                                style={{
                                    display: 'flex',
                                    flexWrap: 'wrap',
                                    gap: 'var(--space-2)',
                                    paddingBottom: 'var(--space-1)',
                                }}
                            >
                                {attachments.map((att) => (
                                    <div
                                        key={att.id}
                                        role="listitem"
                                        style={{
                                            position: 'relative',
                                            width: 64,
                                            height: 64,
                                            borderRadius: 'var(--radius-md)',
                                            overflow: 'hidden',
                                            border: '1px solid var(--border)',
                                            background: 'var(--card)',
                                        }}
                                    >
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img
                                            src={att.previewUrl}
                                            alt={att.filename}
                                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => removeAttachment(att.id)}
                                            aria-label={'Verwijder ' + att.filename}
                                            style={{
                                                position: 'absolute',
                                                top: 2,
                                                right: 2,
                                                width: 20,
                                                height: 20,
                                                borderRadius: '50%',
                                                background: 'rgba(0,0,0,0.6)',
                                                color: '#fff',
                                                border: 'none',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                cursor: 'pointer',
                                                padding: 0,
                                            }}
                                        >
                                            <X size={12} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                        {attachmentError && (
                            <div
                                role="alert"
                                style={{
                                    fontSize: 'var(--text-xs)',
                                    color: 'var(--danger, #b91c1c)',
                                    background: 'var(--danger-tint, rgba(185,28,28,0.08))',
                                    padding: '4px 8px',
                                    borderRadius: 'var(--radius-sm)',
                                }}
                            >
                                {attachmentError}
                            </div>
                        )}
                        <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'flex-end' }}>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/jpeg,image/png,image/webp,image/gif"
                                multiple
                                onChange={(e) => {
                                    if (e.target.files) void acceptFiles(e.target.files);
                                    // Reset zodat zelfde file opnieuw kan ('change' fired niet bij identieke selection)
                                    e.target.value = '';
                                }}
                                style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
                                aria-hidden="true"
                                tabIndex={-1}
                            />
                            <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                disabled={busy || attachments.length >= MAX_ATTACHMENTS}
                                aria-label="Foto toevoegen"
                                className="btn btn-ghost touch-manipulation"
                                style={{ minHeight: 44, minWidth: 44, padding: '8px 10px' }}
                                title={attachments.length >= MAX_ATTACHMENTS ? "Max " + MAX_ATTACHMENTS + " foto's" : 'Foto toevoegen'}
                            >
                                <Paperclip size={16} aria-hidden="true" />
                            </button>
                            <textarea
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onPaste={handlePaste}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        send();
                                    }
                                }}
                                placeholder={attachments.length > 0 ? "Wat moet ik met deze foto('s) doen?" : 'Vraag iets over deze pagina…'}
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
                                disabled={busy || (!input.trim() && attachments.length === 0)}
                                className="btn btn-brand touch-manipulation"
                                style={{ minHeight: 44, minWidth: 44, padding: '8px 12px' }}
                                aria-label="Verstuur"
                            >
                                {busy ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={14} />}
                            </button>
                        </div>
                    </form>
                </aside>
            )}
        </>
    );
}
