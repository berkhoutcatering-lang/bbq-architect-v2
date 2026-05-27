'use client';

/**
 * AiProposalModal — 3-step wizard die de logistiek-checklist van /api/logistics-checklist
 * streamt en per sectie laat reviewen.
 *
 * Lifecycle:
 *   step 1 (intro)   — toont basis-event-info + "Bekijken & aanpassen" knop
 *                      die de echte stream start. Hier wordt de Anthropic-call
 *                      ge-init (NIET bij open van de modal — gebruiker moet
 *                      bewust kiezen om te genereren).
 *   step 2 (review)  — 6 collapsible cards per categorie; per item: accept/edit/skip;
 *                      citatie zichtbaar via ?-info-icoon.
 *   step 3 (confirm) — opslag-bevestiging + counts. Schrijft de geaccepteerde
 *                      items naar event_checklist_items, verwijdert de placeholder
 *                      (ai_pending=true) en markeert de notification als dismissed.
 *
 * Trigger: opent automatisch via URL ?proposal=<event_id> óf via prop `eventId`.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
    Sparkles, ArrowRight, ArrowLeft, Check, CheckCheck, X, ChevronDown, ChevronUp,
    Info, AlertCircle, Loader2, CheckCircle2, MinusCircle,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useOrg } from '@/lib/OrgContext';
import { useToast } from '@/components/Toast';
import { LOGISTIEK_SECTIONS, SOURCE_REF_LABEL, type LogistiekCategory } from '@/lib/logistiek/sections';
import type { LogisticsCheck } from '@/lib/ai/logisticsChecklist';

interface Props {
    eventId: number;
    onClose: () => void;
    /** Optionele context-info — wordt in step 1 getoond. */
    eventLabel?: string;
    guests?: number;
    eventDate?: string;
}

type SectionMode = 'preview' | 'all' | 'skip';

interface SectionState {
    mode: SectionMode;
    /** Indices in `checks` (geclamped op cat-filter) die NIET mee moeten. */
    rejected: Set<number>;
}

interface DoneEvent {
    fallback?: boolean;
    fallbackTemplate?: string;
    capStatus?: string;
    capMessage?: string;
    usage?: { estCostEurCents?: number };
}

function emptySectionStates(): Record<LogistiekCategory, SectionState> {
    return LOGISTIEK_SECTIONS.reduce((acc, s) => {
        acc[s.id] = { mode: 'preview', rejected: new Set<number>() };
        return acc;
    }, {} as Record<LogistiekCategory, SectionState>);
}

