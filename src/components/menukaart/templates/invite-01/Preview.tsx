/**
 * Invite-01 — Uitnodiging 21×21cm, trouwkaart-feel.
 *
 * Geport vanaf `templates/invite-01.html`. Visuele DNA:
 *   - Vierkant frame met radial-glow + dubbele inner border
 *   - SVG corner-ornamenten (4 hoeken, 90° gespiegeld)
 *   - Monogram in cirkel (initialen brandnaam)
 *   - Playfair Display serif voor titels, Cormorant italic body
 *   - Ornament divider met diamond + lijnen
 *   - 2×2 gang-grid centered
 *   - Footnote-allergens onderaan elke gang
 */

import type { Overrides } from '@/lib/menukaart/registry';
import {
    type MenuData,
    type MenuGang,
    ALLERGEN_MAP,
    gangAllergens,
    formatAllergenLegend,
} from '@/lib/menukaart/menu-data';

type Props = {
    overrides: Overrides;
    data: MenuData;
    size?: 'normal' | 'small';
};

function CornerSvg({ accent, mult }: { accent: string; mult: number }) {
    const common = { viewBox: '0 0 44 44', fill: 'none' as const, stroke: accent, strokeWidth: 1, strokeLinecap: 'round' as const, opacity: 0.3, width: 36 * mult, height: 36 * mult };
    return (
        <>
            <div style={{ position: 'absolute', top: 9 * mult, left: 9 * mult, zIndex: 3, pointerEvents: 'none' }}>
                <svg {...common}>
                    <path d="M2 42 C2 42, 2 22, 12 12 C22 2, 42 2, 42 2" opacity={0.5} />
                    <path d="M2 32 C2 32, 4 18, 10 12 C16 6, 32 2, 32 2" opacity={0.3} />
                    <circle cx={4} cy={4} r={2} fill={accent} stroke="none" opacity={0.4} />
                </svg>
            </div>
            <div style={{ position: 'absolute', top: 9 * mult, right: 9 * mult, zIndex: 3, pointerEvents: 'none', transform: 'scaleX(-1)' }}>
                <svg {...common}>
                    <path d="M2 42 C2 42, 2 22, 12 12 C22 2, 42 2, 42 2" opacity={0.5} />
                    <path d="M2 32 C2 32, 4 18, 10 12 C16 6, 32 2, 32 2" opacity={0.3} />
                    <circle cx={4} cy={4} r={2} fill={accent} stroke="none" opacity={0.4} />
                </svg>
            </div>
            <div style={{ position: 'absolute', bottom: 9 * mult, left: 9 * mult, zIndex: 3, pointerEvents: 'none', transform: 'scaleY(-1)' }}>
                <svg {...common}>
                    <path d="M2 42 C2 42, 2 22, 12 12 C22 2, 42 2, 42 2" opacity={0.5} />
                    <path d="M2 32 C2 32, 4 18, 10 12 C16 6, 32 2, 32 2" opacity={0.3} />
                    <circle cx={4} cy={4} r={2} fill={accent} stroke="none" opacity={0.4} />
                </svg>
            </div>
            <div style={{ position: 'absolute', bottom: 9 * mult, right: 9 * mult, zIndex: 3, pointerEvents: 'none', transform: 'scale(-1)' }}>
                <svg {...common}>
                    <path d="M2 42 C2 42, 2 22, 12 12 C22 2, 42 2, 42 2" opacity={0.5} />
                    <path d="M2 32 C2 32, 4 18, 10 12 C16 6, 32 2, 32 2" opacity={0.3} />
                    <circle cx={4} cy={4} r={2} fill={accent} stroke="none" opacity={0.4} />
                </svg>
            </div>
        </>
    );
}

function OrnDivider({ accent, mult }: { accent: string; mult: number }) {
    return (
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 5 * mult,
                margin: `${6 * mult}px 0`,
                color: accent,
                opacity: 0.35,
            }}
        >
            <div style={{ width: 32 * mult, height: 1, background: 'currentColor' }} />
            <div style={{ width: 5 * mult, height: 5 * mult, background: 'currentColor', transform: 'rotate(45deg)' }} />
            <div style={{ width: 32 * mult, height: 1, background: 'currentColor' }} />
        </div>
    );
}

