/**
 * ArchiefClient — orchestrator voor het Bonnenkistje.
 *
 * Beheert client-side state: view-toggle (kistje/tabel), selected-IDs,
 * detail-bon (preview drawer), mobile-filter-sheet, export/share modals.
 *
 * URL-state (via nuqs in subcomponenten): q, view, tab, filters, density.
 * Server-side state: bonnen[], leveranciers[], tags[], rgs[], orgEmail.
 *
 * @react-pdf-viewer wordt lazy via dynamic import binnen BonPreview.
 */
'use client';

import { useState, useMemo } from 'react';
import { useQueryState, parseAsStringEnum } from 'nuqs';
import { Archive, Inbox as InboxIcon, LayoutGrid, List, Share2, FileArchive, SlidersHorizontal } from 'lucide-react';
import type { BonRow, InboxItem, AuditLogEntry, StockMovementForBon } from '@/lib/dal/bonnen';
import { BonSearchBar } from './_components/BonSearchBar';
import { ActiveFilterPills } from './_components/ActiveFilterPills';
import { BonFilters } from './_components/BonFilters';
import { BonGrid } from './_components/BonGrid';
import { BonTable } from './_components/BonTable';
import { BonPreview } from './_components/BonPreview';
import { BonkSnippet } from './_components/BonkSnippet';
import { EmptyKistje } from './_components/EmptyKistje';
import { BulkExportSheet } from './_components/BulkExportSheet';
import { DeelLinkSheet } from './_components/DeelLinkSheet';
import { InboxList } from './_components/InboxList';

interface Props {
    bonnen: BonRow[];
    bedragTotaal: number;
    leveranciers: Array<{ id: number; naam: string; count: number }>;
    tags: string[];
    rgs: Array<{ code: string; label: string | null; count: number }>;
    inboxItems: InboxItem[];
    orgSlug: string;
    orgEmail: string;
    isEmpty: boolean;
    loadAudit: (bonId: number) => Promise<AuditLogEntry[]>;
    loadStock: (bonId: number) => Promise<StockMovementForBon[]>;
}

