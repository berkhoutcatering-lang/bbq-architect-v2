'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useToast } from '@/components/Toast';
import type {
    FloorPlan, FloorPlanGuest, ServiceZone, DbEvent, Personeel,
} from '@/types/database.types';
import { ALLERGEN_META } from '@/lib/prep/allergens';
import { supabase } from '@/lib/supabase';
import { useOrg } from '@/lib/OrgContext';
import { AlertTriangle, Wind, Check } from 'lucide-react';

import FloorPlanToolbar, { type CanvasTool } from './FloorPlanToolbar';
import type { ShapeKind, CanvasShape, WindDirection } from './CanvasShapes';
import { SHAPE_META } from './CanvasShapes';
import GuestPinSheet, { type GuestPinFormInput } from './GuestPinSheet';
import ServiceZoneSheet from './ServiceZoneSheet';
import {
    detectAllergenClusters, detectPlumeWarnings, nextWindDirection,
} from './clusters';

/* Konva touches window — lazy import zonder SSR. */
const FloorPlanCanvas = dynamic(() => import('./FloorPlanCanvas'), {
    ssr: false,
    loading: () => <div className="prep-canvas-wrap prep-canvas-wrap--loading">Floor-plan laden…</div>,
});

interface Props {
    /** Welk event de plattegrond representeert. */
    event: DbEvent;
}

/**
 * FloorPlanView — Service-modus container.
 *
 * Beheert: floor_plan + guests + zones state, autosave-debounce van
 * canvas-edits, pin-sheet, allergeen-cluster-warning.
 *
 * Pillar #4 (Schets-in-30s): templates + click-to-add.
 * Pillar #5 (Allergeen-radar): cluster-detect bij ≥3 zelfde allergeen binnen 15% canvas-radius.
 * Pillar #6 (Offline): autosave debounced 2s, version-conflict-recovery.
 */
