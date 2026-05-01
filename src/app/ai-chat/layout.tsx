import type { ReactNode } from 'react';
import KeukenTabs from '@/components/KeukenTabs';

export default function AiChatLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <div style={{ padding: '16px 32px 0' }}>
        <KeukenTabs />
      </div>
      {children}
    </>
  );
}
