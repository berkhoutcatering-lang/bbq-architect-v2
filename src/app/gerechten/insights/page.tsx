import { redirect } from 'next/navigation';

/* /gerechten/insights is samengevoegd met /gerechten/menu-analyse op 2026-05-22
   als sub-tab "Menu-health". Bestaande deeplinks blijven werken via deze redirect. */
export default function InsightsRedirect(): never {
    redirect('/gerechten/menu-analyse?tab=health');
}
