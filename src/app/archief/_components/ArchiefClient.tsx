'use client';
import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { Search, Filter, X, FileText, ExternalLink, Calendar, Tag, Store, Inbox } from 'lucide-react';
import {
    useReactTable,
    getCoreRowModel,
    getSortedRowModel,
    flexRender,
    createColumnHelper,
    type SortingState,
} from '@tanstack/react-table';
import type { ArchiefBon, ArchiefFilters } from '../_lib/types';

import { formatEur } from '@/lib/format';

interface Props {
    initialBonnen: ArchiefBon[];
    initialTotaal: number;
    leveranciers: Array<{ id: number; naam: string }>;
    tagSuggestions: string[];
    initialFilters: ArchiefFilters;
}

const columnHelper = createColumnHelper<ArchiefBon>();

const STATUS_OPTIONS = [
    { id: 'review', label: 'Review' },
    { id: 'verified', label: 'Bevestigd' },
    { id: 'auto_accepted', label: 'Auto-bevestigd' },
    { id: 'twijfel', label: 'Twijfel' },
    { id: 'rejected', label: 'Afgewezen' },
];

export default function ArchiefClient({ initialBonnen, initialTotaal, leveranciers, tagSuggestions, initialFilters }: Props) {
    const router = useRouter();
    const pathname = usePathname() || '/archief';
    const searchParams = useSearchParams();
    const [preview, setPreview] = useState<ArchiefBon | null>(null);
    const [sorting, setSorting] = useState<SortingState>([{ id: 'datum', desc: true }]);
    /* Local q-state voor instant feedback in input; URL update na debounce. */
    const [qLocal, setQLocal] = useState(initialFilters.q ?? '');
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    /* Wanneer een filter wijzigt → update URL → server re-fetcht via dynamic page. */
    const pushFilter = useCallback(function (next: Partial<ArchiefFilters>) {
        const params = new URLSearchParams(searchParams?.toString() || '');
        const merged: ArchiefFilters = { ...initialFilters, ...next };
        if (merged.q) params.set('q', merged.q); else params.delete('q');
        if (merged.from) params.set('from', merged.from); else params.delete('from');
        if (merged.to) params.set('to', merged.to); else params.delete('to');
        if (merged.leverancier_id) params.set('leverancier', String(merged.leverancier_id)); else params.delete('leverancier');
        if (merged.status) params.set('status', merged.status); else params.delete('status');
        if (merged.tags && merged.tags.length > 0) params.set('tags', merged.tags.join(',')); else params.delete('tags');
        const qs = params.toString();
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }, [router, pathname, searchParams, initialFilters]);

    /* Debounced search-input: voorkomt URL-update + server-fetch bij elke keystroke. */
    useEffect(function () {
        if (qLocal === (initialFilters.q ?? '')) return;
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(function () {
            pushFilter({ q: qLocal });
        }, 350);
        return function () { if (debounceRef.current) clearTimeout(debounceRef.current); };
    }, [qLocal, initialFilters.q, pushFilter]);

    function resetFilters() {
        setQLocal('');
        router.replace(pathname, { scroll: false });
    }

    const leverancierLookup = useMemo(function () {
        const m = new Map<number, string>();
        for (const l of leveranciers) m.set(l.id, l.naam);
        return m;
    }, [leveranciers]);

    const columns = useMemo(function () {
        return [
            columnHelper.accessor('datum', {
                header: 'Datum',
                cell: (info) => {
                    const v = info.getValue();
                    if (!v) return <span style={{ color: 'var(--muted)' }}>—</span>;
                    return <span style={{ fontVariantNumeric: 'tabular-nums' }}>{new Date(v).toLocaleDateString('nl-NL')}</span>;
                },
                size: 110,
            }),
            columnHelper.accessor('winkel', {
                header: 'Leverancier',
                cell: (info) => {
                    const row = info.row.original;
                    const naam = row.leverancier_id ? leverancierLookup.get(row.leverancier_id) : null;
                    return (
                        <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {naam ?? row.winkel ?? '—'}
                            </div>
                            {row.categorie && (
                                <div style={{ fontSize: 11, color: 'var(--muted)' }}>{row.categorie}</div>
                            )}
                        </div>
                    );
                },
                size: 260,
            }),
            columnHelper.accessor('totaal_bedrag', {
                header: 'Totaal',
                cell: (info) => {
                    const v = info.getValue();
                    return (
                        <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: 'var(--text)' }}>
                            {formatEur(Number(v ?? 0))}
                        </span>
                    );
                },
                size: 100,
            }),
            columnHelper.accessor('btw_pct', {
                header: 'BTW',
                cell: (info) => {
                    const v = info.getValue();
                    return v != null ? <span style={{ color: 'var(--muted)', fontSize: 12 }}>{Number(v)}%</span> : <span style={{ color: 'var(--muted)' }}>—</span>;
                },
                size: 60,
            }),
            columnHelper.accessor('status', {
                header: 'Status',
                cell: (info) => {
                    const v = info.getValue();
                    if (!v) return <span style={{ color: 'var(--muted)' }}>—</span>;
                    const tone = v === 'verified' || v === 'auto_accepted' ? '#10b981'
                        : v === 'twijfel' ? '#f59e0b'
                        : v === 'rejected' ? '#ef4444'
                        : 'var(--muted)';
                    const label = STATUS_OPTIONS.find(s => s.id === v)?.label ?? v;
                    return (
                        <span style={{
                            fontSize: 11, padding: '2px 8px', borderRadius: 999,
                            background: tone === 'var(--muted)' ? 'rgba(255,255,255,.05)' : `${tone}15`,
                            color: tone, fontWeight: 600,
                        }}>
                            {label}
                        </span>
                    );
                },
                size: 110,
            }),
            columnHelper.accessor('tags', {
                header: 'Tags',
                cell: (info) => {
                    const tags = info.getValue() ?? [];
                    if (tags.length === 0) return <span style={{ color: 'var(--muted)' }}>—</span>;
                    return (
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            {tags.slice(0, 3).map((t, i) => (
                                <span key={i} style={{
                                    fontSize: 10, padding: '2px 6px', borderRadius: 4,
                                    background: 'rgba(255,191,0,.08)', color: '#FFBF00',
                                    fontWeight: 600,
                                }}>{t}</span>
                            ))}
                            {tags.length > 3 && (
                                <span style={{ fontSize: 10, color: 'var(--muted)' }}>+{tags.length - 3}</span>
                            )}
                        </div>
                    );
                },
                enableSorting: false,
            }),
        ];
    }, [leverancierLookup]);

    const table = useReactTable({
        data: initialBonnen,
        columns,
        state: { sorting },
        onSortingChange: setSorting,
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
    });

    const activeFilterCount =
        (initialFilters.q ? 1 : 0) +
        (initialFilters.from ? 1 : 0) +
        (initialFilters.to ? 1 : 0) +
        (initialFilters.leverancier_id ? 1 : 0) +
        (initialFilters.status ? 1 : 0) +
        (initialFilters.tags?.length ?? 0);

    return (
        <>
            {/* Top-strip: zoek + counts */}
            <div style={{
                display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap',
                marginTop: 18, marginBottom: 14,
            }}>
                <div style={{ position: 'relative', flex: '1 1 280px', minWidth: 260 }}>
                    <Search size={14} style={{
                        position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
                        color: 'var(--muted)', pointerEvents: 'none',
                    }} />
                    <input
                        type="search"
                        value={qLocal}
                        onChange={(e) => setQLocal(e.target.value)}
                        placeholder="Zoek op winkel, item, notitie, tag…"
                        style={{
                            width: '100%', padding: '10px 36px 10px 36px',
                            background: 'rgba(0,0,0,.25)', border: '1px solid var(--border)',
                            borderRadius: 10, color: 'var(--text)', fontSize: 13,
                            minHeight: 40, outline: 'none',
                        }}
                    />
                    {qLocal && (
                        <button
                            onClick={() => setQLocal('')}
                            aria-label="Zoekopdracht wissen"
                            style={{
                                position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                                width: 22, height: 22, borderRadius: 5, background: 'transparent',
                                border: 'none', color: 'var(--muted)', cursor: 'pointer',
                                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            }}
                        ><X size={12} /></button>
                    )}
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                    <strong style={{ color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{initialBonnen.length}</strong> bonnen
                    {' · '}totaal <strong style={{ color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{formatEur(initialTotaal)}</strong>
                </div>
                {activeFilterCount > 0 && (
                    <button
                        onClick={resetFilters}
                        style={{
                            padding: '6px 12px', borderRadius: 7,
                            background: 'transparent', color: 'var(--muted)',
                            border: '1px solid var(--border)', fontSize: 11, fontWeight: 600,
                            cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
                        }}
                    ><X size={11} /> Wis filters ({activeFilterCount})</button>
                )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 240px) minmax(0, 1fr)', gap: 16 }} className="archief-grid">
                {/* Filter sidebar */}
                <aside style={{
                    background: 'rgba(255,255,255,.02)',
                    border: '1px solid var(--border)',
                    borderRadius: 12,
                    padding: 16,
                    height: 'fit-content',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14, fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.1em', fontWeight: 700 }}>
                        <Filter size={11} /> Filters
                    </div>

                    <FilterSection title="Datum" icon={Calendar}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                            <input
                                type="date"
                                value={initialFilters.from ?? ''}
                                onChange={(e) => pushFilter({ from: e.target.value || undefined })}
                                style={dateInputStyle}
                                aria-label="Vanaf datum"
                            />
                            <input
                                type="date"
                                value={initialFilters.to ?? ''}
                                onChange={(e) => pushFilter({ to: e.target.value || undefined })}
                                style={dateInputStyle}
                                aria-label="Tot datum"
                            />
                        </div>
                    </FilterSection>

                    <FilterSection title="Leverancier" icon={Store}>
                        <select
                            value={initialFilters.leverancier_id ?? ''}
                            onChange={(e) => pushFilter({ leverancier_id: e.target.value ? Number(e.target.value) : undefined })}
                            style={selectStyle}
                        >
                            <option value="">Alle</option>
                            {leveranciers.map(l => (
                                <option key={l.id} value={l.id}>{l.naam}</option>
                            ))}
                        </select>
                    </FilterSection>

                    <FilterSection title="Status" icon={Inbox}>
                        <select
                            value={initialFilters.status ?? ''}
                            onChange={(e) => pushFilter({ status: e.target.value || undefined })}
                            style={selectStyle}
                        >
                            <option value="">Alle</option>
                            {STATUS_OPTIONS.map(s => (
                                <option key={s.id} value={s.id}>{s.label}</option>
                            ))}
                        </select>
                    </FilterSection>

                    {tagSuggestions.length > 0 && (
                        <FilterSection title="Tags" icon={Tag}>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                {tagSuggestions.slice(0, 20).map(tag => {
                                    const active = initialFilters.tags?.includes(tag) ?? false;
                                    return (
                                        <button
                                            key={tag}
                                            onClick={() => {
                                                const current = new Set(initialFilters.tags ?? []);
                                                if (active) current.delete(tag); else current.add(tag);
                                                pushFilter({ tags: current.size > 0 ? Array.from(current) : undefined });
                                            }}
                                            style={{
                                                padding: '4px 8px', borderRadius: 5,
                                                background: active ? 'rgba(255,191,0,.12)' : 'rgba(0,0,0,.2)',
                                                border: `1px solid ${active ? 'rgba(255,191,0,.4)' : 'var(--border)'}`,
                                                color: active ? '#FFBF00' : 'var(--muted)',
                                                fontSize: 10, fontWeight: 600, cursor: 'pointer',
                                            }}
                                        >{tag}</button>
                                    );
                                })}
                            </div>
                        </FilterSection>
                    )}
                </aside>

                {/* Main: TanStack Table */}
                <section style={{
                    background: 'rgba(255,255,255,.02)',
                    border: '1px solid var(--border)',
                    borderRadius: 12,
                    overflow: 'hidden',
                }}>
                    {initialBonnen.length === 0 ? (
                        <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--muted)' }}>
                            <FileText size={32} style={{ marginBottom: 12, color: 'var(--muted)' }} />
                            <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 16, fontWeight: 400, color: 'var(--text)', marginBottom: 6 }}>
                                {activeFilterCount > 0 ? 'Geen bonnen met deze filters' : 'Nog geen bonnen in het archief'}
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 18 }}>
                                {activeFilterCount > 0
                                    ? 'Pas de filters aan of wis ze.'
                                    : 'Scan een bon of factuur op /inkoop?tab=bonnen — de geverwerkte items komen hier vanzelf terecht.'}
                            </div>
                            {activeFilterCount === 0 && (
                                <Link href="/inkoop?tab=bonnen" style={{
                                    display: 'inline-flex', alignItems: 'center', gap: 6,
                                    padding: '10px 18px', borderRadius: 8,
                                    background: '#FFBF00', color: '#000',
                                    fontSize: 12, fontWeight: 700, textDecoration: 'none',
                                }}>Open scanner →</Link>
                            )}
                        </div>
                    ) : (
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                                <thead>
                                    {table.getHeaderGroups().map(hg => (
                                        <tr key={hg.id}>
                                            {hg.headers.map(h => (
                                                <th key={h.id} style={{
                                                    textAlign: 'left', padding: '10px 14px',
                                                    fontSize: 10, color: 'var(--muted)',
                                                    textTransform: 'uppercase', letterSpacing: '.1em', fontWeight: 700,
                                                    borderBottom: '1px solid var(--border)',
                                                    width: h.getSize(),
                                                    cursor: h.column.getCanSort() ? 'pointer' : 'default',
                                                    userSelect: 'none',
                                                }}
                                                    onClick={h.column.getToggleSortingHandler()}
                                                >
                                                    {flexRender(h.column.columnDef.header, h.getContext())}
                                                    {h.column.getIsSorted() === 'asc' && ' ▲'}
                                                    {h.column.getIsSorted() === 'desc' && ' ▼'}
                                                </th>
                                            ))}
                                        </tr>
                                    ))}
                                </thead>
                                <tbody>
                                    {table.getRowModel().rows.map(r => (
                                        <tr key={r.id}
                                            onClick={() => setPreview(r.original)}
                                            style={{ cursor: 'pointer', borderBottom: '1px solid var(--border)' }}
                                            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,.025)'; }}
                                            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                                        >
                                            {r.getVisibleCells().map(c => (
                                                <td key={c.id} style={{ padding: '12px 14px', verticalAlign: 'middle' }}>
                                                    {flexRender(c.column.columnDef.cell, c.getContext())}
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </section>
            </div>

            {preview && (
                <PreviewModal
                    bon={preview}
                    leverancierNaam={preview.leverancier_id ? leverancierLookup.get(preview.leverancier_id) : null}
                    onClose={() => setPreview(null)}
                />
            )}
        </>
    );
}

function FilterSection({ title, icon: Icon, children }: { title: string; icon: React.ComponentType<{ size?: number }>; children: React.ReactNode }) {
    return (
        <div style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.1em', fontWeight: 700, marginBottom: 6 }}>
                <Icon size={11} /> {title}
            </div>
            {children}
        </div>
    );
}

function PreviewModal({ bon, leverancierNaam, onClose }: { bon: ArchiefBon; leverancierNaam: string | null | undefined; onClose: () => void }) {
    return (
        <>
            <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', backdropFilter: 'blur(4px)', zIndex: 9998 }} />
            <aside style={{
                position: 'fixed', right: 0, top: 0, height: '100vh', width: 580, maxWidth: '100vw',
                background: 'var(--color-bg-elevated, #1a1a1d)',
                borderLeft: '1px solid var(--border)', zIndex: 9999,
                boxShadow: '-20px 0 40px rgba(0,0,0,.4)',
                display: 'flex', flexDirection: 'column', overflowY: 'auto',
            }}>
                <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                        <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.1em', fontWeight: 700, marginBottom: 4 }}>Bon · #{bon.id}</div>
                        <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 19, fontWeight: 400, color: 'var(--text)' }}>
                            {leverancierNaam ?? bon.winkel ?? '—'}
                        </div>
                    </div>
                    <button onClick={onClose} aria-label="Sluiten" style={{
                        width: 32, height: 32, borderRadius: 8, background: 'transparent',
                        border: '1px solid var(--border)', color: 'var(--muted)', cursor: 'pointer',
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    }}><X size={16} /></button>
                </div>

                <div style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <KvField label="Datum" value={bon.datum ? new Date(bon.datum).toLocaleDateString('nl-NL') : '—'} />
                        <KvField label="Totaal" value={`${formatEur(Number(bon.totaal_bedrag ?? 0))}`} mono />
                        <KvField label="BTW" value={bon.btw_pct != null ? `${bon.btw_pct}%` : '—'} />
                        <KvField label="Categorie" value={bon.categorie ?? '—'} />
                        <KvField label="Status" value={bon.status ?? '—'} />
                        <KvField label="Geboekt op" value={bon.created_at ? new Date(bon.created_at).toLocaleDateString('nl-NL') : '—'} />
                    </div>

                    {bon.tags && bon.tags.length > 0 && (
                        <div>
                            <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.1em', fontWeight: 700, marginBottom: 6 }}>Tags</div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                {bon.tags.map((t, i) => (
                                    <span key={i} style={{
                                        fontSize: 11, padding: '3px 8px', borderRadius: 4,
                                        background: 'rgba(255,191,0,.08)', color: '#FFBF00', fontWeight: 600,
                                    }}>{t}</span>
                                ))}
                            </div>
                        </div>
                    )}

                    {bon.notities && (
                        <div>
                            <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.1em', fontWeight: 700, marginBottom: 6 }}>Notities</div>
                            <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{bon.notities}</div>
                        </div>
                    )}

                    {bon.image_url && (
                        <div>
                            <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.1em', fontWeight: 700, marginBottom: 6 }}>Origineel</div>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={bon.image_url} alt="Bon-scan" style={{ width: '100%', borderRadius: 10, border: '1px solid var(--border)' }} />
                            <a
                                href={bon.image_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                    display: 'inline-flex', alignItems: 'center', gap: 6,
                                    marginTop: 10, padding: '8px 12px', borderRadius: 7,
                                    background: 'transparent', color: 'var(--muted)',
                                    border: '1px solid var(--border)', fontSize: 11, fontWeight: 600,
                                    textDecoration: 'none',
                                }}
                            ><ExternalLink size={11} /> Open in nieuw tabblad</a>
                        </div>
                    )}
                </div>
            </aside>
        </>
    );
}

function KvField({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
    return (
        <div>
            <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.1em', fontWeight: 700, marginBottom: 3 }}>{label}</div>
            <div style={{ fontSize: 13, color: 'var(--text)', fontVariantNumeric: mono ? 'tabular-nums' : undefined, fontWeight: mono ? 600 : 500 }}>{value}</div>
        </div>
    );
}

const dateInputStyle: React.CSSProperties = {
    padding: '7px 10px', borderRadius: 7,
    background: 'rgba(0,0,0,.25)', border: '1px solid var(--border)',
    color: 'var(--text)', fontSize: 12, fontFamily: 'inherit',
    colorScheme: 'dark', minHeight: 36,
};
const selectStyle: React.CSSProperties = {
    width: '100%', padding: '7px 10px', borderRadius: 7,
    background: 'rgba(0,0,0,.25)', border: '1px solid var(--border)',
    color: 'var(--text)', fontSize: 12, fontFamily: 'inherit',
    colorScheme: 'dark', minHeight: 36,
};
