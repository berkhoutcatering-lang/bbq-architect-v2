/**
 * Service-bord V2 — pure helpers.
 * Status-mapping volgt de DB-enum (queued/active/ready/served); het
 * design-tussenstation "uitgifte" is bewust overgeslagen — de flow
 * blijft 1-op-1 met courses.status zodat persistentie simpel is.
 */

import type { Course, CourseStatus, CourseStep, AllergyEntry } from '../../_types/service';
import type { TableZoneInfo } from '@/lib/floorPlanZones';

/* Tafel-status zoals het design hem kent. */
export type TafelStatus = 'wachtend' | 'klaar' | 'geserveerd';

export const SB_STATUS: Record<CourseStatus, { label: string; cssKleur: string }> = {
    queued:    { label: 'Wachtend',   cssKleur: 'var(--sb-dim)' },
    active:    { label: 'Bezig',      cssKleur: 'var(--warn)' },
    ready:     { label: 'Klaar',      cssKleur: 'var(--ok)' },
    served:    { label: 'Geserveerd', cssKleur: 'var(--ok)' },
    recalled:  { label: 'Teruggeroepen', cssKleur: 'var(--crit)' },
};

export const SB_TSTATUS: Record<TafelStatus, { label: string; cssKleur: string }> = {
    wachtend:   { label: 'Wachtend',   cssKleur: 'var(--sb-dim)' },
    klaar:      { label: 'Klaar',      cssKleur: 'var(--warn)' },
    geserveerd: { label: 'Geserveerd', cssKleur: 'var(--ok)' },
};

/** Volgende stap in de status-flow + contextueel knop-label. */
export function sbActie(course: Course, geserveerdTafels: number, totaalTafels: number):
    { label: string; next: CourseStatus } | null {
    switch (course.status) {
        case 'queued': return { label: `Start bereiding — ${course.title}`, next: 'active' };
        case 'active': return { label: `Markeer ${course.title} klaar — ${totaalTafels} tafels`, next: 'ready' };
        case 'ready': return { label: `Markeer geserveerd — ${geserveerdTafels}/${totaalTafels} tafels`, next: 'served' };
        default: return null;
    }
}

