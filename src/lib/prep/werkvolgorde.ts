/**
 * werkvolgorde — de "beste route door de prep" als pure, uitlegbare logica.
 *
 * Drie ideeën van Mathijs (2026-06-12), allemaal datagedreven — geen AI:
 *  1. Bundeling: dezelfde component op dezelfde dag (over gerechten én events
 *     heen) is één werkblok — "de pot mayonaise is toch open".
 *  2. Volgorde: blokken chronologisch op scheduled_at; passieve fases
 *     (pekelen, marineren, roken) zijn wacht-blokken.
 *  3. Gat-vulling: tijdens een wacht-blok stellen we actieve taken voor die
 *     qua duur in de wachttijd passen, deadline-eerst.
 *
 * Hard rule: hoeveelheden komen uit de taken zelf (server-berekend);
 * deze module telt alleen op en sorteert. Elke suggestie draagt een
 * leesbare reden ("past in 90 min wachten") — Pillar #4: geen black box.
 */

import type { PrepTask } from '@/types/database.types';

/** Fases waar je op wácht in plaats van aan werkt. */
const PASSIVE_PHASES = new Set(['pekel', 'marinade', 'smoke']);

/** Default-duur (min) als een taak geen duration_min heeft. */
const DEFAULT_DURATION_MIN = 30;

export interface WerkBlok {
    /** Stabiele key voor React-rendering. */
    key: string;
    /** Bundel van 1..n taken — n>1 alleen bij gedeelde batch_key. */
    tasks: PrepTask[];
    /** Weergavetitel: component-naam bij bundel, anders taak-tekst. */
    titel: string;
    /** Geplande starttijd (vroegste van de bundel), ISO of null. */
    startISO: string | null;
    /** Werkduur in minuten — bij bundel: duur van 1× maken (batch-winst). */
    durationMin: number;
    /** Wacht-blok (pekel/marinade/smoke) — hier past gat-vulling. */
    isPassief: boolean;
    /** Som van target_qty over de bundel (zelfde unit), of null. */
    totalQty: number | null;
    totalUnit: string | null;
    /** Aantal events waar deze bundel voor werkt (>1 = cross-event batch). */
    eventIds: number[];
    /** Leesbare bundel-reden, alleen gezet bij n>1. */
    bundelReden?: string;
    /** Gat-vulling: actieve blokken die in dit wacht-blok passen. */
    ondertussen?: OndertussenSuggestie[];
}

export interface OndertussenSuggestie {
    blokKey: string;
    titel: string;
    durationMin: number;
    reden: string;
}

function taskDuration(t: PrepTask): number {
    const d = (t as PrepTask & { duration_min?: number | null }).duration_min;
    return typeof d === 'number' && d > 0 ? d : DEFAULT_DURATION_MIN;
}

function taskBatchKey(t: PrepTask): string | null {
    return (t as PrepTask & { batch_key?: string | null }).batch_key ?? null;
}

function isOpen(t: PrepTask): boolean {
    const s = t.status ?? 'planned';
    return s !== 'done' && s !== 'skipped';
}

/**
 * Bouw chronologische werkblokken uit losse taken:
 * bundel op batch_key, sorteer op starttijd, vul wacht-blokken met
 * passende actieve blokken (greedy, deadline-eerst).
 */
