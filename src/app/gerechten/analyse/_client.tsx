/* ═══════════════════════════════════════════════════════════════
   /gerechten/analyse — Client Component
   Tab-toggle Performance (BCG) ↔ Health (insights-grid).
   URL ?view=performance|health sync'd via router.replace.
   ═══════════════════════════════════════════════════════════════ */

'use client';

import { useCallback } from 'react';
import { HeartPulse, Target } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import type { Gerecht } from '@/types';
import { BcgMatrix } from '@/components/menu/analyse/BcgMatrix';
import { HealthView } from '@/components/menu/analyse/HealthView';
import { MREyebrow } from '@/components/menu/atoms';

import HubHeader from '@/components/chassis/HubHeader';
type View = 'performance' | 'health';

interface Props {
    initialView: View;
    gerechten: Gerecht[];
    componentCount: number;
    /** Componenten die nog op 100% opbrengst staan — zie de gezondheidsweergave. */
    componentenZonderVerlies?: number;
    /** Echte populariteit per gerecht-id, geteld uit events en offertes. */
    populariteit?: Record<string, number>;
}

export default function AnalyseClient({ initialView, gerechten, componentCount, componentenZonderVerlies, populariteit }: Props) {
    const router = useRouter();
    const pathname = usePathname();
    /* Server doet de eerste split, hier alleen UI-state. We schrijven URL
       zodat back/forward + shareable links blijven werken (geen client-state
       als source of truth). */
    const view = initialView;

    const setView = useCallback((next: View) => {
        const qs = next === 'performance' ? '?view=performance' : '?view=health';
        router.replace(`${pathname}${qs}`, { scroll: false });
    }, [router, pathname]);

    return (
        <div className="mr-content" style={{ padding: '24px 32px 80px', maxWidth: 1500, width: '100%', margin: '0 auto' }}>
            <HubHeader titel="Analyse" onderschrift="Hoe presteert je menu — populariteit, marge en data-kwaliteit op één plek." />

            {/* Sub-tabs */}
            <div className="mr-analyse-tabs" role="tablist" aria-label="Analyse weergave">
                <button
                    role="tab"
                    aria-selected={view === 'performance'}
                    className={`mr-analyse-tab ${view === 'performance' ? 'active' : ''}`}
                    onClick={() => setView('performance')}
                >
                    <Target size={14} /> Performance
                </button>
                <button
                    role="tab"
                    aria-selected={view === 'health'}
                    className={`mr-analyse-tab ${view === 'health' ? 'active' : ''}`}
                    onClick={() => setView('health')}
                >
                    <HeartPulse size={14} /> Health
                </button>
            </div>

            <div style={{ marginTop: 20 }}>
                {view === 'performance' ? (
                    <div>
                        <MREyebrow style={{ marginBottom: 16 }}>BCG Matrix — Populariteit vs. Marge</MREyebrow>
                        <BcgMatrix gerechten={gerechten} popularity={populariteit} />
                    </div>
                ) : (
                    <HealthView gerechten={gerechten} componentCount={componentCount} componentenZonderVerlies={componentenZonderVerlies} />
                )}
            </div>
        </div>
    );
}
