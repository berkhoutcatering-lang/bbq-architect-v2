/**
 * DeelLinkSheet — modal voor read-only deellink boekhouder (Pillar #4 / P0.12).
 *
 * Design DNA uit Claude archief-modals.jsx:136-240.
 *
 * Flow:
 *   1. TTL-picker (7/30/90 dagen)
 *   2. Naam + email boekhouder (optional, voor latere "auto-mail")
 *   3. Submit → createShareTokenAction Server Action
 *   4. Success → toont URL + QR-code + copy-knop
 */
'use client';

import { useState } from 'react';
import { Link as LinkIcon, X, Check, Copy } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { createShareTokenAction } from '../actions';
import type { SearchInput } from '@/lib/dal/bonnen';

interface Props {
    open: boolean;
    onClose: () => void;
    currentFilters?: SearchInput;
}

type Ttl = 7 | 30 | 90;

export function DeelLinkSheet({ open, onClose, currentFilters }: Props) {
    const [ttl, setTtl] = useState<Ttl>(30);
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [creating, setCreating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [created, setCreated] = useState<{ url: string; expiresAt: string } | null>(null);
    const [copied, setCopied] = useState(false);

    if (!open) return null;

    const submit = async () => {
        setCreating(true);
        setError(null);
        const result = await createShareTokenAction({
            filterJson: (currentFilters as unknown as Record<string, unknown>) ?? {},
            ttlDays: ttl,
            recipientName: name || undefined,
            recipientEmail: email || undefined,
        });
        setCreating(false);
        if (result.ok) {
            setCreated({ url: result.url, expiresAt: result.expiresAt });
        } else {
            setError(result.error);
        }
    };

    const copyUrl = async () => {
        if (!created) return;
        try {
            await navigator.clipboard.writeText(created.url);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            /* ignore */
        }
    };

    const close = () => {
        // Reset bij sluiten zodat volgende open weer schoon is.
        setTimeout(() => {
            setCreated(null);
            setName('');
            setEmail('');
            setTtl(30);
            setError(null);
            setCopied(false);
        }, 200);
        onClose();
    };

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="deellink-title"
            className="fixed inset-0 z-[9998] flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(6px)' }}
            onClick={close}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                className="max-h-[85vh] w-[520px] max-w-[90vw] overflow-auto rounded-[16px] border"
                style={{
                    background: 'var(--bg-elevated)',
                    borderColor: 'var(--border)',
                    boxShadow: '0 24px 60px rgba(0,0,0,.5)',
                    animation: 'fadeInUp .3s ease both',
                }}
            >
                {/* Header */}
                <div
                    className="flex items-center gap-3 border-b px-6 py-5"
                    style={{ borderColor: 'var(--border)' }}
                >
                    <div
                        className="flex h-9 w-9 items-center justify-center rounded-[10px] border"
                        style={{
                            background: 'rgba(59,130,246,.12)',
                            borderColor: 'rgba(59,130,246,.25)',
                        }}
                    >
                        <LinkIcon size={18} className="text-[var(--blue)]" />
                    </div>
                    <div className="flex-1">
                        <h2 id="deellink-title" className="text-[16px] font-semibold">
                            Read-only deellink voor boekhouder
                        </h2>
                        <p className="text-[12px] text-[var(--muted)]">Veilig delen zonder account</p>
                    </div>
                    <button
                        type="button"
                        onClick={close}
                        aria-label="Sluiten"
                        className="text-[var(--muted)] hover:text-[var(--text)]"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Body — form OR success state */}
                <div className="flex flex-col gap-4 px-6 py-5">
                    {!created ? (
                        <>
                            {/* TTL picker */}
                            <div>
                                <label className="mb-1.5 block text-[12px] font-semibold">Geldigheid</label>
                                <div className="flex gap-1.5">
                                    {([7, 30, 90] as const).map((d) => (
                                        <button
                                            type="button"
                                            key={d}
                                            onClick={() => setTtl(d)}
                                            className="rounded-[8px] border px-3.5 py-1.5 text-[12px] font-semibold transition"
                                            style={
                                                ttl === d
                                                    ? {
                                                          background: 'rgba(255,191,0,.1)',
                                                          color: 'var(--brand)',
                                                          borderColor: 'rgba(255,191,0,.3)',
                                                      }
                                                    : {
                                                          background: 'rgba(130,130,130,.06)',
                                                          color: 'var(--muted)',
                                                          borderColor: 'var(--border)',
                                                      }
                                            }
                                        >
                                            {d} dagen
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Naam */}
                            <div>
                                <label htmlFor="dl-name" className="mb-1.5 block text-[12px] font-semibold">
                                    Naam boekhouder
                                </label>
                                <input
                                    id="dl-name"
                                    type="text"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder="Jan de Boer"
                                    className="w-full rounded-[8px] border bg-transparent px-3 py-2 text-[13px] text-[var(--text)] outline-none focus:border-[var(--brand)]"
                                    style={{ borderColor: 'var(--border)' }}
                                />
                            </div>

                            {/* Email */}
                            <div>
                                <label htmlFor="dl-email" className="mb-1.5 block text-[12px] font-semibold">
                                    E-mail boekhouder
                                </label>
                                <input
                                    id="dl-email"
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="jan@boekhouder.nl"
                                    className="w-full rounded-[8px] border bg-transparent px-3 py-2 text-[13px] text-[var(--text)] outline-none focus:border-[var(--brand)]"
                                    style={{ borderColor: 'var(--border)' }}
                                />
                            </div>

                            {error && (
                                <div className="text-[12px] text-red-400" role="alert">
                                    {error}
                                </div>
                            )}
                        </>
                    ) : (
                        // Success state — URL + QR
                        <div className="py-3 text-center">
                            <div
                                className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full"
                                style={{ background: 'rgba(34,197,94,.12)' }}
                            >
                                <Check size={24} className="text-emerald-400" />
                            </div>
                            <div className="mb-2 text-[14px] font-semibold">Link aangemaakt!</div>

                            <div
                                className="mb-4 flex items-center gap-2 rounded-[10px] border px-3.5 py-2.5"
                                style={{ background: 'var(--bg-subtle)', borderColor: 'var(--border)' }}
                            >
                                <span className="flex-1 truncate font-mono text-[12px] text-[var(--text)]">
                                    {created.url}
                                </span>
                                <button
                                    type="button"
                                    onClick={copyUrl}
                                    className="inline-flex items-center gap-1 rounded-[6px] px-2 py-1 text-[11px] text-[var(--muted)] transition hover:bg-white/[0.05] hover:text-[var(--text)]"
                                >
                                    {copied ? <Check size={12} /> : <Copy size={12} />}
                                    {copied ? 'OK' : 'Kopieer'}
                                </button>
                            </div>

                            {/* QR code */}
                            <div className="mx-auto mb-2 inline-block rounded-[10px] bg-white p-2">
                                <QRCodeSVG value={created.url} size={120} level="M" />
                            </div>
                            <div className="text-[11px] text-[var(--muted)]">
                                Geldig tot {new Date(created.expiresAt).toLocaleDateString('nl-NL')} · {ttl} dagen
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div
                    className="flex justify-end gap-2 border-t px-6 py-4"
                    style={{ borderColor: 'var(--border)' }}
                >
                    {!created ? (
                        <>
                            <button
                                type="button"
                                onClick={close}
                                disabled={creating}
                                className="rounded-[10px] px-4 py-2 text-[13px] font-semibold text-[var(--text)] transition hover:bg-white/[0.05] disabled:opacity-50"
                            >
                                Annuleren
                            </button>
                            <button
                                type="button"
                                onClick={submit}
                                disabled={creating}
                                className="inline-flex items-center gap-2 rounded-[10px] bg-[var(--brand)] px-4 py-2 text-[13px] font-semibold text-black transition hover:bg-[var(--brand-hover)] disabled:opacity-50"
                            >
                                <LinkIcon size={14} />
                                {creating ? 'Aanmaken…' : 'Maak link'}
                            </button>
                        </>
                    ) : (
                        <button
                            type="button"
                            onClick={close}
                            className="rounded-[10px] px-4 py-2 text-[13px] font-semibold text-[var(--text)] transition hover:bg-white/[0.05]"
                        >
                            Sluiten
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
