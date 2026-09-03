'use client';

import { useEffect, useState } from 'react';
import {
    Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetBody, SheetFooter,
} from '@/components/mobile/Sheet';
import { Trash2, Save, AlertTriangle } from 'lucide-react';
import type { FloorPlanGuest } from '@/types/database.types';
import { ALL_ALLERGENS } from '@/lib/prep/allergens';
import type { Allergen } from '@/lib/allergenDetect';

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Existing pin (edit) of null (create-new). */
    guest: FloorPlanGuest | null;
    /** Bij create-new: voorgestelde positie. */
    initialXPct?: number;
    initialYPct?: number;
    onSave: (data: GuestPinFormInput) => Promise<void>;
    onDelete?: (guestId: string) => Promise<void>;
}

export interface GuestPinFormInput {
    label: string;
    full_name: string | null;
    allergens: Allergen[];
    severity: 'normal' | 'high' | 'critical';
    note: string | null;
    dietary_restriction: string | null;
    x_pct: number;
    y_pct: number;
}

/**
 * GuestPinSheet — bottom-sheet voor pin-edit / pin-create.
 *
 * Pillar #5 (Allergeen-radar): EU-14 allergeen-checkboxes met kleur-coding.
 * AVG-veiligheid: form maakt onderscheid tussen `label` (display-safe, blijft)
 *   en `full_name` + `note` (PII, wordt 30d na event geanonymiseerd).
 */
