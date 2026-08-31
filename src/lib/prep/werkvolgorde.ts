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
 * Golf 2 (2026-08-31) heeft daar drie dingen aan toegevoegd, allemaal uit
 * `recipe_steps` via de kolommen die migratie 20260901030000 heeft aangelegd:
 *
 *  4. Handtijd naast wachttijd. Tot nu toe had een taak één `duration_min` en
 *     werd "is dit wachten?" geraden uit de fase-naam — een lijst van drie.
 *     Deeg laten rijzen viel daarbuiten en telde als handwerk. Nu staat het in
 *     de taak zelf, en een blok kan allebei zijn: een kwartier opstoken gevolgd
 *     door vier uur wachten. De gat-vulling kijkt naar de wachttijd, en of een
 *     klus daarin past hangt af van zijn hándtijd — niet van zijn doorlooptijd.
 *  5. `prep_group` bundelt dezelfde bewerking over recépten heen. `batch_key`
 *     bundelt dezelfde component over évents heen. Dat zijn twee verschillende
 *     vragen en ze bestaan naast elkaar.
 *  6. `plaats` — thuis, bus of locatie. Blokken van verschillende plaatsen
 *     gaan nooit in één bundel, en werk op locatie wordt niet voorgesteld als
 *     vulling van een wachtmoment thuis. Je staat op één plek tegelijk.
 *
 * Hard rule: hoeveelheden komen uit de taken zelf (server-berekend);
 * deze module telt alleen op en sorteert. Elke suggestie draagt een
 * leesbare reden ("past in 90 min wachten") — Pillar #4: geen black box.
 */

import type { PrepTask } from '@/types/database.types';
import { normaliseerPlaats, type Plaats } from './stapPlanning';

/**
 * Fases waar je op wácht in plaats van aan werkt.
 *
 * Alleen nog de terugval voor taken van vóór golf 2, die één `duration_min`
 * hebben en geen splitsing. Zodra een taak duur_actief_min of duur_passief_min
 * draagt wordt deze lijst niet meer geraadpleegd.
 */
const PASSIVE_PHASES = new Set(['pekel', 'marinade', 'smoke']);

/** Default-duur (min) als een taak helemaal geen duur draagt. */
const DEFAULT_DURATION_MIN = 30;

