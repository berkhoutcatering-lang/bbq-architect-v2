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

    const isSmall = size === 'small';
    const sizeMult = isSmall ? 290 / 480 : 1;
    const muted = '#8A8478';
    const barText = contrastTextColor(accent);
    const legend = formatAllergenLegend(data.gangen);

    const eventBlock = (eventTitle || eventMessage) && (
        <div
            style={{
                padding: `${8 * sizeMult}px ${12 * sizeMult}px`,
                margin: `${6 * sizeMult}px 0 ${10 * sizeMult}px`,
                background: `${accent}1A`,
                borderLeft: `3px solid ${accent}`,
            }}
        >
            {eventTitle && (
                <div
                    style={{
                        fontFamily: `'${headingFont}', sans-serif`,
                        fontSize: 16 * sizeMult,
                        color: accent,
                        letterSpacing: '.04em',
                        marginBottom: 2 * sizeMult,
                    }}
                >
                    {eventTitle}
                </div>
            )}
            {eventMessage && (
                <div
                    style={{
                        fontFamily: `'${bodyFont}', sans-serif`,
                        fontSize: 9 * sizeMult,
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
                width: isSmall ? 290 : 480,
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
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3 * sizeMult, background: accent, zIndex: 5 }} />

            {/* Hero ghost letter "M" */}
            {showGhost && (
                <div
                    aria-hidden
                    style={{
                        position: 'absolute',
                        right: -8 * sizeMult,
                        top: -16 * sizeMult,
                        fontFamily: `'${headingFont}', sans-serif`,
                        fontSize: 180 * sizeMult,
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
            <div style={{ padding: `${22 * sizeMult}px ${30 * sizeMult}px 0`, position: 'relative', zIndex: 2 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 * sizeMult }}>
                        {data.logoUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                                src={data.logoUrl}
                                alt={brandName}
                                style={{ maxHeight: logoSize * sizeMult, objectFit: 'contain', mixBlendMode: 'screen' }}
                            />
                        ) : (
                            <div
                                style={{
                                    width: logoSize * sizeMult,
                                    height: logoSize * sizeMult,
                                    border: `2px solid ${accent}`,
                                    borderRadius: 3,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontFamily: `'${headingFont}', sans-serif`,
                                    fontSize: 22 * sizeMult,
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
                                    fontSize: 28 * sizeMult,
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
                                        fontSize: 8 * sizeMult,
                                        color: muted,
                                        letterSpacing: '.12em',
                                        textTransform: 'uppercase',
                                        marginTop: 2 * sizeMult,
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
                            fontSize: 56 * sizeMult,
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
                        marginTop: 10 * sizeMult,
                    }}
                />
            </div>

            {/* Content */}
            <div
                style={{
                    padding: `${12 * sizeMult}px ${30 * sizeMult}px ${22 * sizeMult}px`,
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
                            style={{
                                display: 'grid',
                                gridTemplateColumns: `${42 * sizeMult}px 1fr`,
                                gap: `0 ${12 * sizeMult}px`,
                                padding: `${9 * sizeMult}px 0`,
                                marginBottom: 4 * sizeMult,
                                borderBottom: showDividers && gi < data.gangen.length - 1 ? '1px solid rgba(255,255,255,.04)' : undefined,
                            }}
                        >
                            <div style={{ position: 'relative' }}>
                                {showBar && (
                                    <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 2 * sizeMult, background: accent, borderRadius: 1 }} />
                                )}
                                <div
                                    style={{
                                        fontFamily: `'${headingFont}', sans-serif`,
                                        fontSize: 40 * sizeMult,
                                        lineHeight: 0.8,
                                        color: accent,
                                        opacity: showBar ? 1 : 0.2,
                                        paddingLeft: showBar ? 6 * sizeMult : 0,
                                    }}
                                >
                                    {num}
                                </div>
                            </div>
                            <div>
                                <div
                                    style={{
                                        fontFamily: `'${headingFont}', sans-serif`,
                                        fontSize: headingSize * 0.5 * sizeMult,
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
                                            fontSize: 8 * sizeMult,
                                            color: muted,
                                            lineHeight: 1.5,
                                            margin: `${2 * sizeMult}px 0 ${5 * sizeMult}px`,
                                        }}
                                    >
                                        {gang.description}
                                    </div>
                                )}
                                {gang.dishes.map((dish, di) => (
                                    <div key={di} style={{ marginBottom: 4 * sizeMult }}>
                                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 * sizeMult, flexWrap: 'wrap' }}>
                                            <span
                                                style={{
                                                    fontFamily: `'${bodyFont}', sans-serif`,
                                                    fontSize: bodySize * sizeMult,
                                                    fontWeight: 500,
                                                    color: text,
                                                }}
                                            >
                                                {dish.name}
                                            </span>
                                            {dish.allergens && dish.allergens.length > 0 && (
                                                <span
                                                    style={{
                                                        fontSize: 7 * sizeMult,
                                                        fontWeight: 600,
                                                        color: barText,
                                                        background: accent,
                                                        padding: `${1 * sizeMult}px ${4 * sizeMult}px`,
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
                                                    fontSize: 8 * sizeMult,
                                                    color: muted,
                                                    lineHeight: 1.4,
                                                    marginTop: 1 * sizeMult,
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
            <div
                style={{
                    background: accent,
                    padding: `${8 * sizeMult}px ${30 * sizeMult}px`,
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
                        fontSize: 11 * sizeMult,
                        letterSpacing: '.08em',
                    }}
                >
                    Allergenen
                </div>
                <div
                    style={{
                        fontFamily: `'${bodyFont}', sans-serif`,
                        fontSize: 7 * sizeMult,
                        opacity: 0.7,
                        maxWidth: 330 * sizeMult,
                        textAlign: 'right',
                        lineHeight: 1.5,
                    }}
                >
                    {legend || '—'}
                </div>
            </div>
            {(footer || addressLine || website) && (
                <div
                    style={{
                        fontFamily: `'${bodyFont}', sans-serif`,
                        fontSize: 7 * sizeMult,
                        color: muted,
                        textAlign: 'center',
                        padding: `${4 * sizeMult}px ${30 * sizeMult}px ${8 * sizeMult}px`,
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
