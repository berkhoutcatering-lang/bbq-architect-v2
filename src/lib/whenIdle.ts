/* Bijzaken (tellers, nieuws, hulp-artikelen) pas ophalen als de browser even
   niets te doen heeft. Anders gaan ze tegelijk met de vragen van de pagina
   zelf de deur uit en concurreren ze om dezelfde verbinding (meting
   2026-10-20). Geeft een opruimfunctie terug voor in een useEffect. */
type IdleWindow = Window & {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
    cancelIdleCallback?: (id: number) => void;
};

export function whenIdle(cb: () => void, timeoutMs = 2000, minDelayMs = 1200): () => void {
    if (typeof window === 'undefined') return function () { /* niets */ };
    const w = window as IdleWindow;
    let cancelled = false;
    let idleId: number | null = null;
    const run = function () { if (!cancelled) cb(); };
    /* Eerst een vaste wachttijd: "de browser doet even niets" gebeurt ook
       terwijl het JavaScript van de pagina nog binnenkomt. Dan gingen de
       bijzaken alsnog vóór de vragen van de pagina zelf (gemeten op
       /offertes, 2026-10-20). Na de wachttijd: wachten op een rustig moment. */
    const t = setTimeout(function () {
        if (cancelled) return;
        if (w.requestIdleCallback) idleId = w.requestIdleCallback(run, { timeout: timeoutMs });
        else run();
    }, minDelayMs);
    return function () {
        cancelled = true;
        clearTimeout(t);
        if (idleId !== null) w.cancelIdleCallback?.(idleId);
    };
}
