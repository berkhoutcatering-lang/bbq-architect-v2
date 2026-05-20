/**
 * Centrale formatters voor weergave in de UI.
 *
 * Bestond eerder niet — elk hub had zijn eigen `fmtEur` / inline
 * `toLocaleString('nl-NL', ...)`-aanroepen, met als gevolg dat €-bedragen
 * over hubs heen anders ge-rendered werden (`€ 1234,56` vs `€1.234,56`
 * vs `€ 1.234`). Deze module is de canonieke NL-formatter.
 *
 * Conventie (volgt Nederlandse standaard):
 *   - Punt als duizendtal-separator
 *   - Komma als decimaal-separator
 *   - Spatie na het €-symbool
 *   - 2 decimalen voor `formatEur`, 0 decimalen voor `formatEurInt`
 *
 * Server-side veilig: gebruikt `Intl.NumberFormat` die Node ondersteunt.
 */

const eurFormatter = new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
});

const eurIntFormatter = new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
});

/** Euro met 2 decimalen, NL-stijl: `€ 1.234,56`. Default voor alle bedragen. */
export function formatEur(value: number | null | undefined): string {
    const n = Number(value || 0);
    return eurFormatter.format(n);
}

/** Euro afgerond op hele euro's, NL-stijl: `€ 1.234`. Voor KPI's en grote bedragen. */
export function formatEurInt(value: number | null | undefined): string {
    const n = Math.round(Number(value || 0));
    return eurIntFormatter.format(n);
}

/** Getal met NL-thousand-separator + optionele decimalen: `1.234,5`. */
export function formatNumber(value: number | null | undefined, decimals = 0): string {
    const n = Number(value || 0);
    return n.toLocaleString('nl-NL', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    });
}

/** Kilometers: `1.234,5 km`. */
export function formatKm(value: number | null | undefined, decimals = 1): string {
    return formatNumber(value, decimals) + ' km';
}

/** Percentage met 1 decimaal: `12,5%`. */
export function formatPercent(value: number | null | undefined, decimals = 1): string {
    const n = Number(value || 0);
    return n.toLocaleString('nl-NL', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    }) + '%';
}
