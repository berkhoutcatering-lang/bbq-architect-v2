/**
 * Restaurant-01 — klassiek-restaurant template.
 *
 * Pure visual component. Accepteert resolved overrides (cascade flat) plus
 * `data` (gangen + tenant-info). Style-tokens hangen aan CSS-vars zodat
 * editor live re-render zonder volledige tree-rebuild.
 *
 * Geporte 1-op-1 vanaf /tmp/menukaart-editor-check/.../menu-preview.jsx
 * + bijbehorende a4-* CSS uit editor.css.
 */

import type { Overrides, LogoPosition } from '@/lib/menukaart/registry';

export type MenuGang = {
    eyebrow?: string;
    name: string;
    description?: string;
    dishes: Array<{ name: string; allergens?: string }>;
};

export type MenuData = {
    gangen: MenuGang[];
    allergenLegend?: string;
    logoUrl?: string | null;
};

type Props = {
    overrides: Overrides;
    data: MenuData;
    /** Frame size — 'normal' (480px) of 'small' (290px, voor compare-view). */
    size?: 'normal' | 'small';
};

const DEFAULT_LEGEND = 'G = Gluten · L = Lactose · N = Noten · E = Ei · M = Mosterd · Sd = Sesam · Sf = Sulfiet · Sl = Selderij';

function logoAlignment(pos: LogoPosition | undefined): 'left' | 'center' | 'right' {
    if (pos === 'top-left') return 'left';
    if (pos === 'top-right') return 'right';
    return 'center';
}

export default function Restaurant01Preview({ overrides, data, size = 'normal' }: Props) {
    const accent = overrides.accent ?? '#8B5E3C';
    const bg = overrides.bg ?? '#FAF6EF';
    const text = overrides.text ?? '#2A2520';
    const headingFont = overrides.headingFont ?? 'Cormorant Garamond';
    const bodyFont = overrides.bodyFont ?? 'Inter';
    const headingSize = overrides.headingSize ?? 15;
    const bodySize = overrides.bodySize ?? 10;
    const headingWeight = overrides.headingWeight ?? 400;
    const logoSize = overrides.logoSize ?? 36;
    const align = logoAlignment(overrides.logoPosition);
    const showOrnament = overrides.showOrnament !== false;
    const showDividers = overrides.showDividers !== false;
    const brandName = overrides.brandName ?? 'Vuur & Vlam';
    const subtitle = overrides.subtitle ?? '';
    const footer = overrides.footer ?? '';
    const logoInitials = brandName
        .split(/\s+/)
        .map(w => w[0] ?? '')
        .join('')
        .slice(0, 2)
        .toUpperCase();

    const isSmall = size === 'small';
    const sizeMult = isSmall ? 290 / 480 : 1;

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
                                fontSize: 16 * sizeMult,
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
                            fontSize: 18 * sizeMult,
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
                                fontSize: 7 * sizeMult,
                                letterSpacing: '.18em',
                                textTransform: 'uppercase',
                                color: '#8A847B',
                                marginTop: 2 * sizeMult,
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
                            {gang.eyebrow && (
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
                                    {gang.eyebrow}
                                </div>
                            )}
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
                                        fontSize: 8 * sizeMult,
                                        fontStyle: 'italic',
                                        color: '#8A847B',
                                        lineHeight: 1.5,
                                        margin: `${2 * sizeMult}px auto ${8 * sizeMult}px`,
                                        maxWidth: 320 * sizeMult,
                                    }}
                                >
                                    {gang.description}
                                </div>
                            )}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 * sizeMult, maxWidth: 340 * sizeMult, margin: '0 auto' }}>
                                {gang.dishes.map((dish, di) => (
                                    <div key={di} style={{ textAlign: 'center', marginBottom: 3 * sizeMult }}>
                                        <span
                                            style={{
                                                fontFamily: `'${headingFont}', serif`,
                                                fontSize: bodySize * sizeMult,
                                                fontWeight: 500,
                                                color: text,
                                            }}
                                        >
                                            {dish.name}
                                        </span>
                                        {dish.allergens && (
                                            <span
                                                style={{
                                                    fontFamily: `'${bodyFont}', sans-serif`,
                                                    fontSize: 7 * sizeMult,
                                                    color: accent,
                                                    letterSpacing: '.04em',
                                                    marginLeft: 4 * sizeMult,
                                                }}
                                            >
                                                {dish.allergens}
                                            </span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                ))}

                {/* Legend */}
                <div style={{ marginTop: 'auto', paddingTop: 12 * sizeMult, textAlign: 'center' }}>
                    {showOrnament && (
                        <div
                            style={{
                                width: 80 * sizeMult,
                                height: 1,
                                background: accent,
                                margin: `${10 * sizeMult}px auto`,
                                opacity: 0.45,
                            }}
                        />
                    )}
                    <div
                        style={{
                            fontFamily: `'${bodyFont}', sans-serif`,
                            fontSize: 7 * sizeMult,
                            fontWeight: 500,
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
                            fontFamily: `'${bodyFont}', sans-serif`,
                            fontSize: 7 * sizeMult,
                            color: '#8A847B',
                            lineHeight: 1.7,
                        }}
                    >
                        {data.allergenLegend ?? DEFAULT_LEGEND}
                    </div>
                </div>
                {footer && (
                    <div
                        style={{
                            textAlign: 'center',
                            marginTop: 8 * sizeMult,
                            fontFamily: `'${bodyFont}', sans-serif`,
                            fontSize: 7 * sizeMult,
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

/** Demo-data voor de editor — gebruikt als de offerte nog geen menu-selectie heeft. */
export const DEMO_MENU: MenuData = {
    gangen: [
        {
            eyebrow: 'GANG 01',
            name: 'Ontvangst',
            description: 'Welkom met een selectie van huisgemaakte hapjes, vers van de grill.',
            dishes: [
                { name: 'Pulled Pork Brioche', allergens: 'G E Sd M' },
                { name: 'Brisket Crostini', allergens: 'G E' },
                { name: 'Gegrilde Watermeloen', allergens: 'L' },
            ],
        },
        {
            eyebrow: 'GANG 02',
            name: 'Van de Smoker',
            description: 'Het hart van ons menu — low & slow bereid op onze offset smokers.',
            dishes: [
                { name: 'Beef Brisket 14h', allergens: 'Sf Sl' },
                { name: 'Pulled Pork Shoulder', allergens: 'M Sf' },
                { name: 'Lamb Ribs', allergens: '' },
                { name: 'Portobello uit de Smoker', allergens: 'L N' },
            ],
        },
        {
            eyebrow: 'GANG 03',
            name: 'Bijgerechten',
            description: 'Vers en huisgemaakt — de perfecte begeleiders.',
            dishes: [
                { name: 'Coleslaw Classic', allergens: 'E M' },
                { name: 'Smoked Mac & Cheese', allergens: 'G L' },
                { name: 'Cornbread', allergens: 'G L E' },
            ],
        },
        {
            eyebrow: 'GANG 04',
            name: 'Dessert',
            description: 'Zoete afsluiter met een vleugje rook.',
            dishes: [
                { name: 'Smoked Pecan Pie', allergens: 'G N E L' },
                { name: 'Gegrilde Ananas', allergens: 'L' },
            ],
        },
    ],
};
