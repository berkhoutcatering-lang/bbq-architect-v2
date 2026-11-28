import { describe, it, expect } from 'vitest';
import { THEME_PRESETS } from '../branding';
import { getContrast } from '../contrast';

// Sprint 2 C5 — Contrast regression-guard voor THEME_PRESETS.
// Negen critical pairs × 8 presets = 72 assertions.
//
// Threshold-rationale (real-world B2B SaaS standaard, niet pure-WCAG-orthodox):
//   • Body-text pairs (text + muted): WCAG AA Normal 4.5:1 → AVG-conform, niemand klaagt
//   • UI-pop pairs (primary + accent): WCAG AA Large 3.0:1 → goed voor buttons/icons (18pt+)
//   • Print-pair (primary_print on #fff): 3.0:1 → PDF/logo/print moet leesbaar zijn op wit
//   • Border-pair: 1.5:1 → real-world (Linear/Stripe/Notion) borders zijn subtiel; card-separation
//     gebeurt via shadow + spacing, niet via 3:1-rand. Strenger voor zou de UI lelijk maken.

type PairKey = 'text' | 'muted' | 'primary' | 'primary_print' | 'accent' | 'border';
type BgKey = 'bg' | 'card' | 'white';

interface ContrastPair {
  fg: PairKey;
  bg: BgKey;
  minRatio: number;
  label: string;
}

const PAIRS: ContrastPair[] = [
  { fg: 'text', bg: 'bg', minRatio: 4.5, label: 'text/bg' },
  { fg: 'text', bg: 'card', minRatio: 4.5, label: 'text/card' },
  { fg: 'muted', bg: 'bg', minRatio: 4.5, label: 'muted/bg' },
  { fg: 'muted', bg: 'card', minRatio: 4.5, label: 'muted/card' },
  { fg: 'accent', bg: 'bg', minRatio: 3.0, label: 'accent/bg' },
  { fg: 'accent', bg: 'card', minRatio: 3.0, label: 'accent/card' },
  { fg: 'primary', bg: 'bg', minRatio: 3.0, label: 'primary/bg' },
  { fg: 'primary_print', bg: 'white', minRatio: 3.0, label: 'primary_print on #fff' },
  { fg: 'border', bg: 'card', minRatio: 1.5, label: 'border/card' },
];

function bgValue(preset: typeof THEME_PRESETS[number], bg: BgKey): string {
  if (bg === 'white') return '#ffffff';
  return preset.tokens[bg];
}

describe('THEME_PRESETS basis-validatie', () => {
  it('heeft exact 8 presets', () => {
    expect(THEME_PRESETS.length).toBe(8);
  });

  it('verdeelt 4 dark / 4 light', () => {
    const dark = THEME_PRESETS.filter(p => p.mode === 'dark').length;
    const light = THEME_PRESETS.filter(p => p.mode === 'light').length;
    expect(dark).toBe(4);
    expect(light).toBe(4);
  });

  it('alle preset-ids zijn uniek', () => {
    const ids = THEME_PRESETS.map(p => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('elke preset heeft alle 8 tokens', () => {
    for (const preset of THEME_PRESETS) {
      const keys = Object.keys(preset.tokens);
      expect(keys.sort()).toEqual(
        ['accent', 'bg', 'border', 'card', 'muted', 'primary', 'primary_print', 'text'],
      );
    }
  });
});

describe('THEME_PRESETS WCAG contrast — 8 presets × 9 pairs', () => {
  for (const preset of THEME_PRESETS) {
    describe(`${preset.name} (${preset.id}, ${preset.mode})`, () => {
      for (const pair of PAIRS) {
        it(`${pair.label} ≥ ${pair.minRatio}:1`, () => {
          const fg = preset.tokens[pair.fg];
          const bg = bgValue(preset, pair.bg);
          const ratio = getContrast(fg, bg);
          if (ratio < pair.minRatio) {
            throw new Error(
              `Preset "${preset.id}" pair ${pair.label} faalt: ratio ${ratio.toFixed(2)} < ${pair.minRatio} ` +
              `(fg=${fg}, bg=${bg})`,
            );
          }
          expect(ratio).toBeGreaterThanOrEqual(pair.minRatio);
        });
      }
    });
  }
});
