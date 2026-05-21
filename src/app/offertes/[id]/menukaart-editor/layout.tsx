import type { ReactNode } from 'react';

/**
 * Full-screen editor — overrulet de /offertes layout zodat VerkoopTabs niet
 * meerendert en de editor de volledige viewport pakt. De AppShell sidebar zit
 * op een hoger niveau; de editor positioneert zich `position: fixed` boven de
 * shell met `inset: 0`.
 */
export default function MenukaartEditorLayout({ children }: { children: ReactNode }) {
    return <div style={{ position: 'fixed', inset: 0, zIndex: 50 }}>{children}</div>;
}
