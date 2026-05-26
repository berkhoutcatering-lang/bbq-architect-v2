/**
 * BonTable — Tabel-mode met TanStack Table v8 + density-toggle.
 *
 * Design DNA uit Claude archief-tabel.jsx.
 * Sortable kolommen via TanStack (geen handgeschreven sort), sticky header,
 * bulk-action bar onderaan wanneer selectedIds > 0.
 *
 * Density toggle via nuqs ?density=compact/comfortable.
 * Kolommen: select / Datum / Leverancier / Bedrag / BTW-split / Categorie+RGS / Status / Tags
 */
'use client';

import { useMemo } from 'react';
import {
    flexRender,
    getCoreRowModel,
    getSortedRowModel,
    useReactTable,
    createColumnHelper,
    type SortingState,
} from '@tanstack/react-table';
import { useState } from 'react';
import { useQueryState, parseAsStringEnum } from 'nuqs';
import { ChevronUp, ChevronDown, Lock, Tag, Download, Sparkles } from 'lucide-react';
import type { BonRow } from '@/lib/dal/bonnen';
import { getStatusVisual } from '../_lib/statusMap';
import { fmtEur, fmtDateShort } from './format';

interface Props {
    bonnen: BonRow[];
    selectedIds: number[];
    onSelect: (id: number) => void;
    onSelectAll: () => void;
    onBonClick: (bon: BonRow) => void;
    onBulkTag?: () => void;
    onBulkExport?: () => void;
}

const columnHelper = createColumnHelper<BonRow>();

