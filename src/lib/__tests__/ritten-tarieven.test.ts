import { describe, it, expect } from 'vitest';
import {
  bedragAftrekbaar,
  tariefVoorJaar,
  kwartaalRange,
  huidigKwartaal,
} from '../ritten-tarieven';

// Pillar #4 regression-guard: tarieven NOOIT AI-derive.
// Als deze tests breken, is iemand het tarief-systeem aan het verbouwen — review extra zorgvuldig.

describe('Pillar #4: tarief in code, niet in AI', () => {
  it('2026 tarief = €0,23/km', () => {
    expect(tariefVoorJaar(2026)).toBe(0.23);
  });
  it('2025 tarief = €0,23/km', () => {
    expect(tariefVoorJaar(2025)).toBe(0.23);
  });
  it('onbekend jaar valt terug op default 0,23', () => {
    expect(tariefVoorJaar(2099)).toBe(0.23);
  });
});

describe('bedragAftrekbaar', () => {
  it('zakelijk 100km in 2026 = €23,00', () => {
    expect(bedragAftrekbaar({ kilometers: 100, zakelijk: true, datum: '2026-06-15' })).toBe(23);
  });
  it('privé rit = €0', () => {
    expect(bedragAftrekbaar({ kilometers: 100, zakelijk: false, datum: '2026-06-15' })).toBe(0);
  });
  it('gemengd: 100km met 30km privé-omleiding = €16,10', () => {
    expect(
      bedragAftrekbaar({
        kilometers: 100,
        zakelijk: true,
        priveOmleidingKm: 30,
        datum: '2026-06-15',
      }),
    ).toBe(16.1);
  });
  it('omleiding > kilometers wordt afgekapt op 0', () => {
    expect(
      bedragAftrekbaar({
        kilometers: 50,
        zakelijk: true,
        priveOmleidingKm: 100,
        datum: '2026-06-15',
      }),
    ).toBe(0);
  });
  it('Date-object wordt geaccepteerd', () => {
    expect(bedragAftrekbaar({ kilometers: 50, zakelijk: true, datum: new Date('2026-06-15') })).toBe(11.5);
  });
});

describe('kwartaalRange', () => {
  it('Q1 2026 = 2026-01-01 t/m 2026-03-31', () => {
    expect(kwartaalRange(2026, 1)).toEqual({ start: '2026-01-01', eind: '2026-03-31' });
  });
  it('Q2 2026 = 2026-04-01 t/m 2026-06-30', () => {
    expect(kwartaalRange(2026, 2)).toEqual({ start: '2026-04-01', eind: '2026-06-30' });
  });
  it('Q4 2026 = 2026-10-01 t/m 2026-12-31', () => {
    expect(kwartaalRange(2026, 4)).toEqual({ start: '2026-10-01', eind: '2026-12-31' });
  });
});

describe('huidigKwartaal', () => {
  it('mei = Q2', () => {
    expect(huidigKwartaal(new Date('2026-05-15'))).toBe(2);
  });
  it('januari = Q1', () => {
    expect(huidigKwartaal(new Date('2026-01-01'))).toBe(1);
  });
  it('december = Q4', () => {
    expect(huidigKwartaal(new Date('2026-12-31'))).toBe(4);
  });
});
