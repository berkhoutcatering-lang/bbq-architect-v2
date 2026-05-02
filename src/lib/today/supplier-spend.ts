/**
 * Aggregeer uitgaven per leverancier uit de bonnen-tabel.
 *
 * v1: alleen € spend per leverancier. Marge per leverancier vereist link
 * `bonnen.bon_items[].naam` ↔ `gerechten.recept_items[]` — eigen ronde later.
 *
 * Lopen door bonnen van laatste 90 dagen (genoeg voor "waar gaat het geld
 * heen?") en sommeren op `leverancier_id`. Als een bon geen FK heeft, valt
 * hij in een "overig"-bucket.
 */

interface BonRow {
  id?: number | string;
  leverancier_id?: number | string | null;
  netto_bedrag?: number | string | null;
  totaal_bedrag?: number | string | null;
  bon_items?: unknown;
  datum?: string | null;
  created_at?: string | null;
}

interface LeverancierRow {
  id: number | string;
  naam?: string | null;
}

export interface SupplierSpendRow {
  id: string;
  label: string;
  spent: number;
}

const LOOKBACK_DAYS = 90;

function bonAmount(b: BonRow): number {
  const n = parseFloat(String(b.netto_bedrag ?? '0'));
  if (Number.isFinite(n) && n > 0) return n;
  const t = parseFloat(String(b.totaal_bedrag ?? '0'));
  if (Number.isFinite(t) && t > 0) return t;
  // Fallback: sommeer bon_items[].totaal
  if (Array.isArray(b.bon_items)) {
    return b.bon_items.reduce((s, it) => {
      const v = parseFloat(String((it as { totaal?: unknown })?.totaal ?? '0'));
      return s + (Number.isFinite(v) ? v : 0);
    }, 0);
  }
  return 0;
}

export function computeSupplierSpend(
  bonnen: BonRow[],
  leveranciers: LeverancierRow[],
  topN = 5,
): SupplierSpendRow[] {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - LOOKBACK_DAYS);
  const cutoffIso = cutoff.toISOString().slice(0, 10);

  const totals = new Map<string, number>();
  for (const b of bonnen) {
    const dateStr = b.datum || (b.created_at ? b.created_at.slice(0, 10) : '');
    if (dateStr && dateStr < cutoffIso) continue;
    const key = b.leverancier_id ? String(b.leverancier_id) : 'overig';
    totals.set(key, (totals.get(key) || 0) + bonAmount(b));
  }

  const namesById = new Map<string, string>();
  for (const l of leveranciers) namesById.set(String(l.id), l.naam || 'Leverancier');

  const rows: SupplierSpendRow[] = [];
  for (const [id, spent] of totals.entries()) {
    if (spent <= 0) continue;
    rows.push({
      id,
      label: id === 'overig' ? 'Overig' : (namesById.get(id) || 'Leverancier'),
      spent: Math.round(spent),
    });
  }
  rows.sort((a, b) => b.spent - a.spent);
  return rows.slice(0, topN);
}
