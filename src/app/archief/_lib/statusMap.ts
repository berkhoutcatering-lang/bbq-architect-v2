/**
 * Status-mapping voor het Bonnenkistje UI.
 *
 * De DB-CHECK accepteert 6 waarden (legacy + nieuw):
 *   - 'pending'     (default voor nieuwe bonnen)
 *   - 'review'      (legacy alias voor "twijfel" — uit 004)
 *   - 'processed'   (legacy alias voor "bevestigd" — uit bon-commit flow)
 *   - 'bevestigd'   (nieuw, design)
 *   - 'twijfel'     (nieuw, design)
 *   - 'vergrendeld' (nieuw, design + RLS-flag)
 *
 * In de UI mappen we 'review' → twijfel en 'processed' → bevestigd zodat
 * het Claude design DNA met 4 visuele statussen klopt.
 */

export type BonStatus = 'pending' | 'review' | 'processed' | 'bevestigd' | 'twijfel' | 'vergrendeld';
export type DisplayStatus = 'pending' | 'bevestigd' | 'twijfel' | 'vergrendeld';

export interface StatusVisual {
    label: string;
    display: DisplayStatus;
    icon: 'clock' | 'check-circle-2' | 'alert-triangle' | 'lock';
    color: 'amber' | 'green' | 'orange' | 'slate' | 'blue';
    /* Tailwind classes voor pill rendering. */
    pillClass: string;
    /* Border / dot accent class. */
    dotClass: string;
}

/* Pill-kleuren matchen Claude Design (archief-atoms.jsx STATUS_MAP):
   pending=draft (grijs) · bevestigd=ok (groen) · twijfel=optie (amber/brand)
   · vergrendeld=send (blauw). */
export const STATUS_VISUAL: Record<DisplayStatus, StatusVisual> = {
    pending: {
        label: 'Pending',
        display: 'pending',
        icon: 'clock',
        color: 'slate',
        pillClass: 'bg-[rgba(130,130,130,.14)] text-[var(--muted)] border-[var(--border)]',
        dotClass: 'bg-[var(--muted)]',
    },
    bevestigd: {
        label: 'Bevestigd',
        display: 'bevestigd',
        icon: 'check-circle-2',
        color: 'green',
        pillClass: 'bg-[rgba(34,197,94,.12)] text-[var(--green)] border-[rgba(34,197,94,.25)]',
        dotClass: 'bg-[var(--green)]',
    },
    twijfel: {
        label: 'Twijfel',
        display: 'twijfel',
        icon: 'alert-triangle',
        color: 'amber',
        pillClass: 'bg-[rgba(255,191,0,.12)] text-[var(--brand)] border-[rgba(255,191,0,.3)]',
        dotClass: 'bg-[var(--brand)]',
    },
    vergrendeld: {
        label: 'Vergrendeld',
        display: 'vergrendeld',
        icon: 'lock',
        color: 'blue',
        pillClass: 'bg-[rgba(59,130,246,.12)] text-[var(--blue)] border-[rgba(59,130,246,.25)]',
        dotClass: 'bg-[var(--blue)]',
    },
};

/**
 * Map elke DB-status naar de zichtbare display-status. Legacy aliases worden
 * vertaald: 'review' → 'twijfel', 'processed' → 'bevestigd'.
 */
export function toDisplayStatus(status: string | null | undefined): DisplayStatus {
    switch (status) {
        case 'bevestigd':
        case 'processed':
            return 'bevestigd';
        case 'twijfel':
        case 'review':
            return 'twijfel';
        case 'vergrendeld':
            return 'vergrendeld';
        case 'pending':
        default:
            return 'pending';
    }
}

export function getStatusVisual(status: string | null | undefined): StatusVisual {
    return STATUS_VISUAL[toDisplayStatus(status)];
}

/**
 * Alle filter-opties (DisplayStatus) voor de filter-sidebar.
 * In zoek-action wordt dit weer terug-gemapt naar de DB-equivalenten:
 *   'bevestigd' filter → status IN ('bevestigd', 'processed')
 *   'twijfel'   filter → status IN ('twijfel', 'review')
 */
export const FILTER_STATUS_OPTIONS: DisplayStatus[] = ['pending', 'bevestigd', 'twijfel', 'vergrendeld'];

export function expandFilterStatus(filter: DisplayStatus): BonStatus[] {
    switch (filter) {
        case 'bevestigd': return ['bevestigd', 'processed'];
        case 'twijfel':   return ['twijfel', 'review'];
        case 'pending':   return ['pending'];
        case 'vergrendeld': return ['vergrendeld'];
    }
}
