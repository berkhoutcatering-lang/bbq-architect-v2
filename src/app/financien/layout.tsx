import type { ReactNode } from 'react';
import GeldTabs from '@/components/GeldTabs';
import FinancienAiDrawer from '@/components/financien/FinancienAiDrawer';

/* S5-deel-3: financien-coach drawer beschikbaar op elke financien-tab.
   Floating CTA bottom-right, opent een drawer die de afgelopen 90 dagen
   aan offertes/facturen/bonnen scant en 4-6 pattern-inzichten formuleert.
   Geen fiscaal advies — disclaimer in de drawer. */
export default function FinancienLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <div style={{ padding: '16px 32px 0' }}>
        <GeldTabs />
      </div>
      {children}
      <FinancienAiDrawer />
    </>
  );
}
