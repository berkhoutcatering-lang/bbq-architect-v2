import { redirect } from 'next/navigation';

/* /administratie is samengevoegd met /geld op 2026-05-22 (B8 IA-cleanup).
   /administratie was een doublet-hub die hetzelfde concept dekte als /geld
   (financiën-stats, klanten, voorraad, uren, inkoop, ritten). Eén plek voor
   geld + administratie, geen verwarrend dubbel-spoor. */
export default function AdministratieRedirect(): never {
    redirect('/geld');
}
