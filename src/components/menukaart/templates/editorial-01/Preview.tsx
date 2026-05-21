/**
 * Editorial-01 — Magazine spread, drop-cap, brand header band.
 *
 * Geport vanaf `templates/editorial-01.html`. Visuele DNA:
 *   - Brand-primary header band met logo + "Menu"-tag rechts
 *   - 2-koloms gang: narrative-card (drop-cap initial) links, dishes rechts
 *   - Drop-cap initial van gang.description in brand-primary
 *   - Footnote-allergens per gang ("Bevat: G Gluten, E Ei")
 *   - Brand-primary top-border boven legenda
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

function GangFootnote({ gang, bodyFont, mult, accent }: { gang: MenuGang; bodyFont: string; mult: number; accent: string }) {
    const used = gangAllergens(gang);
    if (used.length === 0) return null;
    return (
        <div
            style={{
                fontFamily: `'${bodyFont}', sans-serif`,
                fontSize: 8 * mult,
                color: '#8E887E',
                marginTop: 3 * mult,
                textAlign: 'right',
            }}
        >
            Bevat:{' '}
            {used.map((a, i) => (
                <span key={a}>
                    {i > 0 && ', '}
                    <strong style={{ color: accent, fontWeight: 600 }}>{a}</strong> {ALLERGEN_MAP[a]}
                </span>
            ))}
        </div>
    );
}

export default function Editorial01Preview({ overrides, data, size = 'normal' }: Props) {
    const accent = overrides.accent ?? '#8B0000';
    const bg = overrides.bg ?? '#F4F0E6';
    const text = overrides.text ?? '#2C2820';
    const headingFont = overrides.headingFont ?? 'Cormorant';
    const bodyFont = overrides.bodyFont ?? 'DM Sans';
    const headingSize = overrides.headingSize ?? 24;
    const bodySize = overrides.bodySize ?? 11;
    const headingWeight = overrides.headingWeight ?? 400;
    const logoSize = overrides.logoSize ?? 44;
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
    const muted = '#8E887E';
    const warm = '#EAE2D0';
    const headerText = contrastTextColor(accent);
    const legend = formatAllergenLegend(data.gangen);

    const eventBlock = (eventTitle || eventMessage) && (
        <div
            style={{
                background: warm,
                borderLeft: `3px solid ${accent}`,
                padding: `${8 * sizeMult}px ${12 * sizeMult}px`,
                margin: `${4 * sizeMult}px 0 ${10 * sizeMult}px`,
            }}
        >
            {eventTitle && (
                <div
                    style={{
                        fontFamily: `'${headingFont}', serif`,
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
                        fontFamily: `'${headingFont}', serif`,
                        fontSize: 10 * sizeMult,
                        fontStyle: 'italic',
                        color: text,
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
                position: 'relative',
                color: text,
                fontFamily: `'${bodyFont}', sans-serif`,
                flexShrink: 0,
            }}
        >
            <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
                {/* Header band */}
                <div
                    style={{
                        background: accent,
                        padding: `${18 * sizeMult}px ${28 * sizeMult}px ${14 * sizeMult}px`,
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-end',
                        color: headerText,
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 9 * sizeMult }}>
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
                                    width: logoSize * 0.85 * sizeMult,
                                    height: logoSize * 0.85 * sizeMult,
                                    borderRadius: '50%',
                                    border: '1.5px solid rgba(255,255,255,.35)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontFamily: `'${headingFont}', serif`,
                                    fontSize: 16 * sizeMult,
                                    background: 'rgba(255,255,255,.08)',
                                }}
                            >
                                {logoInitials}
                            </div>
                        )}
                        <div>
                            <div
                                style={{
                                    fontFamily: `'${headingFont}', serif`,
                                    fontSize: 17 * sizeMult,
                                    fontWeight: 400,
                                    letterSpacing: '.02em',
                                }}
                            >
                                {brandName}
                            </div>
                            {subtitle && (
                                <div
                                    style={{
                                        fontFamily: `'${bodyFont}', sans-serif`,
                                        fontSize: 7 * sizeMult,
                                        opacity: 0.55,
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
                            fontFamily: `'${headingFont}', serif`,
                            fontSize: 26 * sizeMult,
                            fontWeight: 300,
                            fontStyle: 'italic',
                            opacity: 0.25,
                        }}
                    >
                        Menu
                    </div>
                </div>

                {/* Content */}
                <div
                    style={{
                        padding: `${14 * sizeMult}px ${28 * sizeMult}px ${20 * sizeMult}px`,
                        display: 'flex',
                        flexDirection: 'column',
                        flex: 1,
                    }}
                >
                    {eventPosition === 'top' && eventBlock}

                    {data.gangen.map((gang, gi) => {
                        const initial = gang.description ? gang.description.charAt(0) : '';
                        const rest = gang.description ? gang.description.slice(1) : '';
                        const isLast = gi === data.gangen.length - 1;
                        return (
                            <div key={gi}>
                                <div style={{ marginBottom: 10 * sizeMult }}>
                                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 * sizeMult, marginBottom: 2 * sizeMult }}>
                                        <div
                                            style={{
                                                fontSize: 8 * sizeMult,
                                                fontWeight: 600,
                                                letterSpacing: '.2em',
                                                textTransform: 'uppercase',
                                                color: accent,
                                            }}
                                        >
                                            Gang {String(gi + 1).padStart(2, '0')}
                                        </div>
                                        <div
                                            style={{
                                                fontFamily: `'${headingFont}', serif`,
                                                fontSize: headingSize * 0.75 * sizeMult,
                                                fontWeight: headingWeight,
                                                color: text,
                                            }}
                                        >
                                            {gang.name}
                                        </div>
                                    </div>
                                    <div
                                        style={{
                                            width: '100%',
                                            height: 1,
                                            background: `linear-gradient(90deg, ${accent}, transparent 60%)`,
                                            marginBottom: 5 * sizeMult,
                                        }}
                                    />
                                    <div
                                        style={{
                                            display: 'grid',
                                            gridTemplateColumns: `${135 * sizeMult}px 1fr`,
                                            gap: `0 ${14 * sizeMult}px`,
                                            alignItems: 'start',
                                        }}
                                    >
                                        <div
                                            style={{
                                                background: warm,
                                                borderRadius: 2,
                                                padding: `${8 * sizeMult}px ${10 * sizeMult}px`,
                                                borderLeft: `3px solid ${accent}`,
                                            }}
                                        >
                                            {gang.description && (
                                                <div
                                                    style={{
                                                        fontFamily: `'${headingFont}', serif`,
                                                        fontSize: 9 * sizeMult,
                                                        fontWeight: 300,
                                                        fontStyle: 'italic',
                                                        color: text,
                                                        lineHeight: 1.55,
                                                    }}
                                                >
                                                    <span
                                                        style={{
                                                            fontFamily: `'${headingFont}', serif`,
                                                            fontSize: 32 * sizeMult,
                                                            fontWeight: 500,
                                                            color: accent,
                                                            float: 'left',
                                                            lineHeight: 0.75,
                                                            marginRight: 4 * sizeMult,
                                                            marginTop: 3 * sizeMult,
                                                        }}
                                                    >
                                                        {initial}
                                                    </span>
                                                    {rest}
                                                </div>
                                            )}
                                        </div>
                                        <div>
                                            {gang.dishes.map((dish, di) => (
                                                <div
                                                    key={di}
                                                    style={{
                                                        padding: `${3 * sizeMult}px 0`,
                                                        borderBottom: di < gang.dishes.length - 1 ? '1px solid rgba(0,0,0,.04)' : 'none',
                                                    }}
                                                >
                                                    <div
                                                        style={{
                                                            fontFamily: `'${headingFont}', serif`,
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
                                                                fontFamily: `'${headingFont}', serif`,
                                                                fontSize: 8 * sizeMult,
                                                                fontWeight: 300,
                                                                color: muted,
                                                                fontStyle: 'italic',
                                                            }}
                                                        >
                                                            {dish.description}
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                            {showFootnote && <GangFootnote gang={gang} bodyFont={bodyFont} mult={sizeMult} accent={accent} />}
                                        </div>
                                    </div>
                                </div>
                                {showDividers && !isLast && (
                                    <hr
                                        style={{
                                            border: 'none',
                                            borderTop: '1px solid #D0C8BA',
                                            margin: `${3 * sizeMult}px 0 ${10 * sizeMult}px`,
                                        }}
                                    />
                                )}
                            </div>
                        );
                    })}

                    {eventPosition === 'bottom' && eventBlock}

                    {/* Legend */}
                    <div
                        style={{
                            marginTop: 'auto',
                            paddingTop: 8 * sizeMult,
                            borderTop: `2px solid ${accent}`,
                            display: 'flex',
                            gap: 8 * sizeMult,
                            alignItems: 'baseline',
                        }}
                    >
                        <div
                            style={{
                                fontSize: 8 * sizeMult,
                                fontWeight: 600,
                                letterSpacing: '.12em',
                                textTransform: 'uppercase',
                                color: accent,
                                flexShrink: 0,
                            }}
                        >
                            Allergenen
                        </div>
                        <div style={{ fontSize: 8 * sizeMult, color: muted, lineHeight: 1.8 }}>{legend || '—'}</div>
                    </div>
                    {(footer || addressLine || email || website) && (
                        <div style={{ marginTop: 6 * sizeMult, fontSize: 7 * sizeMult, color: '#D0C8BA' }}>
                            {footer || [addressLine, email, website].filter(Boolean).join(' · ')}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
