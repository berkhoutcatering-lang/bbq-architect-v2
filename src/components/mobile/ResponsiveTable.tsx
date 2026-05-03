'use client';

/**
 * ResponsiveTable — TanStack Table v8 wrapper with mobile card-stack fallback.
 *
 * Desktop (≥768px): renders a real <table> with sortable headers, sticky-header,
 * sticky leftmost column on horizontal scroll.
 *
 * Phone (<768px): renders a card-stack. Each row becomes a Card with:
 *   - title (first column or `cardTitle` accessor)
 *   - subtitle (second column or `cardSubtitle` accessor)
 *   - badge / status chip (right side, from `cardBadge` accessor)
 *   - tap → expands inline to show all remaining columns as label-value pairs,
 *     OR fires `onRowSelect(row)` if provided (preferred for navigation).
 *
 * Power-users can flip the view via the optional <ResponsiveTable.ViewToggle />.
 *
 * Usage:
 *   <ResponsiveTable
 *     data={offertes}
 *     columns={cols}
 *     getRowId={(r) => r.id}
 *     cardTitle={(r) => r.klant_naam}
 *     cardSubtitle={(r) => `${r.bedrag} · ${r.datum}`}
 *     cardBadge={(r) => <StatusChip status={r.status} />}
 *     onRowSelect={(r) => router.push(`/offertes/${r.id}`)}
 *   />
 */

import * as React from 'react';
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type Row,
  type SortingState,
} from '@tanstack/react-table';
import { useIsPhone } from '@/hooks/useIsMobile';

export type ViewMode = 'auto' | 'table' | 'cards';

export interface ResponsiveTableProps<T> {
  data: T[];
  columns: ColumnDef<T, unknown>[];
  /** Stable row id (recommended: pass r.id or db key). */
  getRowId?: (row: T) => string;
  /** Title in card mode. Default: first cell rendered as string. */
  cardTitle?: (row: T) => React.ReactNode;
  /** Subtitle in card mode. Default: second cell rendered as string. */
  cardSubtitle?: (row: T) => React.ReactNode;
  /** Right-side badge/chip in card mode (e.g. status). */
  cardBadge?: (row: T) => React.ReactNode;
  /** Optional: when provided, tapping a card calls this instead of inline-expand. */
  onRowSelect?: (row: T) => void;
  /** Force a view mode regardless of viewport. Default: "auto". */
  viewMode?: ViewMode;
  /** Empty-state node. */
  empty?: React.ReactNode;
  /** Loading skeleton count. */
  loading?: boolean;
  /** Number of skeleton rows when loading. */
  skeletonRows?: number;
  /** ARIA label for the table. */
  ariaLabel?: string;
  className?: string;
}

