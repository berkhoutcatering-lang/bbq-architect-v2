/* ═══════════════════════════════════════════════════════════════
   Menu & Recepten — Library Views (Grid · List · Gallery)
   TSX port van mr-views.jsx. Werkt op echte Gerecht[] uit Supabase
   via mapping helpers — geen mock DISHES meer.
   ═══════════════════════════════════════════════════════════════ */

'use client';

import { useMemo, useState, type CSSProperties } from 'react';
import { ChefHat, ChevronDown, ChevronUp, Copy, EyeOff, MoreVertical, Pencil } from 'lucide-react';
import type { Gerecht, Gang } from '@/types';
import { effectieveKostprijsPP } from '@/lib/gerecht-kosten';
import { costSharePct, MENU_PRICE_REF } from '@/lib/menuMargin';
/* Percentages via de canon in lib/format.ts: anders staat er "31.1%" met een punt
   pal naast "€ 11,97" met een komma, binnen dezelfde kaart. */
import { formatPercent } from '@/lib/format';
import {
    MRStatusPill, MRCardVisual, MRMarginRing, MRCostBar,
    type GerechtStatus, type MenuViewMode,
} from './atoms';
import {
    fmtEuro, getGangKey, getGangLabel, getMargin, marginTone,
    getGerechtStatus, type PhotoMode,
} from './helpers';

export type DishDensity = 'compact' | 'comfortable';

export interface LibraryViewProps {
    gerechten: Gerecht[];
    gangen: Gang[];
    onSelect: (g: Gerecht) => void;
    density?: DishDensity;
    photoMode?: PhotoMode;
}

/* Subtle indicator dat een gerecht niet in offerte/menu-wizard verschijnt.
   Tonen als is_in_wizard === false. NULL of true = wel zichtbaar (zie
   migration 20260601140000 — default omgedraaid). */
function MRHiddenFromWizardPill({ compact }: { compact?: boolean }) {
    return (
        <span
            title="Verborgen uit wizard — niet selecteerbaar in offerte of menu"
            aria-label="Verborgen uit wizard"
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: compact ? '2px 6px' : '3px 8px',
                borderRadius: 999,
                fontSize: compact ? 10 : 11,
                fontWeight: 600,
                color: 'var(--muted)',
                background: 'rgba(148, 163, 184, 0.14)',
                border: '1px solid rgba(148, 163, 184, 0.28)',
                lineHeight: 1,
                whiteSpace: 'nowrap',
            }}
        >
            <EyeOff size={compact ? 10 : 11} />
            Verborgen
        </span>
    );
}

function isHiddenFromWizard(g: Gerecht): boolean {
    return (g as unknown as { is_in_wizard?: boolean | null }).is_in_wizard === false;
}

/* ═══ EMPTY STATE ═══════════════════════════════════════════ */
export function MREmptyState({ children }: { children?: React.ReactNode }) {
    return (
        <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            padding: '60px 20px', gap: 14, textAlign: 'center', width: '100%',
        }}>
            <div style={{
                width: 56, height: 56, borderRadius: 14,
                background: 'rgba(255,191,0,.08)', border: '1px solid rgba(255,191,0,.2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
                <ChefHat size={24} color="var(--brand)" />
            </div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 300 }}>Geen gerechten gevonden</div>
            <div style={{ fontSize: 13, color: 'var(--muted)', maxWidth: 300 }}>
                {children ?? 'Pas je filters aan of maak een nieuw gerecht aan.'}
            </div>
        </div>
    );
}

