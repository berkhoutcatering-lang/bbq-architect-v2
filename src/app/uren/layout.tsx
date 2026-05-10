import type { ReactNode } from 'react';
import GeldTabs from '@/components/GeldTabs';
import UrenTabs from '@/components/UrenTabs';

export default function UrenLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <div style={{ padding: '16px 32px 0' }}>
        <GeldTabs />
        <UrenTabs />
      </div>
      {children}
    </>
  );
}