/** "HH:MM" uit minuten-sinds-middernacht. */
export const sbTijd = (min: number): string => {
    const m = ((Math.round(min) % 1440) + 1440) % 1440;
    return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

/** Geplande starttijd (min sinds middernacht) van een gang. */
export function gangTijdMin(startTime: string, course: Course): number {
    const [h, m] = (startTime || '17:00').split(':').map(n => parseInt(n, 10) || 0);
    return h * 60 + m + (course.serveTime || 0);
}

export function tafelStatusVan(item: { served?: boolean; ready?: boolean }): TafelStatus {
    if (item.served) return 'geserveerd';
    if (item.ready) return 'klaar';
    return 'wachtend';
}

/* ── Afvink-state (stappen/mise/kwaliteit) per event in localStorage ── */
export interface CourseChecks {
    stappen: Record<string, boolean>;
    mise: Record<string, boolean>;
    kwaliteit: Record<string, boolean>;
}
export type ChecksState = Record<string, CourseChecks>;

const checksKey = (eventId: number) => `sbv2_checks_${eventId}`;

export function laadChecks(eventId: number): ChecksState {
    try {
        const raw = localStorage.getItem(checksKey(eventId));
        if (raw) return JSON.parse(raw) as ChecksState;
    } catch { /* leeg */ }
    return {};
}

export function bewaarChecks(eventId: number, st: ChecksState): void {
    try { localStorage.setItem(checksKey(eventId), JSON.stringify(st)); } catch { /* vol/privé */ }
}

export function checksVoor(st: ChecksState, courseId: string): CourseChecks {
    return st[courseId] || { stappen: {}, mise: {}, kwaliteit: {} };
}

/* ── Coach-marks ── */
export const SB_COACH_KEY = 'sbv2_coach_v1';
export const SB_COACH: { titel: string; tekst: string; pos: 'rail' | 'actie' | 'rook' }[] = [
    { titel: 'Gangen op volgorde', tekst: 'Links staat de hele avond chronologisch. De gang met de oranje rand is waar je nu aan werkt — tik op een gang voor de kookkaart.', pos: 'rail' },
    { titel: 'Eén knop per gang', tekst: 'De grote knop onderaan volgt de status: starten, klaar melden, geserveerd. Nooit meer dan één keuze tegelijk.', pos: 'actie' },
    { titel: 'Rook denkt mee', tekst: 'De strip bovenaan toont het laatste advies van Rook. Tik erop om het hele gesprek te openen of iets te vragen.', pos: 'rook' },
];

/* ── Actieplan-stappen groeperen per gerecht ──
   courses.steps is plat ({n, action, detail}); de generator schrijft
   detail als "Gerecht · Component · hoeveelheid". We groeperen op de
   gerecht-naam zodat de kookkaart per gerecht een sectie toont. */
export interface StapGroep {
    naam: string;
    fotoUrl?: string;
    serviceTip?: string;
    stappen: { n: number; txt: string; hoev: string }[];
}

export function groepeerStappen(course: Course): StapGroep[] {
    const gerechten = course.gerechten || [];
    const groepen: StapGroep[] = gerechten.map(g => ({
        naam: g.naam, fotoUrl: g.fotoUrl, serviceTip: g.serviceTip, stappen: [],
    }));
    const rest: StapGroep = { naam: groepen.length > 0 ? 'Overig' : course.title, stappen: [] };

    for (const s of course.steps as CourseStep[]) {
        const detail = s.detail || '';
        const groep = groepen.find(g => detail === g.naam || detail.startsWith(g.naam + ' · '));
        const hoev = groep && detail.length > groep.naam.length
            ? detail.slice(groep.naam.length).replace(/^\s*·\s*/, '')
            : (groep ? '' : detail);
        (groep || rest).stappen.push({ n: s.n, txt: s.action, hoev });
    }
    const uit = groepen.filter(g => g.stappen.length > 0 || g.serviceTip);
    if (rest.stappen.length > 0) uit.push(rest);
    /* Gerechten zonder stappen maar mét foto tonen we alleen als er
       helemaal geen stappen zijn — dan toont de kookkaart de generator. */
    return uit;
}

/* ── NU-blok: wat vraagt direct aandacht ── */
export interface NuInfo {
    miseMis: { item: string; qty: string }[];
    volgendeStap: string | null;
    strengeAllergieen: string[];
}

export function berekenNu(course: Course, checks: CourseChecks, allergieen: AllergyEntry[]): NuInfo {
    const miseMis = course.mise.filter((_, i) => !checks.mise[String(i)]);
    const volgende = course.steps.find(s => !checks.stappen[String(s.n)]);
    const streng = [...new Set(
        allergieen
            .filter(a => a.severity === 'critical' && a.table > 0)
            .map(a => `T${a.table} ${(a.note || a.allergens.join('+') || '').toLowerCase()}`.trim()),
    )];
    return {
        miseMis: miseMis.map(m => ({ item: m.item, qty: m.qty })),
        volgendeStap: volgende ? volgende.action : null,
        strengeAllergieen: streng,
    };
}

/* ── Zone-info voor een tafel ── */
export function zoneVoorTafel(tableZones: Record<number, TableZoneInfo>, nr: number): TableZoneInfo | null {
    return tableZones[nr] || null;
}

/** Luminantie-check voor --on-primary (donkere tekst op lichte brand-kleur). */
export function isLichteKleur(hex: string): boolean {
    const h = hex.replace('#', '');
    if (!/^[0-9a-f]{6}$/i.test(h)) return false;
    const n = parseInt(h, 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return (0.299 * r + 0.587 * g + 0.114 * b) > 150;
}
