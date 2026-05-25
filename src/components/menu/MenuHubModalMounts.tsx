/* ═══════════════════════════════════════════════════════════════
   MenuHubModalMounts — Listent op ?modal=bedenker | pitmaster
   Bucket C P0-3 / P0-10. Wordt in /gerechten/layout.tsx gemount
   zodat de deeplink-redirects vanuit /bedenker en /gerechten/ai-pitmaster
   (middleware) een echte modal openen ipv een lege URL achterlaten.
   Sluiten van de modal verwijdert de query-param.
   ═══════════════════════════════════════════════════════════════ */

'use client';

import { useCallback } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { BedenkerModal } from './BedenkerModal';

export default function MenuHubModalMounts() {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const modal = searchParams.get('modal');

    const closeModal = useCallback(() => {
        const params = new URLSearchParams(searchParams.toString());
        params.delete('modal');
        const qs = params.toString();
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }, [router, pathname, searchParams]);

    return (
        <>
            <BedenkerModal open={modal === 'bedenker'} onClose={closeModal} />
            {/* Pitmaster modal komt in volgende iteratie — voor nu fungeert
                ?modal=pitmaster als een no-op die door middleware naar
                /gerechten?modal=pitmaster wordt geleid. Mounten van een
                PitmasterModal hier wanneer die component bestaat. */}
        </>
    );
}
