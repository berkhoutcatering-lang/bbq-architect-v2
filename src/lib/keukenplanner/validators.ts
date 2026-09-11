/**
 * Validators voor de /api/productie/*-routes.
 *
 * Volgt het patroon dat de rest van deze codebase gebruikt:
 * `{ ok: true, data }` of `{ ok: false, error }`, zonder Zod. Consistent
 * blijven is hier meer waard dan de mooiste bibliotheek.
 */

export type Validatie<T> = { ok: true; data: T } | { ok: false; error: string };

export interface KloptNietInvoer {
    taakId: number;
    werkelijkeMin: number;
    hoeveelheid?: number | null;
    onderbroken: boolean;
}

export interface VerstoringInvoer {
    materieelId: number;
    /** ISO-tijdstip tot wanneer het apparaat weg is. Leeg = nader order. */
    totMoment?: string | null;
    reden?: string | null;
}

export interface MeethistorieResetInvoer {
    reden: string;
    /** Alleen deze stappen terugzetten. Leeg = alles van de organisatie. */
    recipeStepIds?: string[];
}

function isPositiefGeheel(v: unknown): v is number {
    return typeof v === 'number' && Number.isInteger(v) && v > 0;
}

function isPositiefGetal(v: unknown): v is number {
    return typeof v === 'number' && Number.isFinite(v) && v > 0;
}

export function valideerKloptNiet(body: unknown): Validatie<KloptNietInvoer> {
    if (body == null || typeof body !== 'object') return { ok: false, error: 'Geen body' };
    const b = body as Record<string, unknown>;

    if (!isPositiefGeheel(b.taakId)) return { ok: false, error: 'taakId moet een positief geheel getal zijn' };
    if (!isPositiefGetal(b.werkelijkeMin)) return { ok: false, error: 'werkelijkeMin moet groter dan nul zijn' };
    /* Een werkdag van meer dan zestien uur is geen taak maar een vergeten
       stopknop. Die meting zou de mediaan jarenlang vervuilen. */
    if (b.werkelijkeMin > 16 * 60) return { ok: false, error: 'werkelijkeMin lijkt geen taakduur (meer dan 16 uur)' };
    if (b.hoeveelheid != null && !isPositiefGetal(b.hoeveelheid)) {
        return { ok: false, error: 'hoeveelheid moet groter dan nul zijn' };
    }

    return {
        ok: true,
        data: {
            taakId: b.taakId,
            werkelijkeMin: b.werkelijkeMin,
            hoeveelheid: (b.hoeveelheid as number) ?? null,
            onderbroken: b.onderbroken === true,
        },
    };
}

export function valideerVerstoring(body: unknown): Validatie<VerstoringInvoer> {
    if (body == null || typeof body !== 'object') return { ok: false, error: 'Geen body' };
    const b = body as Record<string, unknown>;

    if (!isPositiefGeheel(b.materieelId)) return { ok: false, error: 'materieelId moet een positief geheel getal zijn' };
    if (b.totMoment != null) {
        if (typeof b.totMoment !== 'string' || Number.isNaN(Date.parse(b.totMoment))) {
            return { ok: false, error: 'totMoment moet een geldig tijdstip zijn' };
        }
    }
    if (b.reden != null && typeof b.reden !== 'string') return { ok: false, error: 'reden moet tekst zijn' };

    return {
        ok: true,
        data: {
            materieelId: b.materieelId,
            totMoment: (b.totMoment as string) ?? null,
            reden: (b.reden as string) ?? null,
        },
    };
}

export function valideerMeethistorieReset(body: unknown): Validatie<MeethistorieResetInvoer> {
    if (body == null || typeof body !== 'object') return { ok: false, error: 'Geen body' };
    const b = body as Record<string, unknown>;

    /* De reden is verplicht en dat is geen formaliteit: zonder reden weet je
       over een jaar niet meer waarom de teller op nul ging, en dan is de
       breuk in de historie onverklaarbaar geworden. */
    if (typeof b.reden !== 'string' || b.reden.trim().length < 3) {
        return { ok: false, error: 'Geef een reden op — zonder reden is de breuk later niet meer te verklaren' };
    }

    let ids: string[] | undefined;
    if (b.recipeStepIds != null) {
        if (!Array.isArray(b.recipeStepIds) || b.recipeStepIds.some((v) => typeof v !== 'string')) {
            return { ok: false, error: 'recipeStepIds moet een lijst met ids zijn' };
        }
        ids = b.recipeStepIds as string[];
    }

    return { ok: true, data: { reden: b.reden.trim(), recipeStepIds: ids } };
}
