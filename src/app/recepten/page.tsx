/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';
import React, { useState, useMemo, useEffect } from 'react';
import { useSupabase } from '@/lib/useSupabase';
import { useToast } from '@/components/Toast';
import { useConfirm } from '@/components/ConfirmDialog';
import {
    Sparkles, Plus, Search, X, Clock, Users, ChefHat, Trash2, Save,
    AlertTriangle, Loader2, Wand2, ArrowLeft, ChevronLeft, ChevronRight,
    UtensilsCrossed, Flame, BookOpen, Zap, Check,
} from 'lucide-react';

const GOLD = '#c4a35a';
const CATEGORIES = ['Alles', 'Vlees', 'Vis', 'Bijgerecht', 'Saus', 'Dessert', 'Drank'] as const;

type Recept = {
    id: number;
    naam: string;
    categorie: string;
    porties: number;
    preptime: number;
    beschrijving?: string;
    ingredienten: { naam: string; hoeveelheid: number; eenheid: string }[];
    instructies: string | string[];
    allergenen?: string[];
    tags?: string[];
    battle_plan?: string[];
    wijn_suggestie?: string;
    service_tip?: string;
    geschatte_kostprijs_pp?: number;
    notitie?: string;
    created_at?: string;
};

export default function ReceptenPage() {
    const { data: recepten, insert, update, remove, refetch } = useSupabase<Recept>('recepten', []);
    const { data: gerechten } = useSupabase<any>('gerechten', []);
    const showToast = useToast();
    const showConfirm = useConfirm();

    const [filter, setFilter] = useState<string>('Alles');
    const [search, setSearch] = useState('');
    const [selected, setSelected] = useState<Recept | null>(null);
    const [aiOpen, setAiOpen] = useState(false);
    const [editing, setEditing] = useState<Recept | null>(null);
    const [kitchenMode, setKitchenMode] = useState<Recept | null>(null);

    const filtered = useMemo(() => {
        const list = (recepten || []) as Recept[];
        const q = search.toLowerCase().trim();
        return list
            .filter(r => filter === 'Alles' || r.categorie === filter)
            .filter(r => {
                if (!q) return true;
                if (r.naam?.toLowerCase().includes(q)) return true;
                if (r.beschrijving?.toLowerCase().includes(q)) return true;
                /* Zoek ook in ingrediënten (array van {naam, ...} of string) */
                const ing = (r as any).ingredienten;
                if (Array.isArray(ing) && ing.some((i: any) => String(i?.naam || i || '').toLowerCase().includes(q))) return true;
                /* Zoek in tags */
                const tags = (r as any).tags;
                if (Array.isArray(tags) && tags.some((t: any) => String(t).toLowerCase().includes(q))) return true;
                /* Zoek in instructies (als string of array) */
                const instr = (r as any).instructies;
                if (typeof instr === 'string' && instr.toLowerCase().includes(q)) return true;
                if (Array.isArray(instr) && instr.some((s: any) => String(s).toLowerCase().includes(q))) return true;
                return false;
            });
    }, [recepten, filter, search]);

    const stats = useMemo(() => {
        const list = (recepten || []) as Recept[];
        const byCat: Record<string, number> = {};
        list.forEach(r => { byCat[r.categorie] = (byCat[r.categorie] || 0) + 1; });
        return { total: list.length, byCat };
    }, [recepten]);

    async function saveRecept(r: Recept) {
        const cleaned = {
            ...r,
            instructies: Array.isArray(r.instructies) ? r.instructies.join('\n') : r.instructies,
        };
        if (r.id) {
            const { id, created_at, ...rest } = cleaned as any;
            await update(id, rest as any);
            showToast('Recept bijgewerkt', 'success');
        } else {
            await insert(cleaned as any);
            showToast('Recept opgeslagen', 'success');
        }
        setEditing(null);
        setSelected(null);
        refetch();
    }

    function deleteRecept(id: number) {
        showConfirm('Dit recept verwijderen?', () => {
            remove(id).then(() => {
                showToast('Recept verwijderd', 'success');
                setSelected(null);
                refetch();
            });
        });
    }

    return (
        <div style={{ padding: '24px 32px', maxWidth: 1400, margin: '0 auto' }}>
            {/* HEADER */}
            <div style={{ marginBottom: 24, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                <div>
                    <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.2em', fontWeight: 700, marginBottom: 6 }}>De keuken</div>
                    <h1 style={{ fontFamily: 'Outfit, sans-serif', fontSize: 32, fontWeight: 300, color: 'var(--text)', margin: 0, letterSpacing: '-0.01em' }}>Receptenboek</h1>
                    <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4, marginBottom: 0 }}>{stats.total} recepten · AI bedenkt nieuwe in jouw stijl</p>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => setEditing({ naam: '', categorie: 'Vlees', porties: 10, preptime: 30, ingredienten: [], instructies: '' } as Recept)}
                        style={{ padding: '10px 16px', borderRadius: 10, border: '1px solid var(--card-solid)', background: 'var(--card)', color: 'var(--text)', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <Plus size={14} /> Handmatig
                    </button>
                    <button onClick={() => setAiOpen(true)}
                        style={{ padding: '10px 18px', borderRadius: 10, background: '#fff', color: 'var(--brand-background)', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, border: 'none' }}>
                        <Sparkles size={14} /> AI Recept genereren
                    </button>
                </div>
            </div>

            {/* HERO BANNER — showcase AI feature */}
            <div style={{ padding: 24, borderRadius: 16, background: 'linear-gradient(135deg, rgba(196,163,90,.12), rgba(255,255,255,.02))', border: '1px solid rgba(196,163,90,.25)', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
                <div style={{ width: 48, height: 48, borderRadius: 12, background: 'rgba(196,163,90,.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Wand2 size={22} style={{ color: GOLD }} />
                </div>
                <div style={{ flex: 1, minWidth: 240 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 2 }}>Claude kent jouw keuken</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>Bij elk AI-recept krijgt Claude jouw bestaande gerechten als stijl-referentie. Geen fusion-exces, maar recepten die passen bij wat je al doet.</div>
                </div>
                <button onClick={() => setAiOpen(true)} style={{ padding: '8px 14px', borderRadius: 8, background: GOLD, color: 'var(--brand-background)', border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <Sparkles size={13} /> Probeer nu
                </button>
            </div>

            {/* SEARCH + FILTERS */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ position: 'relative', flex: '1 1 100%', minWidth: 0 }}>
                    <Search size={18} style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
                    <input
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Zoek in naam, ingrediënten, tags... (bv. pork, varkenshaas, BBQ)"
                        style={{ width: '100%', padding: '14px 44px 14px 46px', borderRadius: 12, border: '1px solid var(--card-solid)', background: 'var(--card)', color: 'var(--text)', fontSize: 15, outline: 'none' }}
                    />
                    {search && (
                        <button onClick={() => setSearch('')}
                            aria-label="Zoekopdracht wissen"
                            style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', width: 28, height: 28, borderRadius: 8, background: 'var(--color-bg-deep)', border: 'none', color: 'var(--muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700 }}>
                            ×
                        </button>
                    )}
                    {search && (
                        <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 4, fontSize: 11, color: 'var(--muted)' }}>
                            {filtered.length === 0 ? 'Geen resultaten' : filtered.length + ' resultaat' + (filtered.length !== 1 ? 'en' : '') + ' gevonden'}
                        </div>
                    )}
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {CATEGORIES.map(c => {
                        const active = filter === c;
                        const count = c === 'Alles' ? stats.total : (stats.byCat[c] || 0);
                        return (
                            <button key={c} onClick={() => setFilter(c)}
                                style={{
                                    padding: '8px 14px', borderRadius: 8, border: active ? '1px solid #fff' : '1px solid var(--card-solid)',
                                    background: active ? '#fff' : 'var(--card)', color: active ? '#000' : '#fff',
                                    fontSize: 12, fontWeight: 700, cursor: 'pointer',
                                }}>
                                {c} {count > 0 && <span style={{ opacity: 0.5, fontWeight: 500 }}>· {count}</span>}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* GRID */}
            {filtered.length === 0 ? (
                <div style={{ padding: 60, textAlign: 'center', borderRadius: 16, border: '1px solid var(--card-solid)', background: 'var(--card)' }}>
                    <BookOpen size={40} style={{ color: 'var(--muted-light)', opacity: 0.4, marginBottom: 10 }} />
                    <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
                        {search || filter !== 'Alles' ? 'Geen recepten gevonden' : 'Nog geen recepten'}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 16 }}>
                        {search || filter !== 'Alles' ? 'Probeer een andere zoekopdracht' : 'Laat Claude je eerste recept bedenken'}
                    </div>
                    {!search && filter === 'Alles' && (
                        <button onClick={() => setAiOpen(true)} style={{ padding: '10px 18px', borderRadius: 10, background: GOLD, color: 'var(--brand-background)', border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <Sparkles size={14} /> AI Recept genereren
                        </button>
                    )}
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
                    {filtered.map(r => <RecipeCard key={r.id} recipe={r} onClick={() => setSelected(r)} />)}
                </div>
            )}

            {/* AI GENERATE MODAL */}
            {aiOpen && (
                <AiGenerateModal
                    onClose={() => setAiOpen(false)}
                    existingRecepten={recepten || []}
                    existingGerechten={gerechten || []}
                    onAccept={async (rec) => {
                        await insert({
                            naam: rec.naam,
                            categorie: rec.categorie,
                            porties: rec.porties,
                            preptime: rec.preptime,
                            beschrijving: rec.beschrijving,
                            ingredienten: rec.ingredienten,
                            instructies: Array.isArray(rec.instructies) ? rec.instructies.join('\n') : rec.instructies,
                            allergenen: rec.allergenen,
                            tags: rec.tags,
                            battle_plan: rec.battle_plan,
                            wijn_suggestie: rec.wijn_suggestie,
                            service_tip: rec.service_tip,
                            geschatte_kostprijs_pp: rec.geschatte_kostprijs_pp,
                        } as any);
                        showToast('Recept opgeslagen', 'success');
                        setAiOpen(false);
                        refetch();
                    }}
                />
            )}

            {/* DETAIL DRAWER */}
            {selected && !editing && !kitchenMode && (
                <RecipeDrawer
                    recipe={selected}
                    onClose={() => setSelected(null)}
                    onEdit={() => setEditing(selected)}
                    onDelete={() => selected.id && deleteRecept(selected.id)}
                    onKitchenMode={() => setKitchenMode(selected)}
                    existingRecepten={recepten || []}
                    existingGerechten={gerechten || []}
                    onSaveUpdate={(r) => { setSelected(r); saveRecept(r); }}
                />
            )}

            {/* EDIT MODAL */}
            {editing && (
                <RecipeEditor
                    recipe={editing}
                    onClose={() => setEditing(null)}
                    onSave={saveRecept}
                />
            )}

            {/* KITCHEN MODE */}
            {kitchenMode && (
                <KitchenMode recipe={kitchenMode} onClose={() => setKitchenMode(null)} />
            )}
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════════════
   RECIPE CARD
   ═══════════════════════════════════════════════════════════════════ */

function RecipeCard({ recipe, onClick }: { recipe: Recept; onClick: () => void }) {
    const ingCount = Array.isArray(recipe.ingredienten) ? recipe.ingredienten.length : 0;
    const instrCount = typeof recipe.instructies === 'string'
        ? recipe.instructies.split('\n').filter(l => l.trim()).length
        : (recipe.instructies || []).length;

    return (
        <button onClick={onClick}
            style={{
                padding: 16, borderRadius: 14, border: '1px solid var(--card-solid)', background: 'var(--card)',
                cursor: 'pointer', textAlign: 'left', color: 'var(--text)', display: 'flex', flexDirection: 'column', gap: 10,
                transition: 'all .15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,.2)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--card-solid)'; e.currentTarget.style.transform = 'translateY(0)'; }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', padding: '2px 6px', borderRadius: 3, background: 'rgba(255,255,255,.06)', color: 'var(--muted)' }}>
                    {recipe.categorie}
                </span>
                {recipe.tags?.slice(0, 1).map(t => (
                    <span key={t} style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', padding: '2px 6px', borderRadius: 3, background: 'rgba(196,163,90,.12)', color: GOLD }}>
                        {t}
                    </span>
                ))}
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', lineHeight: 1.2 }}>{recipe.naam}</div>
            {recipe.beschrijving && (
                <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                    {recipe.beschrijving}
                </div>
            )}
            <div style={{ display: 'flex', gap: 12, fontSize: 10, color: 'var(--muted)', marginTop: 'auto', paddingTop: 8, borderTop: '1px solid var(--card-solid)' }}>
                <span title="Porties"><Users size={11} style={{ display: 'inline', marginRight: 3 }} />{recipe.porties || 10}p</span>
                <span title="Preptijd"><Clock size={11} style={{ display: 'inline', marginRight: 3 }} />{recipe.preptime || 0}m</span>
                <span title="Ingrediënten"><UtensilsCrossed size={11} style={{ display: 'inline', marginRight: 3 }} />{ingCount}</span>
                <span title="Stappen"><ChefHat size={11} style={{ display: 'inline', marginRight: 3 }} />{instrCount}</span>
                {recipe.geschatte_kostprijs_pp ? (
                    <span style={{ marginLeft: 'auto', color: GOLD, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>€{recipe.geschatte_kostprijs_pp.toFixed(2)}</span>
                ) : null}
            </div>
        </button>
    );
}

/* ═══════════════════════════════════════════════════════════════════
   AI GENERATE MODAL
   ═══════════════════════════════════════════════════════════════════ */

function AiGenerateModal({ onClose, existingRecepten, existingGerechten, onAccept }: {
    onClose: () => void;
    existingRecepten: Recept[];
    existingGerechten: any[];
    onAccept: (r: Recept) => void | Promise<void>;
}) {
    const [prompt, setPrompt] = useState('');
    const [porties, setPorties] = useState(10);
    const [status, setStatus] = useState<'idle' | 'generating' | 'done' | 'error'>('idle');
    const [result, setResult] = useState<Recept | null>(null);
    const [error, setError] = useState<string | null>(null);

    const EXAMPLES = [
        'Zomerse salade met aardbei en geitenkaas',
        'Low-and-slow pulled pork met smoky BBQ saus',
        'Vegan burger die past bij onze stijl',
        'Romige aardappelgratin voor bij vlees',
        'Frisse dessert met citrus voor warme dag',
    ];

    async function generate() {
        if (!prompt.trim()) return;
        setStatus('generating');
        setError(null);
        try {
            const existing = [
                ...(existingRecepten || []).map(r => ({ naam: r.naam, categorie: r.categorie, tags: r.tags })),
                ...(existingGerechten || []).map(g => ({ naam: g.naam, gang: g.gang_slug, tags: g.tags })),
            ];
            const res = await fetch('/api/recipe-generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    prompt,
                    mode: 'recipe',
                    existing,
                    options: { porties },
                }),
            });
            const body = await res.json();
            if (!res.ok) {
                setError(body.error || 'AI fout');
                setStatus('error');
                return;
            }
            setResult(body.data);
            setStatus('done');
        } catch (e: any) {
            setError(e.message || 'Onbekende fout');
            setStatus('error');
        }
    }

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', paddingTop: 60 }} onClick={onClose}>
            <div onClick={e => e.stopPropagation()} style={{ width: 'min(680px, 92vw)', maxHeight: '82vh', background: 'var(--bg)', border: '1px solid var(--card-solid)', borderRadius: 16, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
                <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--card-solid)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Sparkles size={16} style={{ color: GOLD }} />
                            <h2 style={{ fontFamily: 'Outfit, sans-serif', fontSize: 20, fontWeight: 400, color: 'var(--text)', margin: 0 }}>AI Recept genereren</h2>
                        </div>
                        <p style={{ fontSize: 11, color: 'var(--muted)', margin: 0, marginTop: 2 }}>Claude Sonnet 4.6 · kijkt naar je bestaande recepten</p>
                    </div>
                    <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: 6 }}><X size={18} /></button>
                </div>

                {status === 'done' && result ? (
                    <RecipePreview recipe={result} onAccept={() => onAccept(result)} onReject={() => { setResult(null); setStatus('idle'); }} />
                ) : (
                    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
                        <div>
                            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 8, display: 'block' }}>Wat wil je laten bedenken?</label>
                            <textarea value={prompt} onChange={e => setPrompt(e.target.value)}
                                placeholder="bijv. zomerse salade met aardbei en geitenkaas, licht gekruid"
                                rows={3}
                                style={{ width: '100%', padding: 12, borderRadius: 10, border: '1px solid var(--card-solid)', background: 'var(--color-bg-deep)', color: 'var(--text)', fontSize: 13, fontFamily: 'inherit', resize: 'vertical', outline: 'none' }} />
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            {EXAMPLES.map(ex => (
                                <button key={ex} onClick={() => setPrompt(ex)}
                                    style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--card-solid)', background: 'var(--card)', color: 'var(--muted)', fontSize: 11, cursor: 'pointer' }}>
                                    {ex}
                                </button>
                            ))}
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 10, alignItems: 'center' }}>
                            <label style={{ fontSize: 12, color: 'var(--text)', fontWeight: 600 }}>Porties</label>
                            <input type="number" min={1} max={200} value={porties} onChange={e => setPorties(parseInt(e.target.value) || 10)}
                                style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--card-solid)', background: 'var(--color-bg-deep)', color: 'var(--text)', fontSize: 13, width: 100, outline: 'none' }} />
                        </div>

                        {status === 'error' && error && (
                            <div style={{ padding: 12, borderRadius: 8, background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.3)', fontSize: 12, color: '#fca5a5', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                                <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                                <span>{error}</span>
                            </div>
                        )}

                        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                            <button onClick={onClose} style={{ padding: '10px 16px', borderRadius: 10, border: '1px solid var(--card-solid)', background: 'var(--card)', color: 'var(--text)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Annuleren</button>
                            <button onClick={generate} disabled={!prompt.trim() || status === 'generating'}
                                style={{ flex: 1, padding: '10px 16px', borderRadius: 10, background: prompt.trim() && status !== 'generating' ? '#fff' : 'rgba(255,255,255,.3)', color: 'var(--brand-background)', fontSize: 12, fontWeight: 700, cursor: prompt.trim() && status !== 'generating' ? 'pointer' : 'not-allowed', border: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                                {status === 'generating' ? <><Loader2 size={14} className="spin" /> Claude bedenkt je recept...</> : <><Sparkles size={14} /> Genereer recept</>}
                            </button>
                        </div>
                        <style>{`.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
                    </div>
                )}
            </div>
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════════════
   RECIPE PREVIEW (na AI generatie)
   ═══════════════════════════════════════════════════════════════════ */

function RecipePreview({ recipe, onAccept, onReject }: { recipe: Recept; onAccept: () => void | Promise<void>; onReject: () => void }) {
    const [saving, setSaving] = useState(false);

    return (
        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ padding: 14, borderRadius: 10, background: 'rgba(34,197,94,.08)', border: '1px solid rgba(34,197,94,.25)', display: 'flex', gap: 10, alignItems: 'center' }}>
                <Check size={18} style={{ color: 'var(--green)' }} />
                <span style={{ fontSize: 12, color: 'var(--text)', fontWeight: 600 }}>Recept bedacht — controleer en sla op</span>
            </div>

            <div>
                <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.15em', marginBottom: 4 }}>{recipe.categorie}</div>
                <h3 style={{ fontFamily: 'Outfit, sans-serif', fontSize: 22, fontWeight: 600, color: 'var(--text)', margin: 0 }}>{recipe.naam}</h3>
                {recipe.beschrijving && <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4, marginBottom: 0 }}>{recipe.beschrijving}</p>}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                <Stat label="Porties" value={`${recipe.porties}`} />
                <Stat label="Tijd" value={`${recipe.preptime}m`} />
                <Stat label="Ingr." value={`${recipe.ingredienten?.length || 0}`} />
                <Stat label="Kost/p" value={recipe.geschatte_kostprijs_pp ? `€${recipe.geschatte_kostprijs_pp.toFixed(2)}` : '—'} />
            </div>

            {recipe.tags && recipe.tags.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {recipe.tags.map(t => <Tag key={t} text={t} />)}
                </div>
            )}

            <Section title={`Ingrediënten · ${recipe.ingredienten?.length || 0}`}>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {(recipe.ingredienten || []).map((i, idx) => (
                        <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 10, padding: '8px 0', fontSize: 12, color: 'var(--text)', borderBottom: idx < (recipe.ingredienten?.length || 0) - 1 ? '1px solid var(--card-solid)' : 'none', alignItems: 'center' }}>
                            <span>{i.naam}</span>
                            <span style={{ color: 'var(--text)', fontVariantNumeric: 'tabular-nums', fontWeight: 700, minWidth: 48, textAlign: 'right' }}>{i.hoeveelheid}</span>
                            <span style={{ color: GOLD, fontWeight: 700, fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', minWidth: 36, textAlign: 'left' }}>{i.eenheid}</span>
                        </div>
                    ))}
                </div>
            </Section>

            <Section title={`Bereiding · ${Array.isArray(recipe.instructies) ? recipe.instructies.length : 0} stappen`}>
                <ol style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {(Array.isArray(recipe.instructies) ? recipe.instructies : (recipe.instructies || '').split('\n').filter((l: string) => l.trim())).map((s: string, i: number) => (
                        <li key={i} style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.5 }}>{s}</li>
                    ))}
                </ol>
            </Section>

            {recipe.battle_plan && recipe.battle_plan.length > 0 && (
                <Section title={`Werkvolgorde · wanneer doe je wat`}>
                    <ol style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {recipe.battle_plan.map((s, i) => (
                            <li key={i} style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.5 }}>{s}</li>
                        ))}
                    </ol>
                </Section>
            )}

            {recipe.allergenen && recipe.allergenen.length > 0 && (
                <div style={{ fontSize: 11, color: 'var(--muted)' }}><strong style={{ color: 'var(--amber)' }}>Allergenen:</strong> {recipe.allergenen.join(', ')}</div>
            )}
            {recipe.wijn_suggestie && (
                <div style={{ fontSize: 11, color: 'var(--muted)' }}><strong style={{ color: 'var(--text)' }}>Wijn:</strong> {recipe.wijn_suggestie}</div>
            )}
            {recipe.service_tip && (
                <div style={{ fontSize: 11, color: 'var(--muted)' }}><strong style={{ color: 'var(--text)' }}>Service:</strong> {recipe.service_tip}</div>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 8, position: 'sticky', bottom: 0, background: 'var(--bg)', paddingTop: 12 }}>
                <button onClick={onReject} style={{ padding: '10px 16px', borderRadius: 10, border: '1px solid var(--card-solid)', background: 'var(--card)', color: 'var(--text)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Opnieuw proberen</button>
                <button onClick={async () => { setSaving(true); await onAccept(); setSaving(false); }} disabled={saving}
                    style={{ flex: 1, padding: '10px 16px', borderRadius: 10, background: GOLD, color: 'var(--brand-background)', border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                    {saving ? <><Loader2 size={14} className="spin" /> Opslaan...</> : <><Save size={14} /> Opslaan in receptenboek</>}
                </button>
            </div>
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════════════
   RECIPE DRAWER (detail weergave)
   ═══════════════════════════════════════════════════════════════════ */

function RecipeDrawer({ recipe, onClose, onEdit, onDelete, onKitchenMode, existingRecepten, existingGerechten, onSaveUpdate }: {
    recipe: Recept;
    onClose: () => void;
    onEdit: () => void;
    onDelete: () => void;
    onKitchenMode: () => void;
    existingRecepten: Recept[];
    existingGerechten: any[];
    onSaveUpdate: (r: Recept) => void;
}) {
    const [scaling, setScaling] = useState(false);
    const [scalePorties, setScalePorties] = useState<number>(recipe.porties || 10);
    const [enriching, setEnriching] = useState(false);

    async function doScale() {
        setScaling(true);
        try {
            const existing = [
                ...(existingRecepten || []).map(r => ({ naam: r.naam, categorie: r.categorie })),
                ...(existingGerechten || []).map(g => ({ naam: g.naam })),
            ];
            const res = await fetch('/api/recipe-generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    mode: 'scale',
                    prompt: 'scale',
                    existing,
                    options: { currentRecipe: recipe, targetPorties: scalePorties },
                }),
            });
            const body = await res.json();
            if (res.ok && body.data) {
                onSaveUpdate({ ...recipe, ...body.data });
            } else {
                alert(body.error || 'Schalen mislukt');
            }
        } catch (e: any) {
            alert(e.message || 'Onbekende fout');
        } finally {
            setScaling(false);
        }
    }

    async function doEnrich() {
        setEnriching(true);
        try {
            const existing = [
                ...(existingRecepten || []).map(r => ({ naam: r.naam, categorie: r.categorie })),
                ...(existingGerechten || []).map(g => ({ naam: g.naam })),
            ];
            const res = await fetch('/api/recipe-generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    mode: 'enrich',
                    prompt: 'enrich',
                    existing,
                    options: { currentDish: recipe },
                }),
            });
            const body = await res.json();
            if (res.ok && body.data) {
                onSaveUpdate({ ...recipe, ...body.data });
            } else {
                alert(body.error || 'Verrijken mislukt');
            }
        } catch (e: any) {
            alert(e.message || 'Onbekende fout');
        } finally {
            setEnriching(false);
        }
    }

    const instructies = Array.isArray(recipe.instructies) ? recipe.instructies : (recipe.instructies || '').split('\n').filter(l => l.trim());

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 1000, display: 'flex', justifyContent: 'flex-end' }} onClick={onClose}>
            <div onClick={e => e.stopPropagation()} style={{ width: 'min(640px, 100vw)', background: 'var(--bg)', borderLeft: '1px solid var(--card-solid)', overflow: 'auto' }}>
                <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--card-solid)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'sticky', top: 0, background: 'var(--bg)', zIndex: 2 }}>
                    <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.15em', marginBottom: 4 }}>{recipe.categorie}</div>
                        <h2 style={{ fontFamily: 'Outfit, sans-serif', fontSize: 24, fontWeight: 600, color: 'var(--text)', margin: 0 }}>{recipe.naam}</h2>
                        {recipe.beschrijving && <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0, marginTop: 4 }}>{recipe.beschrijving}</p>}
                    </div>
                    <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: 6 }}><X size={18} /></button>
                </div>

                <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {/* STATS */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                        <Stat label="Porties" value={`${recipe.porties || 10}`} />
                        <Stat label="Tijd" value={`${recipe.preptime || 0}m`} />
                        <Stat label="Ingr." value={`${recipe.ingredienten?.length || 0}`} />
                        <Stat label="Kost/p" value={recipe.geschatte_kostprijs_pp ? `€${recipe.geschatte_kostprijs_pp.toFixed(2)}` : '—'} />
                    </div>

                    {recipe.tags && recipe.tags.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {recipe.tags.map(t => <Tag key={t} text={t} />)}
                        </div>
                    )}

                    {/* AI ACTIONS */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        <div style={{ padding: 12, borderRadius: 10, border: '1px solid var(--card-solid)', background: 'var(--card)' }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 6 }}>Schaal naar</div>
                            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                <input type="number" min={1} max={500} value={scalePorties} onChange={e => setScalePorties(parseInt(e.target.value) || 10)}
                                    style={{ flex: 1, padding: '6px 10px', borderRadius: 6, border: '1px solid var(--card-solid)', background: 'var(--color-bg-deep)', color: 'var(--text)', fontSize: 12, outline: 'none' }} />
                                <span style={{ fontSize: 11, color: 'var(--muted)' }}>p.</span>
                                <button onClick={doScale} disabled={scaling || scalePorties === recipe.porties}
                                    style={{ padding: '6px 10px', borderRadius: 6, background: scalePorties !== recipe.porties ? '#fff' : 'rgba(255,255,255,.2)', color: 'var(--brand-background)', border: 'none', fontSize: 11, fontWeight: 700, cursor: scalePorties !== recipe.porties ? 'pointer' : 'not-allowed', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                    {scaling ? <Loader2 size={11} className="spin" /> : <Zap size={11} />} Schaal
                                </button>
                            </div>
                        </div>
                        <button onClick={doEnrich} disabled={enriching}
                            style={{ padding: 12, borderRadius: 10, border: '1px solid var(--card-solid)', background: 'var(--card)', color: 'var(--text)', cursor: 'pointer', textAlign: 'left' }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 4 }}>AI verrijken</div>
                            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                {enriching ? <Loader2 size={12} className="spin" /> : <Sparkles size={12} style={{ color: GOLD }} />}
                                {enriching ? 'Claude schrijft...' : 'Vul ontbrekende velden'}
                            </div>
                        </button>
                    </div>

                    {/* INGREDIENTEN */}
                    <Section title={`Ingrediënten · voor ${recipe.porties || 10} porties`}>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            {(recipe.ingredienten || []).map((i, idx) => (
                                <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 10, padding: '8px 0', fontSize: 12, color: 'var(--text)', borderBottom: idx < (recipe.ingredienten?.length || 0) - 1 ? '1px solid var(--card-solid)' : 'none', alignItems: 'center' }}>
                                    <span>{i.naam}</span>
                                    <span style={{ color: 'var(--text)', fontVariantNumeric: 'tabular-nums', fontWeight: 700, minWidth: 48, textAlign: 'right' }}>{i.hoeveelheid}</span>
                                    <span style={{ color: GOLD, fontWeight: 700, fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', minWidth: 36, textAlign: 'left' }}>{i.eenheid}</span>
                                </div>
                            ))}
                        </div>
                    </Section>

                    {/* BEREIDING */}
                    <Section title={`Bereiding · ${instructies.length} stappen`}>
                        <ol style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {instructies.map((s: string, i: number) => (
                                <li key={i} style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.5 }}>{s}</li>
                            ))}
                        </ol>
                    </Section>

                    {/* BATTLE PLAN */}
                    {recipe.battle_plan && recipe.battle_plan.length > 0 && (
                        <Section title={`Werkvolgorde · wanneer doe je wat`}>
                            <ol style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 4 }}>
                                {recipe.battle_plan.map((s, i) => (
                                    <li key={i} style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.5 }}>{s}</li>
                                ))}
                            </ol>
                        </Section>
                    )}

                    {/* EXTRA INFO */}
                    {(recipe.allergenen?.length || recipe.wijn_suggestie || recipe.service_tip) && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 12, borderRadius: 10, background: 'var(--color-bg-deep)', border: '1px solid var(--card-solid)' }}>
                            {recipe.allergenen && recipe.allergenen.length > 0 && (
                                <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                                    <strong style={{ color: 'var(--amber)' }}>⚠ Allergenen:</strong> {recipe.allergenen.join(', ')}
                                </div>
                            )}
                            {recipe.wijn_suggestie && <div style={{ fontSize: 11, color: 'var(--muted)' }}><strong style={{ color: 'var(--text)' }}>🍷 Wijn:</strong> {recipe.wijn_suggestie}</div>}
                            {recipe.service_tip && <div style={{ fontSize: 11, color: 'var(--muted)' }}><strong style={{ color: 'var(--text)' }}>🍽 Service:</strong> {recipe.service_tip}</div>}
                        </div>
                    )}

                    {/* ACTIES */}
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button onClick={onKitchenMode} style={{ flex: 1, padding: '12px 16px', borderRadius: 10, background: GOLD, color: 'var(--brand-background)', border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                            <Flame size={14} /> Start kitchen mode
                        </button>
                        <button onClick={onEdit} style={{ padding: '12px 16px', borderRadius: 10, border: '1px solid var(--card-solid)', background: 'var(--card)', color: 'var(--text)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                            Bewerken
                        </button>
                        <button onClick={onDelete} style={{ padding: '12px 14px', borderRadius: 10, border: '1px solid rgba(239,68,68,.3)', background: 'rgba(239,68,68,.1)', color: '#fca5a5', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <Trash2 size={13} />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════════════
   RECIPE EDITOR (handmatig)
   ═══════════════════════════════════════════════════════════════════ */

function RecipeEditor({ recipe, onClose, onSave }: { recipe: Recept; onClose: () => void; onSave: (r: Recept) => void }) {
    const [form, setForm] = useState<Recept>(recipe);
    const [saving, setSaving] = useState(false);

    function updateField<K extends keyof Recept>(key: K, val: Recept[K]) {
        setForm(f => ({ ...f, [key]: val }));
    }
    function addIngredient() {
        setForm(f => ({ ...f, ingredienten: [...(f.ingredienten || []), { naam: '', hoeveelheid: 1, eenheid: 'stuks' }] }));
    }
    function updateIng(i: number, key: string, val: any) {
        setForm(f => ({ ...f, ingredienten: (f.ingredienten || []).map((ing, idx) => idx === i ? { ...ing, [key]: val } : ing) }));
    }
    function removeIng(i: number) {
        setForm(f => ({ ...f, ingredienten: (f.ingredienten || []).filter((_, idx) => idx !== i) }));
    }

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 1001, display: 'flex', justifyContent: 'flex-end' }} onClick={onClose}>
            <div onClick={e => e.stopPropagation()} style={{ width: 'min(640px, 100vw)', background: 'var(--bg)', borderLeft: '1px solid var(--card-solid)', overflow: 'auto' }}>
                <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--card-solid)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h2 style={{ fontFamily: 'Outfit, sans-serif', fontSize: 20, fontWeight: 400, color: 'var(--text)', margin: 0 }}>{recipe.id ? 'Recept bewerken' : 'Nieuw recept'}</h2>
                    <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: 6 }}><X size={18} /></button>
                </div>

                <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <FormField label="Naam">
                        <input value={form.naam} onChange={e => updateField('naam', e.target.value)} style={inputStyle} />
                    </FormField>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                        <FormField label="Categorie">
                            <select value={form.categorie} onChange={e => updateField('categorie', e.target.value)} style={inputStyle}>
                                {['Vlees', 'Vis', 'Bijgerecht', 'Saus', 'Dessert', 'Drank'].map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </FormField>
                        <FormField label="Porties">
                            <input type="number" value={form.porties || 10} onChange={e => updateField('porties', parseInt(e.target.value) || 10)} style={inputStyle} />
                        </FormField>
                        <FormField label="Prep-tijd (min)">
                            <input type="number" value={form.preptime || 0} onChange={e => updateField('preptime', parseInt(e.target.value) || 0)} style={inputStyle} />
                        </FormField>
                    </div>
                    <FormField label="Korte beschrijving">
                        <input value={form.beschrijving || ''} onChange={e => updateField('beschrijving', e.target.value)} style={inputStyle} />
                    </FormField>

                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.1em' }}>Ingrediënten</label>
                            <button onClick={addIngredient} style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid var(--card-solid)', background: 'var(--card)', color: 'var(--text)', fontSize: 11, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                <Plus size={11} /> Regel
                            </button>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {(form.ingredienten || []).map((ing, i) => (
                                <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 72px 80px 28px', gap: 6 }}>
                                    <input value={ing.naam} onChange={e => updateIng(i, 'naam', e.target.value)} placeholder="ingrediënt" style={inputStyle} />
                                    <input type="number" step="any" value={ing.hoeveelheid} onChange={e => updateIng(i, 'hoeveelheid', parseFloat(e.target.value) || 0)} style={inputStyle} />
                                    <input value={ing.eenheid} onChange={e => updateIng(i, 'eenheid', e.target.value)} placeholder="g/kg/ml/stuks" style={inputStyle} />
                                    <button onClick={() => removeIng(i)} style={{ background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}><X size={14} /></button>
                                </div>
                            ))}
                            {(form.ingredienten || []).length === 0 && <div style={{ fontSize: 11, color: 'var(--muted)', padding: 8, textAlign: 'center' }}>Nog geen ingrediënten</div>}
                        </div>
                    </div>

                    <FormField label="Bereiding (één stap per regel)">
                        <textarea
                            value={Array.isArray(form.instructies) ? form.instructies.join('\n') : (form.instructies || '')}
                            onChange={e => updateField('instructies', e.target.value)}
                            rows={8}
                            style={{ ...inputStyle, fontFamily: 'inherit', resize: 'vertical' }}
                        />
                    </FormField>

                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                        <button onClick={onClose} style={{ padding: '10px 16px', borderRadius: 10, border: '1px solid var(--card-solid)', background: 'var(--card)', color: 'var(--text)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Annuleren</button>
                        <button onClick={async () => { setSaving(true); await onSave(form); setSaving(false); }} disabled={!form.naam || saving}
                            style={{ flex: 1, padding: '10px 16px', borderRadius: 10, background: form.naam ? '#fff' : 'rgba(255,255,255,.3)', color: 'var(--brand-background)', border: 'none', fontSize: 12, fontWeight: 700, cursor: form.naam && !saving ? 'pointer' : 'not-allowed', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                            {saving ? <><Loader2 size={14} className="spin" /> Opslaan...</> : <><Save size={14} /> Opslaan</>}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════════════
   KITCHEN MODE (full-screen stap-voor-stap)
   ═══════════════════════════════════════════════════════════════════ */

function KitchenMode({ recipe, onClose }: { recipe: Recept; onClose: () => void }) {
    const steps = Array.isArray(recipe.instructies) ? recipe.instructies : (recipe.instructies || '').split('\n').filter(l => l.trim());
    const [idx, setIdx] = useState(0);

    useEffect(() => {
        function onKey(e: KeyboardEvent) {
            if (e.key === 'Escape') onClose();
            else if (e.key === 'ArrowRight' || e.key === ' ') setIdx(i => Math.min(steps.length - 1, i + 1));
            else if (e.key === 'ArrowLeft') setIdx(i => Math.max(0, i - 1));
        }
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [steps.length, onClose]);

    if (steps.length === 0) {
        return (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.9)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
                <div style={{ color: '#fff', fontSize: 16 }}>Geen bereiding-stappen</div>
                <button onClick={onClose} style={{ padding: '10px 18px', borderRadius: 10, background: '#fff', color: '#000', border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Sluiten</button>
            </div>
        );
    }

    const progress = ((idx + 1) / steps.length) * 100;

    return (
        <div style={{ position: 'fixed', inset: 0, background: '#000', zIndex: 2000, display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '16px 24px', borderBottom: '1px solid #222', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.15em', fontWeight: 700 }}>Kitchen mode</div>
                    <div style={{ fontSize: 16, color: '#fff', fontWeight: 600 }}>{recipe.naam}</div>
                </div>
                <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', padding: 8 }}><X size={20} /></button>
            </div>
            <div style={{ height: 4, background: '#222' }}>
                <div style={{ height: '100%', width: `${progress}%`, background: GOLD, transition: 'width .3s' }} />
            </div>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
                <div style={{ maxWidth: 800, textAlign: 'center' }}>
                    <div style={{ fontSize: 14, color: GOLD, fontWeight: 700, marginBottom: 16, letterSpacing: '.15em', textTransform: 'uppercase' }}>
                        Stap {idx + 1} van {steps.length}
                    </div>
                    <div style={{ fontSize: 32, fontWeight: 400, color: '#fff', lineHeight: 1.3, fontFamily: 'Outfit, sans-serif' }}>
                        {steps[idx]}
                    </div>
                </div>
            </div>
            <div style={{ padding: 24, display: 'flex', gap: 10, justifyContent: 'center', borderTop: '1px solid #222' }}>
                <button onClick={() => setIdx(i => Math.max(0, i - 1))} disabled={idx === 0}
                    style={{ padding: '12px 20px', borderRadius: 10, border: '1px solid #333', background: idx > 0 ? '#1a1a1a' : '#0a0a0a', color: idx > 0 ? '#fff' : '#444', fontSize: 13, fontWeight: 600, cursor: idx > 0 ? 'pointer' : 'not-allowed', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <ChevronLeft size={14} /> Vorige
                </button>
                <button onClick={() => idx === steps.length - 1 ? onClose() : setIdx(i => i + 1)}
                    style={{ padding: '12px 24px', borderRadius: 10, background: GOLD, color: '#000', border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    {idx === steps.length - 1 ? <>Klaar <Check size={14} /></> : <>Volgende <ChevronRight size={14} /></>}
                </button>
            </div>
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════════════
   ATOMS
   ═══════════════════════════════════════════════════════════════════ */

function Stat({ label, value }: { label: string; value: string }) {
    return (
        <div style={{ padding: 10, borderRadius: 8, background: 'var(--color-bg-deep)', border: '1px solid var(--card-solid)' }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 2 }}>{label}</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
        </div>
    );
}

function Tag({ text }: { text: string }) {
    return (
        <span style={{ padding: '3px 8px', borderRadius: 4, background: 'rgba(196,163,90,.12)', color: GOLD, fontSize: 10, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase' }}>
            {text}
        </span>
    );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.15em', marginBottom: 8 }}>{title}</div>
            <div style={{ padding: 12, borderRadius: 10, background: 'var(--color-bg-deep)', border: '1px solid var(--card-solid)' }}>
                {children}
            </div>
        </div>
    );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 6, display: 'block' }}>{label}</label>
            {children}
        </div>
    );
}

const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 12px',
    borderRadius: 8,
    border: '1px solid var(--card-solid)',
    background: 'var(--color-bg-deep)',
    color: 'var(--text)',
    fontSize: 13,
    outline: 'none',
};
