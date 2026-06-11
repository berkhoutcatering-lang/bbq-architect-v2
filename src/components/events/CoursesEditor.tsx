/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

/**
 * Editor voor de `courses`-tabel: gangen per event met mise-items en
 * per-tafel portion-distribution. Resultaat wordt direct door Service Mode
 * KDS gelezen via lib/serviceData.ts.
 *
 * Scope (intentioneel klein):
 *  - title + description + emoji + status + prep/serve-tijden
 *  - mise: lijst van { item, qty } (UI-only; geen inventory-link in v1)
 *  - per-tafel items: auto-distribute totaal-portions over N tafels
 *
 * Bewust niét in v1:
 *  - bereidingsstappen (steps) en plating/quality_checks tekst-arrays
 *    → te veel velden voor de eerste editor; user kan dat later met SQL/JSON
 *  - drag-reorder → simpele up/down knoppen volstaan
 *  - inventory-koppeling op mise → komt in v2 als de courses-flow geadopteerd is
 */

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Plus, Trash2, GripVertical, Save, ChevronUp, ChevronDown, X, Sparkles, Wand2 } from 'lucide-react';
import type { DbCourse, CourseMise, CourseItem } from '@/types';
import { useToast } from '@/components/Toast';
import { seedCoursesFromMenu } from '@/lib/acceptance-workflow';

interface Props {
    eventId: number;
    /* totaal-aantal gasten — gebruikt voor portion-auto-distribution. */
    eventGuests: number;
    onSaved?: () => void;
}

const STATUS_OPTIONS: DbCourse['status'][] = ['queued', 'active', 'ready', 'served', 'recalled'];
const STATUS_LABELS: Record<DbCourse['status'], string> = {
    queued: 'Wachtend',
    active: 'Bezig',
    ready: 'Klaar',
    served: 'Geserveerd',
    recalled: 'Teruggeroepen',
};

/* Intern editing-shape — enkel de velden die de UI exposeert, plus
   passthrough-velden die de UI niet toont maar die bij save (delete-then-
   insert) NIET verloren mogen gaan: steps komen o.a. uit de actieplan-
   generator in Service Mode, gerecht_ids uit de menu-koppeling. */
interface EditableCourse {
    id?: number;        // bestaande row in DB; undefined = nieuw
    num: number;
    title: string;
    description: string;
    status: DbCourse['status'];
    emoji: string;
    prep_time_minutes: number | null;
    serve_offset_minutes: number | null;
    mise: CourseMise[];
    items: CourseItem[];
    /* Passthrough (niet in UI): */
    steps?: unknown[];
    plating?: unknown[];
    quality_checks?: unknown[];
    gerecht_id?: string | null;
    gerecht_ids?: string[] | null;
    image_gradient?: string | null;
    veg_option?: string | null;
    ai_note?: string | null;
}

/** Verdeel `total` portions zo gelijk mogelijk over `tableCount` tafels.
 *  Voorbeeld: 44 / 6 → [8,8,8,8,8,4] (eerste-vol-eerst). */
function distributePortions(total: number, tableCount: number): CourseItem[] {
    if (tableCount <= 0) return [];
    const base = Math.floor(total / tableCount);
    const rest = total - base * tableCount;
    return Array.from({ length: tableCount }, (_, i) => ({
        table: i + 1,
        count: base + (i < rest ? 1 : 0),
        served: false,
        ready: false,
        inProgress: false,
    }));
}

function emptyCourse(num: number, guests: number, defaultTables = 6): EditableCourse {
    return {
        num,
        title: '',
        description: '',
        status: 'queued',
        emoji: '🍽️',
        prep_time_minutes: 15,
        serve_offset_minutes: (num - 1) * 30,
        mise: [],
        items: distributePortions(guests || 0, defaultTables),
    };
}

