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
import { BedenkerModal, BEDENKER_HANDOFF_KEY, BEDENKER_HANDOFF_EVENT, type BedenkerResult } from './BedenkerModal';

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

    /* "Maak gerecht": leg het resultaat klaar voor het gerecht-formulier op
       /gerechten en ga daarheen. Staat dat formulier al op de pagina, dan pakt
       het het event meteen op; anders leest het sessionStorage bij mounten. */
    const acceptToGerechten = useCallback((result: BedenkerResult) => {
        try { sessionStorage.setItem(BEDENKER_HANDOFF_KEY, JSON.stringify(result)); } catch { /* privémodus */ }
        closeModal();
        if (pathname === '/gerechten') {
            window.dispatchEvent(new Event(BEDENKER_HANDOFF_EVENT));
        } else {
            router.push('/gerechten');
        }
    }, [closeModal, pathname, router]);

    return (
        <>
            <BedenkerModal open={modal === 'bedenker'} onClose={closeModal} onAccept={acceptToGerechten} />
            {/* Pitmaster modal komt in volgende iteratie — voor nu fungeert
                ?modal=pitmaster als een no-op die door middleware naar
                /gerechten?modal=pitmaster wordt geleid. Mounten van een
                PitmasterModal hier wanneer die component bestaat. */}
        </>
    );
}
