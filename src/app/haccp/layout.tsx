import type { ReactNode } from 'react';

/**
 * /haccp — layout.
 *
 * Geen hub-tabs hier. De HACCP-flow gebruikt zijn eigen step bar
 * (Kies → AI Plan → Aanpassen → Loggen → Dossier) als top-level
 * navigatie binnen de page. Sidebar (AppShell) verzorgt hub-niveau.
 */
export default function HaccpLayout({ children }: { children: ReactNode }) {
    return <>{children}</>;
}