export default function FloorPlanView({ event }: Props) {
    const showToast = useToast();
    const { orgId } = useOrg();
    const [loading, setLoading] = useState(true);
    const [floorPlan, setFloorPlan] = useState<FloorPlan | null>(null);
    const [guests, setGuests] = useState<FloorPlanGuest[]>([]);
    const [zones, setZones] = useState<ServiceZone[]>([]);
    const [personeel, setPersoneel] = useState<Personeel[]>([]);
    const [tool, setTool] = useState<CanvasTool>('select');
    const [selectedShapeKind, setSelectedShapeKind] = useState<ShapeKind | null>(null);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [dirty, setDirty] = useState(false);

    /* Polygon-draw state — terwijl tool='zone' verzamelt clicks. */
    const [polygonPoints, setPolygonPoints] = useState<{ x_pct: number; y_pct: number }[]>([]);

    /* Pin-sheet state. */
    const [pinSheetOpen, setPinSheetOpen] = useState(false);
    const [pinSheetGuest, setPinSheetGuest] = useState<FloorPlanGuest | null>(null);
    const [pinSheetInitialXY, setPinSheetInitialXY] = useState<{ x: number; y: number } | null>(null);

    /* Zone-sheet state. */
    const [zoneSheetOpen, setZoneSheetOpen] = useState(false);
    const [zoneSheetZone, setZoneSheetZone] = useState<ServiceZone | null>(null);
    const [pendingPoints, setPendingPoints] = useState<{ x_pct: number; y_pct: number }[]>([]);

    /* Personeel — voor zone-toewijzing. */
    useEffect(() => {
        if (!supabase || !orgId) return;
        let cancelled = false;
        async function load() {
            if (!supabase) return;
            const { data } = await supabase
                .from('personeel')
                .select('id, organization_id, user_id, naam, email, telefoon, functie, uurtarief, contract_type, actief, notitie, created_at')
                .eq('organization_id', orgId)
                .eq('actief', true);
            if (!cancelled && data) setPersoneel(data as Personeel[]);
        }
        load();
        return () => { cancelled = true; };
    }, [orgId]);

    /* Initial load — get-or-create. */
    useEffect(() => {
        let cancelled = false;
        async function load() {
            setLoading(true);
            try {
                const res = await fetch('/api/floor-plan/get-or-create', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ eventId: event.id }),
                });
                if (!res.ok) throw new Error((await res.json() as { error?: string }).error || res.statusText);
                const data = await res.json() as { floorPlan: FloorPlan; guests: FloorPlanGuest[]; zones: ServiceZone[] };
                if (cancelled) return;
                setFloorPlan(data.floorPlan);
                setGuests(data.guests);
                setZones(data.zones);
            } catch (e) {
                console.error('[floor-plan/load]', e);
                showToast({ message: 'Kon plattegrond niet laden', type: 'error' });
            } finally {
                if (!cancelled) setLoading(false);
            }
        }
        load();
        return () => { cancelled = true; };
    }, [event.id, showToast]);

    /* Debounced autosave van canvas_json (shapes). */
    const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const saveCanvas = useCallback(async () => {
        if (!floorPlan || !dirty) return;
        setSaving(true);
        try {
            const res = await fetch('/api/floor-plan/save-canvas', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    floorPlanId: floorPlan.id,
                    canvasJson: floorPlan.canvas_json,
                    expectedVersion: floorPlan.canvas_version,
                }),
            });
            if (res.status === 409) {
                const data = await res.json() as { currentVersion?: number };
                showToast({
                    message: 'Iemand anders bewerkte deze plattegrond — vernieuwen',
                    type: 'warning',
                });
                if (typeof data.currentVersion === 'number') {
                    setFloorPlan((fp) => fp ? { ...fp, canvas_version: data.currentVersion! } : fp);
                }
                return;
            }
            if (!res.ok) throw new Error((await res.json() as { error?: string }).error || res.statusText);
            const data = await res.json() as { floorPlan: { canvas_version: number; updated_at: string } };
            setFloorPlan((fp) => fp ? { ...fp, canvas_version: data.floorPlan.canvas_version, updated_at: data.floorPlan.updated_at } : fp);
            setDirty(false);
        } catch (e) {
            console.error('[floor-plan/save]', e);
            showToast({ message: 'Opslaan mislukt — probeer opnieuw', type: 'error' });
        } finally {
            setSaving(false);
        }
    }, [floorPlan, dirty, showToast]);

    /* Auto-save 2s na laatste change. */
    useEffect(() => {
        if (!dirty) return;
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(() => { saveCanvas(); }, 2000);
        return () => {
            if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        };
    }, [dirty, saveCanvas]);

    /* Cmd+S binding voor handmatige save. */
    useEffect(() => {
        function onKey(e: KeyboardEvent) {
            if ((e.metaKey || e.ctrlKey) && e.key === 's') {
                e.preventDefault();
                saveCanvas();
            }
        }
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [saveCanvas]);

    /* Helpers om canvas_json shapes-array veilig te muteren. */
    const updateShapes = useCallback((updater: (shapes: CanvasShape[]) => CanvasShape[]) => {
        setFloorPlan((fp) => {
            if (!fp) return fp;
            const currentShapes = Array.isArray((fp.canvas_json as { shapes?: CanvasShape[] }).shapes)
                ? ((fp.canvas_json as { shapes: CanvasShape[] }).shapes) : [];
            const nextShapes = updater(currentShapes);
            return { ...fp, canvas_json: { ...fp.canvas_json, shapes: nextShapes } };
        });
        setDirty(true);
    }, []);

    function handleCanvasClick(xPct: number, yPct: number) {
        if (tool === 'pin') {
            setPinSheetGuest(null);
            setPinSheetInitialXY({ x: xPct, y: yPct });
            setPinSheetOpen(true);
        } else if (tool === 'shape' && selectedShapeKind) {
            const meta = SHAPE_META[selectedShapeKind];
            const newShape: CanvasShape = {
                id: `s-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                kind: selectedShapeKind,
                x_pct: Math.max(0, Math.min(100 - meta.defaultW, xPct - meta.defaultW / 2)),
                y_pct: Math.max(0, Math.min(100 - meta.defaultH, yPct - meta.defaultH / 2)),
                w_pct: meta.defaultW,
                h_pct: meta.defaultH,
                // Smoker krijgt default wind=NE — Pillar #5 rookpluim active vanaf creatie
                ...(selectedShapeKind === 'smoker' ? { windDirection: 'NE' as WindDirection } : {}),
            };
            updateShapes((prev) => [...prev, newShape]);
            setSelectedId(newShape.id);
        } else if (tool === 'zone') {
            // Verzamel polygon-points; finalize via "Klaar"-knop
            setPolygonPoints((prev) => [...prev, { x_pct: xPct, y_pct: yPct }]);
        } else {
            setSelectedId(null);
        }
    }

    /* Finalize polygon → open zone-sheet voor naam/assignee. */
    function finalizePolygon() {
        if (polygonPoints.length < 3) {
            showToast({ message: 'Polygon heeft minstens 3 punten nodig', type: 'warning' });
            return;
        }
        setPendingPoints(polygonPoints);
        setZoneSheetZone(null);
        setZoneSheetOpen(true);
    }

    function cancelPolygon() {
        setPolygonPoints([]);
    }

    /* Cycle wind-direction op de geselecteerde smoker (Pillar #5). */
    function cycleSmokerWind() {
        if (!selectedId) return;
        updateShapes((prev) => prev.map((s) => {
            if (s.id !== selectedId || s.kind !== 'smoker') return s;
            const current = s.windDirection ?? 'NE';
            return { ...s, windDirection: nextWindDirection(current) };
        }));
    }

    function handleShapeMove(id: string, x: number, y: number) {
        updateShapes((prev) => prev.map((s) => s.id === id ? { ...s, x_pct: x, y_pct: y } : s));
    }

    function handleShapeClick(shape: CanvasShape) {
        setSelectedId(shape.id);
        setTool('select');
    }

    function handleGuestClick(g: FloorPlanGuest) {
        setPinSheetGuest(g);
        setPinSheetInitialXY(null);
        setPinSheetOpen(true);
    }

    async function handleGuestMove(id: string, xPct: number, yPct: number) {
        const original = guests.find((g) => g.id === id);
        if (!original) return;
        // Optimistic
        setGuests((prev) => prev.map((g) => g.id === id ? { ...g, x_pct: xPct, y_pct: yPct } : g));
        const res = await fetch('/api/floor-plan/guest-pin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id: original.id,
                floorPlanId: original.floor_plan_id,
                label: original.label,
                full_name: original.full_name,
                allergens: original.allergens,
                severity: original.severity,
                dietary_restriction: original.dietary_restriction,
                note: original.note,
                color: original.color,
                x_pct: xPct,
                y_pct: yPct,
            }),
        });
        if (!res.ok) {
            // Rollback
            setGuests((prev) => prev.map((g) => g.id === id ? original : g));
            showToast({ message: 'Verplaatsen mislukt', type: 'error' });
        }
    }

    async function handlePinSave(input: GuestPinFormInput) {
        if (!floorPlan) return;
        const res = await fetch('/api/floor-plan/guest-pin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id: pinSheetGuest?.id,
                floorPlanId: floorPlan.id,
                label: input.label,
                full_name: input.full_name,
                allergens: input.allergens,
                severity: input.severity,
                dietary_restriction: input.dietary_restriction,
                note: input.note,
                color: pinSheetGuest?.color ?? null,
                x_pct: input.x_pct,
                y_pct: input.y_pct,
            }),
        });
        if (!res.ok) {
            showToast({ message: 'Opslaan mislukt', type: 'error' });
            return;
        }
        const data = await res.json() as { guest: FloorPlanGuest };
        setGuests((prev) => {
            const exists = prev.find((g) => g.id === data.guest.id);
            return exists
                ? prev.map((g) => g.id === data.guest.id ? data.guest : g)
                : [...prev, data.guest];
        });
        showToast({ message: pinSheetGuest ? 'Pin bijgewerkt' : 'Pin geplaatst', type: 'success', duration: 2000 });
    }

    async function handlePinDelete(guestId: string) {
        const res = await fetch(`/api/floor-plan/guest-pin?id=${encodeURIComponent(guestId)}`, { method: 'DELETE' });
        if (!res.ok) {
            showToast({ message: 'Verwijderen mislukt', type: 'error' });
            return;
        }
        setGuests((prev) => prev.filter((g) => g.id !== guestId));
        showToast({ message: 'Pin verwijderd', type: 'info', duration: 2000 });
    }

    function handleDeleteSelected() {
        if (!selectedId) return;
        // Guest-pin?
        const g = guests.find((g) => g.id === selectedId);
        if (g) {
            handlePinDelete(g.id);
            setSelectedId(null);
            return;
        }
        // Service-zone?
        const z = zones.find((z) => z.id === selectedId);
        if (z) {
            handleZoneDelete(z.id);
            setSelectedId(null);
            return;
        }
        // Anders shape
        updateShapes((prev) => prev.filter((s) => s.id !== selectedId));
        setSelectedId(null);
    }

    /* Cluster + plume warnings (Pillar #5 — allergeen-radar + rookpluim). */
    const clusterWarnings = useMemo(() => detectAllergenClusters(guests), [guests]);
    const plumeWarnings = useMemo(() => {
        const shapes: CanvasShape[] = Array.isArray((floorPlan?.canvas_json as { shapes?: CanvasShape[] })?.shapes)
            ? ((floorPlan!.canvas_json as { shapes: CanvasShape[] }).shapes)
            : [];
        return detectPlumeWarnings(shapes, guests);
    }, [floorPlan?.canvas_json, guests]);

    /* Zone API + delete handlers. */
    async function handleZoneSave(data: { name: string; assignedPersoneelId: string | null; color: string | null }) {
        if (!floorPlan) return;
        const points = zoneSheetZone ? zoneSheetZone.geometry.points : pendingPoints;
        const res = await fetch('/api/floor-plan/zone', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id: zoneSheetZone?.id,
                floorPlanId: floorPlan.id,
                name: data.name,
                assignedPersoneelId: data.assignedPersoneelId,
                color: data.color,
                points,
            }),
        });
        if (!res.ok) {
            showToast({ message: 'Zone opslaan mislukt', type: 'error' });
            return;
        }
        const json = await res.json() as { zone: ServiceZone };
        setZones((prev) => {
            const exists = prev.find((z) => z.id === json.zone.id);
            return exists ? prev.map((z) => z.id === json.zone.id ? json.zone : z) : [...prev, json.zone];
        });
        setPolygonPoints([]);
        setPendingPoints([]);
        setTool('select');
        showToast({ message: zoneSheetZone ? 'Zone bijgewerkt' : 'Zone geplaatst', type: 'success', duration: 2000 });
    }

    async function handleZoneDelete(zoneId: string) {
        const res = await fetch(`/api/floor-plan/zone?id=${encodeURIComponent(zoneId)}`, { method: 'DELETE' });
        if (!res.ok) {
            showToast({ message: 'Verwijderen mislukt', type: 'error' });
            return;
        }
        setZones((prev) => prev.filter((z) => z.id !== zoneId));
        if (selectedId === zoneId) setSelectedId(null);
        showToast({ message: 'Zone verwijderd', type: 'info', duration: 2000 });
    }

    function handleZoneClick(zone: ServiceZone) {
        setZoneSheetZone(zone);
        setPendingPoints([]);
        setSelectedId(zone.id);
        setZoneSheetOpen(true);
    }

    const selectedSmoker = useMemo(() => {
        if (!selectedId || !floorPlan) return null;
        const shapes: CanvasShape[] = Array.isArray((floorPlan.canvas_json as { shapes?: CanvasShape[] }).shapes)
            ? ((floorPlan.canvas_json as { shapes: CanvasShape[] }).shapes) : [];
        const found = shapes.find((s) => s.id === selectedId && s.kind === 'smoker');
        return found ?? null;
    }, [selectedId, floorPlan]);

    if (loading || !floorPlan) {
        return <div className="prep-canvas-wrap prep-canvas-wrap--loading">Plattegrond laden…</div>;
    }

    return (
        <div className="prep-floor-plan">
            <FloorPlanToolbar
                tool={tool}
                onToolChange={(t) => { setTool(t); if (t !== 'zone') setPolygonPoints([]); }}
                selectedShapeKind={selectedShapeKind}
                onShapeKindChange={setSelectedShapeKind}
                selectedId={selectedId}
                onDeleteSelected={handleDeleteSelected}
                onSave={saveCanvas}
                saving={saving}
                dirty={dirty}
            />

            <div className="prep-canvas-main">
                {(clusterWarnings.length > 0 || plumeWarnings.length > 0) && (
                    <div className="prep-warning-stack">
                        {clusterWarnings.length > 0 && (
                            <div className="prep-cluster-warning">
                                <AlertTriangle size={14} />
                                {clusterWarnings.map((w, i) => (
                                    <span key={i}>
                                        {w.count}× {ALLERGEN_META[w.code]?.label ?? w.code} binnen handbereik
                                        {i < clusterWarnings.length - 1 && ' · '}
                                    </span>
                                ))}
                            </div>
                        )}
                        {plumeWarnings.map((pw) => (
                            <div key={pw.smokerId} className="prep-plume-warning">
                                <Wind size={14} />
                                <span>
                                    {pw.smokerLabel}-pluim raakt {pw.affectedGuests.length} astma-gast{pw.affectedGuests.length > 1 ? 'en' : ''}:
                                </span>
                                <span className="prep-plume-warning__pins">
                                    {pw.affectedGuests.map((g) => g.label).join(', ')}
                                </span>
                            </div>
                        ))}
                    </div>
                )}

                {/* Polygon-draw-overlay terwijl tool='zone' */}
                {tool === 'zone' && (
                    <div className="prep-polygon-draw-banner">
                        <span>
                            <Wind size={12} />
                            Tik op canvas om hoeken te plaatsen ({polygonPoints.length} punt{polygonPoints.length === 1 ? '' : 'en'})
                        </span>
                        <button
                            className="prep-canvas-tool--primary prep-polygon-finalize"
                            onClick={finalizePolygon}
                            disabled={polygonPoints.length < 3}
                        >
                            <Check size={14} /> Klaar
                        </button>
                        {polygonPoints.length > 0 && (
                            <button className="prep-polygon-cancel" onClick={cancelPolygon}>
                                Wissen
                            </button>
                        )}
                    </div>
                )}

                {/* Wind-cycle UI bij selected smoker */}
                {selectedSmoker && (
                    <div className="prep-wind-control">
                        <Wind size={14} />
                        <span>Wind: {selectedSmoker.windDirection ?? 'NE'}</span>
                        <button onClick={cycleSmokerWind}>↻ Draai</button>
                    </div>
                )}

                <FloorPlanCanvas
                    floorPlan={floorPlan}
                    guests={guests}
                    zones={zones}
                    personeel={personeel}
                    polygonInProgress={tool === 'zone' ? polygonPoints : []}
                    onGuestMove={handleGuestMove}
                    onGuestClick={handleGuestClick}
                    onShapeMove={handleShapeMove}
                    onShapeClick={handleShapeClick}
                    onZoneClick={handleZoneClick}
                    onCanvasClick={handleCanvasClick}
                    selectedId={selectedId}
                />
            </div>

            <GuestPinSheet
                open={pinSheetOpen}
                onOpenChange={setPinSheetOpen}
                guest={pinSheetGuest}
                initialXPct={pinSheetInitialXY?.x}
                initialYPct={pinSheetInitialXY?.y}
                onSave={handlePinSave}
                onDelete={pinSheetGuest ? handlePinDelete : undefined}
            />

            <ServiceZoneSheet
                open={zoneSheetOpen}
                onOpenChange={(open) => {
                    setZoneSheetOpen(open);
                    if (!open) {
                        // Cancel: maak polygon-state leeg zodat user weer kan tekenen
                        if (!zoneSheetZone) setPolygonPoints([]);
                        setPendingPoints([]);
                    }
                }}
                zone={zoneSheetZone}
                personeel={personeel}
                onSave={handleZoneSave}
                onDelete={zoneSheetZone ? handleZoneDelete : undefined}
            />
        </div>
    );
}

