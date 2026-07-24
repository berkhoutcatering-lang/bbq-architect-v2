/* sidepanel.js — de primaire UI (briefing §7). Site-specifiek: alleen bruikbaar
 * wanneer de origin bij een gekoppelde leverancier hoort, host-permission is
 * gegeven en de extension-key geldig is. Toont servercounters (geen lokale
 * schattingen) en één primaire synchroniseerknop. */

const $ = (id) => document.getElementById(id);
const SECTIONS = ['s-not-connected', 's-wrong-site', 's-permission', 's-ready', 's-progress'];
const TERMINAL = ['completed', 'partial', 'failed', 'cancelled'];

let current = { origin: null, adapter: null, supplier: null, accountKey: 'main' };
let pollTimer = null;

function show(section) {
    SECTIONS.forEach((s) => $(s).classList.toggle('hidden', s !== section));
}
function banner(kind, text) {
    const b = $('banner');
    if (!text) { b.classList.add('hidden'); return; }
    b.className = `banner ${kind}`;
    b.textContent = text;
    b.classList.remove('hidden');
}
function sendCmd(type, extra = {}) {
    return chrome.runtime.sendMessage({ type, ...extra });
}
async function getConfig() {
    return new Promise((res) => chrome.storage.local.get(['bbq_api_url', 'bbq_api_key'], (v) => res({
        apiUrl: (v.bbq_api_url || '').replace(/\/+$/, ''), apiKey: v.bbq_api_key || '',
    })));
}
async function currentTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab || null;
}
function originPattern(origin) { return `${origin}/*`; }

async function init() {
    banner('', '');
    const cfg = await getConfig();
    if (!cfg.apiUrl || !cfg.apiKey) { $('supplier-line').textContent = '—'; show('s-not-connected'); return; }

    const tab = await currentTab();
    const url = tab?.url || '';
    let origin = '';
    try { origin = new URL(url).origin; } catch { /* new tab */ }
    current.origin = origin;

    const det = await sendCmd('BBQ_V2_DETECT', { url });
    current.adapter = det?.adapter || null;

    $('supplier-line').textContent = current.adapter ? current.adapter.displayName : 'Geen leverancier';
    $('meta-line').textContent = origin || '';

    if (!current.adapter) {
        $('wrong-site-text').textContent = `Deze pagina (${origin || 'onbekend'}) hoort niet bij een gekoppelde leverancier.`;
        show('s-wrong-site');
        return;
    }

    // Host-permission?
    const hasPerm = await chrome.permissions.contains({ origins: [originPattern(origin)] }).catch(() => false);
    if (!hasPerm) {
        $('perm-text').textContent = `Geef toegang tot ${new URL(origin).hostname} zodat de sync je ingelogde prijzen kan lezen.`;
        show('s-permission');
        return;
    }

    // Match leverancier op portal_hint === adapter.key.
    const list = await sendCmd('BBQ_V2_LIST_SUPPLIERS');
    const suppliers = list?.data || list?.leveranciers || [];
    current.supplier = suppliers.find((l) => (l.portal_hint || '').toLowerCase() === current.adapter.key) || null;
    if (!current.supplier) {
        $('wrong-site-text').textContent = `${current.adapter.displayName} is nog niet als leverancier gekoppeld in BBQ Architect.`;
        show('s-wrong-site');
        return;
    }
    $('supplier-line').textContent = current.supplier.naam;

    // Loopt er al een run?
    await refreshState(true);
    startPolling();
}

async function refreshState(decideView = false) {
    const st = await sendCmd('BBQ_V2_GET_STATE', { supplierId: current.supplier?.id, accountKey: current.accountKey });
    const run = st?.run || null;

    if (run && !TERMINAL.includes(run.status)) {
        renderProgress(run);
        show('s-progress');
        return run;
    }
    if (run && TERMINAL.includes(run.status)) {
        renderProgress(run);
        show('s-progress');
        stopPolling();
        return run;
    }
    if (decideView) {
        $('btn-start').textContent = `Synchroniseer ${current.supplier?.naam || ''}`.trim();
        show('s-ready');
    }
    return null;
}

