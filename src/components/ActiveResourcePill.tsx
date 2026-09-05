'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { PartyPopper, User, FileText, MessageSquareText, X } from 'lucide-react';
import { useActiveResource, type ActiveResourceKind } from '@/lib/ActiveResourceContext';

const ICONS: Record<ActiveResourceKind, React.ComponentType<{ size?: number }>> = {
  event: PartyPopper,
  klant: User,
  offerte: FileText,
  klantgesprek: MessageSquareText,
};

const KIND_LABELS: Record<ActiveResourceKind, string> = {
  event: 'Event',
  klant: 'Klant',
  offerte: 'Offerte',
  klantgesprek: 'Gesprek',
};

export default function ActiveResourcePill() {
  const { active, clear } = useActiveResource();
  const pathname = usePathname();

  if (!active) return null;

  // Verberg pill als gebruiker al op de resource-pagina staat — zou redundant zijn
  if (pathname && pathname.startsWith(active.href)) return null;

  /* Hij stond ook op /instellingen, /admin, /systeem en de juridische
     pagina's. Daar heeft "Event: cor Berkhout — 16 aug" geen betekenis: je
     bent niet met dat event bezig en er is niets wat ernaar terugverwijst. */
  const ZONDER_CONTEXT = ['/instellingen', '/admin', '/systeem', '/legal', '/gebruikers', '/hulp', '/pricing', '/welkom'];
  if (pathname && ZONDER_CONTEXT.some(function (p) { return pathname === p || pathname.startsWith(p + '/'); })) return null;

  const Icon = ICONS[active.kind] || PartyPopper;

  return (
    <div
      className="active-resource-pill"
      role="status"
      aria-label={`Actieve ${KIND_LABELS[active.kind]}: ${active.label}`}
    >
      <Link
        href={active.href}
        className="active-resource-pill__link"
        title={`Ga naar ${active.label}${active.meta ? ' — ' + active.meta : ''}`}
      >
        <Icon size={13} />
        <span className="active-resource-pill__label">
          {active.label}
        </span>
      </Link>
      <button
        type="button"
        onClick={clear}
        className="active-resource-pill__close"
        aria-label={`${KIND_LABELS[active.kind]}-context sluiten`}
        title="Context sluiten"
      >
        <X size={13} />
      </button>
    </div>
  );
}
