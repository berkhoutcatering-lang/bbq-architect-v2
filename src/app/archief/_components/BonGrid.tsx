/**
 * BonGrid — Kistje-mode masonry grid (Pillar #1/#2 hero view).
 *
 * Design DNA uit Claude archief-kistje.jsx:125-245.
 * Gebruikt react-masonry-css (Bram.us-style flex-columns) ipv CSS-columns
 * omdat die laatste in Next 16 + Turbopack soms één-kolom rendert.
 * Subtle wood-pattern overlay (0.05 opacity SVG) als decoratie.
 *
 * Card-design: glass-blur + goud-hairline + hover-lift + warm shadow.
 */
'use client';

import { useState } from 'react';
import Masonry from 'react-masonry-css';
import { Check, Lock, Calendar } from 'lucide-react';
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

const MASONRY_BREAKPOINTS = {
    default: 3,
    1280: 3,
    1024: 2,
    640: 1,
};

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
            {/* Wood-grain pattern overlay — 0.05 opacity, theme-safe */}
            <svg
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 h-full w-full"
                style={{ opacity: 0.05, zIndex: 0 }}
                xmlns="http://www.w3.org/2000/svg"
            >
                <defs>
                    <pattern id="bon-wood" width="160" height="160" patternUnits="userSpaceOnUse">
                        <line x1="0" y1="24" x2="160" y2="26" stroke="currentColor" strokeWidth=".5" />
                        <line x1="0" y1="58" x2="160" y2="56" stroke="currentColor" strokeWidth=".3" />
                        <line x1="0" y1="92" x2="160" y2="94" stroke="currentColor" strokeWidth=".4" />
                        <line x1="0" y1="128" x2="160" y2="126" stroke="currentColor" strokeWidth=".3" />
                        <circle cx="80" cy="80" r="14" fill="none" stroke="currentColor" strokeWidth=".3" opacity=".4" />
                        <circle cx="80" cy="80" r="8" fill="none" stroke="currentColor" strokeWidth=".2" opacity=".4" />
                    </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#bon-wood)" style={{ color: 'var(--brand-gold)' }} />
            </svg>

            {/* Top-down gradient voor depth */}
            <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 top-0 h-32"
                style={{
                    background:
                        'linear-gradient(180deg, rgba(196,163,90,0.04), transparent)',
                    zIndex: 0,
                }}
            />

            <div className="relative" style={{ zIndex: 1 }}>
                <Masonry
                    breakpointCols={MASONRY_BREAKPOINTS}
                    className="bon-masonry-grid"
                    columnClassName="bon-masonry-grid_column"
                >
                    {bonnen.map((bon, i) => (
                        <BonMasonryCard
                            key={bon.id}
                            bon={bon}
                            selected={selectedIds.includes(bon.id)}
                            onSelect={() => onSelect(bon.id)}
                            onClick={() => onBonClick(bon)}
                            delay={i * 40}
                        />
                    ))}
                </Masonry>
            </div>
        </div>
    );
}

