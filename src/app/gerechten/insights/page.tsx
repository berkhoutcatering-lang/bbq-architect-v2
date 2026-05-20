import Link from 'next/link';
import { ArrowRight, Sparkles, Recycle, TrendingUp, ShieldCheck, Boxes } from 'lucide-react';
import { createServerSupabase } from '@/lib/supabase-server';
import PageHeader from '@/components/PageHeader';
import MargeBar from '@/components/chips/MargeBar';
import ReuseCounterChip from '@/components/chips/ReuseCounterChip';
import AllergenSourceChainPopover from '@/components/chips/AllergenSourceChainPopover';

export const metadata = {
    title: 'Insights — Menu',
    description: 'Cross-tab metrics: marge-distributie, reuse-density, AI-status',
};

interface Insights {
    pendingComponentsCount: number;
    totalComponents: number;
    totalGerechten: number;
    aiSuggestedComponents: number;
    topReuseComponents: Array<{ id: number; name: string; type: string; usageCount: number }>;
    marginBuckets: Array<{ label: string; min: number; max: number; count: number; color: string }>;
    margeAverage: number | null;
    margeMedian: number | null;
}

async function loadInsights(): Promise<Insights | { error: string }> {
    try {
        const sb = await createServerSupabase();
        const { data: { user } } = await sb.auth.getUser();
        if (!user) return { error: 'Niet ingelogd' };

        const { data: mem } = await sb
            .from('organization_members')
            .select('organization_id')
            .eq('user_id', user.id)
            .eq('status', 'active')
            .limit(1)
            .maybeSingle();
        if (!mem) return { error: 'Geen actieve organisatie' };
        const orgId = mem.organization_id as string;

        const [
            pendingRes,
            componentsRes,
            gerechtenRes,
            aiSuggestedRes,
            gerechtComponentsRes,
            componentsListRes,
        ] = await Promise.all([
            sb.from('component_allergens').select('component_id')
                .eq('organization_id', orgId).eq('ai_suggested', true).is('confirmed_at', null),
            sb.from('components').select('id', { count: 'exact', head: true }).eq('organization_id', orgId),
            sb.from('gerechten').select('id, total_cost_cents, verkoopprijs', { count: 'exact' })
                .eq('organization_id', orgId).neq('status', 'inactief'),
            sb.from('components').select('id', { count: 'exact', head: true })
                .eq('organization_id', orgId).eq('ai_suggested', true),
            sb.from('gerecht_components').select('component_id')
                .eq('organization_id', orgId),
            sb.from('components').select('id, name, type').eq('organization_id', orgId),
        ]);

        // Distinct pending components
        const pendingComponentsCount = new Set((pendingRes.data ?? []).map((r) => r.component_id)).size;

        // Top-5 reuse: aggregate gerecht_components op component_id
        const reuseMap = new Map<number, number>();
        for (const row of gerechtComponentsRes.data ?? []) {
            const id = row.component_id as number;
            reuseMap.set(id, (reuseMap.get(id) ?? 0) + 1);
        }
        const componentLookup = new Map<number, { name: string; type: string }>(
            (componentsListRes.data ?? []).map((c) => [c.id, { name: c.name as string, type: c.type as string }]),
        );
        const topReuseComponents = Array.from(reuseMap.entries())
            .map(([id, count]) => {
                const lookup = componentLookup.get(id);
                return {
                    id,
                    name: lookup?.name ?? `Component #${id}`,
                    type: lookup?.type ?? 'unknown',
                    usageCount: count,
                };
            })
            .sort((a, b) => b.usageCount - a.usageCount)
            .slice(0, 5);

        // Marge-distributie: bucket gerechten op marge-ratio
        const buckets = [
            { label: '0-30%',  min: 0,    max: 0.30, count: 0, color: '#ef4444' },
            { label: '30-50%', min: 0.30, max: 0.50, count: 0, color: '#f59e0b' },
            { label: '50-70%', min: 0.50, max: 0.70, count: 0, color: '#84cc16' },
            { label: '70%+',   min: 0.70, max: 1.00, count: 0, color: '#00d4a1' },
        ];
        const margins: number[] = [];
        for (const g of gerechtenRes.data ?? []) {
            const cost = (g.total_cost_cents ?? 0) / 100;
            const price = Number(g.verkoopprijs ?? 0);
            if (price <= 0 || price <= cost) continue;
            const m = (price - cost) / price;
            margins.push(m);
            for (const b of buckets) {
                if (m >= b.min && m < b.max) { b.count++; break; }
                if (b.max === 1.0 && m >= 1.0) { b.count++; break; }
            }
        }
        const margeAverage = margins.length === 0
            ? null
            : margins.reduce((s, x) => s + x, 0) / margins.length;
        const margeMedian = margins.length === 0
            ? null
            : (() => {
                const sorted = [...margins].sort((a, b) => a - b);
                const mid = Math.floor(sorted.length / 2);
                return sorted.length % 2 === 0
                    ? (sorted[mid - 1] + sorted[mid]) / 2
                    : sorted[mid];
            })();

        return {
            pendingComponentsCount,
            totalComponents: componentsRes.count ?? 0,
            totalGerechten: gerechtenRes.count ?? 0,
            aiSuggestedComponents: aiSuggestedRes.count ?? 0,
            topReuseComponents,
            marginBuckets: buckets,
            margeAverage,
            margeMedian,
        };
    } catch (e) {
        return { error: e instanceof Error ? e.message : 'Onbekende fout' };
    }
}