export default function AiProposalModal({ eventId, onClose, eventLabel, guests, eventDate }: Props) {
    const router = useRouter();
    const { orgId } = useOrg();
    const showToast = useToast();

    const [step, setStep] = useState<1 | 2 | 3>(1);
    const [streaming, setStreaming] = useState(false);
    const [checks, setChecks] = useState<LogisticsCheck[]>([]);
    const [secState, setSecState] = useState<Record<LogistiekCategory, SectionState>>(emptySectionStates);
    const [expandedSec, setExpandedSec] = useState<LogistiekCategory | null>(null);
    const [doneInfo, setDoneInfo] = useState<DoneEvent | null>(null);
    const [streamError, setStreamError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    /* Group checks per categorie zodat we ze in step 2 per sectie kunnen renderen. */
    const grouped = useMemo(() => {
        const g: Record<LogistiekCategory, { index: number; check: LogisticsCheck }[]> = {} as any;
        LOGISTIEK_SECTIONS.forEach(s => { g[s.id] = []; });
        checks.forEach((c, i) => { if (g[c.category]) g[c.category].push({ index: i, check: c }); });
        return g;
    }, [checks]);

    /* Helper: start de stream van /api/logistics-checklist. */
    const startStream = useCallback(async () => {
        if (streaming) return;
        setStreaming(true);
        setStreamError(null);
        setChecks([]);
        setDoneInfo(null);

        try {
            const res = await fetch('/api/logistics-checklist', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ eventId }),
            });
            if (!res.ok) {
                let msg = `HTTP ${res.status}`;
                try { const j = await res.json(); if (j?.error) msg = j.error; } catch {}
                throw new Error(msg);
            }
            if (!res.body) throw new Error('Geen stream-body ontvangen');

            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            /* SSE parsing — `data: {...}\n\n` per event. */
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const events = buffer.split('\n\n');
                buffer = events.pop() ?? '';
                for (const raw of events) {
                    const m = /^data: (.+)$/m.exec(raw.trim());
                    if (!m) continue;
                    let payload: any;
                    try { payload = JSON.parse(m[1]); } catch { continue; }
                    if (payload.type === 'check' && payload.check) {
                        setChecks(prev => [...prev, payload.check as LogisticsCheck]);
                    } else if (payload.type === 'done') {
                        setDoneInfo({
                            fallback: payload.fallback,
                            fallbackTemplate: payload.fallbackTemplate,
                            capStatus: payload.capStatus,
                            capMessage: payload.capMessage,
                            usage: payload.usage,
                        });
                    } else if (payload.type === 'error') {
                        setStreamError(payload.message || 'Onbekende fout');
                    }
                }
            }
        } catch (e: any) {
            setStreamError(e.message || 'Stream faalde');
        } finally {
            setStreaming(false);
        }
    }, [streaming, eventId]);

    /* Move-on naar step 2 — start de stream wanneer we daar nog niets hebben. */
    const handleStartReview = useCallback(() => {
        setStep(2);
        if (checks.length === 0) startStream();
    }, [checks.length, startStream]);

    /* Tellers voor in step 2 header + step 3 confirm. */
    const sectionsWithItems = LOGISTIEK_SECTIONS.filter(s => grouped[s.id].length > 0);
    const acceptedSectionCount = sectionsWithItems.filter(s => secState[s.id].mode === 'all' || secState[s.id].mode === 'preview').length;
    const skippedSectionCount = sectionsWithItems.filter(s => secState[s.id].mode === 'skip').length;

    /* Tellers voor totaal-aantal items dat we straks committen. */
    const totalToCommit = useMemo(() => {
        let n = 0;
        for (const s of sectionsWithItems) {
            const st = secState[s.id];
            if (st.mode === 'skip') continue;
            n += grouped[s.id].filter(({ index }) => !st.rejected.has(index)).length;
        }
        return n;
    }, [sectionsWithItems, secState, grouped]);

    const handleAcceptAll = (cat: LogistiekCategory) => {
        setSecState(p => ({ ...p, [cat]: { mode: 'all', rejected: new Set() } }));
    };
    const handleSkipSection = (cat: LogistiekCategory) => {
        setSecState(p => ({ ...p, [cat]: { mode: 'skip', rejected: new Set() } }));
    };
    const handleToggleExpand = (cat: LogistiekCategory) => {
        setExpandedSec(prev => prev === cat ? null : cat);
    };
    const handleRejectItem = (cat: LogistiekCategory, idx: number) => {
        setSecState(p => {
            const nextRej = new Set(p[cat].rejected);
            if (nextRej.has(idx)) nextRej.delete(idx); else nextRej.add(idx);
            return { ...p, [cat]: { ...p[cat], rejected: nextRej, mode: 'preview' } };
        });
    };

    /* Step 3: commit naar event_checklist_items. */
    const handleConfirm = useCallback(async () => {
        if (!supabase || !orgId) {
            showToast('Geen verbinding — probeer opnieuw', 'error');
            return;
        }
        if (totalToCommit === 0) {
            showToast('Geen items geselecteerd', 'warning');
            return;
        }
        setSaving(true);
        try {
            /* 1. Verwijder placeholder-rij(en) zodat /logistiek niet langer
                  "AI-voorstel wordt klaargezet" toont. */
            await supabase
                .from('event_checklist_items')
                .delete()
                .eq('event_id', eventId)
                .eq('ai_pending', true);

            /* 2. Insert alle geaccepteerde checks. sort_order per categorie
                  zodat de UI deterministisch rendert. */
            const rows: Record<string, unknown>[] = [];
            const sortPerCat: Record<string, number> = {};
            for (const s of sectionsWithItems) {
                const st = secState[s.id];
                if (st.mode === 'skip') continue;
                for (const { index, check } of grouped[s.id]) {
                    if (st.rejected.has(index)) continue;
                    const next = (sortPerCat[check.category] = (sortPerCat[check.category] ?? 0) + 1);
                    rows.push({
                        event_id: eventId,
                        organization_id: orgId,
                        category: check.category,
                        label: check.label,
                        qty: typeof check.qty === 'number' ? check.qty : null,
                        unit: check.unit ?? null,
                        deadline_offset_hours: typeof check.deadline_offset_hours === 'number' ? check.deadline_offset_hours : null,
                        source: 'ai',
                        ai_citation: {
                            sum: check.cite?.sum ?? '',
                            src: check.cite?.src ?? '',
                            ref: check.cite?.ref ?? check.source_ref,
                        },
                        sort_order: next,
                    });
                }
            }
            if (rows.length > 0) {
                const { error: insErr } = await supabase.from('event_checklist_items').insert(rows);
                if (insErr) throw insErr;
            }

            /* 3. Markeer de proposal-notification als afgehandeld zodat de
                  toast/bel niet blijft hangen. */
            await supabase
                .from('notifications')
                .update({ dismissed_at: new Date().toISOString(), read_at: new Date().toISOString() })
                .eq('organization_id', orgId)
                .eq('type', 'ai_proposal_ready')
                .contains('metadata', { event_id: eventId } as any);

            setStep(3);
        } catch (e: any) {
            console.error('[AiProposalModal] commit failed:', e?.message);
            showToast('Opslaan mislukt: ' + (e?.message || 'onbekende fout'), 'error');
        } finally {
            setSaving(false);
        }
    }, [orgId, eventId, totalToCommit, sectionsWithItems, secState, grouped, showToast]);

    /* Esc om te sluiten. */
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    return (
        <div
            className="fixed inset-0 z-[1000] flex items-stretch justify-center bg-black/60 backdrop-blur-sm"
            onClick={onClose}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                className="relative w-full max-w-[920px] my-6 mx-3 rounded-2xl overflow-hidden flex flex-col"
                style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
            >
                {/* Step-indicator */}
                <div className="flex items-center justify-center gap-6 px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
                    {[
                        { n: 1 as const, label: 'Intro' },
                        { n: 2 as const, label: 'Review' },
                        { n: 3 as const, label: 'Bevestig' },
                    ].map((s, i, arr) => (
                        <div key={s.n} className="flex items-center gap-2">
                            <div
                                className="w-7 h-7 rounded-md flex items-center justify-center text-[12px] font-bold transition-all"
                                style={{
                                    background: step >= s.n ? 'var(--brand)' : 'rgba(130,130,130,.1)',
                                    color: step >= s.n ? '#000' : 'var(--muted)',
                                }}
                            >{s.n}</div>
                            <span className="text-[12px] font-semibold" style={{ color: step >= s.n ? 'var(--text)' : 'var(--muted)' }}>{s.label}</span>
                            {i < arr.length - 1 && <ArrowRight size={12} style={{ color: 'var(--muted-weak)', marginLeft: 4 }} />}
                        </div>
                    ))}
                    <button onClick={onClose} className="absolute right-4 top-3 w-8 h-8 rounded-md grid place-items-center"
                        style={{ background: 'transparent', color: 'var(--muted)', border: '1px solid var(--border)' }}
                        aria-label="Sluit voorstel"
                    >
                        <X size={14} />
                    </button>
                </div>

                {/* Content area — scrollable */}
                <div className="flex-1 overflow-y-auto px-6 pb-6">
                    {step === 1 && (
                        <StepIntro
                            eventLabel={eventLabel}
                            guests={guests}
                            eventDate={eventDate}
                            onStart={handleStartReview}
                            onSkip={onClose}
                        />
                    )}

                    {step === 2 && (
                        <StepReview
                            streaming={streaming}
                            streamError={streamError}
                            doneInfo={doneInfo}
                            checks={checks}
                            grouped={grouped}
                            sectionsWithItems={sectionsWithItems}
                            acceptedSectionCount={acceptedSectionCount}
                            skippedSectionCount={skippedSectionCount}
                            expandedSec={expandedSec}
                            secState={secState}
                            onAcceptAll={handleAcceptAll}
                            onSkip={handleSkipSection}
                            onToggleExpand={handleToggleExpand}
                            onRejectItem={handleRejectItem}
                            onBack={() => setStep(1)}
                            onConfirm={handleConfirm}
                            totalToCommit={totalToCommit}
                            saving={saving}
                        />
                    )}

                    {step === 3 && (
                        <StepConfirm
                            acceptedCount={acceptedSectionCount}
                            skippedCount={skippedSectionCount}
                            committed={totalToCommit}
                            onGoHub={() => { router.push(`/events/${eventId}/logistiek`); onClose(); }}
                            onStayLogistiek={() => { router.refresh(); onClose(); }}
                        />
                    )}
                </div>
            </div>
        </div>
    );
}

