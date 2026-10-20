import type { ReactNode } from 'react';
import UrenTabs from '@/components/UrenTabs';

/* De werkruimtebalk toont Team & Operatie (Uren · Materieel · Ritten ·
   Logistiek); binnen Uren blijft deze tweede rij voor Klok / Personeel. */
export default function UrenLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <div style={{ padding: '16px 32px 0' }}>
        <UrenTabs />
      </div>
      {children}
    </>
  );
}
