/* ═══════════════════════════════════════════════════════════════
   useMenuView — view-mode toggle voor /gerechten library
   Bucket C P0-5. Leest ?view=grid|list|gallery, valt terug op
   localStorage 'menu_view', default 'grid'.
   ═══════════════════════════════════════════════════════════════ */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { MenuViewMode } from '@/components/menu/atoms';

const VALID: MenuViewMode[] = ['grid', 'list', 'gallery'];
const LS_KEY = 'bbq:menu_view';

function readInitial(searchParam: string | null): MenuViewMode {
    if (searchParam && VALID.includes(searchParam as MenuViewMode)) return searchParam as MenuViewMode;
    if (typeof window !== 'undefined') {
        const stored = window.localStorage.getItem(LS_KEY);
        if (stored && VALID.includes(stored as MenuViewMode)) return stored as MenuViewMode;
    }
    return 'grid';
}

export function useMenuView(): [MenuViewMode, (mode: MenuViewMode) => void] {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const urlView = searchParams.get('view');

    /* SSR-safe: tijdens server-render is window undefined, dus we
       initialiseren met URL-param-only en sync na mount uit localStorage. */
    const [mode, setMode] = useState<MenuViewMode>(() => readInitial(urlView));

    useEffect(() => {
        /* Sync URL → state als URL extern verandert (back/forward). */
        if (urlView && VALID.includes(urlView as MenuViewMode) && urlView !== mode) {
            setMode(urlView as MenuViewMode);
        }
        /* Hydrate uit localStorage als URL leeg */
        if (!urlView) {
            const stored = window.localStorage.getItem(LS_KEY);
            if (stored && VALID.includes(stored as MenuViewMode) && stored !== mode) {
                setMode(stored as MenuViewMode);
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [urlView]);

    const set = useCallback((next: MenuViewMode) => {
        if (!VALID.includes(next)) return;
        setMode(next);
        if (typeof window !== 'undefined') window.localStorage.setItem(LS_KEY, next);
        /* URL update zonder navigation (replace, geen scroll). */
        const params = new URLSearchParams(searchParams.toString());
        if (next === 'grid') params.delete('view'); // default = leeg
        else params.set('view', next);
        const qs = params.toString();
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }, [router, pathname, searchParams]);

    return [mode, set];
}
