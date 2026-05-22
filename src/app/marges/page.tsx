import { redirect } from 'next/navigation';

/* /marges is samengevoegd met /gerechten/menu-analyse op 2026-05-22.
   BCG-kwadranten, KPI-tiles, WinnerSpotlight + menu-health leven nu op
   één plek met sub-tabs (?tab=marges of ?tab=health). Bestaande deeplinks
   blijven werken via deze redirect. */
export default function MargesRedirect(): never {
    redirect('/gerechten/menu-analyse');
}
