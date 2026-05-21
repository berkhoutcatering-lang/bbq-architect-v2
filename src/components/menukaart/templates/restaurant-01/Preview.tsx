/**
 * Restaurant-01 — klassiek-restaurant template.
 *
 * Pure visual component. Accepteert resolved overrides (cascade flat) plus
 * `data` (gangen + logo). Style-tokens hangen aan CSS-vars zodat de editor
 * live re-renderen kan zonder volledige tree-rebuild.
 *
 * Geport vanaf `templates/restaurant-01.html` uit het zip-prototype:
 * Cormorant Garamond serif italic, gold ornamenten, centered, allergeen-
 * codes inline na elk gerecht.
 */

import type { Overrides, LogoPosition } from '@/lib/menukaart/registry';
import {
    type MenuData,
    formatAllergenLegend,
} from '@/lib/menukaart/menu-data';

type Props = {
    overrides: Overrides;
    data: MenuData;
    /** Frame-size — 'normal' (480px) of 'small' (290px, voor compare/gallery-view). */
    size?: 'normal' | 'small';
};

function logoAlignment(pos: LogoPosition | undefined): 'left' | 'center' | 'right' {
    if (pos === 'top-left') return 'left';
    if (pos === 'top-right') return 'right';
    return 'center';
}

export default function Restaurant01Preview({ overrides, data, size = 'normal' }: Props) {
    const accent = overrides.accent ?? '#9e781c';
    const bg = overrides.bg ?? '#FAF6EF';
    const text = overrides.text ?? '#2A2520';
    const headingFont = overrides.headingFont ?? 'Cormorant Garamond';
    const bodyFont = overrides.bodyFont ?? 'Inter';
    const headingSize = overrides.headingSize ?? 22;
    const bodySize = overrides.bodySize ?? 10;
    const headingWeight = overrides.headingWeight ?? 500;
    const logoSize = overrides.logoSize ?? 56;
    const align = logoAlignment(overrides.logoPosition);
    const showOrnament = overrides.showOrnament !== false;
    const showDividers = overrides.showDividers !== false;
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

    const isSmall = size === 'small';
    const sizeMult = isSmall ? 290 / 480 : 1;
    const legend = formatAllergenLegend(data.gangen);

    const eventBlock = (eventTitle || eventMessage) && (
        <div
            style={{
                textAlign: 'center',
                margin: `${8 * sizeMult}px auto ${12 * sizeMult}px`,
                padding: `${8 * sizeMult}px ${12 * sizeMult}px`,
                maxWidth: 360 * sizeMult,
                borderTop: `0.5px solid ${accent}`,
                borderBottom: `0.5px solid ${accent}`,
            }}
        >
            {eventTitle && (
                <div
                    style={{
                        fontFamily: `'${headingFont}', serif`,
                        fontSize: 12 * sizeMult,
                        fontStyle: 'italic',
                        color: accent,
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
                        fontSize: 8 * sizeMult,
                        color: '#8A847B',
                        fontStyle: 'italic',
                        lineHeight: 1.55,
                    }}
                >
                    {eventMessage}
                </div>
            )}
        </div>
    );

    return (
        <div
            className="r01-frame"
            style={{
                background: bg,
                width: isSmall ? 290 : 480,
                aspectRatio: '1 / 1.414',
                boxShadow: '0 4px 24px rgba(0,0,0,.5), 0 0 0 1px rgba(255,255,255,.03)',
                borderRadius: 3,
                overflow: 'hidden',
                flexShrink: 0,
                position: 'relative',
                fontFamily: `'${bodyFont}', sans-serif`,
                color: text,
            }}
        >
            <div
                className="r01-pad"
                style={{
                    padding: `${36 * sizeMult}px ${48 * sizeMult}px ${24 * sizeMult}px`,
                    display: 'flex',
                    flexDirection: 'column',
                    minHeight: '100%',
                }}
            >
                {/* Header */}
                <div style={{ textAlign: align, marginBottom: 8 * sizeMult }}>
                    {data.logoUrl ? (
                        <div style={{ marginBottom: 8 * sizeMult }}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={data.logoUrl}
                                alt={brandName}
                                style={{
                                    width: logoSize * sizeMult,
                                    height: logoSize * sizeMult,
                                    objectFit: 'contain',
                                    display: 'inline-block',
                                }}
                            />
                        </div>
                    ) : (
                        <div
                            style={{
                                width: logoSize * sizeMult,
                                height: logoSize * sizeMult,
                                borderRadius: '50%',
                                border: `1.5px solid ${accent}`,
                                margin: align === 'center' ? `0 auto ${8 * sizeMult}px` : `0 0 ${8 * sizeMult}px`,
                                marginLeft: align === 'right' ? 'auto' : undefined,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontFamily: `'${headingFont}', serif`,
                                fontSize: 18 * sizeMult,
                                fontWeight: 500,
                                color: accent,
                            }}
                        >
                            {logoInitials}
                        </div>
                    )}
                    <div
                        style={{
                            fontFamily: `'${headingFont}', serif`,
                            fontSize: 22 * sizeMult,
                            fontWeight: 500,
                            color: text,
                            letterSpacing: '.03em',
                        }}
                    >
                        {brandName}
                    </div>
                    {subtitle && (
                        <div
                            style={{
                                fontFamily: `'${bodyFont}', sans-serif`,
                                fontSize: 8 * sizeMult,
                                letterSpacing: '.18em',
                                textTransform: 'uppercase',
                                color: '#8A847B',
                                marginTop: 3 * sizeMult,
                            }}
                        >
                            {subtitle}
                        </div>
                    )}
                </div>

                <div
                    style={{
                        fontFamily: `'${bodyFont}', sans-serif`,
                        fontSize: 8 * sizeMult,
                        fontWeight: 500,
                        letterSpacing: '.22em',
                        textTransform: 'uppercase',
                        color: accent,
                        textAlign: 'center',
                        margin: `${14 * sizeMult}px 0 ${4 * sizeMult}px`,
                    }}
                >
                    Menu
                </div>

                {eventPosition === 'top' && eventBlock}

                {/* Gangen */}
                {data.gangen.map((gang, gi) => (
                    <div key={gi}>
                        {showDividers && (
                            <div
                                style={{
                                    width: 120 * sizeMult,
                                    height: 1,
                                    background: accent,
                                    margin: `${10 * sizeMult}px auto`,
                                    opacity: 0.45,
                                }}
                            />
                        )}
                        <div style={{ textAlign: 'center', marginBottom: 4 * sizeMult }}>
                            <div
                                style={{
                                    fontFamily: `'${bodyFont}', sans-serif`,
                                    fontSize: 7 * sizeMult,
                                    fontWeight: 500,
                                    letterSpacing: '.18em',
                                    textTransform: 'uppercase',
                                    color: accent,
                                    marginBottom: 1 * sizeMult,
                                }}
                            >
                                {gang.eyebrow ?? `GANG ${String(gi + 1).padStart(2, '0')}`}
                            </div>
                            <div
                                style={{
                                    fontFamily: `'${headingFont}', serif`,
                                    fontSize: headingSize * sizeMult,
                                    fontWeight: headingWeight,
                                    fontStyle: 'italic',
                                    color: text,
                                }}
                            >
                                {gang.name}
                            </div>
                            {gang.description && (
                                <div
                                    style={{
                                        fontFamily: `'${headingFont}', serif`,
                                        fontSize: 9 * sizeMult,
                                        fontStyle: 'italic',
                                        color: '#8A847B',
                                        lineHeight: 1.55,
                                        margin: `${3 * sizeMult}px auto ${10 * sizeMult}px`,
                                        maxWidth: 360 * sizeMult,
                                    }}
                                >
                                    {gang.description}
                                </div>
                            )}
                            <div
                                style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: 6 * sizeMult,
                                    maxWidth: 340 * sizeMult,
                                    margin: '0 auto',
                                }}
                            >
                                {gang.dishes.map((dish, di) => (
                                    <div key={di} style={{ textAlign: 'center' }}>
                                        <div>
                                            <span
                                                style={{
                                                    fontFamily: `'${headingFont}', serif`,
                                                    fontSize: 13 * sizeMult,
                                                    fontWeight: 500,
                                                    color: text,
                                                    letterSpacing: '.01em',
                                                }}
                                            >
                                                {dish.name}
                                            </span>
                                            {dish.allergens && dish.allergens.length > 0 && (
                                                <span
                                                    style={{
                                                        fontFamily: `'${bodyFont}', sans-serif`,
                                                        fontSize: 8 * sizeMult,
                                                        color: accent,
                                                        letterSpacing: '.06em',
                                                        marginLeft: 5 * sizeMult,
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
                                                    fontSize: bodySize * sizeMult,
                                                    color: '#8A847B',
                                                    lineHeight: 1.5,
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
                    </div>
                ))}

                {eventPosition === 'bottom' && eventBlock}

                {/* Legend */}
                <div style={{ marginTop: 'auto', paddingTop: 16 * sizeMult, textAlign: 'center' }}>
                    {showOrnament && (
                        <div
                            style={{
                                width: 120 * sizeMult,
                                height: 1,
                                background: accent,
                                margin: `0 auto ${8 * sizeMult}px`,
                                opacity: 0.3,
                            }}
                        />
                    )}
                    <div
                        style={{
                            fontFamily: `'${bodyFont}', sans-serif`,
                            fontSize: 8 * sizeMult,
                            fontWeight: 500,
                            letterSpacing: '.15em',
                            textTransform: 'uppercase',
                            color: accent,
                            marginBottom: 4 * sizeMult,
                        }}
                    >
                        Allergenen
                    </div>
                    <div
                        style={{
                            fontFamily: `'${bodyFont}', sans-serif`,
                            fontSize: 8 * sizeMult,
                            color: '#8A847B',
                            lineHeight: 1.8,
                        }}
                    >
                        {legend || 'Geen allergenen aanwezig'}
                    </div>
                </div>
                {footer && (
                    <div
                        style={{
                            textAlign: 'center',
                            marginTop: 10 * sizeMult,
                            fontFamily: `'${bodyFont}', sans-serif`,
                            fontSize: 8 * sizeMult,
                            color: '#D0C8B8',
                        }}
                    >
                        {footer}
                    </div>
                )}
            </div>
        </div>
    );
}
