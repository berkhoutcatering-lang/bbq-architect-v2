import { redirect } from 'next/navigation';

/* /plannen hub-page is op 2026-05-02 vervangen door directe sidebar-links naar
   Agenda en Events — geen tussen-hub meer nodig. HACCP, Klantgesprek en
   Prep-counter leven straks onder een specifiek event (event-detail-tabs). */
export default function PlannenRedirectPage(): never {
    redirect('/agenda');
}
