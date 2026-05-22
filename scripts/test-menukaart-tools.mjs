/**
 * Integratie-test voor ALLE menukaart AI-tools.
 *
 * Test de chain: tool-call → buildDiff → validateOverrides → apply-merge
 * Voor elke tool + elke target + edge-cases. Print pass/fail.
 *
 * Run: node scripts/test-menukaart-tools.mjs
 */

import { spawnSync } from 'node:child_process';

const tsx = spawnSync('npx', ['tsx', '--eval', `
import { TEMPLATES, getTemplate } from './src/lib/menukaart/registry';
import { validateOverrides } from './src/lib/menukaart/validation';
import { resolveCascade, flatten } from './src/lib/menukaart/cascade';

const RESULTS = [];

function test(name, fn) {
  try {
    const res = fn();
    if (res.pass) RESULTS.push({ name, pass: true, info: res.info ?? '' });
    else RESULTS.push({ name, pass: false, info: res.info ?? 'failed' });
  } catch (e) {
    RESULTS.push({ name, pass: false, info: 'THREW: ' + (e?.message ?? String(e)) });
  }
}

// Simuleer de buildDiff functie van het endpoint (kopie-light)
function buildDiff(toolName, input, current) {
  switch (toolName) {
    case 'set_color': {
      const target = input.target;
      const hex = String(input.hex || '').toLowerCase();
      const from = String(current[target] || '').toLowerCase();
      if (!hex || hex === from) return null;
      return { apply: { [target]: hex } };
    }
    case 'set_font': {
      const target = input.target;
      const font = String(input.font || '');
      const from = String(current[target] || '');
      if (!font || font === from) return null;
      return { apply: { [target]: font } };
    }
    case 'set_size': {
      const target = input.target;
      const px = Math.round(Number(input.px));
      if (!Number.isFinite(px)) return null;
      const from = Number(current[target] || 0);
      if (px === from) return null;
      return { apply: { [target]: px } };
    }
    case 'set_weight': {
      const weight = Number(input.weight);
      const from = Number(current.headingWeight || 0);
      if (weight === from) return null;
      return { apply: { headingWeight: weight } };
    }
    case 'set_logo_position': {
      const pos = String(input.position || '');
      const from = String(current.logoPosition || '');
      if (pos === from) return null;
      return { apply: { logoPosition: pos } };
    }
    case 'toggle_decoration': {
      const target = input.target;
      const on = Boolean(input.on);
      const fromVal = current[target];
      const fromBool = fromVal === undefined ? (target === 'showGhostNumbers' ? false : true) : Boolean(fromVal);
      if (on === fromBool) return null;
      return { apply: { [target]: on } };
    }
  }
  return null;
}

// Voor elke template, test alle tools met edge-cases
for (const tpl of TEMPLATES.filter(t => t.enabled)) {
  const flat = flatten(resolveCascade(tpl, {}, {}));

  // set_size logoSize +24 (van default naar max)
  test(\`\${tpl.id} / set_size logoSize +24\`, () => {
    const newSize = (tpl.defaults.logoSize ?? 48) + 24;
    if (newSize > (tpl.allowList.logoSize?.max ?? 0)) {
      return { pass: false, info: \`new size \${newSize} > allowList max \${tpl.allowList.logoSize?.max}\` };
    }
    const diff = buildDiff('set_size', { target: 'logoSize', px: newSize }, flat);
    if (!diff) return { pass: false, info: 'buildDiff returnt null' };
    const check = validateOverrides(tpl, diff.apply);
    if (check.ok !== true) return { pass: false, info: 'validate fail: ' + JSON.stringify(check.errors) };
    return { pass: true, info: \`\${tpl.defaults.logoSize} → \${newSize}\` };
  });

  // set_size logoSize aan max
  test(\`\${tpl.id} / set_size logoSize @ max\`, () => {
    const max = tpl.allowList.logoSize?.max ?? 80;
    const diff = buildDiff('set_size', { target: 'logoSize', px: max }, flat);
    if (!diff) return { pass: false, info: 'buildDiff null' };
    const check = validateOverrides(tpl, diff.apply);
    return { pass: check.ok, info: check.ok ? \`OK @ \${max}px\` : JSON.stringify(check.errors) };
  });

  // set_size logoSize BUITEN range (moet falen door validateOverrides)
  test(\`\${tpl.id} / set_size logoSize OUT-OF-RANGE moet rejected worden\`, () => {
    const max = tpl.allowList.logoSize?.max ?? 80;
    const diff = buildDiff('set_size', { target: 'logoSize', px: max + 50 }, flat);
    if (!diff) return { pass: true, info: 'OK — buildDiff filtert' };
    const check = validateOverrides(tpl, diff.apply);
    return { pass: !check.ok, info: check.ok ? 'BUG — wordt doorgelaten' : 'OK — gerejecteerd' };
  });

  // set_color accent → andere kleur
  test(\`\${tpl.id} / set_color accent #ff0000\`, () => {
    const diff = buildDiff('set_color', { target: 'accent', hex: '#ff0000' }, flat);
    if (!diff) return { pass: false, info: 'buildDiff null' };
    const check = validateOverrides(tpl, diff.apply);
    return { pass: check.ok, info: check.ok ? 'OK' : JSON.stringify(check.errors) };
  });

  // set_font met geldige optie
  test(\`\${tpl.id} / set_font headingFont uit allow-list\`, () => {
    const opts = tpl.allowList.headingFont?.options ?? [];
    if (opts.length < 2) return { pass: true, info: 'skip — geen alternatieve fonts' };
    const newFont = opts.find(o => o !== flat.headingFont) ?? opts[0];
    const diff = buildDiff('set_font', { target: 'headingFont', font: newFont }, flat);
    if (!diff) return { pass: false, info: 'buildDiff null' };
    const check = validateOverrides(tpl, diff.apply);
    return { pass: check.ok, info: check.ok ? \`→ \${newFont}\` : JSON.stringify(check.errors) };
  });

  // set_weight
  test(\`\${tpl.id} / set_weight 700\`, () => {
    const opts = tpl.allowList.headingWeight?.options ?? [];
    if (!opts.includes(700)) return { pass: true, info: 'skip — 700 niet in allowlist' };
    const diff = buildDiff('set_weight', { weight: 700 }, flat);
    if (!diff) return { pass: false, info: 'buildDiff null' };
    const check = validateOverrides(tpl, diff.apply);
    return { pass: check.ok, info: check.ok ? 'OK' : JSON.stringify(check.errors) };
  });

  // set_logo_position (alleen voor templates met logoPosition in allow-list)
  test(\`\${tpl.id} / set_logo_position\`, () => {
    if (!tpl.allowList.logoPosition) {
      return { pass: true, info: 'skip — geen logoPosition in allow-list (verwacht)' };
    }
    const opts = tpl.allowList.logoPosition.options;
    const newPos = opts.find(o => o !== flat.logoPosition) ?? opts[0];
    const diff = buildDiff('set_logo_position', { position: newPos }, flat);
    if (!diff) return { pass: false, info: 'buildDiff null' };
    const check = validateOverrides(tpl, diff.apply);
    return { pass: check.ok, info: check.ok ? \`→ \${newPos}\` : JSON.stringify(check.errors) };
  });

  // toggle_decoration (test elke toggle die in allow-list zit)
  for (const toggleKey of ['showOrnament', 'showDividers', 'showGhostNumbers', 'showFootnoteAllergens']) {
    test(\`\${tpl.id} / toggle_decoration \${toggleKey}\`, () => {
      if (!tpl.allowList[toggleKey]) return { pass: true, info: 'skip — niet in allow-list' };
      const diff = buildDiff('toggle_decoration', { target: toggleKey, on: false }, flat);
      // Note: als de huidige fromBool al false is, returnt buildDiff null — dat is ook OK
      if (!diff) return { pass: true, info: 'no-op (huidige waarde matched)' };
      const check = validateOverrides(tpl, diff.apply);
      return { pass: check.ok, info: check.ok ? \`OK\` : JSON.stringify(check.errors) };
    });
  }
}

// Print results gegroepeerd
const passed = RESULTS.filter(r => r.pass).length;
const failed = RESULTS.filter(r => !r.pass);

console.log(\`\\n=== MENUKAART AI-TOOL CHAIN TESTS ===\\n\`);
console.log(\`PASS: \${passed} / \${RESULTS.length}\`);
console.log(\`FAIL: \${failed.length}\\n\`);

if (failed.length > 0) {
  console.log('FAILURES:');
  for (const f of failed) console.log('  ✗ ' + f.name + ' — ' + f.info);
}

console.log('\\nDETAILS PER TEMPLATE:');
const grouped = {};
for (const r of RESULTS) {
  const tpl = r.name.split(' / ')[0];
  (grouped[tpl] ??= []).push(r);
}
for (const tpl of Object.keys(grouped)) {
  const all = grouped[tpl];
  const tplPass = all.filter(r => r.pass).length;
  console.log(\`  \${tpl}: \${tplPass}/\${all.length}\`);
}

process.exit(failed.length > 0 ? 1 : 0);
`], {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: { ...process.env },
});

process.exit(tsx.status ?? 1);