/* ═══ GRID VIEW ═══════════════════════════════════════════════ */
function MRGridCard({ gerecht, gangen, onClick, density, photoMode }: {
    gerecht: Gerecht;
    gangen: Gang[];
    onClick: (g: Gerecht) => void;
    density: DishDensity;
    photoMode: PhotoMode;
}) {
    const compact = density === 'compact';
    const w = compact ? 180 : 200;
    const h = compact ? 230 : 260;
    const photoH = compact ? 100 : 120;
    const margin = getMargin(gerecht);
    const tone = marginTone(margin);
    const status: GerechtStatus = getGerechtStatus(gerecht);
    const price = Number(gerecht.verkoopprijs ?? gerecht.prijs ?? 0);
    /* Componenten-rollup wint boven de handmatige kostprijs — anders toont een
       gerecht dat zijn kosten uit componenten haalt hier € 0,00. */
    const cost = effectieveKostprijsPP(gerecht);
    const gangKey = getGangKey(gerecht, gangen);
    const gangLabel = getGangLabel(gangKey, gangen);

    return (
        <div className="mr-grid-card" onClick={() => onClick(gerecht)} style={{ width: w, height: h }}>
            <div className="mr-grid-card-photo" style={{ height: photoH }}>
                <MRCardVisual gerecht={gerecht} photoMode={photoMode}
                    style={{ width: '100%', height: '100%' }} iconSize={compact ? 36 : 48} showName />
                <div className="mr-grid-card-status" style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    <MRStatusPill status={status} />
                    {isHiddenFromWizard(gerecht) && <MRHiddenFromWizardPill compact />}
                </div>
            </div>
            <div className="mr-grid-card-body">
                <div className="mr-grid-card-name">{gerecht.naam}</div>
                <div className="mr-grid-card-gang">{gangLabel}</div>
                {/* Bij een VAST menu verkoop je geen losse gerechten (lib/menuMargin):
                    de kostprijs is het signaal, het menu is het oordeel. Heeft een
                    gerecht een eigen verkoopprijs → echte marge. Zo niet → toon de
                    kostprijs + zijn aandeel in de menu-prijs, nooit een 99%-nepmarge. */}
                <div className="mr-grid-card-footer">
                    {price > 0 ? (
                        <>
                            <span className="mr-grid-card-price">{fmtEuro(price)}</span>
                            <span className="mr-grid-card-margin" style={{ color: tone.color }}>{margin}%</span>
                        </>
                    ) : (
                        <>
                            <span className="mr-grid-card-price">{cost > 0 ? fmtEuro(cost) : '—'}</span>
                            <span className="mr-grid-card-margin" style={{ color: 'var(--muted)', fontWeight: 500 }}>
                                {cost > 0 ? `${formatPercent(costSharePct(cost, MENU_PRICE_REF) ?? 0)} van menu` : 'geen kostprijs'}
                            </span>
                        </>
                    )}
                </div>
                {price > 0 && <MRCostBar cost={cost} price={price} />}
            </div>
        </div>
    );
}

export function MRGridView({ gerechten, gangen, onSelect, density = 'comfortable', photoMode = 'mixed' }: LibraryViewProps) {
    if (!gerechten.length) return <MREmptyState />;
    return (
        <div className="mr-grid-wrap" style={{ gap: density === 'compact' ? 12 : 16 }}>
            {gerechten.map((g) => (
                <MRGridCard key={g.id} gerecht={g} gangen={gangen}
                    onClick={onSelect} density={density} photoMode={photoMode} />
            ))}
        </div>
    );
}

/* ═══ LIST VIEW ═══════════════════════════════════════════════ */
type SortCol = 'name' | 'gang' | 'comps' | 'cost' | 'price' | 'margin' | null;

