/**
 * Square-01 — Casual Foodtruck 21×21cm.
 *
 * Geport vanaf `templates/square-01.html`. Visuele DNA:
 *   - Vierkant frame (1:1 ratio)
 *   - Diagonale brand-balk top-left met logo + brandnaam
 *   - 2-koloms grid voor gangen
 *   - SVG gang-icoontjes (flame/utensils/leaf/cookie)
 *   - Sticker-style dish-cards met brand-primary border-left
 *   - Allergeen-badges in pillen
 *   - Bottom-strip brand-primary met legenda
 */

import type { Overrides } from '@/lib/menukaart/registry';
import { type MenuData, formatAllergenLegend, contrastTextColor } from '@/lib/menukaart/menu-data';

type Props = {
    overrides: Overrides;
    data: MenuData;
    size?: 'normal' | 'small';
};

function GangIcon({ index, color, mult }: { index: number; color: string; mult: number }) {
    const common = { width: 11 * mult, height: 11 * mult, stroke: color, strokeWidth: 2, fill: 'none' as const, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
    switch (index % 4) {
        case 0:
            return (
                <svg viewBox="0 0 24 24" {...common}>
                    <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
                </svg>
            );
        case 1:
            return (
                <svg viewBox="0 0 24 24" {...common}>
                    <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2" />
                    <path d="M7 2v20" />
                    <path d="M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3zm0 0v7" />
                </svg>
            );
        case 2:
            return (
                <svg viewBox="0 0 24 24" {...common}>
                    <path d="M11 20A7 7 0 0 1 9.8 6.9C15.5 4.9 17 3.5 19 2c1 2 2 4.5 1 8-1 3.5-3.5 5-6 6.5" />
                    <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" />
                </svg>
            );
        default:
            return (
                <svg viewBox="0 0 24 24" {...common}>
                    <path d="M12 2a10 10 0 1 0 10 10 4 4 0 0 1-5-5 4 4 0 0 1-5-5" />
                    <path d="M8.5 8.5v.01" />
                    <path d="M16 15.5v.01" />
                    <path d="M12 12v.01" />
                    <path d="M11 17v.01" />
                    <path d="M7 14v.01" />
                </svg>
            );
    }
}

export default function Square01Preview({ overrides, data, size = 'normal' }: Props) {
    const accent = overrides.accent ?? '#E63946';
    const bg = overrides.bg ?? '#FFFBF4';
    const text = overrides.text ?? '#1A1614';
    const headingFont = overrides.headingFont ?? 'Rubik';
    const bodyFont = overrides.bodyFont ?? 'Inter';
    const headingSize = overrides.headingSize ?? 28;
    const bodySize = overrides.bodySize ?? 11;
    const headingWeight = overrides.headingWeight ?? 800;
    const logoSize = overrides.logoSize ?? 32;
    const brandName = overrides.brandName ?? 'Vuur & Vlam';
    const subtitle = overrides.subtitle ?? 'Ambachtelijke BBQ-catering';
    const addressLine = overrides.addressLine ?? '';
    const website = overrides.website ?? '';
    const footer = overrides.footer ?? '';
    const eventTitle = overrides.eventTitle ?? '';
    const eventMessage = overrides.eventMessage ?? '';
    const eventPosition = overrides.eventMessagePosition ?? 'top';

    const logoInitial = brandName.charAt(0).toUpperCase();
    const isSmall = size === 'small';
    const frameSize = isSmall ? 360 : 595;
    const sizeMult = isSmall ? 360 / 595 : 1;
    const muted = '#7A6E5E';
    const warm = '#FFF3E0';
    const bandText = contrastTextColor(accent);
    const legend = formatAllergenLegend(data.gangen);

    const eventBlock = (eventTitle || eventMessage) && (
        <div
            style={{
                background: `${accent}14`,
                borderRadius: 4,
                padding: `${5 * sizeMult}px ${8 * sizeMult}px`,
                margin: `${4 * sizeMult}px 0 ${8 * sizeMult}px`,
                borderLeft: `3px solid ${accent}`,
            }}
        >
            {eventTitle && (
                <div
                    style={{
                        fontFamily: `'${headingFont}', sans-serif`,
                        fontSize: 11 * sizeMult,
                        fontWeight: 700,
                        color: accent,
                        marginBottom: 1 * sizeMult,
                    }}
                >
                    {eventTitle}
                </div>
            )}
            {eventMessage && (
                <div style={{ fontSize: 8 * sizeMult, color: muted, lineHeight: 1.45 }}>{eventMessage}</div>
            )}
        </div>
    );

    return (
        <div
            style={{
                background: bg,
                width: frameSize,
                height: frameSize,
                boxShadow: '0 4px 24px rgba(0,0,0,.18)',
                borderRadius: 3,
                overflow: 'hidden',
                position: 'relative',
                color: text,
                fontFamily: `'${bodyFont}', sans-serif`,
                flexShrink: 0,
            }}
        >
            {/* Diagonal brand band top-left */}
            <div
                aria-hidden
                style={{
                    position: 'absolute',
                    top: -25 * sizeMult,
                    left: -40 * sizeMult,
                    width: 210 * sizeMult,
                    height: 70 * sizeMult,
                    background: accent,
                    transform: 'rotate(-12deg)',
                    zIndex: 2,
                }}
            />
            <div
                style={{
                    position: 'absolute',
                    top: 12 * sizeMult,
                    left: 16 * sizeMult,
                    zIndex: 3,
                    color: bandText,
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 * sizeMult }}>
                    {data.logoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={data.logoUrl} alt={brandName} style={{ maxHeight: logoSize * sizeMult, objectFit: 'contain' }} />
                    ) : (
                        <div
                            style={{
                                width: logoSize * sizeMult,
                                height: logoSize * sizeMult,
                                borderRadius: '50%',
                                background: 'rgba(255,255,255,.18)',
                                border: '1.5px solid rgba(255,255,255,.3)',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontFamily: `'${headingFont}', sans-serif`,
                                fontSize: 14 * sizeMult,
                                fontWeight: 700,
                            }}
                        >
                            {logoInitial}
                        </div>
                    )}
                    <div
                        style={{
                            fontFamily: `'${headingFont}', sans-serif`,
                            fontSize: 14 * sizeMult,
                            fontWeight: 700,
                            letterSpacing: '.02em',
                        }}
                    >
                        {brandName}
                    </div>
                </div>
                {subtitle && (
                    <div
                        style={{
                            fontSize: 7 * sizeMult,
                            letterSpacing: '.1em',
                            textTransform: 'uppercase',
                            opacity: 0.7,
                            marginTop: 1 * sizeMult,
                        }}
                    >
                        {subtitle}
                    </div>
                )}
            </div>

            {/* Content */}
            <div
                style={{
                    padding: `${44 * sizeMult}px ${18 * sizeMult}px ${30 * sizeMult}px`,
                    display: 'flex',
                    flexDirection: 'column',
                    height: '100%',
                    position: 'relative',
                    zIndex: 1,
                }}
            >
                <div
                    style={{
                        fontFamily: `'${headingFont}', sans-serif`,
                        fontSize: headingSize * sizeMult,
                        fontWeight: headingWeight,
                        color: text,
                        letterSpacing: '.02em',
                        marginBottom: 5 * sizeMult,
                    }}
                >
                    Menu
                </div>

                {eventPosition === 'top' && eventBlock}

                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: `${3 * sizeMult}px ${10 * sizeMult}px`,
                        flex: 1,
                    }}
                >
                    {data.gangen.map((gang, gi) => (
                        <div key={gi} style={{ marginBottom: 3 * sizeMult }}>
                            <div
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 3 * sizeMult,
                                    background: accent,
                                    color: bandText,
                                    padding: `${2 * sizeMult}px ${8 * sizeMult}px`,
                                    borderRadius: 9,
                                    fontFamily: `'${headingFont}', sans-serif`,
                                    fontSize: 8 * sizeMult,
                                    fontWeight: 700,
                                    letterSpacing: '.04em',
                                    textTransform: 'uppercase',
                                    marginBottom: 3 * sizeMult,
                                }}
                            >
                                <GangIcon index={gi} color={bandText} mult={sizeMult} />
                                {gang.name}
                            </div>
                            {gang.description && (
                                <div
                                    style={{
                                        fontSize: 7 * sizeMult,
                                        color: muted,
                                        lineHeight: 1.2,
                                        marginBottom: 2 * sizeMult,
                                        fontStyle: 'italic',
                                    }}
                                >
                                    {gang.description}
                                </div>
                            )}
                            {gang.dishes.map((dish, di) => (
                                <div
                                    key={di}
                                    style={{
                                        background: warm,
                                        borderRadius: 5,
                                        padding: `${3 * sizeMult}px ${6 * sizeMult}px`,
                                        marginBottom: 2 * sizeMult,
                                        border: '1px solid rgba(0,0,0,.04)',
                                        paddingLeft: 9 * sizeMult,
                                        borderLeft: `2px solid ${accent}`,
                                    }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 3 * sizeMult }}>
                                        <span
                                            style={{
                                                fontFamily: `'${headingFont}', sans-serif`,
                                                fontSize: bodySize * 0.9 * sizeMult,
                                                fontWeight: 600,
                                                color: text,
                                            }}
                                        >
                                            {dish.name}
                                        </span>
                                        {dish.allergens && dish.allergens.length > 0 && (
                                            <span style={{ display: 'flex', gap: 1.5 * sizeMult, flexShrink: 0 }}>
                                                {dish.allergens.map(a => (
                                                    <span
                                                        key={a}
                                                        style={{
                                                            fontSize: 7 * sizeMult,
                                                            fontWeight: 700,
                                                            padding: `${1 * sizeMult}px ${4 * sizeMult}px`,
                                                            borderRadius: 6,
                                                            background: accent,
                                                            color: bandText,
                                                            opacity: 0.85,
                                                        }}
                                                    >
                                                        {a}
                                                    </span>
                                                ))}
                                            </span>
                                        )}
                                    </div>
                                    {dish.description && (
                                        <div style={{ fontSize: 7 * sizeMult, color: muted, lineHeight: 1.2, marginTop: 1 * sizeMult }}>
                                            {dish.description}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    ))}
                </div>

                {eventPosition === 'bottom' && eventBlock}
            </div>

            {/* Bottom strip */}
            <div
                style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    height: 24 * sizeMult,
                    background: accent,
                    zIndex: 2,
                    display: 'flex',
                    alignItems: 'center',
                    padding: `0 ${14 * sizeMult}px`,
                    gap: 5 * sizeMult,
                    color: bandText,
                }}
            >
                <span
                    style={{
                        fontFamily: `'${headingFont}', sans-serif`,
                        fontSize: 8 * sizeMult,
                        fontWeight: 700,
                        letterSpacing: '.08em',
                        flexShrink: 0,
                    }}
                >
                    Allergenen
                </span>
                <span
                    style={{
                        fontFamily: `'${bodyFont}', sans-serif`,
                        fontSize: 6.5 * sizeMult,
                        opacity: 0.65,
                        lineHeight: 1.3,
                    }}
                >
                    {legend || '—'}
                </span>
            </div>
            {(footer || addressLine || website) && (
                <div
                    style={{
                        position: 'absolute',
                        bottom: 28 * sizeMult,
                        left: 18 * sizeMult,
                        fontSize: 6.5 * sizeMult,
                        color: muted,
                        zIndex: 1,
                    }}
                >
                    {footer || [addressLine, website].filter(Boolean).join(' · ')}
                </div>
            )}
        </div>
    );
}
