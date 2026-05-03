import { Suspense } from 'react';
import { LoadingState } from '@/components/LoadingState';
import NieuweRitClient from './_client';

export const dynamic = 'force-dynamic';

export default async function NieuweRitPage({
  searchParams,
}: {
  searchParams: Promise<{ event?: string }>;
}) {
  const params = await searchParams;
  const eventId = params.event ? parseInt(params.event) : null;
  return (
    <Suspense fallback={<LoadingState label="Nieuwe rit laden" />}>
      <NieuweRitClient prefillEventId={eventId} />
    </Suspense>
  );
}
