import { ArrowRight } from 'lucide-react';
import type { Dagboeking } from '@/lib/winkelboek/dagboeking';
import { euro } from '../_lib/tekst';

const KOPJE: React.CSSProperties = { fontSize: 10, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--muted)' };
const BEDRAG: React.CSSProperties = { fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' };

/**
 * De dag in hokjes: links wat er binnenkwam, rechts waar het geboekt is. Het
 * totaal van de hokjes hoort gelijk te zijn aan wat er binnenkwam; zo niet,
 * dan staat het verschil erbij.
 */
export default function DagHokjes({ dag }: { dag: Dagboeking }) {
    const binnen = [
        { naam: 'Pin', cents: dag.binnen.pin, kleur: 'var(--brand)' },
        { naam: 'Contant', cents: dag.binnen.contant, kleur: 'var(--text)' },
        { naam: 'Cadeaubon', cents: dag.binnen.cadeaubon, kleur: 'var(--muted)' },
    ].filter((b) => b.cents !== 0);
    const positief = binnen.reduce((s, b) => s + Math.max(b.cents, 0), 0);

    return (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'stretch' }}>
            <div style={{ flex: '1 1 260px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={KOPJE}>Zo kwam het binnen</div>
                {positief > 0 && (
                    <div role="img" aria-label={binnen.map((b) => `${b.naam} ${Math.round((Math.max(b.cents, 0) / positief) * 100)} procent`).join(', ')}
                        style={{ display: 'flex', height: 12, borderRadius: 999, overflow: 'hidden', gap: 2 }}>
                        {binnen.map((b) => <div key={b.naam} style={{ width: `${(Math.max(b.cents, 0) / positief) * 100}%`, background: b.kleur }} />)}
                    </div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {binnen.map((b) => (
                        <div key={b.naam} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 3, background: b.kleur, flexShrink: 0 }} />
                            <span style={{ flex: 1 }}>{b.naam}</span>
                            <span style={BEDRAG}>{euro(b.cents)}</span>
                        </div>
                    ))}
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, borderTop: '1px solid var(--border)', paddingTop: 10, marginTop: 'auto' }}>
                    <span style={{ flex: 1, fontWeight: 600 }}>Ontvangen</span>
                    <span style={{ ...BEDRAG, fontSize: 18, fontWeight: 600 }}>{euro(dag.binnen.totaal)}</span>
                </div>
            </div>

            <div aria-hidden="true" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 40px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 40, height: 40, borderRadius: 999, background: 'var(--brand-tint)', color: 'var(--brand-hover)' }}>
                    <ArrowRight size={18} />
                </div>
            </div>

            <div style={{ flex: '2.2 1 420px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={KOPJE}>Zo is het geboekt</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
                    {dag.hokjes.map((h) => (
                        <div key={h.sleutel} style={{ padding: 12, background: 'var(--bg-subtle)', border: '1px solid var(--border)', borderRadius: 10 }}>
                            <div style={{ fontSize: 12, fontWeight: 600 }}>{h.label}</div>
                            <div style={{ ...BEDRAG, fontSize: 16, fontWeight: 600, marginTop: 4 }}>{euro(h.cents)}</div>
                            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{h.uitleg}</div>
                        </div>
                    ))}
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', borderTop: '1px solid var(--border)', paddingTop: 10, marginTop: 'auto' }}>
                    <span style={{ fontWeight: 600 }}>Geboekt</span>
                    {dag.sluit ? (
                        <span style={{ flex: 1, fontSize: 12, color: 'var(--status-success-text)' }}>Gelijk aan wat er binnenkwam</span>
                    ) : (
                        <span style={{ flex: 1, fontSize: 12, color: 'var(--status-warning-text)' }}>{euro(Math.abs(dag.totaal_hokjes - dag.binnen.totaal))} verschil met wat er binnenkwam</span>
                    )}
                    <span style={{ ...BEDRAG, fontSize: 18, fontWeight: 600 }}>{euro(dag.totaal_hokjes)}</span>
                </div>
            </div>
        </div>
    );
}