export function MRListView({ gerechten, gangen, onSelect, density = 'comfortable', photoMode = 'mixed' }: LibraryViewProps) {
    const [sortCol, setSortCol] = useState<SortCol>(null);
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
    const compact = density === 'compact';

    const handleSort = (col: SortCol) => {
        if (sortCol === col) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
        else { setSortCol(col); setSortDir('asc'); }
    };

    const sorted = useMemo(() => {
        if (!sortCol) return gerechten;
        const dir = sortDir === 'asc' ? 1 : -1;
        return [...gerechten].sort((a, b) => {
            let va: any, vb: any;
            switch (sortCol) {
                case 'name':   va = a.naam;                 vb = b.naam;                 break;
                case 'gang':   va = getGangLabel(getGangKey(a, gangen), gangen); vb = getGangLabel(getGangKey(b, gangen), gangen); break;
                case 'comps':  va = (a.ingredienten?.length ?? 0); vb = (b.ingredienten?.length ?? 0); break;
                case 'cost':   va = effectieveKostprijsPP(a); vb = effectieveKostprijsPP(b); break;
                case 'price':  va = Number(a.verkoopprijs ?? a.prijs ?? 0); vb = Number(b.verkoopprijs ?? b.prijs ?? 0); break;
                case 'margin': va = getMargin(a); vb = getMargin(b); break;
                default: return 0;
            }
            if (typeof va === 'string') return va.localeCompare(vb) * dir;
            return (Number(va) - Number(vb)) * dir;
        });
    }, [gerechten, sortCol, sortDir, gangen]);

    if (!gerechten.length) return <MREmptyState />;

    const cols: Array<{ id: SortCol | 'photo' | 'status' | 'actions'; label: string; w: number | 'flex'; sortable?: boolean }> = [
        { id: 'photo',  label: '',          w: 50 },
        { id: 'name',   label: 'Naam',      w: 'flex', sortable: true },
        { id: 'gang',   label: 'Gang',      w: 110, sortable: true },
        { id: 'comps',  label: 'Comp.',     w: 70,  sortable: true },
        { id: 'cost',   label: 'Kostprijs', w: 90,  sortable: true },
        { id: 'price',  label: 'Verkoop',   w: 90,  sortable: true },
        { id: 'margin', label: 'Marge%',    w: 80,  sortable: true },
        { id: 'status', label: 'Status',    w: 90 },
        { id: 'actions',label: '',          w: 80 },
    ];

    return (
        <div className="mr-list-wrap">
            <div className="mr-list-header">
                {cols.map((c) => (
                    <div
                        key={c.id}
                        className={`mr-list-th ${c.sortable ? 'sortable' : ''} ${sortCol === c.id ? 'sorted' : ''}`}
                        style={{ width: c.w === 'flex' ? undefined : c.w, flex: c.w === 'flex' ? 1 : undefined }}
                        onClick={() => c.sortable && handleSort(c.id as SortCol)}
                    >
                        {c.label}
                        {sortCol === c.id && (sortDir === 'asc' ? <ChevronUp size={11} /> : <ChevronDown size={11} />)}
                    </div>
                ))}
            </div>
            {sorted.map((g) => {
                const margin = getMargin(g);
                const tone = marginTone(margin);
                const status = getGerechtStatus(g);
                const price = Number(g.verkoopprijs ?? g.prijs ?? 0);
                const cost = effectieveKostprijsPP(g);
                const gangKey = getGangKey(g, gangen);
                const thumbSz = compact ? 32 : 40;
                return (
                    <div key={g.id} className="mr-list-row" onClick={() => onSelect(g)} style={{ padding: compact ? '8px 16px' : '12px 16px' }}>
                        <div style={{ width: 50 }}>
                            <MRCardVisual gerecht={g} photoMode={photoMode}
                                style={{ width: thumbSz, height: thumbSz, borderRadius: 8 }}
                                iconSize={compact ? 16 : 20} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontFamily: 'var(--font-display)', fontSize: compact ? 13 : 14, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.naam}</div>
                            {!compact && g.beschrijving && (
                                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.beschrijving}</div>
                            )}
                        </div>
                        <div style={{ width: 110, fontSize: 12, color: 'var(--muted)' }}>{getGangLabel(gangKey, gangen)}</div>
                        <div style={{ width: 70, fontSize: 12, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>{g.ingredienten?.length ?? 0}</div>
                        <div style={{ width: 90, fontSize: 12, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>{fmtEuro(cost)}</div>
                        <div style={{ width: 90, fontSize: 13, fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>{fmtEuro(price)}</div>
                        {/* Zonder eigen verkoopprijs is een per-gerecht marge betekenisloos
                            bij een vast menu — dan tonen we het kostprijs-aandeel als signaal. */}
                        <div style={{ width: 80, display: 'flex', alignItems: 'center', gap: 6 }}>
                            {price > 0 ? (
                                <>
                                    <MRMarginRing pct={margin} size={compact ? 28 : 34} />
                                    <span style={{ fontSize: 12, fontWeight: 600, color: tone.color, fontVariantNumeric: 'tabular-nums' }}>{margin}%</span>
                                </>
                            ) : (
                                <span style={{ fontSize: 11, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>
                                    {cost > 0 ? `${formatPercent(costSharePct(cost, MENU_PRICE_REF) ?? 0)} van menu` : '—'}
                                </span>
                            )}
                        </div>
                        <div style={{ width: 90, display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
                            <MRStatusPill status={status} />
                            {isHiddenFromWizard(g) && <MRHiddenFromWizardPill compact />}
                        </div>
                        <div style={{ width: 80, display: 'flex', gap: 4 }}>
                            <button className="mr-icon-btn-sm" title="Dupliceren" onClick={(e) => e.stopPropagation()}><Copy size={13} /></button>
                            <button className="mr-icon-btn-sm" title="Bewerken" onClick={(e) => { e.stopPropagation(); onSelect(g); }}><Pencil size={13} /></button>
                            <button className="mr-icon-btn-sm" title="Meer" onClick={(e) => e.stopPropagation()}><MoreVertical size={13} /></button>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

/* ═══ GALLERY VIEW (Pinterest masonry) ════════════════════════ */
const GALLERY_HEIGHTS = [280, 320, 360, 300, 340, 260, 380, 310];

function MRGalleryCard({ gerecht, gangen, onClick, h, photoMode }: {
    gerecht: Gerecht;
    gangen: Gang[];
    onClick: (g: Gerecht) => void;
    h: number;
    photoMode: PhotoMode;
}) {
    const [hover, setHover] = useState(false);
    const margin = getMargin(gerecht);
    const price = Number(gerecht.verkoopprijs ?? gerecht.prijs ?? 0);
    const status = getGerechtStatus(gerecht);
    const gangLabel = getGangLabel(getGangKey(gerecht, gangen), gangen);
    return (
        <div
            className="mr-gallery-card"
            onClick={() => onClick(gerecht)}
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => setHover(false)}
            style={{ height: h }}
        >
            <MRCardVisual gerecht={gerecht} photoMode={photoMode}
                style={{ width: '100%', height: '100%', borderRadius: 12 }} iconSize={56} showName />
            <div className={`mr-gallery-overlay ${hover ? 'visible' : ''}`}>
                <div style={{ position: 'absolute', top: 12, left: 12, display: 'flex', gap: 4 }}>
                    <MRStatusPill status={status} />
                    {isHiddenFromWizard(gerecht) && <MRHiddenFromWizardPill compact />}
                </div>
                <div>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 500 }}>{gerecht.naam}</div>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,.7)', marginTop: 4 }}>
                        {gangLabel}{gerecht.beschrijving ? ' · ' + gerecht.beschrijving : ''}
                    </div>
                    <div style={{ display: 'flex', gap: 12, marginTop: 8, fontSize: 13 }}>
                        <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtEuro(price)}</span>
                        <span style={{ color: margin > 70 ? '#86efac' : '#fbbf24', fontWeight: 600 }}>{margin}% marge</span>
                    </div>
                </div>
            </div>
        </div>
    );
}

export function MRGalleryView({ gerechten, gangen, onSelect, photoMode = 'mixed' }: LibraryViewProps) {
    if (!gerechten.length) return <MREmptyState />;
    return (
        <div className="mr-gallery-wrap">
            {gerechten.map((g, i) => (
                <MRGalleryCard
                    key={g.id}
                    gerecht={g}
                    gangen={gangen}
                    onClick={onSelect}
                    h={GALLERY_HEIGHTS[i % GALLERY_HEIGHTS.length]}
                    photoMode={photoMode}
                />
            ))}
        </div>
    );
}

/* ═══ Dispatcher op view-mode ═══ */
export function MRLibraryView({ mode, ...props }: LibraryViewProps & { mode: MenuViewMode }) {
    if (mode === 'list') return <MRListView {...props} />;
    if (mode === 'gallery') return <MRGalleryView {...props} />;
    return <MRGridView {...props} />;
}
