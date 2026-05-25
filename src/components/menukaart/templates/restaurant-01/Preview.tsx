/**
 * Restaurant-01 — klassiek-restaurant template.
 *
 * Rendert ALTIJD op 480px base. Schaling via CSS transform in wrapper.
 * Safe-area: 48px horizontal (10%), 60px vertical (8.8%).
 */

import type { Overrides, LogoPosition } from '@/lib/menukaart/registry';
import { type MenuData, formatAllergenLegend } from '@/lib/menukaart/menu-data';

const SAFE_X = 48;
const SAFE_Y = 60;
const BASE_WIDTH = 480;

type Props = {
    overrides: Overrides;
    data: MenuData;
    /** @deprecated — CSS transform in wrapper doet de schaling. Genegeerd. */
    size?: 'normal' | 'small';
};

function logoAlignment(pos: LogoPosition | undefined): 'left' | 'center' | 'right' {
    if (pos === 'top-left') return 'left';
    if (pos === 'top-right') return 'right';
    return 'center';
}

export default function Restaurant01Preview({ overrides, data }: Props) {
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

    const logoInitials = brandName.split(/\s+/).map(w => w[0] ?? '').join('').slice(0, 2).toUpperCase();
    const legend = formatAllergenLegend(data.gangen);

    const eventBlock = (eventTitle || eventMessage) && (
        <div style={{
            textAlign: 'center', margin: '8px auto 12px', padding: '8px 12px',
            maxWidth: 360, borderTop: `0.5px solid ${accent}`, borderBottom: `0.5px solid ${accent}`,
        }}>
            {eventTitle && (
                <div style={{ fontFamily: `'${headingFont}', serif`, fontSize: 12, fontStyle: 'italic', color: accent, marginBottom: 2 }}>
                    {eventTitle}
                </div>
            )}
            {eventMessage && (
                <div style={{ fontFamily: `'${bodyFont}', sans-serif`, fontSize: 8, color: '#8A847B', fontStyle: 'italic', lineHeight: 1.55 }}>
                    {eventMessage}
                </div>
            )}
        </div>
    );

    return (
        <div className="r01-frame" style={{
            background: bg, width: BASE_WIDTH, aspectRatio: '1 / 1.414',
            boxShadow: '0 4px 24px rgba(0,0,0,.5), 0 0 0 1px rgba(255,255,255,.03)',
            borderRadius: 3, overflow: 'hidden', flexShrink: 0, position: 'relative',
            fontFamily: `'${bodyFont}', sans-serif`, color: text,
        }}>
            <div className="r01-pad" style={{
                padding: `${SAFE_Y}px ${SAFE_X}px`,
                display: 'flex', flexDirection: 'column', minHeight: '100%',
            }}>
                {/* Header */}
                <div style={{ textAlign: align, marginBottom: 8 }}>
                    {data.logoUrl ? (
                        <div style={{ marginBottom: 8 }}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={data.logoUrl} alt={brandName} style={{
                                width: logoSize, maxHeight: logoSize,
                                objectFit: 'contain', display: 'inline-block',
                            }} />
                        </div>
                    ) : (
                        <div style={{
                            width: logoSize, height: logoSize, borderRadius: '50%',
                            border: `1.5px solid ${accent}`,
                            margin: align === 'center' ? '0 auto 8px' : '0 0 8px',
                            marginLeft: align === 'right' ? 'auto' : undefined,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontFamily: `'${headingFont}', serif`, fontSize: 18, fontWeight: 500, color: accent,
                        }}>
                            {logoInitials}
                        </div>
                    )}
                    <div style={{
                        fontFamily: `'${headingFont}', serif`, fontSize: 22,
                        fontWeight: 500, color: text, letterSpacing: '.03em',
                    }}>
                        {brandName}
                    </div>
                    {subtitle && (
                        <div style={{
                            fontFamily: `'${bodyFont}', sans-serif`, fontSize: 8,
                            letterSpacing: '.18em', textTransform: 'uppercase', color: '#8A847B', marginTop: 3,
                        }}>
                            {subtitle}
                        </div>
                    )}
                </div>

                <div style={{
                    fontFamily: `'${bodyFont}', sans-serif`, fontSize: 8, fontWeight: 500,
                    letterSpacing: '.22em', textTransform: 'uppercase', color: accent,
                    textAlign: 'center', margin: '14px 0 4px',
                }}>
                    Menu
                </div>

                {eventPosition === 'top' && eventBlock}

                {data.gangen.map((gang, gi) => (
                    <div key={gi} className="menukaart-gang-wrap">
                        {showDividers && (
                            <div style={{ width: 120, height: 1, background: accent, margin: '10px auto', opacity: 0.45 }} />
                        )}
                        <div style={{ textAlign: 'center', marginBottom: 4 }}>
                            <div style={{
                                fontFamily: `'${bodyFont}', sans-serif`, fontSize: 7, fontWeight: 500,
                                letterSpacing: '.18em', textTransform: 'uppercase', color: accent, marginBottom: 1,
                            }}>
                                {gang.eyebrow ?? `GANG ${String(gi + 1).padStart(2, '0')}`}
                            </div>
                            <div style={{
                                fontFamily: `'${headingFont}', serif`, fontSize: headingSize,
                                fontWeight: headingWeight, fontStyle: 'italic', color: text,
                            }}>
                                {gang.name}
                            </div>
                            {gang.description && (
                                <div style={{
                                    fontFamily: `'${headingFont}', serif`, fontSize: 9, fontStyle: 'italic',
                                    color: '#8A847B', lineHeight: 1.55, margin: '3px auto 10px', maxWidth: 360,
                                }}>
                                    {gang.description}
                                </div>
                            )}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 340, margin: '0 auto' }}>
                                {gang.dishes.map((dish, di) => (
                                    <div key={di} style={{ textAlign: 'center' }}>
                                        <div>
                                            <span style={{
                                                fontFamily: `'${headingFont}', serif`, fontSize: 13,
                                                fontWeight: 500, color: text, letterSpacing: '.01em',
                                            }}>
                                                {dish.name}
                                            </span>
                                            {dish.allergens && dish.allergens.length > 0 && (
                                                <span style={{
                                                    fontFamily: `'${bodyFont}', sans-serif`, fontSize: 8,
                                                    color: accent, letterSpacing: '.06em', marginLeft: 5,
                                                }}>
                                                    {dish.allergens.join(' ')}
                                                </span>
                                            )}
                                        </div>
                                        {dish.description && (
                                            <div style={{
                                                fontFamily: `'${bodyFont}', sans-serif`, fontSize: bodySize,
                                                color: '#8A847B', lineHeight: 1.5, marginTop: 1,
                                            }}>
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

                <div style={{ marginTop: 'auto', paddingTop: 16, textAlign: 'center' }}>
                    {showOrnament && (
                        <div style={{ width: 120, height: 1, background: accent, margin: '0 auto 8px', opacity: 0.3 }} />
                    )}
                    <div style={{
                        fontFamily: `'${bodyFont}', sans-serif`, fontSize: 8, fontWeight: 500,
                        letterSpacing: '.15em', textTransform: 'uppercase', color: accent, marginBottom: 4,
                    }}>
                        Allergenen
                    </div>
                    <div style={{
                        fontFamily: `'${bodyFont}', sans-serif`, fontSize: 8, color: '#8A847B', lineHeight: 1.8,
                    }}>
                        {legend || 'Geen allergenen aanwezig'}
                    </div>
                </div>
                {footer && (
                    <div style={{
                        textAlign: 'center', marginTop: 10,
                        fontFamily: `'${bodyFont}', sans-serif`, fontSize: 8, color: '#D0C8B8',
                    }}>
                        {footer}
                    </div>
                )}
            </div>
        </div>
    );
}
