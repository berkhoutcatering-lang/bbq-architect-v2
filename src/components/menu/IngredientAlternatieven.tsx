'use client';
/* IngredientAlternatieven — "Bidfood heeft het niet, of we twijfelen":
   drie gerichte alternatieven uit de kostprijs-catalogus, gekozen door de AI,
   geprijsd door de code. Mathijs kiest er één, of laat de regel leeg.

   Gedeeld door de Bedenk-met-AI-preview en het gerecht-formulier, zodat een
   ingrediënt op beide plekken op dezelfde manier aan een product hangt.
   Golf 2 van docs/leveranciersvoorkeur-plan.md. */

import { useEffect, useState } from 'react';
import { Loader2, Check, X, Sparkles } from 'lucide-react';
import type { MatchRegel } from '@/lib/ingredientMatchDb';
import { MRButton, MREyebrow } from './atoms';
import { fmtEuro } from './helpers';

export interface AlternatiefUit {
    match: MatchRegel;
    reden: string;
}

interface Props {
    naam: string;
    qtyPp: number;
    unit: string;
    huidige: MatchRegel | null;
    onKies: (match: MatchRegel) => void;
    /** "Laat leeg, ik vul zelf in" — de regel blijft zonder kostprijs. */
    onLeeg: () => void;
    onSluit: () => void;
}

function prijsRegel(m: MatchRegel, qtyPp: number, unit: string): string {
    if (m.line_cost_cents == null) {
        return `eenheid past niet (${m.base_unit === 'stuk' ? 'per stuk' : 'per ' + m.base_unit} vs ${unit || '?'})`;
    }
    const perPortie = fmtEuro(m.line_cost_cents / 100);
    const perBasis = m.base_unit === 'stuk'
        ? `${fmtEuro(m.cents_per_base_unit / 100)} per stuk`
        : `${fmtEuro(m.cents_per_base_unit * 10)} per ${m.base_unit === 'g' ? 'kg' : 'liter'}`;
    return `${perPortie} voor ${qtyPp} ${unit}${m.unit_approx ? ' ≈' : ''} · ${perBasis}`;
}

