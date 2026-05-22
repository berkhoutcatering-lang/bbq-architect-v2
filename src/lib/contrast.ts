// WCAG 2.x contrast helpers — parses hex (#rgb / #rrggbb) and oklch() strings.
// Used by theme-contrast.test.ts to guard new presets against unreadable color pairs.

type RGB = [number, number, number];

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

function oklchToOklab(L: number, C: number, H: number): RGB {
  const Hr = (H * Math.PI) / 180;
  return [L, C * Math.cos(Hr), C * Math.sin(Hr)];
}

function oklabToLinearSrgb(L: number, a: number, b: number): RGB {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;
  return [
    clamp01(+4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    clamp01(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    clamp01(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

function parseHex(hex: string): RGB {
  const h = hex.replace('#', '').trim();
  if (h.length !== 3 && h.length !== 6 && h.length !== 8) {
    throw new Error(`Invalid hex color: ${hex}`);
  }
  const expanded =
    h.length === 3
      ? h[0] + h[0] + h[1] + h[1] + h[2] + h[2]
      : h.slice(0, 6);
  const n = parseInt(expanded, 16);
  if (Number.isNaN(n)) throw new Error(`Invalid hex color: ${hex}`);
  return [
    srgbToLinear(((n >> 16) & 255) / 255),
    srgbToLinear(((n >> 8) & 255) / 255),
    srgbToLinear((n & 255) / 255),
  ];
}

function parseOklch(input: string): RGB {
  // Accepts: oklch(0.6 0.18 30), oklch(60% 0.18 30), oklch(0.6 0.18 30 / 0.8)
  const m = input.match(/oklch\(\s*([0-9.]+)(%?)\s+([0-9.]+)\s+([0-9.]+)/i);
  if (!m) throw new Error(`Invalid oklch color: ${input}`);
  const Lraw = parseFloat(m[1]);
  const L = m[2] === '%' ? Lraw / 100 : Lraw;
  const C = parseFloat(m[3]);
  const H = parseFloat(m[4]);
  const [Lab_L, Lab_a, Lab_b] = oklchToOklab(L, C, H);
  return oklabToLinearSrgb(Lab_L, Lab_a, Lab_b);
}

export function parseColor(color: string): RGB {
  const s = color.trim();
  if (s.startsWith('#')) return parseHex(s);
  if (s.toLowerCase().startsWith('oklch')) return parseOklch(s);
  throw new Error(`Unsupported color format: ${color}`);
}

export function getRelativeLuminance(color: string): number {
  const [r, g, b] = parseColor(color);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function getContrast(c1: string, c2: string): number {
  const L1 = getRelativeLuminance(c1);
  const L2 = getRelativeLuminance(c2);
  const lighter = Math.max(L1, L2);
  const darker = Math.min(L1, L2);
  return (lighter + 0.05) / (darker + 0.05);
}

export type WcagLevel = 'AA' | 'AAA';
export type TextSize = 'normal' | 'large';

const WCAG_THRESHOLDS: Record<WcagLevel, Record<TextSize, number>> = {
  AA: { normal: 4.5, large: 3.0 },
  AAA: { normal: 7.0, large: 4.5 },
};

export function meetsWCAG(
  ratio: number,
  level: WcagLevel = 'AA',
  size: TextSize = 'normal',
): boolean {
  return ratio >= WCAG_THRESHOLDS[level][size];
}

// Convert linear-sRGB [0..1] → 8-bit gamma-encoded sRGB [0..255]
function linearToGamma(c: number): number {
  const v = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return Math.max(0, Math.min(255, Math.round(v * 255)));
}

// Convert any supported color (hex or oklch) to a 6-digit hex string.
// Used at save-time to fill the existing brand_* settings columns from THEME_PRESETS' OKLCH tokens.
export function toHex(color: string): string {
  const linear = parseColor(color);
  const r = linearToGamma(linear[0]).toString(16).padStart(2, '0');
  const g = linearToGamma(linear[1]).toString(16).padStart(2, '0');
  const b = linearToGamma(linear[2]).toString(16).padStart(2, '0');
  return `#${r}${g}${b}`;
}
