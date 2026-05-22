import type { ReactNode } from 'react';
import GeldTabs from '@/components/GeldTabs';

export default function RittenregistratieLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <div style={{ padding: '16px 32px 0' }}>
        <GeldTabs />
      </div>
      {children}
    </>
  );
}