export function IngredientAlternatieven({ naam, qtyPp, unit, huidige, onKies, onLeeg, onSluit }: Props) {
    /* Eén status-object: laden → klaar of fout. De vraag gaat één keer per
       ingrediënt+koppeling de deur uit (kost een paar cent), daarom hangt het
       effect aan de sleutel en niet aan de object-identiteit van `huidige`. */
    const [staat, setStaat] = useState<{
        laden: boolean; fout: string | null;
        oordeel: { klopt: boolean | null; reden: string };
        alternatieven: AlternatiefUit[]; leverancier: string | null;
    }>({ laden: true, fout: null, oordeel: { klopt: null, reden: '' }, alternatieven: [], leverancier: null });
    const { laden, fout, oordeel, alternatieven, leverancier } = staat;
    const huidigeSleutel = huidige ? `${huidige.source}:${huidige.ref_id}` : '';

    useEffect(() => {
        let actief = true;
        fetch('/api/recipe/alternatives', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                naam, qty_pp: qtyPp, eenheid: unit,
                huidige: huidige ? { name: huidige.name, source: huidige.source, ref_id: huidige.ref_id } : null,
            }),
        })
            .then(async (r) => {
                const b = await r.json().catch(() => ({}));
                if (!r.ok || !b.success) throw new Error(b.error || b.message || `HTTP ${r.status}`);
                return b.data;
            })
            .then((d) => {
                if (!actief) return;
                setStaat({
                    laden: false, fout: null,
                    oordeel: { klopt: d.huidige_klopt ?? null, reden: d.huidige_reden ?? '' },
                    alternatieven: Array.isArray(d.alternatieven) ? d.alternatieven : [],
                    leverancier: d.kostprijs_leverancier ?? null,
                });
            })
            .catch((e) => {
                if (actief) setStaat((s) => ({ ...s, laden: false, fout: e instanceof Error ? e.message : 'Ophalen mislukt' }));
            });
        return () => { actief = false; };
        // huidige zit via huidigeSleutel in de deps; het object zelf wisselt van identiteit bij elke render van de ouder.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [naam, qtyPp, unit, huidigeSleutel]);

    return (
        <div style={{
            marginTop: 8, padding: 12, borderRadius: 10,
            background: 'rgba(255,191,0,.05)', border: '1px solid rgba(255,191,0,.2)',
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <MREyebrow>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <Sparkles size={10} /> Alternatieven voor “{naam}”{leverancier ? ` bij ${leverancier}` : ''}
                    </span>
                </MREyebrow>
                <button onClick={onSluit} aria-label="Sluit" style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}>
                    <X size={14} />
                </button>
            </div>

            {laden && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>
                    <Loader2 size={14} style={{ animation: 'mr-spin 1s linear infinite' }} /> AI kijkt in de catalogus…
                </div>
            )}
            {fout && <div style={{ fontSize: 12, color: 'var(--red, #ef4444)', marginTop: 8 }}>{fout}</div>}

            {!laden && !fout && (
                <>
                    {huidige && (
                        <div style={{
                            marginTop: 8, fontSize: 12, padding: '6px 8px', borderRadius: 6,
                            background: oordeel.klopt === false ? 'rgba(239,68,68,.06)' : 'rgba(34,197,94,.06)',
                            color: oordeel.klopt === false ? 'var(--red, #ef4444)' : 'var(--green, #22c55e)',
                        }}>
                            {oordeel.klopt === false ? '✗ ' : oordeel.klopt === true ? '✓ ' : '· '}
                            Nu gekoppeld: <strong>{huidige.name}</strong>
                            {oordeel.reden ? ` — ${oordeel.reden}` : ''}
                        </div>
                    )}

                    {alternatieven.length === 0 ? (
                        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>
                            Niets gevonden dat in de buurt komt{leverancier ? ` bij ${leverancier}` : ''}. Laat de regel leeg en vul de kostprijs zelf in.
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                            {alternatieven.map((a, i) => (
                                <button
                                    key={`${a.match.source}-${a.match.ref_id}-${i}`}
                                    type="button"
                                    /* De AI stelde voor, de kok zegt ja: dan is de koppeling zeker —
                                       en wordt onthouden (golf 4), zodat dit ingrediënt de volgende
                                       keer direct goed is. */
                                    onClick={() => {
                                        const gekozen = { ...a.match, confidence: 'hoog' as const };
                                        fetch('/api/recipe/aliases', {
                                            method: 'POST', headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ aliases: [{ naam, match: { source: gekozen.source, ref_id: gekozen.ref_id, name: gekozen.name, supplier: gekozen.supplier ?? null } }] }),
                                        }).catch(() => { /* volgende keer opnieuw */ });
                                        onKies(gekozen);
                                    }}
                                    style={{
                                        textAlign: 'left', padding: '8px 10px', borderRadius: 8, cursor: 'pointer',
                                        background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text)',
                                        display: 'flex', gap: 10, alignItems: 'flex-start', fontFamily: 'var(--font-sans)',
                                    }}
                                >
                                    <Check size={14} style={{ marginTop: 2, color: 'var(--brand)', flexShrink: 0 }} />
                                    <span style={{ flex: 1, minWidth: 0 }}>
                                        <span style={{ fontSize: 13, fontWeight: 600, display: 'block' }}>{a.match.name}</span>
                                        <span style={{ fontSize: 11, color: 'var(--muted)', display: 'block' }}>
                                            {a.reden}{a.match.supplier ? ` · ${a.match.supplier}` : ''}
                                        </span>
                                        <span style={{ fontSize: 11, color: a.match.line_cost_cents == null ? 'var(--red, #ef4444)' : 'var(--green, #22c55e)', display: 'block', fontVariantNumeric: 'tabular-nums' }}>
                                            {prijsRegel(a.match, qtyPp, unit)}
                                        </span>
                                    </span>
                                </button>
                            ))}
                        </div>
                    )}

                    <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                        <MRButton variant="ghost" sm onClick={onLeeg}>Laat leeg — ik vul zelf in</MRButton>
                    </div>
                </>
            )}
        </div>
    );
}
