import Link from 'next/link';
import { ArrowRight, Recycle, TrendingUp, ShieldCheck, Boxes, Package } from 'lucide-react';
import MargeBar from '@/components/chips/MargeBar';
import ReuseCounterChip from '@/components/chips/ReuseCounterChip';
import type { InsightsData } from '../_lib/loadInsights';
import { KpiTile } from './InsightsHelpers';

/**
 * Overzicht-tab — vat alle pillars in één oogopslag: ingredient/component/gerecht totalen,
 * gem. marge, queue-grootte. KPI tile row + Top-5 én Bottom-5 reuse + marge-histogram.
 * Bij PR #119 merge: dit content kan worden vervangen door hun 8 designer-componenten
 * (KpiTile met sparklines, MargeBoxPlot, ReuseList top+bottom, etc.).
 */
export default function OverzichtTab({ data }: { data: InsightsData }) {
    const maxBucketCount = Math.max(1, ...data.marginBuckets.map((b) => b.count));
    const totalGerechtenWithMarge = data.marginBuckets.reduce((s, b) => s + b.count, 0);
    const pendingTotal = data.pendingComponentsCount + data.ingredientAiSuggestionsPending;

    return (
        <>
            {/* Allergeen-cascade rolldown */}
            <div style={{ marginTop: 'var(--space-4)', padding: '14px 16px', background: 'rgba(255,255,255,.02)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 12, color: 'var(--muted-light)' }}>
                <strong style={{ color: 'var(--text)' }}>Allergenen-cascade</strong> — ingrediënt
                ({data.totalIngredients} in <Link href="/voorraad" style={{ color: 'var(--color-accent-gold)', textDecoration: 'none' }}>Voorraad</Link>) →
                component ({data.totalComponents}) → gerecht ({data.totalGerechten}). AI mag voorstellen, jij bevestigt.
            </div>

            {/* KPI-tile row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 'var(--space-3, 12px)', marginTop: 'var(--space-3, 12px)' }}>
                <KpiTile
                    label="Ingrediënten"
                    value={data.totalIngredients.toString()}
                    icon={<Package size={14} />}
                    sub={
                        data.ingredientsWithAllergen > 0
                            ? `${data.ingredientsWithAllergen} met allergeen`
                            : 'nog geen allergenen gekoppeld'
                    }
                    ctaHref="/voorraad"
                />
                <KpiTile
                    label="Componenten"
                    value={data.totalComponents.toString()}
                    icon={<Recycle size={14} />}
                    sub={data.aiSuggestedComponents > 0 ? `${data.aiSuggestedComponents} via AI` : undefined}
                />
                <KpiTile
                    label="Gerechten"
                    value={data.totalGerechten.toString()}
                    icon={<Boxes size={14} />}
                />
                <KpiTile
                    label="Gem. marge"
                    value={data.margeAverage !== null ? `${Math.round(data.margeAverage * 100)}%` : '—'}
                    icon={<TrendingUp size={14} />}
                    sub={data.margeMedian !== null ? `Mediaan ${Math.round(data.margeMedian * 100)}%` : undefined}
                    accentColor={data.margeAverage !== null && data.margeAverage > 0.5 ? '#00d4a1' : '#f59e0b'}
                />
                <KpiTile
                    label="Allergen-queue"
                    value={pendingTotal.toString()}
                    icon={<ShieldCheck size={14} />}
                    sub={
                        pendingTotal === 0
                            ? 'alles bevestigd'
                            : `${data.ingredientAiSuggestionsPending} ingr. + ${data.pendingComponentsCount} comp.`
                    }
                    accentColor={pendingTotal === 0 ? '#00d4a1' : '#f59e0b'}
                    ctaHref={pendingTotal > 0 ? '/gerechten/inzichten?tab=allergenen' : undefined}
                />
            </div>

            {/* Top-5 reuse */}
            <div className="card" style={{ padding: 'var(--space-5)', marginTop: 'var(--space-4)' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 'var(--space-3, 12px)' }}>
                    <h2 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>
                        <Recycle size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} aria-hidden />
                        Meest hergebruikte componenten
                    </h2>
                    <Link href="/gerechten/componenten" style={{ fontSize: 12, color: 'var(--muted)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        Alle componenten <ArrowRight size={11} />
                    </Link>
                </div>
                {data.topReuseComponents.length === 0 ? (
                    <div style={{ fontSize: 12, color: 'var(--muted-light)' }}>
                        Nog geen koppelingen tussen gerechten en componenten — koppel er een paar om reuse-density te zien.
                    </div>
                ) : (
                    <ul style={{ display: 'grid', gap: 8, listStyle: 'none', padding: 0, margin: 0 }}>
                        {data.topReuseComponents.map((c, idx) => (
                            <li key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 10px', background: 'rgba(255,255,255,.02)', borderRadius: 8 }}>
                                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums', minWidth: 18 }}>
                                    #{idx + 1}
                                </span>
                                <span style={{ flex: 1, fontSize: 13, color: 'var(--text)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {c.name}
                                </span>
                                <span style={{ fontSize: 11, color: 'var(--muted-light)' }}>
                                    {c.type === 'prepared' ? 'Zelf-bereid' : c.type === 'bought_in' ? 'Inkoop' : c.type}
                                </span>
                                <ReuseCounterChip count={c.usageCount} compact />
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            {/* Bottom-5 reuse (waarschuwingssignaal voor componenten die je nauwelijks gebruikt) */}
            {data.bottomReuseComponents.length > 0 && (
                <div className="card" style={{ padding: 'var(--space-5)', marginTop: 'var(--space-4)' }}>
                    <h2 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 var(--space-3, 12px)' }}>
                        Minst gebruikt
                    </h2>
                    <ul style={{ display: 'grid', gap: 8, listStyle: 'none', padding: 0, margin: 0 }}>
                        {data.bottomReuseComponents.map((c) => (
                            <li key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 10px', background: 'rgba(255,255,255,.02)', borderRadius: 8 }}>
                                <span style={{ flex: 1, fontSize: 13, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {c.name}
                                </span>
                                <span style={{ fontSize: 11, color: 'var(--muted-light)' }}>
                                    {c.type === 'prepared' ? 'Zelf-bereid' : c.type === 'bought_in' ? 'Inkoop' : c.type}
                                </span>
                                <ReuseCounterChip count={c.usageCount} compact />
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {/* Marge-distributie histogram */}
            <div className="card" style={{ padding: 'var(--space-5)', marginTop: 'var(--space-4)' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 'var(--space-3, 12px)' }}>
                    <h2 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>
                        <TrendingUp size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} aria-hidden />
                        Marge-distributie
                    </h2>
                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                        {totalGerechtenWithMarge} gerechten met prijs &gt; kostprijs
                    </span>
                </div>

                {totalGerechtenWithMarge === 0 ? (
                    <div style={{ fontSize: 12, color: 'var(--muted-light)' }}>
                        Nog geen gerechten met zowel kostprijs als verkoopprijs gevuld — voeg ze toe om de distributie te zien.
                    </div>
                ) : (
                    <div style={{ display: 'grid', gap: 8 }}>
                        {data.marginBuckets.map((b) => {
                            const widthPct = (b.count / maxBucketCount) * 100;
                            return (
                                <div key={b.label} style={{ display: 'grid', gridTemplateColumns: '70px 1fr 60px', alignItems: 'center', gap: 12 }}>
                                    <span style={{ fontSize: 12, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>
                                        {b.label}
                                    </span>
                                    <div style={{ height: 14, background: 'rgba(255,255,255,.03)', borderRadius: 4, overflow: 'hidden' }} aria-hidden>
                                        <div
                                            style={{
                                                width: `${widthPct}%`,
                                                height: '100%',
                                                background: b.color,
                                                borderRadius: 4,
                                                transition: 'width .3s ease-out',
                                            }}
                                        />
                                    </div>
                                    <span style={{ fontSize: 12, fontWeight: 700, color: b.color, fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>
                                        {b.count}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                )}

                {data.margeAverage !== null && (
                    <div style={{ marginTop: 'var(--space-4)', paddingTop: 'var(--space-3, 12px)', borderTop: '1px solid var(--border)' }}>
                        <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6 }}>Gemiddelde brutomarge</div>
                        <MargeBar margin={data.margeAverage} />
                    </div>
                )}
            </div>
        </>
    );
}
