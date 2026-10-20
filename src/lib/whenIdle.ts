/* Bijzaken (tellers, nieuws, hulp-artikelen) pas ophalen als de browser even
   niets te doen heeft. Anders gaan ze tegelijk met de vragen van de pagina
   zelf de deur uit en concurreren ze om dezelfde verbinding (meting
   2026-10-20). Geeft een opruimfunctie terug voor in een useEffect. */
type IdleWindow = Window & {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
    cancelIdleCallback?: (id: number) => void;
};

export function whenIdle(cb: () => void, timeoutMs = 2000): () => void {
    if (typeof window === 'undefined') return function () { /* niets */ };
    const w = window as IdleWindow;
    let cancelled = false;
    const run = function () { if (!cancelled) cb(); };
    if (w.requestIdleCallback) {
        const id = w.requestIdleCallback(run, { timeout: timeoutMs });
        return function () { cancelled = true; w.cancelIdleCallback?.(id); };
    }
    const t = setTimeout(run, 800);
    return function () { cancelled = true; clearTimeout(t); };
}
