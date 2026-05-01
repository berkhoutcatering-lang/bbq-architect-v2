import { redirect } from 'next/navigation';

/* /menu-engineering → /marges (rename 2026-05-01).
   "Menu Engineering" was te abstract als label voor Pro-tier-cateraars; de pagina
   is alleen analyse (BCG, marges, foodcost-trends), dus de URL volgt de inhoud. */
export default function MenuEngineeringRedirect(): never {
    redirect('/marges');
}
