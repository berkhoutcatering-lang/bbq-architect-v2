/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';
import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { X, Search, Plus, ChefHat, Check, Trash2, Sparkles, Loader2 } from 'lucide-react';

type Gang = { id: number | string; slug: string; naam: string; volgorde: number };
type Item = { id: number; naam: string; gang_slug?: string; categorie?: string; beschrijving?: string; kostprijs_pp?: number; src: 'gerecht' | 'recept' };

type Props = {
    open: boolean;
    onClose: () => void;
    eventId: number;
    initialMenuIds: number[];
    onSaved: (ids: number[]) => void;
    eventName?: string;
};

export default function EventMenuKaartBuilder({ open, onClose, eventId, initialMenuIds, onSaved, eventName }: Props) {
    const [gangen, setGangen] = useState<Gang[]>([]);
    const [pool, setPool] = useState<Item[]>([]);
    const [selected, setSelected] = useState<number[]>(initialMenuIds);
    const [query, setQuery] = useState('');
    const [filterSrc, setFilterSrc] = useState<'all' | 'gerecht' | 'recept'>('all');
    const [saving, setSaving] = useState(false);
    const [aiBusy, setAiBusy] = useState(false);
    const [aiPrompt, setAiPrompt] = useState('');
    const [dragId, setDragId] = useState<number | null>(null);

    useEffect(() => { setSelected(initialMenuIds); }, [initialMenuIds, open]);

    useEffect(() => {
        if (!open) return;
        (async () => {
            const [rGan, rGer, rRec] = await Promise.all([
                supabase.from('gangen').select('*').order('volgorde'),
                supabase.from('gerechten').select('id,naam,gang_slug,beschrijving,kostprijs_pp').eq('actief', true).order('volgorde'),
                supabase.from('recepten').select('id,naam,categorie').order('naam'),
            ]);
            setGangen((rGan.data || []) as Gang[]);
            const items: Item[] = [
                ...((rGer.data || []).map((g: any) => ({ id: g.id, naam: g.naam, gang_slug: g.gang_slug, beschrijving: g.beschrijving, kostprijs_pp: g.kostprijs_pp, src: 'gerecht' as const }))),
                ...((rRec.data || []).map((r: any) => ({ id: r.id + 900000, naam: r.naam, categorie: r.categorie, src: 'recept' as const }))),
            ];
            setPool(items);
        })();
    }, [open]);

    const selectedItems = useMemo(() => selected.map(id => pool.find(p => (p.src === 'gerecht' ? p.id === id : p.id - 900000 === id))).filter(Boolean) as Item[], [selected, pool]);

    const filteredPool = useMemo(() => {
        const q = query.toLowerCase().trim();
        return pool.filter(p => {
            if (filterSrc !== 'all' && p.src !== filterSrc) return false;
            if (q && !p.naam?.toLowerCase().includes(q) && !p.beschrijving?.toLowerCase().includes(q)) return false;
            return true;
        });
    }, [pool, query, filterSrc]);

    function toggle(item: Item) {
        const realId = item.src === 'gerecht' ? item.id : item.id - 900000;
        setSelected(prev => prev.includes(realId) ? prev.filter(x => x !== realId) : [...prev, realId]);
    }

    function getItemsForGang(gangSlug: string): Item[] {
        return selectedItems.filter(it => it.src === 'gerecht' && it.gang_slug === gangSlug);
    }
    function getItemsWithoutGang(): Item[] {
        return selectedItems.filter(it => it.src === 'recept' || !it.gang_slug || !gangen.some(g => g.slug === it.gang_slug));
    }

    async function save() {
        setSaving(true);
        try {
            await supabase.from('events').update({ menu: selected } as any).eq('id', eventId);
            onSaved(selected);
            onClose();
        } finally { setSaving(false); }
    }

    async function aiSuggest() {
        if (!aiPrompt.trim()) return;
        setAiBusy(true);
        try {
            const existing = pool.map(p => ({ naam: p.naam, gang: p.gang_slug, categorie: p.categorie }));
            const res = await fetch('/api/recipe-generate', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mode: 'menu', prompt: aiPrompt, existing, options: { gasten: 20, gangen: String(Math.max(gangen.length, 3)) }, model: 'haiku' }),
            });
            const body = await res.json();
            if (!res.ok) { alert('AI fout: ' + (body.error || 'onbekend')); return; }
            // Match genereerde gerechten tegen pool (fuzzy)
            const gen = body.data.gerechten || [];
            const newIds: number[] = [];
            gen.forEach((g: any) => {
                const q = (g.naam || '').toLowerCase();
                const match = pool.find(p => p.naam?.toLowerCase() === q || p.naam?.toLowerCase().includes(q.slice(0, 10)));
                if (match && match.src === 'gerecht' && !newIds.includes(match.id) && !selected.includes(match.id)) newIds.push(match.id);
            });
            setSelected([...selected, ...newIds]);
            setAiPrompt('');
        } catch (e: any) {
            alert('Fout: ' + (e.message || 'onbekend'));
        } finally { setAiBusy(false); }
    }

    if (!open) return null;

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', zIndex: 2000, display: 'flex', flexDirection: 'column' }} onClick={onClose}>
            <div onClick={e => e.stopPropagation()} style={{ margin: 'auto', width: 'min(1280px, 96vw)', maxHeight: '92vh', background: 'var(--bg)', border: '1px solid var(--card-solid)', borderRadius: 14, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                {/* HEADER */}
                <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--card-solid)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <ChefHat size={16} style={{ color: 'var(--brand-primary)' }} />
                            <h2 style={{ fontFamily: 'Outfit, sans-serif', fontSize: 20, fontWeight: 500, color: 'var(--text)', margin: 0 }}>Menukaart Builder</h2>
                        </div>
                        <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0, marginTop: 2 }}>{eventName || 'Event'} · {selected.length} gerechten geselecteerd</p>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={onClose} className="btn btn-ghost">Annuleren</button>
                        <button onClick={save} disabled={saving} className="btn btn-primary">
                            {saving ? <><Loader2 size={13} className="spin" /> Opslaan...</> : <><Check size={13} /> Opslaan ({selected.length})</>}
                        </button>
                    </div>
                </div>

                {/* BODY: 2-kolom pool + kaart */}
                <div className="responsive-grid" style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: 0, overflow: 'auto' }}>
                    {/* LEFT: POOL */}
                    <div style={{ padding: 16, borderRight: '1px solid var(--card-solid)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.15em', marginBottom: 8 }}>Alle gerechten & recepten</div>
                        <div style={{ position: 'relative', marginBottom: 8 }}>
                            <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
                            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Zoek in pool..."
                                style={{ width: '100%', padding: '7px 12px 7px 30px', borderRadius: 7, border: '1px solid var(--card-solid)', background: 'var(--card)', color: 'var(--text)', fontSize: 12, outline: 'none' }} />
                        </div>
                        <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
                            {(['all', 'gerecht', 'recept'] as const).map(f => (
                                <button key={f} onClick={() => setFilterSrc(f)}
                                    style={{ padding: '5px 10px', borderRadius: 5, fontSize: 11, fontWeight: 700, border: '1px solid ' + (filterSrc === f ? 'var(--brand-primary)' : 'var(--card-solid)'), background: filterSrc === f ? 'var(--brand-primary)' : 'transparent', color: filterSrc === f ? 'var(--brand-background, #000)' : 'var(--text)', cursor: 'pointer', textTransform: 'capitalize' }}>
                                    {f === 'all' ? 'Alle' : f}
                                </button>
                            ))}
                        </div>
                        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {filteredPool.length === 0 && <div style={{ fontSize: 12, color: 'var(--muted)', padding: 20, textAlign: 'center' }}>Geen items gevonden</div>}
                            {filteredPool.slice(0, 100).map(it => {
                                const realId = it.src === 'gerecht' ? it.id : it.id - 900000;
                                const isIn = selected.includes(realId);
                                return (
                                    <div key={it.src + '_' + it.id}
                                        draggable
                                        onDragStart={() => setDragId(realId)}
                                        onDragEnd={() => setDragId(null)}
                                        onClick={() => toggle(it)}
                                        style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 8, padding: '7px 10px', borderRadius: 6, border: '1px solid ' + (isIn ? 'var(--brand-primary)' : 'var(--card-solid)'), background: isIn ? 'color-mix(in srgb, var(--brand-primary) 15%, transparent)' : 'var(--card)', color: 'var(--text)', cursor: 'grab', fontSize: 12, alignItems: 'center' }}>
                                        <span style={{ width: 12, display: 'inline-flex', justifyContent: 'center' }}>{isIn ? <Check size={11} style={{ color: 'var(--brand-primary)' }} /> : <Plus size={11} style={{ color: 'var(--muted)' }} />}</span>
                                        <span>
                                            <div style={{ fontWeight: 600 }}>{it.naam}</div>
                                            {it.beschrijving && <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 1 }}>{it.beschrijving.slice(0, 60)}</div>}
                                        </span>
                                        <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: it.src === 'gerecht' ? 'var(--brand-primary)' : 'var(--muted)' }}>{it.src === 'gerecht' ? (it.gang_slug || 'gerecht') : 'recept'}</span>
                                    </div>
                                );
                            })}
                        </div>
                        {/* AI-gen */}
                        <div style={{ marginTop: 10, padding: 10, borderRadius: 8, background: 'color-mix(in srgb, var(--brand-primary) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--brand-primary) 25%, transparent)' }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--brand-primary)', textTransform: 'uppercase', letterSpacing: '.15em', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}><Sparkles size={11} /> AI stelt menu voor</div>
                            <div style={{ display: 'flex', gap: 6 }}>
                                <input value={aiPrompt} onChange={e => setAiPrompt(e.target.value)} placeholder="bv. zomerse BBQ, licht gekruid"
                                    style={{ flex: 1, padding: '6px 10px', borderRadius: 6, border: '1px solid var(--card-solid)', background: 'var(--card)', color: 'var(--text)', fontSize: 11, outline: 'none' }} />
                                <button onClick={aiSuggest} disabled={aiBusy || !aiPrompt.trim()} className="btn btn-primary btn-sm">
                                    {aiBusy ? <Loader2 size={11} className="spin" /> : <Sparkles size={11} />}
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* RIGHT: KAART-opbouw per gang */}
                    <div style={{ padding: 16, overflow: 'auto', background: 'var(--color-bg-deep)' }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.15em', marginBottom: 12 }}>De menukaart — sleep of klik gerechten</div>
                        {gangen.length === 0 && <div style={{ fontSize: 12, color: 'var(--muted)' }}>Laden gangen...</div>}
                        {gangen.map(g => {
                            const items = getItemsForGang(g.slug);
                            return (
                                <div key={g.slug}
                                    onDragOver={e => { e.preventDefault(); }}
                                    onDrop={() => {
                                        if (dragId != null) {
                                            // Set gang_slug op het gerecht? We gebruiken alleen event.menu ids, gang komt uit gerechten.gang_slug.
                                            // Dus drop = selecteer als nog niet geselecteerd
                                            if (!selected.includes(dragId)) setSelected([...selected, dragId]);
                                            setDragId(null);
                                        }
                                    }}
                                    style={{ marginBottom: 14, padding: 12, borderRadius: 10, border: '1px dashed var(--card-solid)', background: 'var(--card)' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.15em', color: 'var(--brand-primary)', textTransform: 'uppercase' }}>{g.naam}</div>
                                        <span style={{ fontSize: 10, color: 'var(--muted)' }}>{items.length} gekozen</span>
                                    </div>
                                    {items.length === 0 ? (
                                        <div style={{ padding: 16, fontSize: 11, color: 'var(--muted)', textAlign: 'center', opacity: 0.6 }}>— sleep hierheen of klik items uit de pool —</div>
                                    ) : items.map(it => (
                                        <div key={'sel_' + it.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', background: 'var(--color-bg-deep)', borderRadius: 6, marginBottom: 4, border: '1px solid var(--card-solid)' }}>
                                            <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)' }}>{it.naam}</span>
                                            <button onClick={() => toggle(it)} style={{ background: 'transparent', border: 'none', color: 'var(--red)', cursor: 'pointer', padding: 2 }}><Trash2 size={11} /></button>
                                        </div>
                                    ))}
                                </div>
                            );
                        })}
                        {getItemsWithoutGang().length > 0 && (
                            <div style={{ marginBottom: 14, padding: 12, borderRadius: 10, border: '1px solid var(--card-solid)', background: 'var(--card)' }}>
                                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.15em', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 8 }}>Recepten & overig</div>
                                {getItemsWithoutGang().map(it => (
                                    <div key={'orph_' + it.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', background: 'var(--color-bg-deep)', borderRadius: 6, marginBottom: 4, border: '1px solid var(--card-solid)' }}>
                                        <span style={{ fontSize: 12, fontWeight: 500 }}>{it.naam}</span>
                                        <button onClick={() => toggle(it)} style={{ background: 'transparent', border: 'none', color: 'var(--red)', cursor: 'pointer', padding: 2 }}><Trash2 size={11} /></button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
            <style>{`.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
    );
}
