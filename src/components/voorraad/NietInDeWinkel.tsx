'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';

/** Toont de kinderen overal, behalve op de schermen van de werkruimte Winkel. */
export default function NietInDeWinkel({ children }: { children: ReactNode }) {
    const pad = usePathname();
    return pad?.startsWith('/voorraad/winkel') ? null : <>{children}</>;
}
