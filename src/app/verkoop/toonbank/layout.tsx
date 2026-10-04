import type { ReactNode } from 'react';
import VerkoopTabs from '@/components/VerkoopTabs';
import ToonbankTabs from './_components/ToonbankTabs';

/** Verkoop → Toonbank (BA-9, BA-10): bonnen, te controleren en dagstaten van de winkelkassa. */
export default function ToonbankLayout({ children }: { children: ReactNode }) {
    return (
        <>
            <div style={{ padding: '16px 32px 0' }}>
                <VerkoopTabs />
                <ToonbankTabs />
            </div>
            <div style={{ padding: '0 32px 32px' }}>{children}</div>
        </>
    );
}
