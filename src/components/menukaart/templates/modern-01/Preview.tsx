/**
 * Modern-01 — Editorial sidebar layout.
 *
 * Geport vanaf `templates/modern-01.html`. Visuele DNA:
 *   - 220px brand-primary sidebar links met gang-index (01, 02, ...)
 *   - Massive sans-serif "Menu" title rechts
 *   - Bullet-stijl dish-rendering met footnote-allergens per gang
 *   - Gradient rule onder elke gang-header (brand → transparant)
 *   - Auto-contrast tekst tegen brand-primary
 */

import type { Overrides } from '@/lib/menukaart/registry';
import {
    type MenuData,
    type MenuGang,
    ALLERGEN_MAP,
    formatAllergenLegend,
    gangAllergens,
    contrastTextColor,
} from '@/lib/menukaart/menu-data';

type Props = {
    overrides: Overrides;
    data: MenuData;
    size?: 'normal' | 'small';
};

/* Modern heeft logo vast in sidebar — geen positie-override (allowList drops
   logoPosition na audit 2026-05-22). */

function GangFootnote({ gang, bodyFont, mult, accent }: { gang: MenuGang; bodyFont: string; mult: number; accent: string }) {
    const used = gangAllergens(gang);
    if (used.length === 0) return null;
    return (
        <div
            style={{
                fontFamily: `'${bodyFont}', sans-serif`,
                fontSize: 8 * mult,
                color: '#777',
                marginTop: 4 * mult,
                marginLeft: 12 * mult,
            }}
        >
            Bevat:{' '}
            {used.map((a, i) => (
                <span key={a}>
                    {i > 0 && ', '}
                    <span style={{ fontWeight: 600, color: accent }}>{a}</span> {ALLERGEN_MAP[a]}
                </span>
            ))}
        </div>
    );
}

