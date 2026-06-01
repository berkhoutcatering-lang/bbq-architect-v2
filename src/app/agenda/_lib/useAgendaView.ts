'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';

export type AgendaViewMode = 'month' | 'week' | 'list';

const VALID_MODES: readonly AgendaViewMode[] = ['month', 'week', 'list'] as const;

function isValid(v: string | null | undefined): v is AgendaViewMode {
    return !!v && (VALID_MODES as readonly string[]).includes(v);
}

/* Lees + schrijf agenda-view-modus via ?view= URL param. Refresh op
   /agenda?view=week opent direct in week-view. Default 'month' op desktop,
   'list' op phone — een 7-koloms maandkalender wordt onleesbaar onder 600px
   en horizontaal scrollen voor "wat speelt er deze week" is friction. Lijst
   is per-event scrollbaar verticaal, past natuurlijk. URL blijft schoon
   zolang user op default zit (geen ?view= in URL). */
export function useAgendaView(): {
    view: AgendaViewMode;
    setView: (next: AgendaViewMode) => void;
} {
    const router = useRouter();
    const pathname = usePathname() || '/agenda';
    const searchParams = useSearchParams();

    /* Hydration-safe phone-detect: server-render altijd 'month' (geen window),
       client switcht na mount naar 'list' indien phone én geen ?view= gezet. */
    const [isPhone, setIsPhone] = useState(false);
    useEffect(() => {
        const mq = window.matchMedia('(max-width: 767px)');
        setIsPhone(mq.matches);
        const onChange = (e: MediaQueryListEvent) => setIsPhone(e.matches);
        mq.addEventListener('change', onChange);
        return () => mq.removeEventListener('change', onChange);
    }, []);

    const view: AgendaViewMode = useMemo(function () {
        const v = searchParams?.get('view');
        if (isValid(v)) return v;
        return isPhone ? 'list' : 'month';
    }, [searchParams, isPhone]);

    const setView = useCallback(function (next: AgendaViewMode) {
        const params = new URLSearchParams(searchParams?.toString() || '');
        const isDefault = (isPhone && next === 'list') || (!isPhone && next === 'month');
        if (isDefault) {
            params.delete('view');
        } else {
            params.set('view', next);
        }
        const qs = params.toString();
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }, [router, pathname, searchParams, isPhone]);

    return { view, setView };
}
