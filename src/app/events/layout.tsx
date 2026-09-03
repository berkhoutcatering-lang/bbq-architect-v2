'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import PlannenTabs from '@/components/PlannenTabs';

export default function EventsLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  // KDS service mode bypassed de tabs — fullscreen kookbord
  const isKds = /^\/events\/[^/]+\/service(\/.*)?$/.test(pathname || '');

  if (isKds) {
    return <>{children}</>;
  }

  /* Binnen één event schakel je niet tussen Agenda en Events — daar heb je het
     kruimelpad voor. Deze balk stond mee te tellen in de vijf navigatierijen
     die op de event-hub boven de eerste inhoud stonden. Op de lijst zelf blijft
     hij staan, want daar dóé je die keuze. */
  const isEventDetail = /^\/events\/[^/]+(\/.*)?$/.test(pathname || '');

  if (isEventDetail) {
    return <>{children}</>;
  }

  return (
    <>
      <div style={{ padding: '16px 32px 0' }}>
        <PlannenTabs />
      </div>
      {children}
    </>
  );
}
