'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useSupabase } from '@/lib/useSupabase';
import type { Rit } from '@/types';
import RitForm from '../../_components/RitForm';

export default function BewerkRitClient({ id }: { id: number }) {
  const { data: ritten, loading } = useSupabase<Rit>('ritten', []);
  const rit = useMemo(() => ritten.find((r) => r.id === id) ?? null, [ritten, id]);

  if (loading) {
    return (
      <div className="main-content" style={{ padding: 32 }}>
        <div style={{ color: 'var(--muted)' }}>Rit laden…</div>
      </div>
    );
  }

  if (!rit) {
    return (
      <div className="main-content" style={{ padding: 32 }}>
        <Link
          href="/administratie/rittenregistratie"
          style={{ color: 'var(--brand)', textDecoration: 'none' }}
        >
          ← Terug naar rittenoverzicht
        </Link>
        <div style={{ marginTop: 24, fontSize: 16, fontWeight: 600 }}>Rit niet gevonden</div>
        <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
          De gevraagde rit bestaat niet (meer) of je hebt geen toegang.
        </div>
      </div>
    );
  }

  return <RitForm rit={rit} />;
}
