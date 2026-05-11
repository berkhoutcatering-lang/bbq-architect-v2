'use client';

import { Line, Text, Group } from 'react-konva';
import type { ServiceZone } from '@/types/database.types';

interface Props {
    zone: ServiceZone;
    canvasWidth: number;
    canvasHeight: number;
    assigneeName?: string;
    selected?: boolean;
    onClick?: () => void;
}

/**
 * ServiceZoneShape — Konva polygon-overlay voor team-toewijzing.
 *
 * Gebruikt:
 *   - 18% opacity vulkleur (zachte zone-tint)
 *   - 2px dashed border (toont herkomst zonder hard te zijn)
 *   - Center-label met zone-naam + initialen van assigned personeel
 *
 * Pillar #2 (Service-team coördinatie): elk zone-lid weet snel "dit is mijn hoek".
 */
export default function ServiceZoneShape({
    zone, canvasWidth, canvasHeight, assigneeName, selected, onClick,
}: Props) {
    const points = zone.geometry.points ?? [];
    if (points.length < 3) return null;

    const flat: number[] = [];
    for (const p of points) {
        flat.push((p.x_pct / 100) * canvasWidth);
        flat.push((p.y_pct / 100) * canvasHeight);
    }

    // Centroid voor label-positie
    const cx = points.reduce((s, p) => s + p.x_pct, 0) / points.length;
    const cy = points.reduce((s, p) => s + p.y_pct, 0) / points.length;
    const labelX = (cx / 100) * canvasWidth;
    const labelY = (cy / 100) * canvasHeight;

    const color = zone.color || '#FFBF00';
    const fillColor = hexWithAlpha(color, 0.18);
    const strokeColor = selected ? '#FFBF00' : color;

    const display = assigneeName
        ? `${zone.name} · ${initialsOf(assigneeName)}`
        : zone.name;

    return (
        <Group onClick={onClick} onTap={onClick}>
            <Line
                points={flat}
                closed
                fill={fillColor}
                stroke={strokeColor}
                strokeWidth={selected ? 3 : 2}
                dash={selected ? [] : [10, 6]}
            />
            <Text
                text={display}
                x={labelX - 80}
                y={labelY - 9}
                width={160}
                fontFamily="Outfit, sans-serif"
                fontSize={12}
                fontStyle="bold"
                fill="#ffffff"
                align="center"
                listening={false}
            />
        </Group>
    );
}

function hexWithAlpha(hex: string, alpha: number): string {
    // Accepteer #rgb of #rrggbb
    let h = hex.replace('#', '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    if (!/^[0-9a-f]{6}$/i.test(h)) return `rgba(255, 191, 0, ${alpha})`;
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function initialsOf(name: string): string {
    return name
        .split(/\s+/)
        .filter(Boolean)
        .map((w) => w[0]!.toUpperCase())
        .join('')
        .slice(0, 3);
}
