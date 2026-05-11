import type { ReactNode } from 'react';
import ChatPanel from '@/components/ai/ChatPanel';

/**
 * Kookbord layout — bypass AppShell (full-screen KDS).
 * Was /keuken/board layout — alleen hernoemd voor helderdere mental-model
 * split (kookbord = prep, /events/[id]/service = service tijdens event).
 *
 * ChatPanel in z-index-bumping wrapper zodat 'ie boven de KDS-layout komt.
 */
export default function KookbordLayout({ children }: { children: ReactNode }) {
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
