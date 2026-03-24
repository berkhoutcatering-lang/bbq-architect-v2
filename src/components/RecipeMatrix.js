'use client';
import { useState } from 'react';
import { useToast } from '@/components/Toast';
import { normalizeIngredienten, normalizeBereidingswijze } from '@/lib/utils';

export default function RecipeMatrix({ action, supabase }) {
    var showToast = useToast();
    var recipes = (action.data && action.data.recipes) ? action.data.recipes : [];

    // Bijhouden welke rijen zijn geselecteerd (standaard allemaal)
    var [selected, setSelected] = useState(recipes.map(function (_, i) { return i; }));
    var [importing, setImporting] = useState(false);
    var [imported, setImported] = useState(false);

    function toggleRow(index) {
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
            // Hardcoded fallback zodat we nooit een ongeldige slug gebruiken als de DB niet reageert
            var KNOWN_SLUGS = ['bite', 'voorgerecht', 'hoofdgerecht', 'vegetarisch', 'dessert', 'bijgerecht', 'borrelhap', 'anders'];
            var { data: gangenData } = await supabase.from('gangen').select('slug');
            var validSlugs = (gangenData && gangenData.length > 0) ? gangenData.map(function (g) { return g.slug; }) : KNOWN_SLUGS;
            var fallbackSlug = validSlugs[0];

            var toImport = selected.map(function (index) {
                var r = recipes[index];

                // Normaliseer ingredienten & bereiding via centrale utils
                var mappedIngs = normalizeIngredienten(r.ingredienten || r.ingredients || r.ingredients_list || []);
                var mappedBereiding = normalizeBereidingswijze(r);

                // Normaliseer allergenen
                var mappedAllergs = [];
                if (Array.isArray(r.allergenen)) {
                    mappedAllergs = r.allergenen.map(String);
                } else if (typeof r.allergenen === 'string') {
                    mappedAllergs = r.allergenen.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
                }

                // Vang aliassen op
                var safeKostprijs = r.inkoop || r.kostprijs_pp || r.kostprijs || r.foodcost || 0;

                // Match Gang Slug veilig
                var providedSlug = (r.categorie || r.gang_slug || 'hoofdgerechten').toLowerCase();
                var safeSlug = providedSlug;

                if (!validSlugs.includes(providedSlug)) {
                    if (providedSlug.endsWith('en') && validSlugs.includes(providedSlug.slice(0, -2))) safeSlug = providedSlug.slice(0, -2);
                    else if (providedSlug.endsWith('s') && validSlugs.includes(providedSlug.slice(0, -1))) safeSlug = providedSlug.slice(0, -1);
                    else {
                        var match = validSlugs.find(function (s) { return providedSlug.includes(s) || s.includes(providedSlug); });
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
                    kostprijs_pp: parseFloat(safeKostprijs) || 0,
                    actief: false,
                    volgorde: 900 + index
                };
            });

            var res = await supabase.from('gerechten').insert(toImport);

            if (res.error) throw res.error;

            showToast(selected.length + ' gerechten succesvol in Menu Engineering gezet! 🚀', 'success');
            setImported(true);
        } catch (err) {
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
            {/* Header */}
            <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <div style={{ fontWeight: 800, fontSize: 16, color: 'var(--brand)' }}>
                        <i className="fa-solid fa-layer-group" style={{ marginRight: 8 }}></i>
                        {action.description || 'Concept Funnel'}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                        {recipes.length} items gegenereerd \u2022 Klik op een kaart om te bewaren
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    <button
                        className="btn btn-ghost btn-sm"
                        onClick={toggleAll}
                        disabled={imported}
                        style={{ fontSize: 11 }}
                    >
                        {selected.length === recipes.length ? 'Deselecteer alles' : 'Selecteer alles'}
                    </button>
                    {imported && (
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--green)', display: 'flex', alignItems: 'center', gap: 6 }}>
                            <i className="fa-solid fa-check-circle"></i> Geïmporteerd
                        </div>
                    )}
                </div>
            </div>

            {/* Grid */}
            <div className="dish-select-grid" style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                gap: 12
            }}>
                {recipes.map(function (r, idx) {
                    var isSelected = selected.includes(idx);

                    var margeColor = 'var(--text)';
                    var margeBg = 'rgba(255,255,255,0.1)';
                    if (r.marge >= 70) { margeColor = 'var(--green)'; margeBg = 'rgba(34,197,94,0.2)'; }
                    else if (r.marge >= 60) { margeColor = 'var(--amber)'; margeBg = 'rgba(245,158,11,0.2)'; }
                    else { margeColor = 'var(--red)'; margeBg = 'rgba(239,68,68,0.2)'; }

                    return (
                        <button
                            key={idx}
                            className={'dish-select-btn' + (isSelected ? ' selected' : '')}
                            onClick={function () { toggleRow(idx); }}
                            disabled={imported}
                            style={{
                                padding: 12,
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'flex-start',
                                textAlign: 'left',
                                gap: 6,
                                borderRadius: 10,
                                border: isSelected ? '1px solid var(--brand)' : '1px solid var(--border)',
                                background: isSelected ? 'rgba(180,140,20,0.05)' : 'var(--panel)',
                                opacity: imported && !isSelected ? 0.3 : 1,
                                cursor: imported ? 'default' : 'pointer',
                                transition: 'all 0.2s ease'
                            }}
                        >
                            <div className="dish-select-name" style={{ fontSize: 14, marginBottom: 2, width: '100%' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <span style={{ whiteSpace: 'normal', lineHeight: 1.2, fontWeight: isSelected ? 800 : 500 }}>{r.naam}</span>
                                    {isSelected && <i className="fa-solid fa-circle-check" style={{ color: 'var(--brand)', fontSize: 14, marginLeft: 8, marginTop: 2 }}></i>}
                                </div>
                            </div>

                            <div style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ background: 'rgba(255,255,255,.05)', padding: '2px 6px', borderRadius: 4 }}>
                                    {r.categorie}
                                </span>
                                <span>&#8226;</span>
                                <span>Portie: <strong style={{ color: 'var(--text)' }}>{r.gram}g</strong></span>
                            </div>

                            <div style={{ marginTop: 'auto', width: '100%', paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                                    <span style={{ color: 'var(--muted)' }}>Foodcost:</span>
                                    <span style={{ fontWeight: 600 }}>&euro;{(r.inkoop || 0).toFixed(2)}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, alignItems: 'center' }}>
                                    <span style={{ color: 'var(--muted)' }}>Marge:</span>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <div style={{ width: 40, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.05)', overflow: 'hidden' }}>
                                            <div style={{ width: Math.min(100, Math.max(0, r.marge)) + '%', height: '100%', background: margeColor }}></div>
                                        </div>
                                        <span style={{ fontWeight: 700, color: margeColor }}>{Number(r.marge).toFixed(0)}%</span>
                                    </div>
                                </div>
                            </div>
                        </button>
                    );
                })}
            </div>

            {/* Bottom Action Footer */}
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
