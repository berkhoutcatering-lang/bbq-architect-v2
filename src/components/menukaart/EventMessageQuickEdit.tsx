'use client';

/**
 * EventMessageQuickEdit — quick-edit modal voor de persoonlijke boodschap
 * op de menukaart, vanuit context buiten de menukaart-editor (event-hub).
 *
 * Updatet alleen `eventTitle` + `eventMessage` + `eventMessagePosition` op
 * `offertes.menukaart_overrides` via `saveEventMessage` Server Action.
 * Andere overrides op de offerte blijven ongewijzigd.
 *
 * UX-flow:
 *  1. Knop "Persoonlijke boodschap" naast Print-knop op event-hub
 *  2. Klik → modal opent met huidige tekst (of leeg)
 *  3. Bewerk titel + boodschap + boven/onder-positie
 *  4. Opslaan → Server Action → modal sluit → router.refresh
 *  5. Toast bevestigt success
 */

import { useState, useEffect, useTransition } from 'react';
import { X, Heart, Loader2, Check } from 'lucide-react';
import type { EventMessagePosition } from '@/lib/menukaart/registry';
import { saveEventMessage } from '@/app/offertes/[id]/menukaart-editor/actions';

type Props = {
    open: boolean;
    onClose: () => void;
    offerId: string | number;
    initialTitle?: string;
    initialMessage?: string;
    initialPosition?: EventMessagePosition;
    onSaved?: () => void;
};

const TITLE_MAX = 80;
const MESSAGE_MAX = 300;

