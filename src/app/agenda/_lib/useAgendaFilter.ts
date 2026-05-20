'use client';
import { useCallback, useMemo } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import type { AgendaFilterState, AgendaStatus } from './types';

const ALL_STATUSES: AgendaStatus[] = ['live', 'optie', 'aanvraag', 'other'];

/* Map elke DB-status-string naar één canonical AgendaStatus bucket.
   Houd de bekende synoniemen samen — accepteert zowel NL als EN. */
export function normalizeStatus(s: string | null | undefined): AgendaStatus {
    const x = (s || '').toLowerCase().trim();
    if (x === 'confirmed' || x === 'completed' || x === 'bevestigd' || x === 'live') return 'live';
    if (x === 'option' || x === 'optie' || x === 'tentative') return 'optie';
    if (x === 'request' || x === 'aanvraag' || x === 'pending' || x === 'new') return 'aanvraag';
    return 'other';
}

/* Lees + schrijf filter-state via URL search params. State is shareable via link. */
export function useAgendaFilter(allCalIds: string[]): {
    state: AgendaFilterState;
    setState: (next: AgendaFilterState) => void;
} {
    const router = useRouter();
    const pathname = usePathname() || '/agenda';
    const searchParams = useSearchParams();

    const state: AgendaFilterState = useMemo(function () {
        const calsParam = searchParams?.get('cals');
        const statusParam = searchParams?.get('status');
        const fromParam = searchParams?.get('from') || undefined;
        const toParam = searchParams?.get('to') || undefined;

        const cals = calsParam ? calsParam.split(',').filter(Boolean) : allCalIds;
        const statuses = statusParam
            ? (statusParam.split(',').filter(Boolean) as AgendaStatus[])
            : ALL_STATUSES;

        return { cals, statuses, from: fromParam, to: toParam };
    }, [searchParams, allCalIds]);

    const setState = useCallback(function (next: AgendaFilterState) {
        const params = new URLSearchParams(searchParams?.toString() || '');
        /* Alleen schrijven als waarde afwijkt van "alles aan" (default).
           Dat houdt de URL schoon: ?filter is alleen aanwezig bij actieve filter. */
        if (next.cals.length === allCalIds.length && allCalIds.every(id => next.cals.includes(id))) {
            params.delete('cals');
        } else {
            params.set('cals', next.cals.join(','));
        }
        if (next.statuses.length === ALL_STATUSES.length) {
            params.delete('status');
        } else {
            params.set('status', next.statuses.join(','));
        }
        if (next.from) params.set('from', next.from); else params.delete('from');
        if (next.to) params.set('to', next.to); else params.delete('to');

        const qs = params.toString();
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }, [router, pathname, searchParams, allCalIds]);

    return { state, setState };
}

/* Filter helper — neem een lijst events en huidige filter, return wat door mag. */
export function applyFilter<T extends { calId: string; status?: string; dbDate?: string; day?: number }>(
    events: T[],
    filter: AgendaFilterState,
    year: number,
    month: number,
): T[] {
    return events.filter(function (e) {
        if (!filter.cals.includes(e.calId)) return false;
        const norm = normalizeStatus(e.status);
        if (!filter.statuses.includes(norm)) return false;
        /* Voor range-filter: gebruik dbDate als beschikbaar, anders bouw uit (year, month, day). */
        if (filter.from || filter.to) {
            const iso = e.dbDate || (e.day ? `${year}-${String(month + 1).padStart(2, '0')}-${String(e.day).padStart(2, '0')}` : null);
            if (!iso) return true; // geen datum-info → niet uitsluiten
            if (filter.from && iso < filter.from) return false;
            if (filter.to && iso > filter.to) return false;
        }
        return true;
    });
}
