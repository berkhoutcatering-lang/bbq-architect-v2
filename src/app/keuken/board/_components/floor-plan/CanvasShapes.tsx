'use client';

import { Group, Rect, Circle, Line, Path, Text } from 'react-konva';

/**
 * Visuele shapes voor het floor-plan (smoker, ronde tafel, lange tafel, etc).
 * Worden in canvas_json opgeslagen als plain JSON (geen PII):
 *   { id, kind, x_pct, y_pct, w_pct, h_pct, rotation, label, ... }
 *
 * Niet relationeel — pure visualisatie. Voor gast-pins zie GuestPinShape.
 *
 * Smoker-shape heeft extra `windDirection` field — bepaalt rookpluim-richting.
 * Default = 'NE'. Cycle door 8 windrichtingen via shape-popover.
 */

export type ShapeKind =
    | 'round-table-6' | 'round-table-8' | 'round-table-10'
    | 'long-table-6' | 'long-table-8' | 'long-table-10'
    | 'smoker' | 'grill' | 'bar' | 'buffet'
    | 'tent-wall' | 'danger-zone' | 'note';

export type WindDirection = 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW';

export interface CanvasShape {
    id: string;
    kind: ShapeKind;
    x_pct: number;
    y_pct: number;
    w_pct: number;
    h_pct: number;
    rotation?: number;
    label?: string;
    /** Alleen voor smoker — richting waarin de rook drijft. Default 'NE'. */
    windDirection?: WindDirection;
}

interface Props {
    shape: CanvasShape;
    canvasWidth: number;
    canvasHeight: number;
    selected?: boolean;
    onClick?: () => void;
    onDragEnd?: (xPct: number, yPct: number) => void;
    draggable?: boolean;
}

/**
 * Genereer een SVG-path voor de rookpluim van een smoker.
 * Vorm: 1 vlakke teardrop, 0..1 in lokale coords ten opzichte van smoker-centrum.
 * Schaalt mee via Path scaleX/scaleY props.
 */
function plumePathString(): string {
    // Hand-drawn teardrop: smal aan smoker (0,0), wijd 20 eenheden vooruit.
    return 'M 0 -4 Q 8 -8 16 -6 Q 22 -2 22 0 Q 22 2 16 6 Q 8 8 0 4 Q -2 0 0 -4 Z';
}

const WIND_ANGLE_DEGREES: Record<WindDirection, number> = {
    N: -90, NE: -45, E: 0, SE: 45, S: 90, SW: 135, W: 180, NW: -135,
};

export default function CanvasShapeRenderer({
    shape, canvasWidth, canvasHeight, selected, onClick, onDragEnd, draggable = true,
}: Props) {
    const x = (shape.x_pct / 100) * canvasWidth;
    const y = (shape.y_pct / 100) * canvasHeight;
    const w = (shape.w_pct / 100) * canvasWidth;
    const h = (shape.h_pct / 100) * canvasHeight;

    const meta = SHAPE_META[shape.kind];
    const label = shape.label || meta.defaultLabel;

    return (
        <Group
            x={x}
            y={y}
            rotation={shape.rotation || 0}
            draggable={draggable}
            onClick={onClick}
            onTap={onClick}
            onDragEnd={(e) => {
                const node = e.target;
                const newXPct = (node.x() / canvasWidth) * 100;
                const newYPct = (node.y() / canvasHeight) * 100;
                onDragEnd?.(newXPct, newYPct);
            }}
        >
            {selected && (
                <Rect
                    x={-4} y={-4}
                    width={w + 8} height={h + 8}
                    stroke="#FFBF00"
                    strokeWidth={2}
                    cornerRadius={meta.shape === 'circle' ? (w + 8) / 2 : 8}
                    listening={false}
                />
            )}
            {/* Smoker-rookpluim — gerenderd onder/achter de smoker zelf. */}
            {shape.kind === 'smoker' && (() => {
                const wind = shape.windDirection ?? 'NE';
                const angle = WIND_ANGLE_DEGREES[wind];
                /* Pluim begint bij midden-smoker en strekt naar windrichting.
                   plumeLength schaalt mee met smoker-formaat. */
                const plumeScale = Math.max(w, h) * 0.7;
                return (
                    <Path
                        x={w / 2}
                        y={h / 2}
                        rotation={angle}
                        scaleX={plumeScale / 22}
                        scaleY={plumeScale / 22}
                        data={plumePathString()}
                        fill="rgba(200, 200, 200, 0.18)"
                        stroke="rgba(200, 200, 200, 0.32)"
                        strokeWidth={0.4}
                        listening={false}
                    />
                );
            })()}
            {meta.shape === 'circle' && (
                <Circle
                    radius={Math.min(w, h) / 2}
                    x={w / 2}
                    y={h / 2}
                    fill={meta.fill}
                    stroke={meta.stroke}
                    strokeWidth={2}
                />
            )}
            {meta.shape === 'rect' && (
                <Rect
                    width={w} height={h}
                    fill={meta.fill}
                    stroke={meta.stroke}
                    strokeWidth={2}
                    cornerRadius={meta.cornerRadius ?? 4}
                />
            )}
            {meta.shape === 'rect-striped' && (
                <>
                    <Rect
                        width={w} height={h}
                        fill={meta.fill}
                        stroke={meta.stroke}
                        strokeWidth={2}
                        dash={[8, 4]}
                    />
                    {/* Diagonale strepen voor danger-zone */}
                    {Array.from({ length: Math.ceil((w + h) / 16) }).map((_, i) => (
                        <Line
                            key={i}
                            points={[i * 16 - h, h, i * 16, 0]}
                            stroke={meta.stroke}
                            strokeWidth={1}
                            opacity={0.3}
                            listening={false}
                        />
                    ))}
                </>
            )}
            <Text
                text={label}
                fontFamily="var(--font-outfit), sans-serif"
                fontSize={12}
                fontStyle="bold"
                fill="#ffffff"
                width={w}
                align="center"
                verticalAlign="middle"
                height={h}
                listening={false}
            />
        </Group>
    );
}

