/**
 * Kleine format-helpers voor Bonnenkistje-componenten.
 * Centraal zodat NL-locale consistent is.
 */

const eurFormatter = new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' });

export function fmtEur(n: number | null | undefined): string {
    return eurFormatter.format(Number(n ?? 0));
}

export function fmtDate(d: string | null | undefined): string {
    if (!d) return '—';
    try {
        return new Date(d).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch {
        return d;
    }
}

export function fmtDateShort(d: string | null | undefined): string {
    if (!d) return '—';
    try {
        return new Date(d).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
    } catch {
        return d;
    }
}

export function fmtDateTime(d: string | null | undefined): string {
    if (!d) return '—';
    try {
        return new Date(d).toLocaleString('nl-NL', { dateStyle: 'short', timeStyle: 'short' });
    } catch {
        return d;
    }
}

/** "Bewaard tot mei 2033" — Art. 52 AWR 7-jaar bewaarplicht display. */
export function fmtBewaardTot(createdAt: string | null | undefined): string {
    if (!createdAt) return '—';
    try {
        const d = new Date(createdAt);
        d.setFullYear(d.getFullYear() + 7);
        return d.toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' });
    } catch {
        return '—';
    }
}
