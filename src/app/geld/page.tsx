import { redirect } from 'next/navigation';

/* /geld is op 2026-05-02 hernoemd naar /administratie omdat "Geld" te smal was —
   uren, klanten, voorraad en inkooplijsten leven nu ook onder Administratie. */
export default function GeldRedirectPage(): never {
    redirect('/administratie');
}
