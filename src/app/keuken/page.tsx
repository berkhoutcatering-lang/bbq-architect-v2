import { redirect } from 'next/navigation';

/* /keuken hub-page: 2026-05-10 vervangen door Menu & Recepten hub op /gerechten.
   Eerdere redirect ging via /inspiratie (dubbele hop sinds /inspiratie ook naar
   /gerechten redirect). Hub 4 fix: één-stap redirect direct naar /gerechten —
   spaart een HTTP round-trip op oude bookmarks. */
export default function KeukenRedirectPage(): never {
    redirect('/gerechten');
}
