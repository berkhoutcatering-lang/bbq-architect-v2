/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';
/**
 * /price-intelligence — Lane "Inbox"
 *
 * De primaire ingestion-route. Sam (of zijn leveranciers) forward elke
 * prijslijst-mail naar pl-{slug}@in.bbqarchitect.app; deze component toont
 * de status + opent een review-sheet zodra parsing klaar is.
 *
 * Pillar #1 — Forward-and-Forget: groot empty-state + kopieer-knop
 * Pillar #2 — Review-Before-Trust: ReviewSheet met diff-view
 * Pillar #5 — Cost-Bounded: cost-tag onder elke parse-row
 */

import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '@/lib/supabase';
import { useOrg } from '@/lib/OrgContext';
import { useToast } from '@/components/Toast';
import {
    Mail, Check, X, Loader2, AlertTriangle, Copy,
    TrendingUp, TrendingDown, ChevronRight, Inbox as InboxIcon, Sparkles,
    ShieldAlert,
} from 'lucide-react';
import { MailFilterButton } from './MailFilterSheet';
import { formatEur, formatPercent } from '@/lib/format';

const GOLD = '#c4a35a';

/* ── Heuristiek "afzender is geverifieerd?" ───────────────────────
   We doen geen echte SPF/DKIM-check in de UI (dat gebeurt server-side
   in de Cloudflare Email Worker). Als simpele waarschuwing tonen we
   "Niet geverifieerd" bij mails afkomstig van een freemail-domein —
   die zijn vaker gespoofd of doorgestuurd vanaf een persoonlijk account
   en verdienen extra controle voordat je de prijzen overneemt. */
const FREEMAIL_DOMAINS = new Set([
    'gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'hotmail.nl',
    'live.nl', 'live.com', 'yahoo.com', 'yahoo.nl', 'icloud.com', 'me.com',
    'protonmail.com', 'proton.me', 'ziggo.nl', 'kpnmail.nl', 'planet.nl',
]);

function isVerifiedSender(fromEmail: string | null | undefined): boolean {
    if (!fromEmail) return false;
    const domain = (fromEmail.split('@')[1] || '').toLowerCase().trim();
    if (!domain) return false;
    return !FREEMAIL_DOMAINS.has(domain);
}

/* ── Groepeer inboxes naar "deze week" / "eerder" ──────────────── */
function bucketByPeriod<T extends { received_at: string }>(rows: T[]): { thisWeek: T[]; earlier: T[] } {
    const cutoff = Date.now() - 7 * 24 * 3600 * 1000;
    const thisWeek: T[] = [];
    const earlier: T[] = [];
    for (const r of rows) {
        if (new Date(r.received_at).getTime() >= cutoff) thisWeek.push(r);
        else earlier.push(r);
    }
    return { thisWeek, earlier };
}

interface InboxRow {
    id: string;
    organization_id: string;
    inbound_address: string;
    from_email: string;
    from_name: string | null;
    subject: string | null;
    received_at: string;
    attachment_count: number;
    status: 'received' | 'parsing' | 'parsed' | 'failed' | 'dismissed';
    parse_error: string | null;
}

interface AttachmentRow {
    id: string;
    inbox_id: string;
    filename: string;
    mime_type: string;
    parse_status: 'pending' | 'parsing' | 'parsed' | 'failed' | 'skipped';
    parsed_supplier: string | null;
    parsed_count: number | null;
    ai_cost_cents: number | null;
    ai_model: string | null;
    parse_error: string | null;
}

interface MutationRow {
    id: string;
    leverancier: string | null;
    parsed_naam: string;
    parsed_eenheid: string | null;
    parsed_prijs: number;
    current_prijs: number | null;
    delta_pct: number | null;
    master_product_id: number | null;
    match_confidence: number | null;
    confidence: number;
    status: 'pending' | 'approved' | 'dismissed' | 'auto_committed' | 'superseded';
}

type InboxWithStats = InboxRow & {
    pendingMutations: number;
    approvedMutations: number;
    totalMutations: number;
    totalCostCents: number;
};

