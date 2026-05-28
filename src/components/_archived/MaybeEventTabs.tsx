'use client';

import { useSearchParams } from 'next/navigation';
import EventTabs from './EventTabs';

/**
 * Render EventTabs alleen als de pagina bezocht is met ?event=<id> in de URL.
 * Wordt op /haccp, /klantgesprek en /prep-counter gebruikt zodat die pages
 * binnen een event-context dezelfde event-navigatie tonen als /events/[id]/hub.
 *
 * Zonder ?event= query-string is dit een no-op — de page rendert dan stand-alone.
 */
export default function MaybeEventTabs() {
  const search = useSearchParams();
  const eventId = search?.get('event');
  if (!eventId) return null;
  return <EventTabs eventId={eventId} />;
}
