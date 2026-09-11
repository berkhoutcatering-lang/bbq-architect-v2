import type { ReactNode } from 'react';

/** Tablet-layout — buiten AppShell om; volledig scherm, geen navigatie. */
export default function KeukenTabletLayout({ children }: { children: ReactNode }) {
    return <>{children}</>;
}
