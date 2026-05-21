'use client';

/**
 * TemplatePickerSheet — modal/sheet om uit 10 templates te kiezen.
 *
 * Opens vanuit "Wisselen van template"-knop in MenukaartEditor header.
 * Toont thumbnails (CSS-only) van alle enabled templates met huidige
 * accent-kleur, current template gehighlight, klik → switchOfferTemplate
 * Server Action.
 *
 * Custom-overrides die ook bij de nieuwe template horen blijven behouden;
 * de rest valt weg (zie actions.ts switchOfferTemplate preserveOverrides).
 */

import { useState, useTransition } from 'react';
import { X, Check, Loader2 } from 'lucide-react';
import { listEnabledTemplates } from '@/lib/menukaart/registry';
import { ThumbnailFor } from '@/components/menukaart/templates/Thumbnails';
import { switchOfferTemplate } from '@/app/offertes/[id]/menukaart-editor/actions';

type Props = {
    open: boolean;
    onClose: () => void;
    offerId: string;
    currentTemplateId: string;
    currentAccent?: string;
    onSwitched: (newTemplateId: string) => void;
};

export default function TemplatePickerSheet({
    open,
    onClose,
    offerId,
    currentTemplateId,
    currentAccent,
    onSwitched,
}: Props) {
    const [isPending, startTransition] = useTransition();
    const [errorId, setErrorId] = useState<string | null>(null);
    const [pendingId, setPendingId] = useState<string | null>(null);

    if (!open) return null;

    const templates = listEnabledTemplates();

    const handleSwitch = (templateId: string) => {
        if (templateId === currentTemplateId) {
            onClose();
            return;
        }
        setPendingId(templateId);
        setErrorId(null);
        startTransition(async () => {
            const result = await switchOfferTemplate({
                offerId,
                templateId,
                preserveOverrides: true,
            });
            setPendingId(null);
            if ('error' in result) {
                setErrorId(templateId);
                return;
            }
            onSwitched(templateId);
            onClose();
        });
    };

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="template-picker-title"
            style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0,0,0,.55)',
                backdropFilter: 'blur(4px)',
                zIndex: 200,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 24,
            }}
            onClick={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
        >
            <div
                style={{
                    background: 'var(--mke-bg, #18181b)',
                    border: '1px solid var(--mke-border, rgba(255,255,255,.08))',
                    borderRadius: 12,
                    width: '100%',
                    maxWidth: 920,
                    maxHeight: '85vh',
                    display: 'flex',
                    flexDirection: 'column',
                    boxShadow: '0 24px 64px rgba(0,0,0,.5)',
                }}
            >
                {/* Header */}
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '20px 24px 14px',
                        borderBottom: '1px solid var(--mke-border, rgba(255,255,255,.08))',
                    }}
                >
                    <div>
                        <h2 id="template-picker-title" style={{ fontSize: 17, fontWeight: 600, color: 'var(--mke-text, #fafafa)' }}>
                            Kies een template
                        </h2>
                        <p style={{ fontSize: 12, color: 'var(--mke-muted, #a1a1aa)', marginTop: 3 }}>
                            Aanpassingen blijven behouden voor velden die ook in de nieuwe template bestaan.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Sluiten"
                        style={{
                            background: 'transparent',
                            border: '1px solid var(--mke-border, rgba(255,255,255,.1))',
                            borderRadius: 8,
                            width: 32,
                            height: 32,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'var(--mke-muted, #a1a1aa)',
                            cursor: 'pointer',
                        }}
                    >
                        <X size={16} />
                    </button>
                </div>

                {/* Grid */}
                <div
                    style={{
                        padding: 24,
                        overflowY: 'auto',
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                        gap: 16,
                    }}
                >
                    {templates.map((t) => {
                        const Thumb = ThumbnailFor(t.id);
                        const isActive = t.id === currentTemplateId;
                        const isLoading = pendingId === t.id && isPending;
                        const hasError = errorId === t.id;
                        return (
                            <button
                                key={t.id}
                                type="button"
                                onClick={() => handleSwitch(t.id)}
                                disabled={isPending}
                                style={{
                                    background: 'transparent',
                                    border: isActive
                                        ? `2px solid ${currentAccent ?? '#c4a35a'}`
                                        : '1px solid var(--mke-border, rgba(255,255,255,.12))',
                                    borderRadius: 10,
                                    padding: 0,
                                    cursor: isPending ? 'wait' : 'pointer',
                                    textAlign: 'left',
                                    overflow: 'hidden',
                                    color: 'inherit',
                                    transition: 'transform .15s, border-color .15s',
                                    position: 'relative',
                                    opacity: isPending && !isLoading ? 0.5 : 1,
                                }}
                                onMouseEnter={(e) => {
                                    if (!isPending) e.currentTarget.style.transform = 'translateY(-2px)';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.transform = '';
                                }}
                            >
                                {isActive && (
                                    <span
                                        style={{
                                            position: 'absolute',
                                            top: 8,
                                            right: 8,
                                            zIndex: 2,
                                            background: currentAccent ?? '#c4a35a',
                                            color: '#000',
                                            borderRadius: 999,
                                            width: 22,
                                            height: 22,
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                        }}
                                        aria-label="Huidige template"
                                    >
                                        <Check size={13} strokeWidth={3} />
                                    </span>
                                )}
                                {isLoading && (
                                    <span
                                        style={{
                                            position: 'absolute',
                                            inset: 0,
                                            background: 'rgba(0,0,0,.5)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            zIndex: 3,
                                        }}
                                    >
                                        <Loader2 size={22} className="mke-spin" color="#fafafa" />
                                    </span>
                                )}
                                <Thumb brandPrimary={currentAccent} />
                                <div style={{ padding: 12 }}>
                                    <div
                                        style={{
                                            fontSize: 10,
                                            fontWeight: 700,
                                            letterSpacing: '.18em',
                                            textTransform: 'uppercase',
                                            color: 'var(--mke-gold, #c4a35a)',
                                            marginBottom: 4,
                                        }}
                                    >
                                        {t.id}
                                    </div>
                                    <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--mke-text, #fafafa)' }}>
                                        {t.name}
                                    </div>
                                    <div
                                        style={{
                                            fontSize: 11,
                                            color: 'var(--mke-muted, #a1a1aa)',
                                            marginTop: 4,
                                            lineHeight: 1.5,
                                        }}
                                    >
                                        {t.description}
                                    </div>
                                    <div style={{ display: 'flex', gap: 5, marginTop: 8 }}>
                                        <span
                                            style={{
                                                fontSize: 9,
                                                padding: '2px 7px',
                                                borderRadius: 999,
                                                border: '1px solid var(--mke-border, rgba(255,255,255,.12))',
                                                color: 'var(--mke-muted, #a1a1aa)',
                                                fontWeight: 600,
                                            }}
                                        >
                                            {t.paper === 'square' ? '21×21' : 'A4'}
                                        </span>
                                        {hasError && (
                                            <span
                                                style={{
                                                    fontSize: 9,
                                                    padding: '2px 7px',
                                                    borderRadius: 999,
                                                    background: 'rgba(239,68,68,.15)',
                                                    color: '#ef4444',
                                                    fontWeight: 600,
                                                }}
                                            >
                                                Wisselen mislukt
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </button>
                        );
                    })}
                </div>

                <div
                    style={{
                        padding: '12px 24px',
                        borderTop: '1px solid var(--mke-border, rgba(255,255,255,.08))',
                        fontSize: 11,
                        color: 'var(--mke-muted, #a1a1aa)',
                    }}
                >
                    Wijzigingen worden direct opgeslagen op de offerte. Andere offertes blijven hun eigen template behouden.
                </div>
            </div>
        </div>
    );
}
