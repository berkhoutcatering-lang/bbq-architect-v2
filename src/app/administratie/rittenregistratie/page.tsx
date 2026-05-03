import { Suspense } from 'react';
import { LoadingState } from '@/components/LoadingState';
import RittenregistratieClient from './_client';

export const dynamic = 'force-dynamic';

export default function RittenregistratiePage() {
  return (
    <Suspense fallback={<LoadingState label="Rittenregistratie laden" />}>
      <RittenregistratieClient />
    </Suspense>
  );
}
