/* runner-core — de PURE beslislogica van de hervatbare jobrunner.
 *
 * Geen chrome.*, geen fetch, geen netwerk: alleen "gegeven deze serverstatus +
 * preflight, wat is de volgende stap?". Zo is het hervat-/crashgedrag
 * deterministisch testbaar (vitest importeert dit bestand rechtstreeks).
 *
 * De server is de bron van waarheid (ADR-2). De runner doet per wake-up hooguit
 * één begrensde stap; deze module zegt WELKE stap, de glue (jobrunner.js) voert
 * hem uit met chrome-API's.
 */

export const RUN_ACTIVE_STATES = ['running', 'paused', 'paused_needs_login', 'paused_rate_limited'];
export const RUN_TERMINAL_STATES = ['completed', 'partial', 'failed', 'cancelled'];

/**
 * Bepaalt de volgende stap. Alle velden optioneel zodat partiële state (bv.
 * alleen {hasActiveRunId:false}) geldig is.
 * @param {{hasActiveRunId?:boolean, run?:any, preflight?:{ok?:boolean, code?:string}, originOk?:boolean}} state
 * @returns {{action:string, reason:string}}
 *   action ∈ 'idle'|'claim'|'complete'|'resume'|'pause_needs_login'|'stop'|'wrong_site'
 */
export function decideNextAction(state) {
    if (!state.hasActiveRunId) return { action: 'idle', reason: 'geen actieve run' };
    if (!state.run) return { action: 'idle', reason: 'serverstatus onbekend' };

    const status = state.run.status;
    if (RUN_TERMINAL_STATES.includes(status)) return { action: 'stop', reason: `run ${status}` };
    if (status === 'paused' || status === 'paused_rate_limited') return { action: 'idle', reason: `gepauzeerd (${status})` };

    // Origin/login zijn harde randvoorwaarden voor werk doen.
    if (!state.originOk) return { action: 'wrong_site', reason: 'tab-origin matcht leverancier niet' };
    if (state.preflight && state.preflight.ok === false) {
        return { action: 'pause_needs_login', reason: state.preflight.code || 'LOGIN_REQUIRED' };
    }
    if (status === 'paused_needs_login') {
        // Login is inmiddels ok (preflight ok hierboven) → runner mag resumen.
        return { action: 'resume', reason: 'login hersteld' };
    }

    if (status === 'running') {
        if (allTasksDone(state.run)) return { action: 'complete', reason: 'geen open taken meer' };
        return { action: 'claim', reason: 'volgende taak claimen' };
    }
    return { action: 'idle', reason: `onbekende status ${status}` };
}

/** Alle taken afgerond? (server telt; runner beslist niet zelf 'completed'). */
export function allTasksDone(run) {
    if (!run) return false;
    const total = num(run.tasks_total);
    if (total === 0) return false; // nog geen taken ontdekt → niet compleet
    const done = num(run.tasks_done);
    const failed = num(run.tasks_failed);
    return done + failed >= total;
}

/** Reconciliatie-invarianten (briefing §19). */
export function reconcile(run) {
    const issues = [];
    if (!run) return { ok: false, issues: ['geen run'] };
    const seen = num(run.products_seen);
    const acc = num(run.observations_accepted);
    const quar = num(run.observations_quarantined);
    const rej = num(run.observations_rejected);
    if (seen !== acc + quar + rej) {
        issues.push(`observations_seen(${seen}) != accepted+quarantined+rejected(${acc + quar + rej})`);
    }
    return { ok: issues.length === 0, issues };
}

/** Exponential backoff met jitter (rand injecteerbaar voor tests). */
export function computeBackoffMs(attempt, rand = Math.random) {
    const base = Math.min(30_000, 500 * Math.pow(2, Math.max(0, attempt)));
    const jitter = Math.floor(rand() * Math.min(1000, base * 0.25));
    return base + jitter;
}

/** Interval tussen wake-ups op basis van resterend werk (alarms zijn grofmazig). */
export function nextWakeupMinutes(state) {
    if (!state.hasActiveRunId || !state.run) return 0; // geen periodieke wake nodig
    if (RUN_TERMINAL_STATES.includes(state.run.status)) return 0;
    if (state.run.status === 'running') return 0.5; // 30s minimum alarm-interval van Chrome
    return 1; // gepauzeerd → rustiger pollen
}

function num(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
}
