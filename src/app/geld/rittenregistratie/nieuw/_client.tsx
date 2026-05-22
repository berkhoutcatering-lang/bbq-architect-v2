'use client';

import { useMemo } from 'react';
import { useSupabase } from '@/lib/useSupabase';
import type { DbEvent } from '@/types';
import RitForm from '../_components/RitForm';

export default function NieuweRitClient({ prefillEventId }: { prefillEventId: number | null }) {
  const { data: events } = useSupabase<DbEvent>('events', []);
  const prefilledEvent = useMemo(
    () => (prefillEventId ? events.find((e) => e.id === prefillEventId) ?? null : null),
    [events, prefillEventId],
  );
  return <RitForm rit={null} prefilledEvent={prefilledEvent} />;
}
