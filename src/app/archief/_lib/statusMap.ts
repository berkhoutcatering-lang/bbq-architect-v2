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
        label: 'Wachtend',
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

/**
 * Categorie bevestigd, maar de BTW van de bon telt nog NIET mee in de
 * aangifte (5b). Tot 2026-10-26 stond hier gewoon groen "Bevestigd", waardoor
 * het leek alsof de bon helemaal klaar was terwijl de voorbelasting nog op
 * bevestiging wachtte.
 */
export const BTW_OPEN_VISUAL: StatusVisual = {
    label: 'BTW nog bevestigen',
    display: 'bevestigd',
    icon: 'alert-triangle',
    color: 'amber',
    pillClass: 'bg-[rgba(217,119,6,.12)] text-[var(--amber,#d97706)] border-[rgba(217,119,6,.3)]',
    dotClass: 'bg-[var(--amber,#d97706)]',
};

/** Categorie bevestigd; of de BTW meetelt is in deze weergave niet bekend (zoekresultaat). */
export const CATEGORIE_OK_VISUAL: StatusVisual = {
    ...STATUS_VISUAL.bevestigd,
    label: 'Categorie ok',
};

/**
 * Status zoals de cateraar 'm ziet: het oordeel van de boekhouder wint.
 * Vergrendeld > boekhouder (bevestigd/twijfel) > kistje-status. Oude rijen
 * waar de boekhouder al iets zei maar `status` nog 'pending' stond, tonen
 * zo toch het juiste beeld.
 *
 * "Bevestigd" (groen) betekent: categorie ok én — als er BTW op de bon staat —
 * voorbelasting bevestigd. Staat er BTW op die nog niet meetelt, dan
 * "BTW nog bevestigen" (amber).
 */
export function getBonStatusVisual(bon: {
    status: string | null | undefined;
    ai_classify_status?: string | null;
    locked_at?: string | null;
    btw_laag_bedrag?: number | string | null;
    btw_hoog_bedrag?: number | string | null;
    voorbelasting_bevestigd?: boolean | null;
}): StatusVisual {
    if (bon.locked_at) return STATUS_VISUAL.vergrendeld;
    const ai = bon.ai_classify_status;
    let visual: StatusVisual;
    if (ai === 'verified' || ai === 'auto_accepted' || ai === 'manual') visual = STATUS_VISUAL.bevestigd;
    else if (ai === 'twijfel') return STATUS_VISUAL.twijfel;
    else visual = getStatusVisual(bon.status);

    if (visual.display !== 'bevestigd') return visual;
    const btw = (Number(bon.btw_laag_bedrag) || 0) + (Number(bon.btw_hoog_bedrag) || 0);
    if (bon.voorbelasting_bevestigd === undefined) return CATEGORIE_OK_VISUAL;
    if (btw !== 0 && bon.voorbelasting_bevestigd !== true) return BTW_OPEN_VISUAL;
    return visual;
}
