'use client';
import { useCallback, useMemo } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';

export type AgendaViewMode = 'month' | 'week' | 'list';

const VALID_MODES: readonly AgendaViewMode[] = ['month', 'week', 'list'] as const;

function isValid(v: string | null | undefined): v is AgendaViewMode {
    return !!v && (VALID_MODES as readonly string[]).includes(v);
}

/* Lees + schrijf agenda-view-modus via ?view= URL param. Refresh op
   /agenda?view=week opent direct in week-view. Default 'month' is
   impliciet (geen ?view= in URL) — houdt URL schoon zolang user op
   default zit. */
export function useAgendaView(): {
    view: AgendaViewMode;
    setView: (next: AgendaViewMode) => void;
} {
    const router = useRouter();
    const pathname = usePathname() || '/agenda';
    const searchParams = useSearchParams();

    const view: AgendaViewMode = useMemo(function () {
        const v = searchParams?.get('view');
        return isValid(v) ? v : 'month';
    }, [searchParams]);

    const setView = useCallback(function (next: AgendaViewMode) {
        const params = new URLSearchParams(searchParams?.toString() || '');
        if (next === 'month') {
            params.delete('view');
        } else {
            params.set('view', next);
        }
        const qs = params.toString();
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }, [router, pathname, searchParams]);

    return { view, setView };
}
