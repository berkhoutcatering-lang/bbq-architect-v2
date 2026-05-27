'use client';

/**
 * LogistiekPanel — gebruikt in /events/[id]/logistiek.
 *
 * Geeft 6 collapsible Accordion-cards (één per categorie) met per check-row:
 *  - tap = toggle done (optimistic)
 *  - swipe right = mark done + groene flash (alleen op touch-devices via field-page)
 *  - long-press = full edit-modal (TODO P1 — hier in P0 wel openen via potlood)
 *  - drag-handle = @dnd-kit sortable; volgorde persist via sort_order
 *
 * AI-bron-badge [✨ AI] vs [✎ eigen].
 * Onderaan: totaal-strip + [Open Veldmodus →] knop.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
    Sparkles, Pencil, ChevronUp, ChevronDown, Check, CheckCheck, GripVertical,
    Smartphone, ClipboardCheck, Info, Loader2, X,
} from 'lucide-react';
import { DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, closestCenter, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { supabase } from '@/lib/supabase';
import { useOrg } from '@/lib/OrgContext';
import { useToast } from '@/components/Toast';
import { LOGISTIEK_SECTIONS, SOURCE_REF_LABEL, type LogistiekCategory, type DbChecklistItem } from '@/lib/logistiek/sections';

interface Props {
    eventId: number;
}

export default function LogistiekPanel({ eventId }: Props) {
    const { orgId } = useOrg();
    const showToast = useToast();

    const [items, setItems] = useState<DbChecklistItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [expanded, setExpanded] = useState<Record<LogistiekCategory, boolean>>(() => {
        const e = {} as Record<LogistiekCategory, boolean>;
        LOGISTIEK_SECTIONS.forEach(s => { e[s.id] = true; });
        return e;
    });
    const [editTarget, setEditTarget] = useState<DbChecklistItem | null>(null);

    /* DnD-kit sensors — pointer met 6px activation distance zodat tap niet
       per ongeluk drag triggert; keyboard voor a11y. */
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
    );

    /* Load + realtime hook zodat field-page-toggles direct doorkomen. */
    useEffect(() => {
        if (!supabase || !orgId) return;
        let cancelled = false;
        (async () => {
            setLoading(true);
            const { data, error } = await supabase
                .from('event_checklist_items')
                .select('*')
                .eq('event_id', eventId)
                .eq('organization_id', orgId)
                .order('category', { ascending: true })
                .order('sort_order', { ascending: true });
            if (!cancelled) {
                if (error) showToast('Checklist laden mislukt: ' + error.message, 'error');
                else setItems(((data ?? []) as DbChecklistItem[]).filter(c => !c.ai_pending));
                setLoading(false);
            }
        })();

        const ch = supabase
            .channel(`event_checklist_${eventId}`)
            .on('postgres_changes',
                { event: '*', schema: 'public', table: 'event_checklist_items', filter: `event_id=eq.${eventId}` },
                () => {
                    /* Refetch i.p.v. delta-merge — simpel, robuust, één bron van waarheid. */
                    if (!supabase || !orgId) return;
                    supabase
                        .from('event_checklist_items')
                        .select('*')
                        .eq('event_id', eventId)
                        .eq('organization_id', orgId)
                        .order('category', { ascending: true })
                        .order('sort_order', { ascending: true })
                        .then(({ data }) => {
                            if (!cancelled) setItems(((data ?? []) as DbChecklistItem[]).filter(c => !c.ai_pending));
                        });
                })
            .subscribe();

        return () => { cancelled = true; supabase?.removeChannel(ch); };
    }, [eventId, orgId, showToast]);

    /* Group per categorie. */
    const grouped = useMemo(() => {
        const g: Record<LogistiekCategory, DbChecklistItem[]> = {} as any;
        LOGISTIEK_SECTIONS.forEach(s => { g[s.id] = []; });
        for (const it of items) {
            if (g[it.category]) g[it.category].push(it);
        }
        return g;
    }, [items]);

    /* Tellers voor totaal-strip. */
    const totalDone = items.filter(i => i.done).length;
    const totalAll = items.length;
    const pct = totalAll === 0 ? 0 : Math.round((totalDone / totalAll) * 100);

    const toggleSection = (id: LogistiekCategory) => setExpanded(p => ({ ...p, [id]: !p[id] }));

    const toggleItem = useCallback(async (id: string) => {
        if (!supabase) return;
        const cur = items.find(i => i.id === id);
        if (!cur) return;
        const next = !cur.done;
        /* Optimistic update. */
        setItems(prev => prev.map(i => i.id === id ? { ...i, done: next } : i));
        if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(10);
        const { error } = await supabase
            .from('event_checklist_items')
            .update({ done: next })
            .eq('id', id);
        if (error) {
            /* Rollback. */
            setItems(prev => prev.map(i => i.id === id ? { ...i, done: !next } : i));
            showToast('Kon check niet opslaan — probeer opnieuw', 'error');
        }
    }, [items, showToast]);

    const acceptAll = useCallback(async (cat: LogistiekCategory) => {
        if (!supabase) return;
        const cats = grouped[cat].filter(i => !i.done);
        if (cats.length === 0) return;
        /* Optimistic. */
        setItems(prev => prev.map(i => i.category === cat && !i.done ? { ...i, done: true } : i));
        const ids = cats.map(i => i.id);
        const { error } = await supabase
            .from('event_checklist_items')
            .update({ done: true })
            .in('id', ids);
        if (error) {
            showToast('Bulk-aftikken mislukt — refresh', 'error');
        }
    }, [grouped, showToast]);

    const handleDragEnd = useCallback(async (e: DragEndEvent, cat: LogistiekCategory) => {
        if (!supabase) return;
        const { active, over } = e;
        if (!over || active.id === over.id) return;
        const list = grouped[cat];
        const oldIdx = list.findIndex(i => i.id === active.id);
        const newIdx = list.findIndex(i => i.id === over.id);
        if (oldIdx < 0 || newIdx < 0) return;
        const next = arrayMove(list, oldIdx, newIdx);
        /* Optimistic update — wijzig sort_order in lokale state. */
        const sortMap = new Map<string, number>();
        next.forEach((it, i) => { sortMap.set(it.id, i + 1); });
        setItems(prev => prev.map(it => sortMap.has(it.id) ? { ...it, sort_order: sortMap.get(it.id)! } : it));

        /* Bulk-update sort_order via individuele rows (in batch, max 6× geweld). */
        const updates = next.map((it, i) => ({ id: it.id, sort_order: i + 1 }));
        for (const u of updates) {
            await supabase.from('event_checklist_items').update({ sort_order: u.sort_order }).eq('id', u.id);
        }
    }, [grouped]);

    if (loading) {
        return (
            <div className="rounded-2xl px-6 py-12 grid place-items-center"
                style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
                <Loader2 size={20} className="animate-spin" style={{ color: 'var(--brand)' }} />
            </div>
        );
    }

    if (items.length === 0) {
        return (
            <div className="rounded-2xl px-8 py-12 text-center"
                style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
                <div className="w-14 h-14 rounded-2xl mx-auto mb-4 grid place-items-center"
                    style={{ background: 'rgba(255,191,0,.08)', border: '1px solid rgba(255,191,0,.2)', color: 'var(--brand)' }}>
                    <ClipboardCheck size={26} />
                </div>
                <div className="text-[16px] font-semibold mb-2">Nog geen logistiek-checklist</div>
                <p className="text-[13px] mb-5 max-w-md mx-auto leading-relaxed" style={{ color: 'var(--muted)' }}>
                    Bij offerte-acceptatie zet de AI een voorstel klaar. Je kan ook handmatig items toevoegen.
                </p>
                <Link href={`/logistiek?proposal=${eventId}`}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-[13px] font-bold"
                    style={{ background: 'var(--brand)', color: '#000' }}>
                    <Sparkles size={14} /> Vraag AI om voorstel
                </Link>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-3">
            {LOGISTIEK_SECTIONS.map(sec => {
                const list = grouped[sec.id];
                if (list.length === 0) return null;
                const doneCount = list.filter(i => i.done).length;
                const sectionPct = Math.round((doneCount / list.length) * 100);
                const sectionDone = doneCount === list.length;
                const isExpanded = expanded[sec.id];
                return (
                    <div key={sec.id} className="rounded-2xl overflow-hidden"
                        style={{
                            background: 'var(--card)',
                            border: '1px solid var(--border)',
                            borderLeft: sectionDone ? '3px solid var(--green)' : '3px solid transparent',
                        }}>
                        {/* Accordion head */}
                        <div className="flex items-center gap-3 px-4 py-3.5 cursor-pointer"
                            style={{ background: sectionDone ? 'rgba(34,197,94,.03)' : 'transparent' }}
                            onClick={() => toggleSection(sec.id)}>
                            <span className="text-[22px]">{sec.emoji}</span>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                    <span className="text-[14px] font-semibold uppercase tracking-[0.02em]">{sec.label}</span>
                                    {sectionDone && <Check size={14} style={{ color: 'var(--green)' }} />}
                                </div>
                                <div className="flex items-center gap-2 mt-1">
                                    <span className="text-[12px] font-medium tabular-nums" style={{ color: 'var(--muted)' }}>{doneCount}/{list.length}</span>
                                    <div className="w-20 h-1 rounded-full overflow-hidden" style={{ background: 'rgba(130,130,130,.1)' }}>
                                        <div style={{ width: `${sectionPct}%`, height: '100%', background: sectionDone ? 'var(--green)' : 'var(--brand-gold)', transition: 'width .3s' }} />
                                    </div>
                                    <span className="text-[11px] font-semibold" style={{ color: sectionDone ? 'var(--green)' : 'var(--muted)' }}>{sectionPct}%</span>
                                </div>
                            </div>
                            <div className="flex gap-1.5" onClick={(e) => e.stopPropagation()}>
                                <button onClick={() => acceptAll(sec.id)}
                                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-semibold"
                                    style={{ background: 'rgba(34,197,94,.06)', border: '1px solid rgba(34,197,94,.25)', color: 'var(--green)' }}
                                    title="Vink hele sectie af"
                                >
                                    <CheckCheck size={12} /> Alles
                                </button>
                            </div>
                            <button className="w-8 h-8 rounded-md grid place-items-center"
                                style={{ background: 'transparent', color: 'var(--muted)' }}
                                aria-label={isExpanded ? 'Sectie inklappen' : 'Sectie uitklappen'}>
                                {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                            </button>
                        </div>

                        {isExpanded && (
                            <DndContext
                                sensors={sensors}
                                collisionDetection={closestCenter}
                                onDragEnd={(e) => handleDragEnd(e, sec.id)}
                            >
                                <SortableContext items={list.map(i => i.id)} strategy={verticalListSortingStrategy}>
                                    <div>
                                        {list.map(item => (
                                            <SortableRow
                                                key={item.id}
                                                item={item}
                                                onToggle={toggleItem}
                                                onEdit={setEditTarget}
                                            />
                                        ))}
                                    </div>
                                </SortableContext>
                            </DndContext>
                        )}
                    </div>
                );
            })}

            {/* Totaal-strip */}
            <div className="rounded-2xl mt-2 px-5 py-3.5 flex items-center justify-between flex-wrap gap-3"
                style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
                <div className="flex items-center gap-3">
                    <ClipboardCheck size={18} style={{ color: 'var(--brand)' }} />
                    <span className="text-[13px] font-semibold">
                        {totalDone}/{totalAll} checks · {pct}% klaar
                    </span>
                </div>
                <Link href="/logistiek/field"
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-bold"
                    style={{ background: 'var(--brand)', color: '#000', boxShadow: '0 4px 16px rgba(255,191,0,.3)' }}>
                    <Smartphone size={14} /> Open Veldmodus
                </Link>
            </div>

            {editTarget && <EditDrawer item={editTarget} onClose={() => setEditTarget(null)} onSaved={() => setEditTarget(null)} />}
        </div>
    );
}

/* ────────────────────────── Sortable row ────────────────────────── */

function SortableRow({ item, onToggle, onEdit }: {
    item: DbChecklistItem;
    onToggle: (id: string) => void;
    onEdit: (item: DbChecklistItem) => void;
}) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
    const style: React.CSSProperties = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        background: item.done ? 'rgba(34,197,94,.02)' : 'transparent',
    };

    const isAi = item.source === 'ai';
    const src = item.ai_citation?.ref || (isAi ? 'standaard' : undefined);
    const srcColor = src ? SOURCE_REF_LABEL[src]?.color : undefined;

    return (
        <div ref={setNodeRef} style={style}
            className="flex items-center gap-3 px-4 py-2.5 border-b last:border-b-0"
            data-row-id={item.id}>
            {/* Drag handle */}
            <button {...attributes} {...listeners}
                className="w-6 h-6 grid place-items-center cursor-grab active:cursor-grabbing"
                style={{ color: 'var(--muted-weak)' }}
                aria-label="Sleep om volgorde te wijzigen"
            >
                <GripVertical size={14} />
            </button>

            {/* Checkbox */}
            <button onClick={() => onToggle(item.id)}
                className="w-6 h-6 rounded-md grid place-items-center shrink-0 transition-all"
                style={{
                    background: item.done ? 'var(--brand)' : 'transparent',
                    border: item.done ? 'none' : '2px solid var(--border)',
                }}
                aria-label={item.done ? 'Markeer als open' : 'Markeer als klaar'}
                aria-pressed={item.done}
            >
                {item.done && <Check size={14} color="#000" />}
            </button>

            {/* Label */}
            <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium" style={{
                    color: item.done ? 'var(--muted)' : 'var(--text)',
                    textDecoration: item.done ? 'line-through' : 'none',
                }}>
                    {item.label}
                </div>
                {item.ai_citation?.sum && (
                    <div className="text-[10px] mt-0.5 font-mono whitespace-nowrap overflow-hidden text-ellipsis"
                        style={{ color: 'var(--muted-weak)' }}>
                        {item.ai_citation.sum}
                    </div>
                )}
            </div>

            {/* Qty */}
            {typeof item.qty === 'number' && item.qty > 0 && (
                <span className="text-[12px] font-semibold tabular-nums whitespace-nowrap"
                    style={{ color: 'var(--muted)' }}>
                    {item.qty}{item.unit ? ` ${item.unit}` : ''}
                </span>
            )}

            {/* AI / Eigen badge */}
            {isAi ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold"
                    style={{ background: 'rgba(255,191,0,.1)', color: 'var(--brand)', border: '1px solid rgba(255,191,0,.25)' }}
                    title={item.ai_citation?.src || 'AI-voorstel'}
                >
                    <Sparkles size={10} /> AI
                </span>
            ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold"
                    style={{ background: 'rgba(130,130,130,.08)', color: 'var(--muted)', border: '1px solid var(--border)' }}>
                    <Pencil size={10} /> Eigen
                </span>
            )}

            {srcColor && (
                <span className="hidden md:inline-block w-1.5 h-1.5 rounded-full" style={{ background: srcColor }}
                    title={SOURCE_REF_LABEL[src!]?.label} />
            )}

            {/* Edit */}
            <button onClick={() => onEdit(item)}
                className="w-7 h-7 rounded-md grid place-items-center"
                style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--muted)' }}
                aria-label="Bewerk item"
            >
                <Pencil size={12} />
            </button>
        </div>
    );
}

