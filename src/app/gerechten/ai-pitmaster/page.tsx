import PageHeader from '@/components/PageHeader';
import { createServerSupabase } from '@/lib/supabase-server';
import AiPitmasterClient from './_client';

export const metadata = {
    title: 'AI Pitmaster — Menu',
    description: 'AI-coach Rook Maart: directives, kerntemp-alerts, allergie-cross-refs en menu-vragen.',
};

export const dynamic = 'force-dynamic';

/* P0.17 — AI Pitmaster is geen "Binnenkort"-stub meer. Server Component
   haalt de komende events op (7-daagse horizon) en geeft die als context
   aan de Client-body. Daar kan de pitmaster:
    - kiezen welk event hij wil bekijken
    - prefilled prompts klikken die de Vraag-Rook drawer openen
    - Vraag-Rook drawer pikt page-context op (`usePathname`) zodat de chat
      al weet dat we in AI-Pitmaster context zitten.

   De zware chat-streaming gebeurt in `<ChatPanel>` (al gemount in AppShell).
   Deze page voegt event-context + AI-prompts toe, niet een tweede chat. */
export default async function AiPitmasterPage() {
    const supabase = await createServerSupabase();
    const today = new Date().toISOString().slice(0, 10);
    const horizon = new Date();
    horizon.setDate(horizon.getDate() + 7);
    const horizonIso = horizon.toISOString().slice(0, 10);

    const { data: upcoming } = await supabase
        .from('events')
        .select('id, name, date, aantal_gasten, type, location, status')
        .gte('date', today)
        .lte('date', horizonIso)
        .order('date', { ascending: true })
        .limit(5);

    return (
        <div style={{ padding: 'var(--space-6) 0' }}>
            <PageHeader
                title="AI Pitmaster"
                description="Live coach in de keuken — vragen over allergieën, kerntemperaturen, voorbereiding en menu-keuzes."
            />
            <AiPitmasterClient upcomingEvents={upcoming ?? []} />
        </div>
    );
}
