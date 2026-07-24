/* adapters/types — het uitvoerbare adaptercontract (briefing §9).
 *
 * Een adapter is een echte module met een vast contract, versie en tests — geen
 * losse selector-hint zoals in de oude adapters.js. Elke adapter implementeert:
 *
 *   key: string                 stabiele sleutel ('baktotaal')
 *   version: string             semver, voor reproduceerbaarheid + health
 *   displayName: string
 *   origins: string[]           toegestane origins
 *   matches(url): boolean
 *   preflight(ctx): Promise<PreflightResult>
 *   discover(ctx): Promise<DiscoveredTask[]>
 *   fetchTask(ctx, task): Promise<AdapterTaskResult>
 *   normalize(raw, ctx): Observation[]     ← PUUR, geen netwerk, fixture-testbaar
 *
 * ctx (AdapterContext) krijgt geïnjecteerde capabilities zodat adapters testbaar
 * zijn zonder chrome.*:
 *   ctx.origin, ctx.supplierId, ctx.supplierAccountKey, ctx.adapterKey,
 *   ctx.adapterVersion, ctx.taxMode, ctx.vatPct, ctx.capturedAt
 *   ctx.fetchJson(url, opts) : Promise<any>     same-origin, credentialed
 *   ctx.fetchText(url, opts) : Promise<string>  HTML (DOM-fallback)
 *   ctx.parseHtml(html, selectors) : record[]   via offscreen (heeft DOM)
 *
 * PreflightResult:
 *   { ok, code?, origin, loggedIn, personalPricesVisible, currency, taxMode,
 *     accountKeyMasked, adapterVersion, sample: Observation[] }
 * DiscoveredTask:
 *   { idempotencyKey, taskType, sourceUrl?, sourceCursor?, payload?, priority? }
 * AdapterTaskResult:
 *   { records: any[], nextTasks: DiscoveredTask[], diagnostics: {durationMs, httpStatus},
 *     errorCode?: string }
 */

const REQUIRED = ['key', 'version', 'displayName', 'origins', 'matches', 'preflight', 'discover', 'fetchTask', 'normalize'];

/** Valideer dat een object het adaptercontract nakomt (dev-guard). */
export function assertAdapter(a) {
    for (const k of REQUIRED) {
        if (!(k in a)) throw new Error(`Adapter mist verplicht veld: ${k}`);
    }
    const fns = ['matches', 'preflight', 'discover', 'fetchTask', 'normalize'];
    for (const f of fns) {
        if (typeof a[f] !== 'function') throw new Error(`Adapter.${f} moet een functie zijn`);
    }
    if (!Array.isArray(a.origins) || a.origins.length === 0) throw new Error('Adapter.origins vereist');
    return true;
}

/** Standaard foutcodes die adapters mogen teruggeven (subset van §19). */
export const ADAPTER_ERROR = {
    WRONG_ORIGIN: 'WRONG_ORIGIN',
    LOGIN_REQUIRED: 'LOGIN_REQUIRED',
    PERSONAL_PRICE_NOT_VISIBLE: 'PERSONAL_PRICE_NOT_VISIBLE',
    RATE_LIMITED: 'SUPPLIER_RATE_LIMITED',
    BLOCKED: 'SUPPLIER_BLOCKED',
    TIMEOUT: 'SUPPLIER_TIMEOUT',
    RESPONSE_CHANGED: 'ADAPTER_RESPONSE_CHANGED',
    PARSE_FAILED: 'ADAPTER_PARSE_FAILED',
};
