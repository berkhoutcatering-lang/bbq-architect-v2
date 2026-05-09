/**
 * API-wrapper rond BBQ Architect endpoints.
 * Gebruikt chrome.storage voor base URL + API key.
 */

const STORAGE_KEYS = {
    apiUrl: 'bbq_api_url',
    apiKey: 'bbq_api_key',
    organization: 'bbq_organization',
    user: 'bbq_user',
};

const DEFAULT_API_URL = 'http://localhost:56222';   // dev; override in options

async function getStored(keys) {
    return new Promise(resolve => chrome.storage.local.get(keys, resolve));
}
async function setStored(obj) {
    return new Promise(resolve => chrome.storage.local.set(obj, resolve));
}

async function getConfig() {
    const data = await getStored([STORAGE_KEYS.apiUrl, STORAGE_KEYS.apiKey]);
    return {
        apiUrl: data[STORAGE_KEYS.apiUrl] || DEFAULT_API_URL,
        apiKey: data[STORAGE_KEYS.apiKey] || null,
    };
}

/* Fetch met AbortController + timeout. Default 30s, AI-detect mag langer (60s).
 * Combineert eigen timeout-controller met optionele caller-signal (voor cancel-mid-request). */
async function apiFetch(path, init = {}, timeoutMs = 30000) {
    const { apiUrl, apiKey } = await getConfig();
    if (!apiKey) throw new Error('Geen API-key — open de extensie-instellingen');
    const url = apiUrl.replace(/\/+$/, '') + path;
    const headers = Object.assign({
        'content-type': 'application/json',
        'x-extension-key': apiKey,
    }, init.headers || {});

    /* Composed signal: aborts on either timeout OR caller-cancel */
    const composed = new AbortController();
    let cancelledByUser = false;
    if (init.signal) {
        if (init.signal.aborted) { cancelledByUser = true; composed.abort(); }
        else init.signal.addEventListener('abort', () => { cancelledByUser = true; composed.abort(); }, { once: true });
    }
    const timer = setTimeout(() => composed.abort(), timeoutMs);

    /* Strip caller-signal from init — we forward our composed signal instead */
    const fetchInit = { ...init, headers, signal: composed.signal };
    delete fetchInit.signal;
    fetchInit.signal = composed.signal;

    try {
        const r = await fetch(url, fetchInit);
        clearTimeout(timer);
        if (!r.ok) {
            let detail = '';
            try { detail = (await r.json())?.error || ''; } catch { /* ignore */ }
            throw new Error(`${r.status}: ${detail || r.statusText}`);
        }
        return r.json();
    } catch (e) {
        clearTimeout(timer);
        if (e.name === 'AbortError') {
            if (cancelledByUser) {
                const err = new Error('cancelled');
                err.name = 'AbortError';
                throw err;
            }
            throw new Error(`Timeout na ${Math.round(timeoutMs / 1000)}s op ${path}`);
        }
        throw e;
    }
}

/* ─── Public API ─── */

const BBQ = {
    STORAGE_KEYS,
    DEFAULT_API_URL,
    getStored,
    setStored,
    getConfig,
    apiFetch,

    async testConnection() {
        return apiFetch('/api/extension/auth', { method: 'GET' });
    },

    async listLeveranciers() {
        /* Extension-aware endpoint: auth via x-extension-key header
           i.p.v. Supabase session-cookie. Returnt {data: Leverancier[]}. */
        return apiFetch('/api/extension/leveranciers', { method: 'GET' });
    },

    async startSync({ leverancierId, mode, portalUrl }) {
        return apiFetch('/api/extension/sync/start', {
            method: 'POST',
            body: JSON.stringify({ leverancierId, mode, portalUrl }),
        });
    },

    async finishSync({ syncRunId, status, errorText }) {
        return apiFetch(`/api/extension/sync/${syncRunId}/finish`, {
            method: 'POST',
            body: JSON.stringify({ status, errorText }),
        });
    },

    async sendBatch({ syncRunId, leverancierId, pageUrl, pagesScanned, producten }) {
        return apiFetch('/api/extension/products/batch', {
            method: 'POST',
            body: JSON.stringify({ syncRunId, leverancierId, pageUrl, pagesScanned, producten }),
        });
    },

    async aiDetect({ html, imageBase64, mimeType, images, pageUrl, scope, scopeKeywords, signal }) {
        let base;
        if (Array.isArray(images) && images.length > 0) {
            base = { mode: 'image', images, pageUrl };
        } else if (imageBase64) {
            base = { mode: 'image', imageBase64, mimeType, pageUrl };
        } else {
            base = { mode: 'html', html, pageUrl };
        }
        const body = { ...base };
        if (scope) body.scope = scope;
        if (Array.isArray(scopeKeywords) && scopeKeywords.length) body.scopeKeywords = scopeKeywords;
        /* AI-detect mag tot 60s nemen (Haiku op zware HTML/vision). Caller kan signal
           meegeven om de in-flight fetch te cancellen via AbortController. */
        return apiFetch('/api/extension/ai-detect', {
            method: 'POST',
            body: JSON.stringify(body),
            signal,
        }, 60000);
    },
};

if (typeof window !== 'undefined') window.BBQ = BBQ;
if (typeof self !== 'undefined') self.BBQ = BBQ;
