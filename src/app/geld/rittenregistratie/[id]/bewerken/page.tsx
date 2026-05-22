import { Suspense } from 'react';
import { LoadingState } from '@/components/LoadingState';
import BewerkRitClient from './_client';

export const dynamic = 'force-dynamic';

export default async function BewerkRitPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense fallback={<LoadingState label="Rit laden" />}>
      <BewerkRitClient id={Number(id)} />
    </Suspense>
  );
}
