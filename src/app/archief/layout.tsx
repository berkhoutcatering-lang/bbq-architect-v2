import type { ReactNode } from 'react';
import VoorraadTabs from '@/components/VoorraadTabs';

export default function ArchiefLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <div style={{ padding: '16px 32px 0' }}>
        <VoorraadTabs />
      </div>
      {children}
    </>
  );
}
