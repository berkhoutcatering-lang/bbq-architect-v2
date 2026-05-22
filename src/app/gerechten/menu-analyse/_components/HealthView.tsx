import InsightKpiTile from './health/InsightKpiTile';
import MargeBoxPlot from './health/MargeBoxPlot';
import MargeDistribution from './health/MargeDistribution';
import ReuseList from './health/ReuseList';
import AllergenDonut from './health/AllergenDonut';
import AiCoverageBars from './health/AiCoverageBars';
import LaunchChecklist from './health/LaunchChecklist';
import AiCostTable from './health/AiCostTable';
import type { InsightsData } from '../_lib/health/types';

interface Props {
    data: InsightsData;
    error?: string | null;
}

export default function HealthView({ data, error }: Props) {
    return (
        <div style={{ marginTop: 'var(--space-4)' }}>
            {error && (
                <div role="alert" style={{
                    padding: '10px 14px', marginBottom: 16, borderRadius: 10,
                    background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.3)',
                    color: '#ef4444', fontSize: 12,
                }}>{error}</div>
            )}

            {/* 1. Bibliotheek-grootte — 3 KPI tiles */}
            <section style={{ marginBottom: 24 }}>
                <div className="insights-kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
                    <InsightKpiTile stat={data.library.gerechten} sparkData={data.sparklines.gerechten} />
                    <InsightKpiTile stat={data.library.componenten} sparkData={data.sparklines.componenten} />
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
        </div>
    );
}
