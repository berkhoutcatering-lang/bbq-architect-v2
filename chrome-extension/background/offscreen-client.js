/* background/offscreen-client — HTML parsen buiten de DOM-loze service worker.
 * De DOM-fallback van een adapter heeft een echte DOM nodig; die leeft in een
 * offscreen-document (chrome.offscreen). Alleen gebruikt als JSON-eerst faalt. */

let creating = null;

async function ensureOffscreen() {
    if (chrome.offscreen?.hasDocument && (await chrome.offscreen.hasDocument())) return;
    if (creating) { await creating; return; }
    creating = chrome.offscreen.createDocument({
        url: 'offscreen.html',
        reasons: ['DOM_PARSER'],
        justification: 'Parse leverancier-HTML off-DOM voor de DOM-fallback-adapter.',
    }).catch(() => {});
    await creating;
    creating = null;
}

export async function parseHtmlViaOffscreen(html, selectors) {
    try {
        await ensureOffscreen();
        const res = await chrome.runtime.sendMessage({ target: 'offscreen', type: 'PARSE_HTML', html, selectors });
        return { records: res?.records || [], next: res?.next || null };
    } catch {
        return { records: [], next: null };
    }
}
