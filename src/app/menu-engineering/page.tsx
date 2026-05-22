import { redirect } from 'next/navigation';

/* /menu-engineering → /gerechten/menu-analyse (2026-05-22).
   "Menu Engineering" was te abstract als label voor Pro-tier-cateraars; alle
   analyse leeft nu op /gerechten/menu-analyse (Marges + Health tabs). */
export default function MenuEngineeringRedirect(): never {
    redirect('/gerechten/menu-analyse');
}