function fmtEuro(c: number | null | undefined): string {
    if (c == null) return '—';
    return formatEur((c / 100));
}
function fmtPrice(p: number | null | undefined): string {
    if (p == null) return '—';
    return formatEur(Number(p));
}
function fmtRelative(iso: string): string {
    const d = new Date(iso);
    const now = new Date();
    const diff = (now.getTime() - d.getTime()) / 1000;
    if (diff < 60) return `${Math.floor(diff)}s geleden`;
    if (diff < 3600) return `${Math.floor(diff / 60)} min geleden`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} uur geleden`;
    return d.toLocaleDateString('nl-NL', { day: '2-digit', month: 'short' });
}

export default function FolderInbox() {
    const { organization } = useOrg();
    const showToast = useToast();
    const [inboxAddress, setInboxAddress] = useState<string>('');
    const [inboxes, setInboxes] = useState<InboxWithStats[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeInbox, setActiveInbox] = useState<string | null>(null);

    const orgId = organization?.id;

    /* Inbox-adres ophalen via view */
    useEffect(() => {
        if (!orgId || !supabase) return;
        let cancelled = false;
        (async () => {
            const { data } = await supabase!
                .from('v_org_inbox_address')
                .select('inbox_address')
                .eq('organization_id', orgId)
                .maybeSingle();
            if (!cancelled && data?.inbox_address) setInboxAddress(data.inbox_address);
        })();
        return () => { cancelled = true; };
    }, [orgId]);

    const loadInboxes = useCallback(async () => {
        if (!orgId || !supabase) return;
        setLoading(true);

        /* Latest 50 inbox-rows */
        const { data: rows } = await supabase
            .from('org_email_inbox')
            .select('id, organization_id, inbound_address, from_email, from_name, subject, received_at, attachment_count, status, parse_error')
            .eq('organization_id', orgId)
            .neq('status', 'dismissed')
            .order('received_at', { ascending: false })
            .limit(50);

        const inboxRows = (rows || []) as InboxRow[];
        if (inboxRows.length === 0) {
            setInboxes([]);
            setLoading(false);
            return;
        }

        const ids = inboxRows.map(r => r.id);

        /* Aggregeer mutations per inbox */
        const { data: muts } = await supabase
            .from('org_price_mutations')
            .select('source_ref_id, status')
            .eq('organization_id', orgId)
            .eq('source', 'email_inbox')
            .in('source_ref_id', ids);

        const statsByInbox = new Map<string, { pending: number; approved: number; total: number }>();
        for (const m of (muts || [])) {
            const key = m.source_ref_id as string;
            const s = statsByInbox.get(key) || { pending: 0, approved: 0, total: 0 };
            s.total++;
            if (m.status === 'pending') s.pending++;
            if (m.status === 'approved' || m.status === 'auto_committed') s.approved++;
            statsByInbox.set(key, s);
        }

        /* Aggregeer cost per inbox via attachments */
        const { data: atts } = await supabase
            .from('org_email_attachments')
            .select('inbox_id, ai_cost_cents')
            .in('inbox_id', ids);
        const costByInbox = new Map<string, number>();
        for (const a of (atts || [])) {
            const key = a.inbox_id as string;
            costByInbox.set(key, (costByInbox.get(key) || 0) + (a.ai_cost_cents || 0));
        }

        const enriched: InboxWithStats[] = inboxRows.map(r => {
            const s = statsByInbox.get(r.id) || { pending: 0, approved: 0, total: 0 };
            return {
                ...r,
                pendingMutations: s.pending,
                approvedMutations: s.approved,
                totalMutations: s.total,
                totalCostCents: costByInbox.get(r.id) || 0,
            };
        });

        setInboxes(enriched);
        setLoading(false);
    }, [orgId]);

    /* Hou inboxes via ref — voorkomt dat de auto-refresh-useEffect telkens
       opnieuw mount bij iedere load (vroeger: inboxes in deps → setLoading(true)
       in loadInboxes → render → setInboxes met nieuwe lege array reference →
       useEffect rerun → infinite knipper-loop tussen empty state en skeleton). */
    const inboxesRef = useRef<InboxWithStats[]>([]);
    useEffect(() => { inboxesRef.current = inboxes; }, [inboxes]);

    useEffect(() => {
        loadInboxes();
        /* Light auto-refresh elke 8s als er parsing-rows zijn */
        const tid = setInterval(() => {
            const hasActive = inboxesRef.current.some(i => i.status === 'received' || i.status === 'parsing');
            if (hasActive) loadInboxes();
        }, 8000);
        return () => clearInterval(tid);
    }, [loadInboxes]);

    function copyAddress() {
        if (!inboxAddress) return;
        navigator.clipboard?.writeText(inboxAddress).then(() => {
            showToast('Email-adres gekopieerd', 'success');
        }).catch(() => showToast('Kon niet kopiëren', 'error'));
    }

    /* ───────────────── Render ───────────────── */

    const { thisWeek, earlier } = useMemo(() => bucketByPeriod(inboxes), [inboxes]);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }} className="pi-inbox">
            {/* Sticky address-card bovenaan — blijft staan bij scrollen. */}
            <div style={{
                position: 'sticky',
                top: 'var(--pi-inbox-sticky-top, 8px)',
                zIndex: 5,
            }}>
                <AddressCard address={inboxAddress} onCopy={copyAddress} />
            </div>

            {loading && inboxes.length === 0 ? (
                <SkeletonList />
            ) : inboxes.length === 0 ? (
                <EmptyState />
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {thisWeek.length > 0 && (
                        <>
                            <SectionDivider>Deze week</SectionDivider>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                {thisWeek.map(inbox => (
                                    <InboxItem
                                        key={inbox.id}
                                        inbox={inbox}
                                        onOpen={() => setActiveInbox(inbox.id)}
                                    />
                                ))}
                            </div>
                        </>
                    )}
                    {earlier.length > 0 && (
                        <>
                            <SectionDivider>Eerder</SectionDivider>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                {earlier.map(inbox => (
                                    <InboxItem
                                        key={inbox.id}
                                        inbox={inbox}
                                        onOpen={() => setActiveInbox(inbox.id)}
                                    />
                                ))}
                            </div>
                        </>
                    )}
                </div>
            )}

            {activeInbox && (
                <ReviewSheet
                    inboxId={activeInbox}
                    onClose={() => { setActiveInbox(null); loadInboxes(); }}
                />
            )}
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════════════
   SECTION DIVIDER  ("─── DEZE WEEK ───")
   ═══════════════════════════════════════════════════════════════════ */

function SectionDivider({ children }: { children: React.ReactNode }) {
    return (
        <div style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '12px 0 4px',
            fontSize: 10, letterSpacing: '.2em', textTransform: 'uppercase',
            color: 'var(--muted)', fontWeight: 700,
        }}>
            <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            <span>{children}</span>
            <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════════════
   ADDRESS CARD
   ═══════════════════════════════════════════════════════════════════ */

function AddressCard({ address, onCopy }: { address: string; onCopy: () => void }) {
    return (
        <div
            className="pi-inbox-banner"
            style={{
                background: `linear-gradient(135deg, ${GOLD}10, transparent)`,
                border: `1px solid ${GOLD}33`,
                borderRadius: 14, padding: 16,
                display: 'flex', flexDirection: 'column', gap: 12,
                backdropFilter: 'blur(18px)',
            }}
        >
            <div style={{
                display: 'flex', flexWrap: 'wrap', alignItems: 'center',
                gap: 14, justifyContent: 'space-between',
            }}>
                <div style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    minWidth: 0, flex: '1 1 220px',
                }}>
                    <div style={{
                        width: 42, height: 42, borderRadius: 10,
                        background: `${GOLD}26`, border: `1px solid ${GOLD}55`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', color: GOLD,
                        flexShrink: 0,
                    }}>
                        <Mail size={20} />
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{
                            fontSize: 10, letterSpacing: '.18em', textTransform: 'uppercase',
                            color: GOLD, fontWeight: 700, marginBottom: 4,
                        }}>
                            Stuur prijslijsten naar
                        </div>
                        <div style={{
                            fontSize: 14, fontFamily: 'JetBrains Mono, ui-monospace, monospace',
                            wordBreak: 'break-all', color: 'var(--text)', fontWeight: 500,
                        }}>
                            {address || <span style={{ color: 'var(--muted)' }}>laden…</span>}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                            Werkt voor PDF, foto, Excel-tabel, plain-text e-mail.
                        </div>
                    </div>
                </div>
                <button
                    onClick={onCopy}
                    disabled={!address}
                    className="pi-copy-btn"
                    style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        gap: 8, padding: '10px 14px', borderRadius: 10,
                        background: address ? GOLD : 'var(--card)',
                        color: address ? '#0a0a0c' : 'var(--muted)',
                        fontWeight: 700, fontSize: 13, border: 'none', minHeight: 40,
                        cursor: address ? 'pointer' : 'not-allowed',
                        flexShrink: 0, fontFamily: 'inherit',
                    }}
                >
                    <Copy size={14} /> Kopieer adres
                </button>
            </div>
            {/* Filter-knoppen — Gmail / Outlook regel-handleiding */}
            <div style={{
                display: 'flex', gap: 8, flexWrap: 'wrap',
                paddingTop: 10, borderTop: '1px solid rgba(196,163,90,.18)',
            }}>
                <MailFilterButton provider="gmail" inboxAddress={address} />
                <MailFilterButton provider="outlook" inboxAddress={address} />
            </div>
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════════════
   INBOX ITEM (per mail-row)
   ═══════════════════════════════════════════════════════════════════ */

function InboxItem({ inbox, onOpen }: { inbox: InboxWithStats; onOpen: () => void }) {
    const isParsing = inbox.status === 'received' || inbox.status === 'parsing';
    const isFailed = inbox.status === 'failed';
    const hasPending = inbox.pendingMutations > 0;
    const verified = isVerifiedSender(inbox.from_email);

    let statusLabel: React.ReactNode;
    let statusColor = 'var(--muted)';
    let StatusIcon = Loader2;
    if (isParsing) {
        statusLabel = 'Parsing…';
        statusColor = '#7aa2f7';
        StatusIcon = Loader2;
    } else if (isFailed) {
        statusLabel = 'Parse mislukt';
        statusColor = '#e57373';
        StatusIcon = AlertTriangle;
    } else if (hasPending) {
        statusLabel = `${inbox.pendingMutations} prijsmutaties`;
        statusColor = GOLD;
        StatusIcon = Sparkles;
    } else if (inbox.totalMutations > 0) {
        statusLabel = `${inbox.approvedMutations} goedgekeurd`;
        statusColor = '#7ec97a';
        StatusIcon = Check;
    } else {
        statusLabel = 'Geen prijzen gedetecteerd';
        statusColor = 'var(--muted)';
        StatusIcon = X;
    }

    return (
        <button
            onClick={onOpen}
            disabled={isParsing}
            className="pi-inbox-row"
            style={{
                background: 'transparent',
                border: '1px solid transparent',
                borderRadius: 12, padding: '12px 14px',
                display: 'flex', alignItems: 'center', gap: 14, width: '100%',
                cursor: isParsing ? 'wait' : 'pointer', textAlign: 'left',
                transition: 'background .15s, border-color .15s',
                minHeight: 56, fontFamily: 'inherit', color: 'inherit',
            }}
        >
            <div style={{
                width: 34, height: 34, borderRadius: 9,
                background: `${statusColor}1A`, border: `1px solid ${statusColor}55`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: statusColor, flexShrink: 0,
            }}>
                <StatusIcon size={16} className={isParsing ? 'animate-spin' : ''} />
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                    display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2,
                    flexWrap: 'wrap', rowGap: 2,
                }}>
                    <span style={{
                        fontSize: 14, fontWeight: 600, color: 'var(--text)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        minWidth: 0, maxWidth: '100%',
                    }}>
                        {inbox.from_name || inbox.from_email}
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--muted)', flexShrink: 0 }}>
                        · {fmtRelative(inbox.received_at)}
                    </span>
                    {!verified && (
                        <span
                            title="Afzender komt van een persoonlijk e-mailadres — controleer de prijzen extra goed voor je akkoord geeft."
                            style={{
                                display: 'inline-flex', alignItems: 'center', gap: 4,
                                padding: '1px 7px', borderRadius: 999,
                                background: 'rgba(239,68,68,.12)', color: '#e57373',
                                border: '1px solid rgba(239,68,68,.25)',
                                fontSize: 10, fontWeight: 700, letterSpacing: '.02em',
                            }}
                        >
                            <ShieldAlert size={10} /> Niet geverifieerd
                        </span>
                    )}
                </div>
                <div style={{
                    fontSize: 13, color: 'var(--muted)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                    {inbox.subject || `${inbox.attachment_count} attachment${inbox.attachment_count === 1 ? '' : 's'}`}
                </div>
                {isFailed && inbox.parse_error && (
                    <div style={{ fontSize: 11, color: '#e57373', marginTop: 4 }}>
                        {inbox.parse_error}
                    </div>
                )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 12, color: statusColor, fontWeight: 600 }}>{statusLabel}</div>
                    {inbox.totalCostCents > 0 && (
                        <div style={{ fontSize: 10, color: 'var(--muted)', letterSpacing: '.06em', fontFamily: 'JetBrains Mono, ui-monospace, monospace' }}>
                            {fmtEuro(inbox.totalCostCents)} AI
                        </div>
                    )}
                </div>
                {!isParsing && <ChevronRight size={16} style={{ color: 'var(--muted)' }} />}
            </div>
        </button>
    );
}

/* ═══════════════════════════════════════════════════════════════════
   REVIEW SHEET (de Pillar #2 in actie)
   ═══════════════════════════════════════════════════════════════════ */

function ReviewSheet({ inboxId, onClose }: { inboxId: string; onClose: () => void }) {
    const showToast = useToast();
    const [mutations, setMutations] = useState<MutationRow[]>([]);
    const [attachments, setAttachments] = useState<AttachmentRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [selected, setSelected] = useState<Set<string>>(new Set());

    useEffect(() => {
        if (!supabase) return;
        let cancelled = false;
        (async () => {
            setLoading(true);
            const [mRes, aRes] = await Promise.all([
                supabase!
                    .from('org_price_mutations')
                    .select('id, leverancier, parsed_naam, parsed_eenheid, parsed_prijs, current_prijs, delta_pct, master_product_id, match_confidence, confidence, status')
                    .eq('source', 'email_inbox')
                    .eq('source_ref_id', inboxId)
                    .order('delta_pct', { ascending: false, nullsFirst: false }),
                supabase!
                    .from('org_email_attachments')
                    .select('id, inbox_id, filename, mime_type, parse_status, parsed_supplier, parsed_count, ai_cost_cents, ai_model, parse_error')
                    .eq('inbox_id', inboxId),
            ]);
            if (cancelled) return;
            const muts = (mRes.data || []) as MutationRow[];
            setMutations(muts);
            setAttachments((aRes.data || []) as AttachmentRow[]);
            /* Pre-select alle pending */
            setSelected(new Set(muts.filter(m => m.status === 'pending').map(m => m.id)));
            setLoading(false);
        })();
        return () => { cancelled = true; };
    }, [inboxId]);

    const pendingMuts = useMemo(() => mutations.filter(m => m.status === 'pending'), [mutations]);
    const totalSelected = selected.size;

    function toggle(id: string) {
        const next = new Set(selected);
        if (next.has(id)) next.delete(id); else next.add(id);
        setSelected(next);
    }

    async function bulkAction(action: 'approve' | 'dismiss') {
        if (selected.size === 0) return;
        setSubmitting(true);
        try {
            const r = await fetch(`/api/inbox/${inboxId}/${action}`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ mutationIds: Array.from(selected) }),
            });
            const data = await r.json();
            if (!r.ok) throw new Error(data?.error || 'Onbekende fout');
            const num = data.approved ?? data.dismissed ?? 0;
            showToast(
                action === 'approve'
                    ? `${num} prijzen toegevoegd${data.createdMasters ? ` (${data.createdMasters} nieuw product)` : ''}`
                    : `${num} mutations genegeerd`,
                'success'
            );
            onClose();
        } catch (e) {
            showToast((e as Error).message, 'error');
        } finally {
            setSubmitting(false);
        }
    }

    const [mounted, setMounted] = useState(false);
    useEffect(() => { setMounted(true); }, []);
    useEffect(() => {
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
        window.addEventListener('keydown', onKey);
        return () => {
            document.body.style.overflow = prev;
            window.removeEventListener('keydown', onKey);
        };
    }, [onClose]);

    if (!mounted) return null;

    /* Portal naar document.body — anders zit het dialog in folder-inner waarop
       door animation een transform-matrix staat, en wordt `position: fixed`
       ingekapseld in dat containing block (renders op 0×0). */
    const overlay = (
        <div onClick={onClose} role="dialog" aria-modal="true" aria-label="Review prijsmutaties" style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 100,
            display: 'flex', justifyContent: 'flex-end', backdropFilter: 'blur(4px)',
        }}>
            <div onClick={e => e.stopPropagation()} style={{
                width: '100%', maxWidth: 720, height: '100%', background: 'var(--bg)',
                borderLeft: `1px solid ${GOLD}33`, overflow: 'auto',
                display: 'flex', flexDirection: 'column',
            }}>
                {/* Header */}
                <div style={{
                    padding: '18px 22px', borderBottom: '1px solid var(--border)',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
                    background: 'var(--card)', position: 'sticky', top: 0, zIndex: 5,
                }}>
                    <div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>
                            Review prijsmutaties
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                            {pendingMuts.length} pending · {totalSelected} geselecteerd
                        </div>
                    </div>
                    <button onClick={onClose} style={{
                        width: 36, height: 36, borderRadius: 10, background: 'transparent',
                        border: '1px solid var(--border)', color: 'var(--muted)', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                        <X size={16} />
                    </button>
                </div>

                {/* Attachments-strip */}
                {attachments.length > 0 && (
                    <div style={{ padding: '12px 22px', borderBottom: '1px solid var(--border)', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {attachments.map(a => (
                            <div key={a.id} style={{
                                display: 'inline-flex', alignItems: 'center', gap: 6,
                                padding: '6px 10px', borderRadius: 8,
                                background: 'var(--card)', border: '1px solid var(--border)',
                                fontSize: 11, color: 'var(--muted)',
                            }}>
                                <span style={{ color: 'var(--text)', fontWeight: 600 }}>{a.filename}</span>
                                <span>·</span>
                                <span>{a.parsed_count ?? 0} prod.</span>
                                {a.ai_cost_cents != null && <><span>·</span><span>{fmtEuro(a.ai_cost_cents)}</span></>}
                                {a.parse_status === 'failed' && (
                                    <span style={{ color: '#e57373' }} title={a.parse_error || ''}>
                                        <AlertTriangle size={12} />
                                    </span>
                                )}
                            </div>
                        ))}
                    </div>
                )}

                {/* Mutations list */}
                <div style={{ padding: '14px 22px', flex: 1 }}>
                    {loading ? (
                        <SkeletonList />
                    ) : pendingMuts.length === 0 ? (
                        <div style={{ padding: 32, textAlign: 'center', color: 'var(--muted)' }}>
                            <Check size={32} style={{ color: '#7ec97a', margin: '0 auto 12px', display: 'block' }} />
                            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>
                                Niets meer te reviewen
                            </div>
                            <div style={{ fontSize: 12 }}>Alle mutations zijn al verwerkt.</div>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {/* Bulk select header */}
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: 10,
                                padding: '6px 10px', fontSize: 11, color: 'var(--muted)', letterSpacing: '.08em', textTransform: 'uppercase', fontWeight: 700,
                            }}>
                                <input
                                    type="checkbox"
                                    checked={selected.size === pendingMuts.length && pendingMuts.length > 0}
                                    onChange={() => {
                                        if (selected.size === pendingMuts.length) setSelected(new Set());
                                        else setSelected(new Set(pendingMuts.map(m => m.id)));
                                    }}
                                />
                                <span>Selecteer alle</span>
                            </div>

                            {pendingMuts.map(m => (
                                <MutationRowItem
                                    key={m.id}
                                    mutation={m}
                                    selected={selected.has(m.id)}
                                    onToggle={() => toggle(m.id)}
                                />
                            ))}
                        </div>
                    )}
                </div>

                {/* Sticky action bar */}
                {pendingMuts.length > 0 && (
                    <div style={{
                        padding: '14px 22px', borderTop: '1px solid var(--border)',
                        background: 'var(--card)', position: 'sticky', bottom: 0,
                        display: 'flex', gap: 10, justifyContent: 'flex-end', flexShrink: 0,
                    }}>
                        <button
                            onClick={() => bulkAction('dismiss')}
                            disabled={submitting || totalSelected === 0}
                            style={{
                                padding: '10px 14px', borderRadius: 10, fontSize: 13, fontWeight: 600,
                                background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)',
                                cursor: (submitting || totalSelected === 0) ? 'not-allowed' : 'pointer',
                                opacity: (submitting || totalSelected === 0) ? 0.5 : 1,
                                display: 'inline-flex', alignItems: 'center', gap: 6,
                            }}
                        >
                            <X size={14} /> Negeer ({totalSelected})
                        </button>
                        <button
                            onClick={() => bulkAction('approve')}
                            disabled={submitting || totalSelected === 0}
                            style={{
                                padding: '10px 16px', borderRadius: 10, fontSize: 13, fontWeight: 700,
                                background: GOLD, border: 'none', color: '#0a0a0c',
                                cursor: (submitting || totalSelected === 0) ? 'not-allowed' : 'pointer',
                                opacity: (submitting || totalSelected === 0) ? 0.5 : 1,
                                display: 'inline-flex', alignItems: 'center', gap: 6,
                                boxShadow: '0 4px 16px rgba(196,163,90,.3)',
                            }}
                        >
                            {submitting ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                            Akkoord op {totalSelected}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );

    return createPortal(overlay, document.body);
}

function MutationRowItem({ mutation, selected, onToggle }: { mutation: MutationRow; selected: boolean; onToggle: () => void }) {
    const delta = mutation.delta_pct;
    const isUp = delta != null && delta > 0;
    const isDown = delta != null && delta < 0;
    const isNew = mutation.current_prijs == null;
    const isLowConfidence = (mutation.confidence ?? 1) < 0.7 || (mutation.match_confidence ?? 1) < 0.6;

    let deltaColor = 'var(--muted)';
    if (isUp && Math.abs(delta!) > 10) deltaColor = '#e57373';
    else if (isUp) deltaColor = '#f0b756';
    else if (isDown) deltaColor = '#7ec97a';

    return (
        <label style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '10px 12px', borderRadius: 10,
            background: selected ? 'rgba(196,163,90,.06)' : 'var(--card)',
            border: `1px solid ${selected ? `${GOLD}44` : 'var(--border)'}`,
            cursor: 'pointer', transition: 'all .15s',
        }}>
            <input type="checkbox" checked={selected} onChange={onToggle} />
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{mutation.parsed_naam}</span>
                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>per {mutation.parsed_eenheid || 'stuks'}</span>
                    {isNew && (
                        <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, background: `${GOLD}26`, color: GOLD, fontWeight: 700, letterSpacing: '.1em' }}>NIEUW</span>
                    )}
                    {isLowConfidence && (
                        <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, background: '#f0b75626', color: '#f0b756', fontWeight: 700, letterSpacing: '.1em' }} title="AI is minder zeker — controleer extra">
                            ⚠ CHECK
                        </span>
                    )}
                </div>
                {mutation.leverancier && (
                    <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>{mutation.leverancier}</div>
                )}
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
                {!isNew && (
                    <div style={{ fontSize: 11, color: 'var(--muted)', textDecoration: 'line-through' }}>
                        {fmtPrice(mutation.current_prijs)}
                    </div>
                )}
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>
                    {fmtPrice(mutation.parsed_prijs)}
                </div>
                {delta != null && Math.abs(delta) >= 0.5 && (
                    <div style={{ fontSize: 10, color: deltaColor, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                        {isUp ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                        {delta > 0 ? '+' : ''}{formatPercent(delta)}
                    </div>
                )}
            </div>
        </label>
    );
}

/* ═══════════════════════════════════════════════════════════════════
   EMPTY / SKELETON STATES
   ═══════════════════════════════════════════════════════════════════ */

function EmptyState() {
    /* Geen tweede adres-box, geen tweede filter-snippet, geen tweede knoppen-rij —
       die staan al in de sticky AddressCard hierboven. Empty state blijft dun:
       icon + één regel. */
    return (
        <div style={{
            background: 'var(--card)', border: '1px dashed var(--border)',
            borderRadius: 14, padding: '36px 24px',
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            textAlign: 'center', maxWidth: 460, margin: '4px auto 0', width: '100%',
        }}>
            <div style={{
                width: 56, height: 56, borderRadius: 14,
                background: `${GOLD}14`, border: `1px solid ${GOLD}33`,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: GOLD,
                marginBottom: 14,
            }}>
                <InboxIcon size={26} />
            </div>
            <div style={{
                fontFamily: 'Outfit, DM Sans, sans-serif', fontWeight: 300,
                fontSize: 20, color: 'var(--text)', marginBottom: 6,
            }}>
                Nog geen prijslijsten
            </div>
            <div style={{
                fontSize: 13, color: 'var(--muted)', maxWidth: 360, lineHeight: 1.55,
            }}>
                Stuur je eerste leveranciers-PDF door naar het adres hierboven —
                of klik op Gmail / Outlook voor de filter-instructies.
            </div>
        </div>
    );
}

function SkeletonList() {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[0, 1, 2].map(i => (
                <div key={i} className="pi-skeleton" />
            ))}
        </div>
    );
}
