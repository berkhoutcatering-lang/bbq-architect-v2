import type { ReactNode } from 'react';

/**
 * Wandscherm-layout — buiten AppShell om.
 *
 * Bewust ook **zonder** ChatPanel, in tegenstelling tot het kookbord. Dit
 * scherm hangt aan de muur en is read-only: er hoort geen enkel bedienbaar
 * element op te staan, ook geen chatbubbel. Wie iets wil doen pakt de tablet.
 */
export default function KeukenschermLayout({ children }: { children: ReactNode }) {
    return <>{children}</>;
}
