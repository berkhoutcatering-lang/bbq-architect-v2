/* ═══════════════════════════════════════════════════════════════
   BCG Matrix — Populariteit vs. Marge (interactive SVG)
   TSX port van mr-analyse.jsx. Werkt op echte Gerecht[] uit Supabase.
   Populariteit wordt nu gefakeerd via een stabiele hash van id —
   verwacht: te vervangen door echte order_count uit ML in volgende ronde.
   ═══════════════════════════════════════════════════════════════ */

'use client';

import { useMemo, useState } from 'react';
import type { Gerecht } from '@/types';
import { fmtEuro, getMargin } from '@/components/menu/helpers';

interface Props {
    gerechten: Gerecht[];
    /* Optioneel: echte populariteit per gerecht-id. Als leeg fallt back op
       stabiele hash van id (zodat dezelfde gerechten consistent in zelfde
       kwadrant landen tussen renders). */
    popularity?: Record<string | number, number>;
}

type Quadrant = 'stars' | 'puzzle' | 'plow' | 'dogs';

interface QuadDef {
    id: Quadrant;
    label: string;
    emoji: string;
    bg: string;
    border: string;
    color: string;
}

const QUADRANTS: QuadDef[] = [
    { id: 'stars',  label: 'Stars',        emoji: '⭐', bg: 'rgba(34,197,94,.04)', border: 'rgba(34,197,94,.15)', color: '#22c55e' },
    { id: 'puzzle', label: 'Puzzels',      emoji: '🧩', bg: 'rgba(255,191,0,.04)', border: 'rgba(255,191,0,.15)', color: '#FFBF00' },
    { id: 'plow',   label: 'Ploegpaarden', emoji: '🐴', bg: 'rgba(59,130,246,.04)', border: 'rgba(59,130,246,.15)', color: '#3b82f6' },
    { id: 'dogs',   label: 'Dogs',         emoji: '🐕', bg: 'rgba(239,68,68,.04)',  border: 'rgba(239,68,68,.15)', color: '#ef4444' },
];

function stableHash(id: string | number): number {
    const s = String(id);
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return Math.abs(h) % 80 + 20; // 20-100
}

function getQuadrant(popularity: number, margin: number): Quadrant {
    const highPop = popularity > 50;
    const highMargin = margin > 65;
    if (highPop && highMargin) return 'stars';
    if (!highPop && highMargin) return 'puzzle';
    if (highPop && !highMargin) return 'plow';
    return 'dogs';
}