export default function CoursesEditor({ eventId, eventGuests, onSaved }: Props) {
    const showToast = useToast();
    const [courses, setCourses] = useState<EditableCourse[]>([]);
    const [tableCount, setTableCount] = useState(6);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [openIdx, setOpenIdx] = useState<number | null>(null);

    /* Laad bestaande courses voor dit event. Losse functie zodat
       "Bouw uit menu" na het seeden opnieuw kan laden. */
    async function fetchCourses(): Promise<void> {
        const { data, error } = await supabase
            .from('courses')
            .select('*')
            .eq('event_id', eventId)
            .order('num', { ascending: true });
        if (error) { console.warn('[CoursesEditor] load failed:', error); setLoading(false); return; }
        const rows = (data || []) as DbCourse[];
        setCourses(rows.map(r => ({
            id: r.id,
            num: r.num,
            title: r.title,
            description: r.description || '',
            status: r.status,
            emoji: r.emoji || '🍽️',
            prep_time_minutes: r.prep_time_minutes ?? null,
            serve_offset_minutes: r.serve_offset_minutes ?? null,
            mise: Array.isArray(r.mise) ? r.mise : [],
            items: Array.isArray(r.items) ? r.items : [],
            /* Passthrough — behouden bij save, niet zichtbaar in de UI. */
            steps: Array.isArray(r.steps) ? r.steps : [],
            plating: Array.isArray(r.plating) ? r.plating : [],
            quality_checks: Array.isArray(r.quality_checks) ? r.quality_checks : [],
            gerecht_id: r.gerecht_id ?? null,
            gerecht_ids: Array.isArray(r.gerecht_ids) ? r.gerecht_ids : [],
            image_gradient: r.image_gradient ?? null,
            veg_option: r.veg_option ?? null,
            ai_note: r.ai_note ?? null,
        })));
        /* Detect bestaand tableCount uit eerste course; fallback op 6. */
        if (rows[0] && Array.isArray(rows[0].items) && rows[0].items.length > 0) {
            setTableCount(rows[0].items.length);
        }
        setLoading(false);
    }

    useEffect(() => {
        void fetchCourses();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [eventId]);

    function setCourse(idx: number, patch: Partial<EditableCourse>) {
        setCourses(prev => prev.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
    }

    function addCourse() {
        const num = courses.length + 1;
        const c = emptyCourse(num, eventGuests, tableCount);
        setCourses(prev => [...prev, c]);
        setOpenIdx(courses.length);
    }

    function removeCourse(idx: number) {
        if (!confirm('Gang verwijderen?')) return;
        setCourses(prev => prev.filter((_, i) => i !== idx).map((c, i) => ({ ...c, num: i + 1 })));
        setOpenIdx(null);
    }

    function moveCourse(idx: number, dir: -1 | 1) {
        const j = idx + dir;
        if (j < 0 || j >= courses.length) return;
        setCourses(prev => {
            const next = [...prev];
            [next[idx], next[j]] = [next[j], next[idx]];
            return next.map((c, i) => ({ ...c, num: i + 1 }));
        });
    }

    const [building, setBuilding] = useState(false);

    /* "Bouw uit menu" — zelfde code-pad als de acceptance-workflow (stap 5),
       maar handmatig triggerbaar voor events die vóór die workflow bestonden
       of waar de gangen opnieuw opgebouwd moeten worden. */
    async function buildFromMenu() {
        if (courses.length > 0 && !confirm('Dit vervangt de huidige gangen door het menu van de offerte. Doorgaan?')) return;
        setBuilding(true);
        try {
            /* Offerte zoeken: via events.offerte_id, anders omgekeerd via offertes.event_id. */
            const { data: ev } = await supabase.from('events').select('id, offerte_id').eq('id', eventId).single();
            let offerte: { menu_selectie?: unknown } | null = null;
            if (ev?.offerte_id) {
                const { data } = await supabase.from('offertes').select('id, menu_selectie').eq('id', ev.offerte_id).maybeSingle();
                offerte = data;
            }
            if (!offerte) {
                const { data } = await supabase.from('offertes').select('id, menu_selectie').eq('event_id', eventId)
                    .order('id', { ascending: false }).limit(1).maybeSingle();
                offerte = data;
            }
            const menuSel = offerte?.menu_selectie;
            const isEmpty = !menuSel || (typeof menuSel === 'object' && Object.keys(menuSel as object).length === 0);
            if (isEmpty) {
                showToast('Geen offerte-menu gevonden voor dit event — koppel eerst een offerte met een menu.', 'warning');
                return;
            }
            const result = await seedCoursesFromMenu(supabase, eventId, menuSel, { replaceExisting: true });
            if (!result.success) { showToast(result.message, 'error'); return; }
            showToast(result.message, 'success');
            setLoading(true);
            await fetchCourses();
            onSaved?.();
        } catch (e: any) {
            showToast('Bouwen uit menu mislukt: ' + (e?.message || 'onbekende fout'), 'error');
        } finally {
            setBuilding(false);
        }
    }

    function changeTableCount(n: number) {
        const safe = Math.max(1, Math.min(40, n));
        setTableCount(safe);
        /* Opnieuw distribueren voor alle courses op basis van eventGuests. */
        setCourses(prev => prev.map(c => ({ ...c, items: distributePortions(eventGuests || 0, safe) })));
    }

    function addMise(idx: number) {
        setCourse(idx, { mise: [...courses[idx].mise, { item: '', qty: '' }] });
    }
    function setMise(idx: number, mIdx: number, patch: Partial<CourseMise>) {
        setCourses(prev => prev.map((c, i) => i !== idx ? c : ({
            ...c,
            mise: c.mise.map((m, k) => k === mIdx ? { ...m, ...patch } : m),
        })));
    }
    function removeMise(idx: number, mIdx: number) {
        setCourse(idx, { mise: courses[idx].mise.filter((_, k) => k !== mIdx) });
    }

    async function save() {
        setSaving(true);
        try {
            /* Strategie: delete-then-insert. Eenvoudig + atomic per event.
               Met max ~10 courses per event acceptable. Bij echte multi-user
               schaling later een MERGE/upsert per row. */
            const { error: delErr } = await supabase.from('courses').delete().eq('event_id', eventId);
            if (delErr) throw delErr;

            if (courses.length > 0) {
                const rows = courses.map(c => ({
                    event_id: eventId,
                    num: c.num,
                    title: c.title || `Gang ${c.num}`,
                    description: c.description,
                    status: c.status,
                    emoji: c.emoji,
                    prep_time_minutes: c.prep_time_minutes,
                    serve_offset_minutes: c.serve_offset_minutes,
                    mise: c.mise,
                    items: c.items,
                    /* Passthrough — eerder gingen steps (actieplan!) en de
                       gerecht-koppeling hier stilletjes verloren bij elke save. */
                    steps: c.steps ?? [],
                    plating: c.plating ?? [],
                    quality_checks: c.quality_checks ?? [],
                    image_gradient: c.image_gradient ?? null,
                    veg_option: c.veg_option ?? null,
                    ai_note: c.ai_note ?? null,
                    gerecht_id: c.gerecht_id ?? null,
                    gerecht_ids: c.gerecht_ids ?? [],
                }));
                let { error: insErr } = await supabase.from('courses').insert(rows);
                /* Koppel-migraties nog niet gedraaid → kolom ontbreekt.
                   Strip de optionele velden en retry (zelfde vangnet als
                   autoCreateCourses in acceptance-workflow). */
                if (insErr && /Could not find the '(\w+)' column|column "?\w+"? .* does not exist/i.test(insErr.message)) {
                    const stripped = rows.map(r => {
                        // eslint-disable-next-line @typescript-eslint/no-unused-vars
                        const { gerecht_id, gerecht_ids, ...rest } = r;
                        return rest;
                    });
                    const retry = await supabase.from('courses').insert(stripped);
                    insErr = retry.error;
                }
                if (insErr) throw insErr;
            }
            onSaved?.();
        } catch (e: any) {
            console.error('[CoursesEditor] save failed:', e);
            showToast('Opslaan mislukt: ' + (e?.message || 'onbekende fout'), 'error');
        } finally {
            setSaving(false);
        }
    }

    if (loading) return <div style={{ padding: 16, color: 'var(--muted)', fontSize: 13 }}>Laden…</div>;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>Aantal tafels:</span>
                    <input
                        type="number" min={1} max={40}
                        value={tableCount}
                        onChange={e => changeTableCount(parseInt(e.target.value) || 1)}
                        style={{ width: 64, padding: '6px 8px', fontSize: 12, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)' }}
                    />
                    <span style={{ fontSize: 11, color: 'var(--muted-light, var(--muted))' }}>
                        {eventGuests || 0} gasten / {tableCount} tafels = ~{Math.ceil((eventGuests || 0) / Math.max(1, tableCount))} pp
                    </span>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    <button
                        className="btn btn-ghost btn-sm"
                        onClick={buildFromMenu}
                        disabled={building}
                        title="Genereer de gangen uit het offerte-menu van dit event (incl. gerecht-koppeling en mise)"
                    >
                        {building ? <><Sparkles size={12} className="animate-pulse" /> Bouwen…</> : <><Wand2 size={12} /> Bouw uit menu</>}
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={addCourse}><Plus size={12} /> Gang</button>
                    <button className="btn btn-brand btn-sm" onClick={save} disabled={saving}>
                        {saving ? <><Sparkles size={12} className="animate-pulse" /> Opslaan…</> : <><Save size={12} /> Opslaan</>}
                    </button>
                </div>
            </div>

            {courses.length === 0 && (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)', fontSize: 13, border: '1px dashed var(--border)', borderRadius: 10 }}>
                    Nog geen gangen — klik <strong>+ Gang</strong> om de eerste toe te voegen.
                </div>
            )}

            {courses.map((c, idx) => {
                const isOpen = openIdx === idx;
                return (
                    <div key={idx} style={{ border: '1px solid var(--border)', borderRadius: 10, background: 'rgba(28,28,32,.5)', overflow: 'hidden' }}>
                        {/* Header — altijd zichtbaar */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 12, cursor: 'pointer' }}
                            onClick={() => setOpenIdx(isOpen ? null : idx)}>
                            <GripVertical size={14} style={{ color: 'var(--muted)' }} />
                            <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700, minWidth: 40 }}>#{c.num}</span>
                            <span style={{ fontSize: 18 }}>{c.emoji}</span>
                            <input
                                value={c.title}
                                onChange={e => setCourse(idx, { title: e.target.value })}
                                onClick={e => e.stopPropagation()}
                                placeholder="Gang-naam"
                                style={{ flex: 1, padding: '6px 10px', fontSize: 13, fontWeight: 600, background: 'transparent', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)' }}
                            />
                            <span style={{ fontSize: 11, color: 'var(--muted)' }}>{c.mise.length} mise · {c.items.reduce((s, i) => s + i.count, 0)}p</span>
                            <button className="btn btn-ghost btn-sm" onClick={e => { e.stopPropagation(); moveCourse(idx, -1); }} disabled={idx === 0}><ChevronUp size={12} /></button>
                            <button className="btn btn-ghost btn-sm" onClick={e => { e.stopPropagation(); moveCourse(idx, 1); }} disabled={idx === courses.length - 1}><ChevronDown size={12} /></button>
                            <button className="btn btn-ghost btn-sm" onClick={e => { e.stopPropagation(); removeCourse(idx); }} style={{ color: 'var(--red)' }}><Trash2 size={12} /></button>
                        </div>

                        {/* Detail — uitklapbaar */}
                        {isOpen && (
                            <div style={{ padding: 14, borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 12 }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '60px 1fr 1fr 120px', gap: 8, alignItems: 'end' }}>
                                    <div>
                                        <label style={{ fontSize: 10, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Emoji</label>
                                        <input value={c.emoji} onChange={e => setCourse(idx, { emoji: e.target.value })} maxLength={4}
                                            style={{ width: '100%', padding: '6px 10px', fontSize: 16, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', textAlign: 'center' }} />
                                    </div>
                                    <div>
                                        <label style={{ fontSize: 10, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Prep-tijd (min)</label>
                                        <input type="number" value={c.prep_time_minutes ?? ''} onChange={e => setCourse(idx, { prep_time_minutes: e.target.value === '' ? null : parseInt(e.target.value) })}
                                            style={{ width: '100%', padding: '6px 10px', fontSize: 12, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)' }} />
                                    </div>
                                    <div>
                                        <label style={{ fontSize: 10, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Serveer-offset (min na start)</label>
                                        <input type="number" value={c.serve_offset_minutes ?? ''} onChange={e => setCourse(idx, { serve_offset_minutes: e.target.value === '' ? null : parseInt(e.target.value) })}
                                            style={{ width: '100%', padding: '6px 10px', fontSize: 12, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)' }} />
                                    </div>
                                    <div>
                                        <label style={{ fontSize: 10, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Status</label>
                                        <select value={c.status} onChange={e => setCourse(idx, { status: e.target.value as DbCourse['status'] })}
                                            style={{ width: '100%', padding: '6px 10px', fontSize: 12, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)' }}>
                                            {STATUS_OPTIONS.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                                        </select>
                                    </div>
                                </div>

                                <div>
                                    <label style={{ fontSize: 10, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Omschrijving (1-2 zinnen)</label>
                                    <textarea rows={2} value={c.description} onChange={e => setCourse(idx, { description: e.target.value })}
                                        placeholder="bv. Pulled pork sandwich met huisgemaakte coleslaw en pickles"
                                        style={{ width: '100%', padding: '8px 10px', fontSize: 12, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', resize: 'vertical' }} />
                                </div>

                                {/* Mise-en-place */}
                                <div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                                        <label style={{ fontSize: 10, color: 'var(--muted)' }}>Mise-en-place</label>
                                        <button className="btn btn-ghost btn-sm" onClick={() => addMise(idx)}><Plus size={11} /> Item</button>
                                    </div>
                                    {c.mise.length === 0 && <div style={{ fontSize: 11, color: 'var(--muted)', padding: '8px 0', fontStyle: 'italic' }}>Nog geen mise-items.</div>}
                                    {c.mise.map((m, mIdx) => (
                                        <div key={mIdx} style={{ display: 'grid', gridTemplateColumns: '1fr 140px 32px', gap: 6, marginBottom: 4 }}>
                                            <input value={m.item} onChange={e => setMise(idx, mIdx, { item: e.target.value })} placeholder="Pulled pork"
                                                style={{ padding: '6px 10px', fontSize: 12, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)' }} />
                                            <input value={m.qty} onChange={e => setMise(idx, mIdx, { qty: e.target.value })} placeholder="8 kg"
                                                style={{ padding: '6px 10px', fontSize: 12, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)' }} />
                                            <button className="btn btn-ghost btn-sm" onClick={() => removeMise(idx, mIdx)} style={{ color: 'var(--red)' }}><X size={12} /></button>
                                        </div>
                                    ))}
                                </div>

                                {/* Per-tafel portions — read-only preview, gegenereerd uit guests/tafels */}
                                <div>
                                    <label style={{ fontSize: 10, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Per-tafel portions ({c.items.reduce((s, i) => s + i.count, 0)} totaal)</label>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                        {c.items.map((it, k) => (
                                            <div key={k} style={{ padding: '6px 12px', borderRadius: 6, background: 'rgba(255,255,255,.04)', border: '1px solid var(--border)', fontSize: 11, color: 'var(--text)' }}>
                                                T{it.table}: <strong>{it.count}p</strong>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
