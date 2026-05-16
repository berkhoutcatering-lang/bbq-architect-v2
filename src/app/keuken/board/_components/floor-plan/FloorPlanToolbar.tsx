'use client';

import { useState } from 'react';
import {
    MousePointer, UserPlus, Circle as CircleIcon, Square,
    Flame, ChefHat, Wine, Utensils, X, Trash2, Save, Hexagon,
} from 'lucide-react';
import type { ShapeKind } from './CanvasShapes';
import { SHAPE_META } from './CanvasShapes';

export type CanvasTool = 'select' | 'pin' | 'shape' | 'zone';

interface Props {
    tool: CanvasTool;
    onToolChange: (tool: CanvasTool) => void;
    selectedShapeKind: ShapeKind | null;
    onShapeKindChange: (kind: ShapeKind | null) => void;
    /** Selected item id (shape of pin). */
    selectedId: string | null;
    onDeleteSelected: () => void;
    onSave: () => void;
    saving?: boolean;
    /** Dirty: zijn er onopgeslagen wijzigingen? */
    dirty: boolean;
    /** Optionele AI-suggest knop (vóór save). */
    aiSuggest?: React.ReactNode;
}

const SHAPE_BUTTONS: Array<{ kind: ShapeKind; label: string; icon: typeof CircleIcon }> = [
    { kind: 'round-table-8',  label: 'Ronde 8p',  icon: CircleIcon },
    { kind: 'round-table-10', label: 'Ronde 10p', icon: CircleIcon },
    { kind: 'long-table-8',   label: 'Lang 8p',   icon: Square },
    { kind: 'long-table-10',  label: 'Lang 10p',  icon: Square },
    { kind: 'smoker',         label: 'Smoker',    icon: Flame },
    { kind: 'grill',          label: 'Grill',     icon: ChefHat },
    { kind: 'bar',            label: 'Bar',       icon: Wine },
    { kind: 'buffet',         label: 'Buffet',    icon: Utensils },
];

/**
 * FloorPlanToolbar — left-rail tools voor selectie / gast-pin / shape-plaatsing.
 * Pillar #3 (Gloved-hand): 56pt buttons, duidelijke iconen.
 */
export default function FloorPlanToolbar({
    tool, onToolChange,
    selectedShapeKind, onShapeKindChange,
    selectedId, onDeleteSelected,
    onSave, saving, dirty, aiSuggest,
}: Props) {
    const [shapeMenuOpen, setShapeMenuOpen] = useState(false);

    return (
        <aside className="prep-canvas-toolbar">
            <button
                className={`prep-canvas-tool ${tool === 'select' ? 'is-active' : ''}`}
                onClick={() => { onToolChange('select'); onShapeKindChange(null); }}
                title="Selecteer (V)"
            >
                <MousePointer size={20} />
            </button>
            <button
                className={`prep-canvas-tool ${tool === 'pin' ? 'is-active' : ''}`}
                onClick={() => { onToolChange('pin'); onShapeKindChange(null); }}
                title="Gast-pin plaatsen (G)"
            >
                <UserPlus size={20} />
            </button>
            <button
                className={`prep-canvas-tool ${tool === 'shape' ? 'is-active' : ''}`}
                onClick={() => { onToolChange('shape'); setShapeMenuOpen((v) => !v); }}
                title="Tafel / station plaatsen"
            >
                <Square size={20} />
            </button>
            <button
                className={`prep-canvas-tool ${tool === 'zone' ? 'is-active' : ''}`}
                onClick={() => { onToolChange('zone'); onShapeKindChange(null); setShapeMenuOpen(false); }}
                title="Service-zone tekenen (Z)"
            >
                <Hexagon size={20} />
            </button>

            {/* Shape-menu opent uit toolbar zelf */}
            {shapeMenuOpen && tool === 'shape' && (
                <div className="prep-canvas-shape-menu">
                    {SHAPE_BUTTONS.map(({ kind, label, icon: Icon }) => (
                        <button
                            key={kind}
                            className={`prep-canvas-shape ${selectedShapeKind === kind ? 'is-active' : ''}`}
                            onClick={() => onShapeKindChange(kind)}
                            title={label}
                            style={{ borderColor: SHAPE_META[kind].stroke }}
                        >
                            <Icon size={16} />
                            <span>{label}</span>
                        </button>
                    ))}
                </div>
            )}

            <div className="prep-canvas-toolbar__spacer" />

            {selectedId && (
                <button
                    className="prep-canvas-tool prep-canvas-tool--danger"
                    onClick={onDeleteSelected}
                    title="Verwijder selectie (Delete)"
                >
                    <Trash2 size={20} />
                </button>
            )}

            {aiSuggest}

            <button
                className={`prep-canvas-tool prep-canvas-tool--primary ${dirty ? 'is-dirty' : ''}`}
                onClick={onSave}
                disabled={!dirty || saving}
                title="Opslaan (⌘S)"
            >
                {saving ? <X size={20} className="prep-spin" /> : <Save size={20} />}
            </button>
        </aside>
    );
}
