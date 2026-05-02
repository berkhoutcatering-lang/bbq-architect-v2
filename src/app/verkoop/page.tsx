import { redirect } from 'next/navigation';

/* /verkoop hub-page is op 2026-05-02 vervangen. In de nieuwe IA leeft alles wat
   met verkoop te maken heeft onder Events (intake → offerte → factuur als
   onderdeel van de event-lifecycle). Klanten verhuisde naar Administratie. */
export default function VerkoopRedirectPage(): never {
    redirect('/offertes');
}
