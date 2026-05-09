/* eslint-env browser */

const els = {};
['connection','connection-name','not-connected','page-info','page-host','adapter-badge',
 'leverancier-pick','leverancier-select','leverancier-hint','actions','progress','progress-status',
 'stat-pages','stat-products','stat-elapsed','progress-current','progress-errors',
 'done','done-title','done-desc','link-review','btn-done-close','btn-options',
 'btn-open-options','btn-scan-page','btn-auto-walk','btn-deep-crawl','btn-cancel','error-msg','main',
 'chk-force-ai','sel-tempo','version-warning','bg-ver','popup-ver',
 'lev-error','lev-error-msg','btn-lev-retry','btn-done-rescan']
    .forEach(id => els[id] = document.getElementById(id));

const POPUP_VERSION = '0.3.3';

/** Check version-mismatch tussen popup (deze file) en background.js.
 *  Als ze niet matchen → Chrome cached oude background-worker → toon warning. */
function checkVersionMismatch() {
    chrome.runtime.sendMessage({ type: 'BBQ_VERSION' }, response => {
        const bgVer = response?.version || 'onbekend (oude versie)';
        if (bgVer !== POPUP_VERSION) {
            els['bg-ver'].innerText = bgVer;
            els['popup-ver'].innerText = POPUP_VERSION;
            els['version-warning'].classList.remove('hidden');
        }
    });
}

function show(id) { els[id]?.classList.remove('hidden'); }
function hide(id) { els[id]?.classList.add('hidden'); }
function setText(id, txt) { if (els[id]) els[id].innerText = txt; }
function flashError(msg) {
    els['error-msg'].innerText = msg;
    els['error-msg'].classList.remove('hidden');
    setTimeout(() => els['error-msg']?.classList.add('hidden'), 5000);
}

let leveranciers = [];
let activeLevId = null;

async function init() {
    /* Step 0: check version-mismatch tussen popup + background-worker */
    checkVersionMismatch();

    /* Step 1: check API-key */
    const cfg = await BBQ.getConfig();
    if (!cfg.apiKey) {
        show('not-connected');
        return;
    }

    /* Step 2: validate connection + fetch org */
    try {
        const auth = await BBQ.testConnection();
        setText('connection-name', auth.organization?.naam || '?');
        show('connection');
    } catch (e) {
        flashError('Verbinding mislukt: ' + e.message);
        show('not-connected');
        return;
    }

    /* Step 3: detect current tab + adapter */
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.url) {
        try {
            const host = new URL(tab.url).hostname;
            setText('page-host', host);
            const adapter = BBQ_detectAdapter(host);
            if (adapter) {
                els['adapter-badge'].innerText = '✓ Snel pad: ' + adapter.naam;
                els['adapter-badge'].classList.add('on');
            } else {
                els['adapter-badge'].innerText = 'Generic mode (AI-detect)';
                els['adapter-badge'].classList.remove('on');
            }
            show('page-info');
        } catch { /* invalid URL */ }
    }

    /* Step 4: load leveranciers — met retry-knop bij faal i.p.v. dood-eind */
    await loadLeveranciers();

    /* Step 5: check existing sync state — maar negeer stale done-state ouder dan 10 min.
       Zonder dit toont popup een oude "Klaar" van uren geleden i.p.v. de actions card. */
    chrome.runtime.sendMessage({ type: 'BBQ_GET_STATE' }, response => {
        const s = response?.state;
        if (!s) return;
        const STALE_MS = 10 * 60 * 1000;
        const tooOld = s.done && s.startedAt && (Date.now() - s.startedAt > STALE_MS);
        if (tooOld) {
            chrome.runtime.sendMessage({ type: 'BBQ_CLEAR_STATE' }, () => { /* state weg, popup blijft op actions */ });
            return;
        }
        renderState(s);
    });
}

