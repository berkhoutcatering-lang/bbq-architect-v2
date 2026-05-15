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

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useOrg } from '@/lib/OrgContext';
import { useToast } from '@/components/Toast';
import {
    Mail, Check, X, Loader2, AlertTriangle, Copy, ExternalLink,
    TrendingUp, TrendingDown, ChevronRight, Inbox as InboxIcon, Sparkles,
} from 'lucide-react';

const GOLD = '#c4a35a';

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
    return '€' + (c / 100).toFixed(2);
}
function fmtPrice(p: number | null | undefined): string {
    if (p == null) return '—';
    return '€' + Number(p).toFixed(2);
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

    useEffect(() => {
        loadInboxes();
        /* Light auto-refresh elke 8s als er parsing-rows zijn */
        const tid = setInterval(() => {
            const hasActive = inboxes.some(i => i.status === 'received' || i.status === 'parsing');
            if (hasActive) loadInboxes();
        }, 8000);
        return () => clearInterval(tid);
    }, [loadInboxes, inboxes]);

    function copyAddress() {
        if (!inboxAddress) return;
        navigator.clipboard?.writeText(inboxAddress).then(() => {
            showToast('Email-adres gekopieerd', 'success');
        }).catch(() => showToast('Kon niet kopiëren', 'error'));
    }

    /* ───────────────── Render ───────────────── */

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {/* Adres-card altijd zichtbaar bovenaan */}
            <AddressCard address={inboxAddress} onCopy={copyAddress} />

            {loading && inboxes.length === 0 ? (
                <SkeletonList />
            ) : inboxes.length === 0 ? (
                <EmptyState />
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {inboxes.map(inbox => (
                        <InboxItem
                            key={inbox.id}
                            inbox={inbox}
                            onOpen={() => setActiveInbox(inbox.id)}
                        />
                    ))}
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
   ADDRESS CARD
   ═══════════════════════════════════════════════════════════════════ */

function AddressCard({ address, onCopy }: { address: string; onCopy: () => void }) {
    return (
        <div style={{
            background: `linear-gradient(135deg, ${GOLD}10, transparent)`,
            border: `1px solid ${GOLD}33`,
            borderRadius: 14, padding: 18,
            display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 16, justifyContent: 'space-between',
        }} className="pi-inbox-banner">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: '1 1 220px' }}>
                <div style={{
                    width: 44, height: 44, borderRadius: 12,
                    background: `${GOLD}26`, border: `1px solid ${GOLD}55`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', color: GOLD,
                    flexShrink: 0,
                }}>
                    <Mail size={20} />
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 11, letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 700, marginBottom: 4 }}>
                        Stuur prijslijsten naar
                    </div>
                    <div style={{ fontSize: 15, fontFamily: 'JetBrains Mono, ui-monospace, monospace', wordBreak: 'break-all', color: 'var(--text)' }}>
                        {address || <span style={{ color: 'var(--muted)' }}>laden…</span>}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                        Werkt voor PDF, foto, Excel-tabel, plain-text e-mail.
                    </div>
                </div>
            </div>
            <button onClick={onCopy} disabled={!address} className="pi-copy-btn" style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '10px 14px', borderRadius: 10,
                background: address ? GOLD : 'var(--card)', color: address ? '#0a0a0c' : 'var(--muted)',
                fontWeight: 700, fontSize: 13, border: 'none', minHeight: 44,
                cursor: address ? 'pointer' : 'not-allowed', flexShrink: 0,
            }}>
                <Copy size={14} /> Kopieer adres
            </button>
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
        <button onClick={onOpen} disabled={isParsing} style={{
            background: 'var(--card)',
            border: `1px solid ${hasPending ? `${GOLD}55` : 'var(--border)'}`,
            borderRadius: 12, padding: 14,
            display: 'flex', alignItems: 'center', gap: 14,
            cursor: isParsing ? 'wait' : 'pointer', textAlign: 'left', width: '100%',
            transition: 'border-color .15s, transform .15s',
        }}>
            <div style={{
                width: 38, height: 38, borderRadius: 10,
                background: `${statusColor}1A`, border: `1px solid ${statusColor}55`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: statusColor, flexShrink: 0,
            }}>
                <StatusIcon size={16} className={isParsing ? 'animate-spin' : ''} />
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 2 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {inbox.from_name || inbox.from_email}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--muted)', flexShrink: 0 }}>
                        {fmtRelative(inbox.received_at)}
                    </span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {inbox.subject || `${inbox.attachment_count} attachment${inbox.attachment_count === 1 ? '' : 's'}`}
                </div>
                {isFailed && inbox.parse_error && (
                    <div style={{ fontSize: 11, color: '#e57373', marginTop: 4 }}>
                        {inbox.parse_error}
                    </div>
                )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 12, color: statusColor, fontWeight: 600 }}>{statusLabel}</div>
                    {inbox.totalCostCents > 0 && (
                        <div style={{ fontSize: 10, color: 'var(--muted)', letterSpacing: '.06em' }}>
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

    return (
        <div onClick={onClose} style={{
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
                        {delta > 0 ? '+' : ''}{delta.toFixed(1)}%
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
    return (
        <div style={{
            background: 'var(--card)', border: '1px dashed var(--border)',
            borderRadius: 14, padding: '38px 22px', textAlign: 'center',
        }}>
            <div style={{
                width: 56, height: 56, borderRadius: 14,
                background: `${GOLD}14`, border: `1px solid ${GOLD}33`,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: GOLD,
                marginBottom: 14,
            }}>
                <InboxIcon size={26} />
            </div>
            <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>
                Nog geen prijslijsten ontvangen
            </div>
            <div style={{ fontSize: 13, color: 'var(--muted)', maxWidth: 460, margin: '0 auto', lineHeight: 1.6 }}>
                Forward een mail van je leverancier naar het adres hierboven, of zet een filter
                in Gmail/Outlook zodat alle prijslijsten automatisch hierheen komen.
            </div>
            <a
                href="https://support.google.com/mail/answer/10957?hl=nl"
                target="_blank" rel="noopener noreferrer"
                style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 18,
                    fontSize: 12, color: GOLD, fontWeight: 600, textDecoration: 'none',
                }}
            >
                Gmail forward-instructies <ExternalLink size={11} />
            </a>
        </div>
    );
}

function SkeletonList() {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[0, 1, 2].map(i => (
                <div key={i} style={{
                    height: 64, borderRadius: 12,
                    background: 'linear-gradient(90deg, var(--card), rgba(255,255,255,0.04), var(--card))',
                    backgroundSize: '200% 100%', animation: 'shimmer 1.4s infinite',
                    border: '1px solid var(--border)',
                }} />
            ))}
            <style jsx>{`
                @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
            `}</style>
        </div>
    );
}
