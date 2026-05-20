/* Gedeelde types voor de agenda-pagina + sub-components.
   AgendaEvent is het interne canonical shape — DB events, prep_tasks en
   persoonlijke afspraken worden alle drie naar dit shape gemapped. */

export interface AgendaEvent {
    id: string;
    calId: string;
    day: number;
    start: number;
    duration: number;
    title: string;
    client?: string;
    guests?: number;
    venue?: string;
    revenue?: number;
    package?: string;
    cuts?: string;
    target?: string;
    wood?: string;
    staff?: string[];
    supplier?: string;
    amount?: number;
    kind?: string;
    conflict?: { note?: string } | string;
    conflictNote?: string;
    notes?: string;
    isPersonal?: boolean;
    personalId?: string;
    color?: string;
    critical?: boolean;
    warning?: boolean;
    dbDate?: string;
    for?: string;
    done?: boolean;
    status?: string;
    type?: string;
    dbId?: number;
    startTime?: string | null;
    endTime?: string | null;
    [key: string]: unknown;
}

export type AgendaStatus = 'live' | 'optie' | 'aanvraag' | 'other';

/* Een filter-state-object dat URL-serializable is. */
export interface AgendaFilterState {
    cals: string[];           // calendar-ids
    statuses: AgendaStatus[];  // event-status
    from?: string;             // ISO yyyy-mm-dd
    to?: string;               // ISO yyyy-mm-dd
}