async function loadLeveranciers() {
    /* Toon "laden..." in dropdown direct, dan API-call. Bij fout: retry-knop. */
    const sel = els['leverancier-select'];
    sel.innerHTML = '<option value="">Leveranciers laden…</option>';
    sel.disabled = true;
    show('leverancier-pick');
    hide('lev-error');

    try {
        const r = await BBQ.listLeveranciers();
        leveranciers = (r.data || []).filter(l =>
            !l.import_method || l.import_method === 'extension'
        );
        sel.innerHTML = '';
        if (leveranciers.length === 0) {
            sel.innerHTML = '<option value="">Geen leveranciers — voeg eerst een toe in BBQ Architect</option>';
            sel.disabled = true;
            hide('actions');
        } else {
            sel.disabled = false;
            leveranciers.forEach(l => {
                const opt = document.createElement('option');
                opt.value = String(l.id);
                opt.text = l.naam + (l.products_count ? ` (${l.products_count} producten)` : '');
                sel.appendChild(opt);
            });
            /* Auto-select op portal_hint match */
            const host = (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0]?.url || '';
            const hostStr = (() => { try { return new URL(host).hostname; } catch { return ''; } })();
            const adapter = BBQ_detectAdapter(hostStr);
            if (adapter) {
                const match = leveranciers.find(l => l.portal_hint === adapter.hint);
                if (match) sel.value = String(match.id);
            }
            activeLevId = Number(sel.value);
            updateLeverancierHint();
            show('actions');
        }
    } catch (e) {
        sel.innerHTML = '<option value="">— niet geladen —</option>';
        sel.disabled = true;
        hide('actions');
        if (els['lev-error-msg']) els['lev-error-msg'].innerText = String(e.message || e).slice(0, 200);
        show('lev-error');
    }
}

function updateLeverancierHint() {
    const sel = els['leverancier-select'];
    activeLevId = Number(sel.value);
    const lev = leveranciers.find(l => l.id === activeLevId);
    const hint = els['leverancier-hint'];
    if (!lev) { hint.innerText = ''; return; }
    if (lev.portal_url) {
        hint.innerHTML = `Portal: <a href="${lev.portal_url}" target="_blank">${lev.portal_url}</a>`;
    } else {
        hint.innerText = '';
    }
}

function renderState(state) {
    if (!state) return;
    if (state.running) {
        hide('actions'); hide('done');
        show('progress');
        /* Phase wint van mode-label als gezet — Sam ziet exact "Screenshots maken (2/3)…"
           i.p.v. generiek "Pagina scan bezig…" */
        const modeLabel = state.phase
            ? state.phase
            : state.mode === 'deep-crawl' ? `Deep-crawl bezig${state.tempo ? ` (${state.tempo})` : ''}…`
            : state.mode === 'full' ? 'Auto-walk bezig…'
            : 'Pagina scan bezig…';
        setText('progress-status', modeLabel);
        setText('stat-pages', state.pagesScanned || 0);
        setText('stat-products', state.productsSeen || 0);
        if (state.startedAt) {
            const sec = Math.floor((Date.now() - state.startedAt) / 1000);
            setText('stat-elapsed', sec >= 60 ? `${Math.floor(sec/60)}m ${sec%60}s` : `${sec}s`);
        }
        if (state.currentUrl) {
            try {
                const u = new URL(state.currentUrl);
                let txt = u.pathname.slice(0, 60);
                if (state.queueSize > 0) txt += ` · queue: ${state.queueSize}`;
                els['progress-current'].innerText = txt;
            } catch { /* ignore */ }
        }
        if (state.errors && state.errors.length > 0) {
            els['progress-errors'].innerText = state.errors.slice(0, 2).join(' · ');
        }
    } else if (state.done) {
        hide('progress'); hide('actions');
        show('done');
        setText('done-title', state.cancelled ? 'Geannuleerd' : (state.error ? 'Mislukt' : 'Klaar'));
        const baseMsg = state.error
            ? state.error
            : state.cancelled
                ? `${state.productsSeen || 0} producten gescand voor onderbreking. Wat al binnen is staat in review-queue.`
                : `${state.productsSeen || 0} producten in ${state.pagesScanned || 0} pagina's gescand. Bekijk de review-queue om akkoord te geven.`;
        /* Diagnostiek-regel: laat Sam zien WELKE methode wat opleverde —
           cruciaal voor debugging als productsSeen=0. */
        let diagLine = '';
        if (state.diagnostic) {
            const d = state.diagnostic;
            const parts = [];
            if (d.adapter !== undefined) parts.push(`adapter ${d.adapter}`);
            if (d.screenshots > 0) parts.push(`vision ${d.screenshots}× → ${d.vision}`);
            else if (d.vision !== undefined) parts.push(`vision ${d.vision}`);
            if (d.html !== undefined) parts.push(`html ${d.html}`);
            if (parts.length) diagLine = `\n\n🔬 ${parts.join(' · ')}`;
        }
        const fullMsg = state.hint ? `${baseMsg}\n\n💡 ${state.hint}${diagLine}` : `${baseMsg}${diagLine}`;
        setText('done-desc', fullMsg);
        BBQ.getConfig().then(cfg => {
            els['link-review'].href = cfg.apiUrl.replace(/\/+$/, '') + '/leveranciers';
        });
    } else if (state.error) {
        hide('progress');
        flashError(state.error);
        show('actions');
    }
}

