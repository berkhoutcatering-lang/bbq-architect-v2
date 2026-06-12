import type { ReactNode } from 'react';
import TeamTabs from '@/components/TeamTabs';

export default function RittenregistratieLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <div style={{ padding: '16px 32px 0' }}>
        <TeamTabs />
      </div>
      {children}
    </>
  );
}
