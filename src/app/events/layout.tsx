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

  return (
    <>
      <div style={{ padding: '16px 32px 0' }}>
        <PlannenTabs />
      </div>
      {children}
    </>
  );
}
