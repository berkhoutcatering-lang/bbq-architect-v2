import { redirect } from 'next/navigation';

/* /keuken hub-page is op 2026-05-02 vervangen door de nieuwe IA waarin Recepten
   het top-level item is. Sidebar wijst nu naar /gerechten (canonical), Bedenker
   en Marges blijven als losse routes maar zijn ook bereikbaar via Recepten-children
   in de sidebar. Deze redirect houdt oude links werkend. */
export default function KeukenRedirectPage(): never {
    redirect('/gerechten');
}
