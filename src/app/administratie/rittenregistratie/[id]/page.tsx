import { Suspense } from 'react';
import { LoadingState } from '@/components/LoadingState';
import RitDetailClient from './_client';

export const dynamic = 'force-dynamic';

export default async function RitDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense fallback={<LoadingState label="Rit laden" />}>
      <RitDetailClient id={Number(id)} />
    </Suspense>
  );
}
