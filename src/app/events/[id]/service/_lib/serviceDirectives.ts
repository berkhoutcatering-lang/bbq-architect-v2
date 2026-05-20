/* ═══════════════════════════════════════════════════════════════════
   Service-directives — real data ipv mock.

   Voorheen: hardcoded `SERVICE_AI_DIRECTIVES` array in
   `_data/serviceMockData.ts` met 3 verzonnen items. Nu: directives worden
   afgeleid uit het echte event:

     1. CRITICAL: per allergie-entry een directive ("Tafel X heeft Y")
     2. OPPORTUNITY: courses met `aiNote` → bron is /api/chef-coach
     3. INFO: timing-check (alle gangen op schema)

   Lege array als er geen relevante context is — geen mock-fillers meer.
   ═══════════════════════════════════════════════════════════════════ */

import type { ServiceEvent, ServiceAIDirective } from '../_types/service';
import { ALLERGENS } from '../_types/service';

export function buildServiceDirectives(event: ServiceEvent | null): ServiceAIDirective[] {
    if (!event) return [];

    const directives: ServiceAIDirective[] = [];

    /* CRITICAL — allergie-attentions per actieve gang.
       Per allergie-entry: vlag de eerstvolgende niet-geserveerde course
       met het allergeen-icoon zodat de keuken het in de service-flow ziet. */
    const activeOrQueued = event.courses.filter(c =>
        c.status === 'active' || c.status === 'queued' || c.status === 'ready'
    );
    if (activeOrQueued.length > 0 && event.allergyTable.length > 0) {
        for (const entry of event.allergyTable.slice(0, 3)) {
            const labels = entry.allergens.map(a => ALLERGENS[a]?.label ?? a).join(', ');
            directives.push({
                severity: 'critical',
                title: `Tafel ${entry.table}: ${entry.name}`,
                body: `${labels} — ${entry.note}`,
            });
        }
    }

    /* OPPORTUNITY — directives uit `aiNote` op courses.
       AI Chef Coach (api/chef-coach) schrijft notes naar courses bij
       voorbereiding; we tonen ze hier tijdens service. */
    for (const c of event.courses) {
        if (!c.aiNote) continue;
        if (c.status === 'served') continue; // niet meer relevant
        directives.push({
            severity: 'opportunity',
            title: `Gang ${c.num}: ${c.title}`,
            body: c.aiNote,
        });
    }

    /* INFO — service-status. Alleen als er nog actieve/queued courses zijn. */
    const queuedCount = event.courses.filter(c => c.status === 'queued').length;
    const activeCount = event.courses.filter(c => c.status === 'active').length;
    if (queuedCount > 0 || activeCount > 0) {
        const total = event.courses.length;
        const served = event.courses.filter(c => c.status === 'served').length;
        directives.push({
            severity: 'info',
            title: `Service ${served}/${total}`,
            body: activeCount > 0
                ? `${activeCount} gang${activeCount === 1 ? '' : 'en'} in bereiding, ${queuedCount} wachtend.`
                : `${queuedCount} gang${queuedCount === 1 ? '' : 'en'} klaar voor de volgende ronde.`,
        });
    }

    return directives;
}
