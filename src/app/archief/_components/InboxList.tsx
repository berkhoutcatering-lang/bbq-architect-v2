/**
 * InboxList — Inbox-tab voor Bonnenkistje (P0.10).
 *
 * Design DNA uit Claude archief-inbox.jsx.
 * Toont organisatie-emailadres bovenaan, daarna nieuwe + verwerkte mails.
 * Klik op "Verwerk → archief" triggert moveInboxToArchiveAction Server Action.
 *
 * Bron: org_email_inbox waar category='factuur' (uit AI-classify in
 * 20260516120000_email_inbox_category.sql).
 */
'use client';

import { useState, useTransition } from 'react';
import { Mail, Copy, Check, CheckCircle2, Archive } from 'lucide-react';
import type { InboxItem } from '@/lib/dal/bonnen';
import { moveInboxToArchiveAction } from '../actions';
import { fmtDate } from './format';

interface Props {
    items: InboxItem[];
    orgEmail: string;
}

export function InboxList({ items, orgEmail }: Props) {
    const [copied, setCopied] = useState(false);
    const [items_, setItems] = useState(items);
    const [pending, startTransition] = useTransition();
    const [errorBon, setErrorBon] = useState<number | null>(null);

    const copyEmail = async () => {
        try {
            await navigator.clipboard.writeText(orgEmail);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            /* ignore */
        }
    };

    const processItem = (inboxId: number) => {
        setErrorBon(null);
        startTransition(async () => {
            const result = await moveInboxToArchiveAction({ inboxId });
            if (result.ok) {
                // Mark als verwerkt in lokale state — UI flipt direct.
                setItems((prev) =>
                    prev.map((i) => (i.id === inboxId ? { ...i, bon_id: result.bonId ?? -1 } : i)),
                );
            } else {
                setErrorBon(inboxId);
            }
        });
    };

    const nieuw = items_.filter((i) => !i.bon_id);
    const verwerkt = items_.filter((i) => !!i.bon_id);

    return (
        <div>
            {/* Org email adres card */}
            <div
                className="mb-5 flex items-center gap-3.5 rounded-[12px] border px-5 py-4"
                style={{
                    background: 'linear-gradient(135deg, rgba(255,191,0,.04), rgba(196,163,90,.02))',
                    borderColor: 'rgba(196,163,90,.2)',
                }}
            >
                <div
                    className="flex h-[42px] w-[42px] flex-shrink-0 items-center justify-center rounded-[10px] border"
                    style={{
                        background: 'rgba(196,163,90,.12)',
                        borderColor: 'rgba(196,163,90,.25)',
                    }}
                >
                    <Mail size={18} style={{ color: 'var(--brand-gold)' }} />
                </div>
                <div className="min-w-0 flex-1">
                    <div
                        className="mb-1 text-[9px] font-bold uppercase tracking-[.15em]"
                        style={{ color: 'var(--brand-gold)' }}
                    >
                        Organisatie inbox
                    </div>
                    <div className="flex items-center gap-2.5">
                        <span className="font-mono text-[14px] font-medium text-[var(--text)]">{orgEmail}</span>
                        <button
                            type="button"
                            onClick={copyEmail}
                            aria-label="Kopieer email-adres"
                            className="inline-flex items-center gap-1 rounded-[6px] px-2 py-1 text-[11px] text-[var(--muted)] transition hover:bg-white/[0.05] hover:text-[var(--text)]"
                        >
                            {copied ? <Check size={12} /> : <Copy size={12} />}
                            {copied ? 'Gekopieerd' : 'Kopieer'}
                        </button>
                    </div>
                </div>
                <div className="text-right text-[11px] text-[var(--muted)]">
                    <div>{nieuw.length} nieuw</div>
                    <div>{verwerkt.length} verwerkt</div>
                </div>
            </div>

            {nieuw.length > 0 && (
                <>
                    <SectionDivider label={`NIEUW (${nieuw.length})`} />
                    <div className="mb-4 flex flex-col gap-1">
                        {nieuw.map((item) => (
                            <InboxRow
                                key={item.id}
                                item={item}
                                onProcess={() => processItem(item.id)}
                                disabled={pending}
                                error={errorBon === item.id}
                            />
                        ))}
                    </div>
                </>
            )}

            {verwerkt.length > 0 && (
                <>
                    <SectionDivider label={`VERWERKT (${verwerkt.length})`} />
                    <div className="flex flex-col gap-1">
                        {verwerkt.map((item) => (
                            <InboxRow key={item.id} item={item} processed />
                        ))}
                    </div>
                </>
            )}

            {items_.length === 0 && (
                <div className="py-12 text-center text-[13px] text-[var(--muted)]">
                    Inbox leeg. Nieuwe email-bonnen verschijnen hier voor je verwerkt ze.
                </div>
            )}
        </div>
    );
}

function SectionDivider({ label }: { label: string }) {
    return (
        <div className="flex items-center gap-3 py-3.5 text-[10px] font-bold uppercase tracking-[.2em] text-[var(--muted-light)]">
            <span className="h-px flex-1 bg-[var(--border)]" />
            {label}
            <span className="h-px flex-1 bg-[var(--border)]" />
        </div>
    );
}

interface RowProps {
    item: InboxItem;
    onProcess?: () => void;
    disabled?: boolean;
    processed?: boolean;
    error?: boolean;
}

function InboxRow({ item, onProcess, disabled, processed, error }: RowProps) {
    return (
        <div
            className="ar-inbox-row flex items-center gap-3.5 rounded-[12px] border border-transparent px-4 py-3.5 transition-colors hover:border-[var(--border)] hover:bg-white/[0.02]"
            style={{ opacity: processed ? 0.6 : 1 }}
        >
            <div
                className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[8px]"
                style={{
                    background: processed ? 'rgba(34,197,94,.08)' : 'rgba(255,191,0,.08)',
                }}
            >
                {processed ? (
                    <CheckCircle2 size={16} className="text-emerald-400" />
                ) : (
                    <Mail size={16} style={{ color: 'var(--brand)' }} />
                )}
            </div>

            <div className="min-w-0 flex-1">
                <div className="mb-0.5 truncate text-[13px] font-semibold">{item.subject}</div>
                <div className="flex items-center gap-1.5 text-[11px] text-[var(--muted)]">
                    <span className="truncate">{item.from_email}</span>
                    <span>·</span>
                    <span>{fmtDate(item.received_at)}</span>
                    {item.size_bytes != null && (
                        <>
                            <span>·</span>
                            <span>{formatSize(item.size_bytes)}</span>
                        </>
                    )}
                </div>
                {error && (
                    <div className="mt-1 text-[11px] text-red-400">
                        Verwerken mislukt — probeer opnieuw
                    </div>
                )}
            </div>

            <div className="flex items-center gap-1.5">
                <span
                    className="rounded-[4px] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider"
                    style={{
                        background: 'rgba(59,130,246,.12)',
                        color: 'var(--blue)',
                    }}
                >
                    PDF
                </span>
                {!processed && onProcess && (
                    <button
                        type="button"
                        onClick={onProcess}
                        disabled={disabled}
                        className="inline-flex items-center gap-1 rounded-[8px] bg-[var(--brand)] px-3 py-1.5 text-[12px] font-semibold text-black transition hover:bg-[var(--brand-hover)] disabled:opacity-50"
                    >
                        <Archive size={12} />
                        Verwerk → archief
                    </button>
                )}
                {processed && (
                    <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400">
                        <Check size={12} />
                        In archief
                    </span>
                )}
            </div>
        </div>
    );
}

function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
