/* background/lib/storage — chrome.storage.local pointers.
 *
 * chrome.storage.local bevat ALLEEN een lokale pointer + cache, nooit de enige
 * runstate (ADR-2: de server is de bron van waarheid). chrome.storage.session
 * is uitsluitend voor vluchtige UI-data.
 */

export const KEYS = {
    apiUrl: 'bbq_api_url',
    apiKey: 'bbq_api_key',
    activeRun: 'bbq_v2_active_run',   // { runId, supplierId, accountKey, adapterKey, origin, categories }
    lastStatus: 'bbq_v2_last_status', // laatste bekende serverstatus (cache voor UI)
    adapterCache: 'bbq_v2_adapter_cache',
    alarmFlag: 'bbq_v2_alarm_needed',
};

export async function getLocal(keys) {
    return new Promise((res) => chrome.storage.local.get(keys, (v) => res(v || {})));
}
export async function setLocal(obj) {
    return new Promise((res) => chrome.storage.local.set(obj, () => res()));
}
export async function removeLocal(keys) {
    return new Promise((res) => chrome.storage.local.remove(keys, () => res()));
}

export async function getActiveRun() {
    const v = await getLocal(KEYS.activeRun);
    return v[KEYS.activeRun] || null;
}
export async function setActiveRun(run) {
    await setLocal({ [KEYS.activeRun]: run });
}
export async function clearActiveRun() {
    await removeLocal([KEYS.activeRun]);
}
export async function setLastStatus(status) {
    await setLocal({ [KEYS.lastStatus]: { ...status, at: Date.now() } });
}
export async function getConfig() {
    const v = await getLocal([KEYS.apiUrl, KEYS.apiKey]);
    return { apiUrl: (v[KEYS.apiUrl] || '').replace(/\/+$/, ''), apiKey: v[KEYS.apiKey] || '' };
}
