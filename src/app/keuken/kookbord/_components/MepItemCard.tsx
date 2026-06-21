'use client';

import type { MepComponentItem, MepStatus } from './KookbordClient';

interface MepItemCardProps {
  item: MepComponentItem;
  guests: number;
  onTap: () => void;
  onStatusToggle: (itemId: number, newStatus: MepStatus) => void | Promise<void>;
}

const nf = new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 1 });

function formatQty(baseQty: number, baseUnit: string, guests: number): string {
  const total = Number(baseQty ?? 0) * Number(guests ?? 0);
  const unit = (baseUnit || 'stuks').toLowerCase();
  if (unit === 'g' && total >= 1000) return `${nf.format(total / 1000)} kg`;
  if (unit === 'ml' && total >= 1000) return `${nf.format(total / 1000)} L`;
  return `${nf.format(total)} ${baseUnit || 'stuks'}`;
}

function nextStatus(s: MepStatus): MepStatus {
  if (s === 'todo') return 'bezig';
  if (s === 'bezig') return 'klaar';
  return 'todo';
}

function btnLabel(s: MepStatus): string {
  if (s === 'todo') return 'Start';
  if (s === 'bezig') return 'Klaar';
  return 'Terug';
}

function cardCls(s: MepStatus): string {
  if (s === 'bezig') return 'bg-amber-950 border-amber-700';
  if (s === 'klaar') return 'bg-green-950 border-green-700';
  return 'bg-gray-800 border-gray-700';
}

function barCls(s: MepStatus): string {
  if (s === 'bezig') return 'bg-amber-500';
  if (s === 'klaar') return 'bg-green-500';
  return 'bg-gray-600';
}

function btnCls(s: MepStatus): string {
  if (s === 'todo') return 'bg-gray-700 text-white hover:bg-gray-600';
  if (s === 'bezig') return 'bg-green-700 text-white hover:bg-green-600';
  return 'bg-gray-700 text-gray-400 hover:bg-gray-600';
}

const ALLERGEN_CLS: Record<string, string> = {
  GLUTEN: 'border-red-700 bg-red-900 text-red-200',
  CRUSTACEANS: 'border-orange-700 bg-orange-900 text-orange-200',
  EGGS: 'border-yellow-700 bg-yellow-900 text-yellow-200',
  FISH: 'border-sky-700 bg-sky-900 text-sky-200',
  PEANUTS: 'border-amber-700 bg-amber-900 text-amber-200',
  SOY: 'border-lime-700 bg-lime-900 text-lime-200',
  DAIRY: 'border-blue-700 bg-blue-900 text-blue-200',
  NUTS: 'border-orange-700 bg-orange-900 text-orange-200',
  CELERY: 'border-emerald-700 bg-emerald-900 text-emerald-200',
  MUSTARD: 'border-amber-800 bg-amber-950 text-amber-200',
  SESAME: 'border-stone-700 bg-stone-900 text-stone-200',
  SULPHITES: 'border-fuchsia-700 bg-fuchsia-900 text-fuchsia-200',
  LUPIN: 'border-indigo-700 bg-indigo-900 text-indigo-200',
  MOLLUSCS: 'border-cyan-700 bg-cyan-900 text-cyan-200',
};

function allergenCls(code: string): string {
  return ALLERGEN_CLS[code] ?? 'border-gray-600 bg-gray-700 text-gray-100';
}

export default function MepItemCard({ item, guests, onTap, onStatusToggle }: MepItemCardProps) {
  const volgend = nextStatus(item.status);
  const allergenen = (item.allergens ?? [])
    .map(a => a.allergen_code?.toUpperCase?.() ?? '')
    .filter(Boolean);

  return (
    <article className={`relative min-h-32 overflow-hidden rounded-xl border ${cardCls(item.status)}`}>
      <div className={`absolute inset-y-0 left-0 w-1 ${barCls(item.status)}`} />

      <button type="button" onClick={onTap} className="block w-full px-4 pb-2 pl-5 pt-4 text-left">
        <h3 className="text-lg font-bold text-white leading-tight">{item.name}</h3>
        <p className="mt-1 text-sm text-gray-300">{formatQty(item.base_quantity, item.base_unit, guests)}</p>
        {allergenen.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1">
            {allergenen.map(code => (
              <span key={`${item.mep_item_id}-${code}`} className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${allergenCls(code)}`}>
                {code}
              </span>
            ))}
          </div>
        ) : null}
      </button>

      <div className="px-4 pb-4 pl-5">
        <button
          type="button"
          onClick={() => void onStatusToggle(item.mep_item_id, volgend)}
          className={`h-14 w-full rounded-lg text-sm font-semibold ${btnCls(item.status)}`}
        >
          {btnLabel(item.status)}
        </button>
      </div>
    </article>
  );
}