interface ShapeMeta {
    shape: 'circle' | 'rect' | 'rect-striped';
    fill: string;
    stroke: string;
    cornerRadius?: number;
    defaultLabel: string;
    /** Default afmeting bij plaatsing (% van canvas). */
    defaultW: number;
    defaultH: number;
}

export const SHAPE_META: Record<ShapeKind, ShapeMeta> = {
    'round-table-6':  { shape: 'circle', fill: '#2a2a30', stroke: '#94a3b8', defaultLabel: '6p', defaultW: 12, defaultH: 12 },
    'round-table-8':  { shape: 'circle', fill: '#2a2a30', stroke: '#94a3b8', defaultLabel: '8p', defaultW: 14, defaultH: 14 },
    'round-table-10': { shape: 'circle', fill: '#2a2a30', stroke: '#94a3b8', defaultLabel: '10p', defaultW: 16, defaultH: 16 },
    'long-table-6':   { shape: 'rect', fill: '#2a2a30', stroke: '#94a3b8', defaultLabel: 'Tafel 6p', defaultW: 18, defaultH: 6 },
    'long-table-8':   { shape: 'rect', fill: '#2a2a30', stroke: '#94a3b8', defaultLabel: 'Tafel 8p', defaultW: 22, defaultH: 6 },
    'long-table-10':  { shape: 'rect', fill: '#2a2a30', stroke: '#94a3b8', defaultLabel: 'Tafel 10p', defaultW: 26, defaultH: 6 },
    'smoker':         { shape: 'rect', fill: '#5a1f1f', stroke: '#ef4444', cornerRadius: 6, defaultLabel: 'Smoker', defaultW: 10, defaultH: 6 },
    'grill':          { shape: 'rect', fill: '#7a4a1f', stroke: '#f59e0b', cornerRadius: 4, defaultLabel: 'Grill', defaultW: 10, defaultH: 5 },
    'bar':            { shape: 'rect', fill: '#1f3a5a', stroke: '#3b82f6', cornerRadius: 4, defaultLabel: 'Bar', defaultW: 16, defaultH: 4 },
    'buffet':         { shape: 'rect', fill: '#3a1f5a', stroke: '#a855f7', cornerRadius: 4, defaultLabel: 'Buffet', defaultW: 24, defaultH: 5 },
    'tent-wall':      { shape: 'rect', fill: '#1a1a1a', stroke: '#666666', defaultLabel: '', defaultW: 30, defaultH: 1 },
    'danger-zone':    { shape: 'rect-striped', fill: '#5a1f1f44', stroke: '#ef4444', defaultLabel: '⚠', defaultW: 10, defaultH: 6 },
    'note':           { shape: 'rect', fill: '#3a3a1f', stroke: '#eab308', cornerRadius: 4, defaultLabel: 'Notitie', defaultW: 12, defaultH: 4 },
};