/* ─── Event listeners ─── */
els['btn-options'].addEventListener('click', () => chrome.runtime.openOptionsPage());
els['btn-open-options'].addEventListener('click', () => chrome.runtime.openOptionsPage());

els['leverancier-select']?.addEventListener('change', updateLeverancierHint);

function readScanOptions() {
    return {
        leverancierId: activeLevId,
        useAi: !!els['chk-force-ai']?.checked,
        tempo: els['sel-tempo']?.value || 'normal',
    };
}

els['btn-scan-page'].addEventListener('click', () => {
    if (!activeLevId) { flashError('Kies een leverancier'); return; }
    hide('actions');
    chrome.runtime.sendMessage({ type: 'BBQ_SCAN_PAGE', options: readScanOptions() }, response => {
        if (!response?.ok) flashError(response?.error || 'Scan faal');
    });
});

els['btn-auto-walk'].addEventListener('click', () => {
    if (!activeLevId) { flashError('Kies een leverancier'); return; }
    hide('actions');
    chrome.runtime.sendMessage({
        type: 'BBQ_AUTO_WALK',
        options: { ...readScanOptions(), maxPages: 100 },
    }, response => {
        if (!response?.ok) flashError(response?.error || 'Auto-walk faal');
    });
});

els['btn-deep-crawl'].addEventListener('click', () => {
    if (!activeLevId) { flashError('Kies een leverancier'); return; }
    hide('actions');
    chrome.runtime.sendMessage({
        type: 'BBQ_DEEP_CRAWL',
        options: { ...readScanOptions(), maxPages: 200, useAi: true /* always AI for cross-page crawl */ },
    }, response => {
        if (!response?.ok) flashError(response?.error || 'Deep-crawl faal');
    });
});

els['btn-cancel'].addEventListener('click', () => {
    /* Direct UI-feedback, niet wachten op background */
    setText('progress-status', 'Annuleren…');
    els['btn-cancel'].disabled = true;
    els['btn-cancel'].innerText = 'bezig met afkappen…';
    chrome.runtime.sendMessage({ type: 'BBQ_CANCEL_SYNC' }, () => {
        /* Background heeft cancel-flag gezet; loop stopt binnen ~1s */
    });
});

els['btn-done-close'].addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'BBQ_CLEAR_STATE' }, () => window.close());
});

/* Retry-knop voor leverancier-load (verschijnt bij API-fout) */
els['btn-lev-retry']?.addEventListener('click', () => loadLeveranciers());

/* "Scan opnieuw" op het Klaar-scherm: clear stale state + run nieuwe scan
   met dezelfde leverancier en opties. Voorkomt dat user éérst Sluit moet klikken. */
els['btn-done-rescan']?.addEventListener('click', () => {
    if (!activeLevId) { flashError('Kies eerst een leverancier'); return; }
    chrome.runtime.sendMessage({ type: 'BBQ_CLEAR_STATE' }, () => {
        hide('done');
        chrome.runtime.sendMessage({ type: 'BBQ_SCAN_PAGE', options: readScanOptions() }, response => {
            if (!response?.ok) flashError(response?.error || 'Scan faal');
        });
    });
});

/* Live state updates */
chrome.runtime.onMessage.addListener(msg => {
    if (msg.type === 'BBQ_STATE_UPDATE') renderState(msg.state);
});

/* Poll every 2s while popup is open to keep elapsed-counter alive */
setInterval(() => {
    chrome.runtime.sendMessage({ type: 'BBQ_GET_STATE' }, response => {
        if (response?.state?.running) renderState(response.state);
    });
}, 2000);

init();
