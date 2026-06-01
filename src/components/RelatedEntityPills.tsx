'use client';

/* Klikbare relatie-pills die de "buren" van een entiteit tonen — het zichtbare
   weefsel van het ecosysteem. Plaats op een detail-pagina (offerte/event/factuur)
   en de gebruiker kan naar de gekoppelde entiteiten springen.

   Self-loading: geef kind + id mee, de component haalt de relaties op via
   getRelatedEntities en rendert ze. Geen relaties → rendert niets (geen lege box). */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { FileText, CalendarDays, Receipt, User, ArrowUpRight, Inbox } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { getRelatedEntities, type RelatedEntity, type EntityKind } from '@/lib/related-entities';
import StatusBadge from './StatusBadge';

const KIND_ICON: Record<EntityKind, typeof FileText> = {
  offerte: FileText,
  event: CalendarDays,
  factuur: Receipt,
  klant: User,
  lead: Inbox,
};

interface Props {
  kind: EntityKind;
  id?: number | string;
  clientNaam?: string;
  orgId?: string | null;
  title?: string;
}

export default function RelatedEntityPills({ kind, id, clientNaam, orgId, title = 'Gekoppeld' }: Props) {
  const [items, setItems] = useState<RelatedEntity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getRelatedEntities(supabase, { kind, id, clientNaam, orgId })
      .then((res) => { if (!cancelled) { setItems(res); setLoading(false); } })
      .catch(() => { if (!cancelled) { setItems([]); setLoading(false); } });
    return () => { cancelled = true; };
  }, [kind, id, clientNaam, orgId]);

  if (loading) {
    return (
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {[0, 1].map((i) => (
          <span key={i} style={{ height: 30, width: 120, borderRadius: 999, background: 'var(--card)', border: '1px solid var(--border)', opacity: 0.5 }} />
        ))}
      </div>
    );
  }

  if (items.length === 0) return null;

  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
      {title && (
        <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--muted)', marginRight: 2 }}>
          {title}
        </span>
      )}
      {items.map((it) => {
        const Icon = KIND_ICON[it.kind];
        return (
          <Link
            key={it.kind + ':' + it.id}
            href={it.href}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '6px 12px 6px 10px', borderRadius: 999,
              background: 'var(--card)', border: '1px solid var(--border)',
              color: 'var(--text)', textDecoration: 'none', fontSize: 13, fontWeight: 600,
              transition: 'border-color .15s, background .15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--brand)'; e.currentTarget.style.background = 'var(--brand-tint, var(--card))'; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--card)'; }}
          >
            <Icon size={14} style={{ color: 'var(--brand)', flexShrink: 0 }} />
            <span style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.label}</span>
            {it.status && <StatusBadge status={it.status} size="sm" />}
            <ArrowUpRight size={13} style={{ color: 'var(--muted)', flexShrink: 0 }} />
          </Link>
        );
      })}
    </div>
  );
}
