import type { ReactNode } from 'react';

/* Paginarand: deze pagina heeft zelf geen zijmarge (stond tegen de zijbalk
   aan). Zie .pagina-rand in src/styles/werkruimte.css. */
export default function Layout({ children }: { children: ReactNode }) {
  return <div className="pagina-rand">{children}</div>;
}