export interface WerkBlok {
    /** Stabiele key voor React-rendering. */
    key: string;
    /** Bundel van 1..n taken — n>1 alleen bij gedeelde bundelsleutel. */
    tasks: PrepTask[];
    /** Weergavetitel: component-naam bij bundel, anders taak-tekst. */
    titel: string;
    /** Geplande starttijd (vroegste van de bundel), ISO of null. */
    startISO: string | null;
    /** Totale blokduur (handtijd + wachttijd) — bij bundel: 1× maken. */
    durationMin: number;
    /** Handtijd: hier kost het blok een persoon. */
    actiefMin: number;
    /** Wachttijd: hier kost het blok een apparaat en geen persoon. */
    passiefMin: number;
    /** false = de duur is een terugval, niet iets wat iemand heeft opgeschreven. */
    duurBekend: boolean;
    /** Wacht-blok — hier past gat-vulling. */
    isPassief: boolean;
    /** Waar dit blok gebeurt; null als geen enkele taak het zegt. */
    plaats: Plaats | null;
    /** De bewerking die dit blok bundelt, als het op prep_group gebundeld is. */
    prepGroup: string | null;
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

export interface TaakDuur {
    actiefMin: number;
    passiefMin: number;
    /** false = niemand heeft dit opgeschreven; het scherm mag geen getal claimen. */
    bekend: boolean;
}

/**
 * Handtijd en wachttijd van één taak, met drie bronnen in volgorde van gezag:
 *
 *  1. De splitsing uit de receptstap. Die weet het echt.
 *  2. De oude `duration_min`, verdeeld op de fase-naam. Een smoke-taak van
 *     twaalf uur is twaalf uur wachten, een koud-taak van een uur is een uur
 *     werk. Grof, maar het is wat we tot golf 2 hadden.
 *  3. Niets — dan een halfuur handwerk, en `bekend: false` zodat het scherm
 *     dat als terugval kan tonen in plaats van als feit.
 */
export function taakDuur(t: PrepTask): TaakDuur {
    const actief = eindigGetal(t.duur_actief_min);
    const passief = eindigGetal(t.duur_passief_min);
    if (actief !== null || passief !== null) {
        return { actiefMin: actief ?? 0, passiefMin: passief ?? 0, bekend: true };
    }

    const d = eindigGetal(t.duration_min);
    if (d !== null && d > 0) {
        const wacht = PASSIVE_PHASES.has(t.phase ?? 'other');
        return { actiefMin: wacht ? 0 : d, passiefMin: wacht ? d : 0, bekend: true };
    }

    return { actiefMin: DEFAULT_DURATION_MIN, passiefMin: 0, bekend: false };
}

/**
 * Bouw chronologische werkblokken uit losse taken:
 * bundel op sleutel, sorteer op starttijd, vul wacht-blokken met
 * passende actieve blokken (greedy, deadline-eerst).
 */
export function bouwWerkvolgorde(tasks: PrepTask[]): WerkBlok[] {
    const open = tasks.filter(isOpen);

    // 1. Bundelen — op component (batch_key) of op bewerking (prep_group),
    //    en nooit over plaatsen heen.
    const byKey = new Map<string, PrepTask[]>();
    const singles: PrepTask[] = [];
    for (const t of open) {
        const bk = bundelSleutel(t);
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
        const eventIds = Array.from(new Set(groep.map((t) => t.event_id)));
        // Bundel-duur = 1× maken: de winst van batchen zit precies hier —
        // je zet één keer op en maakt de totale hoeveelheid in één run.
        const duren = groep.map(taakDuur);
        const actiefMin = Math.max(...duren.map((d) => d.actiefMin));
        const passiefMin = Math.max(...duren.map((d) => d.passiefMin));
        const qtys = groep.map((t) => t.target_qty).filter((q): q is number => typeof q === 'number');
        const units = new Set(groep.map((t) => t.target_unit).filter(Boolean));
        const sameUnit = units.size === 1;
        const opGroep = bk.startsWith('groep:');
        const prepGroup = groep.find((t) => t.prep_group)?.prep_group ?? null;
        blokken.push({
            key: `batch:${bk}`,
            tasks: groep,
            titel: opGroep ? bewerkingTitel(prepGroup, eerste) : componentTitel(eerste),
            startISO: eerste.scheduled_at ?? null,
            durationMin: actiefMin + passiefMin,
            actiefMin,
            passiefMin,
            duurBekend: duren.every((d) => d.bekend),
            isPassief: passiefMin > 0,
            plaats: blokPlaats(groep),
            prepGroup: opGroep ? prepGroup : null,
            totalQty: sameUnit && qtys.length > 0 ? round2(qtys.reduce((a, b) => a + b, 0)) : null,
            totalUnit: sameUnit ? (groep[0].target_unit ?? null) : null,
            eventIds,
            bundelReden: groep.length > 1 ? bundelReden(groep.length, opGroep, prepGroup) : undefined,
        });
    }

    for (const t of singles) {
        const d = taakDuur(t);
        blokken.push({
            key: `task:${t.id}`,
            tasks: [t],
            titel: t.text || 'Taak',
            startISO: t.scheduled_at ?? null,
            durationMin: d.actiefMin + d.passiefMin,
            actiefMin: d.actiefMin,
            passiefMin: d.passiefMin,
            duurBekend: d.bekend,
            isPassief: d.passiefMin > 0,
            plaats: blokPlaats([t]),
            prepGroup: null,
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
    //
    //    Sinds golf 2 wordt de wáchttijd van het blok gevuld (niet de hele
    //    doorlooptijd) met de hándtijd van de kandidaat (niet zijn doorloop).
    //    Anders past een klus van 20 minuten werk plus twee uur koelen niet in
    //    een wachtmoment van een uur, terwijl je hem er prima in doet.
    const MAX_VULBARE_WACHT_MIN = 240;
    const geclaimd = new Set<string>();
    for (const wacht of blokken) {
        if (!wacht.isPassief || wacht.startISO == null) continue;
        if (wacht.passiefMin > MAX_VULBARE_WACHT_MIN) continue;
        const wachtStart = new Date(wacht.startISO).getTime();
        const wachtMin = wacht.passiefMin;
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
                // Je staat op één plek tegelijk: werk op locatie vult geen
                // wachtmoment in de keuken thuis.
                && plaatsenBotsenNiet(wacht.plaats, b.plaats)
                // eerder gepland werk doe je sowieso eerst; later werk mag
                // naar voren getrokken worden zolang het dichtbij genoeg is
                && new Date(b.startISO).getTime() >= wachtStart
                && new Date(b.startISO).getTime() <= horizonEind)
            .sort(byBlokScheduled);

        for (const kandidaat of kandidaten) {
            if (kandidaat.actiefMin > restMin) continue;
            geclaimd.add(kandidaat.key);
            suggesties.push({
                blokKey: kandidaat.key,
                titel: kandidaat.titel,
                durationMin: kandidaat.actiefMin,
                reden: `past in de ${formatMin(wachtMin)} wachttijd`,
            });
            restMin -= kandidaat.actiefMin;
            if (restMin < 10) break; // < 10 min over → niets zinnigs meer
        }
        if (suggesties.length > 0) wacht.ondertussen = suggesties;
    }

    return blokken;
}

export interface PlaatsBudget {
    actiefMin: number;
    passiefMin: number;
    blokken: number;
    /** Blokken waarvan de duur een terugval is en geen opgeschreven getal. */
    geschat: number;
}

/**
 * Hoeveel handwerk staat er thuis, in de bus en op locatie?
 *
 * De vraag waar het onderscheid voor bestaat. Vier uur handwerk thuis is een
 * ochtend; veertig minuten handwerk op locatie is het verschil tussen op tijd
 * uitserveren en tachtig mensen laten wachten. Wachttijd telt apart, want daar
 * hoeft niemand bij te staan.
 *
 * Blokken zonder plaats (alles van vóór golf 2) vallen buiten deze telling in
 * plaats van bij `thuis` te worden opgeteld — anders zou een oude taak een
 * budget vullen waar niemand hem heeft neergezet.
 */
export function budgetPerPlaats(blokken: WerkBlok[]): Record<Plaats, PlaatsBudget> {
    const leeg = (): PlaatsBudget => ({ actiefMin: 0, passiefMin: 0, blokken: 0, geschat: 0 });
    const uit: Record<Plaats, PlaatsBudget> = { thuis: leeg(), bus: leeg(), locatie: leeg() };
    for (const b of blokken) {
        if (b.plaats == null) continue;
        const t = uit[b.plaats];
        t.blokken++;
        t.actiefMin += b.actiefMin;
        t.passiefMin += b.passiefMin;
        if (!b.duurBekend) t.geschat++;
    }
    return uit;
}

/* ─── Bundelen ────────────────────────────────────────────────── */

/**
 * De sleutel waarop taken samengevoegd worden, of null als de taak alleen staat.
 *
 * `batch_key` gaat voor: die is bij het plannen gezet en draagt de datum al.
 * Daaronder `prep_group` plus de dag waarop de taak staat — dezelfde bewerking
 * op dezelfde dag is één keer het mes pakken.
 *
 * De plaats hangt er als achtervoegsel aan zodra hij bekend is, zodat "sjalot
 * snipperen thuis" en "sjalot snipperen op locatie" nooit in één bundel vallen.
 * Taken van vóór golf 2 hebben geen plaats en houden dus exact hun oude sleutel.
 */
function bundelSleutel(t: PrepTask): string | null {
    const basis = t.batch_key ?? prepGroupSleutel(t);
    if (!basis) return null;
    return t.plaats ? `${basis}@${t.plaats}` : basis;
}

function prepGroupSleutel(t: PrepTask): string | null {
    const g = (t.prep_group ?? '').trim().toLowerCase();
    if (!g) return null;
    const dag = (t.scheduled_at ?? '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dag)) return null;
    return `groep:${g}:${dag}`;
}

function bundelReden(aantal: number, opGroep: boolean, prepGroup: string | null): string {
    if (opGroep) {
        const wat = prepGroup ? `dezelfde bewerking (${prepGroup})` : 'dezelfde bewerking';
        return `${aantal}× ${wat} — in één keer doen scheelt ${aantal - 1}× opnieuw opzetten`;
    }
    return `${aantal}× dezelfde component — in één batch maken scheelt ${aantal - 1}× opzetten en schoonmaken`;
}

/** Eén plaats voor het hele blok, of null als de taken het niet zeggen. */
function blokPlaats(groep: PrepTask[]): Plaats | null {
    const eerste = groep.find((t) => t.plaats);
    return eerste?.plaats ? normaliseerPlaats(eerste.plaats) : null;
}

/** Onbekende plaats botst met niets — anders zou oud werk nooit meer vullen. */
function plaatsenBotsenNiet(a: Plaats | null, b: Plaats | null): boolean {
    return a == null || b == null || a === b;
}

/* ─── Helpers ─────────────────────────────────────────────────── */

function isOpen(t: PrepTask): boolean {
    const s = t.status ?? 'planned';
    return s !== 'done' && s !== 'skipped';
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

/**
 * Bij een bewerkings-bundel is de groepsnaam de titel: je snippert sjalot, niet
 * "Salade — snijd sjalot". De losse taken staan er als subregels onder.
 */
function bewerkingTitel(prepGroup: string | null, eerste: PrepTask): string {
    if (!prepGroup) return componentTitel(eerste);
    return prepGroup.charAt(0).toUpperCase() + prepGroup.slice(1);
}

function eindigGetal(v: unknown): number | null {
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) return null;
    return v;
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
