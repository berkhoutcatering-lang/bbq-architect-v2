/**
 * De uitkomst van de logica achter een Toonbank-route: een antwoord, of een
 * fout uit contract §3.2. De route (guard.ts) maakt er een HTTP-antwoord van:
 * status uit FOUT_STATUS, body {fout: {code, melding, details}}.
 */
import type { FoutCode } from './contract';

export type Uitkomst<T> =
    | { ok: true; body: T; status?: number }
    | { ok: false; code: FoutCode; melding: string; details: Record<string, unknown> };

export function gelukt<T>(body: T, status?: number): Uitkomst<T> {
    return status ? { ok: true, body, status } : { ok: true, body };
}

export function mislukt<T = never>(code: FoutCode, melding: string, details: Record<string, unknown> = {}): Uitkomst<T> {
    return { ok: false, code, melding, details };
}
