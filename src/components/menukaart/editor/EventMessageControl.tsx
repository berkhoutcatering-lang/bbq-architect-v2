'use client';

/**
 * EventMessageControl — voor de "Persoonlijke boodschap"-sectie in de editor.
 *
 * Drie velden bij elkaar:
 *   - eventTitle  — korte titel ("Bruiloft Jan & Marie")  (text input, ≤80)
 *   - eventMessage — vrijblijvende boodschap (textarea, ≤300)
 *   - eventMessagePosition — boven of onder de gangen (radio chips)
 *
 * Geen cascade-badges per veld: de hele sectie is per-offerte custom.
 * Reset gaat per veld via lokale onClear-knop (zet leeg = clear via Server Action).
 */

import { useEffect, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import type { EventMessagePosition } from '@/lib/menukaart/registry';

type Props = {
    title: string;
    message: string;
    position: EventMessagePosition;
    titleMax: number;
    messageMax: number;
    onChange: (next: { title?: string; message?: string; position?: EventMessagePosition }) => void;
    onResetField: (field: 'eventTitle' | 'eventMessage' | 'eventMessagePosition') => void;
    hasCustomTitle: boolean;
    hasCustomMessage: boolean;
    hasCustomPosition: boolean;
};

export default function EventMessageControl({
    title,
    message,
    position,
    titleMax,
    messageMax,
    onChange,
    onResetField,
    hasCustomTitle,
    hasCustomMessage,
    hasCustomPosition,
}: Props) {
    const [localTitle, setLocalTitle] = useState(title);
    const [localMessage, setLocalMessage] = useState(message);

    useEffect(() => setLocalTitle(title), [title]);
    useEffect(() => setLocalMessage(message), [message]);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Title */}
            <div className="mke-row-stack">
                <div className="mke-row">
                    <span className="mke-label">Titel</span>
                    {hasCustomTitle && (
                        <button
                            className="mke-reset"
                            onClick={() => onResetField('eventTitle')}
                            type="button"
                            title="Reset titel"
                            style={{ marginLeft: 'auto' }}
                        >
                            <RotateCcw size={12} />
                        </button>
                    )}
                </div>
                <div className="mke-input-wrap">
                    <input
                        type="text"
                        className="mke-input"
                        value={localTitle}
                        maxLength={titleMax}
                        placeholder="bv. Bruiloft Jan & Marie"
                        onChange={(e) => setLocalTitle(e.target.value)}
                        onBlur={() => {
                            if (localTitle !== title) onChange({ title: localTitle });
                        }}
                    />
                    <span className="mke-charcount">
                        {localTitle.length}/{titleMax}
                    </span>
                </div>
            </div>

            {/* Message */}
            <div className="mke-row-stack">
                <div className="mke-row">
                    <span className="mke-label">Persoonlijke boodschap</span>
                    {hasCustomMessage && (
                        <button
                            className="mke-reset"
                            onClick={() => onResetField('eventMessage')}
                            type="button"
                            title="Reset boodschap"
                            style={{ marginLeft: 'auto' }}
                        >
                            <RotateCcw size={12} />
                        </button>
                    )}
                </div>
                <div className="mke-input-wrap" style={{ alignItems: 'flex-end' }}>
                    <textarea
                        className="mke-input"
                        value={localMessage}
                        maxLength={messageMax}
                        rows={3}
                        placeholder="bv. Welkom! Geniet van ons signature smoker-menu, speciaal voor jullie samengesteld."
                        onChange={(e) => setLocalMessage(e.target.value)}
                        onBlur={() => {
                            if (localMessage !== message) onChange({ message: localMessage });
                        }}
                        style={{
                            resize: 'vertical',
                            minHeight: 72,
                            fontFamily: 'inherit',
                            lineHeight: 1.5,
                        }}
                    />
                    <span className="mke-charcount">
                        {localMessage.length}/{messageMax}
                    </span>
                </div>
            </div>

            {/* Position */}
            <div className="mke-row-stack">
                <div className="mke-row">
                    <span className="mke-label">Plaats op menukaart</span>
                    {hasCustomPosition && (
                        <button
                            className="mke-reset"
                            onClick={() => onResetField('eventMessagePosition')}
                            type="button"
                            title="Reset positie"
                            style={{ marginLeft: 'auto' }}
                        >
                            <RotateCcw size={12} />
                        </button>
                    )}
                </div>
                <div className="mke-pos-chips">
                    <button
                        className={`mke-pos ${position === 'top' ? 'active' : ''}`}
                        onClick={() => onChange({ position: 'top' })}
                        type="button"
                    >
                        Boven menu
                    </button>
                    <button
                        className={`mke-pos ${position === 'bottom' ? 'active' : ''}`}
                        onClick={() => onChange({ position: 'bottom' })}
                        type="button"
                    >
                        Onder menu
                    </button>
                </div>
            </div>

            <p
                style={{
                    fontSize: 11,
                    color: 'var(--mke-muted-light, #71717a)',
                    margin: 0,
                    lineHeight: 1.5,
                }}
            >
                Toont prominent op de menukaart in de offerte en op de pagina voor de klant.
            </p>
        </div>
    );
}
