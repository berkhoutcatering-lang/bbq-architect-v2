'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import type { MepComponentItem, MepStatus } from './KookbordClient';

interface MepItemSheetProps {
  open: boolean;
  item: MepComponentItem | null;
  guests: number;
  onClose: () => void;
  onStatusChange: (itemId: number, status: MepStatus) => void | Promise<void>;
  onSaveNotes?: (itemId: number, notes: string) => void | Promise<void>;
  savingNotes?: boolean;
}

const nf = new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 1 });

function formatQty(baseQty: number, baseUnit: string, guests: number): string {
  const total = Number(baseQty ?? 0) * Number(guests ?? 0);
  const unit = (baseUnit || 'stuks').toLowerCase();
  if (unit === 'g' && total >= 1000) return `${nf.format(total / 1000)} kg`;
  if (unit === 'ml' && total >= 1000) return `${nf.format(total / 1000)} L`;
  return `${nf.format(total)} ${baseUnit || 'stuks'}`;
}

function statusLabel(s: MepStatus): string {
  if (s === 'bezig') return 'Bezig';
  if (s === 'klaar') return 'Klaar';
  return 'Te doen';
}

function badgeCls(s: MepStatus): string {
  if (s === 'bezig') return 'bg-amber-900 text-amber-200 border-amber-700';
  if (s === 'klaar') return 'bg-green-900 text-green-200 border-green-700';
  return 'bg-gray-800 text-gray-200 border-gray-600';
}

function ctaAction(s: MepStatus): { label: string; next: MepStatus; cls: string } {
  if (s === 'todo') return { label: 'Start voorbereiding', next: 'bezig', cls: 'bg-amber-600 text-white hover:bg-amber-500' };
  if (s === 'bezig') return { label: 'Markeer klaar', next: 'klaar', cls: 'bg-green-600 text-white hover:bg-green-500' };
  return { label: 'Zet terug', next: 'todo', cls: 'bg-gray-700 text-gray-100 hover:bg-gray-600' };
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

export default function MepItemSheet({
  open,
  item,
  guests,
  onClose,
  onStatusChange,
  onSaveNotes,
  savingNotes = false,
}: MepItemSheetProps) {
  const [notesDraft, setNotesDraft] = useState('');

  useEffect(() => {
    setNotesDraft(item?.notes ?? '');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.mep_item_id, open]);

  if (!open || !item) return null;

  const actie = ctaAction(item.status);
  const stappen = item.preparation_steps ?? [];
  const haccp = item.haccp_points ?? [];
  const allergenen = (item.allergens ?? []).map(a => a.allergen_code?.toUpperCase?.() ?? '').filter(Boolean);
  const tags = item.flavor_tags ?? [];

  return (
    <>
      <button type="button" className="fixed inset-0 z-40 bg-black/60" onClick={onClose} aria-label="Sluiten" />

      <section className="fixed inset-x-0 bottom-0 z-50 flex h-5/6 flex-col rounded-t-2xl border-t border-gray-700 bg-gray-900 text-white shadow-2xl">
        {/* Header */}
        <header className="border-b border-gray-700 px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="truncate text-xl font-semibold">{item.name}</h2>
              <span className={`mt-2 inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${badgeCls(item.status)}`}>
                {statusLabel(item.status)}
              </span>
            </div>
            <button type="button" onClick={onClose} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-gray-800 text-gray-200" aria-label="Sluiten">
              <X className="h-5 w-5" />
            </button>
          </div>
        </header>

        {/* Scrollable body */}
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {/* Meta */}
          <section className="rounded-xl border border-gray-700 bg-gray-800 p-3">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-gray-400">Hoeveelheid</p>
                <p className="mt-1 font-semibold text-white">{formatQty(item.base_quantity, item.base_unit, guests)}</p>
              </div>
              <div>
                <p className="text-gray-400">Type</p>
                <p className="mt-1 font-semibold text-white">{item.type === 'bought_in' ? 'Ingekocht' : 'Bereid'}</p>
              </div>
            </div>
            {tags.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {tags.map(tag => (
                  <span key={`${item.mep_item_id}-tag-${tag}`} className="rounded-full bg-gray-700 px-2 py-1 text-xs text-gray-200">{tag}</span>
                ))}
              </div>
            ) : null}
          </section>

          {/* Bereidingswijze */}
          {stappen.length > 0 ? (
            <section className="rounded-xl border border-gray-700 bg-gray-800 p-3">
              <h3 className="text-base font-semibold">Bereidingswijze</h3>
              <ol className="mt-2 space-y-2">
                {stappen.map((stap, i) => (
                  <li key={`${item.mep_item_id}-step-${i}`} className="rounded-lg bg-gray-700 p-3 text-sm">
                    <span className="font-semibold">{i + 1}. </span>{stap}
                  </li>
                ))}
              </ol>
            </section>
          ) : null}

          {/* HACCP */}
          {haccp.length > 0 ? (
            <section className="rounded-xl border border-gray-700 bg-gray-800 p-3">
              <h3 className="text-base font-semibold">HACCP</h3>
              <ul className="mt-2 space-y-2">
                {haccp.map((pt, i) => (
                  <li key={`${item.mep_item_id}-haccp-${i}`} className="rounded-lg bg-gray-700 p-3 text-sm">
                    <p className="font-semibold">{pt.type}</p>
                    {pt.threshold_value != null ? (
                      <p className="mt-1 text-gray-200">Drempel: {pt.threshold_value}{pt.threshold_unit ? ` ${pt.threshold_unit}` : ''}</p>
                    ) : null}
                    {pt.note ? <p className="mt-1 text-gray-300">{pt.note}</p> : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {/* Allergenen */}
          {allergenen.length > 0 ? (
            <section className="rounded-xl border border-gray-700 bg-gray-800 p-3">
              <h3 className="text-base font-semibold">Allergenen</h3>
              <div className="mt-2 flex flex-wrap gap-2">
                {allergenen.map(code => (
                  <span key={`${item.mep_item_id}-allergen-${code}`} className={`rounded-full border px-2 py-1 text-xs font-medium ${allergenCls(code)}`}>
                    {code}
                  </span>
                ))}
              </div>
            </section>
          ) : null}

          {/* Notities */}
          <section className="rounded-xl border border-gray-700 bg-gray-800 p-3">
            <h3 className="text-base font-semibold">Notities</h3>
            <textarea
              value={notesDraft}
              onChange={e => setNotesDraft(e.target.value)}
              placeholder="Voeg notities toe..."
              className="mt-2 h-28 w-full rounded-lg border border-gray-600 bg-gray-900 p-3 text-sm text-white outline-none"
            />
            <button
              type="button"
              onClick={() => void onSaveNotes?.(item.mep_item_id, notesDraft)}
              disabled={!onSaveNotes || savingNotes}
              className="mt-2 h-12 w-full rounded-lg bg-gray-700 text-sm font-semibold text-white disabled:opacity-50"
            >
              {savingNotes ? 'Opslaan...' : 'Notities opslaan'}
            </button>
          </section>
        </div>

        {/* Footer CTA */}
        <footer className="border-t border-gray-700 p-3">
          <button
            type="button"
            onClick={() => void onStatusChange(item.mep_item_id, actie.next)}
            className={`h-14 w-full rounded-xl text-sm font-semibold ${actie.cls}`}
          >
            {actie.label}
          </button>
        </footer>
      </section>
    </>
  );
}
