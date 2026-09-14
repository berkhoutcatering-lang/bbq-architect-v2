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

import { useState, useMemo, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQueryState, parseAsStringEnum } from 'nuqs';
import { Archive, Inbox as InboxIcon, LayoutGrid, List, Share2, FileArchive, SlidersHorizontal, MoreHorizontal, Plus } from 'lucide-react';
import type { BonRow, InboxItem, AuditLogEntry, StockMovementForBon, Werkbank as WerkbankData } from '@/lib/dal/bonnen';
import { useToast } from '@/components/Toast';
import { getSignedUrlAction, setBonLeverancierAction } from './actions';
import { Werkbank } from './_components/Werkbank';
import { fmtEur } from './_components/format';
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
    werkbank: WerkbankData;
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
    werkbank,
    orgSlug,
    orgEmail,
    isEmpty,
    loadAudit,
    loadStock,
}: Props) {
    const router = useRouter();
    const toast = useToast();
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
    const [menuOpen, setMenuOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!menuOpen) return;
        const onDown = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
        };
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false); };
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey);
        return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
    }, [menuOpen]);

    const nieuweInbox = inboxItems.filter((i) => !i.bon_id).length;

    /** Open de opgeslagen factuur in een nieuw tabblad via een tijdelijke link. */
    const openFile = async (bon: BonRow) => {
        const res = await getSignedUrlAction({ bonId: bon.id });
        if (!res.ok) { toast(res.error ?? 'Bestand niet gevonden', 'error'); return; }
        window.open(res.url, '_blank', 'noopener');
    };

    /** Eén bon koppelen: kaart op de naam van de factuur (zoek-of-maak). */
    const koppel = async (bon: BonRow) => {
        const naam = bon.winkel?.trim() ?? '';
        if (naam.length < 2) { toast('Geen leveranciersnaam op deze bon gevonden', 'error'); return; }
        const res = await setBonLeverancierAction({ bonId: bon.id, nieuweNaam: naam });
        if (!res.ok) { toast(res.error ?? 'Koppelen mislukt', 'error'); return; }
        toast(`${naam} gekoppeld`, 'success');
        router.refresh();
    };

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
                {/* Page header — één primaire knop, de rest onder ⋯ */}
                <div className="bk-head">
                    <div>
                        <h1 className="chassis-titel">Bonnenkistje</h1>
                        <div className="bk-sub">
                            <b>{bonnen.length}</b> {bonnen.length === 1 ? 'bon' : 'bonnen'}
                            {bedragTotaal > 0 && <> · <b>{fmtEur(bedragTotaal)}</b></>}
                            {' '}· bewaard tot {new Date().getFullYear() + 7}
                        </div>
                    </div>

                    <div className="bk-actions">
                        <div className="bk-seg" role="tablist" aria-label="Archief of inbox">
                            <button
                                type="button"
                                role="tab"
                                aria-selected={!isInbox}
                                className={!isInbox ? 'bk-btn--on' : ''}
                                onClick={() => void setTab('archief')}
                            >
                                <Archive size={14} /> Archief
                            </button>
                            <button
                                type="button"
                                role="tab"
                                aria-selected={isInbox}
                                className={isInbox ? 'bk-btn--on' : ''}
                                onClick={() => void setTab('inbox')}
                            >
                                <InboxIcon size={14} /> Inbox
                                {nieuweInbox > 0 && <span className="bk-count">{nieuweInbox}</span>}
                            </button>
                        </div>

                        {!isInbox && !isEmpty && (
                            <div className="bk-seg" aria-label="Weergave">
                                <button
                                    type="button"
                                    aria-label="Kaarten-weergave"
                                    aria-pressed={view === 'grid'}
                                    className={view === 'grid' ? 'bk-btn--on' : ''}
                                    onClick={() => void setView('grid')}
                                >
                                    <LayoutGrid size={15} />
                                </button>
                                <button
                                    type="button"
                                    aria-label="Lijst-weergave"
                                    aria-pressed={view === 'list'}
                                    className={view === 'list' ? 'bk-btn--on' : ''}
                                    onClick={() => void setView('list')}
                                >
                                    <List size={15} />
                                </button>
                            </div>
                        )}

                        {!isInbox && !isEmpty && (
                            <div className="bk-menu" ref={menuRef}>
                                <button
                                    type="button"
                                    className="bk-btn bk-btn--ghost"
                                    aria-label="Meer acties"
                                    aria-expanded={menuOpen}
                                    onClick={() => setMenuOpen((v) => !v)}
                                >
                                    <MoreHorizontal size={16} />
                                </button>
                                {menuOpen && (
                                    <div className="bk-menu__panel" role="menu">
                                        <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); openExport(); }}>
                                            <FileArchive size={14} /> Exporteer {selectedIds.length > 0 ? `${selectedIds.length} geselecteerde` : 'bonnen'}
                                        </button>
                                        <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); setDeellinkOpen(true); }}>
                                            <Share2 size={14} /> Deel-link voor je boekhouder
                                        </button>
                                        <button type="button" role="menuitem" className="md:hidden" onClick={() => { setMenuOpen(false); setMobileFilterOpen(true); }}>
                                            <SlidersHorizontal size={14} /> Filters
                                        </button>
                                        <button type="button" role="menuitem" className="hidden md:flex" onClick={() => { setMenuOpen(false); setSidebarVisible((v) => !v); }}>
                                            <SlidersHorizontal size={14} /> {sidebarVisible ? 'Verberg filters' : 'Toon filters'}
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}

                        <Link href="/bonnen" className="bk-btn bk-btn--primary">
                            <Plus size={15} /> Bon toevoegen
                        </Link>
                    </div>
                </div>

                {!isInbox && !isEmpty && <Werkbank data={werkbank} />}
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
                                onKoppel={koppel}
                            />
                        ) : (
                            <BonGrid
                                bonnen={bonnen}
                                selectedIds={selectedIds}
                                onSelect={toggleSelect}
                                onBonClick={(b) => setDetailBon(b)}
                                onOpenFile={openFile}
                                onKoppel={koppel}
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