export default function EventMessageQuickEdit({
    open,
    onClose,
    offerId,
    initialTitle = '',
    initialMessage = '',
    initialPosition = 'top',
    onSaved,
}: Props) {
    const [title, setTitle] = useState(initialTitle);
    const [message, setMessage] = useState(initialMessage);
    const [position, setPosition] = useState<EventMessagePosition>(initialPosition);
    const [error, setError] = useState<string | null>(null);
    const [savedTick, setSavedTick] = useState(false);
    const [isPending, startTransition] = useTransition();

    // Sync wanneer parent props wijzigen of modal opnieuw opent
    useEffect(() => {
        if (open) {
            setTitle(initialTitle);
            setMessage(initialMessage);
            setPosition(initialPosition);
            setError(null);
            setSavedTick(false);
        }
    }, [open, initialTitle, initialMessage, initialPosition]);

    if (!open) return null;

    function handleSave() {
        setError(null);
        startTransition(async () => {
            const result = await saveEventMessage({
                offerId: String(offerId),
                eventTitle: title,
                eventMessage: message,
                eventMessagePosition: position,
            });
            if ('error' in result) {
                setError(result.error);
                return;
            }
            setSavedTick(true);
            onSaved?.();
            setTimeout(() => {
                onClose();
            }, 700);
        });
    }

    function handleClear() {
        setTitle('');
        setMessage('');
    }

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="event-message-modal-title"
            onClick={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
            style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0,0,0,.55)',
                backdropFilter: 'blur(4px)',
                zIndex: 200,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 20,
            }}
        >
            <div
                style={{
                    background: 'var(--bg-elevated, #18181b)',
                    border: '1px solid rgba(255,255,255,.08)',
                    borderRadius: 12,
                    width: '100%',
                    maxWidth: 520,
                    color: 'var(--text, #fafafa)',
                    boxShadow: '0 24px 64px rgba(0,0,0,.5)',
                    display: 'flex',
                    flexDirection: 'column',
                    maxHeight: '90vh',
                }}
            >
                {/* Header */}
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '18px 22px 14px',
                        borderBottom: '1px solid rgba(255,255,255,.08)',
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div
                            style={{
                                width: 32,
                                height: 32,
                                borderRadius: 8,
                                background: 'rgba(196,163,90,.15)',
                                color: '#c4a35a',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                            }}
                        >
                            <Heart size={16} />
                        </div>
                        <div>
                            <h2 id="event-message-modal-title" style={{ fontSize: 15, fontWeight: 600, color: 'var(--text, #fafafa)' }}>
                                Persoonlijke boodschap
                            </h2>
                            <p style={{ fontSize: 11, color: 'var(--muted, #a1a1aa)', marginTop: 2 }}>
                                Verschijnt op de menukaart, boven of onder de gangen.
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Sluiten"
                        style={{
                            background: 'transparent',
                            border: '1px solid rgba(255,255,255,.1)',
                            borderRadius: 8,
                            width: 32,
                            height: 32,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'var(--muted, #a1a1aa)',
                            cursor: 'pointer',
                        }}
                    >
                        <X size={16} />
                    </button>
                </div>

                {/* Body */}
                <div style={{ padding: 22, overflowY: 'auto' }}>
                    <label style={{ display: 'block', marginBottom: 14 }}>
                        <div
                            style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                fontSize: 11,
                                fontWeight: 600,
                                color: 'var(--muted, #a1a1aa)',
                                letterSpacing: '0.05em',
                                textTransform: 'uppercase',
                                marginBottom: 4,
                            }}
                        >
                            <span>Titel</span>
                            <span style={{ fontWeight: 400 }}>{title.length}/{TITLE_MAX}</span>
                        </div>
                        <input
                            type="text"
                            value={title}
                            maxLength={TITLE_MAX}
                            placeholder="bv. Bruiloft Jan & Marie"
                            onChange={(e) => setTitle(e.target.value)}
                            style={{
                                width: '100%',
                                padding: '8px 12px',
                                background: 'rgba(255,255,255,.04)',
                                border: '1px solid rgba(255,255,255,.1)',
                                borderRadius: 6,
                                color: 'var(--text, #fafafa)',
                                fontSize: 13,
                                fontFamily: 'inherit',
                            }}
                        />
                    </label>

                    <label style={{ display: 'block', marginBottom: 14 }}>
                        <div
                            style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                fontSize: 11,
                                fontWeight: 600,
                                color: 'var(--muted, #a1a1aa)',
                                letterSpacing: '0.05em',
                                textTransform: 'uppercase',
                                marginBottom: 4,
                            }}
                        >
                            <span>Boodschap</span>
                            <span style={{ fontWeight: 400 }}>{message.length}/{MESSAGE_MAX}</span>
                        </div>
                        <textarea
                            value={message}
                            maxLength={MESSAGE_MAX}
                            rows={4}
                            placeholder="bv. Welkom op deze speciale dag — geniet van ons signature smoker-menu, samengesteld speciaal voor jullie."
                            onChange={(e) => setMessage(e.target.value)}
                            style={{
                                width: '100%',
                                padding: '8px 12px',
                                background: 'rgba(255,255,255,.04)',
                                border: '1px solid rgba(255,255,255,.1)',
                                borderRadius: 6,
                                color: 'var(--text, #fafafa)',
                                fontSize: 13,
                                fontFamily: 'inherit',
                                lineHeight: 1.55,
                                resize: 'vertical',
                                minHeight: 100,
                            }}
                        />
                    </label>

                    <div style={{ marginBottom: 6 }}>
                        <div
                            style={{
                                fontSize: 11,
                                fontWeight: 600,
                                color: 'var(--muted, #a1a1aa)',
                                letterSpacing: '0.05em',
                                textTransform: 'uppercase',
                                marginBottom: 6,
                            }}
                        >
                            Plaats
                        </div>
                        <div style={{ display: 'flex', gap: 6 }}>
                            <button
                                type="button"
                                onClick={() => setPosition('top')}
                                style={{
                                    flex: 1,
                                    padding: '8px 12px',
                                    borderRadius: 6,
                                    border: position === 'top'
                                        ? '1px solid #c4a35a'
                                        : '1px solid rgba(255,255,255,.1)',
                                    background: position === 'top' ? 'rgba(196,163,90,.12)' : 'rgba(255,255,255,.02)',
                                    color: position === 'top' ? '#c4a35a' : 'var(--muted, #a1a1aa)',
                                    fontSize: 12,
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                }}
                            >
                                Boven menu
                            </button>
                            <button
                                type="button"
                                onClick={() => setPosition('bottom')}
                                style={{
                                    flex: 1,
                                    padding: '8px 12px',
                                    borderRadius: 6,
                                    border: position === 'bottom'
                                        ? '1px solid #c4a35a'
                                        : '1px solid rgba(255,255,255,.1)',
                                    background: position === 'bottom' ? 'rgba(196,163,90,.12)' : 'rgba(255,255,255,.02)',
                                    color: position === 'bottom' ? '#c4a35a' : 'var(--muted, #a1a1aa)',
                                    fontSize: 12,
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                }}
                            >
                                Onder menu
                            </button>
                        </div>
                    </div>

                    {error && (
                        <div
                            style={{
                                marginTop: 12,
                                padding: '8px 12px',
                                borderRadius: 6,
                                background: 'rgba(239,68,68,.1)',
                                color: '#ef4444',
                                fontSize: 12,
                            }}
                        >
                            {error}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div
                    style={{
                        padding: '14px 22px',
                        borderTop: '1px solid rgba(255,255,255,.08)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: 8,
                    }}
                >
                    <button
                        type="button"
                        onClick={handleClear}
                        disabled={isPending || (!title && !message)}
                        style={{
                            padding: '8px 14px',
                            border: '1px solid rgba(255,255,255,.1)',
                            background: 'transparent',
                            borderRadius: 6,
                            color: 'var(--muted, #a1a1aa)',
                            fontSize: 12,
                            fontWeight: 500,
                            cursor: isPending ? 'not-allowed' : 'pointer',
                            opacity: !title && !message ? 0.4 : 1,
                        }}
                    >
                        Velden leegmaken
                    </button>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={isPending}
                            style={{
                                padding: '8px 14px',
                                border: '1px solid rgba(255,255,255,.1)',
                                background: 'transparent',
                                borderRadius: 6,
                                color: 'var(--text, #fafafa)',
                                fontSize: 12,
                                fontWeight: 500,
                                cursor: isPending ? 'not-allowed' : 'pointer',
                            }}
                        >
                            Annuleren
                        </button>
                        <button
                            type="button"
                            onClick={handleSave}
                            disabled={isPending}
                            style={{
                                padding: '8px 16px',
                                border: '1px solid #c4a35a',
                                background: savedTick ? '#22c55e' : '#9e781c',
                                borderRadius: 6,
                                color: '#fff',
                                fontSize: 12,
                                fontWeight: 600,
                                cursor: isPending ? 'wait' : 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                                minWidth: 100,
                                justifyContent: 'center',
                            }}
                        >
                            {savedTick ? (
                                <>
                                    <Check size={14} /> Opgeslagen
                                </>
                            ) : isPending ? (
                                <>
                                    <Loader2 size={14} className="mke-spin" /> Opslaan…
                                </>
                            ) : (
                                <>Opslaan</>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
