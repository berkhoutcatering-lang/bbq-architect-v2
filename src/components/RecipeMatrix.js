'use client';
import { useState } from 'react';
import { useToast } from '@/components/Toast';

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
            var toImport = selected.map(function (index) {
                var r = recipes[index];
                return {
                    naam: r.naam,
                    categorie: r.categorie || 'Onbekend',
                    porties: r.porties || 10, // Standaard 10 porties voor batch
                    bereiding: r.bereiding || '',
                    ingredienten: r.ingredienten || [],
                    // we slaan inkoopprijs en marge op in een notitie of berekend veld als dat gewenst is
                    ingredient_costs: r.inkoop || 0,
                    actief: true
                };
            });

            var res = await supabase.from('recepten').insert(toImport);

            if (res.error) throw res.error;

            showToast(selected.length + ' recepten succesvol in de Vault gezet! 🚀', 'success');
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
        <div style={{ marginTop: 12, border: '1px solid var(--border)', borderRadius: 12, background: 'var(--bg)', overflow: 'hidden' }}>
            {/* Header */}
            <div style={{ background: 'var(--brand-light)', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <div style={{ fontWeight: 800, fontSize: 13, color: 'var(--brand)' }}>
                        <i className="fa-solid fa-table-list" style={{ marginRight: 6 }}></i>
                        {action.description || 'De Trechter Matrix'}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--brand)', opacity: 0.8, marginTop: 2 }}>
                        {recipes.length} items gegenereerd \u2022 Selecteer om te importeren
                    </div>
                </div>
                {!imported && (
                    <button
                        className="btn btn-brand btn-sm"
                        onClick={handleBulkImport}
                        disabled={selected.length === 0 || importing}
                        style={{ padding: '6px 14px', fontSize: 12 }}
                    >
                        {importing ? <i className="fa-solid fa-spinner fa-spin"></i> : <i className="fa-solid fa-file-import"></i>}
                        <span style={{ marginLeft: 6 }}>
                            {importing ? 'Importeren...' : 'Importeer (' + selected.length + ') in Vault'}
                        </span>
                    </button>
                )}
                {imported && (
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--green)', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <i className="fa-solid fa-check-circle"></i> Ge\u00EFmporteerd
                    </div>
                )}
            </div>

            {/* Table */}
            <div style={{ overflowX: 'auto' }}>
                <table className="tbl" style={{ margin: 0 }}>
                    <thead>
                        <tr>
                            <th style={{ width: 40, textAlign: 'center' }}>
                                <input
                                    type="checkbox"
                                    checked={selected.length === recipes.length && recipes.length > 0}
                                    onChange={toggleAll}
                                    disabled={imported}
                                />
                            </th>
                            <th>Naam</th>
                            <th>Cat. & Gram</th>
                            <th>Inkoop</th>
                            <th>Marge</th>
                            <th>Details</th>
                        </tr>
                    </thead>
                    <tbody>
                        {recipes.map(function (r, idx) {
                            var isSelected = selected.includes(idx);

                            // Traffic light logic
                            var margeColor = 'var(--text)';
                            var margeIcon = '';
                            if (r.marge >= 70) { margeColor = 'var(--green)'; margeIcon = '\uD83DFE2'; }
                            else if (r.marge >= 60) { margeColor = 'var(--amber)'; margeIcon = '\uD83DFEA'; }
                            else { margeColor = 'var(--red)'; margeIcon = '\uD83DD34'; }

                            return (
                                <tr key={idx} style={{ background: isSelected ? 'rgba(59,130,246,0.03)' : 'transparent', opacity: imported && !isSelected ? 0.3 : 1 }}>
                                    <td style={{ textAlign: 'center' }}>
                                        <input
                                            type="checkbox"
                                            checked={isSelected}
                                            onChange={function () { toggleRow(idx); }}
                                            disabled={imported}
                                        />
                                    </td>
                                    <td style={{ fontWeight: 600, fontSize: 13 }}>{r.naam}</td>
                                    <td>
                                        <div style={{ fontSize: 12 }}>{r.categorie}</div>
                                        <div style={{ fontSize: 10, color: 'var(--muted)' }}>{r.gram}g</div>
                                    </td>
                                    <td style={{ fontSize: 13, fontWeight: 500 }}>
                                        &euro;{(r.inkoop || 0).toFixed(2)}
                                    </td>
                                    <td style={{ fontSize: 13, fontWeight: 700, color: margeColor }}>
                                        {margeIcon} {r.marge}%
                                    </td>
                                    <td>
                                        <div style={{ fontSize: 10, color: 'var(--muted)', maxWidth: 150, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {(r.ingredienten || []).map(function (ig) { return ig.naam; }).join(', ')}
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
