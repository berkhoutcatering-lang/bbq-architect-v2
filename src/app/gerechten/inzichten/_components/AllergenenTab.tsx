import { ShieldCheck } from 'lucide-react';
import { loadAllergenQueue } from '../_lib/loadInsights';
import type { InsightsData } from '../_lib/loadInsights';
import AllergenQueueListV2 from './AllergenQueueListV2';

/**
 * Allergenen-tab — bevestiging van AI-suggested allergens voor EU 1169/2011 compliance.
 * Bevat: roll-up KPI strip (Confirmed/Pending/Geen) + multi-select bulk-confirm tabel.
 *
 * In Sprint 3 A8 vervangen we de losse /gerechten/allergen-queue page met deze tab —
 * de redirect bewaart bestaande bookmarks. Pillar #2 (allergen-audit-evidence) blijft
 * gewaarborgd via gerecht_allergens_mv (server-side, geen AI-text-generatie).
 */
export default async function AllergenenTab({ data }: { data: InsightsData }) {
    const queue = await loadAllergenQueue();

    return (
        <>
            {/* Roll-up strip */}
            <div className="card" style={{ padding: 'var(--space-4)', marginTop: 'var(--space-4)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                    <ShieldCheck size={16} aria-hidden style={{ color: 'var(--brand-primary)' }} />
                    <h2 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>Allergen-status</h2>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
                    <DonutSegment
                        label="Bevestigd"
                        value={data.componentsWithConfirmedAllergens}
                        color="#00d4a1"
                        sub="audit-proof"
                    />
                    <DonutSegment
                        label="In queue"
                        value={data.pendingComponentsCount}
                        color="#f59e0b"
                        sub="AI-suggesties wachten op bevestiging"
                    />
                    <DonutSegment
                        label="Geen allergens"
                        value={data.componentsWithoutAllergens}
                        color="var(--muted)"
                        sub="nog niets toegevoegd"
                    />
                </div>
            </div>

            {/* Bulk-confirm tabel */}
            <div style={{ marginTop: 'var(--space-4)' }}>
                {queue.loadError ? (
                    <div className="card" style={{ padding: 'var(--space-5)', borderLeft: '3px solid #ef4444' }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#ef4444', marginBottom: 6 }}>
                            Queue niet geladen
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--muted)' }}>{queue.loadError}</div>
                    </div>
                ) : (
                    <AllergenQueueListV2 items={queue.items} />
                )}
            </div>
        </>
    );
}

function DonutSegment({ label, value, color, sub }: { label: string; value: number; color: string; sub: string }) {
    return (
        <div style={{
            padding: 12,
            borderRadius: 10,
            background: 'rgba(255,255,255,.02)',
            border: '1px solid var(--border)',
            borderLeft: `3px solid ${color}`,
            display: 'grid', gap: 2,
        }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', letterSpacing: '.05em', textTransform: 'uppercase' }}>
                {label}
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, color, fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>
                {value}
            </div>
            <div style={{ fontSize: 10, color: 'var(--muted-light)' }}>{sub}</div>
        </div>
    );
}
