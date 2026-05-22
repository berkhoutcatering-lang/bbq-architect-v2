/**
 * Rustic-01 — Bistro warm, kraft-papier, Caveat script.
 *
 * Geport vanaf `templates/rustic-01.html`. Visuele DNA:
 *   - Kraft-papier achtergrond (gradient #E8DCBE → #D8CCA8) met SVG-noise grain
 *   - Dubbel-frame (outer + inner) in licht-bruin
 *   - Wax-seal logo (cirkel in brand-primary met initials)
 *   - Caveat script voor gang-titels, Lora serif voor body
 *   - "Vine" divider met Lucide leaf-SVG tussen gangen
 *   - Dishes area in semi-transparante witte achtergrond
 */

import type { Overrides } from '@/lib/menukaart/registry';
import { type MenuData, formatAllergenLegend } from '@/lib/menukaart/menu-data';

type Props = {
    overrides: Overrides;
    data: MenuData;
    size?: 'normal' | 'small';
};

function LeafSvg({ accent, mult }: { accent: string; mult: number }) {
    return (
        <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke={accent}
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ width: 13 * mult, height: 13 * mult, opacity: 0.5 }}
        >
            <path d="M11 20A7 7 0 0 1 9.8 6.9C15.5 4.9 17 3.5 19 2c1 2 2 4.5 1 8-1 3.5-3.5 5-6 6.5" />
            <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" />
        </svg>
    );
}

function Vine({ accent, mult }: { accent: string; mult: number }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 * mult, justifyContent: 'center', margin: `${8 * mult}px 0` }}>
            <div style={{ width: 42 * mult, height: 1, background: `linear-gradient(90deg, transparent, ${accent}40)` }} />
            <LeafSvg accent={accent} mult={mult} />
            <div style={{ width: 42 * mult, height: 1, background: `linear-gradient(90deg, ${accent}40, transparent)` }} />
        </div>
    );
}

