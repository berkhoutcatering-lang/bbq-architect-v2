/**
 * Tasting-01 — Fine-dining tasting, verticale timeline.
 *
 * Geport vanaf `templates/tasting-01.html`. Visuele DNA:
 *   - Centered header met Cormorant SC small-caps brandnaam
 *   - Italic-script "Menu" (44px) onder rule
 *   - Verticale lijn middel, met diamond-nodes per gang
 *   - Gangen wisselen links/rechts (timeline-stijl)
 *   - Card-stijl gang-content op tint achtergrond
 *   - Footnote-allergens per gang
 */

import type { Overrides } from '@/lib/menukaart/registry';
import {
    type MenuData,
    type MenuGang,
    ALLERGEN_MAP,
    formatAllergenLegend,
    gangAllergens,
} from '@/lib/menukaart/menu-data';

type Props = {
    overrides: Overrides;
    data: MenuData;
    size?: 'normal' | 'small';
};

function GangFootnote({ gang, bodyFont, mult }: { gang: MenuGang; bodyFont: string; mult: number }) {
    const used = gangAllergens(gang);
    if (used.length === 0) return null;
    return (
        <div
            style={{
                fontFamily: `'${bodyFont}', sans-serif`,
                fontSize: 8 * mult,
                fontWeight: 300,
                color: '#8A8478',
                marginTop: 4 * mult,
                fontStyle: 'italic',
            }}
        >
            Bevat: {used.map(a => ALLERGEN_MAP[a]).join(', ')}
        </div>
    );
}

