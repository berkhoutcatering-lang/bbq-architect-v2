'use client';
import { useState } from 'react';
import { useToast } from '@/components/Toast';
import { normalizeIngredienten, normalizeBereidingswijze } from '@/lib/utils';
import type { SupabaseClient } from '@supabase/supabase-js';

/* eslint-disable @typescript-eslint/no-explicit-any */

interface RecipeItem {
    naam?: string;
    categorie?: string;
    gang_slug?: string;
    beschrijving?: string;
    gram?: number;
    inkoop?: number;
    kostprijs_pp?: number;
    kostprijs?: number;
    foodcost?: number;
    marge?: number;
    ingredienten?: any;
    ingredients?: any;
    ingredients_list?: any;
    allergenen?: string[] | string;
    bereidingswijze?: string;
    bereiding?: string;
    stappenplan?: string;
    instructies?: string;
    preparation_steps?: string;
}

interface Action {
    data?: { recipes?: RecipeItem[] };
    description?: string;
}

interface RecipeMatrixProps {
    action: Action;
    supabase: SupabaseClient | null;
}

export default function RecipeMatrix({ action, supabase }: RecipeMatrixProps) {
    const showToast = useToast();
    const recipes: RecipeItem[] = (action.data && action.data.recipes) ? action.data.recipes : [];

    const [selected, setSelected] = useState<number[]>(recipes.map(function (_, i) { return i; }));
    const [importing, setImporting] = useState(false);
    const [imported, setImported] = useState(false);

    function toggleRow(index: number) {
        if (selected.includes(index)) {
            setSelected(selected.filter(function (i) { return i !== index; }));
        } else {
            setSelected([...selected, index]);
        }
    }

    function toggleAll() {
        if (selected.length === recipes.length) {
            setSelected([]);
        } else {
            setSelected(recipes.map(function (_, i) { return i; }));
        }
    }

    async function handleBulkImport() {
        if (selected.length === 0) return;
        if (!supabase) {
            showToast('Geen database verbinding', 'error');
            return;
        }

        setImporting(true);
        try {
            const KNOWN_SLUGS = ['bite', 'voorgerecht', 'hoofdgerecht', 'vegetarisch', 'dessert', 'bijgerecht', 'borrelhap', 'anders'];
            const { data: gangenData } = await supabase.from('gangen').select('slug');
            const validSlugs = (gangenData && gangenData.length > 0) ? gangenData.map(function (g: any) { return g.slug; }) : KNOWN_SLUGS;
            const fallbackSlug = validSlugs[0];

            const toImport = selected.map(function (index) {
                const r = recipes[index];

                const mappedIngs = normalizeIngredienten(r.ingredienten || r.ingredients || r.ingredients_list || []);
                const mappedBereiding = normalizeBereidingswijze(r as any);

                let mappedAllergs: string[] = [];
                if (Array.isArray(r.allergenen)) {
                    mappedAllergs = r.allergenen.map(String);
                } else if (typeof r.allergenen === 'string') {
                    mappedAllergs = r.allergenen.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
                }

                const safeKostprijs = r.inkoop || r.kostprijs_pp || r.kostprijs || r.foodcost || 0;

                let providedSlug = (r.categorie || r.gang_slug || 'hoofdgerechten').toLowerCase();
                let safeSlug = providedSlug;

                if (!validSlugs.includes(providedSlug)) {
                    if (providedSlug.endsWith('en') && validSlugs.includes(providedSlug.slice(0, -2))) safeSlug = providedSlug.slice(0, -2);
                    else if (providedSlug.endsWith('s') && validSlugs.includes(providedSlug.slice(0, -1))) safeSlug = providedSlug.slice(0, -1);
                    else {
                        const match = validSlugs.find(function (s: string) { return providedSlug.includes(s) || s.includes(providedSlug); });
                        safeSlug = match || fallbackSlug;
                    }
                }

                return {
                    naam: r.naam || 'Naamloos gerecht',
                    gang_slug: safeSlug,
                    beschrijving: r.beschrijving || 'Geen beschrijving gegenereerd',
                    preparation_steps: mappedBereiding,
                    ingredients_list: mappedIngs,
                    allergenen: mappedAllergs,
                    kostprijs_pp: parseFloat(String(safeKostprijs)) || 0,
                    actief: false,
                    volgorde: 900 + index
                };
            });

            const res = await supabase.from('gerechten').insert(toImport);
            if (res.error) throw res.error;

            showToast(selected.length + ' gerechten succesvol in Menu Engineering gezet!', 'success');
            setImported(true);
        } catch (err: any) {
            console.error('[Matrix Import Error]', err);
            showToast('Fout bij importeren: ' + err.message, 'error');
        } finally {
            setImporting(false);
        }
    }

    if (recipes.length === 0) {
        return <div className="p-3 text-sm text-center text-[var(--muted)]">Geen recepten gevonden in data.</div>;
    }

    return (
        <div style={{ marginTop: 12, border: '1px solid var(--border)', borderRadius: 12, background: 'var(--bg)', padding: 16 }}>
            <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <div style={{ fontWeight: 800, fontSize: 16, color: 'var(--brand)' }}>
                        <i className="fa-solid fa-layer-group" style={{ marginRight: 8 }}></i>
                        {action.description || 'Concept Funnel'}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                        {recipes.length} items gegenereerd {'\u2022'} Klik op een kaart om te bewaren
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-ghost btn-sm" onClick={toggleAll} disabled={imported} style={{ fontSize: 11 }}>
                        {selected.length === recipes.length ? 'Deselecteer alles' : 'Selecteer alles'}
                    </button>
                    {imported && (
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--green)', display: 'flex', alignItems: 'center', gap: 6 }}>
                            <i className="fa-solid fa-check-circle"></i> Ge\u00efmporteerd
                        </div>
                    )}
                </div>
            </div>

            <div className="dish-select-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
                {recipes.map(function (r, idx) {
                    const isSelected = selected.includes(idx);
                    let margeColor = 'var(--text)';
                    if ((r.marge || 0) >= 70) { margeColor = 'var(--green)'; }
                    else if ((r.marge || 0) >= 60) { margeColor = 'var(--amber)'; }
                    else { margeColor = 'var(--red)'; }

                    return (
                        <button
                            key={idx}
                            className={'dish-select-btn' + (isSelected ? ' selected' : '')}
                            onClick={function () { toggleRow(idx); }}
                            disabled={imported}
                            style={{
                                padding: 12, display: 'flex', flexDirection: 'column' as const, alignItems: 'flex-start',
                                textAlign: 'left' as const, gap: 6, borderRadius: 10,
                                border: isSelected ? '1px solid var(--brand)' : '1px solid var(--border)',
                                background: isSelected ? 'rgba(180,140,20,0.05)' : 'var(--panel)',
                                opacity: imported && !isSelected ? 0.3 : 1,
                                cursor: imported ? 'default' : 'pointer', transition: 'all 0.2s ease'
                            }}
                        >
                            <div className="dish-select-name" style={{ fontSize: 14, marginBottom: 2, width: '100%' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <span style={{ whiteSpace: 'normal', lineHeight: 1.2, fontWeight: isSelected ? 800 : 500 }}>{r.naam}</span>
                                    {isSelected && <i className="fa-solid fa-circle-check" style={{ color: 'var(--brand)', fontSize: 14, marginLeft: 8, marginTop: 2 }}></i>}
                                </div>
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ background: 'rgba(255,255,255,.05)', padding: '2px 6px', borderRadius: 4 }}>{r.categorie}</span>
                                <span>{'\u2022'}</span>
                                <span>Portie: <strong style={{ color: 'var(--text)' }}>{r.gram}g</strong></span>
                            </div>
                            <div style={{ marginTop: 'auto', width: '100%', paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                                    <span style={{ color: 'var(--muted)' }}>Foodcost:</span>
                                    <span style={{ fontWeight: 600 }}>{'\u20ac'}{(r.inkoop || 0).toFixed(2)}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, alignItems: 'center' }}>
                                    <span style={{ color: 'var(--muted)' }}>Marge:</span>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <div style={{ width: 40, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.05)', overflow: 'hidden' }}>
                                            <div style={{ width: Math.min(100, Math.max(0, r.marge || 0)) + '%', height: '100%', background: margeColor }}></div>
                                        </div>
                                        <span style={{ fontWeight: 700, color: margeColor }}>{Number(r.marge || 0).toFixed(0)}%</span>
                                    </div>
                                </div>
                            </div>
                        </button>
                    );
                })}
            </div>

            {!imported && (
                <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                        className="btn btn-brand"
                        onClick={handleBulkImport}
                        disabled={selected.length === 0 || importing}
                        style={{ padding: '10px 24px', fontSize: 14, fontWeight: 700 }}
                    >
                        {importing ? 'Importeren...' : 'Finaliseer Selectie naar Menu Engineering (' + selected.length + ')'}
                    </button>
                </div>
            )}
        </div>
    );
}
/* eslint-enable @typescript-eslint/no-explicit-any */
