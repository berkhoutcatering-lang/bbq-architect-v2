/* Types voor de Insights-page — gedeeld tussen server-data-loader en
   client-componenten. Shape volgt het design-handoff (insights-data.js). */

export interface LibraryStat {
    total: number;
    prev30d: number;
    label: string;
    icon: string;
    href: string;
}

export interface MarginOutlier {
    id: string;
    name: string;
    margin: number;
}

export interface MarginStats {
    median: number;
    p10: number;
    p90: number;
    min: number;
    max: number;
    count: number;
    outliers_low: MarginOutlier[];
    outliers_high: MarginOutlier[];
}

export interface MarginBucket {
    label: string;
    count: number;
    color: string;
}

export interface ReuseComponent {
    id: number | string;
    name: string;
    usageCount: number;
}

export interface AllergenStats {
    totalGerechten: number;
    auditProof: number;
    partial: number;
    missing: number;
    queueSize: number;
}

export interface AiCoverageRow {
    total: number;
    aiSuggested: number;
    confirmed: number;
}

export interface AiCoverage {
    componenten: AiCoverageRow;
    allergenen: AiCoverageRow;
    gerechten: AiCoverageRow;
}

export interface LaunchChecklistItem {
    label: string;
    count: number;
    items: string[];
    href: string;
    icon: string;
    severity: 'ok' | 'info' | 'warn' | 'danger';
}

export interface AiCostFeature {
    feature: string;
    calls: number;
    costCents: number;
    avgCents: number;
}

export interface AiCosts {
    month: string;
    totalCents: number;
    features: AiCostFeature[];
    softCap: number;
    hardCap: number;
    tier: string;
}

export interface InsightsData {
    library: {
        gerechten: LibraryStat;
        componenten: LibraryStat;
        ingredienten: LibraryStat;
    };
    sparklines: {
        gerechten: number[];
        componenten: number[];
        ingredienten: number[];
    };
    marginStats: MarginStats;
    marginBuckets: MarginBucket[];
    topComponents: ReuseComponent[];
    bottomComponents: ReuseComponent[];
    allergenStats: AllergenStats;
    aiCoverage: AiCoverage;
    launchChecklist: LaunchChecklistItem[];
    aiCosts: AiCosts;
}
