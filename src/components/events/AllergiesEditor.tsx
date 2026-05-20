/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

/**
 * Editor voor `event_allergies`-tabel: per gast/tafel een rij met
 * allergenen-codes, severity en optionele notitie. Output wordt door
 * Service Mode gebruikt voor de allergie-tabel + Rook AI critical-flag.
 *
 * Allergen-codes komen uit `_types/service.ALLERGENS`. We tonen ze als
 * toggle-chips (multi-select) i.p.v. tekst-input zodat typo's onmogelijk
 * zijn — Rook detecteert immers op exacte codes.
 */

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Plus, Trash2, Save, AlertTriangle, Sparkles } from 'lucide-react';
import { ALLERGENS, type AllergenCode } from '@/app/events/[id]/service/_types/service';
import type { DbEventAllergy } from '@/types';
import { useToast } from '@/components/Toast';

interface Props {
    eventId: number;
    onSaved?: () => void;
}

const SEVERITY_OPTIONS: DbEventAllergy['severity'][] = ['normal', 'high', 'critical'];
const SEVERITY_LABELS: Record<DbEventAllergy['severity'], string> = {
    normal: 'Normaal',
    high: 'Verhoogd',
    critical: 'Kritiek',
};
const SEVERITY_COLORS: Record<DbEventAllergy['severity'], string> = {
    normal: 'var(--muted)',
    high: 'var(--amber)',
    critical: 'var(--red)',
};

interface EditableAllergy {
    id?: number;
    table_num: number | null;
    seat_num: number | null;
    name: string;
    allergens: string[];
    note: string;
    severity: DbEventAllergy['severity'];
}

function emptyAllergy(): EditableAllergy {
    return { table_num: null, seat_num: null, name: '', allergens: [], note: '', severity: 'normal' };
}