export function ArchiefClient({
    bonnen,
    bedragTotaal,
    leveranciers,
    tags,
    rgs,
    inboxItems,
    orgSlug,
    orgEmail,
    isEmpty,
    loadAudit,
    loadStock,
}: Props) {
    const [view, setView] = useQueryState(
        'view',
        parseAsStringEnum(['grid', 'list']).withDefault('grid'),
    );
    const [tab, setTab] = useQueryState(
        'tab',
        parseAsStringEnum(['archief', 'inbox']).withDefault('archief'),
    );
    const [q] = useQueryState('q');

    const [selectedIds, setSelectedIds] = useState<number[]>([]);
    const [detailBon, setDetailBon] = useState<BonRow | null>(null);
    const [mobileFilterOpen, setMobileFilterOpen] = useState(false);
    const [exportOpen, setExportOpen] = useState(false);
    const [deellinkOpen, setDeellinkOpen] = useState(false);
    const [sidebarVisible, setSidebarVisible] = useState(true);

    const isInbox = tab === 'inbox';
    const isSearch = !!q && q.length > 0;

    const selectedBonnen = useMemo(
        () => bonnen.filter((b) => selectedIds.includes(b.id)),
        [bonnen, selectedIds],
    );

    const toggleSelect = (id: number) => {
        setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    };

    const selectAll = () => {
        if (bonnen.every((b) => selectedIds.includes(b.id))) {
            setSelectedIds([]);
        } else {
            setSelectedIds(bonnen.map((b) => b.id));
        }
    };

    const openExport = () => {
        if (selectedIds.length === 0) {
            // Default: alle huidig-zichtbare bonnen selecteren tot maximaal 20
            setSelectedIds(bonnen.slice(0, 20).map((b) => b.id));
        }
        setExportOpen(true);
    };

    return (
        <div className="flex min-h-[calc(100vh-56px)]">
            {/* Filter sidebar — desktop, niet bij inbox of empty */}
            {!isInbox && !isEmpty && sidebarVisible && (
                <div className="hidden md:block">
                    <BonFilters leveranciers={leveranciers} tags={tags} rgs={rgs} />
                </div>
            )}

            {/* Main content */}
            <div className="min-w-0 flex-1 px-4 py-5 md:px-6">
                {/* Page header */}
                <div className="mb-2 flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <h1
                            className="flex items-center gap-3 text-[28px] font-extralight tracking-tight md:text-[32px]"
                            style={{ fontFamily: 'var(--font-display)' }}
                        >
                            <Archive size={28} style={{ color: 'var(--brand-gold)' }} />
                            Bonnenkistje
                        </h1>
                        <p className="mt-1 text-[13px] text-[var(--muted)]">
                            Typ <strong className="font-mono text-[var(--brand-gold)]">baktotaal</strong> —
                            vind elke bon over 7 jaar heen, tot op het woord.
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        {/* Archief ↔ Inbox toggle */}
                        <div
                            className="flex overflow-hidden rounded-[10px] border"
                            style={{ borderColor: 'var(--border)', background: 'var(--bg-subtle)' }}
                        >
                            {(['archief', 'inbox'] as const).map((m) => (
                                <button
                                    key={m}
                                    type="button"
                                    onClick={() => void setTab(m)}
                                    className="flex items-center gap-1.5 px-3.5 py-1.5 text-[12px] font-semibold transition"
                                    style={{
                                        background: tab === m ? 'rgba(255,191,0,.08)' : 'transparent',
                                        color: tab === m ? 'var(--text)' : 'var(--muted)',
                                    }}
                                >
                                    {m === 'inbox' ? <InboxIcon size={14} /> : <Archive size={14} />}
                                    {m === 'inbox' ? 'Inbox' : 'Archief'}
                                    {m === 'inbox' && inboxItems.filter((i) => !i.bon_id).length > 0 && (
                                        <span
                                            className="rounded-[4px] px-1.5 py-0.5 text-[9px] font-bold"
                                            style={{
                                                background: 'rgba(255,191,0,.2)',
                                                color: 'var(--brand)',
                                            }}
                                        >
                                            {inboxItems.filter((i) => !i.bon_id).length}
                                        </span>
                                    )}
                                </button>
                            ))}
                        </div>

                        {!isInbox && !isEmpty && (
                            <>
                                {/* View toggle: kistje ↔ tabel */}
                                <div
                                    className="flex overflow-hidden rounded-[8px] border"
                                    style={{ borderColor: 'var(--border)' }}
                                >
                                    {[
                                        { id: 'grid' as const, icon: LayoutGrid, label: 'Kistje' },
                                        { id: 'list' as const, icon: List, label: 'Tabel' },
                                    ].map((v) => (
                                        <button
                                            key={v.id}
                                            type="button"
                                            onClick={() => void setView(v.id)}
                                            aria-label={`${v.label}-weergave`}
                                            className="flex px-2.5 py-1.5 transition"
                                            style={{
                                                background: view === v.id ? 'rgba(255,191,0,.08)' : 'transparent',
                                                color: view === v.id ? 'var(--text)' : 'var(--muted)',
                                            }}
                                        >
                                            <v.icon size={16} />
                                        </button>
                                    ))}
                                </div>

                                <button
                                    type="button"
                                    onClick={() => setDeellinkOpen(true)}
                                    className="inline-flex items-center gap-1.5 rounded-[8px] px-2.5 py-1.5 text-[12px] text-[var(--muted)] transition hover:bg-white/[0.05] hover:text-[var(--text)]"
                                >
                                    <Share2 size={14} />
                                    Deel
                                </button>

                                <button
                                    type="button"
                                    onClick={openExport}
                                    className="inline-flex items-center gap-1.5 rounded-[8px] px-2.5 py-1.5 text-[12px] text-[var(--muted)] transition hover:bg-white/[0.05] hover:text-[var(--text)]"
                                >
                                    <FileArchive size={14} />
                                    Export
                                </button>

                                {/* Mobile filter trigger */}
                                <button
                                    type="button"
                                    onClick={() => setMobileFilterOpen(true)}
                                    className="inline-flex items-center gap-1.5 rounded-[8px] px-2.5 py-1.5 text-[12px] text-[var(--muted)] transition hover:bg-white/[0.05] hover:text-[var(--text)] md:hidden"
                                >
                                    <SlidersHorizontal size={14} />
                                    Filter
                                </button>

                                {/* Desktop sidebar toggle */}
                                <button
                                    type="button"
                                    onClick={() => setSidebarVisible((v) => !v)}
                                    aria-label={sidebarVisible ? 'Verberg filters' : 'Toon filters'}
                                    className="hidden rounded-[8px] px-2 py-1.5 text-[var(--muted)] transition hover:bg-white/[0.05] hover:text-[var(--text)] md:flex"
                                    title="Toggle filters"
                                >
                                    <SlidersHorizontal size={14} />
                                </button>
                            </>
                        )}
                    </div>
                </div>

                {/* Content */}
                {isEmpty ? (
                    <EmptyKistje orgSlug={orgSlug} />
                ) : isInbox ? (
                    <InboxList items={inboxItems} orgEmail={orgEmail} />
                ) : (
                    <>
                        <BonSearchBar autoFocus={true} />

                        <ActiveFilterPills filteredCount={bonnen.length} filteredTotal={bedragTotaal} />

                        {isSearch && (
                            <div className="mb-3.5 flex items-center gap-1.5 text-[12px] text-[var(--muted)]">
                                <span>
                                    {bonnen.length} resultaten voor &quot;
                                    <strong className="text-[var(--brand)]">{q}</strong>&quot;
                                </span>
                            </div>
                        )}

                        {/* Render mode keuze */}
                        {isSearch ? (
                            // Bij actieve zoekterm: list met snippets (gebruikt ts_headline)
                            <div className="flex flex-col gap-0.5">
                                {bonnen.map((b) => (
                                    <BonkSnippet key={b.id} bon={b} onClick={() => setDetailBon(b)} />
                                ))}
                                {bonnen.length === 0 && (
                                    <div className="py-12 text-center text-[13px] text-[var(--muted)]">
                                        Geen treffers voor &quot;{q}&quot;. Probeer een andere zoekterm.
                                    </div>
                                )}
                            </div>
                        ) : view === 'list' ? (
                            <BonTable
                                bonnen={bonnen}
                                selectedIds={selectedIds}
                                onSelect={toggleSelect}
                                onSelectAll={selectAll}
                                onBonClick={(b) => setDetailBon(b)}
                                onBulkExport={openExport}
                            />
                        ) : (
                            <BonGrid
                                bonnen={bonnen}
                                selectedIds={selectedIds}
                                onSelect={toggleSelect}
                                onBonClick={(b) => setDetailBon(b)}
                            />
                        )}
                    </>
                )}
            </div>

            {/* Detail drawer */}
            <BonPreview
                bon={detailBon}
                onClose={() => setDetailBon(null)}
                onAuditLoad={loadAudit}
                onStockLoad={loadStock}
            />

            {/* Modals */}
            <BulkExportSheet
                open={exportOpen}
                onClose={() => setExportOpen(false)}
                selectedBonnen={selectedBonnen}
            />
            <DeelLinkSheet open={deellinkOpen} onClose={() => setDeellinkOpen(false)} />

            {/* Mobile filter bottom-sheet */}
            {mobileFilterOpen && !isInbox && !isEmpty && (
                <div className="fixed inset-0 z-[9997] flex flex-col">
                    <button
                        type="button"
                        aria-label="Sluit filters"
                        className="flex-1 cursor-default"
                        onClick={() => setMobileFilterOpen(false)}
                        style={{ background: 'rgba(0,0,0,.5)' }}
                    />
                    <div
                        className="max-h-[75vh] overflow-y-auto rounded-t-[16px]"
                        style={{
                            background: 'var(--bg-elevated)',
                            animation: 'fadeInUp .3s ease both',
                        }}
                    >
                        <BonFilters
                            leveranciers={leveranciers}
                            tags={tags}
                            rgs={rgs}
                            onClose={() => setMobileFilterOpen(false)}
                            isMobile
                        />
                    </div>
                </div>
            )}
        </div>
    );
}
