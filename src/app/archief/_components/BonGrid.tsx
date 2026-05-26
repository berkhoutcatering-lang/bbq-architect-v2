/**
 * BonGrid — Kistje-mode masonry grid (Pillar #1/#2 hero view).
 *
 * Design DNA uit Claude archief-kistje.jsx:125-245.
 * 3-kolom CSS-columns masonry op desktop (geen extra lib), 2 op tablet, 1 op mobile.
 * Subtle wood-pattern overlay (0.035 opacity SVG) als decoratie.
 *
 * Card: thumbnail (PDF-mock of camera-icon) + leverancier + datum + bedrag +
 * categorie-chip + status-pill + lock-icon. Hover toont snippet als query actief.
 */
'use client';

import { useState } from 'react';
import { Check, Lock } from 'lucide-react';
import type { BonRow } from '@/lib/dal/bonnen';
import { BonReceiptThumb } from './BonReceiptThumb';
import { getStatusVisual } from '../_lib/statusMap';
import { fmtEur, fmtDateShort } from './format';

interface Props {
    bonnen: BonRow[];
    selectedIds: number[];
    onSelect: (id: number) => void;
    onBonClick: (bon: BonRow) => void;
}

export function BonGrid({ bonnen, selectedIds, onSelect, onBonClick }: Props) {
    if (bonnen.length === 0) {
        return (
            <div className="py-16 text-center text-[13px] text-[var(--muted)]">
                Geen bonnen gevonden met deze filters.
            </div>
        );
    }

    return (
        <div className="relative">
            {/* Subtle wood-grain pattern overlay — 0.035 opacity, theme-safe */}
            <svg
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 h-full w-full"
                style={{ opacity: 0.035, zIndex: 0 }}
                xmlns="http://www.w3.org/2000/svg"
            >
                <defs>
                    <pattern id="wood" width="120" height="120" patternUnits="userSpaceOnUse">
                        <line x1="0" y1="20" x2="120" y2="22" stroke="currentColor" strokeWidth=".5" />
                        <line x1="0" y1="48" x2="120" y2="46" stroke="currentColor" strokeWidth=".3" />
                        <line x1="0" y1="72" x2="120" y2="74" stroke="currentColor" strokeWidth=".4" />
                        <line x1="0" y1="98" x2="120" y2="96" stroke="currentColor" strokeWidth=".3" />
                        <circle cx="60" cy="60" r="8" fill="none" stroke="currentColor" strokeWidth=".2" opacity=".5" />
                    </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#wood)" style={{ color: 'var(--brand-gold)' }} />
            </svg>

            <div
                className="relative grid gap-3 [column-fill:_balance]"
                style={{
                    columns: 3,
                    columnGap: 12,
                    zIndex: 1,
                    display: 'block',
                }}
            >
                <style jsx>{`
                    @media (max-width: 1100px) {
                        div :global(.bon-masonry) {
                            columns: 2 !important;
                        }
                    }
                    @media (max-width: 768px) {
                        div :global(.bon-masonry) {
                            columns: 1 !important;
                        }
                    }
                `}</style>
                <div className="bon-masonry" style={{ columns: 3, columnGap: 12 }}>
                    {bonnen.map((bon) => (
                        <BonMasonryCard
                            key={bon.id}
                            bon={bon}
                            selected={selectedIds.includes(bon.id)}
                            onSelect={() => onSelect(bon.id)}
                            onClick={() => onBonClick(bon)}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
}

interface CardProps {
    bon: BonRow;
    selected: boolean;
    onSelect: () => void;
    onClick: () => void;
}

const CATEGORY_COLORS: Record<string, string> = {
    'Vlees & vis': 'var(--red)',
    'Kruiden & sauzen': 'var(--purple)',
    'Houtskool & rookhout': 'var(--orange)',
    'Zuivel & bakkerij': 'var(--blue)',
    Dranken: 'var(--cyan)',
    Disposables: 'var(--muted)',
    'Groenten & fruit': 'var(--green)',
    Brandstof: 'var(--amber)',
};

function BonMasonryCard({ bon, selected, onSelect, onClick }: CardProps) {
    const [hovered, setHovered] = useState(false);
    const status = getStatusVisual(bon.status);
    const fileType: 'pdf' | 'image' = bon.file_mime?.includes('pdf') ? 'pdf' : 'image';
    const catColor = bon.categorie ? CATEGORY_COLORS[bon.categorie] ?? 'var(--muted)' : 'var(--muted)';

    return (
        <div
            role="button"
            tabIndex={0}
            onClick={onClick}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onClick();
                }
            }}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            className="relative mb-3 cursor-pointer overflow-hidden rounded-[14px] border transition-transform [break-inside:avoid] hover:-translate-y-0.5 hover:shadow-[var(--lift-shadow)]"
            style={{
                background: 'var(--card)',
                borderColor: selected ? 'rgba(255,191,0,.4)' : 'rgba(130,130,130,.12)',
                backdropFilter: 'var(--glass-blur)',
            }}
        >
            {/* Gold hairline */}
            <div
                className="absolute top-0 left-[15%] right-[15%] h-px"
                style={{
                    background: 'linear-gradient(90deg,transparent,rgba(196,163,90,.35),transparent)',
                    zIndex: 1,
                }}
            />

            {/* Select checkbox (visible on hover or when selected) */}
            <button
                type="button"
                onClick={(e) => {
                    e.stopPropagation();
                    onSelect();
                }}
                aria-label={selected ? `Deselecteer bon ${bon.id}` : `Selecteer bon ${bon.id}`}
                className="absolute top-2.5 left-2.5 z-20 flex h-5 w-5 items-center justify-center rounded-[5px] border-[1.5px] backdrop-blur transition"
                style={{
                    background: selected ? 'var(--brand)' : 'rgba(0,0,0,.4)',
                    borderColor: selected ? 'var(--brand)' : 'rgba(130,130,130,.3)',
                    opacity: selected || hovered ? 1 : 0,
                }}
            >
                {selected && <Check size={12} color="#000" />}
            </button>

            {/* Thumbnail */}
            <div className="h-[180px] p-2.5 pb-0">
                <BonReceiptThumb
                    supplier={bon.leverancier_naam ?? bon.winkel ?? '—'}
                    type={fileType}
                    amount={Number(bon.totaal_bedrag ?? 0)}
                />
            </div>

            {/* Content */}
            <div className="px-3.5 pt-3 pb-3.5">
                <div
                    className="mb-1 truncate text-[15px] font-light"
                    style={{ fontFamily: 'var(--font-display)' }}
                >
                    {bon.leverancier_naam ?? bon.winkel ?? '—'}
                </div>
                <div className="mb-2 flex items-center justify-between">
                    <span className="text-[11px] text-[var(--muted)]">{fmtDateShort(bon.datum)}</span>
                    <span className="font-mono text-[13px] font-semibold tabular-nums">
                        {fmtEur(Number(bon.totaal_bedrag ?? 0))}
                    </span>
                </div>

                {/* Snippet preview on hover (alleen als zoekterm + snippet aanwezig) */}
                {hovered && bon.snippet && (
                    <div
                        className="mb-2 line-clamp-2 overflow-hidden rounded-[6px] border px-2 py-1.5 text-[10px] leading-[1.5] text-[var(--muted)]"
                        style={{
                            background: 'rgba(255,191,0,.04)',
                            borderColor: 'rgba(255,191,0,.1)',
                        }}
                    >
                        …
                        {bon.snippet.length > 100 ? bon.snippet.slice(0, 100) + '…' : bon.snippet}
                    </div>
                )}

                <div className="flex items-center justify-between">
                    {bon.categorie && (
                        <span
                            className="rounded-[4px] px-1.5 py-0.5 text-[9px] font-semibold"
                            style={{
                                background: `color-mix(in srgb, ${catColor} 12%, transparent)`,
                                color: catColor,
                            }}
                        >
                            {bon.categorie}
                        </span>
                    )}
                    <div className="flex items-center gap-1.5">
                        {bon.locked_at && <Lock size={10} className="text-[var(--blue)]" />}
                        <span
                            className={`inline-flex items-center gap-1 rounded-[6px] border px-1.5 py-0.5 text-[10px] font-semibold ${status.pillClass}`}
                        >
                            {status.label}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}
