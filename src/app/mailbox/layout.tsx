import type { ReactNode } from 'react';
import SysteemTabs from '@/components/SysteemTabs';

export default function MailboxLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <div style={{ padding: '16px 32px 0' }}>
        <SysteemTabs />
      </div>
      {children}
    </>
  );
}
