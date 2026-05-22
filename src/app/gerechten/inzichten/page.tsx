import PageHeader from '@/components/PageHeader';
import { loadInsights } from './_lib/loadInsights';
import InzichtenSubTabs from './_components/InzichtenSubTabs';
import OverzichtTab from './_components/OverzichtTab';
import MargeTab from './_components/MargeTab';
import AllergenenTab from './_components/AllergenenTab';
import AiStatusTab from './_components/AiStatusTab';

export const metadata = {
    title: 'Inzichten — Menu',
    description: 'Overzicht, marge, allergenen-queue en AI-status — alles wat je menu vertelt',
};

type Tab = 'overzicht' | 'marge' | 'allergenen' | 'ai-status';
const VALID_TABS: Tab[] = ['overzicht', 'marge', 'allergenen', 'ai-status'];

function resolveTab(raw: string | string[] | undefined): Tab {
    const single = Array.isArray(raw) ? raw[0] : raw;
    return VALID_TABS.includes(single as Tab) ? (single as Tab) : 'overzicht';
}

interface PageProps {
    /* Next.js 15+: searchParams is een Promise dat awaited moet worden vóór gebruik. */
    searchParams: Promise<{ tab?: string | string[] }>;
}

export default async function InzichtenPage({ searchParams }: PageProps) {
    const sp = await searchParams;
    const tab = resolveTab(sp.tab);
    const data = await loadInsights();

    if ('error' in data) {
        return (
            <div style={{ padding: 'var(--space-6) 0' }}>
                <PageHeader
                    title="Inzichten"
                    description="Cross-tab metrics over je gerechten + componenten + marges."
                />
                <div className="card" style={{ padding: 'var(--space-5)', marginTop: 'var(--space-4)', borderLeft: '3px solid #ef4444' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#ef4444', marginBottom: 6 }}>
                        Kon inzichten niet laden
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>{data.error}</div>
                </div>
            </div>
        );
    }

    const pendingTotal = data.pendingComponentsCount + data.ingredientAiSuggestionsPending;

    return (
        <div style={{ padding: 'var(--space-6) 0' }}>
            <PageHeader
                title="Inzichten"
                description="Eén view: overzicht, marge-gezondheid, allergen-status en AI-verrijking. Voor power-users en pre-launch checks."
            />

            {/* Sub-tab strip — query-param driven; wrapper omdat Lucide icons function-components zijn */}
            <InzichtenSubTabs pendingTotal={pendingTotal} />

            {tab === 'overzicht' && <OverzichtTab data={data} />}
            {tab === 'marge' && <MargeTab />}
            {tab === 'allergenen' && <AllergenenTab data={data} />}
            {tab === 'ai-status' && <AiStatusTab data={data} />}
        </div>
    );
}
