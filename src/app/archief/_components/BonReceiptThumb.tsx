'use client';
/**
 * BonReceiptThumb — mini paper-mockup voor bon-grid thumbnails.
 *
 * Default rendert ALTIJD een rijke faux-receipt met:
 *   - Supplier naam in caps
 *   - FACTUUR / KASSABON label
 *   - 5-7 nep-regels met bedragen
 *   - Subtotaal + BTW + TOTAAL
 *   - Goud-stripe header voor extra craft-detail
 *
 * Image-variant (foto van papieren bon) toont diezelfde mockup maar dan
 * met polaroid-frame en lichte camera-overlay zodat 't visueel
 * onderscheid blijft.
 *
 * Pas later vervangen door echte server-side PDF-thumbnail-rendering.
 */

import { formatEur } from '@/lib/format';

interface Props {
    supplier: string;
    type?: 'pdf' | 'image' | 'email';
    amount: number;
    date?: string | null;
    className?: string;
}

export function BonReceiptThumb({ supplier, type = 'pdf', amount, date, className }: Props) {
    const isEmail = type === 'email';
    const isImage = type === 'image';
    const supplierCaps = supplier.toUpperCase().slice(0, 18);

    // Genereer deterministische "fake" regel-bedragen op basis van supplier-naam
    // hash zodat dezelfde supplier altijd zelfde mock heeft (geen flicker bij re-render).
    const seed = Array.from(supplier).reduce((s, c) => s + c.charCodeAt(0), 0);
    const fakeLines = [0, 1, 2, 3, 4].map((i) => {
        const r = ((seed + i * 17) % 100) / 100;
        return {
            dots: 4 + Math.floor(r * 3),
            opacity: 0.5 + (r * 0.4),
        };
    });

    return (
        <div
            className={`relative h-full w-full overflow-hidden rounded-[8px] border ${className ?? ''}`}
            style={{
                background: 'linear-gradient(180deg, var(--bg-deep), var(--bg-elevated))',
                borderColor: 'rgba(196,163,90,0.18)',
            }}
        >
            {/* Subtle gold-glow vignette top-corner voor depth */}
            <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0"
                style={{
                    background:
                        'radial-gradient(120% 60% at 20% 0%, rgba(196,163,90,0.10), transparent 60%)',
                }}
            />

            <div className="absolute inset-0 flex items-center justify-center">
                <div
                    className="relative overflow-hidden"
                    style={{
                        width: isImage ? '64%' : '70%',
                        height: isImage ? '78%' : '84%',
                        background: '#f4f1e8',
                        borderRadius: isImage ? 2 : 3,
                        transform: `rotate(${isImage ? -2.5 : -2}deg)`,
                        boxShadow: '0 10px 28px rgba(0,0,0,.55), 0 2px 6px rgba(0,0,0,.4)',
                        padding: '10px 11px 8px',
                        fontFamily: 'var(--font-mono)',
                        fontSize: 7,
                        color: '#3a2e1f',
                        lineHeight: 1.45,
                    }}
                >
                    {/* Gold stripe header */}
                    <div
                        aria-hidden="true"
                        style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            right: 0,
                            height: 3,
                            background: 'linear-gradient(90deg,#c4a35a,#9e781c)',
                        }}
                    />

                    <div
                        className="text-center"
                        style={{
                            fontWeight: 700,
                            fontSize: supplierCaps.length > 12 ? 8 : 9.5,
                            letterSpacing: '.12em',
                            paddingTop: 2,
                        }}
                    >
                        {supplierCaps}
                    </div>
                    <div
                        className="text-center"
                        style={{
                            fontSize: 5.5,
                            color: '#8a7050',
                            marginBottom: 3,
                            letterSpacing: '.15em',
                        }}
                    >
                        {isEmail ? '— E-MAIL FACTUUR —' : '— FACTUUR —'}
                    </div>
                    {date && (
                        <div className="text-center" style={{ fontSize: 5.5, color: '#8a7050', marginBottom: 3 }}>
                            {formatShortDate(date)}
                        </div>
                    )}
                    <hr style={{ border: 0, borderTop: '1px dashed #c2a472', margin: '3px 0' }} />
                    {fakeLines.map((line, i) => (
                        <div
                            key={i}
                            className="flex justify-between"
                            style={{ opacity: line.opacity, marginBottom: 1 }}
                        >
                            <span>{'· '.repeat(line.dots)}</span>
                            <span style={{ fontVariantNumeric: 'tabular-nums' }}>€··,··</span>
                        </div>
                    ))}
                    <hr style={{ border: 0, borderTop: '1px dashed #c2a472', margin: '3px 0' }} />
                    <div
                        className="flex justify-between"
                        style={{ fontWeight: 700, fontSize: 8.5, color: '#1f1810' }}
                    >
                        <span>TOTAAL</span>
                        <span>{formatEur(amount)}</span>
                    </div>

                    {/* Polaroid-style frame voor foto-bonnen (extra subtle) */}
                    {isImage && (
                        <div
                            aria-hidden="true"
                            className="pointer-events-none absolute inset-0"
                            style={{
                                background:
                                    'linear-gradient(180deg, transparent 80%, rgba(0,0,0,0.08) 100%)',
                            }}
                        />
                    )}
                </div>
            </div>

            {/* Type badge (rechtsboven) */}
            <div
                className="absolute top-1.5 right-1.5 rounded-[4px] px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider"
                style={{
                    background: isEmail
                        ? 'rgba(168,85,247,.22)'
                        : isImage
                          ? 'rgba(249,115,22,.22)'
                          : 'rgba(59,130,246,.22)',
                    color: isEmail ? '#c084fc' : isImage ? 'var(--orange)' : 'var(--blue)',
                    backdropFilter: 'blur(4px)',
                }}
            >
                {isEmail ? 'MAIL' : isImage ? 'FOTO' : 'PDF'}
            </div>
        </div>
    );
}

function formatShortDate(d: string): string {
    try {
        return new Date(d).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: '2-digit' });
    } catch {
        return '';
    }
}
