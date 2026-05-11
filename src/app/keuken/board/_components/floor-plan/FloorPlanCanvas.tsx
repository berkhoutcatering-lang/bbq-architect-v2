'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import { Stage, Layer, Line, Circle } from 'react-konva';
import type Konva from 'konva';
import GuestPinShape from './GuestPinShape';
import CanvasShapeRenderer, { type CanvasShape } from './CanvasShapes';
import ServiceZoneShape from './ServiceZoneShape';
import type { FloorPlan, FloorPlanGuest, ServiceZone, Personeel } from '@/types/database.types';

interface Props {
    floorPlan: FloorPlan;
    guests: FloorPlanGuest[];
    zones?: ServiceZone[];
    personeel?: Personeel[];
    /** Werk-in-uitvoering polygon (terwijl tool='zone'). */
    polygonInProgress?: { x_pct: number; y_pct: number }[];
    onGuestMove: (guestId: string, xPct: number, yPct: number) => void;
    onGuestClick: (guest: FloorPlanGuest) => void;
    onShapeMove: (shapeId: string, xPct: number, yPct: number) => void;
    onShapeClick: (shape: CanvasShape) => void;
    onZoneClick?: (zone: ServiceZone) => void;
    onCanvasClick: (xPct: number, yPct: number) => void;
    /** Selected shape/guest/zone id. */
    selectedId?: string | null;
    /** True = read-only display (geen drag, geen click-to-add). */
    displayMode?: boolean;
}

/**
 * FloorPlanCanvas — Konva-stage met grid + shapes + gast-pins.
 *
 * Layout: vult container; gebruikt percentage-coords zodat resize werkt.
 * Pillar #4 (Schets-in-30s): infinite-feel via grid, geen zoom controls
 * voor MVP (komt in V1.5).
 *
 * NOTE: Konva accesses window globally — deze component MOET via
 * `dynamic(() => import('./FloorPlanCanvas'), { ssr: false })` geladen worden.
 */
export default function FloorPlanCanvas({
    floorPlan, guests, zones = [], personeel = [],
    polygonInProgress = [],
    onGuestMove, onGuestClick,
    onShapeMove, onShapeClick, onZoneClick, onCanvasClick,
    selectedId, displayMode,
}: Props) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [size, setSize] = useState({ width: 800, height: 600 });

    // Track container size voor responsive canvas
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const observer = new ResizeObserver(() => {
            const rect = el.getBoundingClientRect();
            setSize({ width: rect.width, height: rect.height });
        });
        observer.observe(el);
        const rect = el.getBoundingClientRect();
        setSize({ width: rect.width, height: rect.height });
        return () => observer.disconnect();
    }, []);

    // Parse shapes uit canvas_json
    const shapes: CanvasShape[] = Array.isArray((floorPlan.canvas_json as { shapes?: CanvasShape[] }).shapes)
        ? ((floorPlan.canvas_json as { shapes: CanvasShape[] }).shapes)
        : [];

    const handleStageClick = useCallback((e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
        // Alleen reageren op klikken op het lege canvas (stage zelf), niet op shapes
        if (e.target === e.target.getStage()) {
            const stage = e.target.getStage();
            if (!stage) return;
            const pos = stage.getPointerPosition();
            if (!pos) return;
            const xPct = (pos.x / size.width) * 100;
            const yPct = (pos.y / size.height) * 100;
            onCanvasClick(xPct, yPct);
        }
    }, [size, onCanvasClick]);

    return (
        <div ref={containerRef} className="prep-canvas-wrap">
            {size.width > 0 && size.height > 0 && (
                <Stage
                    width={size.width}
                    height={size.height}
                    onClick={handleStageClick}
                    onTap={handleStageClick}
                >
                    {/* Grid layer */}
                    <Layer listening={false}>
                        <GridPattern width={size.width} height={size.height} />
                    </Layer>

                    {/* Zones layer (onder shapes zodat tafels over zones leesbaar zijn) */}
                    <Layer>
                        {zones.map((zone) => {
                            const assignee = zone.assigned_personeel_id
                                ? personeel.find((p) => p.id === zone.assigned_personeel_id)
                                : null;
                            return (
                                <ServiceZoneShape
                                    key={zone.id}
                                    zone={zone}
                                    canvasWidth={size.width}
                                    canvasHeight={size.height}
                                    assigneeName={assignee?.naam}
                                    selected={selectedId === zone.id}
                                    onClick={onZoneClick ? () => onZoneClick(zone) : undefined}
                                />
                            );
                        })}
                    </Layer>

                    {/* Shapes layer */}
                    <Layer>
                        {shapes.map((shape) => (
                            <CanvasShapeRenderer
                                key={shape.id}
                                shape={shape}
                                canvasWidth={size.width}
                                canvasHeight={size.height}
                                selected={selectedId === shape.id}
                                onClick={() => onShapeClick(shape)}
                                onDragEnd={(x, y) => onShapeMove(shape.id, x, y)}
                                draggable={!displayMode}
                            />
                        ))}
                    </Layer>

                    {/* Guest-pins layer (boven shapes) */}
                    <Layer>
                        {guests.map((guest) => (
                            <GuestPinShape
                                key={guest.id}
                                guest={guest}
                                canvasWidth={size.width}
                                canvasHeight={size.height}
                                selected={selectedId === guest.id}
                                displayMode={displayMode}
                                onClick={() => onGuestClick(guest)}
                                onDragEnd={(x, y) => onGuestMove(guest.id, x, y)}
                            />
                        ))}
                    </Layer>

                    {/* Polygon-in-progress overlay (alleen tijdens zone-tool) */}
                    {polygonInProgress.length > 0 && (
                        <Layer listening={false}>
                            <Line
                                points={polygonInProgress.flatMap((p) => [
                                    (p.x_pct / 100) * size.width,
                                    (p.y_pct / 100) * size.height,
                                ])}
                                stroke="#FFBF00"
                                strokeWidth={2}
                                dash={[8, 4]}
                                closed={false}
                            />
                            {polygonInProgress.map((p, idx) => (
                                <Circle
                                    key={idx}
                                    x={(p.x_pct / 100) * size.width}
                                    y={(p.y_pct / 100) * size.height}
                                    radius={5}
                                    fill="#FFBF00"
                                    stroke="#0a0a0c"
                                    strokeWidth={2}
                                />
                            ))}
                        </Layer>
                    )}
                </Stage>
            )}
        </div>
    );
}

/** Soft grid voor "infinite canvas"-feel. Niet draggable, niet klikbaar. */
function GridPattern({ width, height }: { width: number; height: number }) {
    const SPACING = 40;
    const cols = Math.ceil(width / SPACING);
    const rows = Math.ceil(height / SPACING);
    const lines: React.ReactElement[] = [];
    for (let i = 0; i <= cols; i++) {
        lines.push(
            <Line
                key={`v${i}`}
                points={[i * SPACING, 0, i * SPACING, height]}
                stroke="#ffffff10"
                strokeWidth={1}
            />
        );
    }
    for (let j = 0; j <= rows; j++) {
        lines.push(
            <Line
                key={`h${j}`}
                points={[0, j * SPACING, width, j * SPACING]}
                stroke="#ffffff10"
                strokeWidth={1}
            />
        );
    }
    return <>{lines}</>;
}
