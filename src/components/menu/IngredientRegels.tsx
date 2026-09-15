'use client';
/* IngredientRegels — de ingrediëntregels van een AI-receptuur in het
   gerecht-formulier, mét de koppeling naar een catalogusproduct.

   Tot golf 2 was dit blok alleen-lezen ("oude kostprijsberekening"). Maar
   voor een gerecht dat nog geen componenten heeft is dit de enige plek waar
   de kostprijs vandaan komt, en dan moet je een verkeerde koppeling kunnen
   corrigeren. Per regel: welk product, bij wie, wat kost het per portie, hoe
   zeker — en de knop "ander product" die de AI drie alternatieven laat
   voorstellen (IngredientAlternatieven). */

import { useState } from 'react';
import { RefreshCw, Trash2 } from 'lucide-react';
import type { AiFillIngredient } from '@/components/RecipeAiButton';
import type { MatchRegel } from '@/lib/ingredientMatchDb';
import { IngredientAlternatieven } from './IngredientAlternatieven';
import { fmtEuro } from './helpers';

interface Props {
    rows: AiFillIngredient[];
    onChange: (rows: AiFillIngredient[]) => void;
    kostprijsLeverancier?: string | null;
}

/** Kostprijs p.p. in centen uit de regels die een prijs hebben. */
export function kostprijsUitRegels(rows: AiFillIngredient[]): number {
    return rows.reduce((s, r) => s + (r.match?.line_cost_cents ?? 0), 0);
}

const KLEUR = {
    hoog: 'var(--green, #22c55e)',
    middel: 'var(--brand)',
    laag: 'var(--red, #ef4444)',
} as const;

export function IngredientRegels({ rows, onChange, kostprijsLeverancier }: Props) {
    const [open, setOpen] = useState<number | null>(null);

    function zet(idx: number, match: MatchRegel | null) {
        const next = rows.map((r, i) => {
            if (i !== idx) return r;
            const hasCost = !!(match && match.line_cost_cents != null);
            const perUnit = hasCost && r.qty_pp > 0 ? (match!.line_cost_cents! / 100) / r.qty_pp : null;
            return { ...r, match, is_estimated: !hasCost, estimated_price_eur: perUnit, inventory_id: null };
        });
        onChange(next);
        setOpen(null);
    }

    const totaal = kostprijsUitRegels(rows);
    const gekoppeld = rows.filter((r) => r.match && r.match.line_cost_cents != null).length;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {rows.map((r, idx) => {
                const m = (r.match ?? null) as MatchRegel | null;
                const heeftPrijs = !!(m && m.line_cost_cents != null);
                const conf = m?.confidence ?? null;
                return (
                    <div key={idx}>
                        <div style={{
                            display: 'grid', gridTemplateColumns: 'minmax(0,1.2fr) minmax(0,1.6fr) auto auto',
                            gap: 10, alignItems: 'center', padding: '8px 10px', borderRadius: 8,
                            background: 'var(--bg-subtle)', border: '1px solid var(--border)',
                        }}>
                            <div style={{ minWidth: 0 }}>
                                <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.naam}</div>
                                <div style={{ fontSize: 11, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>
                                    {r.qty_pp ? `${r.qty_pp} ${r.unit} p.p.` : r.unit}
                                </div>
                            </div>
                            <div style={{ minWidth: 0, fontSize: 12 }}>
                                {m ? (
                                    <>
                                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={m.name}>
                                            <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: 999, background: conf ? KLEUR[conf] : 'var(--muted)', marginRight: 6 }} />
                                            {m.name}
                                        </div>
                                        <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                                            {m.supplier ?? (m.source === 'component' ? 'eigen bibliotheek' : m.source === 'inventory' ? 'eigen voorraad' : 'catalogus')}
                                            {m.unit_approx ? ' · g≈ml' : ''}
                                            {!heeftPrijs ? ' · eenheid past niet' : ''}
                                        </div>
                                    </>
                                ) : (
                                    <span style={{ color: 'var(--muted)' }}>
                                        Geen product{kostprijsLeverancier ? ` bij ${kostprijsLeverancier}` : ''} — geen kostprijs
                                    </span>
                                )}
                            </div>
                            <div style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums', textAlign: 'right', color: heeftPrijs ? 'var(--text)' : 'var(--muted)', minWidth: 56 }}>
                                {heeftPrijs ? fmtEuro(m!.line_cost_cents! / 100) : '—'}
                            </div>
                            <div style={{ display: 'flex', gap: 4 }}>
                                <button type="button" className="btn btn-ghost btn-sm" title="Ander product kiezen (AI stelt 3 alternatieven voor)"
                                    onClick={() => setOpen(open === idx ? null : idx)} style={{ padding: '4px 8px' }}>
                                    <RefreshCw size={12} />
                                </button>
                                <button type="button" className="btn btn-ghost btn-sm" title="Regel verwijderen"
                                    onClick={() => onChange(rows.filter((_, i) => i !== idx))} style={{ padding: '4px 8px' }}>
                                    <Trash2 size={12} />
                                </button>
                            </div>
                        </div>
                        {open === idx && (
                            <IngredientAlternatieven
                                naam={r.naam}
                                qtyPp={r.qty_pp}
                                unit={r.unit}
                                huidige={m}
                                onKies={(match) => zet(idx, match)}
                                onLeeg={() => zet(idx, null)}
                                onSluit={() => setOpen(null)}
                            />
                        )}
                    </div>
                );
            })}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--muted)', padding: '4px 10px' }}>
                <span>{gekoppeld} van {rows.length} met een prijs{kostprijsLeverancier ? ` (${kostprijsLeverancier} + eigen bibliotheek)` : ''}</span>
                <span style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--text)', fontWeight: 600 }}>{fmtEuro(totaal / 100)} p.p.</span>
            </div>
        </div>
    );
}
