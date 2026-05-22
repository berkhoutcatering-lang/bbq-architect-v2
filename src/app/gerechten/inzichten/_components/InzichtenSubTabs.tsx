'use client';

import { BarChart3, TrendingUp, ShieldCheck, Sparkles } from 'lucide-react';
import SubTabs from '@/components/SubTabs';

/**
 * Client-wrapper voor de 4 sub-tabs. Bestaat omdat Lucide-icons function-components zijn
 * en niet via RSC van Server- naar Client-Component geserialised kunnen worden.
 * De page.tsx (server) geeft alleen primitives door — count + activeTab kunnen prima.
 */
export default function InzichtenSubTabs({ pendingTotal }: { pendingTotal: number }) {
    return (
        <SubTabs
            paramName="tab"
            defaultValue="overzicht"
            ariaLabel="Inzichten sub-tabs"
            tabs={[
                { value: 'overzicht', label: 'Overzicht', icon: BarChart3 },
                { value: 'marge', label: 'Marge', icon: TrendingUp },
                { value: 'allergenen', label: 'Allergenen', icon: ShieldCheck, badge: pendingTotal },
                { value: 'ai-status', label: 'AI-status', icon: Sparkles },
            ]}
        />
    );
}