function Footnote({ gang, bodyFont, mult }: { gang: MenuGang; bodyFont: string; mult: number }) {
    const used = gangAllergens(gang);
    if (used.length === 0) return null;
    return (
        <div
            style={{
                fontFamily: `'${bodyFont}', serif`,
                fontSize: 8 * mult,
                fontWeight: 300,
                color: '#A09890',
                marginTop: 3 * mult,
                fontStyle: 'italic',
            }}
        >
            Bevat: {used.map(a => ALLERGEN_MAP[a]).join(', ')}
        </div>
    );
}

export default function Invite01Preview({ overrides, data, size = 'normal' }: Props) {
    const accent = overrides.accent ?? '#7C5234';
    const bg = overrides.bg ?? '#F9F5EC';
    const text = overrides.text ?? '#2A2520';
    const headingFont = overrides.headingFont ?? 'Playfair Display';
    const bodyFont = overrides.bodyFont ?? 'Cormorant';
    const headingSize = overrides.headingSize ?? 22;
    const bodySize = overrides.bodySize ?? 11;
    const headingWeight = overrides.headingWeight ?? 400;
    const logoSize = overrides.logoSize ?? 50;
    const showOrnament = overrides.showOrnament !== false;
    const showFootnote = overrides.showFootnoteAllergens !== false;
    const brandName = overrides.brandName ?? 'Vuur & Vlam';
    const subtitle = overrides.subtitle ?? 'Ambachtelijke BBQ-catering';
    const website = overrides.website ?? '';
    const footer = overrides.footer ?? '';
    const eventTitle = overrides.eventTitle ?? '';
    const eventMessage = overrides.eventMessage ?? '';
    const eventPosition = overrides.eventMessagePosition ?? 'top';

    const logoInitial = brandName.charAt(0).toUpperCase();
    const frameSize = 480;
    const muted = '#A09890';
    const light = '#D4CCB8';
    const legend = formatAllergenLegend(data.gangen);

    const eventBlock = (eventTitle || eventMessage) && (
        <div style={{ textAlign: 'center', margin: `${4}px 0 ${8}px` }}>
            {eventTitle && (
                <div
                    style={{
                        fontFamily: `'${headingFont}', serif`,
                        fontSize: 13,
                        fontStyle: 'italic',
                        color: accent,
                        marginBottom: 1,
                    }}
                >
                    {eventTitle}
                </div>
            )}
            {eventMessage && (
                <div
                    style={{
                        fontFamily: `'${bodyFont}', serif`,
                        fontSize: 9,
                        fontStyle: 'italic',
                        color: muted,
                        lineHeight: 1.55,
                        maxWidth: 280,
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
                width: frameSize,
                height: frameSize,
                boxShadow: '0 6px 32px rgba(0,0,0,.14)',
                borderRadius: 3,
                overflow: 'hidden',
                position: 'relative',
                color: text,
                fontFamily: `'${bodyFont}', serif`,
                flexShrink: 0,
            }}
        >
            {/* Radial glow */}
            <div
                aria-hidden
                style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    width: 330,
                    height: 330,
                    transform: 'translate(-50%, -50%)',
                    background: 'radial-gradient(ellipse, rgba(0,0,0,.018), transparent 70%)',
                    pointerEvents: 'none',
                    zIndex: 0,
                }}
            />

            {/* Inner double border */}
            {showOrnament && (
                <>
                    <div
                        aria-hidden
                        style={{
                            position: 'absolute',
                            inset: 10,
                            border: `1px solid ${accent}`,
                            opacity: 0.2,
                            pointerEvents: 'none',
                            zIndex: 2,
                            borderRadius: 1,
                        }}
                    />
                    <div
                        aria-hidden
                        style={{
                            position: 'absolute',
                            inset: 14,
                            border: `0.5px solid ${accent}`,
                            opacity: 0.5,
                            pointerEvents: 'none',
                            zIndex: 2,
                            borderRadius: 1,
                        }}
                    />
                    <CornerSvg accent={accent} mult={1} />
                </>
            )}

            <div
                style={{
                    padding: `${28}px ${36}px ${20}px`,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    height: '100%',
                    textAlign: 'center',
                    position: 'relative',
                    zIndex: 4,
                }}
            >
                {/* Header — monogram */}
                <div style={{ marginBottom: 5 }}>
                    <div
                        style={{
                            width: logoSize,
                            height: logoSize,
                            borderRadius: '50%',
                            border: `1.5px solid ${accent}`,
                            margin: `0 auto ${4}px`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: 'rgba(0,0,0,.01)',
                            overflow: 'hidden',
                        }}
                    >
                        {data.logoUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={data.logoUrl} alt={brandName} style={{ maxHeight: logoSize * 0.72, objectFit: 'contain' }} />
                        ) : (
                            <span style={{ fontFamily: `'${headingFont}', serif`, fontSize: 22, color: accent }}>{logoInitial}</span>
                        )}
                    </div>
                    <div
                        style={{
                            fontFamily: `'${headingFont}', serif`,
                            fontSize: 18,
                            fontWeight: 400,
                            color: text,
                            letterSpacing: '.04em',
                        }}
                    >
                        {brandName}
                    </div>
                    {subtitle && (
                        <div
                            style={{
                                fontFamily: `'${bodyFont}', serif`,
                                fontSize: 9,
                                fontWeight: 300,
                                fontStyle: 'italic',
                                color: muted,
                                marginTop: 2,
                            }}
                        >
                            {subtitle}
                        </div>
                    )}
                </div>

                <OrnDivider accent={accent} mult={1} />

                <div
                    style={{
                        fontFamily: `'${headingFont}', serif`,
                        fontSize: 12,
                        fontStyle: 'italic',
                        color: accent,
                        letterSpacing: '.15em',
                        marginBottom: 6,
                    }}
                >
                    Menu
                </div>

                {eventPosition === 'top' && eventBlock}

                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: `${5}px ${22}px`,
                        flex: 1,
                        alignContent: 'start',
                        width: '100%',
                    }}
                >
                    {data.gangen.map((gang, gi) => (
                        <div key={gi} style={{ textAlign: 'center' }}>
                            <div
                                style={{
                                    fontFamily: `'${headingFont}', serif`,
                                    fontSize: headingSize * 0.6,
                                    fontWeight: headingWeight,
                                    fontStyle: 'italic',
                                    color: accent,
                                    marginBottom: 2,
                                }}
                            >
                                {gang.name}
                            </div>
                            {gang.description && (
                                <div
                                    style={{
                                        fontFamily: `'${bodyFont}', serif`,
                                        fontSize: 8,
                                        fontWeight: 300,
                                        fontStyle: 'italic',
                                        color: muted,
                                        lineHeight: 1.45,
                                        marginBottom: 3,
                                    }}
                                >
                                    {gang.description}
                                </div>
                            )}
                            <div style={{ width: 18, height: 0.5, background: accent, margin: `0 auto ${4}px`, opacity: 0.4 }} />
                            {gang.dishes.map((dish, di) => (
                                <div key={di} style={{ marginBottom: 2 }}>
                                    <div
                                        style={{
                                            fontFamily: `'${bodyFont}', serif`,
                                            fontSize: bodySize,
                                            fontWeight: 400,
                                            color: text,
                                        }}
                                    >
                                        {dish.name}
                                    </div>
                                    {dish.description && (
                                        <div
                                            style={{
                                                fontFamily: `'${bodyFont}', serif`,
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
                            {showFootnote && <Footnote gang={gang} bodyFont={bodyFont} mult={1} />}
                        </div>
                    ))}
                </div>

                {eventPosition === 'bottom' && eventBlock}

                {/* Legend */}
                <div style={{ marginTop: 'auto', paddingTop: 4, width: '100%' }}>
                    <div
                        style={{
                            fontFamily: `'${bodyFont}', serif`,
                            fontSize: 8,
                            fontWeight: 300,
                            color: muted,
                            fontStyle: 'italic',
                            lineHeight: 1.55,
                        }}
                    >
                        {legend || ''}
                    </div>
                    {(footer || website) && (
                        <div
                            style={{
                                marginTop: 3,
                                fontSize: 8,
                                fontWeight: 300,
                                color: light,
                            }}
                        >
                            {footer || website}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