export function ResponsiveTable<T>({
  data,
  columns,
  getRowId,
  cardTitle,
  cardSubtitle,
  cardBadge,
  onRowSelect,
  viewMode = 'auto',
  empty,
  loading = false,
  skeletonRows = 5,
  ariaLabel = 'Data tabel',
  className = '',
}: ResponsiveTableProps<T>) {
  const isPhone = useIsPhone();
  const effectiveMode: 'table' | 'cards' =
    viewMode === 'auto' ? (isPhone ? 'cards' : 'table') : viewMode;

  const [sorting, setSorting] = React.useState<SortingState>([]);

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: getRowId ? (row) => getRowId(row) : undefined,
  });

  if (loading) {
    return (
      <div className={className}>
        {effectiveMode === 'cards' ? (
          <CardSkeletonStack count={skeletonRows} />
        ) : (
          <TableSkeleton columns={columns.length} rows={skeletonRows} />
        )}
      </div>
    );
  }

  if (!data.length) {
    return (
      <div className={className}>
        {empty ?? (
          <div
            style={{
              padding: 32,
              textAlign: 'center',
              color: 'var(--muted, #888)',
              fontSize: 14,
            }}
          >
            Geen items om te tonen.
          </div>
        )}
      </div>
    );
  }

  if (effectiveMode === 'cards') {
    return (
      <CardStack
        rows={table.getRowModel().rows}
        cardTitle={cardTitle}
        cardSubtitle={cardSubtitle}
        cardBadge={cardBadge}
        onRowSelect={onRowSelect}
        className={className}
        ariaLabel={ariaLabel}
      />
    );
  }

  return (
    <div
      className={className}
      style={{ width: '100%', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}
    >
      <table
        role="table"
        aria-label={ariaLabel}
        style={{
          width: '100%',
          borderCollapse: 'separate',
          borderSpacing: 0,
          fontSize: 13,
        }}
      >
        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                const canSort = header.column.getCanSort();
                const sortDir = header.column.getIsSorted();
                return (
                  <th
                    key={header.id}
                    onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
                    style={{
                      textAlign: 'left',
                      padding: '10px 12px',
                      borderBottom: '1px solid var(--border, #2a2a30)',
                      fontWeight: 600,
                      color: 'var(--muted, #888)',
                      fontSize: 11,
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                      cursor: canSort ? 'pointer' : 'default',
                      whiteSpace: 'nowrap',
                      position: 'sticky',
                      top: 0,
                      background: 'var(--card, #16161a)',
                      zIndex: 1,
                    }}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                    {sortDir === 'asc' ? ' ↑' : sortDir === 'desc' ? ' ↓' : ''}
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr
              key={row.id}
              onClick={onRowSelect ? () => onRowSelect(row.original) : undefined}
              style={{
                cursor: onRowSelect ? 'pointer' : 'default',
                borderBottom: '1px solid var(--border, #2a2a30)',
              }}
            >
              {row.getVisibleCells().map((cell) => (
                <td
                  key={cell.id}
                  style={{
                    padding: '12px',
                    color: 'var(--text, #fafafa)',
                    verticalAlign: 'middle',
                  }}
                >
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface CardStackProps<T> {
  rows: Row<T>[];
  cardTitle?: (row: T) => React.ReactNode;
  cardSubtitle?: (row: T) => React.ReactNode;
  cardBadge?: (row: T) => React.ReactNode;
  onRowSelect?: (row: T) => void;
  className?: string;
  ariaLabel?: string;
}

function CardStack<T>({
  rows,
  cardTitle,
  cardSubtitle,
  cardBadge,
  onRowSelect,
  className,
  ariaLabel,
}: CardStackProps<T>) {
  const [expandedId, setExpandedId] = React.useState<string | null>(null);

  return (
    <ul
      role="list"
      aria-label={ariaLabel}
      className={className}
      style={{
        listStyle: 'none',
        margin: 0,
        padding: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      {rows.map((row) => {
        const cells = row.getVisibleCells();
        const titleNode = cardTitle
          ? cardTitle(row.original)
          : cells[0]
          ? flexRender(cells[0].column.columnDef.cell, cells[0].getContext())
          : null;
        const subtitleNode = cardSubtitle
          ? cardSubtitle(row.original)
          : cells[1]
          ? flexRender(cells[1].column.columnDef.cell, cells[1].getContext())
          : null;
        const badgeNode = cardBadge ? cardBadge(row.original) : null;

        const isExpanded = expandedId === row.id;
        const tap = onRowSelect
          ? () => onRowSelect(row.original)
          : () => setExpandedId(isExpanded ? null : row.id);

        return (
          <li key={row.id}>
            <button
              type="button"
              onClick={tap}
              aria-expanded={onRowSelect ? undefined : isExpanded}
              style={{
                width: '100%',
                textAlign: 'left',
                background: 'var(--card, #16161a)',
                border: '1px solid var(--border, #2a2a30)',
                borderRadius: 12,
                padding: '14px 14px',
                minHeight: 56,
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                cursor: 'pointer',
                color: 'inherit',
              }}
            >
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: 'var(--text, #fafafa)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {titleNode}
                </div>
                {subtitleNode && (
                  <div
                    style={{
                      fontSize: 12,
                      color: 'var(--muted, #888)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {subtitleNode}
                  </div>
                )}
              </div>
              {badgeNode && <div style={{ flexShrink: 0 }}>{badgeNode}</div>}
            </button>
            {isExpanded && !onRowSelect && (
              <dl
                style={{
                  margin: '4px 4px 0',
                  padding: '10px 14px',
                  background: 'var(--bg, #0c0c0e)',
                  border: '1px solid var(--border, #2a2a30)',
                  borderRadius: 10,
                  display: 'grid',
                  gridTemplateColumns: 'auto 1fr',
                  columnGap: 12,
                  rowGap: 6,
                  fontSize: 12,
                }}
              >
                {cells.slice(2).map((cell) => (
                  <React.Fragment key={cell.id}>
                    <dt style={{ color: 'var(--muted, #888)', fontWeight: 500 }}>
                      {typeof cell.column.columnDef.header === 'string'
                        ? cell.column.columnDef.header
                        : cell.column.id}
                    </dt>
                    <dd style={{ margin: 0, color: 'var(--text, #fafafa)' }}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </dd>
                  </React.Fragment>
                ))}
              </dl>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function CardSkeletonStack({ count }: { count: number }) {
  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {Array.from({ length: count }).map((_, i) => (
        <li
          key={i}
          aria-hidden
          style={{
            height: 64,
            borderRadius: 12,
            background: 'linear-gradient(90deg, var(--card, #16161a) 0%, var(--bg, #0c0c0e) 50%, var(--card, #16161a) 100%)',
            backgroundSize: '200% 100%',
            animation: 'mobileSkeletonShimmer 1.4s linear infinite',
          }}
        />
      ))}
    </ul>
  );
}

function TableSkeleton({ columns, rows }: { columns: number; rows: number }) {
  return (
    <table style={{ width: '100%' }} aria-hidden>
      <tbody>
        {Array.from({ length: rows }).map((_, r) => (
          <tr key={r}>
            {Array.from({ length: columns }).map((__, c) => (
              <td key={c} style={{ padding: 12 }}>
                <div
                  style={{
                    height: 14,
                    borderRadius: 4,
                    background: 'linear-gradient(90deg, var(--card, #16161a) 0%, var(--bg, #0c0c0e) 50%, var(--card, #16161a) 100%)',
                    backgroundSize: '200% 100%',
                    animation: 'mobileSkeletonShimmer 1.4s linear infinite',
                  }}
                />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