export function bouwWerkvolgorde(tasks: PrepTask[]): WerkBlok[] {
    const open = tasks.filter(isOpen);

    // 1. Bundelen op batch_key (cross-event en cross-gerecht)
    const byKey = new Map<string, PrepTask[]>();
    const singles: PrepTask[] = [];
    for (const t of open) {
        const bk = taskBatchKey(t);
        if (bk) {
            const arr = byKey.get(bk) ?? [];
            arr.push(t);
            byKey.set(bk, arr);
        } else {
            singles.push(t);
        }
    }

    const blokken: WerkBlok[] = [];

    for (const [bk, groep] of byKey) {
        const eerste = [...groep].sort(byScheduled)[0];
        const phase = eerste.phase ?? 'other';
        const eventIds = Array.from(new Set(groep.map((t) => t.event_id)));
        // Bundel-duur = 1× maken: de winst van batchen zit precies hier —
        // je zet één keer op en maakt de totale hoeveelheid in één run.
        const durationMin = Math.max(...groep.map(taskDuration));
        const qtys = groep.map((t) => t.target_qty).filter((q): q is number => typeof q === 'number');
        const units = new Set(groep.map((t) => t.target_unit).filter(Boolean));
        const sameUnit = units.size === 1;
        blokken.push({
            key: `batch:${bk}`,
            tasks: groep,
            titel: componentTitel(eerste),
            startISO: eerste.scheduled_at ?? null,
            durationMin,
            isPassief: PASSIVE_PHASES.has(phase),
            totalQty: sameUnit && qtys.length > 0 ? round2(qtys.reduce((a, b) => a + b, 0)) : null,
            totalUnit: sameUnit ? (groep[0].target_unit ?? null) : null,
            eventIds,
            bundelReden: groep.length > 1
                ? `${groep.length}× dezelfde component — in één batch maken scheelt ${groep.length - 1}× opzetten en schoonmaken`
                : undefined,
        });
    }

    for (const t of singles) {
        const phase = t.phase ?? 'other';
        blokken.push({
            key: `task:${t.id}`,
            tasks: [t],
            titel: t.text || 'Taak',
            startISO: t.scheduled_at ?? null,
            durationMin: taskDuration(t),
            isPassief: PASSIVE_PHASES.has(phase),
            totalQty: t.target_qty ?? null,
            totalUnit: t.target_unit ?? null,
            eventIds: [t.event_id],
        });
    }

    // 2. Chronologisch — blokken zonder tijd achteraan
    blokken.sort((a, b) => {
        if (a.startISO == null && b.startISO == null) return 0;
        if (a.startISO == null) return 1;
        if (b.startISO == null) return -1;
        return new Date(a.startISO).getTime() - new Date(b.startISO).getTime();
    });

    // 3. Gat-vulling: per wacht-blok actieve blokken zoeken die erin passen.
    //    Greedy op deadline (vroegste scheduled_at eerst), cumulatief tot de
    //    wachttijd vol is. Een actief blok wordt maar één keer voorgesteld.
    //    Alleen voor wachttijden ≤ 4 uur: bij een overnight-pekel sta je er
    //    niet bij — "ondertussen"-werk slaat dan nergens op.
    const MAX_VULBARE_WACHT_MIN = 240;
    const geclaimd = new Set<string>();
    for (const wacht of blokken) {
        if (!wacht.isPassief || wacht.startISO == null) continue;
        if (wacht.durationMin > MAX_VULBARE_WACHT_MIN) continue;
        const wachtStart = new Date(wacht.startISO).getTime();
        const wachtMin = wacht.durationMin;
        // Naar-voren-trekken mag binnen hetzelfde dagdeel (6 uur) — werk van
        // vanavond of morgen hoort niet in een ochtend-wachtblok.
        const horizonEind = wachtStart + 6 * 60 * 60_000;
        let restMin = wachtMin;
        const suggesties: OndertussenSuggestie[] = [];

        const kandidaten = blokken
            .filter((b) => !b.isPassief
                && !geclaimd.has(b.key)
                && b.key !== wacht.key
                && b.startISO != null
                // eerder gepland werk doe je sowieso eerst; later werk mag
                // naar voren getrokken worden zolang het dichtbij genoeg is
                && new Date(b.startISO).getTime() >= wachtStart
                && new Date(b.startISO).getTime() <= horizonEind)
            .sort(byBlokScheduled);

        for (const kandidaat of kandidaten) {
            if (kandidaat.durationMin > restMin) continue;
            geclaimd.add(kandidaat.key);
            suggesties.push({
                blokKey: kandidaat.key,
                titel: kandidaat.titel,
                durationMin: kandidaat.durationMin,
                reden: `past in de ${formatMin(wachtMin)} wachttijd`,
            });
            restMin -= kandidaat.durationMin;
            if (restMin < 10) break; // < 10 min over → niets zinnigs meer
        }
        if (suggesties.length > 0) wacht.ondertussen = suggesties;
    }

    return blokken;
}

function byScheduled(a: PrepTask, b: PrepTask): number {
    const ta = a.scheduled_at ? new Date(a.scheduled_at).getTime() : Infinity;
    const tb = b.scheduled_at ? new Date(b.scheduled_at).getTime() : Infinity;
    return ta - tb;
}

function byBlokScheduled(a: WerkBlok, b: WerkBlok): number {
    const ta = a.startISO ? new Date(a.startISO).getTime() : Infinity;
    const tb = b.startISO ? new Date(b.startISO).getTime() : Infinity;
    return ta - tb;
}

/** "Mayonaise basis — Sliders + Taco" → "Mayonaise basis" als bundeltitel. */
function componentTitel(t: PrepTask): string {
    const text = t.text || 'Component';
    const idx = text.indexOf(' — ');
    return idx > 0 ? text.slice(0, idx) : text;
}

function round2(n: number): number {
    return Math.round(n * 100) / 100;
}

export function formatMin(min: number): string {
    if (min < 60) return `${min} min`;
    const h = Math.floor(min / 60);
    const m = min % 60;
    return m === 0 ? `${h} uur` : `${h}u${String(m).padStart(2, '0')}`;
}