/* ────────────────────────── Edit drawer ────────────────────────── */

function EditDrawer({ item, onClose, onSaved }: { item: DbChecklistItem; onClose: () => void; onSaved: () => void }) {
    const showToast = useToast();
    const [label, setLabel] = useState(item.label);
    const [category, setCategory] = useState<LogistiekCategory>(item.category);
    const [qty, setQty] = useState<string>(item.qty != null ? String(item.qty) : '');
    const [unit, setUnit] = useState<string>(item.unit ?? '');
    const [saving, setSaving] = useState(false);

    const save = async () => {
        if (!supabase) return;
        setSaving(true);
        const { error } = await supabase
            .from('event_checklist_items')
            .update({
                label: label.trim().slice(0, 200),
                category,
                qty: qty.trim() === '' ? null : Math.max(0, Number.parseInt(qty, 10) || 0),
                unit: unit.trim() || null,
            })
            .eq('id', item.id);
        setSaving(false);
        if (error) { showToast('Opslaan mislukt: ' + error.message, 'error'); return; }
        showToast('Check bijgewerkt', 'success');
        onSaved();
    };

    const remove = async () => {
        if (!supabase) return;
        if (!window.confirm('Check verwijderen?')) return;
        setSaving(true);
        const { error } = await supabase.from('event_checklist_items').delete().eq('id', item.id);
        setSaving(false);
        if (error) { showToast('Verwijderen mislukt: ' + error.message, 'error'); return; }
        onSaved();
    };

    return (
        <div className="fixed inset-0 z-[1000] flex items-stretch justify-end bg-black/50 backdrop-blur-sm" onClick={onClose}>
            <div onClick={e => e.stopPropagation()}
                className="relative w-full max-w-[420px] h-full flex flex-col"
                style={{ background: 'var(--bg-elevated)', borderLeft: '1px solid var(--border)' }}>
                <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
                    <div className="flex items-center gap-2">
                        <Pencil size={14} style={{ color: 'var(--brand)' }} />
                        <span className="text-[14px] font-semibold">Check bewerken</span>
                    </div>
                    <button onClick={onClose} className="w-8 h-8 rounded-md grid place-items-center"
                        style={{ background: 'transparent', color: 'var(--muted)', border: '1px solid var(--border)' }}
                        aria-label="Sluit drawer">
                        <X size={14} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
                    <Field label="Label">
                        <input value={label} onChange={e => setLabel(e.target.value)} maxLength={200}
                            className="w-full px-3 py-2 rounded-md text-[13px]"
                            style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text)' }} />
                    </Field>

                    <Field label="Sectie">
                        <select value={category} onChange={e => setCategory(e.target.value as LogistiekCategory)}
                            className="w-full px-3 py-2 rounded-md text-[13px]"
                            style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text)' }}>
                            {LOGISTIEK_SECTIONS.map(s => <option key={s.id} value={s.id}>{s.emoji} {s.label}</option>)}
                        </select>
                    </Field>

                    <div className="grid grid-cols-2 gap-3">
                        <Field label="Aantal">
                            <input value={qty} onChange={e => setQty(e.target.value)} inputMode="numeric"
                                className="w-full px-3 py-2 rounded-md text-[13px]"
                                style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text)' }} />
                        </Field>
                        <Field label="Eenheid">
                            <input value={unit} onChange={e => setUnit(e.target.value)} maxLength={20}
                                placeholder="st, kg, L, …"
                                className="w-full px-3 py-2 rounded-md text-[13px]"
                                style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text)' }} />
                        </Field>
                    </div>

                    {item.source === 'ai' && item.ai_citation && (
                        <div className="rounded-lg px-3 py-3" style={{ background: 'rgba(255,191,0,.04)', border: '1px solid rgba(255,191,0,.18)' }}>
                            <div className="flex items-center gap-2 mb-1.5">
                                <Info size={12} style={{ color: 'var(--brand)' }} />
                                <span className="text-[10px] font-bold uppercase tracking-[0.1em]" style={{ color: 'var(--brand)' }}>AI-bron</span>
                            </div>
                            <div className="text-[12px] mb-1">{item.ai_citation.sum}</div>
                            <div className="text-[10px] font-mono" style={{ color: 'var(--muted)' }}>
                                {item.ai_citation.src} — {item.ai_citation.ref}
                            </div>
                        </div>
                    )}
                </div>

                <div className="flex items-center gap-2 px-5 py-4 border-t" style={{ borderColor: 'var(--border)' }}>
                    <button onClick={save} disabled={saving}
                        className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-[13px] font-bold disabled:opacity-40"
                        style={{ background: 'var(--brand)', color: '#000' }}>
                        {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                        Opslaan
                    </button>
                    <button onClick={remove} disabled={saving}
                        className="px-3 py-2.5 rounded-lg text-[12px] font-semibold"
                        style={{ background: 'rgba(239,68,68,.06)', border: '1px solid rgba(239,68,68,.3)', color: 'var(--red)' }}>
                        Verwijderen
                    </button>
                    <button onClick={onClose} className="px-3 py-2.5 rounded-lg text-[12px]"
                        style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--muted)' }}>
                        Annuleer
                    </button>
                </div>
            </div>
        </div>
    );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div>
            <label className="block text-[10px] font-bold tracking-[0.1em] uppercase mb-1.5" style={{ color: 'var(--muted)' }}>{label}</label>
            {children}
        </div>
    );
}