export default function Rustic01Preview({ overrides, data, size = 'normal' }: Props) {
    const accent = overrides.accent ?? '#7C5234';
    const bg = overrides.bg ?? '#E8DCBE';
    const bgDark = '#D8CCA8';
    const text = overrides.text ?? '#3D2E1E';
    const headingFont = overrides.headingFont ?? 'Caveat';
    const bodyFont = overrides.bodyFont ?? 'Lora';
    const headingSize = overrides.headingSize ?? 36;
    const bodySize = overrides.bodySize ?? 11;
    const headingWeight = overrides.headingWeight ?? 600;
    const logoSize = overrides.logoSize ?? 56;
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
        .slice(0, 1)
        .toUpperCase();

    const isSmall = size === 'small';
    const sizeMult = isSmall ? 290 / 480 : 1;
    const muted = '#6E6250';
    const light = '#B8AA8A';
    const legend = formatAllergenLegend(data.gangen);

    const eventBlock = (eventTitle || eventMessage) && (
        <div style={{ textAlign: 'center', margin: `${6 * sizeMult}px 0 ${10 * sizeMult}px` }}>
            {eventTitle && (
                <div
                    style={{
                        fontFamily: `'${headingFont}', cursive`,
                        fontSize: 18 * sizeMult,
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
                        fontFamily: `'${bodyFont}', serif`,
                        fontSize: 9 * sizeMult,
                        fontStyle: 'italic',
                        color: muted,
                        lineHeight: 1.5,
                        maxWidth: 320 * sizeMult,
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
                background: `linear-gradient(170deg, ${bg} 0%, ${bgDark} 100%)`,
                width: isSmall ? 290 : 480,
                aspectRatio: '1 / 1.414',
                boxShadow: '0 4px 24px rgba(0,0,0,.25)',
                borderRadius: 3,
                overflow: 'hidden',
                position: 'relative',
                color: text,
                fontFamily: `'${bodyFont}', serif`,
                flexShrink: 0,
            }}
        >
            {/* Double-line frame */}
            {showOrnament && (
                <div
                    aria-hidden
                    style={{
                        position: 'absolute',
                        top: 14 * sizeMult,
                        left: 16 * sizeMult,
                        right: 16 * sizeMult,
                        bottom: 14 * sizeMult,
                        border: `1.5px solid ${light}`,
                        borderRadius: 2,
                        pointerEvents: 'none',
                        zIndex: 1,
                    }}
                >
                    <div
                        style={{
                            position: 'absolute',
                            top: 3 * sizeMult,
                            left: 3 * sizeMult,
                            right: 3 * sizeMult,
                            bottom: 3 * sizeMult,
                            border: `0.5px solid ${light}`,
                            borderRadius: 1,
                        }}
                    />
                </div>
            )}

            <div
                style={{
                    padding: `${56 * sizeMult}px ${34 * sizeMult}px ${56 * sizeMult}px`,
                    display: 'flex',
                    flexDirection: 'column',
                    minHeight: '100%',
                    position: 'relative',
                    zIndex: 2,
                }}
            >
                {/* Header — wax seal */}
                <div style={{ textAlign: 'center', marginBottom: 8 * sizeMult }}>
                    <div
                        style={{
                            width: logoSize * sizeMult,
                            height: logoSize * sizeMult,
                            borderRadius: '50%',
                            background: accent,
                            margin: '0 auto',
                            marginBottom: 6 * sizeMult,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            position: 'relative',
                            boxShadow: '0 3px 8px rgba(0,0,0,.2), inset 0 1px 2px rgba(255,255,255,.2)',
                        }}
                    >
                        <div style={{ position: 'absolute', inset: 4 * sizeMult, borderRadius: '50%', border: '1.5px solid rgba(255,255,255,.25)' }} />
                        {data.logoUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                                src={data.logoUrl}
                                alt={brandName}
                                style={{
                                    maxHeight: logoSize * 0.55 * sizeMult,
                                    objectFit: 'contain',
                                    borderRadius: '50%',
                                    mixBlendMode: 'screen',
                                }}
                            />
                        ) : (
                            <span
                                style={{
                                    fontFamily: `'${headingFont}', cursive`,
                                    fontSize: 26 * sizeMult,
                                    fontWeight: 700,
                                    color: 'rgba(255,255,255,.9)',
                                }}
                            >
                                {logoInitials}
                            </span>
                        )}
                    </div>
                    <div
                        style={{
                            fontFamily: `'${headingFont}', cursive`,
                            fontSize: 32 * sizeMult,
                            fontWeight: 600,
                            color: text,
                            lineHeight: 1,
                        }}
                    >
                        {brandName}
                    </div>
                    {subtitle && (
                        <div
                            style={{
                                fontFamily: `'${bodyFont}', serif`,
                                fontSize: 8 * sizeMult,
                                fontStyle: 'italic',
                                color: muted,
                                letterSpacing: '.08em',
                                marginTop: 2 * sizeMult,
                            }}
                        >
                            {subtitle}
                        </div>
                    )}
                </div>

                {showDividers && <Vine accent={accent} mult={sizeMult} />}

                {eventPosition === 'top' && eventBlock}

                {/* Gangen */}
                {data.gangen.map((gang, gi) => (
                    <div key={gi}>
                        <div style={{ textAlign: 'center', marginBottom: 8 * sizeMult }}>
                            <div
                                style={{
                                    fontFamily: `'${headingFont}', cursive`,
                                    fontSize: headingSize * 0.7 * sizeMult,
                                    fontWeight: headingWeight,
                                    color: accent,
                                }}
                            >
                                {gang.name}
                            </div>
                            {gang.description && (
                                <div
                                    style={{
                                        fontFamily: `'${bodyFont}', serif`,
                                        fontSize: 8 * sizeMult,
                                        fontStyle: 'italic',
                                        color: muted,
                                        lineHeight: 1.55,
                                        margin: `${2 * sizeMult}px auto ${6 * sizeMult}px`,
                                        maxWidth: 320 * sizeMult,
                                    }}
                                >
                                    {gang.description}
                                </div>
                            )}
                            <div
                                style={{
                                    background: 'rgba(255,255,255,.12)',
                                    borderRadius: 4,
                                    padding: `${8 * sizeMult}px ${12 * sizeMult}px`,
                                    margin: '0 auto',
                                    maxWidth: 420 * sizeMult,
                                }}
                            >
                                {gang.dishes.map((dish, di) => (
                                    <div key={di} style={{ marginBottom: 4 * sizeMult, textAlign: 'center' }}>
                                        <div>
                                            <span
                                                style={{
                                                    fontFamily: `'${bodyFont}', serif`,
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
                                                        fontFamily: `'${bodyFont}', serif`,
                                                        fontSize: 8 * sizeMult,
                                                        color: accent,
                                                        marginLeft: 3 * sizeMult,
                                                    }}
                                                >
                                                    ({dish.allergens.join(', ')})
                                                </span>
                                            )}
                                        </div>
                                        {dish.description && (
                                            <div
                                                style={{
                                                    fontFamily: `'${bodyFont}', serif`,
                                                    fontSize: 8 * sizeMult,
                                                    fontStyle: 'italic',
                                                    color: muted,
                                                    lineHeight: 1.45,
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
                        {showDividers && gi < data.gangen.length - 1 && <Vine accent={accent} mult={sizeMult} />}
                    </div>
                ))}

                {eventPosition === 'bottom' && eventBlock}

                {/* Legend */}
                <div style={{ marginTop: 'auto', paddingTop: 8 * sizeMult, textAlign: 'center' }}>
                    <div style={{ width: 50 * sizeMult, height: 1, background: light, margin: '0 auto', marginBottom: 5 * sizeMult }} />
                    <div
                        style={{
                            fontFamily: `'${bodyFont}', serif`,
                            fontSize: 8 * sizeMult,
                            fontWeight: 600,
                            letterSpacing: '.15em',
                            textTransform: 'uppercase',
                            color: accent,
                            marginBottom: 3 * sizeMult,
                        }}
                    >
                        Allergenen
                    </div>
                    <div
                        style={{
                            fontFamily: `'${bodyFont}', serif`,
                            fontSize: 8 * sizeMult,
                            fontStyle: 'italic',
                            color: muted,
                            lineHeight: 1.7,
                        }}
                    >
                        {legend || '—'}
                    </div>
                    {footer && (
                        <div
                            style={{
                                marginTop: 6 * sizeMult,
                                fontFamily: `'${bodyFont}', serif`,
                                fontSize: 8 * sizeMult,
                                color: muted,
                                opacity: 0.5,
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
