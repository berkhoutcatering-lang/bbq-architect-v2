/**
 * Validators voor de partij-routes. Zelfde vorm als src/lib/prep/validators.ts.
 *
 * Let op wat hier NIET in zit: een labelaantal. Het aantal eenheden mag de
 * kok corrigeren (productiewaarheid), labels volgen daaruit.
 */

import { EENHEDEN, type Eenheid } from './eenheden';

export type ValidatorResult<T> = { ok: true; data: T } | { ok: false; error: string };

function isUuid(v: unknown): v is string {
    return typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}
function isPosInt(v: unknown): v is number {
    return typeof v === 'number' && Number.isInteger(v) && v > 0;
}
function isIsoDatum(v: unknown): v is string {
    return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

export interface PartijBlok {
    idempotencyKey: string;
    actualQty: number;
    eenheid: Eenheid;
    verpakkingGrootte: number | null;
    verpakkingEenheid: Eenheid | null;
    aantalEenheden: number | null;
    tht: string | null;
    bewaarmethode: 'vers' | 'vries' | 'houdbaar' | null;
    bewaaradvies: string | null;
    opslagLocatieId: string | null;
    kernTempC: number | null;
    notitie: string | null;
}

/**
 * Het partij-blok zoals de afrond-sheet het stuurt — los bruikbaar
 * (complete-task) of als hele body (partij-afronden).
 */
export function validatePartijBlok(b: unknown): ValidatorResult<PartijBlok> {
    if (typeof b !== 'object' || b === null) return { ok: false, error: 'partij-blok verplicht' };
    const p = b as Record<string, unknown>;
    if (!isUuid(p.idempotencyKey)) return { ok: false, error: 'idempotencyKey (uuid) is verplicht' };
    if (typeof p.actualQty !== 'number' || !Number.isFinite(p.actualQty) || p.actualQty <= 0 || p.actualQty > 100000) {
        return { ok: false, error: 'Gemaakte hoeveelheid moet groter dan nul zijn' };
    }
    if (!EENHEDEN.includes(p.eenheid as Eenheid)) return { ok: false, error: 'Onbekende eenheid' };

    let verpakkingGrootte: number | null = null;
    let verpakkingEenheid: Eenheid | null = null;
    if (p.verpakkingGrootte != null) {
        if (typeof p.verpakkingGrootte !== 'number' || !(p.verpakkingGrootte > 0)) return { ok: false, error: 'Verpakking moet groter dan nul zijn' };
        if (!EENHEDEN.includes(p.verpakkingEenheid as Eenheid)) return { ok: false, error: 'Verpakkingseenheid ontbreekt' };
        verpakkingGrootte = p.verpakkingGrootte;
        verpakkingEenheid = p.verpakkingEenheid as Eenheid;
    }
    let aantalEenheden: number | null = null;
    if (p.aantalEenheden != null) {
        if (!isPosInt(p.aantalEenheden) || p.aantalEenheden > 500) return { ok: false, error: 'Aantal eenheden moet tussen 1 en 500 liggen' };
        aantalEenheden = p.aantalEenheden;
    }
    let tht: string | null = null;
    if (p.tht != null && p.tht !== '') {
        if (!isIsoDatum(p.tht)) return { ok: false, error: 'THT moet JJJJ-MM-DD zijn' };
        tht = p.tht;
    }
    let bewaarmethode: PartijBlok['bewaarmethode'] = null;
    if (p.bewaarmethode != null && p.bewaarmethode !== '') {
        if (p.bewaarmethode !== 'vers' && p.bewaarmethode !== 'vries' && p.bewaarmethode !== 'houdbaar') return { ok: false, error: 'Onbekende bewaarmethode' };
        bewaarmethode = p.bewaarmethode;
    }
    const bewaaradvies = typeof p.bewaaradvies === 'string' && p.bewaaradvies.trim() ? p.bewaaradvies.trim().slice(0, 60) : null;
    let opslagLocatieId: string | null = null;
    if (p.opslagLocatieId != null && p.opslagLocatieId !== '') {
        if (!isUuid(p.opslagLocatieId)) return { ok: false, error: 'opslagLocatieId ongeldig' };
        opslagLocatieId = p.opslagLocatieId;
    }
    let kernTempC: number | null = null;
    if (p.kernTempC != null) {
        if (typeof p.kernTempC !== 'number' || !Number.isFinite(p.kernTempC) || p.kernTempC < -50 || p.kernTempC > 300) return { ok: false, error: 'Kerntemperatuur ongeldig' };
        kernTempC = Math.round(p.kernTempC * 10) / 10;
    }
    const notitie = typeof p.notitie === 'string' && p.notitie.trim() ? p.notitie.trim().slice(0, 300) : null;

    return { ok: true, data: { idempotencyKey: p.idempotencyKey, actualQty: p.actualQty, eenheid: p.eenheid as Eenheid, verpakkingGrootte, verpakkingEenheid, aantalEenheden, tht, bewaarmethode, bewaaradvies, opslagLocatieId, kernTempC, notitie } };
}

export type PartijAfrondenInput =
    | ({ bron: 'prep_task'; prepTaskId: number } & PartijBlok)
    | ({ bron: 'mep_item'; mepItemId: number } & PartijBlok)
    | ({ bron: 'los'; componentId: number; eventId: number | null } & PartijBlok);

/** Body van POST /api/productie/partij-afronden: waar komt het vandaan + het blok. */
export function validatePartijAfronden(body: unknown): ValidatorResult<PartijAfrondenInput> {
    if (typeof body !== 'object' || body === null) return { ok: false, error: 'Body verplicht' };
    const b = body as Record<string, unknown>;
    const blok = validatePartijBlok(b);
    if (blok.ok === false) return blok;

    if (isPosInt(b.prepTaskId)) return { ok: true, data: { bron: 'prep_task', prepTaskId: b.prepTaskId, ...blok.data } };
    if (isPosInt(b.mepItemId)) return { ok: true, data: { bron: 'mep_item', mepItemId: b.mepItemId, ...blok.data } };
    if (isPosInt(b.componentId)) {
        const eventId = b.eventId == null ? null : (isPosInt(b.eventId) ? b.eventId : NaN);
        if (Number.isNaN(eventId)) return { ok: false, error: 'eventId ongeldig' };
        return { ok: true, data: { bron: 'los', componentId: b.componentId, eventId: eventId as number | null, ...blok.data } };
    }
    return { ok: false, error: 'prepTaskId, mepItemId of componentId is verplicht' };
}

export interface VerbruikInput {
    reden: 'verbruikt' | 'afgeschreven' | 'verkocht';
    eventId: number | null;
    notitie: string | null;
}

export function validateVerbruik(body: unknown): ValidatorResult<VerbruikInput> {
    if (typeof body !== 'object' || body === null) return { ok: false, error: 'Body verplicht' };
    const b = body as Record<string, unknown>;
    const reden = b.reden ?? 'verbruikt';
    if (reden !== 'verbruikt' && reden !== 'afgeschreven' && reden !== 'verkocht') return { ok: false, error: 'Onbekende reden' };
    const eventId = b.eventId == null ? null : (isPosInt(b.eventId) ? b.eventId : NaN);
    if (Number.isNaN(eventId)) return { ok: false, error: 'eventId ongeldig' };
    const notitie = typeof b.notitie === 'string' && b.notitie.trim() ? b.notitie.trim().slice(0, 300) : null;
    return { ok: true, data: { reden, eventId: eventId as number | null, notitie } };
}
