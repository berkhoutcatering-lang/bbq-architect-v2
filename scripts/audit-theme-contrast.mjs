#!/usr/bin/env node
/**
 * WCAG 2.1 contrast-audit voor de 6 theme-presets in /instellingen/page.tsx.
 *
 * Checkt elke text/bg combinatie die in de preset gebruikt wordt:
 *   - text op bg, text op card
 *   - primary op bg, primary op card
 *   - accent op bg, accent op card
 *   - card-color als tekst op primary (de "OFFERTE" badge)
 *   - accent als tekst op transparent (effectief op card achtergrond, de "FACTUUR" badge)
 *
 * Threshold (WCAG AA):
 *   - Normal text: 4.5:1
 *   - Large text (>=18px of >=14px bold): 3:1
 *
 * Gebruik:
 *   node scripts/audit-theme-contrast.mjs
 */

const THEMES = [
    { id: 'smokehouse', bg: '#181412', card: '#2c241d', text: '#f4efe4', primary: '#d49b4d', accent: '#b3611f', secondary: '#100c0a' },
    { id: 'graphite',   bg: '#0e1014', card: '#1f2128', text: '#f4f5f7', primary: '#d8c277', accent: '#a89d83', secondary: '#08090d' },
    { id: 'cellar',     bg: '#241015', card: '#4a1f2a', text: '#f1ead8', primary: '#dac786', accent: '#a96940', secondary: '#1a0a0d' },
    { id: 'linen',      bg: '#f4eed8', card: '#fcfaf3', text: '#1c1814', primary: '#9a6a3e', accent: '#6b4a30', secondary: '#e7dfc6' },
    { id: 'studio',     bg: '#f6f6f6', card: '#ffffff', text: '#181818', primary: '#222222', accent: '#b73020', secondary: '#ebebeb' },
    { id: 'garden',     bg: '#ece9d6', card: '#fbf9ef', text: '#1f2117', primary: '#6b7847', accent: '#a96b40', secondary: '#dad6b8' },
];

/** Hex → linearized RGB component voor relative-luminance berekening. */
function srgbToLin(c) {
    const x = c / 255;
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
}

function hexToRgb(hex) {
    const m = hex.replace('#', '').match(/^([0-9a-f]{6})$/i);
    if (!m) throw new Error('Ongeldige hex: ' + hex);
    const v = parseInt(m[1], 16);
    return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 };
}

function luminance(hex) {
    const { r, g, b } = hexToRgb(hex);
    return 0.2126 * srgbToLin(r) + 0.7152 * srgbToLin(g) + 0.0722 * srgbToLin(b);
}

function contrast(fg, bg) {
    const L1 = luminance(fg);
    const L2 = luminance(bg);
    const light = Math.max(L1, L2);
    const dark = Math.min(L1, L2);
    return (light + 0.05) / (dark + 0.05);
}

const TARGETS = {
    NORMAL: 4.5,
    LARGE: 3.0,
};

function fmt(n) { return n.toFixed(2); }
function badge(ratio, target) {
    if (ratio >= target) return '\x1b[32mPASS\x1b[0m';
    return '\x1b[31mFAIL\x1b[0m';
}

let totalFails = 0;
const failsByTheme = {};

for (const t of THEMES) {
    console.log('\n\x1b[1m▸ ' + t.id.toUpperCase() + '\x1b[0m');
    const fails = [];
    const checks = [
        { label: 'Body-tekst op bg',         fg: t.text,    bg: t.bg,      target: TARGETS.NORMAL },
        { label: 'Body-tekst op card',       fg: t.text,    bg: t.card,    target: TARGETS.NORMAL },
        { label: 'Primary-tekst op bg',      fg: t.primary, bg: t.bg,      target: TARGETS.LARGE },
        { label: 'Primary-tekst op card',    fg: t.primary, bg: t.card,    target: TARGETS.LARGE },
        { label: 'Accent-tekst op bg',       fg: t.accent,  bg: t.bg,      target: TARGETS.LARGE },
        { label: 'Accent-tekst op card',     fg: t.accent,  bg: t.card,    target: TARGETS.LARGE },
        { label: 'OFFERTE badge (card-color text on primary)',  fg: t.card,    bg: t.primary, target: TARGETS.LARGE },
        { label: 'FACTUUR badge (accent text on card)',         fg: t.accent,  bg: t.card,    target: TARGETS.LARGE },
    ];
    for (const c of checks) {
        const r = contrast(c.fg, c.bg);
        const ok = r >= c.target;
        console.log(`  ${badge(r, c.target)}  ${c.label.padEnd(56)} ${fmt(r)} (target ${c.target})`);
        if (!ok) { fails.push({ ...c, ratio: r }); totalFails++; }
    }
    if (fails.length === 0) console.log('  \x1b[32mAlle checks PASS\x1b[0m');
    failsByTheme[t.id] = fails;
}

console.log('\n\x1b[1m─── samenvatting ───\x1b[0m');
for (const id of Object.keys(failsByTheme)) {
    const n = failsByTheme[id].length;
    if (n === 0) console.log('  \x1b[32m✓ ' + id + '\x1b[0m');
    else console.log('  \x1b[31m✗ ' + id + ' (' + n + ' fails)\x1b[0m');
}
console.log('\nTotaal fails: ' + totalFails);

process.exit(totalFails > 0 ? 1 : 0);