export default function GuestPinSheet({
    open, onOpenChange, guest, initialXPct, initialYPct, onSave, onDelete,
}: Props) {
    const [label, setLabel] = useState('');
    const [fullName, setFullName] = useState('');
    const [allergens, setAllergens] = useState<Set<Allergen>>(new Set());
    const [severity, setSeverity] = useState<'normal' | 'high' | 'critical'>('normal');
    const [note, setNote] = useState('');
    const [dietary, setDietary] = useState('');
    const [saving, setSaving] = useState(false);

    /* Sync form-state als sheet opent voor existing of new pin. */
    useEffect(() => {
        if (!open) return;
        if (guest) {
            setLabel(guest.label);
            setFullName(guest.full_name ?? '');
            setAllergens(new Set(guest.allergens as Allergen[]));
            setSeverity(guest.severity);
            setNote(guest.note ?? '');
            setDietary(guest.dietary_restriction ?? '');
        } else {
            // Generate default label "G1", "G2" — niet uniek-check hier; server doet z'n eigen ding
            setLabel('G' + Math.floor(Math.random() * 99).toString().padStart(2, '0'));
            setFullName('');
            setAllergens(new Set());
            setSeverity('normal');
            setNote('');
            setDietary('');
        }
    }, [open, guest]);

    function toggleAllergen(code: Allergen) {
        setAllergens((prev) => {
            const next = new Set(prev);
            if (next.has(code)) next.delete(code);
            else next.add(code);
            return next;
        });
    }

    async function handleSave() {
        const trimmedLabel = label.trim();
        if (!trimmedLabel) return;
        setSaving(true);
        try {
            await onSave({
                label: trimmedLabel,
                full_name: fullName.trim() || null,
                allergens: Array.from(allergens),
                severity,
                note: note.trim() || null,
                dietary_restriction: dietary.trim() || null,
                x_pct: guest?.x_pct ?? initialXPct ?? 50,
                y_pct: guest?.y_pct ?? initialYPct ?? 50,
            });
            onOpenChange(false);
        } finally {
            setSaving(false);
        }
    }

    async function handleDelete() {
        if (!guest || !onDelete) return;
        const ok = window.confirm(`Pin "${guest.label}" verwijderen?`);
        if (!ok) return;
        setSaving(true);
        try {
            await onDelete(guest.id);
            onOpenChange(false);
        } finally {
            setSaving(false);
        }
    }

    const hasCriticalAllergen = severity === 'critical' || allergens.has('noten') || allergens.has('pinda') || allergens.has('schaaldieren');

    return (
        <Sheet open={open} onOpenChange={onOpenChange} variant="bottom">
            <SheetContent>
                <SheetHeader>
                    <SheetTitle>{guest ? 'Gast aanpassen' : 'Nieuwe gast-pin'}</SheetTitle>
                    <SheetDescription>
                        Label = pin op de plattegrond (zichtbaar voor iedereen). Naam = alleen voor service-team.
                    </SheetDescription>
                </SheetHeader>

                <SheetBody>
                    <div className="prep-sheet__section">
                        <label className="prep-sheet__field">
                            <span>Label *</span>
                            <input
                                type="text"
                                value={label}
                                onChange={(e) => setLabel(e.target.value)}
                                placeholder="G3 of T5-S2"
                                maxLength={20}
                                autoFocus={!guest}
                            />
                        </label>
                        <label className="prep-sheet__field">
                            <span>Naam (PII)</span>
                            <input
                                type="text"
                                value={fullName}
                                onChange={(e) => setFullName(e.target.value)}
                                placeholder="Volledige naam (optioneel)"
                                maxLength={80}
                            />
                        </label>
                        <label className="prep-sheet__field">
                            <span>Dieet</span>
                            <input
                                type="text"
                                value={dietary}
                                onChange={(e) => setDietary(e.target.value)}
                                placeholder="bv. vegan / halal / glutenvrij"
                                maxLength={40}
                            />
                        </label>
                    </div>

                    <div className="prep-sheet__section">
                        <h3 className="prep-sheet__section-title">
                            <AlertTriangle size={14} /> Allergenen (EU-14)
                        </h3>
                        <div className="prep-allergen-grid">
                            {ALL_ALLERGENS.map((meta) => {
                                const active = allergens.has(meta.code);
                                return (
                                    <button
                                        key={meta.code}
                                        type="button"
                                        className={`prep-allergen-chip ${active ? 'is-active' : ''}`}
                                        style={active ? {
                                            background: `var(--${meta.color}, var(--brand))`,
                                            borderColor: `var(--${meta.color}, var(--brand))`,
                                            color: '#0a0a0c',
                                        } : { borderColor: `var(--${meta.color}, var(--muted))` }}
                                        onClick={() => toggleAllergen(meta.code)}
                                        title={meta.description}
                                    >
                                        <span className="prep-allergen-chip__badge">{meta.badge}</span>
                                        <span>{meta.label}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div className="prep-sheet__section">
                        <h3 className="prep-sheet__section-title">Ernst</h3>
                        <div className="prep-severity-row">
                            {(['normal', 'high', 'critical'] as const).map((sev) => (
                                <button
                                    key={sev}
                                    type="button"
                                    className={`prep-severity-btn ${severity === sev ? 'is-active' : ''}`}
                                    onClick={() => setSeverity(sev)}
                                    data-severity={sev}
                                >
                                    {sev === 'normal' && 'Mild'}
                                    {sev === 'high' && 'Hoog'}
                                    {sev === 'critical' && 'Kritiek'}
                                </button>
                            ))}
                        </div>
                        {hasCriticalAllergen && severity !== 'critical' && (
                            <p className="prep-sheet__hint">
                                ⚠ Anafylaxie-risico-allergeen geselecteerd — overweeg severity = Kritiek
                            </p>
                        )}
                    </div>

                    <div className="prep-sheet__section">
                        <label className="prep-sheet__field">
                            <span>Notitie (PII)</span>
                            <input
                                type="text"
                                value={note}
                                onChange={(e) => setNote(e.target.value)}
                                placeholder="bv. EpiPen in jas, naast de gastvrouw"
                                maxLength={500}
                            />
                        </label>
                    </div>

                    {guest && (
                        <div className="prep-sheet__section">
                            <p className="prep-sheet__hint">
                                Naam + notitie worden 30 dagen na event automatisch verwijderd (AVG).
                            </p>
                        </div>
                    )}
                </SheetBody>

                <SheetFooter>
                    {guest && onDelete && (
                        <button className="prep-sheet__danger" onClick={handleDelete} disabled={saving}>
                            <Trash2 size={16} /> Verwijder
                        </button>
                    )}
                    <button
                        className="prep-sheet__primary"
                        onClick={handleSave}
                        disabled={!label.trim() || saving}
                    >
                        <Save size={20} /> {guest ? 'Opslaan' : 'Plaats pin'}
                    </button>
                </SheetFooter>
            </SheetContent>
        </Sheet>
    );
}
