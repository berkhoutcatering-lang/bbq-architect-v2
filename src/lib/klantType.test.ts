import { describe, it, expect } from 'vitest';
import { klantTypeVoor, KLANT_TYPE_STANDAARD } from './klantType';

function nepClient(rijen: { type?: string | null }[] | null, faalt = false) {
  const keten = {
    select: () => keten, eq: () => keten, ilike: () => keten,
    limit: async () => { if (faalt) throw new Error('kapot'); return { data: rijen }; },
  };
  return { from: () => keten };
}

describe('klantTypeVoor', () => {
  it('neemt het type van de klantkaart', async () => {
    expect(await klantTypeVoor(nepClient([{ type: 'Festival' }]), 'org', 'Cor Berkhout')).toBe('Festival');
  });
  it('valt terug op Particulier zonder klantkaart', async () => {
    expect(await klantTypeVoor(nepClient([]), 'org', 'Onbekend')).toBe(KLANT_TYPE_STANDAARD);
  });
  it('valt terug op Particulier bij een lege naam of een leeg type', async () => {
    expect(await klantTypeVoor(nepClient([{ type: 'Zakelijk' }]), 'org', '  ')).toBe(KLANT_TYPE_STANDAARD);
    expect(await klantTypeVoor(nepClient([{ type: '' }]), 'org', 'X')).toBe(KLANT_TYPE_STANDAARD);
  });
  it('gooit nooit: een databasefout wordt Particulier', async () => {
    expect(await klantTypeVoor(nepClient(null, true), 'org', 'X')).toBe(KLANT_TYPE_STANDAARD);
  });
});
