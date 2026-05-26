/**
 * Sanitize ts_headline output zodat alleen <mark>-tags overblijven.
 * Voorkomt XSS via injectie in PDF-content of leveranciers-naam.
 *
 * We gebruiken geen DOMPurify-package om de bundle klein te houden — voor
 * deze ene use-case (alleen <mark> toegestaan) is een whitelist-regex genoeg.
 *
 * LLM05 mitigatie: extracted_text kan AI-gegenereerd zijn (Haiku vision).
 * Door alleen <mark> door te laten kan een LLM-output nooit HTML injecten.
 */

const ALLOWED_TAGS = /^<\/?mark>$/;

export function sanitizeSnippet(raw: string): string {
    if (!raw) return '';

    // Eerst alle HTML-tags vinden, dan filteren op whitelist.
    // Alles wat geen <mark> of </mark> is wordt HTML-escaped.
    return raw.replace(/<[^>]+>/g, (match) => {
        if (ALLOWED_TAGS.test(match)) return match;
        return escapeHtml(match);
    });
}

function escapeHtml(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
