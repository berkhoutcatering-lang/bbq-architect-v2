import type { ReactNode } from 'react';
import VerkoopTabs from '@/components/VerkoopTabs';

export default function LeadsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <div style={{ padding: '16px 32px 0' }}>
        <VerkoopTabs />
      </div>
      {children}
    </>
  );
}
