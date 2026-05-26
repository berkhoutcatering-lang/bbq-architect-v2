/**
 * ActiveFilterPills — toont alle actieve filters als removable pills,
 * met totaal-tellertje rechts ("18 bonnen · €5.106,37").
 *
 * Design DNA uit Claude archief-kistje.jsx:39-65.
 */
'use client';

import { X } from 'lucide-react';
import { useQueryStates, parseAsArrayOf, parseAsString, parseAsStringEnum } from 'nuqs';
import { fmtEur } from './format';

interface Props {
    filteredCount: number;
    filteredTotal: number;
}

export function ActiveFilterPills({ filteredCount, filteredTotal }: Props) {
    const [filters, setFilters] = useQueryStates({
        datum: parseAsString,
        leverancier: parseAsArrayOf(parseAsString),
        status: parseAsArrayOf(parseAsString),
        type: parseAsArrayOf(parseAsString),
        tags: parseAsArrayOf(parseAsString),
        bedrag: parseAsStringEnum(['lt50', '50-500', 'gt500']),
    });

    interface Pill {
        key: string;
        label: string;
        onRemove: () => void;
    }

    const pills: Pill[] = [];
    if (filters.datum) {
        pills.push({
            key: 'datum',
            label: `Datum: ${filters.datum}`,
            onRemove: () => void setFilters({ datum: null }),
        });
    }
    filters.leverancier?.forEach((l) =>
        pills.push({
            key: `lev-${l}`,
            label: `Leverancier: ${l}`,
            onRemove: () =>
                void setFilters({
                    leverancier: (filters.leverancier ?? []).filter((x) => x !== l),
                }),
        }),
    );
    filters.status?.forEach((s) =>
        pills.push({
            key: `st-${s}`,
            label: `Status: ${s}`,
            onRemove: () =>
                void setFilters({
                    status: (filters.status ?? []).filter((x) => x !== s),
                }),
        }),
    );
    filters.type?.forEach((t) =>
        pills.push({
            key: `ty-${t}`,
            label: `Type: ${t}`,
            onRemove: () =>
                void setFilters({
                    type: (filters.type ?? []).filter((x) => x !== t),
                }),
        }),
    );
    filters.tags?.forEach((t) =>
        pills.push({
            key: `tg-${t}`,
            label: t,
            onRemove: () =>
                void setFilters({
                    tags: (filters.tags ?? []).filter((x) => x !== t),
                }),
        }),
    );
    if (filters.bedrag) {
        pills.push({
            key: 'bedrag',
            label: `Bedrag: ${filters.bedrag}`,
            onRemove: () => void setFilters({ bedrag: null }),
        });
    }

    const clearAll = () =>
        void setFilters({
            datum: null,
            leverancier: null,
            status: null,
            type: null,
            tags: null,
            bedrag: null,
        });

    return (
        <div className="mb-4 flex min-h-[28px] flex-wrap items-center justify-between gap-2">
            <div className="flex flex-1 flex-wrap gap-1.5">
                {pills.map((p) => (
                    <span
                        key={p.key}
                        className="inline-flex items-center gap-1.5 rounded-[6px] border px-2 py-1 text-[11px] font-semibold transition"
                        style={{
                            background: 'rgba(255,191,0,.08)',
                            color: 'var(--brand)',
                            borderColor: 'rgba(255,191,0,.25)',
                        }}
                    >
                        {p.label}
                        <button
                            type="button"
                            onClick={p.onRemove}
                            aria-label={`Verwijder filter ${p.label}`}
                            className="opacity-60 hover:opacity-100"
                        >
                            <X size={10} />
                        </button>
                    </span>
                ))}
                {pills.length > 1 && (
                    <button
                        type="button"
                        onClick={clearAll}
                        className="px-2 py-1 text-[11px] text-[var(--muted)] underline hover:text-[var(--text)]"
                    >
                        Wis alles
                    </button>
                )}
            </div>
            <div className="whitespace-nowrap font-mono text-[12px] tabular-nums text-[var(--muted)]">
                {filteredCount} {filteredCount === 1 ? 'bon' : 'bonnen'} · {fmtEur(filteredTotal)}
            </div>
        </div>
    );
}