export function BonTable({
    bonnen,
    selectedIds,
    onSelect,
    onSelectAll,
    onBonClick,
    onBulkTag,
    onBulkExport,
}: Props) {
    const [density, setDensity] = useQueryState(
        'density',
        parseAsStringEnum(['compact', 'comfortable']).withDefault('comfortable'),
    );
    const [sorting, setSorting] = useState<SortingState>([{ id: 'datum', desc: true }]);

    const pad = density === 'compact' ? 'px-3 py-2' : 'px-3.5 py-3';
    const fs = density === 'compact' ? 'text-[11px]' : 'text-[12px]';
    const allSelected = bonnen.length > 0 && bonnen.every((b) => selectedIds.includes(b.id));

    const columns = useMemo(
        () => [
            columnHelper.display({
                id: 'select',
                header: () => (
                    <input
                        type="checkbox"
                        aria-label="Selecteer alle bonnen"
                        checked={allSelected}
                        onChange={onSelectAll}
                        style={{ accentColor: 'var(--brand)' }}
                    />
                ),
                cell: ({ row }) => (
                    <input
                        type="checkbox"
                        aria-label={`Selecteer bon ${row.original.id}`}
                        checked={selectedIds.includes(row.original.id)}
                        onChange={(e) => {
                            e.stopPropagation();
                            onSelect(row.original.id);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        style={{ accentColor: 'var(--brand)' }}
                    />
                ),
                size: 36,
                enableSorting: false,
            }),
            columnHelper.accessor('datum', {
                header: 'Datum',
                cell: ({ getValue }) => (
                    <span className="whitespace-nowrap tabular-nums text-[var(--muted)]">
                        {fmtDateShort(getValue())}
                    </span>
                ),
            }),
            columnHelper.accessor((row) => row.leverancier_naam ?? row.winkel, {
                id: 'leverancier',
                header: 'Leverancier',
                cell: ({ row, getValue }) => (
                    <div className="flex items-center gap-2 font-semibold">
                        {(getValue() as string) ?? '—'}
                        {row.original.locked_at && <Lock size={10} className="text-[var(--blue)]" />}
                    </div>
                ),
            }),
            columnHelper.accessor('totaal_bedrag', {
                header: 'Bedrag',
                cell: ({ getValue }) => (
                    <span className="block text-right font-mono font-medium tabular-nums">
                        {fmtEur(Number(getValue() ?? 0))}
                    </span>
                ),
            }),
            columnHelper.display({
                id: 'btw',
                header: 'BTW',
                cell: ({ row }) => (
                    <div className="block text-right font-mono text-[var(--muted)] tabular-nums">
                        <div>9%: {fmtEur(Number(row.original.btw_laag_bedrag ?? 0))}</div>
                        <div>21%: {fmtEur(Number(row.original.btw_hoog_bedrag ?? 0))}</div>
                    </div>
                ),
                enableSorting: false,
            }),
            columnHelper.accessor('categorie', {
                header: 'Categorie (RGS)',
                cell: ({ row, getValue }) => (
                    <div className="flex items-center gap-1.5">
                        <span className="text-[var(--muted)]">{(getValue() as string) ?? '—'}</span>
                        {row.original.rgs_code && (
                            <span className="font-mono text-[10px] text-[var(--muted-light)]">
                                {row.original.rgs_code}
                            </span>
                        )}
                    </div>
                ),
            }),
            columnHelper.accessor('status', {
                header: 'Status',
                cell: ({ getValue }) => {
                    const v = getStatusVisual(getValue());
                    return (
                        <span
                            className={`inline-flex items-center gap-1 rounded-[6px] border px-1.5 py-0.5 text-[10px] font-semibold ${v.pillClass}`}
                        >
                            {v.label}
                        </span>
                    );
                },
            }),
            columnHelper.accessor('tags', {
                header: 'Tags',
                cell: ({ getValue }) => {
                    const tags = (getValue() as string[] | null) ?? [];
                    return (
                        <div className="flex flex-wrap gap-1">
                            {tags.slice(0, 2).map((t) => (
                                <span
                                    key={t}
                                    className="rounded-[4px] px-1.5 py-0.5 text-[9px] text-[var(--muted)]"
                                    style={{ background: 'rgba(130,130,130,.08)' }}
                                >
                                    {t}
                                </span>
                            ))}
                            {tags.length > 2 && (
                                <span className="text-[9px] text-[var(--muted-light)]">+{tags.length - 2}</span>
                            )}
                        </div>
                    );
                },
                enableSorting: false,
            }),
        ],
        [allSelected, onSelect, onSelectAll, selectedIds],
    );

    const table = useReactTable({
        data: bonnen,
        columns,
        state: { sorting },
        onSortingChange: setSorting,
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
    });

    return (
        <div>
            {/* Density toggle */}
            <div className="mb-2 flex justify-end gap-1">
                {(['compact', 'comfortable'] as const).map((d) => (
                    <button
                        type="button"
                        key={d}
                        onClick={() => void setDensity(d)}
                        className={`rounded-[6px] border px-2.5 py-1 text-[10px] font-semibold capitalize transition`}
                        style={
                            density === d
                                ? {
                                      background: 'rgba(255,191,0,.1)',
                                      color: 'var(--brand)',
                                      borderColor: 'rgba(255,191,0,.25)',
                                  }
                                : {
                                      background: 'transparent',
                                      color: 'var(--muted)',
                                      borderColor: 'transparent',
                                  }
                        }
                    >
                        {d}
                    </button>
                ))}
            </div>

            {/* Table */}
            <div
                className="relative overflow-hidden rounded-[14px] border"
                style={{
                    borderColor: 'var(--border)',
                    background: 'var(--card)',
                    backdropFilter: 'var(--glass-blur)',
                }}
            >
                {/* Gold hairline */}
                <div
                    className="absolute top-0 left-[10%] right-[10%] z-10 h-px"
                    style={{
                        background: 'linear-gradient(90deg,transparent,rgba(196,163,90,.3),transparent)',
                    }}
                />

                <div className="overflow-x-auto">
                    <table className={`w-full border-collapse ${fs}`}>
                        <thead>
                            {table.getHeaderGroups().map((hg) => (
                                <tr key={hg.id}>
                                    {hg.headers.map((header) => {
                                        const canSort = header.column.getCanSort();
                                        const sortDir = header.column.getIsSorted();
                                        const colId = header.column.id;
                                        const align = colId === 'totaal_bedrag' || colId === 'btw' ? 'text-right' : 'text-left';
                                        return (
                                            <th
                                                key={header.id}
                                                className={`sticky top-0 z-10 border-b text-[10px] font-bold uppercase tracking-[.12em] ${pad} ${align}`}
                                                style={{
                                                    background: 'var(--bg-elevated)',
                                                    borderColor: 'var(--border)',
                                                    color: sortDir ? 'var(--text)' : 'var(--muted)',
                                                    cursor: canSort ? 'pointer' : 'default',
                                                    userSelect: 'none',
                                                    whiteSpace: 'nowrap',
                                                    width: header.column.getSize() === 150 ? undefined : header.column.getSize(),
                                                }}
                                                onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
                                            >
                                                <span className="inline-flex items-center gap-1">
                                                    {flexRender(header.column.columnDef.header, header.getContext())}
                                                    {sortDir === 'asc' && <ChevronUp size={10} />}
                                                    {sortDir === 'desc' && <ChevronDown size={10} />}
                                                </span>
                                            </th>
                                        );
                                    })}
                                </tr>
                            ))}
                        </thead>
                        <tbody>
                            {table.getRowModel().rows.map((row) => {
                                const sel = selectedIds.includes(row.original.id);
                                return (
                                    <tr
                                        key={row.id}
                                        onClick={() => onBonClick(row.original)}
                                        className="ar-table-row cursor-pointer transition"
                                        style={{ background: sel ? 'rgba(255,191,0,.04)' : 'transparent' }}
                                    >
                                        {row.getVisibleCells().map((cell) => (
                                            <td
                                                key={cell.id}
                                                className={`border-b ${pad}`}
                                                style={{ borderColor: 'rgba(130,130,130,.06)' }}
                                            >
                                                {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                            </td>
                                        ))}
                                    </tr>
                                );
                            })}
                            {bonnen.length === 0 && (
                                <tr>
                                    <td colSpan={columns.length} className="py-12 text-center text-[13px] text-[var(--muted)]">
                                        Geen bonnen gevonden met deze filters.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Bulk action bar (floating) */}
            {selectedIds.length > 0 && (
                <div
                    className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-[14px] border px-5 py-3"
                    style={{
                        background: 'var(--bg-elevated)',
                        borderColor: 'var(--border)',
                        boxShadow: '0 12px 40px rgba(0,0,0,.5)',
                        backdropFilter: 'var(--glass-blur)',
                        animation: 'fadeInUp .25s ease both',
                    }}
                >
                    <span className="text-[13px] font-semibold">{selectedIds.length} geselecteerd</span>
                    <div className="h-5 w-px" style={{ background: 'var(--border)' }} />
                    {onBulkTag && (
                        <button
                            type="button"
                            onClick={onBulkTag}
                            className="inline-flex items-center gap-1 rounded-[8px] px-2.5 py-1.5 text-[12px] text-[var(--text)] transition hover:bg-white/[0.05]"
                        >
                            <Tag size={12} />
                            Tag
                        </button>
                    )}
                    {onBulkExport && (
                        <button
                            type="button"
                            onClick={onBulkExport}
                            className="inline-flex items-center gap-1 rounded-[8px] px-2.5 py-1.5 text-[12px] text-[var(--text)] transition hover:bg-white/[0.05]"
                        >
                            <Download size={12} />
                            Export
                        </button>
                    )}
                    <button
                        type="button"
                        className="inline-flex items-center gap-1 rounded-[8px] px-2.5 py-1.5 text-[12px] text-[var(--muted)] transition hover:bg-white/[0.05] hover:text-[var(--text)]"
                        title="Coming soon — AI categoriseert geselecteerde bonnen"
                    >
                        <Sparkles size={12} />
                        AI-categorize
                    </button>
                </div>
            )}
        </div>
    );
}