/* ────────────────────────────── Steps ────────────────────────────── */

function StepIntro({ eventLabel, guests, eventDate, onStart, onSkip }: {
    eventLabel?: string; guests?: number; eventDate?: string;
    onStart: () => void; onSkip: () => void;
}) {
    return (
        <div className="max-w-[560px] mx-auto py-10 text-center">
            <div
                className="w-16 h-16 rounded-2xl mx-auto mb-6 grid place-items-center"
                style={{ background: 'rgba(255,191,0,.1)', border: '1px solid rgba(255,191,0,.25)' }}
            >
                <Sparkles size={28} style={{ color: 'var(--brand)' }} />
            </div>
            <h2 className="text-[24px] font-light mb-2" style={{ fontFamily: 'var(--font-display)' }}>
                AI heeft een logistiek-voorstel klaar
            </h2>
            {(eventLabel || guests || eventDate) && (
                <p className="text-[13px] mb-6" style={{ color: 'var(--muted)' }}>
                    {[eventLabel, guests ? `${guests} gasten` : null, eventDate].filter(Boolean).join(' · ')}
                </p>
            )}

            <div
                className="rounded-xl p-5 text-left mb-7"
                style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
            >
                <div className="text-[13px] font-semibold mb-3">Voorstel wordt opgebouwd uit:</div>
                {[
                    { icon: '🍖', label: 'Menu van de offerte' },
                    { icon: '👥', label: 'Aantal gasten + standaard buffer' },
                    { icon: '🚛', label: 'Tenant-hardware-katalogus' },
                    { icon: '📍', label: 'Locatie-profiel' },
                    { icon: '☎️', label: 'Klant-info (allergie-check is een TAAK, geen AI-allergeen)' },
                ].map((row, i) => (
                    <div key={i} className="flex items-center gap-3 py-1.5 text-[13px]">
                        <span style={{ width: 24 }}>{row.icon}</span>
                        <Check size={14} style={{ color: 'var(--green)' }} />
                        <span>{row.label}</span>
                    </div>
                ))}
            </div>

            <div className="flex gap-3 justify-center flex-wrap">
                <button
                    onClick={onStart}
                    className="inline-flex items-center gap-2 px-7 py-3 rounded-xl text-[14px] font-bold"
                    style={{ background: 'var(--brand)', color: '#000', boxShadow: '0 4px 20px rgba(255,191,0,.35)' }}
                >
                    Bekijken & aanpassen <ArrowRight size={16} />
                </button>
                <button
                    onClick={onSkip}
                    className="px-5 py-3 rounded-xl text-[13px]"
                    style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--muted)' }}
                >
                    Sla over, ik doe het zelf
                </button>
            </div>
        </div>
    );
}

