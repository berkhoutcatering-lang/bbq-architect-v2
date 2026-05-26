/**
 * BonReceiptThumb — mini paper-mockup voor bon-grid thumbnails.
 * Design DNA uit Claude archief-atoms.jsx:79-121.
 *
 * Tot we echte PDF-thumbnails server-side renderen (background job) tonen
 * we een goed-genoeg mock met leveranciersnaam + totaalbedrag. PDF-badge
 * blauw, IMG-badge oranje.
 */
'use client';

import { Camera } from 'lucide-react';

interface Props {
    supplier: string;
    type: 'pdf' | 'image';
    amount: number;
    className?: string;
}

export function BonReceiptThumb({ supplier, type, amount, className }: Props) {
    const isPdf = type === 'pdf';

    return (
        <div
            className={`relative h-full w-full overflow-hidden rounded-[8px] border ${className ?? ''}`}
            style={{
                background: 'linear-gradient(180deg, var(--bg-deep), var(--bg-elevated))',
                borderColor: 'var(--border)',
            }}
        >
            {isPdf ? (
                <div className="absolute inset-0 flex items-center justify-center">
                    <div
                        className="overflow-hidden"
                        style={{
                            width: '68%',
                            height: '82%',
                            background: '#f4f1e8',
                            borderRadius: 3,
                            transform: 'rotate(-3deg)',
                            boxShadow: '0 8px 24px rgba(0,0,0,.5)',
                            padding: '8px 10px',
                            fontFamily: 'var(--font-mono)',
                            fontSize: 7,
                            color: '#333',
                            lineHeight: 1.4,
                        }}
                    >
                        <div className="text-center" style={{ fontWeight: 700, fontSize: 9, letterSpacing: '.1em' }}>
                            {supplier.toUpperCase()}
                        </div>
                        <div className="text-center" style={{ fontSize: 6, color: '#666', marginBottom: 2 }}>
                            FACTUUR
                        </div>
                        <hr style={{ border: 0, borderTop: '1px dashed #aaa', margin: '4px 0' }} />
                        {[0, 1, 2, 3, 4].map((i) => (
                            <div
                                key={i}
                                className="flex justify-between"
                                style={{ opacity: 0.5 + (i % 3) * 0.1, marginBottom: 1 }}
                            >
                                <span>{'· '.repeat(4 + (i % 3))}</span>
                                <span style={{ fontVariantNumeric: 'tabular-nums' }}>€··,··</span>
                            </div>
                        ))}
                        <hr style={{ border: 0, borderTop: '1px dashed #aaa', margin: '4px 0' }} />
                        <div className="flex justify-between" style={{ fontWeight: 700, fontSize: 8 }}>
                            <span>TOTAAL</span>
                            <span>€{amount.toFixed(2)}</span>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                    <div
                        className="flex items-center justify-center"
                        style={{
                            width: '60%',
                            height: '78%',
                            background: '#f4f1e8',
                            borderRadius: 2,
                            transform: 'rotate(-2deg)',
                            boxShadow: '0 8px 20px rgba(0,0,0,.5)',
                        }}
                    >
                        <Camera size={18} color="#999" />
                    </div>
                </div>
            )}

            {/* Type badge */}
            <div
                className="absolute top-1.5 right-1.5 rounded-[4px] px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider"
                style={{
                    background: isPdf ? 'rgba(59,130,246,.2)' : 'rgba(249,115,22,.2)',
                    color: isPdf ? 'var(--blue)' : 'var(--orange)',
                }}
            >
                {isPdf ? 'PDF' : 'IMG'}
            </div>
        </div>
    );
}
