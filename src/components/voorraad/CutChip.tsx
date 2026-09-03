/**
 * <CutChip> — visual chip voor vlees-cut-classificatie.
 *
 * Toont: "varken · nek-borst · low-slow"  + optionele color-accent.
 * Click → optional edit-dropdown (caller bouwt zelf de combobox).
 *
 * Pillar #1: cut-classificatie visueel zichtbaar in review-sheet.
 */
import React from 'react';
import { Beef, Drumstick, Fish, Sparkles } from 'lucide-react';

import { formatPercent } from '@/lib/format';

export interface CutInfo {
    soort: string | null;
    cutGroep: string | null;
    bereiding: string | null;
    color: string;
    matchedAlias: string | null;
    confidence: number;
    source: 'tenant_alias' | 'global_alias' | 'substring' | 'none';
}

interface CutChipProps {
    cut: CutInfo;
    onClick?: () => void;
    size?: 'sm' | 'md';
}

function iconForSoort(soort: string | null) {
    switch (soort) {
        case 'kip':
        case 'gevogelte':
            return Drumstick;
        case 'vis':
            return Fish;
        case 'varken':
        case 'rund':
        case 'lam':
            return Beef;
        default:
            return Sparkles;
    }
}

export default function CutChip({ cut, onClick, size = 'sm' }: CutChipProps) {
    if (!cut.soort && !cut.cutGroep) {
        return (
            <span
                onClick={onClick}
                style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    padding: size === 'sm' ? '2px 7px' : '4px 9px',
                    borderRadius: 999,
                    background: 'rgba(130,130,130,.10)',
                    border: '1px dashed rgba(130,130,130,.4)',
                    fontSize: size === 'sm' ? 10 : 11, color: 'var(--muted)',
                    cursor: onClick ? 'pointer' : 'default',
                    fontWeight: 500,
                }}
                title="Geen cut-classificatie — klik om handmatig toe te wijzen"
            >
                <Sparkles size={size === 'sm' ? 10 : 11} />
                niet geclassificeerd
            </span>
        );
    }

    const Icon = iconForSoort(cut.soort);
    const c = cut.color || '#7a7a7a';
    const isWeak = cut.source === 'substring' && cut.confidence < 0.85;
    const label = `${cut.soort}${cut.cutGroep ? ' · ' + cut.cutGroep : ''}`;

    return (
        <span
            onClick={onClick}
            title={cut.matchedAlias
                ? `Gematcht via "${cut.matchedAlias}" (${formatPercent((cut.confidence * 100), 0)}, ${cut.source})`
                : `${formatPercent((cut.confidence * 100), 0)} match (${cut.source})`}
            style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: size === 'sm' ? '2px 8px' : '4px 10px',
                borderRadius: 999,
                background: `${c}1F`,
                border: `1px ${isWeak ? 'dashed' : 'solid'} ${c}66`,
                fontSize: size === 'sm' ? 10 : 11,
                color: c,
                cursor: onClick ? 'pointer' : 'default',
                fontWeight: 600,
                whiteSpace: 'nowrap',
            }}
        >
            <Icon size={size === 'sm' ? 11 : 12} />
            <span>{label}</span>
            {cut.bereiding && (
                <span style={{
                    opacity: 0.7, fontWeight: 500,
                    fontSize: size === 'sm' ? 9 : 10,
                    paddingLeft: 3, borderLeft: `1px solid ${c}44`,
                }}>
                    {cut.bereiding}
                </span>
            )}
        </span>
    );
}

/**
 * Helper om uit een mutation.notes-JSON-string een CutInfo te bouwen.
 * (notes wordt geschreven door pricelistProcessor.ts)
 */
export function cutFromNotes(notes: string | null): CutInfo | null {
    if (!notes) return null;
    try {
        const j = JSON.parse(notes);
        if (typeof j !== 'object' || j == null) return null;
        return {
            soort: typeof j.soort === 'string' ? j.soort : null,
            cutGroep: typeof j.cut_groep === 'string' ? j.cut_groep : null,
            bereiding: typeof j.bereiding === 'string' ? j.bereiding : null,
            color: typeof j.color === 'string' ? j.color : '#7a7a7a',
            matchedAlias: typeof j.matched_alias === 'string' ? j.matched_alias : null,
            confidence: typeof j.confidence === 'number' ? j.confidence : 0,
            source: typeof j.source === 'string'
                ? (j.source as CutInfo['source'])
                : 'none',
        };
    } catch {
        return null;
    }
}
