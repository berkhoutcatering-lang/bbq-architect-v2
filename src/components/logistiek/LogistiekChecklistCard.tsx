'use client';
import { useEffect, useState, useTransition } from 'react';
import {
    ClipboardList, Sparkles, Loader2, Check, X, Trash2, RefreshCw,
    Truck, ChefHat, Users, Wrench, AlertCircle,
} from 'lucide-react';
import { saveLogistiekChecklist, toggleLogistiekItem, deleteLogistiekChecklist } from '@/app/logistiek/actions';
import { supabase } from '@/lib/supabase';

interface ChecklistItem {
    categorie: 'materieel' | 'mensen' | 'voorbereiding' | 'transport';
    tekst: string;
    hoeveelheid?: string | null;
    eenheid?: string | null;
    done: boolean;
    ai_suggested: boolean;
}

interface ChecklistRow {
    id: string;
    event_id: number;
    items: ChecklistItem[];
    generated_at: string;
    accepted_at: string | null;
    ai_model: string | null;
    ai_prompt_version: string | null;
}

interface Props {
    eventId: number;
    eventName?: string | null;
}

const CATEGORY_META: Record<ChecklistItem['categorie'], { label: string; Icon: typeof Wrench; color: string }> = {
    materieel:      { label: 'Materieel',      Icon: Wrench,    color: '#FFBF00' },
    mensen:         { label: 'Mensen',         Icon: Users,     color: '#60a5fa' },
    voorbereiding:  { label: 'Voorbereiding',  Icon: ChefHat,   color: '#a78bfa' },
    transport:      { label: 'Transport',      Icon: Truck,     color: '#10b981' },
};

/* Herbruikbare card die op event-detail pages getoond wordt. Drie states:
   1. Geen checklist → "AI-voorstel maken" knop
   2. Generating preview → loading
   3. Preview modal open → items met accept/aanpassen/cancel
   4. Saved checklist → categorieën met checkboxes */
