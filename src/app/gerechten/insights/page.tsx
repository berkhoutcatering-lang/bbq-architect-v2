import { Suspense } from 'react';
import { RefreshCw } from 'lucide-react';
import { loadInsightsData } from './_lib/data';
import InsightKpiTile from './_components/InsightKpiTile';
import MargeBoxPlot from './_components/MargeBoxPlot';
import MargeDistribution from './_components/MargeDistribution';
import ReuseList from './_components/ReuseList';
import AllergenDonut from './_components/AllergenDonut';
import AiCoverageBars from './_components/AiCoverageBars';
import LaunchChecklist from './_components/LaunchChecklist';
import AiCostTable from './_components/AiCostTable';

export const metadata = {
    title: 'Insights — Menu',
    description: 'Diagnostisch dashboard — pre-launch check op bibliotheek, marges, allergenen en AI-werk',
};

export const dynamic = 'force-dynamic';

/* Insights — design-handoff implementation.
   Layout-volgorde uit insights-main.js:
     1. Bibliotheek-KPI's (3-up grid)
     2. Marge box-plot (1.3fr) + [Marge-distributie + AI-coverage] (1fr stacked)
     3. Component-reuse + Allergen-donut (1fr each)
     4. Pre-launch checklist (1.4fr) + AI-kosten (1fr)
   Mobile: alle 2/3-koloms grids stacken via .insights-grid CSS media-query. */
export default async function InsightsPage() {
    const { data, error } = await loadInsightsData();

    return (
        <div style={{ padding: '24px var(--space-mobile-edge) 32px', maxWidth: 1400, margin: '0 auto' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 16 }}>
                <div>
                    <div className="eyebrow" style={{ marginBottom: 6 }}>Diagnostisch dashboard — pre-launch check</div>
                    <h1 className="page-title">Insights</h1>
                    <div className="page-subtitle">Eén blik op je bibliotheek, marges, allergenen en AI-werk</div>
                </div>
                <RefreshLink />
            </div>

            {error && (
                <div role="alert" style={{
                    padding: '10px 14px', marginBottom: 16, borderRadius: 10,
                    background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.3)',
                    color: '#ef4444', fontSize: 12,
                }}>{error}</div>
            )}

            <Suspense fallback={null}>
                {/* 1. Bibliotheek-grootte — 3 KPI tiles */}
                <section style={{ marginBottom: 24 }}>
                    <div className="insights-kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
                        <InsightKpiTile stat={data.library.gerechten}    sparkData={data.sparklines.gerechten} />
                        <InsightKpiTile stat={data.library.componenten}  sparkData={data.sparklines.componenten} />
                        <InsightKpiTile stat={data.library.ingredienten} sparkData={data.sparklines.ingredienten} />
                    </div>
                </section>

                {/* 2+3. Marge box-plot + Distributie + AI-coverage rechts */}
                <section className="insights-row-1" style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 14, marginBottom: 24 }}>
                    <MargeBoxPlot stats={data.marginStats} />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        <MargeDistribution buckets={data.marginBuckets} />
                        <AiCoverageBars coverage={data.aiCoverage} />
                    </div>
                </section>

                {/* 4+5. Reuse + Allergen-donut */}
                <section className="insights-row-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 24 }}>
                    <ReuseList top={data.topComponents} bottom={data.bottomComponents} />
                    <AllergenDonut stats={data.allergenStats} />
                </section>

                {/* 6+7. Launch-checklist + AI-kosten */}
                <section className="insights-row-3" style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 14, marginBottom: 24 }}>
                    <LaunchChecklist items={data.launchChecklist} />
                    <AiCostTable costs={data.aiCosts} />
                </section>
            </Suspense>
        </div>
    );
}

/* Refresh-knop: gewoon een anchor naar de eigen URL met cache-busting param.
   Geen client-state nodig — server-component blijft pure. */
function RefreshLink() {
    return (
        <a
            href="?r="
            style={{
                padding: '7px 12px', borderRadius: 7,
                background: 'transparent', color: 'var(--muted)',
                border: '1px solid var(--border)', fontSize: 12, fontWeight: 500,
                cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
                textDecoration: 'none', minHeight: 32,
            }}
        >
            <RefreshCw size={14} /> Ververs
        </a>
    );
}
