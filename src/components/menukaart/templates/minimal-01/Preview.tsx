/**
 * Minimal-01 — Strikt minimaal, mono-typografie.
 *
 * Geport vanaf `templates/minimal-01.html`. Visuele DNA:
 *   - IBM Plex Mono only — geen serif, geen decoratie
 *   - Ghost-cijfer per gang (90px, lichtgrijs)
 *   - Dish-id (01.1, 01.2 ...) op smal kolom links met hairline
 *   - Inline allergens in brand-primary
 *   - 4-koloms allergeen-grid in legenda
 */

import type { Overrides } from '@/lib/menukaart/registry';
import {
    type MenuData,
    ALLERGEN_MAP,
    getUsedAllergens,
} from '@/lib/menukaart/menu-data';

type Props = {
    overrides: Overrides;
    data: MenuData;
    size?: 'normal' | 'small';
};

export default function Minimal01Preview({ overrides, data, size = 'normal' }: Props) {
    const accent = overrides.accent ?? '#0A0A0A';
    const bg = overrides.bg ?? '#FFFFFF';
    const text = overrides.text ?? '#0A0A0A';
    const headingFont = overrides.headingFont ?? 'IBM Plex Mono';
    const bodyFont = overrides.bodyFont ?? 'IBM Plex Mono';
    const headingSize = overrides.headingSize ?? 64;
    const bodySize = overrides.bodySize ?? 11;
    const headingWeight = overrides.headingWeight ?? 500;
    const logoSize = overrides.logoSize ?? 44;
    const showGhost = overrides.showGhostNumbers !== false;
    const brandName = overrides.brandName ?? 'Vuur & Vlam';
    const subtitle = overrides.subtitle ?? 'Ambachtelijke BBQ-catering';
    const footer = overrides.footer ?? '';
    const eventTitle = overrides.eventTitle ?? '';
    const eventMessage = overrides.eventMessage ?? '';
    const eventPosition = overrides.eventMessagePosition ?? 'top';
    const muted = '#888';
    const light = '#C0C0C0';
    const ghost = '#F2F2F2';
    const used = getUsedAllergens(data.gangen);
    const totalDishes = data.gangen.reduce((s, g) => s + g.dishes.length, 0);

    const eventBlock = (eventTitle || eventMessage) && (
        <div
            style={{
                margin: `${8}px 0 ${14}px`,
                paddingTop: 8,
                borderTop: `1px solid ${text}`,
                paddingBottom: 8,
                borderBottom: `1px solid ${text}`,
            }}
        >
            {eventTitle && (
                <div
                    style={{
                        fontFamily: `'${headingFont}', monospace`,
                        fontSize: 11,
                        fontWeight: 500,
                        textTransform: 'uppercase',
                        letterSpacing: '.18em',
                        color: text,
                        marginBottom: 2,
                    }}
                >
                    {eventTitle}
                </div>
            )}
            {eventMessage && (
                <div
                    style={{
                        fontFamily: `'${bodyFont}', monospace`,
                        fontSize: 8,
                        fontWeight: 300,
                        fontStyle: 'italic',
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
                width: 480,
                aspectRatio: '1 / 1.414',
                boxShadow: '0 4px 24px rgba(0,0,0,.08)',
                borderRadius: 3,
                overflow: 'hidden',
                position: 'relative',
                color: text,
                fontFamily: `'${bodyFont}', monospace`,
                flexShrink: 0,
            }}
        >
            {showGhost && (
                <div
                    aria-hidden
                    style={{
                        position: 'absolute',
                        right: -12,
                        top: -24,
                        fontSize: 200,
                        fontWeight: 500,
                        color: ghost,
                        lineHeight: 0.7,
                        pointerEvents: 'none',
                        letterSpacing: '-.04em',
                        zIndex: 0,
                        fontFamily: `'${headingFont}', monospace`,
                    }}
                >
                    {data.gangen.length}
                </div>
            )}
            <div
                style={{
                    padding: `${36}px ${42}px ${20}px`,
                    display: 'flex',
                    flexDirection: 'column',
                    minHeight: '100%',
                    position: 'relative',
                    zIndex: 1,
                }}
            >
                {/* Header */}
                <div style={{ marginBottom: 18 }}>
                    {data.logoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={data.logoUrl} alt={brandName} style={{ maxHeight: logoSize, marginBottom: 6, objectFit: 'contain' }} />
                    ) : (
                        <div
                            style={{
                                fontSize: 8,
                                fontWeight: 500,
                                letterSpacing: '.15em',
                                textTransform: 'uppercase',
                                color: muted,
                                marginBottom: 6,
                            }}
                        >
                            {brandName}
                        </div>
                    )}
                    <div
                        style={{
                            fontFamily: `'${headingFont}', monospace`,
                            fontSize: headingSize,
                            fontWeight: headingWeight,
                            letterSpacing: '.02em',
                            lineHeight: 0.85,
                            color: text,
                        }}
                    >
                        Menu
                    </div>
                    <div
                        style={{
                            fontSize: 9,
                            fontWeight: 400,
                            letterSpacing: '.15em',
                            textTransform: 'uppercase',
                            color: muted,
                            marginTop: 5,
                        }}
                    >
                        {brandName}
                    </div>
                    {subtitle && (
                        <div
                            style={{
                                fontSize: 8,
                                fontWeight: 300,
                                color: light,
                                letterSpacing: '.04em',
                                marginTop: 2,
                            }}
                        >
                            {subtitle}
                        </div>
                    )}
                    <div style={{ width: '100%', height: 1.5, background: text, marginTop: 8 }} />
                </div>

                {eventPosition === 'top' && eventBlock}

                {/* Gangen */}
                {data.gangen.map((gang, gi) => {
                    const num = String(gi + 1).padStart(2, '0');
                    return (
                        <div key={gi} className="menukaart-gang-wrap" style={{ marginBottom: 14, position: 'relative' }}>
                            {showGhost && (
                                <div
                                    aria-hidden
                                    style={{
                                        position: 'absolute',
                                        left: -4,
                                        top: -6,
                                        fontSize: 56,
                                        fontWeight: 500,
                                        color: ghost,
                                        lineHeight: 0.7,
                                        pointerEvents: 'none',
                                        zIndex: 0,
                                    }}
                                >
                                    {num}
                                </div>
                            )}
                            <div style={{ position: 'relative', zIndex: 1, paddingLeft: 3 }}>
                                <div
                                    style={{
                                        fontSize: 10,
                                        fontWeight: 500,
                                        textTransform: 'uppercase',
                                        letterSpacing: '.2em',
                                        marginBottom: 1,
                                        color: text,
                                    }}
                                >
                                    {gang.name}
                                </div>
                                <div style={{ width: 26, height: 1.5, background: accent, marginBottom: 4 }} />
                                {gang.description && (
                                    <div
                                        style={{
                                            fontSize: 8,
                                            fontWeight: 300,
                                            fontStyle: 'italic',
                                            color: muted,
                                            lineHeight: 1.5,
                                            marginBottom: 5,
                                            maxWidth: 320,
                                        }}
                                    >
                                        {gang.description}
                                    </div>
                                )}
                                {gang.dishes.map((dish, di) => (
                                    <div
                                        key={di}
                                        style={{
                                            display: 'grid',
                                            gridTemplateColumns: `${26}px 1fr`,
                                            gap: `0 ${6}px`,
                                            marginBottom: 3,
                                            alignItems: 'baseline',
                                        }}
                                    >
                                        <div
                                            style={{
                                                fontSize: 8,
                                                fontWeight: 400,
                                                color: light,
                                                textAlign: 'right',
                                                paddingRight: 3,
                                                borderRight: `1px solid ${ghost}`,
                                            }}
                                        >
                                            {num}.{di + 1}
                                        </div>
                                        <div>
                                            <div>
                                                <span style={{ fontSize: bodySize, fontWeight: 500, color: text }}>{dish.name}</span>
                                                {dish.allergens && dish.allergens.length > 0 && (
                                                    <span
                                                        style={{
                                                            fontSize: 8,
                                                            color: accent,
                                                            letterSpacing: '.04em',
                                                            marginLeft: 4,
                                                        }}
                                                    >
                                                        {dish.allergens.join(' ')}
                                                    </span>
                                                )}
                                            </div>
                                            {dish.description && (
                                                <div
                                                    style={{
                                                        fontSize: 8,
                                                        fontWeight: 300,
                                                        color: muted,
                                                        lineHeight: 1.45,
                                                        marginTop: 1,
                                                    }}
                                                >
                                                    {dish.description}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                            {gi < data.gangen.length - 1 && (
                                <div
                                    style={{
                                        textAlign: 'center',
                                        fontSize: 8,
                                        color: light,
                                        letterSpacing: '.3em',
                                        margin: `${4}px 0 ${10}px`,
                                    }}
                                >
                                    · · ·
                                </div>
                            )}
                        </div>
                    );
                })}

                {eventPosition === 'bottom' && eventBlock}

                {/* Legend */}
                <div style={{ marginTop: 'auto', paddingTop: 8 }}>
                    {used.length > 0 && (
                        <>
                            <div style={{ width: '100%', height: 1.5, background: text, marginBottom: 6 }} />
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                                <div
                                    style={{
                                        fontSize: 8,
                                        fontWeight: 500,
                                        letterSpacing: '.15em',
                                        textTransform: 'uppercase',
                                        color: text,
                                    }}
                                >
                                    Allergenen
                                </div>
                                <div style={{ fontSize: 8, fontWeight: 300, color: light }}>
                                    {used.length} allergenen · {totalDishes} gerechten
                                </div>
                            </div>
                            <div
                                style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(4, 1fr)',
                                    gap: `${2}px ${10}px`,
                                    marginTop: 3,
                                }}
                            >
                                {used.map(a => (
                                    <div key={a} style={{ fontSize: 8, fontWeight: 300, color: muted }}>
                                        <span style={{ fontWeight: 500, color: text }}>{a}</span> {ALLERGEN_MAP[a]}
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                    {footer && (
                        <div style={{ marginTop: 8, fontSize: 8, fontWeight: 300, color: light }}>{footer}</div>
                    )}
                </div>
            </div>
        </div>
    );
}
