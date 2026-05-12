/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';
/**
 * ReviewSheet voor mutations van één leverancier.
 * Werkt voor alle source-types: extension, email_inbox, invoice, manual.
 *
 * Pagineert client-side bij grote sets (1000+); toont diff oud → nieuw + delta_pct.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useToast } from '@/components/Toast';
import {
    X, Check, Loader2, TrendingUp, TrendingDown, Search, Sparkles,
} from 'lucide-react';
import CutChip, { cutFromNotes, type CutInfo } from '@/components/voorraad/CutChip';

const GOLD = '#c4a35a';
const PAGE_SIZE = 100;

interface MutationRow {
    id: string;
    source: string;
    leverancier: string | null;
    parsed_naam: string;
    parsed_eenheid: string | null;
    parsed_categorie: string | null;
    parsed_prijs: number;
    current_prijs: number | null;
    delta_pct: number | null;
    master_product_id: number | null;
    match_confidence: number | null;
    confidence: number;
    status: string;
    notes: string | null;       // JSON met cut_taxonomy_id / soort / cut_groep / bereiding (Pillar #1)
}

type SoortFilter = 'all' | 'varken' | 'kip' | 'rund' | 'lam' | 'gevogelte' | 'vis' | 'worst' | 'overig';

export default function LeverancierReviewSheet({
    leverancierId, leverancierNaam, onClose,
}: {
    leverancierId: number;
    leverancierNaam: string;
    onClose: () => void;
}) {
    const showToast = useToast();
    const [mutations, setMutations] = useState<MutationRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [filter, setFilter] = useState<'all' | 'new' | 'up' | 'down'>('all');
    const [soortFilter, setSoortFilter] = useState<SoortFilter>('all');
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(0);
    /* Pillar #4: aliassen die geleerd moeten worden bij approve.
       Key = mutation.id, value = true wanneer toggle aan. */
    const [aliasToLearn, setAliasToLearn] = useState<Map<string, boolean>>(new Map());

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoading(true);
            try {
                const r = await fetch(`/api/leveranciers/${leverancierId}/mutations`);
                const d = await r.json();
                if (cancelled) return;
                if (!r.ok) throw new Error(d?.error || 'kon mutations niet laden');
                setMutations(d.mutations || []);
                /* Pre-select all */
                setSelected(new Set((d.mutations || []).map((m: MutationRow) => m.id)));
            } catch (e) {
                showToast((e as Error).message, 'error');
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [leverancierId, showToast]);

    /* Filter + search + cut-soort */
    const filtered = useMemo(() => {
        let list = mutations;
        if (filter === 'new') list = list.filter(m => m.current_prijs == null);
        else if (filter === 'up') list = list.filter(m => (m.delta_pct ?? 0) > 0);
        else if (filter === 'down') list = list.filter(m => (m.delta_pct ?? 0) < 0);
        if (soortFilter !== 'all') {
            list = list.filter(m => {
                const c = cutFromNotes(m.notes);
                return c?.soort === soortFilter;
            });
        }
        if (search) {
            const q = search.toLowerCase();
            list = list.filter(m => m.parsed_naam.toLowerCase().includes(q));
        }
        return list;
    }, [mutations, filter, soortFilter, search]);

    /* Soort-counts voor filter-row */
    const soortCounts = useMemo(() => {
        const map = new Map<string, number>();
        for (const m of mutations) {
            const c = cutFromNotes(m.notes);
            if (c?.soort) map.set(c.soort, (map.get(c.soort) ?? 0) + 1);
        }
        return map;
    }, [mutations]);

    function toggleAliasLearn(mutationId: string, defaultOn: boolean) {
        setAliasToLearn(prev => {
            const next = new Map(prev);
            const current = next.has(mutationId) ? next.get(mutationId)! : defaultOn;
            next.set(mutationId, !current);
            return next;
        });
    }

    function getAliasLearnState(m: MutationRow): boolean {
        if (aliasToLearn.has(m.id)) return aliasToLearn.get(m.id)!;
        /* Default ON wanneer er een matched master is maar naam afwijkt (confidence < 1.0) */
        const mc = m.match_confidence;
        if (m.master_product_id != null && mc != null && mc < 1.0) return true;
        return false;
    }

    const paged = useMemo(() => filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE), [filtered, page]);
    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

    /* Counters */
    const counters = useMemo(() => {
        const newC = mutations.filter(m => m.current_prijs == null).length;
        const upC = mutations.filter(m => (m.delta_pct ?? 0) > 0).length;
        const downC = mutations.filter(m => (m.delta_pct ?? 0) < 0).length;
        return { all: mutations.length, new: newC, up: upC, down: downC };
    }, [mutations]);

    function toggle(id: string) {
        const next = new Set(selected);
        if (next.has(id)) next.delete(id); else next.add(id);
        setSelected(next);
    }

    function toggleAllVisible() {
        const visibleIds = filtered.map(m => m.id);
        const allSelected = visibleIds.every(id => selected.has(id));
        const next = new Set(selected);
        if (allSelected) visibleIds.forEach(id => next.delete(id));
        else visibleIds.forEach(id => next.add(id));
        setSelected(next);
    }

    async function bulkAction(action: 'approve' | 'dismiss') {
        if (selected.size === 0) return;
        setSubmitting(true);
        try {
            const ids = Array.from(selected);
            /* Chunk client-side */
            let totalDone = 0;
            let totalCreated = 0;
            for (let i = 0; i < ids.length; i += 1000) {
                const chunk = ids.slice(i, i + 1000);
                const r = await fetch(`/api/leveranciers/${leverancierId}/mutations/${action}`, {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({ mutationIds: chunk }),
                });
                const d = await r.json();
                if (!r.ok) throw new Error(d?.error || 'fout');
                totalDone += (d.approved ?? d.dismissed ?? 0);
                totalCreated += d.createdMasters || 0;
            }
            /* Pillar #4: persist aliassen die toggle aan hebben staan bij approve */
            let aliasesLearned = 0;
            if (action === 'approve') {
                const aliasItems = mutations
                    .filter(m => selected.has(m.id))
                    .filter(m => m.master_product_id != null && getAliasLearnState(m))
                    .map(m => {
                        const c = cutFromNotes(m.notes);
                        return {
                            mutationId: m.id,
                            masterProductId: m.master_product_id as number,
                            alias: m.parsed_naam,
                            cutTaxonomyId: (() => {
                                if (!c?.soort) return null;
                                try {
                                    const j = m.notes ? JSON.parse(m.notes) : null;
                                    return (j?.cut_taxonomy_id as number) ?? null;
                                } catch { return null; }
                            })(),
                        };
                    });
                if (aliasItems.length > 0) {
                    try {
                        const r = await fetch(`/api/leveranciers/${leverancierId}/aliases/learn`, {
                            method: 'POST',
                            headers: { 'content-type': 'application/json' },
                            body: JSON.stringify({ items: aliasItems }),
                        });
                        const d = await r.json();
                        if (r.ok) aliasesLearned = d.learned ?? 0;
                    } catch { /* niet kritisch — approve is al succesvol */ }
                }
            }

            showToast(
                action === 'approve'
                    ? `${totalDone} prijzen toegevoegd${totalCreated ? ` · ${totalCreated} nieuw product` : ''}${aliasesLearned ? ` · ${aliasesLearned} alias geleerd` : ''}`
                    : `${totalDone} mutations genegeerd`,
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
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,.65)', zIndex: 100,
            display: 'flex', justifyContent: 'flex-end', backdropFilter: 'blur(4px)',
        }}>
            <div onClick={e => e.stopPropagation()} style={{
                width: '100%', maxWidth: 820, height: '100%', background: 'var(--bg)',
                borderLeft: `1px solid ${GOLD}33`, overflow: 'hidden',
                display: 'flex', flexDirection: 'column',
            }}>
                {/* Header */}
                <div style={{
                    padding: '18px 22px', borderBottom: '1px solid var(--border)',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    background: 'var(--card)', flexShrink: 0,
                }}>
                    <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {leverancierNaam} — Review prijzen
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                            {loading ? 'laden…' : `${counters.all} pending · ${selected.size} geselecteerd`}
                        </div>
                    </div>
                    <button onClick={onClose} style={{
                        width: 36, height: 36, borderRadius: 10, background: 'transparent',
                        border: '1px solid var(--border)', color: 'var(--muted)', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>
                        <X size={16} />
                    </button>
                </div>

                {/* Filter chips + search */}
                {!loading && mutations.length > 0 && (
                    <div style={{
                        padding: '10px 22px', borderBottom: '1px solid var(--border)',
                        display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center',
                        background: 'var(--card)', flexShrink: 0,
                    }}>
                        <FilterChip label={`Alle (${counters.all})`} active={filter === 'all'} onClick={() => { setFilter('all'); setPage(0); }} />
                        <FilterChip label={`Nieuw (${counters.new})`} active={filter === 'new'} onClick={() => { setFilter('new'); setPage(0); }} />
                        <FilterChip label={`Stijgers (${counters.up})`} active={filter === 'up'} onClick={() => { setFilter('up'); setPage(0); }} />
                        <FilterChip label={`Dalers (${counters.down})`} active={filter === 'down'} onClick={() => { setFilter('down'); setPage(0); }} />
                        {/* Pillar #1: cut-soort filter, alleen tonen als er cuts zijn */}
                        {soortCounts.size > 0 && (
                            <>
                                <span style={{ color: 'var(--border)', margin: '0 4px' }}>·</span>
                                {(['varken','kip','rund','lam','gevogelte','vis','worst','overig'] as const).map(s => {
                                    const c = soortCounts.get(s) ?? 0;
                                    if (c === 0) return null;
                                    return (
                                        <FilterChip
                                            key={s}
                                            label={`${s} (${c})`}
                                            active={soortFilter === s}
                                            onClick={() => { setSoortFilter(soortFilter === s ? 'all' : s); setPage(0); }}
                                        />
                                    );
                                })}
                            </>
                        )}
                        <div style={{ flex: 1 }} />
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '4px 10px' }}>
                            <Search size={13} style={{ color: 'var(--muted)' }} />
                            <input
                                value={search}
                                onChange={e => { setSearch(e.target.value); setPage(0); }}
                                placeholder="Zoek product…"
                                style={{
                                    background: 'transparent', border: 'none', outline: 'none',
                                    color: 'var(--text)', fontSize: 12, width: 140,
                                }}
                            />
                        </div>
                    </div>
                )}

                {/* List */}
                <div style={{ flex: 1, overflow: 'auto', padding: '14px 22px' }}>
                    {loading ? (
                        <div style={{ textAlign: 'center', color: 'var(--muted)', padding: 40, fontSize: 13 }}>
                            <Loader2 size={20} className="animate-spin" style={{ margin: '0 auto 10px', display: 'block' }} />
                            Laden…
                        </div>
                    ) : filtered.length === 0 ? (
                        <div style={{ textAlign: 'center', color: 'var(--muted)', padding: 40 }}>
                            <Check size={28} style={{ color: '#7ec97a', margin: '0 auto 12px', display: 'block' }} />
                            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>
                                {mutations.length === 0 ? 'Niets te reviewen' : 'Geen mutations matchen filter'}
                            </div>
                        </div>
                    ) : (
                        <>
                            {/* Bulk-select header */}
                            <label style={{
                                display: 'flex', alignItems: 'center', gap: 10,
                                padding: '8px 10px', fontSize: 11, color: 'var(--muted)', letterSpacing: '.06em', textTransform: 'uppercase', fontWeight: 700,
                                cursor: 'pointer',
                            }}>
                                <input
                                    type="checkbox"
                                    checked={filtered.length > 0 && filtered.every(m => selected.has(m.id))}
                                    onChange={toggleAllVisible}
                                />
                                <span>Selecteer alle zichtbare ({filtered.length})</span>
                            </label>

                            {paged.map(m => (
                                <MutationRowItem
                                    key={m.id}
                                    mutation={m}
                                    selected={selected.has(m.id)}
                                    onToggle={() => toggle(m.id)}
                                    cut={cutFromNotes(m.notes)}
                                    aliasLearnOn={getAliasLearnState(m)}
                                    onToggleAliasLearn={() => toggleAliasLearn(m.id, getAliasLearnState(m))}
                                />
                            ))}

                            {totalPages > 1 && (
                                <div style={{
                                    display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 10,
                                    padding: '12px 0', fontSize: 12, color: 'var(--muted)',
                                }}>
                                    <button
                                        disabled={page === 0}
                                        onClick={() => setPage(p => Math.max(0, p - 1))}
                                        style={pageBtn(page === 0)}
                                    >← vorige</button>
                                    <span>Pagina {page + 1} van {totalPages}</span>
                                    <button
                                        disabled={page >= totalPages - 1}
                                        onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                                        style={pageBtn(page >= totalPages - 1)}
                                    >volgende →</button>
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* Sticky action bar */}
                {!loading && mutations.length > 0 && (
                    <div style={{
                        padding: '14px 22px', borderTop: '1px solid var(--border)',
                        background: 'var(--card)', flexShrink: 0,
                        display: 'flex', gap: 10, justifyContent: 'flex-end',
                    }}>
                        <button
                            onClick={() => bulkAction('dismiss')}
                            disabled={submitting || selected.size === 0}
                            style={ghostBtn(submitting || selected.size === 0)}
                        >
                            <X size={14} /> Negeer ({selected.size})
                        </button>
                        <button
                            onClick={() => bulkAction('approve')}
                            disabled={submitting || selected.size === 0}
                            style={primaryBtn(submitting || selected.size === 0)}
                        >
                            {submitting ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                            Akkoord op {selected.size}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            style={{
                padding: '5px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                background: active ? `${GOLD}26` : 'transparent',
                border: `1px solid ${active ? `${GOLD}55` : 'var(--border)'}`,
                color: active ? GOLD : 'var(--muted)', cursor: 'pointer',
            }}
        >
            {label}
        </button>
    );
}

function MutationRowItem({
    mutation, selected, onToggle, cut, aliasLearnOn, onToggleAliasLearn,
}: {
    mutation: MutationRow;
    selected: boolean;
    onToggle: () => void;
    cut: CutInfo | null;
    aliasLearnOn: boolean;
    onToggleAliasLearn: () => void;
}) {
    const delta = mutation.delta_pct;
    const isUp = delta != null && delta > 0;
    const isDown = delta != null && delta < 0;
    const isNew = mutation.current_prijs == null;
    const isLowConfidence = (mutation.confidence ?? 1) < 0.7 || (mutation.match_confidence ?? 1) < 0.6;

    /* Alias-toggle: alleen tonen als er een matched master is en naam afwijkt (Pillar #4) */
    const showAliasToggle = mutation.master_product_id != null
        && (mutation.match_confidence ?? 1) < 1.0;

    let deltaColor = 'var(--muted)';
    if (isUp && Math.abs(delta!) > 10) deltaColor = '#e57373';
    else if (isUp) deltaColor = '#f0b756';
    else if (isDown) deltaColor = '#7ec97a';

    function fmtPrice(p: number | null | undefined): string {
        if (p == null) return '—';
        return '€' + Number(p).toFixed(2);
    }

    return (
        <label style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '8px 10px', borderRadius: 8, marginBottom: 4,
            background: selected ? 'rgba(196,163,90,.06)' : 'transparent',
            border: `1px solid ${selected ? `${GOLD}33` : 'transparent'}`,
            cursor: 'pointer',
        }}>
            <input type="checkbox" checked={selected} onChange={onToggle} />
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{mutation.parsed_naam}</span>
                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>per {mutation.parsed_eenheid || 'stuks'}</span>
                    {isNew && <Badge color={GOLD}>NIEUW</Badge>}
                    {isLowConfidence && <Badge color="#f0b756">⚠ CHECK</Badge>}
                </div>
                {/* Pillar #1: cut-chip + Pillar #4: alias-toggle */}
                {(cut || showAliasToggle) && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                        {cut && <CutChip cut={cut} size="sm" />}
                        {showAliasToggle && (
                            <span
                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggleAliasLearn(); }}
                                title="Onthoud deze naam als alias zodat AI volgende keer direct herkent"
                                style={{
                                    display: 'inline-flex', alignItems: 'center', gap: 4,
                                    padding: '2px 7px', borderRadius: 999, fontSize: 10, fontWeight: 600,
                                    background: aliasLearnOn ? `${GOLD}1F` : 'transparent',
                                    border: `1px dashed ${aliasLearnOn ? `${GOLD}66` : 'var(--border)'}`,
                                    color: aliasLearnOn ? GOLD : 'var(--muted)',
                                    cursor: 'pointer',
                                }}
                            >
                                <Sparkles size={10} />
                                {aliasLearnOn ? 'onthoud alias' : 'leer niet'}
                            </span>
                        )}
                    </div>
                )}
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0, minWidth: 90 }}>
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

function Badge({ children, color }: { children: React.ReactNode; color: string }) {
    return (
        <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, background: `${color}26`, color, fontWeight: 700, letterSpacing: '.1em' }}>
            {children}
        </span>
    );
}

function primaryBtn(disabled?: boolean): React.CSSProperties {
    return {
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '10px 16px', borderRadius: 10, fontSize: 13, fontWeight: 700,
        background: GOLD, color: '#0a0a0c', border: 'none',
        cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
        boxShadow: disabled ? 'none' : '0 4px 16px rgba(196,163,90,.3)',
    };
}
function ghostBtn(disabled?: boolean): React.CSSProperties {
    return {
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '10px 14px', borderRadius: 10, fontSize: 13, fontWeight: 600,
        background: 'transparent', color: 'var(--text)', border: '1px solid var(--border)',
        cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
    };
}
function pageBtn(disabled: boolean): React.CSSProperties {
    return {
        padding: '5px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
        background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)',
        cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.4 : 1,
    };
}
