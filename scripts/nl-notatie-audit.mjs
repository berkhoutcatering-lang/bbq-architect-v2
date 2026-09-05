#!/usr/bin/env node
/**
 * Nederlandse notatie-audit.
 *
 * De app is Nederlands, dus bedragen en percentages horen een komma te hebben:
 * € 1.236,24 en 91,8%. `src/lib/format.ts` doet dat al, maar op tientallen
 * plekken werd eromheen gerekend met `toFixed()`, en dan staat er "91.8%" of
 * "€3.17" op het scherm. Soms zelfs allebei op één regel: het bonnenkistje
 * toonde "TOTAAL €688.49" met daaronder "€ 688,49".
 *
 * Dit script vindt die plekken. Het faalt niet op de bestaande achterstand —
 * het rapporteert alleen, zodat je kunt zien of het aantal daalt in plaats van
 * stijgt. Draai met `node scripts/nl-notatie-audit.mjs`.
 *
 * Wat het NIET meldt:
 *   - bestanden onder src/app/api (die tekst gaat naar een AI, niet naar een mens)
 *   - .test.ts-bestanden
 *   - toFixed() zonder een € of % ernaast (dat is gewoon rekenen)
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const WORTELS = ['src/app', 'src/components', 'src/lib'];
const OVERSLAAN = /\/api\/|\.test\.|__tests__|\/format\.ts$/;

/** Percentage met een punt: `{x.toFixed(1)}%` of `${x.toFixed(2)}%`. */
const PERCENTAGE = /\.toFixed\(\d\)\s*\}?\s*%/;
/** Bedrag met een punt: een euroteken vlakbij een toFixed. */
const BEDRAG = /€[^\n]{0,30}\.toFixed\(\d\)|\.toFixed\(\d\)[^\n]{0,10}€/;

function bestanden(dir) {
  const uit = [];
  for (const naam of readdirSync(dir)) {
    const pad = join(dir, naam);
    if (statSync(pad).isDirectory()) { uit.push(...bestanden(pad)); continue; }
    if (!/\.(tsx?|jsx?)$/.test(pad)) continue;
    if (OVERSLAAN.test(pad)) continue;
    uit.push(pad);
  }
  return uit;
}

const treffers = [];
for (const wortel of WORTELS) {
  for (const pad of bestanden(wortel)) {
    const regels = readFileSync(pad, 'utf8').split('\n');
    regels.forEach((regel, i) => {
      if (regel.trimStart().startsWith('//') || regel.trimStart().startsWith('*')) return;
      const soort = PERCENTAGE.test(regel) ? 'percentage'
        : BEDRAG.test(regel) ? 'bedrag'
        : null;
      if (soort) treffers.push({ pad: relative(process.cwd(), pad), regel: i + 1, soort, tekst: regel.trim().slice(0, 90) });
    });
  }
}

const perSoort = treffers.reduce((acc, t) => { acc[t.soort] = (acc[t.soort] || 0) + 1; return acc; }, {});

console.log(`\nNederlandse notatie — ${treffers.length} plekken die om format.ts heen rekenen`);
console.log(`  percentages: ${perSoort.percentage || 0}   bedragen: ${perSoort.bedrag || 0}\n`);

for (const t of treffers) {
  console.log(`  ${t.pad}:${t.regel}  [${t.soort}]`);
  console.log(`    ${t.tekst}`);
}

if (treffers.length === 0) {
  console.log('  Niets gevonden — alles loopt via format.ts.\n');
} else {
  console.log(`\n  Gebruik formatEur / formatEurInt / formatPercent uit src/lib/format.ts.\n`);
}