export default async function InsightsPage() {
    const result = await loadInsights();

    if ('error' in result) {
        return (
            <div style={{ padding: 'var(--space-6) 0' }}>
                <PageHeader
                    title="Insights"
                    description="Cross-tab metrics over je gerechten + componenten + marges."
                />
                <div className="card" style={{ padding: 'var(--space-5)', marginTop: 'var(--space-4)', borderLeft: '3px solid #ef4444' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#ef4444', marginBottom: 6 }}>
                        Kon insights niet laden
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>{result.error}</div>
                </div>
            </div>
        );
    }

    const maxBucketCount = Math.max(1, ...result.marginBuckets.map((b) => b.count));
    const totalGerechtenWithMarge = result.marginBuckets.reduce((s, b) => s + b.count, 0);

    return (
        <div style={{ padding: 'var(--space-6) 0' }}>
            <PageHeader
                title="Insights"
                description="Eén view: marge-gezondheid, component-reuse, allergen-status. Voor power-users en pre-launch checks."
            />

            {/* KPI-tile row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 'var(--space-3, 12px)', marginTop: 'var(--space-4)' }}>
                <KpiTile
                    label="Gerechten"
                    value={result.totalGerechten.toString()}
                    icon={<Boxes size={14} />}
                />
                <KpiTile
                    label="Componenten"
                    value={result.totalComponents.toString()}
                    icon={<Recycle size={14} />}
                    sub={result.aiSuggestedComponents > 0 ? `${result.aiSuggestedComponents} via AI` : undefined}
                />
                <KpiTile
                    label="Gem. marge"
                    value={result.margeAverage !== null ? `${Math.round(result.margeAverage * 100)}%` : '—'}
                    icon={<TrendingUp size={14} />}
                    sub={result.margeMedian !== null ? `Mediaan ${Math.round(result.margeMedian * 100)}%` : undefined}
                    accentColor={result.margeAverage !== null && result.margeAverage > 0.5 ? '#00d4a1' : '#f59e0b'}
                />
                <KpiTile
                    label="Allergen-queue"
                    value={result.pendingComponentsCount.toString()}
                    icon={<ShieldCheck size={14} />}
                    sub={result.pendingComponentsCount === 0 ? 'alles bevestigd' : 'wachten op bevestiging'}
                    accentColor={result.pendingComponentsCount === 0 ? '#00d4a1' : '#f59e0b'}
                    ctaHref={result.pendingComponentsCount > 0 ? '/gerechten/allergen-queue' : undefined}
                />
            </div>

            {/* Top-5 component reuse */}
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
                {result.topReuseComponents.length === 0 ? (
                    <div style={{ fontSize: 12, color: 'var(--muted-light)' }}>
                        Nog geen koppelingen tussen gerechten en componenten — koppel er een paar om reuse-density te zien.
                    </div>
                ) : (
                    <ul style={{ display: 'grid', gap: 8, listStyle: 'none', padding: 0, margin: 0 }}>
                        {result.topReuseComponents.map((c, idx) => (
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
                        {result.marginBuckets.map((b) => {
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

                {result.margeAverage !== null && (
                    <div style={{ marginTop: 'var(--space-4)', paddingTop: 'var(--space-3, 12px)', borderTop: '1px solid var(--border)' }}>
                        <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6 }}>Gemiddelde brutomarge</div>
                        <MargeBar margin={result.margeAverage} />
                    </div>
                )}
            </div>

            {/* AI-status sectie */}
            <div className="card" style={{ padding: 'var(--space-5)', marginTop: 'var(--space-4)' }}>
                <h2 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 var(--space-3, 12px)' }}>
                    <Sparkles size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} aria-hidden />
                    AI-status
                </h2>
                <div style={{ display: 'grid', gap: 6, fontSize: 13, color: 'var(--muted-light)' }}>
                    <Row label="Componenten via AI gesuggereerd" value={result.aiSuggestedComponents} accent={result.aiSuggestedComponents > 0 ? '#a5a5f0' : 'var(--muted)'} />
                    <Row label="Componenten met onbevestigde allergens" value={result.pendingComponentsCount} accent={result.pendingComponentsCount > 0 ? '#f59e0b' : '#00d4a1'} />
                </div>
                {result.pendingComponentsCount > 0 && (
                    <Link
                        href="/gerechten/allergen-queue"
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            marginTop: 'var(--space-3, 12px)',
                            padding: '8px 14px',
                            borderRadius: 8,
                            background: 'rgba(0,212,161,.10)',
                            border: '1px solid rgba(0,212,161,.30)',
                            color: '#00d4a1',
                            fontSize: 12,
                            fontWeight: 600,
                            textDecoration: 'none',
                            minHeight: 36,
                        }}
                    >
                        Open allergen-queue <ArrowRight size={12} />
                    </Link>
                )}
            </div>

            {/* Pillar #2 demo: hoe de evidence-chain er uitziet bij hover op een allergen-chip */}
            <div className="card" style={{ padding: 'var(--space-5)', marginTop: 'var(--space-4)' }}>
                <h2 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 6px' }}>
                    <ShieldCheck size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} aria-hidden />
                    Allergeen-evidence-chain
                </h2>
                <p style={{ fontSize: 12, color: 'var(--muted-light)', margin: '0 0 var(--space-3, 12px)', maxWidth: 640 }}>
                    Elk allergeen in een gerecht is herleidbaar tot een ingrediënt via een component.
                    Hover op een chip om de keten te zien — EU 1169/2011 audit-evidence.
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-start' }}>
                    <AllergenSourceChainPopover
                        allergenCode="G"
                        allergenLabel="Gluten"
                        sourceChain={[
                            { inventory_id: null, fallback_name: 'Brioche bun', component_id: 12, confirmed: true,  ai_suggested: false },
                            { inventory_id: null, fallback_name: 'Tarwebloem',  component_id: 8,  confirmed: true,  ai_suggested: false },
                        ]}
                    />
                    <AllergenSourceChainPopover
                        allergenCode="M"
                        allergenLabel="Mosterd"
                        sourceChain={[
                            { inventory_id: null, fallback_name: 'Honing-mosterd glaze', component_id: 14, confirmed: false, ai_suggested: true },
                        ]}
                    />
                    <AllergenSourceChainPopover
                        allergenCode="L"
                        allergenLabel="Lactose"
                        sourceChain={[
                            { inventory_id: null, fallback_name: 'Boter',     component_id: 9,  confirmed: true,  ai_suggested: false },
                            { inventory_id: null, fallback_name: 'Mozzarella', component_id: 21, confirmed: false, ai_suggested: true },
                        ]}
                    />
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 12, fontStyle: 'italic' }}>
                    Bovenstaande chips zijn een demo; zodra je gerechten een gevulde <code>gerecht_allergens_mv</code> hebben,
                    rendert dezelfde popover met je echte source_chain JSONB.
                </div>
            </div>
        </div>
    );
}

/* ── Sub-components (server-only) ──────────────────────────────── */

function KpiTile({
    label, value, icon, sub, accentColor, ctaHref,
}: {
    label: string;
    value: string;
    icon: React.ReactNode;
    sub?: string;
    accentColor?: string;
    ctaHref?: string;
}) {
    const content = (
        <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, color: 'var(--muted)' }}>
                {icon}
                <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.04em' }}>{label}</span>
            </div>
            <div style={{ fontSize: 24, fontWeight: 700, color: accentColor ?? 'var(--text)', fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>
                {value}
            </div>
            {sub && (
                <div style={{ fontSize: 11, color: 'var(--muted-light)', marginTop: 4 }}>
                    {sub}
                </div>
            )}
        </>
    );

    const baseStyle: React.CSSProperties = {
        padding: 'var(--space-4)',
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        display: 'block',
        color: 'inherit',
        textDecoration: 'none',
    };

    return ctaHref ? (
        <Link href={ctaHref} style={baseStyle}>
            {content}
        </Link>
    ) : (
        <div style={baseStyle}>{content}</div>
    );
}

function Row({ label, value, accent }: { label: string; value: number; accent: string }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0' }}>
            <span>{label}</span>
            <span style={{ fontWeight: 700, color: accent, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
        </div>
    );
}
