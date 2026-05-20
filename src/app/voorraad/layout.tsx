import type { ReactNode } from 'react';
import VoorraadHeader from '@/components/voorraad/VoorraadHeader';
import AllergenQueueBanner from '@/components/AllergenQueueBanner';

/* S2.6 — banner toont AI-suggesties op ingredient-niveau (voorraad)
   + component-niveau (gerechten). Verschijnt alleen als er iets in
   queue staat. */
export default function VoorraadLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <VoorraadHeader />
      <div style={{ padding: '0 var(--space-mobile-edge)' }}>
        <AllergenQueueBanner />
      </div>
      {children}
    </>
  );
}
