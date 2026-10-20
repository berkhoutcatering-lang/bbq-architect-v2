import type { ReactNode } from 'react';
import VoorraadHeader from '@/components/voorraad/VoorraadHeader';

/* Paginarand om de inhoud: de pagina heeft zelf geen zijmarge (stond tegen
   de zijbalk aan). VoorraadHeader heeft zijn eigen rand. */
export default function InkoopLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <VoorraadHeader />
      <div className="pagina-rand" style={{ paddingTop: 0 }}>{children}</div>
    </>
  );
}
