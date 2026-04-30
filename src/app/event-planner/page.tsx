import { redirect } from 'next/navigation';

/**
 * /event-planner is uitgefaseerd — overlap met /agenda + dashboard.
 * Volgens UX audit 2026-04-30: één planningspagina is voldoende.
 *
 * Redirect blijft bestaan voor oude bookmarks. Als geen call-sites
 * meer naar /event-planner verwijzen, kan de hele route weg.
 */
export default function EventPlannerRedirect() {
  redirect('/agenda');
}
