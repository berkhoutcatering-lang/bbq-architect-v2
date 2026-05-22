import Link from 'next/link';
import { BarChart3, HeartPulse } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import MargesView from './_components/MargesView';
import HealthView from './_components/HealthView';
import { loadInsightsData } from './_lib/health/data';

export const metadata = {
    title: 'Menu-analyse — Menu',
    description: 'Marges, kwadranten en menu-health — alles om je menu beter te maken.',
};

export const dynamic = 'force-dynamic';

type TabKey = 'marges' | 'health';

const TABS: { key: TabKey; label: string; eyebrow: string; icon: typeof BarChart3 }[] = [
    { key: 'marges', label: 'Marges & kwadranten', eyebrow: 'BCG · winst · runners', icon: BarChart3 },
    { key: 'health', label: 'Menu-health', eyebrow: 'Library · launch-check', icon: HeartPulse },
];

interface Props {
    searchParams: Promise<{ tab?: string }>;
}

export default async function MenuAnalysePage({ searchParams }: Props) {
    const params = await searchParams;
    const tab: TabKey = params.tab === 'health' ? 'health' : 'marges';

    const healthBlob = tab === 'health' ? await loadInsightsData() : null;

    return (
        <div style={{ padding: 'var(--space-6) 0' }}>
            <PageHeader
                title="Menu-analyse"
                description="Marge × populariteit per gerecht, plus de gezondheids­check van je hele menu. Runners en bleeders in één oogopslag."
            />

            <nav
                aria-label="Menu-analyse weergaven"
                style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, 1fr)',
                    gap: 12,
                    marginTop: 'var(--space-4)',
                    marginBottom: 'var(--space-4)',
                }}
                className="menu-analyse-tabs"
            >
                {TABS.map(function (t) {
                    const active = t.key === tab;
                    const Icon = t.icon;
                    return (
                        <Link
                            key={t.key}
                            href={t.key === 'marges' ? '/gerechten/menu-analyse' : '/gerechten/menu-analyse?tab=' + t.key}
                            aria-current={active ? 'page' : undefined}
                            style={{
                                position: 'relative',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 14,
                                padding: '14px 18px',
                                borderRadius: 14,
                                background: active ? 'linear-gradient(135deg, rgba(34,197,94,.10), var(--card) 70%)' : 'var(--card)',
                                border: '1px solid ' + (active ? 'rgba(34,197,94,.32)' : 'var(--border)'),
                                textDecoration: 'none',
                                color: 'var(--text)',
                                transition: 'transform .15s, border-color .15s',
                            }}
                        >
                            <div
                                style={{
                                    width: 34,
                                    height: 34,
                                    borderRadius: 10,
                                    background: active ? 'linear-gradient(135deg, #22c55e, #14532d)' : 'rgba(255,255,255,.04)',
                                    border: active ? 'none' : '1px solid var(--border)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    flexShrink: 0,
                                }}
                            >
                                <Icon size={16} color={active ? '#0a0a0c' : '#22c55e'} />
                            </div>
                            <div style={{ minWidth: 0 }}>
                                <div
                                    style={{
                                        fontSize: 9,
                                        letterSpacing: '.22em',
                                        textTransform: 'uppercase',
                                        color: 'var(--muted)',
                                        fontWeight: 700,
                                        marginBottom: 2,
                                    }}
                                >
                                    {t.eyebrow}
                                </div>
                                <div style={{ fontSize: 15, fontWeight: 500 }}>{t.label}</div>
                            </div>
                        </Link>
                    );
                })}
            </nav>

            {tab === 'marges' && <MargesView />}
            {tab === 'health' && healthBlob && (
                <HealthView data={healthBlob.data} error={healthBlob.error} />
            )}
        </div>
    );
}
