import type { ReactNode } from 'react';
import TeamTabs from '@/components/TeamTabs';
import UrenTabs from '@/components/UrenTabs';

export default function UrenLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <div style={{ padding: '16px 32px 0' }}>
        <TeamTabs />
        <UrenTabs />
      </div>
      {children}
    </>
  );
}
