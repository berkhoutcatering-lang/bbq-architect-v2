import type { ReactNode } from 'react';
import ChatPanel from '@/components/ai/ChatPanel';

/**
 * Plattegrond-tab layout — bypass AppShell zoals andere service-routes.
 * ChatPanel in z-bumping wrapper zodat 'ie boven de KDS-layout komt.
 */
export default function PlattegrondLayout({ children }: { children: ReactNode }) {
    return (
        <>
            {children}
            <div style={{ position: 'fixed', inset: 0, zIndex: 10000, pointerEvents: 'none' }}>
                <div style={{ pointerEvents: 'auto' }}>
                    <ChatPanel />
                </div>
            </div>
        </>
    );
}
