/**
 * Smokehouse-01 — BBQ rauw, charcoal-bg, krijtbord-stijl.
 *
 * Geport vanaf `templates/smokehouse-01.html`. Visuele DNA:
 *   - Donker (#141210) achtergrond, krijtachtige cream-tekst
 *   - Oswald display + Courier Prime mono
 *   - Verticale brand-stripe links (6px)
 *   - Dashed dividers tussen gangen
 *   - Ghost-letter "SMOKE" achter het logo (subtiel, 4% opacity)
 *   - Inline allergeen-codes tussen []
 *   - Legend-bar onderaan in brand-primary, contrast-tekst
 */

import type { Overrides, LogoPosition } from '@/lib/menukaart/registry';
import { type MenuData, formatAllergenLegend, contrastTextColor } from '@/lib/menukaart/menu-data';

type Props = {
    overrides: Overrides;
    data: MenuData;
    size?: 'normal' | 'small';
};

function logoAlignment(pos: LogoPosition | undefined): 'left' | 'center' | 'right' {
    if (pos === 'top-left') return 'left';
    if (pos === 'top-right') return 'right';
    return 'center';
}

export default function Smokehouse01Preview({ overrides, data, size = 'normal' }: Props) {
    const accent = overrides.accent ?? '#D4592A';
    const bg = overrides.bg ?? '#141210';
    const text = overrides.text ?? '#E8E0D0';
    const headingFont = overrides.headingFont ?? 'Oswald';
    const bodyFont = overrides.bodyFont ?? 'Courier Prime';
    const headingSize = overrides.headingSize ?? 18;
    const bodySize = overrides.bodySize ?? 10;
    const headingWeight = overrides.headingWeight ?? 500;
    const logoSize = overrides.logoSize ?? 52;
    const align = logoAlignment(overrides.logoPosition);
    const showDividers = overrides.showDividers !== false;
    const showGhostNumbers = overrides.showGhostNumbers !== false;
    const brandName = overrides.brandName ?? 'Vuur & Vlam';
    const subtitle = overrides.subtitle ?? 'Ambachtelijke BBQ-catering';
    const footer = overrides.footer ?? '';
    const eventTitle = overrides.eventTitle ?? '';
    const eventMessage = overrides.eventMessage ?? '';
    const eventPosition = overrides.eventMessagePosition ?? 'top';

    const logoInitials = brandName
        .split(/\s+/)
        .map(w => w[0] ?? '')
        .join('')
        .slice(0, 2)
        .toUpperCase();
    const muted = '#5E5850';
    const barText = contrastTextColor(accent);
    const legend = formatAllergenLegend(data.gangen);

    const eventBlock = (eventTitle || eventMessage) && (
        <div
            style={{
                margin: `${10}px ${-4}px ${12}px ${-4}px`,
                padding: `${8}px ${12}px`,
                border: `1px dashed ${muted}`,
                textAlign: 'center',
            }}
        >
            {eventTitle && (
                <div
                    style={{
                        fontFamily: `'${headingFont}', sans-serif`,
                        fontSize: 13,
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: '.12em',
                        color: accent,
                        marginBottom: 2,
                    }}
                >
                    {eventTitle}
                </div>
            )}
            {eventMessage && (
                <div
                    style={{
                        fontFamily: `'${bodyFont}', monospace`,
                        fontSize: 8,
                        fontStyle: 'italic',
                        color: muted,
                        lineHeight: 1.5,
                    }}
                >
                    {eventMessage}
                </div>
            )}
        </div>
    );

    return (
        <div
            style={{
                background: bg,
                width: 480,
                aspectRatio: '1 / 1.414',
                boxShadow: '0 4px 24px rgba(0,0,0,.5)',
                borderRadius: 3,
                overflow: 'hidden',
                position: 'relative',
                color: text,
                fontFamily: `'${bodyFont}', monospace`,
                flexShrink: 0,
            }}
        >
            {/* Vertical brand stripe */}
            <div
                style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    bottom: 0,
                    width: 4,
                    background: `linear-gradient(180deg, transparent 3%, ${accent} 10%, ${accent} 90%, transparent 97%)`,
                    zIndex: 2,
                }}
            />
            <div
                style={{
                    padding: `${24}px ${28}px ${0}px ${32}px`,
                    display: 'flex',
                    flexDirection: 'column',
                    minHeight: '100%',
                    position: 'relative',
                    zIndex: 3,
                }}
            >
                {/* Header */}
                <div
                    style={{
                        position: 'relative',
                        marginBottom: 8,
                        paddingBottom: 8,
                        borderBottom: `2px dashed ${muted}`,
                    }}
                >
                    {showGhostNumbers && (
                        <div
                            aria-hidden
                            style={{
                                position: 'absolute',
                                right: -8,
                                top: -20,
                                fontFamily: `'${headingFont}', sans-serif`,
                                fontSize: 110,
                                fontWeight: 700,
                                color: accent,
                                opacity: 0.04,
                                letterSpacing: '.04em',
                                lineHeight: 0.75,
                                pointerEvents: 'none',
                            }}
                        >
                            SMOKE
                        </div>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start', position: 'relative', zIndex: 1 }}>
                        {/* Donker bg → prefer logo-donker (witte variant) als die geüpload is */}
                        {(data.logoUrlDonker ?? data.logoUrl) ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                                src={(data.logoUrlDonker ?? data.logoUrl) as string}
                                alt={brandName}
                                style={{
                                    width: logoSize,
                                    height: logoSize,
                                    objectFit: 'contain',
                                    mixBlendMode: 'screen',
                                }}
                            />
                        ) : (
                            <div
                                style={{
                                    width: logoSize,
                                    height: logoSize,
                                    border: `2px solid ${accent}`,
                                    borderRadius: 3,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontFamily: `'${headingFont}', sans-serif`,
                                    fontSize: 20,
                                    fontWeight: 700,
                                    color: accent,
                                    background: 'rgba(255,255,255,.03)',
                                }}
                            >
                                {logoInitials}
                            </div>
                        )}
                        <div>
                            <div
                                style={{
                                    fontFamily: `'${headingFont}', sans-serif`,
                                    fontSize: 26,
                                    fontWeight: 600,
                                    textTransform: 'uppercase',
                                    letterSpacing: '.06em',
                                    color: text,
                                    lineHeight: 1,
                                }}
                            >
                                {brandName}
                            </div>
                            {subtitle && (
                                <div
                                    style={{
                                        fontFamily: `'${bodyFont}', monospace`,
                                        fontSize: 8,
                                        color: muted,
                                        letterSpacing: '.06em',
                                        marginTop: 2,
                                    }}
                                >
                                    {subtitle}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div
                    style={{
                        fontFamily: `'${headingFont}', sans-serif`,
                        fontSize: 10,
                        fontWeight: 300,
                        textTransform: 'uppercase',
                        letterSpacing: '.4em',
                        color: muted,
                        textAlign: 'center',
                        margin: `${10}px 0 ${8}px`,
                    }}
                >
                    Menu
                </div>

                {eventPosition === 'top' && eventBlock}

                {/* Gangen */}
                {data.gangen.map((gang, gi) => (
                    <div key={gi} className="menukaart-gang-wrap">
                        <div
                            style={{
                                display: 'grid',
                                gridTemplateColumns: `${3}px 1fr`,
                                gap: `0 ${10}px`,
                                marginBottom: 10,
                            }}
                        >
                            <div style={{ background: accent, borderRadius: 1 }} />
                            <div>
                                <div
                                    style={{
                                        fontFamily: `'${headingFont}', sans-serif`,
                                        fontSize: headingSize,
                                        fontWeight: headingWeight,
                                        textTransform: 'uppercase',
                                        letterSpacing: '.1em',
                                        color: accent,
                                    }}
                                >
                                    {gang.name}
                                </div>
                                {gang.description && (
                                    <div
                                        style={{
                                            fontFamily: `'${bodyFont}', monospace`,
                                            fontSize: 8,
                                            fontStyle: 'italic',
                                            color: muted,
                                            lineHeight: 1.5,
                                            marginBottom: 4,
                                        }}
                                    >
                                        {gang.description}
                                    </div>
                                )}
                                {gang.dishes.map((dish, di) => (
                                    <div key={di} style={{ padding: `${2}px 0` }}>
                                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
                                            <div style={{ width: 4, height: 4, borderRadius: '50%', background: accent, opacity: 0.4, flexShrink: 0 }} />
                                            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flex: 1, flexWrap: 'wrap' }}>
                                                <span
                                                    style={{
                                                        fontFamily: `'${headingFont}', sans-serif`,
                                                        fontSize: 13,
                                                        fontWeight: 400,
                                                        color: text,
                                                        letterSpacing: '.02em',
                                                    }}
                                                >
                                                    {dish.name}
                                                </span>
                                                {dish.allergens && dish.allergens.length > 0 && (
                                                    <span
                                                        style={{
                                                            fontFamily: `'${bodyFont}', monospace`,
                                                            fontSize: 8,
                                                            color: accent,
                                                            letterSpacing: '.04em',
                                                            opacity: 0.7,
                                                        }}
                                                    >
                                                        [{dish.allergens.join(' ')}]
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        {dish.description && (
                                            <div
                                                style={{
                                                    fontFamily: `'${bodyFont}', monospace`,
                                                    fontSize: bodySize,
                                                    color: muted,
                                                    lineHeight: 1.4,
                                                    marginTop: 1,
                                                    paddingLeft: 10,
                                                }}
                                            >
                                                {dish.description}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                        {showDividers && gi < data.gangen.length - 1 && (
                            <hr
                                style={{
                                    border: 'none',
                                    borderTop: `1px dashed ${muted}`,
                                    margin: `${6}px 0`,
                                    opacity: 0.3,
                                }}
                            />
                        )}
                    </div>
                ))}

                {eventPosition === 'bottom' && eventBlock}

                <div style={{ marginTop: 'auto' }} />
            </div>

            {/* Legend bar — brand-primary band onderaan */}
            <div
                style={{
                    background: accent,
                    padding: `${8}px ${28}px`,
                    display: 'flex',
                    gap: 8,
                    alignItems: 'baseline',
                    color: barText,
                    position: 'relative',
                    zIndex: 3,
                }}
            >
                <div
                    style={{
                        fontFamily: `'${headingFont}', sans-serif`,
                        fontSize: 10,
                        letterSpacing: '.1em',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        flexShrink: 0,
                    }}
                >
                    Allergenen
                </div>
                <div
                    style={{
                        fontFamily: `'${bodyFont}', monospace`,
                        fontSize: 7,
                        opacity: 0.85,
                        lineHeight: 1.6,
                    }}
                >
                    {legend || '—'}
                </div>
            </div>
            {footer && (
                <div
                    style={{
                        fontFamily: `'${bodyFont}', monospace`,
                        fontSize: 7,
                        color: muted,
                        textAlign: 'center',
                        padding: `${6}px ${28}px`,
                        opacity: 0.6,
                        background: bg,
                        position: 'relative',
                        zIndex: 3,
                    }}
                >
                    {footer}
                </div>
            )}
        </div>
    );
}