export function BcgMatrix({ gerechten, popularity }: Props) {
    const [hovered, setHovered] = useState<string | number | null>(null);
    const [activeQ, setActiveQ] = useState<Quadrant | null>(null);

    const W = 520, H = 400, PAD = 50;
    const innerW = W - PAD;
    const innerH = H - PAD;

    const enriched = useMemo(() => gerechten.map((g) => {
        const pop = popularity?.[g.id] ?? stableHash(g.id);
        const margin = getMargin(g);
        return { ...g, pop, margin, quadrant: getQuadrant(pop, margin) };
    }), [gerechten, popularity]);

    const qCounts: Record<Quadrant, number> = { stars: 0, puzzle: 0, plow: 0, dogs: 0 };
    enriched.forEach((d) => { qCounts[d.quadrant]++; });

    const dotX = (pop: number) => PAD + (pop / 100) * innerW;
    const dotY = (m: number) => H - PAD - (Math.max(0, Math.min(100, m)) / 100) * innerH;

    return (
        <div>
            <svg width={W} height={H} style={{ display: 'block', margin: '0 auto', maxWidth: '100%' }} viewBox={`0 0 ${W} ${H}`}>
                {/* Quadrant backgrounds */}
                {QUADRANTS.map((q) => {
                    const x = q.id === 'stars' || q.id === 'plow' ? W / 2 + PAD / 2 : PAD / 2;
                    const y = q.id === 'stars' || q.id === 'puzzle' ? PAD / 2 : H / 2 + PAD / 4;
                    const isActive = activeQ === q.id;
                    return (
                        <rect
                            key={q.id}
                            x={x} y={y}
                            width={innerW / 2} height={innerH / 2}
                            rx={8}
                            fill={isActive ? q.border : q.bg}
                            stroke={q.border}
                            strokeWidth={1}
                            style={{ cursor: 'pointer', transition: 'fill .2s' }}
                            onClick={() => setActiveQ(isActive ? null : q.id)}
                        />
                    );
                })}

                {/* Axes */}
                <line x1={PAD} y1={H - PAD} x2={W - 10} y2={H - PAD} stroke="var(--border)" strokeWidth={1} />
                <line x1={PAD} y1={10} x2={PAD} y2={H - PAD} stroke="var(--border)" strokeWidth={1} />
                <text x={W / 2} y={H - 8} textAnchor="middle" fill="var(--muted)" fontSize={10}>Populariteit →</text>
                <text x={12} y={H / 2} textAnchor="middle" fill="var(--muted)" fontSize={10} transform={`rotate(-90,12,${H / 2})`}>Marge % →</text>

                {/* Midlines */}
                <line x1={W / 2} y1={PAD - 10} x2={W / 2} y2={H - PAD} stroke="var(--border)" strokeWidth={1} strokeDasharray="4 4" />
                <line x1={PAD} y1={H / 2 - 10} x2={W - 10} y2={H / 2 - 10} stroke="var(--border)" strokeWidth={1} strokeDasharray="4 4" />

                {/* Quadrant labels */}
                {QUADRANTS.map((q) => {
                    const x = q.id === 'stars' || q.id === 'plow' ? W / 2 + PAD / 2 : PAD / 2;
                    const y = q.id === 'stars' || q.id === 'puzzle' ? PAD / 2 : H / 2 + PAD / 4;
                    return (
                        <text
                            key={q.id + 'l'}
                            x={x + innerW / 4}
                            y={y + 20}
                            textAnchor="middle"
                            fill="var(--muted)"
                            fontSize={11}
                            fontWeight={600}
                            style={{ pointerEvents: 'none' }}
                        >
                            {q.emoji} {q.label} ({qCounts[q.id]})
                        </text>
                    );
                })}

                {/* Dots */}
                {enriched.map((d) => {
                    const isHov = hovered === d.id;
                    const isFiltered = activeQ != null && d.quadrant !== activeQ;
                    return (
                        <g key={d.id} onMouseEnter={() => setHovered(d.id)} onMouseLeave={() => setHovered(null)} style={{ cursor: 'pointer' }}>
                            <circle
                                cx={dotX(d.pop)}
                                cy={dotY(d.margin)}
                                r={isHov ? 8 : 5}
                                fill={QUADRANTS.find((q) => q.id === d.quadrant)!.color}
                                opacity={isFiltered ? 0.15 : 0.85}
                                stroke={isHov ? '#fff' : 'none'}
                                strokeWidth={2}
                                style={{ transition: 'r .15s, opacity .2s' }}
                            />
                            {isHov && (
                                <g style={{ pointerEvents: 'none' }}>
                                    <rect x={dotX(d.pop) - 70} y={dotY(d.margin) - 42} width={140} height={34} rx={6} fill="rgba(0,0,0,.85)" stroke="var(--border)" />
                                    <text x={dotX(d.pop)} y={dotY(d.margin) - 28} textAnchor="middle" fill="#fff" fontSize={11} fontWeight={500}>{d.naam}</text>
                                    <text x={dotX(d.pop)} y={dotY(d.margin) - 16} textAnchor="middle" fill="var(--muted)" fontSize={10}>{d.margin}% · {fmtEuro(Number(d.verkoopprijs ?? d.prijs ?? 0))}</text>
                                </g>
                            )}
                        </g>
                    );
                })}
            </svg>

            {/* Quadrant cards below */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginTop: 16 }}>
                {QUADRANTS.map((q) => (
                    <button
                        key={q.id}
                        className="mr-quad-card"
                        onClick={() => setActiveQ(activeQ === q.id ? null : q.id)}
                        style={{
                            borderColor: activeQ === q.id ? q.border : 'var(--border)',
                            background: activeQ === q.id ? q.bg : 'var(--bg-subtle)',
                            cursor: 'pointer', fontFamily: 'var(--font-sans)', color: 'var(--text)',
                        }}
                    >
                        <div style={{ fontSize: 20, marginBottom: 4 }}>{q.emoji}</div>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{q.label}</div>
                        <div style={{ fontSize: 22, fontFamily: 'var(--font-display)', fontWeight: 500, marginTop: 4 }}>{qCounts[q.id]}</div>
                    </button>
                ))}
            </div>

            {/* Disclaimer over populariteit-bron */}
            <div style={{ marginTop: 14, fontSize: 11, color: 'var(--muted)', fontStyle: 'italic' }}>
                Populariteit nu op basis van stabiele id-hash — wordt vervangen door echte order-counts zodra de orders-tabel met gerecht-koppeling beschikbaar is.
            </div>
        </div>
    );
}