function renderProgress(run) {
    const paused = String(run.status).startsWith('paused');
    const done = TERMINAL.includes(run.status);
    const dot = done ? (run.status === 'completed' ? 'done' : 'fail') : (paused ? 'paused' : 'running');
    const label = {
        running: 'Bezig met synchroniseren…', paused: 'Gepauzeerd', paused_needs_login: 'Gepauzeerd — log opnieuw in',
        paused_rate_limited: 'Gepauzeerd — leverancier limiteert', completed: 'Voltooid', partial: 'Deels voltooid',
        failed: 'Mislukt', cancelled: 'Geannuleerd',
    }[run.status] || run.status;

    $('run-state').innerHTML = `<span class="dot ${dot}"></span>${label}`;

    const rows = [
        ['Adapter', `${run.adapter_key || '—'} ${run.adapter_version || ''}`],
        ['Taken', `${run.tasks_done || 0} / ${run.tasks_total || 0}${run.tasks_failed ? ` (${run.tasks_failed} mislukt)` : ''}`],
        ['Geaccepteerd', run.observations_accepted || 0],
        ['In review', run.observations_quarantined || 0],
        ['Afgekeurd', run.observations_rejected || 0],
        ['Nieuw / gewijzigd', `${run.products_new || 0} / ${run.products_updated || 0}`],
    ];
    $('counters').innerHTML = rows.map(([k, v]) => `<div class="k">${k}</div><div class="v">${v}</div>`).join('');

    const total = Number(run.tasks_total || 0);
    const pct = total > 0 ? Math.round(((Number(run.tasks_done || 0) + Number(run.tasks_failed || 0)) / total) * 100) : 0;
    $('progress-fill').style.width = `${pct}%`;

    $('checkpoint-line').textContent = run.last_checkpoint_at
        ? `Laatste checkpoint: ${new Date(run.last_checkpoint_at).toLocaleTimeString('nl-NL')}`
        : 'Nog geen checkpoint.';

    $('btn-pause').classList.toggle('hidden', done || paused);
    $('btn-resume').classList.toggle('hidden', !paused);
    $('btn-cancel').classList.toggle('hidden', done);

    if (run.status === 'paused_needs_login') banner('warn', 'Log opnieuw in bij de leverancier en klik op Hervat.');
    else if (run.status === 'paused_rate_limited') banner('warn', 'De leverancier limiteert verzoeken. De sync hervat vanzelf.');
    else if (run.status === 'completed') banner('ok', 'Alle producten gesynchroniseerd. Bekijk het resultaat in BBQ Architect.');
    else if (run.status === 'partial') banner('warn', 'Deels voltooid — sommige items staan in review of faalden.');
    else if (run.status === 'failed') banner('error', 'De sync is mislukt. Probeer opnieuw of bekijk Geavanceerd.');
    else banner('', '');
}

function startPolling() {
    stopPolling();
    pollTimer = setInterval(() => refreshState(false), 2000);
}
function stopPolling() { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } }

function scopeMode() {
    const v = $('scope').value;
    return v === 'full' ? 'full' : v === 'favorites' ? 'favorites' : 'linked_products';
}

/* ── Acties ─────────────────────────────────────────────────────────────────*/
$('btn-options').addEventListener('click', () => chrome.runtime.openOptionsPage());

$('btn-permission').addEventListener('click', async () => {
    const granted = await chrome.permissions.request({ origins: [originPattern(current.origin)] }).catch(() => false);
    if (granted) init(); else banner('error', 'Toegang geweigerd — zonder toegang kan de sync niet lezen.');
});

$('btn-preflight').addEventListener('click', async () => {
    banner('info', 'Bezig met controleren…');
    $('btn-preflight').disabled = true;
    const pf = await sendCmd('BBQ_V2_PREFLIGHT', {
        payload: { supplierId: current.supplier.id, accountKey: current.accountKey, adapterKey: current.adapter.key, origin: current.origin, categories: [] },
    });
    $('btn-preflight').disabled = false;
    if (!pf || pf.ok === false) {
        banner('error', pf?.code === 'LOGIN_REQUIRED' ? 'Niet ingelogd of geen persoonlijke prijzen zichtbaar.' : `Controle mislukte (${pf?.code || 'fout'}).`);
        return;
    }
    banner('ok', `Ingelogd als ${pf.accountKeyMasked || '—'} · BTW: ${pf.taxMode || '?'}`);
    renderSample(pf.sample || []);
});

function renderSample(sample) {
    const box = $('sample'); const tbody = $('sample-table').querySelector('tbody');
    if (!sample.length) { box.classList.add('hidden'); return; }
    tbody.innerHTML = '<tr><th>Product</th><th>SKU</th><th>Verpakking</th><th class="num">Prijs</th></tr>' +
        sample.slice(0, 6).map((o) => `<tr>
            <td>${esc(o.productName)}</td>
            <td>${esc(o.supplierSku || '—')}</td>
            <td>${esc(o.packageDescriptionRaw || o.priceBasis)}</td>
            <td class="num">${o.regularPriceExVat ? '€' + o.regularPriceExVat : '—'}</td>
        </tr>`).join('');
    box.classList.remove('hidden');
}

$('btn-start').addEventListener('click', async () => {
    $('btn-start').disabled = true;
    banner('info', 'Sync starten…');
    const res = await sendCmd('BBQ_V2_START', {
        payload: { supplierId: current.supplier.id, accountKey: current.accountKey, adapterKey: current.adapter.key, origin: current.origin, mode: scopeMode(), categories: [] },
    });
    $('btn-start').disabled = false;
    if (!res || res.ok === false) {
        banner('error', res?.code === 'LOGIN_REQUIRED' ? 'Log eerst in bij de leverancier.' : `Kon niet starten (${res?.code || res?.error || 'fout'}).`);
        return;
    }
    banner('', '');
    startPolling();
    await refreshState(false);
    show('s-progress');
});

$('btn-pause').addEventListener('click', async () => { await sendCmd('BBQ_V2_PAUSE', { reason: 'manual' }); refreshState(false); });
$('btn-resume').addEventListener('click', async () => { await sendCmd('BBQ_V2_RESUME'); startPolling(); refreshState(false); });
$('btn-cancel').addEventListener('click', async () => {
    if (!confirm('Sync annuleren? Al gesynchroniseerde producten blijven behouden.')) return;
    await sendCmd('BBQ_V2_CANCEL'); stopPolling(); init();
});
$('btn-test').addEventListener('click', async () => {
    const r = await sendCmd('BBQ_V2_TEST_CONNECTION');
    $('diag').textContent = JSON.stringify(r, null, 2);
});

function esc(s) { return String(s ?? '').replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c])); }

init();