export default function Modern01Preview({ overrides, data, size = 'normal' }: Props) {
    const accent = overrides.accent ?? '#1A1A1A';
    const bg = overrides.bg ?? '#FFFFFF';
    const text = overrides.text ?? '#1A1A1A';
    const headingFont = overrides.headingFont ?? 'Space Grotesk';
    const bodyFont = overrides.bodyFont ?? 'Space Grotesk';
    const headingSize = overrides.headingSize ?? 44;
    const bodySize = overrides.bodySize ?? 11;
    const headingWeight = overrides.headingWeight ?? 300;
    const logoSize = overrides.logoSize ?? 48;
    const showDividers = overrides.showDividers !== false;
    const showFootnote = overrides.showFootnoteAllergens !== false;
    const brandName = overrides.brandName ?? 'Vuur & Vlam';
    const subtitle = overrides.subtitle ?? 'Ambachtelijke BBQ-catering';
    const addressLine = overrides.addressLine ?? '';
    const email = overrides.email ?? '';
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
    const sideText = contrastTextColor(accent);
    const muted = '#777';
    const totalDishes = data.gangen.reduce((s, g) => s + g.dishes.length, 0);
    const legend = formatAllergenLegend(data.gangen);

    const eventBlock = (eventTitle || eventMessage) && (
        <div
            style={{
                background: `color-mix(in srgb, ${accent} 6%, transparent)`,
                borderLeft: `3px solid ${accent}`,
                padding: `${8 * sizeMult}px ${12 * sizeMult}px`,
                margin: `${10 * sizeMult}px 0 ${16 * sizeMult}px`,
            }}
        >
            {eventTitle && (
                <div
                    style={{
                        fontFamily: `'${headingFont}', sans-serif`,
                        fontSize: 14 * sizeMult,
                        fontWeight: 500,
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
                        fontSize: 9 * sizeMult,
                        color: muted,
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
            style={{
                background: bg,
                width: isSmall ? 290 : 480,
                aspectRatio: '1 / 1.414',
                boxShadow: '0 4px 24px rgba(0,0,0,.1)',
                borderRadius: 3,
                overflow: 'hidden',
                color: text,
                fontFamily: `'${bodyFont}', sans-serif`,
                position: 'relative',
                flexShrink: 0,
            }}
        >
            <div
                style={{
                    display: 'grid',
                    gridTemplateColumns: `${133 * sizeMult}px 1fr`,
                    minHeight: '100%',
                }}
            >
                {/* Sidebar — brand-primary bg */}
                <div
                    style={{
                        background: accent,
                        padding: `${48 * sizeMult}px ${14 * sizeMult}px ${48 * sizeMult}px`,
                        display: 'flex',
                        flexDirection: 'column',
                        color: sideText,
                    }}
                >
                    {data.logoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                            src={data.logoUrl}
                            alt={brandName}
                            style={{
                                maxHeight: logoSize * sizeMult,
                                objectFit: 'contain',
                                marginBottom: 8 * sizeMult,
                                filter: 'brightness(0) invert(1)',
                            }}
                        />
                    ) : (
                        <div
                            style={{
                                width: logoSize * sizeMult,
                                height: logoSize * sizeMult,
                                borderRadius: '50%',
                                border: '2px solid rgba(255,255,255,.3)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: 18 * sizeMult,
                                fontWeight: 600,
                                background: 'rgba(255,255,255,.06)',
                                marginBottom: 8 * sizeMult,
                            }}
                        >
                            {logoInitials}
                        </div>
                    )}
                    <div style={{ fontSize: 14 * sizeMult, fontWeight: 600, lineHeight: 1.15 }}>{brandName}</div>
                    {subtitle && (
                        <div
                            style={{
                                fontSize: 8 * sizeMult,
                                opacity: 0.5,
                                letterSpacing: '.1em',
                                textTransform: 'uppercase',
                                marginTop: 3 * sizeMult,
                            }}
                        >
                            {subtitle}
                        </div>
                    )}
                    <div style={{ width: 18 * sizeMult, height: 1, background: 'rgba(255,255,255,.2)', margin: `${12 * sizeMult}px 0` }} />
                    {data.gangen.map((g, i) => (
                        <div key={i} style={{ marginBottom: 10 * sizeMult }}>
                            <div style={{ fontSize: 22 * sizeMult, fontWeight: 300, opacity: 0.18, lineHeight: 0.85 }}>
                                {String(i + 1).padStart(2, '0')}
                            </div>
                            <div style={{ fontSize: 9 * sizeMult, fontWeight: 500, letterSpacing: '.03em', marginTop: 2 * sizeMult }}>{g.name}</div>
                            <div style={{ fontSize: 7 * sizeMult, opacity: 0.4, marginTop: 1 * sizeMult }}>
                                {g.dishes.length} gerechten
                            </div>
                        </div>
                    ))}
                    <div style={{ marginTop: 'auto', fontSize: 7 * sizeMult, opacity: 0.4, lineHeight: 1.7 }}>
                        {addressLine && <div>{addressLine}</div>}
                        {email && <div>{email}</div>}
                        {website && <div>{website}</div>}
                    </div>
                </div>

                {/* Main */}
                <div style={{ padding: `${48 * sizeMult}px ${22 * sizeMult}px ${48 * sizeMult}px`, display: 'flex', flexDirection: 'column' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 * sizeMult }}>
                        <div
                            style={{
                                fontFamily: `'${headingFont}', sans-serif`,
                                fontSize: headingSize * sizeMult,
                                fontWeight: headingWeight,
                                letterSpacing: '.01em',
                                lineHeight: 0.9,
                                color: text,
                            }}
                        >
                            Menu
                        </div>
                        <div
                            style={{
                                fontSize: 7 * sizeMult,
                                color: muted,
                                letterSpacing: '.1em',
                                textTransform: 'uppercase',
                                marginTop: 2 * sizeMult,
                            }}
                        >
                            {data.gangen.length} gangen · {totalDishes} gerechten
                        </div>
                    </div>

                    {eventPosition === 'top' && eventBlock}

                    {data.gangen.map((gang, gi) => (
                        <div key={gi}>
                            <div style={{ marginBottom: 14 * sizeMult }}>
                                <div style={{ display: 'flex', alignItems: 'baseline', gap: 7 * sizeMult, marginBottom: 2 * sizeMult }}>
                                    <div
                                        style={{
                                            fontFamily: `'${headingFont}', sans-serif`,
                                            fontSize: 9 * sizeMult,
                                            fontWeight: 500,
                                            color: accent,
                                            letterSpacing: '.06em',
                                        }}
                                    >
                                        {String(gi + 1).padStart(2, '0')}
                                    </div>
                                    <div
                                        style={{
                                            fontFamily: `'${headingFont}', sans-serif`,
                                            fontSize: 13 * sizeMult,
                                            fontWeight: 500,
                                            letterSpacing: '.02em',
                                            color: text,
                                        }}
                                    >
                                        {gang.name}
                                    </div>
                                </div>
                                {gang.description && (
                                    <div
                                        style={{
                                            fontFamily: `'${bodyFont}', sans-serif`,
                                            fontSize: 8 * sizeMult,
                                            color: muted,
                                            lineHeight: 1.55,
                                            marginBottom: 5 * sizeMult,
                                            maxWidth: 290 * sizeMult,
                                        }}
                                    >
                                        {gang.description}
                                    </div>
                                )}
                                <div
                                    style={{
                                        width: '100%',
                                        height: 1.5 * sizeMult,
                                        background: `linear-gradient(90deg, ${accent}, transparent 60%)`,
                                        marginBottom: 6 * sizeMult,
                                    }}
                                />
                                {gang.dishes.map((dish, di) => (
                                    <div key={di} style={{ display: 'flex', gap: 6 * sizeMult, marginBottom: 4 * sizeMult, alignItems: 'baseline' }}>
                                        <div
                                            style={{
                                                width: 4 * sizeMult,
                                                height: 4 * sizeMult,
                                                borderRadius: '50%',
                                                background: accent,
                                                opacity: 0.3,
                                                marginTop: 3 * sizeMult,
                                                flexShrink: 0,
                                            }}
                                        />
                                        <div>
                                            <div
                                                style={{
                                                    fontFamily: `'${bodyFont}', sans-serif`,
                                                    fontSize: bodySize * sizeMult,
                                                    fontWeight: 500,
                                                    color: text,
                                                }}
                                            >
                                                {dish.name}
                                            </div>
                                            {dish.description && (
                                                <div
                                                    style={{
                                                        fontFamily: `'${bodyFont}', sans-serif`,
                                                        fontSize: 8 * sizeMult,
                                                        color: muted,
                                                        lineHeight: 1.45,
                                                        marginTop: 1 * sizeMult,
                                                    }}
                                                >
                                                    {dish.description}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                                {showFootnote && <GangFootnote gang={gang} bodyFont={bodyFont} mult={sizeMult} accent={accent} />}
                            </div>
                            {showDividers && gi < data.gangen.length - 1 && (
                                <hr
                                    style={{
                                        border: 'none',
                                        borderTop: `1px solid #EDEDED`,
                                        margin: `${4 * sizeMult}px 0 ${14 * sizeMult}px`,
                                    }}
                                />
                            )}
                        </div>
                    ))}

                    {eventPosition === 'bottom' && eventBlock}

                    {/* Legend */}
                    <div
                        style={{
                            marginTop: 'auto',
                            paddingTop: 10 * sizeMult,
                            borderTop: `2px solid ${accent}`,
                        }}
                    >
                        <div
                            style={{
                                fontFamily: `'${bodyFont}', sans-serif`,
                                fontSize: 8 * sizeMult,
                                fontWeight: 600,
                                letterSpacing: '.12em',
                                textTransform: 'uppercase',
                                color: accent,
                                marginBottom: 3 * sizeMult,
                            }}
                        >
                            Allergenen
                        </div>
                        <div
                            style={{
                                fontFamily: `'${bodyFont}', sans-serif`,
                                fontSize: 7 * sizeMult,
                                color: muted,
                                lineHeight: 1.8,
                            }}
                        >
                            {legend || '—'}
                        </div>
                        {footer && (
                            <div style={{ fontSize: 7 * sizeMult, color: '#C8C8C8', marginTop: 6 * sizeMult }}>{footer}</div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