export default function LogistiekChecklistCard({ eventId, eventName }: Props) {
    const [row, setRow] = useState<ChecklistRow | null>(null);
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [preview, setPreview] = useState<ChecklistItem[] | null>(null);
    const [previewMeta, setPreviewMeta] = useState<{ model: string; promptVersion: string } | null>(null);
    const [pendingSave, startSave] = useTransition();
    const [pendingDelete, startDelete] = useTransition();

    /* Initial load + realtime sub voor cross-tab sync. */
    useEffect(function () {
        let cancelled = false;
        (async function () {
            const { data, error } = await supabase
                .from('logistiek_checklists')
                .select('id, event_id, items, generated_at, accepted_at, ai_model, ai_prompt_version')
                .eq('event_id', eventId)
                .maybeSingle();
            if (cancelled) return;
            if (error && error.code !== 'PGRST116') {
                setError(error.message);
            } else if (data) {
                setRow(data as ChecklistRow);
            }
            setLoading(false);
        })();
        const ch = supabase
            .channel(`logistiek_${eventId}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'logistiek_checklists', filter: `event_id=eq.${eventId}` }, (payload) => {
                if (payload.eventType === 'DELETE') setRow(null);
                else if (payload.new) setRow(payload.new as ChecklistRow);
            })
            .subscribe();
        return function () { cancelled = true; supabase.removeChannel(ch); };
    }, [eventId]);

    async function generate() {
        setError(null);
        setGenerating(true);
        try {
            const res = await fetch('/api/logistiek/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ event_id: eventId }),
            });
            const body = await res.json();
            if (!res.ok) {
                setError(body.error || 'Genereren mislukt');
                return;
            }
            setPreview(body.items as ChecklistItem[]);
            setPreviewMeta({ model: body.model, promptVersion: body.prompt_version });
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setGenerating(false);
        }
    }

    function acceptPreview() {
        if (!preview) return;
        startSave(async function () {
            const res = await saveLogistiekChecklist({
                event_id: eventId,
                items: preview,
                ai_model: previewMeta?.model ?? null,
                ai_prompt_version: previewMeta?.promptVersion ?? null,
            });
            if ('error' in res) {
                setError(res.error);
                return;
            }
            setPreview(null);
            setPreviewMeta(null);
        });
    }

    function discardPreview() {
        setPreview(null);
        setPreviewMeta(null);
    }

    function toggle(itemIndex: number, done: boolean) {
        /* Optimistic update */
        if (row) {
            const next = [...row.items];
            next[itemIndex] = { ...next[itemIndex], done };
            setRow({ ...row, items: next });
        }
        startSave(async function () {
            await toggleLogistiekItem({ event_id: eventId, item_index: itemIndex, done });
        });
    }

    function deleteChecklist() {
        if (!confirm('Checklist wissen? Je kunt opnieuw een AI-voorstel maken.')) return;
        startDelete(async function () {
            const res = await deleteLogistiekChecklist({ event_id: eventId });
            if ('error' in res) {
                setError(res.error);
                return;
            }
            setRow(null);
        });
    }

    if (loading) return null;

    /* State 1: no checklist + no preview → CTA */
    if (!row && !preview) {
        return (
            <div style={cardStyle}>
                <Header eventName={eventName} />
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '24px 16px', textAlign: 'center', gap: 12 }}>
                    <ClipboardList size={28} color="var(--muted-light)" />
                    <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                        Nog geen logistiek-checklist voor dit event.
                    </div>
                    <button
                        onClick={generate}
                        disabled={generating}
                        style={primaryBtnStyle}
                    >
                        {generating
                            ? <><Loader2 size={13} className="animate-spin" /> AI maakt voorstel…</>
                            : <><Sparkles size={13} /> AI-voorstel maken</>}
                    </button>
                    {error && (
                        <div role="alert" style={errorStyle}>
                            <AlertCircle size={12} /> {error}
                        </div>
                    )}
                </div>
            </div>
        );
    }

    /* State 2: preview modal (drawer-stijl, niet full-screen) */
    if (preview) {
        const grouped = groupByCategorie(preview);
        return (
            <div style={cardStyle}>
                <Header eventName={eventName} aiBadge />
                <div style={{ padding: '14px 18px 4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                        AI-voorstel — {preview.length} items
                    </span>
                    <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={discardPreview} disabled={pendingSave} style={ghostBtnSmStyle}>
                            <X size={11} /> Annuleer
                        </button>
                        <button onClick={acceptPreview} disabled={pendingSave} style={primaryBtnSmStyle}>
                            {pendingSave ? <><Loader2 size={11} className="animate-spin" /> Opslaan…</> : <><Check size={11} /> Accepteer</>}
                        </button>
                    </div>
                </div>
                <div style={{ padding: '8px 18px 18px' }}>
                    {(Object.keys(grouped) as Array<ChecklistItem['categorie']>).map(cat => (
                        <CategorieBlock
                            key={cat}
                            cat={cat}
                            items={grouped[cat] ?? []}
                            interactive={false}
                            onToggle={() => { /* not interactive in preview */ }}
                        />
                    ))}
                </div>
            </div>
        );
    }

    /* State 3: saved checklist */
    if (row) {
        const grouped = groupByCategorie(row.items);
        const totalDone = row.items.filter(it => it.done).length;
        return (
            <div style={cardStyle}>
                <Header
                    eventName={eventName}
                    progressLabel={`${totalDone}/${row.items.length}`}
                    extra={
                        <div style={{ display: 'flex', gap: 6 }}>
                            <button onClick={generate} disabled={generating} style={ghostBtnSmStyle} title="Nieuw AI-voorstel maken">
                                {generating ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
                                {generating ? 'Bezig…' : 'Opnieuw'}
                            </button>
                            <button onClick={deleteChecklist} disabled={pendingDelete} style={{ ...ghostBtnSmStyle, color: '#ef4444' }}>
                                <Trash2 size={11} />
                            </button>
                        </div>
                    }
                />
                <div style={{ padding: '8px 18px 18px' }}>
                    {(Object.keys(grouped) as Array<ChecklistItem['categorie']>).map(cat => (
                        <CategorieBlock
                            key={cat}
                            cat={cat}
                            items={(grouped[cat] ?? []).map((it, localIdx) => ({
                                ...it,
                                _globalIndex: row.items.indexOf(it),
                                _localIdx: localIdx,
                            }))}
                            interactive
                            onToggle={(globalIdx, done) => toggle(globalIdx, done)}
                        />
                    ))}
                </div>
                {error && (
                    <div role="alert" style={{ ...errorStyle, margin: '0 18px 14px' }}>
                        <AlertCircle size={12} /> {error}
                    </div>
                )}
            </div>
        );
    }
    return null;
}

function Header({ eventName, aiBadge, progressLabel, extra }: { eventName?: string | null; aiBadge?: boolean; progressLabel?: string; extra?: React.ReactNode }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
            <div style={{
                width: 30, height: 30, borderRadius: 8,
                background: 'rgba(255,191,0,.08)', color: '#FFBF00',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
                <ClipboardList size={14} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    Logistiek-checklist
                </div>
                {eventName && (
                    <div style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {eventName}
                    </div>
                )}
            </div>
            {aiBadge && (
                <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 4, background: 'rgba(167,139,250,.12)', color: '#a78bfa', letterSpacing: '.05em' }}>
                    AI
                </span>
            )}
            {progressLabel && (
                <span style={{ fontSize: 11, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>
                    {progressLabel}
                </span>
            )}
            {extra}
        </div>
    );
}

function CategorieBlock({
    cat, items, interactive, onToggle,
}: {
    cat: ChecklistItem['categorie'];
    items: Array<ChecklistItem & { _globalIndex?: number; _localIdx?: number }>;
    interactive: boolean;
    onToggle: (globalIdx: number, done: boolean) => void;
}) {
    const meta = CATEGORY_META[cat];
    if (items.length === 0) return null;
    return (
        <div style={{ marginTop: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: meta.color, textTransform: 'uppercase', letterSpacing: '.1em', fontWeight: 700, marginBottom: 6 }}>
                <meta.Icon size={11} /> {meta.label}
            </div>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                {items.map((it, i) => (
                    <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '7px 8px', borderRadius: 6, transition: 'background .15s' }}>
                        <button
                            type="button"
                            onClick={() => interactive && typeof it._globalIndex === 'number' && onToggle(it._globalIndex, !it.done)}
                            disabled={!interactive}
                            aria-label={it.done ? 'Markeer als open' : 'Markeer als done'}
                            style={{
                                width: 16, height: 16, borderRadius: 4, marginTop: 1,
                                background: it.done ? meta.color : 'transparent',
                                border: `1px solid ${it.done ? meta.color : 'var(--border)'}`,
                                cursor: interactive ? 'pointer' : 'default',
                                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                flexShrink: 0, padding: 0,
                            }}
                        >
                            {it.done && <Check size={11} color="#000" strokeWidth={3} />}
                        </button>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12, color: it.done ? 'var(--muted)' : 'var(--text)', textDecoration: it.done ? 'line-through' : 'none', lineHeight: 1.4 }}>
                                {it.tekst}
                            </div>
                            {(it.hoeveelheid || it.eenheid) && (
                                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                                    {it.hoeveelheid}{it.eenheid ? ` ${it.eenheid}` : ''}
                                </div>
                            )}
                        </div>
                    </li>
                ))}
            </ul>
        </div>
    );
}

function groupByCategorie(items: ChecklistItem[]): Record<ChecklistItem['categorie'], ChecklistItem[]> {
    const out: Record<ChecklistItem['categorie'], ChecklistItem[]> = {
        materieel: [], mensen: [], voorbereiding: [], transport: [],
    };
    for (const it of items) out[it.categorie].push(it);
    return out;
}

const cardStyle: React.CSSProperties = {
    background: 'rgba(255,255,255,.02)',
    border: '1px solid var(--border)',
    borderRadius: 14,
    overflow: 'hidden',
};
const primaryBtnStyle: React.CSSProperties = {
    padding: '10px 18px', borderRadius: 8,
    background: '#FFBF00', color: '#000',
    border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', gap: 6,
    minHeight: 40,
};
const primaryBtnSmStyle: React.CSSProperties = {
    padding: '6px 12px', borderRadius: 6,
    background: '#FFBF00', color: '#000',
    border: 'none', fontSize: 11, fontWeight: 700, cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', gap: 5,
    minHeight: 30,
};
const ghostBtnSmStyle: React.CSSProperties = {
    padding: '6px 12px', borderRadius: 6,
    background: 'transparent', color: 'var(--muted)',
    border: '1px solid var(--border)', fontSize: 11, fontWeight: 600,
    cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5,
    minHeight: 30,
};
const errorStyle: React.CSSProperties = {
    padding: '8px 12px', borderRadius: 8,
    background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.3)',
    color: '#ef4444', fontSize: 12,
    display: 'inline-flex', alignItems: 'center', gap: 6,
};
