'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Calendar, MessageSquare, ClipboardList, ShieldCheck, ChefHat, Star } from 'lucide-react';

interface Props {
  eventId: number | string;
  eventName?: string;
}

/**
 * EventTabs — wordt getoond op /events/[id]/hub plus op /klantgesprek, /prep-counter
 * en /haccp wanneer een ?event=<id> query-string aanwezig is. Maakt de event-as-container
 * filosofie zichtbaar: alle tab-routes horen bij hetzelfde event en wijken niet af.
 */
export default function EventTabs({ eventId, eventName }: Props) {
  const pathname = usePathname() || '';
  const search = useSearchParams();
  const queryEventId = search?.get('event');
  const inSameEventQs = queryEventId === String(eventId);

  const tabs = [
    {
      href: `/events/${eventId}/hub`,
      label: 'Overzicht',
      icon: Calendar,
      active: pathname === `/events/${eventId}/hub`,
    },
    {
      href: `/klantgesprek?event=${eventId}`,
      label: 'Klantgesprek',
      icon: MessageSquare,
      active: pathname === '/klantgesprek' && inSameEventQs,
    },
    {
      href: `/prep-counter?event=${eventId}`,
      label: 'Prep',
      icon: ClipboardList,
      active: pathname === '/prep-counter' && inSameEventQs,
    },
    {
      href: `/haccp?event=${eventId}`,
      label: 'HACCP',
      icon: ShieldCheck,
      active: pathname === '/haccp' && inSameEventQs,
    },
    {
      href: `/events/${eventId}/service`,
      label: 'Service',
      icon: ChefHat,
      active: pathname.startsWith(`/events/${eventId}/service`),
    },
    {
      href: `/events/${eventId}/reflectie`,
      label: 'Reflectie',
      icon: Star,
      active: pathname.startsWith(`/events/${eventId}/reflectie`),
    },
  ];

  return (
    <div style={{ marginBottom: 16 }}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: 'var(--muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          marginBottom: 8,
        }}
      >
        Event #{eventId}
        {eventName ? ' · ' + eventName : ''}
      </div>
      <div className="tab-bar" role="tablist" aria-label="Event-navigatie">
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <Link
              key={t.href}
              href={t.href}
              role="tab"
              aria-selected={t.active}
              aria-current={t.active ? 'page' : undefined}
              className={'tab-btn' + (t.active ? ' active' : '')}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none' }}
            >
              <Icon size={13} />
              {t.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
