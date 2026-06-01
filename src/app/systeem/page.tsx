/**
 * /systeem — control-room hub.
 *
 * Server Component: haalt system-health data op (AI-spend, gebruikers,
 * gerechten) en rendert SystemHealthStrip + hub-cards. SysteemTabs en
 * PageGuideNote zijn client components binnen deze server shell.
 */

import { createServerSupabase } from '@/lib/supabase-server';
import PageHeader from '@/components/PageHeader';
import SysteemTabs from '@/components/SysteemTabs';
import SystemHealthStrip, { type SystemHealthData } from './_components/SystemHealthStrip';
import SysteemHubCards from './_components/SysteemHubCards';
import SysteemGuide from './_components/SysteemGuide';

export const dynamic = 'force-dynamic';

async function loadHealth(): Promise<SystemHealthData> {
    const sb = await createServerSupabase();
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    const monthStartIso = monthStart.toISOString();

    /* Drie queries parallel. Bij failure: 0-fallback zodat de page nooit breekt
       op een healt-strip die zelf out-of-band is. RLS filtert al per org. */
    const [aiRes, usersRes, dishesRes] = await Promise.all([
        sb.from('ai_usage')
            .select('cost_eur_cents', { count: 'exact' })
            .gte('created_at', monthStartIso),
        sb.from('organization_members')
            .select('user_id', { count: 'exact', head: true })
            .eq('status', 'active'),
        sb.from('gerechten')
            .select('id', { count: 'exact', head: true })
            .eq('is_in_wizard', true),
    ]);

    const aiSpendCents = (aiRes.data ?? []).reduce(
        (sum: number, row: { cost_eur_cents?: number | null }) => sum + (row.cost_eur_cents ?? 0),
        0,
    );

    return {
        aiSpendCentsThisMonth: aiSpendCents,
        aiCallsThisMonth: aiRes.count ?? 0,
        activeUsers: usersRes.count ?? 0,
        activeDishes: dishesRes.count ?? 0,
    };
}

export default async function SysteemHub() {
    const health = await loadHealth();

    return (
        <div className="main-content">
            <SysteemTabs />
            <PageHeader
                title="Systeem"
                description="Instellingen, gebruikers, mailbox, website en hulp — het bouwbord van de app."
            />

            <SysteemGuide />

            <SystemHealthStrip data={health} />

            <SysteemHubCards />
        </div>
    );
}