function StepReview(props: {
    streaming: boolean;
    streamError: string | null;
    doneInfo: DoneEvent | null;
    checks: LogisticsCheck[];
    grouped: Record<LogistiekCategory, { index: number; check: LogisticsCheck }[]>;
    sectionsWithItems: typeof LOGISTIEK_SECTIONS;
    acceptedSectionCount: number;
    skippedSectionCount: number;
    expandedSec: LogistiekCategory | null;
    secState: Record<LogistiekCategory, SectionState>;
    onAcceptAll: (cat: LogistiekCategory) => void;
    onSkip: (cat: LogistiekCategory) => void;
    onToggleExpand: (cat: LogistiekCategory) => void;
    onRejectItem: (cat: LogistiekCategory, idx: number) => void;
    onBack: () => void;
    onConfirm: () => void;
    totalToCommit: number;
    saving: boolean;
}) {
    const { streaming, streamError, doneInfo, checks, grouped, sectionsWithItems, secState,
        expandedSec, onAcceptAll, onSkip, onToggleExpand, onRejectItem, onBack, onConfirm,
        totalToCommit, saving, acceptedSectionCount, skippedSectionCount } = props;

    return (
        <div className="max-w-[820px] mx-auto py-6">
            <div className="flex items-center gap-3 mb-5 flex-wrap">
                <button onClick={onBack} className="w-9 h-9 rounded-md grid place-items-center"
                    style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)' }}>
                    <ArrowLeft size={16} />
                </button>
                <div>
                    <h2 className="text-[22px] font-light leading-none m-0" style={{ fontFamily: 'var(--font-display)' }}>Review per sectie</h2>
                    <p className="text-[12px] m-0 mt-1" style={{ color: 'var(--muted)' }}>Accepteer, pas aan of sla over — per sectie.</p>
                </div>
                <div className="ml-auto flex gap-2 text-[11px] font-semibold">
                    <span className="px-2.5 py-1 rounded-full" style={{ background: 'rgba(34,197,94,.12)', color: 'var(--green)', border: '1px solid rgba(34,197,94,.3)' }}>
                        {acceptedSectionCount}/{sectionsWithItems.length} actief
                    </span>
                    {skippedSectionCount > 0 && (
                        <span className="px-2.5 py-1 rounded-full" style={{ background: 'rgba(130,130,130,.1)', color: 'var(--muted)', border: '1px solid var(--border)' }}>
                            {skippedSectionCount} overgeslagen
                        </span>
                    )}
                </div>
            </div>

            {/* Stream-status */}
            {streaming && (
                <div className="rounded-xl px-4 py-3 mb-4 flex items-center gap-3"
                    style={{ background: 'rgba(255,191,0,.05)', border: '1px solid rgba(255,191,0,.18)' }}>
                    <Loader2 size={14} className="animate-spin" style={{ color: 'var(--brand)' }} />
                    <span className="text-[13px]">AI genereert ({checks.length} checks tot nu toe)…</span>
                </div>
            )}
            {streamError && (
                <div className="rounded-xl px-4 py-3 mb-4 flex items-center gap-3"
                    style={{ background: 'rgba(239,68,68,.06)', border: '1px solid rgba(239,68,68,.3)' }}>
                    <AlertCircle size={14} style={{ color: 'var(--red)' }} />
                    <span className="text-[13px]" style={{ color: 'var(--red)' }}>{streamError}</span>
                </div>
            )}
            {doneInfo?.fallback && (
                <div className="rounded-xl px-4 py-3 mb-4 flex items-start gap-3"
                    style={{ background: 'rgba(59,130,246,.06)', border: '1px solid rgba(59,130,246,.3)' }}>
                    <Info size={14} style={{ color: '#3b82f6' }} />
                    <div className="text-[12px]">
                        <strong>Fallback-template gebruikt</strong> ({doneInfo.fallbackTemplate ?? 'default'}) — AI-budget op of API niet bereikbaar. Items zijn handgekozen baseline, geen AI-suggestie.
                    </div>
                </div>
            )}
            {doneInfo?.capStatus === 'soft_warning' && !doneInfo.fallback && (
                <div className="rounded-xl px-4 py-3 mb-4 flex items-start gap-3"
                    style={{ background: 'rgba(245,158,11,.06)', border: '1px solid rgba(245,158,11,.3)' }}>
                    <AlertCircle size={14} style={{ color: '#f59e0b' }} />
                    <div className="text-[12px]" style={{ color: '#f59e0b' }}>{doneInfo.capMessage}</div>
                </div>
            )}

            {/* Sections */}
            <div className="flex flex-col gap-2.5">
                {sectionsWithItems.length === 0 && !streaming && (
                    <div className="rounded-xl px-6 py-10 text-center" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
                        <span className="text-[13px]" style={{ color: 'var(--muted)' }}>Nog geen checks ontvangen — wacht even of probeer opnieuw.</span>
                    </div>
                )}
                {sectionsWithItems.map(sec => {
                    const items = grouped[sec.id];
                    const st = secState[sec.id];
                    const isExpanded = expandedSec === sec.id;
                    const accepted = st.mode === 'all' || st.mode === 'preview';
                    const skipped = st.mode === 'skip';
                    const remaining = items.length - st.rejected.size;
                    const borderLeftColor =
                        accepted ? 'var(--green)'
                        : skipped ? 'var(--muted-weak)'
                        : 'transparent';

                    return (
                        <div key={sec.id} className="rounded-2xl overflow-hidden"
                            style={{
                                background: 'var(--card)',
                                border: '1px solid var(--border)',
                                borderLeftWidth: 3,
                                borderLeftColor,
                            }}>
                            <div className="flex items-center gap-3 px-5 py-4">
                                <span className="text-[24px]">{sec.emoji}</span>
                                <div className="flex-1 min-w-0">
                                    <div className="text-[14px] font-semibold">
                                        {sec.label} <span style={{ color: 'var(--muted)', fontWeight: 400 }}>— {items.length} voorgestelde items</span>
                                    </div>
                                    {accepted && <div className="text-[11px] mt-0.5" style={{ color: 'var(--green)' }}>{remaining}/{items.length} live</div>}
                                    {skipped && <div className="text-[11px] mt-0.5" style={{ color: 'var(--muted-weak)' }}>Overgeslagen</div>}
                                </div>
                                <div className="flex gap-1.5">
                                    <button onClick={() => onAcceptAll(sec.id)}
                                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-semibold"
                                        style={{ background: 'rgba(34,197,94,.06)', border: '1px solid rgba(34,197,94,.25)', color: 'var(--green)' }}
                                        aria-label="Accepteer hele sectie"
                                    ><CheckCheck size={12} /> Alles</button>
                                    <button onClick={() => onToggleExpand(sec.id)}
                                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-semibold"
                                        style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)' }}
                                        aria-label="Per item bewerken"
                                    >{isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />} Per item</button>
                                    <button onClick={() => onSkip(sec.id)}
                                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-semibold"
                                        style={{ background: 'rgba(239,68,68,.06)', border: '1px solid rgba(239,68,68,.25)', color: 'var(--red)' }}
                                        aria-label="Sla sectie over"
                                    ><X size={12} /> Overslaan</button>
                                </div>
                            </div>

                            {isExpanded && (
                                <div className="border-t" style={{ borderColor: 'var(--border)' }}>
                                    {items.map(({ index, check }) => {
                                        const rejected = st.rejected.has(index);
                                        const srcColor = SOURCE_REF_LABEL[check.source_ref]?.color ?? 'var(--muted)';
                                        return (
                                            <div key={index} className="flex items-center gap-3 px-5 py-2.5 border-b last:border-b-0"
                                                style={{ borderColor: 'rgba(130,130,130,.06)', opacity: rejected ? 0.4 : 1, textDecoration: rejected ? 'line-through' : undefined }}>
                                                <button onClick={() => onRejectItem(sec.id, index)}
                                                    className="w-5 h-5 rounded grid place-items-center shrink-0"
                                                    style={{
                                                        background: rejected ? 'transparent' : 'var(--green)',
                                                        border: rejected ? '1.5px solid var(--border)' : 'none',
                                                    }}
                                                    aria-label={rejected ? 'Voeg item terug toe' : 'Verwijder item uit selectie'}
                                                >
                                                    {!rejected && <Check size={12} color="#000" />}
                                                </button>
                                                <span className="flex-1 min-w-0 text-[13px] font-medium truncate">
                                                    {typeof check.qty === 'number' && check.qty > 0 && (
                                                        <span style={{ color: 'var(--muted)', marginRight: 6, fontVariantNumeric: 'tabular-nums' }}>
                                                            {check.qty}{check.unit ? ` ${check.unit}` : '×'}
                                                        </span>
                                                    )}
                                                    {check.label}
                                                </span>
                                                <span className="text-[10px] hidden sm:inline" style={{ color: srcColor }} title={`${check.cite?.sum ?? ''} — ${check.cite?.src ?? ''} (${check.cite?.ref ?? ''})`}>
                                                    {check.cite?.src || SOURCE_REF_LABEL[check.source_ref]?.label}
                                                </span>
                                                <button
                                                    className="w-6 h-6 rounded grid place-items-center"
                                                    style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--muted)' }}
                                                    title={`${check.cite?.sum ?? ''}\n${check.cite?.src ?? ''} — ${check.cite?.ref ?? ''}`}
                                                    aria-label="Bron-info"
                                                >
                                                    <Info size={12} />
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Footer-actions */}
            <div className="flex items-center justify-end gap-3 mt-6">
                <span className="text-[12px] mr-auto" style={{ color: 'var(--muted)' }}>{totalToCommit} items worden opgeslagen</span>
                <button onClick={onConfirm} disabled={saving || streaming || totalToCommit === 0}
                    className="inline-flex items-center gap-2 px-7 py-3 rounded-xl text-[14px] font-bold disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{ background: 'var(--brand)', color: '#000', boxShadow: '0 4px 20px rgba(255,191,0,.35)' }}
                >
                    {saving ? <><Loader2 size={16} className="animate-spin" /> Opslaan…</> : <>Opslaan & bevestigen <Check size={16} /></>}
                </button>
            </div>
        </div>
    );
}

function StepConfirm({ acceptedCount, skippedCount, committed, onGoHub, onStayLogistiek }: {
    acceptedCount: number;
    skippedCount: number;
    committed: number;
    onGoHub: () => void;
    onStayLogistiek: () => void;
}) {
    return (
        <div className="max-w-[480px] mx-auto py-16 text-center">
            <div className="w-16 h-16 rounded-2xl mx-auto mb-6 grid place-items-center"
                style={{ background: 'rgba(34,197,94,.1)', border: '1px solid rgba(34,197,94,.25)' }}>
                <CheckCircle2 size={28} style={{ color: 'var(--green)' }} />
            </div>
            <h2 className="text-[24px] font-light mb-3" style={{ fontFamily: 'var(--font-display)' }}>Voorstel geaccepteerd</h2>

            <div className="rounded-xl p-5 text-left mb-7" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
                <div className="flex items-center gap-2 text-[13px] mb-2">
                    <Check size={14} style={{ color: 'var(--green)' }} />
                    <strong>{committed} items live</strong>
                    <span style={{ color: 'var(--muted)' }}>· {acceptedCount} secties</span>
                </div>
                {skippedCount > 0 && (
                    <div className="flex items-center gap-2 text-[13px]" style={{ color: 'var(--muted)' }}>
                        <MinusCircle size={14} style={{ color: 'var(--muted-weak)' }} />
                        {skippedCount} sectie{skippedCount === 1 ? '' : 's'} overgeslagen — voeg je later toe?
                    </div>
                )}
            </div>

            <div className="flex gap-3 justify-center flex-wrap">
                <button onClick={onGoHub}
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-[14px] font-bold"
                    style={{ background: 'var(--brand)', color: '#000', boxShadow: '0 4px 20px rgba(255,191,0,.35)' }}>
                    Open event-logistiek <ArrowRight size={16} />
                </button>
                <button onClick={onStayLogistiek}
                    className="px-5 py-3 rounded-xl text-[13px]"
                    style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)' }}>
                    Blijf in /logistiek
                </button>
            </div>
        </div>
    );
}

/* ───────────────── Auto-open wrapper ─────────────────
 * Plug-in onderaan /logistiek, /vandaag of /events/[id]/logistiek:
 *
 *   <AiProposalModalAutoOpen />
 *
 * Lees ?proposal=<event_id> uit de URL en opent dan automatisch de modal.
 * Op close: ruim de query-string op zodat refresh niet opnieuw triggert.
 */
export function AiProposalModalAutoOpen() {
    const params = useSearchParams();
    const router = useRouter();
    const proposalId = params?.get('proposal');
    const eventIdNum = proposalId ? Number.parseInt(proposalId, 10) : NaN;
    const [meta, setMeta] = useState<{ label?: string; guests?: number; date?: string } | null>(null);

    useEffect(() => {
        if (!Number.isFinite(eventIdNum) || eventIdNum <= 0 || !supabase) { setMeta(null); return; }
        let cancelled = false;
        (async () => {
            const { data: ev } = await supabase
                .from('events')
                .select('name, guests, date, client_naam')
                .eq('id', eventIdNum)
                .single();
            if (!cancelled && ev) {
                setMeta({
                    label: (ev as any).client_naam || (ev as any).name || `Event #${eventIdNum}`,
                    guests: (ev as any).guests ?? undefined,
                    date: (ev as any).date ?? undefined,
                });
            }
        })();
        return () => { cancelled = true; };
    }, [eventIdNum]);

    if (!Number.isFinite(eventIdNum) || eventIdNum <= 0) return null;

    const handleClose = () => {
        const url = new URL(window.location.href);
        url.searchParams.delete('proposal');
        router.replace(url.pathname + (url.search || ''));
    };

    return (
        <AiProposalModal
            eventId={eventIdNum}
            onClose={handleClose}
            eventLabel={meta?.label}
            guests={meta?.guests}
            eventDate={meta?.date}
        />
    );
}
