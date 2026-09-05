/* ═══════════════════════════════════════════════════════════════
   BCG Matrix — Populariteit vs. Marge (interactive SVG)

   De populariteit kwam hier uit een stabiele hash van het gerecht-id: een
   getal tussen 20 en 100 dat niets met verkopen te maken had. Twee gerechten
   met dezelfde marge belandden in verschillende kwadranten omdat hun UUID
   anders spelde. Daardoor sprak deze pagina /marges tegen — die telt wél
   echt — en zei het bijschrift "populariteit is nu nog een schatting", wat
   een hash niet is.

   Nu komt `popularity` van de serverkant, geteld uit eventmenu's en
   offertes met countDishPopularity: dezelfde bron als /marges.

   De kwadrantgrens ligt op de mediaan van je eigen gerechten, niet op een
   vaste 50/65. Dat is de standaard-BCG-methode (Pavesic) en het is de enige
   grens die betekenis heeft zolang de aantallen klein zijn: bij hoogstens
   een paar offertes per gerecht zou "meer dan 50 keer verkocht" nooit
   voorkomen en was alles een hond.
   ═══════════════════════════════════════════════════════════════ */

'use client';

import { useMemo, useState } from 'react';
import type { Gerecht } from '@/types';
import { fmtEuro, getMargin } from '@/components/menu/helpers';
import { formatPercent } from '@/lib/format';

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
    { id: 'stars',  label: 'Sterren',      emoji: '⭐', bg: 'rgba(34,197,94,.04)', border: 'rgba(34,197,94,.15)', color: '#22c55e' },
    { id: 'puzzle', label: 'Puzzels',      emoji: '🧩', bg: 'rgba(255,191,0,.04)', border: 'rgba(255,191,0,.15)', color: '#FFBF00' },
    { id: 'plow',   label: 'Ploegpaarden', emoji: '🐴', bg: 'rgba(59,130,246,.04)', border: 'rgba(59,130,246,.15)', color: '#3b82f6' },
    { id: 'dogs',   label: 'Honden',       emoji: '🐕', bg: 'rgba(239,68,68,.04)',  border: 'rgba(239,68,68,.15)', color: '#ef4444' },
];

function mediaan(arr: number[]): number {
    if (arr.length === 0) return 0;
    const g = arr.slice().sort((a, b) => a - b);
    const m = Math.floor(g.length / 2);
    return g.length % 2 !== 0 ? g[m] : (g[m - 1] + g[m]) / 2;
}

function getQuadrant(popularity: number, margin: number, grensPop: number, grensMarge: number): Quadrant {
    const highPop = popularity >= grensPop;
    const highMargin = margin >= grensMarge;
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

    const { enriched, grensPop, grensMarge, maxPop, heeftEchteData, zonderKostprijs } = useMemo(() => {
        const alles = gerechten.map((g) => ({
            ...g,
            pop: popularity?.[String(g.id)] ?? 0,
            margin: getMargin(g),
        }));
        /* Een gerecht zonder kostprijs krijgt marge 0. Namen we die mee, dan
           zakte de mediaan naar 0 en gold "marge >= 0" voor iedereen: alles
           werd een ster, ook wat we niet kunnen beoordelen. De gedeelde
           bibliotheek slaat ze daarom over; hier ook, met de telling erbij. */
        const basis = alles.filter((d) => d.margin > 0);
        const gPop = mediaan(basis.map((d) => d.pop));
        const gMarge = mediaan(basis.map((d) => d.margin));
        return {
            enriched: basis.map((d) => ({ ...d, quadrant: getQuadrant(d.pop, d.margin, gPop, gMarge) })),
            grensPop: gPop,
            grensMarge: gMarge,
            maxPop: Math.max(1, ...basis.map((d) => d.pop)),
            heeftEchteData: !!popularity && basis.some((d) => d.pop > 0),
            zonderKostprijs: alles.length - basis.length,
        };
    }, [gerechten, popularity]);

    const qCounts: Record<Quadrant, number> = { stars: 0, puzzle: 0, plow: 0, dogs: 0 };
    enriched.forEach((d) => { qCounts[d.quadrant]++; });

    /* Schaalt op je hoogste telling; met vaste 100 zouden een paar
       offertes allemaal tegen de linkerrand kleven. */
    const dotX = (pop: number) => PAD + (pop / maxPop) * innerW;
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
                                    <text x={dotX(d.pop)} y={dotY(d.margin) - 16} textAnchor="middle" fill="var(--muted)" fontSize={10}>{formatPercent(d.margin, 0)} · {fmtEuro(Number(d.verkoopprijs ?? d.prijs ?? 0))} · {d.pop}×</text>
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

            {/* Zeg waar de assen op staan; anders is een kwadrant een mening. */}
            <div style={{ marginTop: 14, fontSize: 11, color: 'var(--muted)', lineHeight: 1.55 }}>
                {enriched.length === 0 ? (
                    'Nog geen gerecht met een kostprijs, dus er is niets te vergelijken. Koppel componenten aan je gerechten of vul een kostprijs in.'
                ) : (
                    <>
                        {heeftEchteData
                            ? `Populariteit = hoe vaak een gerecht op een eventmenu of offerte staat. De grens tussen populair en niet ligt op de mediaan van je eigen gerechten (${grensPop}×), die tussen hoge en lage marge op ${formatPercent(grensMarge, 0)}.`
                            : `Nog geen gerecht op een eventmenu of offerte, dus de populariteit staat overal op nul. De margegrens ligt op de mediaan (${formatPercent(grensMarge, 0)}).`}
                        {zonderKostprijs > 0 && (
                            <> {zonderKostprijs} van de {enriched.length + zonderKostprijs} gerechten {zonderKostprijs === 1 ? 'staat' : 'staan'} hier niet in: daarvan is de kostprijs nog onbekend.</>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
