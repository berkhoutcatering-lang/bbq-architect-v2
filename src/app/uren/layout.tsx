import type { ReactNode } from 'react';
import UrenTabs from '@/components/UrenTabs';

/* De werkruimtebalk toont Team & Operatie (Uren · Materieel · Ritten ·
   Logistiek); binnen Uren blijft deze tweede rij voor Klok / Personeel.
   Paginarand om alles: de pagina's hebben zelf geen zijmarge. */
export default function UrenLayout({ children }: { children: ReactNode }) {
  return (
    <div className="pagina-rand">
      <UrenTabs />
      {children}
    </div>
  );
}
