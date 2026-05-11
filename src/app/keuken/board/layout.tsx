import type { ReactNode } from 'react';
import ChatPanel from '@/components/ai/ChatPanel';

/**
 * Prep-KDS layout — bypass AppShell zoals service-mode KDS.
 * Geen sidebar/breadcrumb/bottom-nav — alleen het bord telt.
 *
 * Mount ChatPanel hier zodat de Vraag-Rook FAB (binnen PrepBoardClient)
 * via window.dispatchEvent('open-chat') een ingebed panel opent.
 *
 * Toast + AuthContext + OrgContext zitten al in root layout.
 * Display-mode (?display=true) wordt door PrepBoardClient afgehandeld.
 */
export default function PrepKdsBoardLayout({ children }: { children: ReactNode }) {
    return (
        <>
            {children}
            {/* ChatPanel rendert als <aside> met fixed z-index 60.
                .kds-layout zit op z-index 9999, dus we hijsen 'm via een
                positioned wrapper boven het bord. */}
            <div style={{ position: 'fixed', inset: 0, zIndex: 10000, pointerEvents: 'none' }}>
                <div style={{ pointerEvents: 'auto' }}>
                    <ChatPanel />
                </div>
            </div>
        </>
    );
}