export default function Tasting01Preview({ overrides, data, size = 'normal' }: Props) {
    const accent = overrides.accent ?? '#9e781c';
    const bg = overrides.bg ?? '#F6F2E8';
    const text = overrides.text ?? '#1A1814';
    const headingFont = overrides.headingFont ?? 'Cormorant';
    const bodyFont = overrides.bodyFont ?? 'Inter';
    const headingSize = overrides.headingSize ?? 44;
    const bodySize = overrides.bodySize ?? 10;
    const headingWeight = overrides.headingWeight ?? 300;
    const logoSize = overrides.logoSize ?? 52;
    const showFootnote = overrides.showFootnoteAllergens !== false;
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
        .slice(0, 1)
        .toUpperCase();
    const muted = '#8A8478';
    const light = '#C8C0B0';
    const tint = '#EDE8DA';
    const legend = formatAllergenLegend(data.gangen);

    const eventBlock = (eventTitle || eventMessage) && (
        <div style={{ textAlign: 'center', margin: `${6}px 0 ${10}px` }}>
            {eventTitle && (
                <div
                    style={{
                        fontFamily: `'${headingFont}', serif`,
                        fontSize: 16,
                        fontStyle: 'italic',
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
                        fontFamily: `'${headingFont}', serif`,
                        fontSize: 9,
                        fontStyle: 'italic',
                        color: muted,
                        lineHeight: 1.55,
                        maxWidth: 340,
                        margin: '0 auto',
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
                boxShadow: '0 4px 24px rgba(0,0,0,.08)',
                borderRadius: 3,
                overflow: 'hidden',
                position: 'relative',
                color: text,
                fontFamily: `'${bodyFont}', sans-serif`,
                flexShrink: 0,
            }}
        >
            <div
                style={{
                    padding: `${32}px ${36}px ${22}px`,
                    display: 'flex',
                    flexDirection: 'column',
                    minHeight: '100%',
                }}
            >
                {/* Header */}
                <div style={{ textAlign: 'center', marginBottom: 10 }}>
                    {data.logoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={data.logoUrl} alt={brandName} style={{ maxHeight: logoSize, objectFit: 'contain', marginBottom: 5 }} />
                    ) : (
                        <div
                            style={{
                                width: logoSize,
                                height: logoSize,
                                borderRadius: '50%',
                                border: `1.5px solid ${accent}`,
                                margin: `0 auto ${5}px`,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontFamily: `'${headingFont}', serif`,
                                fontSize: 20,
                                color: accent,
                            }}
                        >
                            {logoInitials}
                        </div>
                    )}
                    <div
                        style={{
                            fontFamily: `'${headingFont}', serif`,
                            fontSize: 12,
                            fontWeight: 400,
                            letterSpacing: '.22em',
                            textTransform: 'uppercase',
                            color: text,
                        }}
                    >
                        {brandName}
                    </div>
                    {subtitle && (
                        <div
                            style={{
                                fontFamily: `'${headingFont}', serif`,
                                fontSize: 9,
                                fontStyle: 'italic',
                                color: muted,
                                marginTop: 2,
                            }}
                        >
                            {subtitle}
                        </div>
                    )}
                    <div style={{ width: 28, height: 1, background: accent, margin: `${10}px auto` }} />
                    <div
                        style={{
                            fontFamily: `'${headingFont}', serif`,
                            fontSize: headingSize * 0.7,
                            fontWeight: headingWeight,
                            fontStyle: 'italic',
                            color: accent,
                            lineHeight: 0.9,
                            letterSpacing: '.04em',
                        }}
                    >
                        Menu
                    </div>
                </div>

                {eventPosition === 'top' && eventBlock}

                {/* Timeline */}
                <div
                    style={{
                        position: 'relative',
                        flex: 1,
                        padding: `${10}px 0`,
                    }}
                >
                    <div
                        aria-hidden
                        style={{
                            position: 'absolute',
                            left: '50%',
                            top: 0,
                            bottom: 0,
                            width: 1,
                            background: `linear-gradient(180deg, transparent, ${accent} 8%, ${accent} 92%, transparent)`,
                            transform: 'translateX(-0.5px)',
                        }}
                    />
                    {data.gangen.map((gang, gi) => {
                        const isLeft = gi % 2 === 0;
                        const num = String(gi + 1).padStart(2, '0');
                        return (
                            <div
                                key={gi}
                                style={{
                                    display: 'flex',
                                    marginBottom: 12,
                                    position: 'relative',
                                    paddingRight: isLeft ? `calc(50% + ${18}px)` : 0,
                                    paddingLeft: !isLeft ? `calc(50% + ${18}px)` : 0,
                                    flexDirection: isLeft ? 'row' : 'row-reverse',
                                }}
                            >
                                {/* Diamond node */}
                                <div
                                    aria-hidden
                                    style={{
                                        position: 'absolute',
                                        left: '50%',
                                        top: 8,
                                        width: 9,
                                        height: 9,
                                        background: bg,
                                        border: `1.5px solid ${accent}`,
                                        transform: 'translateX(-50%) rotate(45deg)',
                                        zIndex: 2,
                                    }}
                                />
                                <div
                                    style={{
                                        background: tint,
                                        borderRadius: 3,
                                        padding: `${8}px ${10}px`,
                                        border: '1px solid rgba(0,0,0,.04)',
                                        width: '100%',
                                        textAlign: isLeft ? 'right' : 'left',
                                    }}
                                >
                                    <div
                                        style={{
                                            fontFamily: `'${headingFont}', serif`,
                                            fontSize: 20,
                                            fontWeight: 300,
                                            color: accent,
                                            lineHeight: 0.8,
                                            marginBottom: 2,
                                        }}
                                    >
                                        {num}
                                    </div>
                                    <div
                                        style={{
                                            fontFamily: `'${headingFont}', serif`,
                                            fontSize: 14,
                                            fontWeight: 400,
                                            fontStyle: 'italic',
                                            letterSpacing: '.03em',
                                            color: text,
                                        }}
                                    >
                                        {gang.name}
                                    </div>
                                    {gang.description && (
                                        <div
                                            style={{
                                                fontFamily: `'${headingFont}', serif`,
                                                fontSize: 8,
                                                fontWeight: 300,
                                                fontStyle: 'italic',
                                                color: muted,
                                                lineHeight: 1.55,
                                                margin: `${2}px 0 ${5}px`,
                                            }}
                                        >
                                            {gang.description}
                                        </div>
                                    )}
                                    {gang.dishes.map((dish, di) => (
                                        <div key={di} style={{ marginBottom: 2 }}>
                                            <div
                                                style={{
                                                    fontFamily: `'${headingFont}', serif`,
                                                    fontSize: bodySize,
                                                    fontWeight: 400,
                                                    letterSpacing: '.02em',
                                                    color: text,
                                                }}
                                            >
                                                {dish.name}
                                            </div>
                                            {dish.description && (
                                                <div
                                                    style={{
                                                        fontFamily: `'${headingFont}', serif`,
                                                        fontSize: 8,
                                                        fontWeight: 300,
                                                        fontStyle: 'italic',
                                                        color: muted,
                                                    }}
                                                >
                                                    {dish.description}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                    {showFootnote && <GangFootnote gang={gang} bodyFont={bodyFont} mult={1} />}
                                </div>
                            </div>
                        );
                    })}
                </div>

                {eventPosition === 'bottom' && eventBlock}

                {/* Legend */}
                <div style={{ textAlign: 'center', paddingTop: 8 }}>
                    <div style={{ width: 28, height: 1, background: accent, margin: `0 auto ${6}px` }} />
                    <div
                        style={{
                            fontSize: 8,
                            fontWeight: 500,
                            letterSpacing: '.15em',
                            textTransform: 'uppercase',
                            color: accent,
                            marginBottom: 3,
                        }}
                    >
                        Allergenen
                    </div>
                    <div
                        style={{
                            fontSize: 8,
                            fontWeight: 300,
                            color: muted,
                            lineHeight: 1.8,
                        }}
                    >
                        {legend || '—'}
                    </div>
                    {footer && (
                        <div
                            style={{
                                fontSize: 7,
                                color: light,
                                marginTop: 6,
                            }}
                        >
                            {footer}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
