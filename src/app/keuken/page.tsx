import { redirect } from 'next/navigation';

/* /keuken hub-page: 2026-05-10 v5 — vervangen door "Inspiratie Bibliotheek".
   De hub heet nu Inspiratie en bevat Componenten + Gerechten als sub-pages.
   Bedenker en Marges blijven als losse routes werken (worden in PR4/PR6 inline
   geïntegreerd). Deze redirect houdt oude bookmarks naar /keuken werkend. */
export default function KeukenRedirectPage(): never {
    redirect('/inspiratie');
}
