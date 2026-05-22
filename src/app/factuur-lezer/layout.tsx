import type { ReactNode } from 'react';

/* Layout-shell behouden zodat de redirect in page.tsx zijn werk doet
   zonder dat een achtergebleven GeldTabs-context het ontvangstpad
   verstoort. Server-side redirect retourneert direct 307 voordat
   children ooit renderen. */
export default function FactuurLezerLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
