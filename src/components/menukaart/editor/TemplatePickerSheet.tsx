'use client';

/**
 * TemplatePickerSheet — gallery-style template picker.
 *
 * Sam's HTML-inspiratie geport naar React: dark + lime accent, ticker met
 * template-namen, hover-reveal met "Dit template"-knop, brand-filter chips.
 *
 * Vervangt de oude modal-grid. Opens vanuit "Wisselen van template" knop.
 * Switch via server action `switchOfferTemplate` met preserveOverrides=true.
 */

import { useState, useTransition, useMemo } from 'react';
import { X, Check, Loader2 } from 'lucide-react';
import { listEnabledTemplates, type Template } from '@/lib/menukaart/registry';
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

/* Tag-mapping voor templates — geport uit Sam's gallery HTML. */
type TagDef = { label: string; bg: string; color: string };
function tagsFor(t: Template): TagDef[] {
    const tags: TagDef[] = [
        { label: t.paper === 'square' ? '21×21' : 'A4', bg: '#191C21', color: '#888' },
    ];
    const heading = t.defaults.headingFont;
    if (heading.toLowerCase().includes('mono')) tags.push({ label: 'Mono', bg: '#141C14', color: '#5EAA4A' });
    else if (heading.toLowerCase().includes('caveat')) tags.push({ label: 'Script', bg: '#121A10', color: '#7AC862' });
    else if (heading.toLowerCase().includes('bebas') || heading.toLowerCase().includes('oswald')) tags.push({ label: 'Display', bg: '#161208', color: '#B8A268' });
    else if (heading.toLowerCase().includes('garamond') || heading.toLowerCase().includes('playfair') || heading.toLowerCase().includes('cormorant')) tags.push({ label: 'Serif', bg: '#141C14', color: '#5EAA4A' });
    else tags.push({ label: 'Sans-serif', bg: '#191C21', color: '#888' });

    if (t.defaults.showFootnoteAllergens === true) tags.push({ label: 'Footnote', bg: '#0F1826', color: '#5AABDC' });
    else tags.push({ label: 'Inline', bg: '#1A1228', color: '#A67EDB' });
    return tags;
}

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
    const [hoveredId, setHoveredId] = useState<string | null>(null);

    const templates = useMemo(() => listEnabledTemplates(), []);

    if (!open) return null;

    const handleSwitch = (templateId: string) => {
        if (templateId === currentTemplateId) {
            onClose();
            return;
        }
        setPendingId(templateId);
        setErrorId(null);
        startTransition(async () => {
            const result = await switchOfferTemplate({ offerId, templateId, preserveOverrides: true });
            setPendingId(null);
            if ('error' in result) { setErrorId(templateId); return; }
            onSwitched(templateId);
            onClose();
        });
    };

    const accent = currentAccent ?? '#CCFF00';

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="template-picker-title"
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
            style={{
                position: 'fixed', inset: 0, zIndex: 200,
                background: '#07090C', overflow: 'auto',
                fontFamily: "'Space Grotesk', 'Outfit', sans-serif",
            }}
        >
            {/* Header */}
            <header style={{
                position: 'relative', padding: '36px 56px 28px',
                borderBottom: '1px solid #171A1F', overflow: 'hidden',
            }}>
                <div aria-hidden style={{
                    position: 'absolute', top: -4, left: 40, pointerEvents: 'none',
                    lineHeight: 0.82, userSelect: 'none',
                }}>
                    <div style={{
                        fontFamily: "'Bebas Neue', 'Outfit', sans-serif",
                        fontSize: 'clamp(80px, 16vw, 220px)',
                        color: 'transparent',
                        WebkitTextStroke: `1px ${accent}11`,
                        whiteSpace: 'nowrap',
                    }}>MENU KAART</div>
                </div>
                <div style={{
                    position: 'relative', zIndex: 1,
                    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end',
                    gap: 24, flexWrap: 'wrap',
                }}>
                    <div>
                        <div style={{
                            fontFamily: "'IBM Plex Mono', monospace", fontSize: 10,
                            letterSpacing: '.22em', textTransform: 'uppercase', color: '#888880',
                            marginBottom: 8,
                        }}>
                            Visueel systeem · Brand cascade · EU 1169 compliant
                        </div>
                        <h2 id="template-picker-title" style={{
                            fontFamily: "'Bebas Neue', 'Outfit', sans-serif",
                            fontSize: 'clamp(44px, 7vw, 96px)', lineHeight: 0.87, color: '#F0EBE0',
                        }}>
                            Menukaart<br />
                            <span style={{ color: accent }}>Templates</span>
                        </h2>
                        <p style={{
                            marginTop: 12, fontSize: 13, lineHeight: 1.6, color: '#888880', maxWidth: 460,
                        }}>
                            {templates.length} onderscheidende richtingen met werkende brand-cascade. Klik op een template om te wisselen.
                        </p>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0, display: 'flex', alignItems: 'flex-start', gap: 24 }}>
                        <div>
                            <div style={{
                                fontFamily: "'Bebas Neue', 'Outfit', sans-serif",
                                fontSize: 72, lineHeight: 0.88, color: accent,
                            }}>{String(templates.length).padStart(2, '0')}</div>
                            <div style={{
                                fontFamily: "'IBM Plex Mono', monospace", fontSize: 10,
                                letterSpacing: '.18em', textTransform: 'uppercase', color: '#888880',
                                marginTop: 4,
                            }}>Templates klaar</div>
                        </div>
                        <button
                            type="button"
                            onClick={onClose}
                            aria-label="Sluiten"
                            style={{
                                background: 'transparent', border: '1px solid #171A1F',
                                borderRadius: 8, width: 36, height: 36,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                color: '#888880', cursor: 'pointer',
                            }}
                        >
                            <X size={16} />
                        </button>
                    </div>
                </div>
            </header>

            {/* Cards grid */}
            <main style={{
                padding: '28px 56px 64px',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                gap: 14,
            }}>
                {templates.map((t) => {
                    const Thumb = ThumbnailFor(t.id);
                    const isActive = t.id === currentTemplateId;
                    const isLoading = pendingId === t.id && isPending;
                    const hasError = errorId === t.id;
                    const isHovered = hoveredId === t.id;

                    return (
                        <article
                            key={t.id}
                            onMouseEnter={() => setHoveredId(t.id)}
                            onMouseLeave={() => setHoveredId(null)}
                            onClick={() => !isPending && handleSwitch(t.id)}
                            style={{
                                background: '#0E1015',
                                borderRadius: 10,
                                overflow: 'hidden',
                                cursor: isPending ? 'wait' : 'pointer',
                                position: 'relative',
                                border: isActive ? `2px solid ${accent}` : '1px solid #171A1F',
                                boxShadow: isActive ? `0 0 0 1px ${accent}66, 0 24px 64px ${accent}11` : 'none',
                                transition: 'transform .28s cubic-bezier(.34,1.56,.64,1), border-color .15s, box-shadow .28s',
                                transform: isHovered && !isActive ? 'translateY(-6px) scale(1.004)' : 'none',
                            }}
                        >
                            {isActive && (
                                <div style={{
                                    position: 'absolute', top: 11, right: 11, zIndex: 20,
                                    background: accent, color: '#07090C',
                                    fontFamily: "'IBM Plex Mono', monospace", fontSize: 9,
                                    fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase',
                                    padding: '4px 10px', borderRadius: 999,
                                    display: 'inline-flex', alignItems: 'center', gap: 4,
                                }}>
                                    <Check size={10} /> Geselecteerd
                                </div>
                            )}

                            {/* Thumbnail preview */}
                            <div style={{ height: 260, position: 'relative', overflow: 'hidden', background: '#fff' }}>
                                <Thumb brandPrimary={currentAccent} />
                                {(isHovered || isLoading) && !isActive && (
                                    <div style={{
                                        position: 'absolute', inset: 0,
                                        background: 'rgba(7,9,12,.72)', backdropFilter: 'blur(3px)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        zIndex: 15, transition: 'opacity .18s',
                                    }}>
                                        {isLoading ? (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#F0EBE0', fontSize: 12 }}>
                                                <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Overschakelen…
                                            </div>
                                        ) : (
                                            <button
                                                type="button"
                                                style={{
                                                    padding: '11px 26px', borderRadius: 999, border: 'none',
                                                    background: accent, color: '#07090C',
                                                    fontFamily: "'Space Grotesk', 'Outfit', sans-serif",
                                                    fontSize: 13, fontWeight: 700,
                                                    letterSpacing: '.07em', textTransform: 'uppercase',
                                                    cursor: 'pointer',
                                                }}
                                            >
                                                Dit template →
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Card info */}
                            <div style={{ padding: '13px 15px 15px', borderTop: '1px solid #171A1F' }}>
                                <div style={{
                                    fontFamily: "'IBM Plex Mono', monospace", fontSize: 9,
                                    letterSpacing: '.2em', textTransform: 'uppercase',
                                    color: '#484848', marginBottom: 3,
                                }}>
                                    {t.id.toUpperCase()}
                                </div>
                                <div style={{ fontSize: 15, fontWeight: 600, color: '#F0EBE0', marginBottom: 5 }}>
                                    {t.name}
                                </div>
                                <div style={{ fontSize: 11.5, color: '#5A5A5A', lineHeight: 1.55, marginBottom: 10 }}>
                                    {t.description}
                                </div>
                                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                                    {tagsFor(t).map((tag, i) => (
                                        <span key={i} style={{
                                            padding: '3px 8px', borderRadius: 4, fontSize: 10, fontWeight: 600,
                                            letterSpacing: '.04em',
                                            background: tag.bg, color: tag.color,
                                        }}>{tag.label}</span>
                                    ))}
                                </div>
                                {hasError && (
                                    <div style={{ marginTop: 8, fontSize: 11, color: '#ef4444' }}>
                                        Wisselen mislukt — probeer opnieuw
                                    </div>
                                )}
                            </div>
                        </article>
                    );
                })}
            </main>

            {/* Animated rainbow bottom bar */}
            <div aria-hidden style={{
                position: 'fixed', bottom: 0, left: 0, right: 0, height: 3,
                background: `linear-gradient(90deg, ${accent} 0%, #00FFAA 20%, #FF3060 45%, #FF8C00 65%, ${accent} 100%)`,
                backgroundSize: '200%',
                animation: 'mke-rainbow 5s linear infinite',
                zIndex: 1000,
            }} />

            <style jsx>{`
                @keyframes spin { to { transform: rotate(360deg); } }
                @keyframes mke-rainbow {
                    from { background-position: 0% 0%; }
                    to { background-position: -200% 0%; }
                }
            `}</style>
        </div>
    );
}
