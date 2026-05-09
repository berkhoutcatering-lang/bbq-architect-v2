/* eslint-env browser */

const $ = id => document.getElementById(id);

async function load() {
    const data = await BBQ.getStored([
        BBQ.STORAGE_KEYS.apiUrl,
        BBQ.STORAGE_KEYS.apiKey,
        'bbq_page_delay',
        'bbq_max_pages',
    ]);
    $('api-url').value = data[BBQ.STORAGE_KEYS.apiUrl] || BBQ.DEFAULT_API_URL;
    $('api-key').value = data[BBQ.STORAGE_KEYS.apiKey] || '';
    $('page-delay').value = data['bbq_page_delay'] || 1500;
    $('max-pages').value = data['bbq_max_pages'] || 50;
}

/** Normaliseer URL naar origin-only.
 *  User plakt vaak `https://app.example.com/leveranciers` — extensie hangt
 *  daar `/api/extension/auth` achter wat een 404 op de Next.js-pagina geeft.
 *  Deze stript pad/query/hash zodat alleen `https://app.example.com` overblijft. */
function normalizeApiUrl(raw) {
    const trimmed = String(raw || '').trim();
    if (!trimmed) return '';
    /* Forceer protocol als gebruiker `app.example.com` typt */
    const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : 'https://' + trimmed;
    try {
        const u = new URL(withProto);
        return u.origin;
    } catch {
        return trimmed;
    }
}

async function save(showFeedback = true) {
    const apiUrl = normalizeApiUrl($('api-url').value);
    /* Direct in het input-veld terugzetten zodat user ziet wat opgeslagen is */
    $('api-url').value = apiUrl;
    const apiKey = $('api-key').value.trim();
    const pageDelay = Number($('page-delay').value) || 1500;
    const maxPages = Number($('max-pages').value) || 50;

    await BBQ.setStored({
        [BBQ.STORAGE_KEYS.apiUrl]: apiUrl,
        [BBQ.STORAGE_KEYS.apiKey]: apiKey,
        bbq_page_delay: pageDelay,
        bbq_max_pages: maxPages,
    });

    if (showFeedback) {
        $('save-result').innerText = 'Bewaard ✓';
        setTimeout(() => $('save-result').innerText = '', 2500);
    }
}

async function testConnection() {
    await save(false);
    const result = $('test-result');
    result.innerText = 'Testen…';
    try {
        const auth = await BBQ.testConnection();
        result.innerText = `✓ Verbonden met ${auth.organization?.naam || '?'}`;
        result.style.color = '#7ec97a';
        await BBQ.setStored({ [BBQ.STORAGE_KEYS.organization]: auth.organization });
    } catch (e) {
        result.innerText = `✗ ${e.message}`;
        result.style.color = '#e57373';
    }
}

$('btn-save').addEventListener('click', save);
$('btn-test').addEventListener('click', testConnection);

load();
