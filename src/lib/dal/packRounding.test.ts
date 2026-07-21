import { describe, it, expect } from 'vitest';
import { roundUpToPack, packConvFactor } from './packRounding';

describe('packConvFactor', () => {
  it('gelijke eenheden = 1', () => {
    expect(packConvFactor('kg', 'kg')).toBe(1);
    expect(packConvFactor('stuk', 'stuks')).toBe(1);
  });
  it('gewicht/volume-conversie', () => {
    expect(packConvFactor('g', 'kg')).toBe(0.001);
    expect(packConvFactor('kg', 'g')).toBe(1000);
    expect(packConvFactor('ml', 'liter')).toBe(0.001);
  });
  it('onverenigbaar = null', () => {
    expect(packConvFactor('stuk', 'kg')).toBeNull();
    expect(packConvFactor('kg', 'liter')).toBeNull();
  });
});

describe('roundUpToPack', () => {
  it("Sam's voorbeeld: 40 tekort, pak van 100 stuks → bestel 100 (1 pak)", () => {
    const r = roundUpToPack(40, 'stuks', { package_size: 100, package_unit: 'stuk' });
    expect(r.qty_ordered).toBe(100);
    expect(r.packs).toBe(1);
    expect(r.rounded).toBe(true);
    expect(r.reason).toBe('ok');
  });

  it('12,4 kg nodig, doos van 5 kg → 15 kg (3 dozen)', () => {
    const r = roundUpToPack(12.4, 'kg', { package_size: 5, package_unit: 'kg' });
    expect(r.qty_ordered).toBe(15);
    expect(r.packs).toBe(3);
  });

  it('exact een heel aantal pakken → niet extra afronden', () => {
    const r = roundUpToPack(10, 'kg', { package_size: 5, package_unit: 'kg' });
    expect(r.qty_ordered).toBe(10);
    expect(r.packs).toBe(2);
    expect(r.rounded).toBe(false);
  });

  it('g→kg conversie: pak 5000 g, inventory in kg, 2,4 kg nodig → 5 kg', () => {
    const r = roundUpToPack(2.4, 'kg', { package_size: 5000, package_unit: 'g' });
    expect(r.qty_ordered).toBe(5);
    expect(r.packs).toBe(1);
  });

  it('geen pakmaat → 1-op-1, gemarkeerd', () => {
    const r = roundUpToPack(2.4, 'kg', { package_size: null, package_unit: null });
    expect(r.qty_ordered).toBe(2.4);
    expect(r.packs).toBeNull();
    expect(r.reason).toBe('no_pack');
  });

  it('onverenigbare eenheid → niet afronden, gemarkeerd', () => {
    const r = roundUpToPack(2.4, 'kg', { package_size: 10, package_unit: 'stuk' });
    expect(r.qty_ordered).toBe(2.4);
    expect(r.reason).toBe('incompatible_unit');
  });

  it('nul vraag → 0', () => {
    const r = roundUpToPack(0, 'kg', { package_size: 5, package_unit: 'kg' });
    expect(r.qty_ordered).toBe(0);
    expect(r.reason).toBe('zero_demand');
  });

  it('nodig < 1 pak → altijd minstens 1 heel pak', () => {
    const r = roundUpToPack(0.1, 'kg', { package_size: 10, package_unit: 'kg' });
    expect(r.qty_ordered).toBe(10);
    expect(r.packs).toBe(1);
  });

  it('MOQ in hele pakken wordt gerespecteerd', () => {
    const r = roundUpToPack(3, 'kg', { package_size: 5, package_unit: 'kg', moq_packs: 2 });
    expect(r.packs).toBe(2); // 1 pak zou genoeg zijn, maar MOQ = 2
    expect(r.qty_ordered).toBe(10);
  });
});
