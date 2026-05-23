/**
 * WCAG 2.1 AA contrast audit for the 8 curated theme presets.
 *
 * Walks every preset × 12 audited token-pairs and exits non-zero
 * if any pair lands below threshold:
 *   - Body text (text, muted on bg/card):     ≥ 4.5
 *   - UI/icon (primary, accent, button text): ≥ 3.0
 *
 * The muted/muted-light tokens are computed mode-aware (matching
 * ThemeProvider's runtime derivation) using OKLCH mixing via culori,
 * so the audited ratios match the colors a tenant actually sees
 * once the browser resolves `color-mix(in oklch, …)`.
 *
 * Run:  npm run lint:contrast
 */

import { interpolate, formatHex } from 'culori';
import { THEMES, type ThemePreset } from '../src/lib/themes';

// ── WCAG 2.x relative luminance ───────────────────────────────────
function hexToRgb(hex: string): [number, number, number] {
    const h = hex.replace('#', '');
    const expanded = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
    const v = parseInt(expanded, 16);
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

function relativeLuminance(rgb: [number, number, number]): number {
    const [rs, gs, bs] = rgb.map(c => {
        const x = c / 255;
        return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function contrastRatio(a: string, b: string): number {
    const L1 = relativeLuminance(hexToRgb(a));
    const L2 = relativeLuminance(hexToRgb(b));
    return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
}

// ── color-mix(in oklch, fg P%, bg) — interpolate(t) returns the color at
// position t along [bg, fg]; t = fgWeight gives the same result that the
// browser produces for `color-mix(in oklch, fg <weight>%, bg)`.
function mixOklch(fg: string, bg: string, fgWeight: number): string {
    const interp = interpolate([bg, fg], 'oklch');
    const mixed = interp(fgWeight / 100);
    return formatHex(mixed) ?? bg;
}

function deriveMuted(text: string, bg: string, mode: 'light' | 'dark'): string {
    return mixOklch(text, bg, mode === 'light' ? 65 : 55);
}

function deriveMutedLight(text: string, bg: string, mode: 'light' | 'dark'): string {
    return mixOklch(text, bg, mode === 'light' ? 78 : 70);
}

// ── 12 pairs per preset ───────────────────────────────────────────
const BODY = 4.5;
const UI = 3.0;

type Pair = { label: string; fg: string; bg: string; target: number };

function pairsFor(t: ThemePreset): Pair[] {
    const mutedBg = deriveMuted(t.text, t.bg, t.mode);
    const mutedCard = deriveMuted(t.text, t.card, t.mode);
    const mutedLightBg = deriveMutedLight(t.text, t.bg, t.mode);
    const mutedLightCard = deriveMutedLight(t.text, t.card, t.mode);
    return [
        { label: 'text / bg',          fg: t.text,    bg: t.bg,      target: BODY },
        { label: 'text / card',        fg: t.text,    bg: t.card,    target: BODY },
        { label: 'muted / bg',         fg: mutedBg,   bg: t.bg,      target: BODY },
        { label: 'muted / card',       fg: mutedCard, bg: t.card,    target: BODY },
        { label: 'muted-light / bg',   fg: mutedLightBg,   bg: t.bg,   target: UI },
        { label: 'muted-light / card', fg: mutedLightCard, bg: t.card, target: UI },
        { label: 'primary / bg',       fg: t.primary, bg: t.bg,      target: UI },
        { label: 'primary / card',     fg: t.primary, bg: t.card,    target: UI },
        { label: 'accent / bg',        fg: t.accent,  bg: t.bg,      target: UI },
        { label: 'accent / card',      fg: t.accent,  bg: t.card,    target: UI },
        { label: 'btn text on primary', fg: t.bg,     bg: t.primary, target: UI },
        { label: 'btn text on accent',  fg: t.bg,     bg: t.accent,  target: UI },
    ];
}

// ── Run ───────────────────────────────────────────────────────────
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

let totalFails = 0;
const summary: Array<{ id: string; fails: number }> = [];

for (const t of THEMES) {
    const pairs = pairsFor(t);
    let fails = 0;
    console.log(`\n${BOLD}▸ ${t.id.padEnd(18)}${RESET} ${DIM}${t.mode} — ${t.name}${RESET}`);
    for (const p of pairs) {
        const r = contrastRatio(p.fg, p.bg);
        const ok = r >= p.target;
        if (!ok) fails++;
        const tag = ok ? `${GREEN}PASS${RESET}` : `${RED}FAIL${RESET}`;
        console.log(`  ${tag}  ${p.label.padEnd(22)} ${r.toFixed(2).padStart(5)} ${DIM}(≥${p.target})${RESET}`);
    }
    totalFails += fails;
    summary.push({ id: t.id, fails });
}

console.log(`\n${BOLD}─── Summary ───${RESET}`);
for (const { id, fails } of summary) {
    const mark = fails === 0 ? `${GREEN}✓${RESET}` : `${RED}✗${RESET}`;
    const tail = fails === 0 ? '' : ` ${RED}(${fails} fails)${RESET}`;
    console.log(`  ${mark} ${id}${tail}`);
}
console.log(`\nTotal fails: ${totalFails === 0 ? GREEN : RED}${totalFails}${RESET}`);

process.exit(totalFails > 0 ? 1 : 0);
