'use client';

import { useEffect, useState } from 'react';
import {
    Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetBody, SheetFooter,
} from '@/components/mobile/Sheet';
import { Save, Trash2, User } from 'lucide-react';
import type { Personeel, ServiceZone } from '@/types/database.types';

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Existing zone (edit) of null (create-new). */
    zone: ServiceZone | null;
    personeel: Personeel[];
    onSave: (data: { name: string; assignedPersoneelId: string | null; color: string | null }) => Promise<void>;
    onDelete?: (zoneId: string) => Promise<void>;
}

const PRESET_COLORS = [
    '#FFBF00', // brand
    '#3b82f6', // blue
    '#22c55e', // green
    '#a855f7', // purple
    '#ef4444', // red
    '#f59e0b', // amber
];

export default function ServiceZoneSheet({
    open, onOpenChange, zone, personeel, onSave, onDelete,
}: Props) {
    const [name, setName] = useState('');
    const [assigneeId, setAssigneeId] = useState<string | null>(null);
    const [color, setColor] = useState<string>(PRESET_COLORS[0]);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!open) return;
        if (zone) {
            setName(zone.name);
            setAssigneeId(zone.assigned_personeel_id);
            setColor(zone.color || PRESET_COLORS[0]);
        } else {
            setName('Zone');
            setAssigneeId(null);
            setColor(PRESET_COLORS[0]);
        }
    }, [open, zone]);

    async function handleSave() {
        const trimmed = name.trim();
        if (!trimmed) return;
        setSaving(true);
        try {
            await onSave({ name: trimmed, assignedPersoneelId: assigneeId, color });
            onOpenChange(false);
        } finally {
            setSaving(false);
        }
    }

    async function handleDelete() {
        if (!zone || !onDelete) return;
        const ok = window.confirm(`Zone "${zone.name}" verwijderen?`);
        if (!ok) return;
        setSaving(true);
        try {
            await onDelete(zone.id);
            onOpenChange(false);
        } finally {
            setSaving(false);
        }
    }

    return (
        <Sheet open={open} onOpenChange={onOpenChange} variant="bottom">
            <SheetContent>
                <SheetHeader>
                    <SheetTitle>{zone ? 'Zone aanpassen' : 'Nieuwe service-zone'}</SheetTitle>
                    <SheetDescription>
                        Wijs een hoek van de plattegrond toe aan een team-lid. Geen PII.
                    </SheetDescription>
                </SheetHeader>

                <SheetBody>
                    <div className="prep-sheet__section">
                        <label className="prep-sheet__field">
                            <span>Naam</span>
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                maxLength={40}
                                placeholder="Zuid-zone, Front of house..."
                                autoFocus={!zone}
                            />
                        </label>
                    </div>

                    <div className="prep-sheet__section">
                        <h3 className="prep-sheet__section-title">
                            <User size={14} /> Wie loopt hier
                        </h3>
                        <div className="prep-sheet__personeel-list">
                            <button
                                type="button"
                                className={`prep-sheet__personeel-row ${assigneeId === null ? 'is-active' : ''}`}
                                onClick={() => setAssigneeId(null)}
                            >
                                <User size={16} />
                                <span>Geen koppeling</span>
                                <span className="prep-sheet__personeel-functie">—</span>
                            </button>
                            {personeel.filter((p) => p.actief).map((p) => (
                                <button
                                    key={p.id}
                                    type="button"
                                    className={`prep-sheet__personeel-row ${assigneeId === p.id ? 'is-active' : ''}`}
                                    onClick={() => setAssigneeId(p.id)}
                                >
                                    <User size={16} />
                                    <span>{p.naam}</span>
                                    <span className="prep-sheet__personeel-functie">{p.functie}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="prep-sheet__section">
                        <h3 className="prep-sheet__section-title">Kleur</h3>
                        <div className="prep-color-row">
                            {PRESET_COLORS.map((c) => (
                                <button
                                    key={c}
                                    type="button"
                                    className={`prep-color-swatch ${c === color ? 'is-active' : ''}`}
                                    style={{ background: c }}
                                    onClick={() => setColor(c)}
                                    aria-label={`Kleur ${c}`}
                                />
                            ))}
                        </div>
                    </div>
                </SheetBody>

                <SheetFooter>
                    {zone && onDelete && (
                        <button className="prep-sheet__danger" onClick={handleDelete} disabled={saving}>
                            <Trash2 size={16} /> Verwijder
                        </button>
                    )}
                    <button
                        className="prep-sheet__primary"
                        onClick={handleSave}
                        disabled={!name.trim() || saving}
                    >
                        <Save size={20} /> {zone ? 'Opslaan' : 'Plaats zone'}
                    </button>
                </SheetFooter>
            </SheetContent>
        </Sheet>
    );
}