interface CardProps {
    bon: BonRow;
    selected: boolean;
    onSelect: () => void;
    onClick: () => void;
    delay: number;
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

function BonMasonryCard({ bon, selected, onSelect, onClick, delay }: CardProps) {
    const [hovered, setHovered] = useState(false);
    const status = getStatusVisual(bon.status);
    const fileType: 'pdf' | 'image' | 'email' =
        bon.source === 'email'
            ? 'email'
            : bon.file_mime?.startsWith('image/')
              ? 'image'
              : 'pdf';
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
            className="group relative mb-3 cursor-pointer overflow-hidden rounded-[14px] border outline-none transition-all duration-200 focus-visible:ring-2 focus-visible:ring-[var(--brand)]"
            style={{
                background: 'var(--card)',
                borderColor: selected
                    ? 'rgba(255,191,0,.45)'
                    : hovered
                      ? 'rgba(196,163,90,.28)'
                      : 'rgba(130,130,130,.14)',
                backdropFilter: 'var(--glass-blur)',
                transform: hovered ? 'translateY(-3px)' : 'translateY(0)',
                boxShadow: hovered
                    ? '0 14px 38px rgba(0,0,0,.45), 0 0 0 1px rgba(196,163,90,.08), 0 0 24px -8px rgba(196,163,90,.25)'
                    : selected
                      ? '0 6px 22px rgba(0,0,0,.35), 0 0 0 1px rgba(255,191,0,.15)'
                      : '0 2px 8px rgba(0,0,0,.18)',
                animation: `fadeInUp .35s cubic-bezier(.16,1,.3,1) ${delay}ms both`,
            }}
        >
            {/* Gold hairline top */}
            <div
                aria-hidden="true"
                className="absolute top-0 left-[10%] right-[10%] h-px"
                style={{
                    background:
                        'linear-gradient(90deg,transparent,rgba(196,163,90,.45),transparent)',
                    zIndex: 1,
                }}
            />

            {/* Select checkbox */}
            <button
                type="button"
                onClick={(e) => {
                    e.stopPropagation();
                    onSelect();
                }}
                aria-label={selected ? `Deselecteer bon ${bon.id}` : `Selecteer bon ${bon.id}`}
                className="absolute top-2.5 left-2.5 z-20 flex h-5 w-5 items-center justify-center rounded-[5px] border-[1.5px] backdrop-blur transition"
                style={{
                    background: selected ? 'var(--brand)' : 'rgba(0,0,0,.45)',
                    borderColor: selected ? 'var(--brand)' : 'rgba(196,163,90,.3)',
                    opacity: selected || hovered ? 1 : 0,
                }}
            >
                {selected && <Check size={12} color="#000" strokeWidth={3} />}
            </button>

            {/* Thumbnail — vast hoogte voor masonry-balans */}
            <div className="h-[180px] p-2.5 pb-0">
                <BonReceiptThumb
                    supplier={bon.leverancier_naam ?? bon.winkel ?? '—'}
                    type={fileType}
                    amount={Number(bon.totaal_bedrag ?? 0)}
                    date={bon.datum}
                />
            </div>

            {/* Content */}
            <div className="px-3.5 pt-3 pb-3.5">
                <div
                    className="mb-1 truncate text-[16px] font-light tracking-tight"
                    style={{ fontFamily: 'var(--font-display)', color: 'var(--text)' }}
                    title={bon.leverancier_naam ?? bon.winkel ?? ''}
                >
                    {bon.leverancier_naam ?? bon.winkel ?? '—'}
                </div>

                <div className="mb-2.5 flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1 text-[11px] text-[var(--muted)]">
                        <Calendar size={10} />
                        {fmtDateShort(bon.datum)}
                    </span>
                    <span
                        className="font-mono text-[14px] font-semibold tabular-nums"
                        style={{ color: 'var(--text)' }}
                    >
                        {fmtEur(Number(bon.totaal_bedrag ?? 0))}
                    </span>
                </div>

                {/* Snippet preview on hover */}
                {hovered && bon.snippet && (
                    <div
                        className="mb-2 line-clamp-2 overflow-hidden rounded-[6px] border px-2 py-1.5 text-[10px] leading-[1.5] text-[var(--muted)]"
                        style={{
                            background: 'rgba(255,191,0,.04)',
                            borderColor: 'rgba(255,191,0,.12)',
                        }}
                        // ts_headline-snippet bevat <mark>; voor preview tonen we 'm escaped.
                    >
                        …{stripMark(bon.snippet).slice(0, 110)}
                    </div>
                )}

                <div className="flex items-center justify-between gap-2">
                    {bon.categorie ? (
                        <span
                            className="truncate rounded-[5px] px-1.5 py-0.5 text-[10px] font-semibold"
                            style={{
                                background: `color-mix(in srgb, ${catColor} 14%, transparent)`,
                                color: catColor,
                                border: `1px solid color-mix(in srgb, ${catColor} 25%, transparent)`,
                            }}
                        >
                            {bon.categorie}
                        </span>
                    ) : (
                        <span />
                    )}
                    <div className="flex items-center gap-1.5">
                        {bon.locked_at && (
                            <Lock size={11} className="text-[var(--blue)]" aria-label="Vergrendeld" />
                        )}
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

function stripMark(snippet: string): string {
    return snippet.replace(/<\/?mark>/g, '');
}
