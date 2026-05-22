import { Sparkles, Boxes, AlertTriangle, UtensilsCrossed, type LucideIcon } from 'lucide-react';
import type { AiCoverage } from '../_lib/types';

interface Props {
    coverage: AiCoverage;
}

const ROWS: Array<{ key: keyof AiCoverage; label: string; Icon: LucideIcon }> = [
    { key: 'componenten', label: 'Componenten', Icon: Boxes },
    { key: 'allergenen',  label: 'Allergenen',  Icon: AlertTriangle },
    { key: 'gerechten',   label: 'Gerechten',   Icon: UtensilsCrossed },
];

/* Per laag (componenten/allergenen/gerechten) een stacked progress-bar:
   - Lichte amber = totale AI-suggesties
   - Diepe brand = AI-suggesties die mens bevestigde
   - Achtergrond grijs = handmatig of n.v.t. */
export default function AiCoverageBars({ coverage }: Props) {
    return (
        <div className="metal">
            <div className="metal-body">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                    <Sparkles size={15} color="var(--brand-gold)" />
                    <span style={{ fontSize: 14, fontWeight: 600 }}>AI-coverage</span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {ROWS.map(({ key, label, Icon }) => {
                        const d = coverage[key];
                        const aiPct = d.total ? Math.round(d.aiSuggested / d.total * 100) : 0;
                        const confPct = d.total ? Math.round(d.confirmed / d.total * 100) : 0;
                        return (
                            <div key={key}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                                        <Icon size={12} color="var(--muted)" />
                                        <span>{label}</span>
                                    </div>
                                    <span style={{ fontSize: 11, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>
                                        {d.aiSuggested}/{d.total} door AI
                                    </span>
                                </div>
                                <div style={{ height: 8, background: 'rgba(130,130,130,.08)', borderRadius: 4, overflow: 'hidden', position: 'relative' }} aria-hidden>
                                    <div style={{ position: 'absolute', top: 0, left: 0, height: '100%', width: `${aiPct}%`, background: 'rgba(255,191,0,.25)', borderRadius: 4, transition: 'width .4s' }} />
                                    <div style={{ position: 'absolute', top: 0, left: 0, height: '100%', width: `${confPct}%`, background: 'var(--brand)', borderRadius: 4, transition: 'width .4s' }} />
                                </div>
                                <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 3 }}>
                                    {d.confirmed} bevestigd door mens · {Math.max(0, d.aiSuggested - d.confirmed)} wacht op review
                                </div>
                            </div>
                        );
                    })}
                </div>

                <div style={{ display: 'flex', gap: 16, marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                    <LegendChip color="var(--brand)" label="Bevestigd" />
                    <LegendChip color="rgba(255,191,0,.25)" label="AI-suggestie (onbevestigd)" />
                </div>
            </div>
        </div>
    );
}

function LegendChip({ color, label }: { color: string; label: string }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--muted)' }}>
            <span style={{ width: 10, height: 6, borderRadius: 2, background: color }} aria-hidden />
            {label}
        </div>
    );
}
