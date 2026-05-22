import { Cpu } from 'lucide-react';
import type { AiCosts } from '../../_lib/health/types';

interface Props {
    costs: AiCosts;
}

const fmt = (cents: number) => '€' + (cents / 100).toFixed(2).replace('.', ',');

/* Maandelijkse AI-spend per feature met soft-cap usage-bar.
   - Bar wordt rood >100%, amber >75%, anders groen.
   - Tier wordt rechtsboven getoond (Starter/Pro/Enterprise). */
export default function AiCostTable({ costs }: Props) {
    const usedPct = costs.softCap ? Math.round(costs.totalCents / costs.softCap * 100) : 0;
    const barColor = usedPct > 100 ? 'var(--red)' : usedPct > 75 ? 'var(--amber)' : 'var(--green)';

    return (
        <div className="metal">
            <div className="metal-body">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Cpu size={15} color="var(--brand-gold)" />
                        <span style={{ fontSize: 14, fontWeight: 600 }}>AI-kosten {costs.month}</span>
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>{costs.tier}-tier</span>
                </div>

                {/* Usage-bar */}
                <div style={{ marginBottom: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>
                        <span>{fmt(costs.totalCents)} van {fmt(costs.softCap)}</span>
                        <span style={{ color: barColor, fontWeight: 600 }}>{usedPct}%</span>
                    </div>
                    <div style={{ height: 5, background: 'rgba(130,130,130,.08)', borderRadius: 3, overflow: 'hidden' }} aria-hidden>
                        <div style={{ width: `${Math.min(usedPct, 100)}%`, height: '100%', background: barColor, borderRadius: 3, transition: 'width .4s' }} />
                    </div>
                </div>

                {costs.features.length === 0 ? (
                    <div style={{ padding: '14px 0', fontSize: 12, color: 'var(--muted-light)', textAlign: 'center' }}>
                        Nog geen AI-calls deze maand.
                    </div>
                ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid var(--border)' }}>
                                <th style={thStyle}>Feature</th>
                                <th style={{ ...thStyle, textAlign: 'right' }}>Calls</th>
                                <th style={{ ...thStyle, textAlign: 'right' }}>Totaal</th>
                                <th style={{ ...thStyle, textAlign: 'right' }}>Gem.</th>
                            </tr>
                        </thead>
                        <tbody>
                            {costs.features.map((f) => (
                                <tr key={f.feature} style={{ borderBottom: '1px solid rgba(130,130,130,.06)' }}>
                                    <td style={{ padding: '7px 0', color: 'var(--text)' }}>{f.feature}</td>
                                    <td style={{ padding: '7px 0', textAlign: 'right', color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>{f.calls}</td>
                                    <td style={{ padding: '7px 0', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmt(f.costCents)}</td>
                                    <td style={{ padding: '7px 0', textAlign: 'right', color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>{fmt(f.avgCents)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}

const thStyle: React.CSSProperties = {
    textAlign: 'left', padding: '6px 0',
    fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase',
    color: 'var(--muted)', fontWeight: 700,
};
