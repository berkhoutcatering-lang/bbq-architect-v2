'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

/* The stand-alone flow-timeline lived here, but everything it showed is now
   part of the hub (/events/[id]/hub). Keep this route as a redirect so old
   bookmarks and links keep working. */
export default function EventDetailRedirect() {
  const router = useRouter();
  const params = useParams();
  useEffect(() => {
    const id = String(params.id || '');
    if (id) router.replace(`/events/${id}/hub`);
  }, [params, router]);
  return (
    <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
      Event hub openen…
    </div>
  );
}
