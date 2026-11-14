import { formatEur } from '@/lib/format';

/** Centen als bedrag: `€ 1.234,56`. Een min staat vóór het euroteken. */
export function euro(cents: number): string {
    return cents < 0 ? `− ${formatEur(-cents / 100)}` : formatEur(cents / 100);
}

/** 'za 28 nov' */
export function korteDag(datum: string): string {
    return new Date(`${datum}T12:00:00Z`).toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}

/** 'zaterdag 28 november' */
export function langeDag(datum: string): string {
    return new Date(`${datum}T12:00:00Z`).toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
}

/** '18:07' in Nederlandse tijd. */
export function tijd(iso: string): string {
    return new Date(iso).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Amsterdam' });
}

/** Het aantal met het juiste woord: `1 bon`, `3 bonnen`. */
export function aantal(n: number, een: string, meer: string): string {
    return `${n} ${n === 1 ? een : meer}`;
}

/** Eerste letter groot: 'zaterdag 28 november' → 'Zaterdag 28 november'. */
export function hoofdletter(tekst: string): string {
    return tekst.charAt(0).toUpperCase() + tekst.slice(1);
}