export default function AllergiesEditor({ eventId, onSaved }: Props) {
    const showToast = useToast();
    const [rows, setRows] = useState<EditableAllergy[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        let alive = true;
        (async () => {
            const { data, error } = await supabase
                .from('event_allergies')
                .select('*')
                .eq('event_id', eventId)
                .order('table_num', { ascending: true });
            if (!alive) return;
            if (error) { console.warn('[AllergiesEditor] load failed:', error); setLoading(false); return; }
            setRows(((data || []) as DbEventAllergy[]).map(r => ({
                id: r.id,
                table_num: r.table_num ?? null,
                seat_num: r.seat_num ?? null,
                name: r.name || '',
                allergens: r.allergens || [],
                note: r.note || '',
                severity: r.severity,
            })));
            setLoading(false);
        })();
        return () => { alive = false; };
    }, [eventId]);

    function setRow(idx: number, patch: Partial<EditableAllergy>) {
        setRows(prev => prev.map((r, i) => i === idx ? { ...r, ...patch } : r));
    }
    function addRow() { setRows(prev => [...prev, emptyAllergy()]); }
    function removeRow(idx: number) { setRows(prev => prev.filter((_, i) => i !== idx)); }

    function toggleAllergen(idx: number, code: string) {
        const cur = rows[idx].allergens;
        const next = cur.includes(code) ? cur.filter(c => c !== code) : [...cur, code];
        setRow(idx, { allergens: next });
    }

    async function save() {
        setSaving(true);
        try {
            /* Delete-then-insert; eenvoudig en atomic per event. */
            const { error: delErr } = await supabase.from('event_allergies').delete().eq('event_id', eventId);
            if (delErr) throw delErr;

            if (rows.length > 0) {
                const inserts = rows.map(r => ({
                    event_id: eventId,
                    table_num: r.table_num,
                    seat_num: r.seat_num,
                    name: r.name,
                    allergens: r.allergens,
                    note: r.note,
                    severity: r.severity,
                }));
                const { error: insErr } = await supabase.from('event_allergies').insert(inserts);
                if (insErr) throw insErr;
            }
            onSaved?.();
        } catch (e: any) {
            console.error('[AllergiesEditor] save failed:', e);
            showToast('Opslaan mislukt: ' + (e?.message || 'onbekende fout'), 'error');
        } finally {
            setSaving(false);
        }
    }

    if (loading) return <div style={{ padding: 16, color: 'var(--muted)', fontSize: 13 }}>Laden…</div>;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>{rows.length} {rows.length === 1 ? 'allergie/dieet' : 'allergieën/diëten'}</span>
                <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-ghost btn-sm" onClick={addRow}><Plus size={12} /> Regel</button>
                    <button className="btn btn-brand btn-sm" onClick={save} disabled={saving}>
                        {saving ? <><Sparkles size={12} className="animate-pulse" /> Opslaan…</> : <><Save size={12} /> Opslaan</>}
                    </button>
                </div>
            </div>

            {rows.length === 0 && (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)', fontSize: 13, border: '1px dashed var(--border)', borderRadius: 10 }}>
                    Geen allergieën / diëten geregistreerd — klik <strong>+ Regel</strong> om er een toe te voegen.
                </div>
            )}

            {rows.map((r, idx) => (
                <div key={idx} style={{ padding: 12, border: '1px solid var(--border)', borderRadius: 10, background: 'rgba(28,28,32,.4)' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '80px 80px 1fr 140px 32px', gap: 8, marginBottom: 10 }}>
                        <div>
                            <label style={{ fontSize: 10, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Tafel</label>
                            <input type="number" value={r.table_num ?? ''} onChange={e => setRow(idx, { table_num: e.target.value === '' ? null : parseInt(e.target.value) })}
                                style={{ width: '100%', padding: '6px 10px', fontSize: 12, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)' }} />
                        </div>
                        <div>
                            <label style={{ fontSize: 10, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Stoel</label>
                            <input type="number" value={r.seat_num ?? ''} onChange={e => setRow(idx, { seat_num: e.target.value === '' ? null : parseInt(e.target.value) })}
                                style={{ width: '100%', padding: '6px 10px', fontSize: 12, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)' }} />
                        </div>
                        <div>
                            <label style={{ fontSize: 10, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Naam</label>
                            <input value={r.name} onChange={e => setRow(idx, { name: e.target.value })} placeholder="Tante Marie"
                                style={{ width: '100%', padding: '6px 10px', fontSize: 12, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)' }} />
                        </div>
                        <div>
                            <label style={{ fontSize: 10, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Severity</label>
                            <select value={r.severity} onChange={e => setRow(idx, { severity: e.target.value as DbEventAllergy['severity'] })}
                                style={{ width: '100%', padding: '6px 10px', fontSize: 12, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, color: SEVERITY_COLORS[r.severity], fontWeight: r.severity === 'critical' ? 700 : 500 }}>
                                {SEVERITY_OPTIONS.map(s => <option key={s} value={s}>{SEVERITY_LABELS[s]}</option>)}
                            </select>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                            <button className="btn btn-ghost btn-sm" onClick={() => removeRow(idx)} style={{ color: 'var(--red)' }}><Trash2 size={12} /></button>
                        </div>
                    </div>

                    <div style={{ marginBottom: 10 }}>
                        <label style={{ fontSize: 10, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Allergenen / diëten</label>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            {(Object.keys(ALLERGENS) as AllergenCode[]).map(code => {
                                const active = r.allergens.includes(code);
                                const meta = ALLERGENS[code];
                                return (
                                    <button key={code} type="button" onClick={() => toggleAllergen(idx, code)}
                                        style={{
                                            padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                                            background: active ? meta.color + '24' : 'transparent',
                                            border: '1px solid ' + (active ? meta.color + '66' : 'var(--border)'),
                                            color: active ? meta.color : 'var(--muted)',
                                        }}>
                                        {meta.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div>
                        <label style={{ fontSize: 10, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Notitie (optioneel)</label>
                        <input value={r.note} onChange={e => setRow(idx, { note: e.target.value })} placeholder="Pinda-allergie strikt — aparte plank"
                            style={{ width: '100%', padding: '6px 10px', fontSize: 12, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)' }} />
                    </div>

                    {r.severity === 'critical' && (
                        <div style={{ marginTop: 8, padding: '6px 10px', borderRadius: 6, background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.25)', display: 'flex', gap: 6, alignItems: 'center', fontSize: 11, color: 'var(--red)' }}>
                            <AlertTriangle size={12} /> Critical — Rook AI escaleert deze als prioriteit-1 directive in Service Mode.
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
}
