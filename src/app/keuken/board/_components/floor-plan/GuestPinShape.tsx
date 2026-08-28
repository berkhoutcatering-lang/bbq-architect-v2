'use client';

import { Circle, Group, Text } from 'react-konva';
import type { FloorPlanGuest } from '@/types/database.types';
import { ALLERGEN_META, primaryAllergen } from '@/lib/prep/allergens';
import type { Allergen } from '@/lib/allergenDetect';

interface Props {
    guest: FloorPlanGuest;
    /** Container-breedte/hoogte voor x_pct/y_pct → pixels conversie. */
    canvasWidth: number;
    canvasHeight: number;
    /** Diameter in pixels — default 56 (Pillar #3 gloved-hand minimum). */
    diameter?: number;
    /** Of de pin geselecteerd is — extra glow. */
    selected?: boolean;
    /** Display-mode (PII verbergen) — toont alleen label, geen full_name. */
    displayMode?: boolean;
    onClick?: () => void;
    onDragEnd?: (xPct: number, yPct: number) => void;
}

/**
 * GuestPinShape — Konva-pin op het floor-plan canvas.
 *
 * Visuele structuur:
 *   - Buitenring: kleur per primair allergeen (EU-14 meta)
 *   - Vulkleur: brand-tint normaal, rood bij severity='critical'
 *   - Centrale tekst: label (initialen) — display-safe, NOOIT PII
 *
 * Pillar #5 (Allergeen-radar): kleur volgt EU-14 meta.
 * AVG-veiligheid: render alleen `label`, niet `full_name`.
 */
export default function GuestPinShape({
    guest, canvasWidth, canvasHeight, diameter = 56,
    selected = false, displayMode = false, onClick, onDragEnd,
}: Props) {
    const r = diameter / 2;
    const x = (guest.x_pct / 100) * canvasWidth;
    const y = (guest.y_pct / 100) * canvasHeight;

    const allergens = guest.allergens as Allergen[];
    const primary = primaryAllergen(allergens);
    const primaryMeta = primary ? ALLERGEN_META[primary] : null;

    const ringColor = primaryMeta ? colorTokenToHex(primaryMeta.color) : '#ffffff80';
    const fillColor = guest.severity === 'critical' ? '#7f1d1d' : '#3a3a40';
    const isAnonymous = guest.pii_anonymized_at !== null;
    const showName = !displayMode && !isAnonymous && guest.full_name;

    return (
        <Group
            x={x}
            y={y}
            draggable={!displayMode}
            onClick={onClick}
            onTap={onClick}
            onDragEnd={(e) => {
                const node = e.target;
                const newX = node.x();
                const newY = node.y();
                const newXPct = clamp((newX / canvasWidth) * 100, 0, 100);
                const newYPct = clamp((newY / canvasHeight) * 100, 0, 100);
                onDragEnd?.(newXPct, newYPct);
            }}
        >
            {/* Selected halo */}
            {selected && (
                <Circle
                    radius={r + 6}
                    fill="transparent"
                    stroke="#FFBF00"
                    strokeWidth={2}
                    opacity={0.7}
                    listening={false}
                />
            )}
            {/* Outer ring (allergen color) */}
            <Circle
                radius={r}
                fill={fillColor}
                stroke={ringColor}
                strokeWidth={4}
                shadowColor="black"
                shadowBlur={4}
                shadowOpacity={0.4}
            />
            {/* Label — initialen of pin-code */}
            <Text
                text={guest.label.slice(0, 3).toUpperCase()}
                fontFamily="var(--font-outfit), sans-serif"
                fontSize={diameter * 0.32}
                fontStyle="bold"
                fill="#ffffff"
                width={diameter}
                height={diameter}
                offsetX={r}
                offsetY={r}
                align="center"
                verticalAlign="middle"
                listening={false}
            />
            {/* Optional full-name tooltip below (NIET in display-mode) */}
            {showName && guest.full_name && (
                <Text
                    text={guest.full_name}
                    fontFamily="var(--font-outfit), sans-serif"
                    fontSize={11}
                    fill="#cccccc"
                    align="center"
                    verticalAlign="middle"
                    width={120}
                    offsetX={60}
                    y={r + 4}
                    listening={false}
                />
            )}
        </Group>
    );
}

/* Map color-token uit allergens.ts naar hex zodat Konva-stroke werkt
   (Konva accepteert geen CSS-vars in stroke). Sync met --pill-* in globals.css. */
function colorTokenToHex(token: string): string {
    switch (token) {
        case 'red':    return '#ef4444';
        case 'orange': return '#f97316';
        case 'amber':  return '#f59e0b';
        case 'yellow': return '#eab308';
        case 'green':  return '#22c55e';
        case 'lime':   return '#84cc16';
        case 'cyan':   return '#06b6d4';
        case 'teal':   return '#14b8a6';
        case 'blue':   return '#3b82f6';
        case 'purple': return '#a855f7';
        case 'pink':   return '#ec4899';
        case 'zinc':   return '#94a3b8';
        default:       return '#94a3b8';
    }
}

function clamp(v: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, v));
}
