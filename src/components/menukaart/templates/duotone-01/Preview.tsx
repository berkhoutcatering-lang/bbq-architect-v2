/**
 * Duotone-01 — Knal grafisch poster.
 *
 * Geport vanaf `templates/duotone-01.html`. Visuele DNA:
 *   - Mat zwart bg (#141210) + brand-primary als enige accent
 *   - Bebas Neue display font, gigantische "M" ghost (rechts-boven)
 *   - Gang-nummers groot in brand-primary, met optionele linker bar
 *   - Inline allergeen-badges in brand-primary blokjes
 *   - Brand-primary bottom-bar met allergen-legenda
 *   - Bovenkant: 4px brand-primary strip
 */

import type { Overrides } from '@/lib/menukaart/registry';
import { type MenuData, formatAllergenLegend, contrastTextColor } from '@/lib/menukaart/menu-data';

type Props = {
    overrides: Overrides;
    data: MenuData;
    size?: 'normal' | 'small';
};

export default function Duotone01Preview({ overrides, data, size = 'normal' }: Props) {
    const accent = overrides.accent ?? '#FF4500';
    const bg = overrides.bg ?? '#141210';
    const text = overrides.text ?? '#F4F0E8';
    const headingFont = overrides.headingFont ?? 'Bebas Neue';
    const bodyFont = overrides.bodyFont ?? 'DM Sans';
    const headingSize = overrides.headingSize ?? 34;
    const bodySize = overrides.bodySize ?? 11;
    const headingWeight = overrides.headingWeight ?? 400;
    const logoSize = overrides.logoSize ?? 44;
    const showGhost = overrides.showGhostNumbers !== false;
    const showDividers = overrides.showDividers !== false;
    const brandName = overrides.brandName ?? 'Vuur & Vlam';
    const subtitle = overrides.subtitle ?? 'Ambachtelijke BBQ-catering';
    const addressLine = overrides.addressLine ?? '';
    const website = overrides.website ?? '';
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
    const muted = '#8A8478';
    const barText = contrastTextColor(accent);
    const legend = formatAllergenLegend(data.gangen);

    const eventBlock = (eventTitle || eventMessage) && (
        <div
            style={{
                padding: `${8}px ${12}px`,
                margin: `${6}px 0 ${10}px`,
                background: `${accent}1A`,
                borderLeft: `3px solid ${accent}`,
            }}
        >
            {eventTitle && (
                <div
                    style={{
                        fontFamily: `'${headingFont}', sans-serif`,
                        fontSize: 16,
                        color: accent,
                        letterSpacing: '.04em',
                        marginBottom: 2,
                    }}
                >
                    {eventTitle}
                </div>
            )}
            {eventMessage && (
                <div
                    style={{
                        fontFamily: `'${bodyFont}', sans-serif`,
                        fontSize: 9,
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
                boxShadow: '0 6px 32px rgba(0,0,0,.5)',
                borderRadius: 3,
                overflow: 'hidden',
                position: 'relative',
                color: text,
                fontFamily: `'${bodyFont}', sans-serif`,
                flexShrink: 0,
            }}
        >
            {/* Top accent strip */}
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: accent, zIndex: 5 }} />

            {/* Hero ghost letter "M" */}
            {showGhost && (
                <div
                    aria-hidden
                    style={{
                        position: 'absolute',
                        right: -8,
                        top: -16,
                        fontFamily: `'${headingFont}', sans-serif`,
                        fontSize: 180,
                        color: accent,
                        opacity: 0.06,
                        lineHeight: 0.75,
                        pointerEvents: 'none',
                        letterSpacing: '-.02em',
                        zIndex: 0,
                    }}
                >
                    M
                </div>
            )}

            {/* Hero */}
            <div style={{ padding: `${22}px ${30}px 0`, position: 'relative', zIndex: 2 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        {/* Donker bg → prefer logo-donker (witte variant) als die geüpload is */}
                        {(data.logoUrlDonker ?? data.logoUrl) ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                                src={(data.logoUrlDonker ?? data.logoUrl) as string}
                                alt={brandName}
                                style={{ maxHeight: logoSize, objectFit: 'contain', mixBlendMode: 'screen' }}
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
                                    fontSize: 22,
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
                                    fontSize: 28,
                                    color: accent,
                                    letterSpacing: '.06em',
                                    lineHeight: 1,
                                }}
                            >
                                {brandName}
                            </div>
                            {subtitle && (
                                <div
                                    style={{
                                        fontSize: 8,
                                        color: muted,
                                        letterSpacing: '.12em',
                                        textTransform: 'uppercase',
                                        marginTop: 2,
                                    }}
                                >
                                    {subtitle}
                                </div>
                            )}
                        </div>
                    </div>
                    <div
                        style={{
                            fontFamily: `'${headingFont}', sans-serif`,
                            fontSize: 56,
                            color: accent,
                            letterSpacing: '.06em',
                            lineHeight: 0.8,
                            opacity: 0.18,
                        }}
                    >
                        Menu
                    </div>
                </div>
                <div
                    style={{
                        height: 1,
                        background: `linear-gradient(90deg, ${accent}, transparent)`,
                        marginTop: 10,
                    }}
                />
            </div>

            {/* Content */}
            <div
                style={{
                    padding: `${12}px ${30}px ${22}px`,
                    display: 'flex',
                    flexDirection: 'column',
                    position: 'relative',
                    zIndex: 2,
                }}
            >
                {eventPosition === 'top' && eventBlock}

                {data.gangen.map((gang, gi) => {
                    const num = String(gi + 1).padStart(2, '0');
                    const showBar = gi % 2 === 0;
                    return (
                        <div
                            key={gi}
                            className="menukaart-gang-wrap"
                            style={{
                                display: 'grid',
                                gridTemplateColumns: `${42}px 1fr`,
                                gap: `0 ${12}px`,
                                padding: `${9}px 0`,
                                marginBottom: 4,
                                borderBottom: showDividers && gi < data.gangen.length - 1 ? '1px solid rgba(255,255,255,.04)' : undefined,
                            }}
                        >
                            <div style={{ position: 'relative' }}>
                                {showBar && (
                                    <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 2, background: accent, borderRadius: 1 }} />
                                )}
                                <div
                                    style={{
                                        fontFamily: `'${headingFont}', sans-serif`,
                                        fontSize: 40,
                                        lineHeight: 0.8,
                                        color: accent,
                                        opacity: showBar ? 1 : 0.2,
                                        paddingLeft: showBar ? 6 : 0,
                                    }}
                                >
                                    {num}
                                </div>
                            </div>
                            <div>
                                <div
                                    style={{
                                        fontFamily: `'${headingFont}', sans-serif`,
                                        fontSize: headingSize * 0.5,
                                        letterSpacing: '.1em',
                                        color: accent,
                                    }}
                                >
                                    {gang.name}
                                </div>
                                {gang.description && (
                                    <div
                                        style={{
                                            fontFamily: `'${bodyFont}', sans-serif`,
                                            fontSize: 8,
                                            color: muted,
                                            lineHeight: 1.5,
                                            margin: `${2}px 0 ${5}px`,
                                        }}
                                    >
                                        {gang.description}
                                    </div>
                                )}
                                {gang.dishes.map((dish, di) => (
                                    <div key={di} style={{ marginBottom: 4 }}>
                                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, flexWrap: 'wrap' }}>
                                            <span
                                                style={{
                                                    fontFamily: `'${bodyFont}', sans-serif`,
                                                    fontSize: bodySize,
                                                    fontWeight: 500,
                                                    color: text,
                                                }}
                                            >
                                                {dish.name}
                                            </span>
                                            {dish.allergens && dish.allergens.length > 0 && (
                                                <span
                                                    style={{
                                                        fontSize: 7,
                                                        fontWeight: 600,
                                                        color: barText,
                                                        background: accent,
                                                        padding: `${1}px ${4}px`,
                                                        borderRadius: 2,
                                                        letterSpacing: '.04em',
                                                        whiteSpace: 'nowrap',
                                                    }}
                                                >
                                                    {dish.allergens.join(' ')}
                                                </span>
                                            )}
                                        </div>
                                        {dish.description && (
                                            <div
                                                style={{
                                                    fontFamily: `'${bodyFont}', sans-serif`,
                                                    fontSize: 8,
                                                    color: muted,
                                                    lineHeight: 1.4,
                                                    marginTop: 1,
                                                }}
                                            >
                                                {dish.description}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    );
                })}

                {eventPosition === 'bottom' && eventBlock}

                <div style={{ marginTop: 'auto' }} />
            </div>

            {/* Bottom bar */}
            {legend && (
                <div
                    style={{
                        background: accent,
                        padding: `${8}px ${30}px`,
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        color: barText,
                        position: 'relative',
                        zIndex: 3,
                    }}
                >
                    <div
                        style={{
                            fontFamily: `'${headingFont}', sans-serif`,
                            fontSize: 11,
                            letterSpacing: '.08em',
                        }}
                    >
                        Allergenen
                    </div>
                    <div
                        style={{
                            fontFamily: `'${bodyFont}', sans-serif`,
                            fontSize: 7,
                            opacity: 0.7,
                            maxWidth: 330,
                            textAlign: 'right',
                            lineHeight: 1.5,
                        }}
                    >
                        {legend}
                    </div>
                </div>
            )}
            {(footer || addressLine || website) && (
                <div
                    style={{
                        fontFamily: `'${bodyFont}', sans-serif`,
                        fontSize: 7,
                        color: muted,
                        textAlign: 'center',
                        padding: `${4}px ${30}px ${8}px`,
                        opacity: 0.5,
                        background: bg,
                        position: 'relative',
                        zIndex: 3,
                    }}
                >
                    {footer || [addressLine, website].filter(Boolean).join(' · ')}
                </div>
            )}
        </div>
    );
}
