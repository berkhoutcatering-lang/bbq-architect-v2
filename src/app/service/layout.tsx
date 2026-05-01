import type { ReactNode } from 'react';
import PlannenTabs from '@/components/PlannenTabs';

export default function ServiceLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <div style={{ padding: '16px 32px 0' }}>
        <PlannenTabs />
      </div>
      {children}
    </>
  );
}
