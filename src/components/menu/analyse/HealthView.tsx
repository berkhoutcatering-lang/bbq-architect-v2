/* ═══════════════════════════════════════════════════════════════
   Health View — KPI strip + verdeling + completeness
   TSX port van MRHealthView. Werkt op echte Gerecht[] uit Supabase.
   ═══════════════════════════════════════════════════════════════ */

'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, ChefHat, UtensilsCrossed } from 'lucide-react';
import type { Gerecht } from '@/types';
import { MREyebrow } from '@/components/menu/atoms';
import { getMargin } from '@/components/menu/helpers';

interface Props {
    gerechten: Gerecht[];
    componentCount?: number;
}

/* ── Donut chart (SVG) ────────────────────────────────────── */
interface DonutSeg { label: string; value: number; color: string; }

function MRDonut({ data, size = 160 }: { data: DonutSeg[]; size?: number }) {
    const [hovered, setHovered] = useState<number | null>(null);
    const r = size / 2 - 16;
    const cx = size / 2;
    const cy = size / 2;
    const total = data.reduce((s, d) => s + d.value, 0) || 1;

    /* Pre-compute slices via reduce zodat we niet tijdens render
       een mutable counter bijhouden (react-hooks/immutability). */
    const slices = data.reduce<Array<DonutSeg & { startAngle: number; sweep: number }>>((acc, d) => {
        const prev = acc[acc.length - 1];
        const startAngle = prev ? prev.startAngle + prev.sweep : -90;
        const sweep = (d.value / total) * 360;
        acc.push({ ...d, startAngle, sweep });
        return acc;
    }, []);

    return (
        <svg width={size} height={size}>
            {slices.map((s, i) => {
                const { startAngle, sweep } = s;
                const pct = s.value / total;
                const start = {
                    x: cx + r * Math.cos((startAngle * Math.PI) / 180),
                    y: cy + r * Math.sin((startAngle * Math.PI) / 180),
                };
                const end = {
                    x: cx + r * Math.cos(((startAngle + sweep) * Math.PI) / 180),
                    y: cy + r * Math.sin(((startAngle + sweep) * Math.PI) / 180),
                };
                const large = sweep > 180 ? 1 : 0;
                const path = `M ${cx} ${cy} L ${start.x} ${start.y} A ${r} ${r} 0 ${large} 1 ${end.x} ${end.y} Z`;
                return (
                    <path
                        key={i}
                        d={path}
                        fill={s.color}
                        opacity={hovered === i ? 1 : 0.8}
                        stroke="var(--bg)"
                        strokeWidth={2}
                        onMouseEnter={() => setHovered(i)}
                        onMouseLeave={() => setHovered(null)}
                        style={{ cursor: 'pointer', transition: 'opacity .15s' }}
                    >
                        <title>{s.label}: {s.value} ({Math.round(pct * 100)}%)</title>
                    </path>
                );
            })}
            <circle cx={cx} cy={cy} r={r * 0.55} fill="var(--bg)" />
            <text x={cx} y={cy - 4} textAnchor="middle" fill="var(--text)" fontSize={20} fontWeight={600} fontFamily="var(--font-display)">{total}</text>
            <text x={cx} y={cy + 12} textAnchor="middle" fill="var(--muted)" fontSize={10}>totaal</text>
        </svg>
    );
}

/* ── Horizontal bar chart ─────────────────────────────────── */
interface BarItem { label: string; value: number; color?: string; }

function MRBarChart({ items, maxVal }: { items: BarItem[]; maxVal: number }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {items.map((it, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{
                        width: 140, fontSize: 12, color: 'var(--muted)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'right',
                    }}>{it.label}</span>
                    <div style={{ flex: 1, height: 20, background: 'rgba(255,255,255,.04)', borderRadius: 4, overflow: 'hidden' }}>
                        <div style={{
                            height: '100%',
                            width: `${maxVal > 0 ? (it.value / maxVal) * 100 : 0}%`,
                            background: it.color || 'var(--brand-gold, #c4a35a)',
                            borderRadius: 4, transition: 'width .3s',
                            display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 6,
                        }}>
                            <span style={{ fontSize: 10, fontWeight: 600, color: '#000' }}>{it.value}</span>
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
}

/* ── Health View (main) ───────────────────────────────────── */
export function HealthView({ gerechten, componentCount = 0 }: Props) {
    const stats = useMemo(() => {
        const allergenCount: Record<string, number> = {};
        let totalKostprijs = 0;
        let totalVerkoopprijs = 0;
        let withFoto = 0;
        let withBeschrijving = 0;
        let withAllergens = 0;
        let withIngredienten = 0;

        gerechten.forEach((g) => {
            (g.allergenen ?? []).forEach((a) => { allergenCount[a] = (allergenCount[a] ?? 0) + 1; });
            totalKostprijs += Number(g.kostprijs_pp ?? 0);
            totalVerkoopprijs += Number(g.verkoopprijs ?? g.prijs ?? 0);
            if (g.foto_url) withFoto++;
            if (g.beschrijving && g.beschrijving.trim().length > 0) withBeschrijving++;
            if ((g.allergenen?.length ?? 0) > 0) withAllergens++;
            if ((g.ingredienten?.length ?? 0) > 0) withIngredienten++;
        });

        const margins = gerechten.map(getMargin);
        const buckets = {
            lt50:    margins.filter((m) => m < 50).length,
            r50_65:  margins.filter((m) => m >= 50 && m < 65).length,
            r65_75:  margins.filter((m) => m >= 65 && m < 75).length,
            r75_85:  margins.filter((m) => m >= 75 && m < 85).length,
            gte85:   margins.filter((m) => m >= 85).length,
        };

        return {
            allergenCount,
            avgMargin: gerechten.length > 0 ? Math.round(margins.reduce((s, m) => s + m, 0) / gerechten.length) : 0,
            buckets,
            completeness: {
                foto:          gerechten.length > 0 ? Math.round((withFoto / gerechten.length) * 100) : 0,
                beschrijving:  gerechten.length > 0 ? Math.round((withBeschrijving / gerechten.length) * 100) : 0,
                ingredienten:  gerechten.length > 0 ? Math.round((withIngredienten / gerechten.length) * 100) : 0,
                allergens:     gerechten.length > 0 ? Math.round((withAllergens / gerechten.length) * 100) : 0,
            },
        };
    }, [gerechten]);

    const allergenDonut: DonutSeg[] = Object.entries(stats.allergenCount).map(([k, v], i) => ({
        label: k, value: v,
        color: ['#fbbf24', '#f87171', '#60a5fa', '#a78bfa', '#4ade80', '#f472b6', '#fb923c', '#38bdf8'][i % 8],
    }));

    const bucketBars: BarItem[] = [
        { label: '< 50%',   value: stats.buckets.lt50,   color: '#ef4444' },
        { label: '50-65%',  value: stats.buckets.r50_65, color: '#f59e0b' },
        { label: '65-75%',  value: stats.buckets.r65_75, color: '#FFBF00' },
        { label: '75-85%',  value: stats.buckets.r75_85, color: '#22c55e' },
        { label: '> 85%',   value: stats.buckets.gte85,  color: '#10b981' },
    ];
    const bucketMax = Math.max(...bucketBars.map((b) => b.value), 1);

    const completenessRows = [
        { label: 'Foto toegevoegd',         pct: stats.completeness.foto },
        { label: 'Beschrijving ingevuld',   pct: stats.completeness.beschrijving },
        { label: 'Ingrediënten gekoppeld',  pct: stats.completeness.ingredienten },
        { label: 'Allergenen bevestigd',    pct: stats.completeness.allergens },
    ];

    const kpiTiles = [
        { label: 'Gerechten', value: gerechten.length, Icon: ChefHat, color: 'var(--brand)' },
        { label: 'Componenten', value: componentCount, Icon: UtensilsCrossed, color: 'var(--brand-gold, #c4a35a)' },
        { label: 'Unieke allergenen', value: Object.keys(stats.allergenCount).length, Icon: AlertTriangle, color: 'var(--amber, #f59e0b)' },
    ];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* KPI strip */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
                {kpiTiles.map((k, i) => {
                    const I = k.Icon;
                    return (
                        <div key={i} className="mr-kpi-card">
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                <MREyebrow>{k.label}</MREyebrow>
                                <I size={14} color={k.color} />
                            </div>
                            <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>{k.value}</div>
                        </div>
                    );
                })}
            </div>

            {/* Two-column: marge-verdeling + allergen donut */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div className="mr-analyse-card">
                    <MREyebrow style={{ marginBottom: 14 }}>Marge-verdeling</MREyebrow>
                    <MRBarChart items={bucketBars} maxVal={bucketMax} />
                    <div style={{ marginTop: 12, fontSize: 11, color: 'var(--muted)' }}>
                        Gemiddelde marge: <strong style={{ color: 'var(--text)' }}>{stats.avgMargin}%</strong>
                    </div>
                </div>

                <div className="mr-analyse-card">
                    <MREyebrow style={{ marginBottom: 14 }}>Allergenen overzicht</MREyebrow>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                        <MRDonut
                            data={allergenDonut.length > 0 ? allergenDonut : [{ label: 'Geen', value: 1, color: 'var(--muted)' }]}
                            size={140}
                        />
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {allergenDonut.slice(0, 6).map((a, i) => (
                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5 }}>
                                    <span style={{ width: 8, height: 8, borderRadius: 2, background: a.color, flexShrink: 0 }} />
                                    <span style={{ color: 'var(--muted)' }}>{a.label}</span>
                                    <span style={{ fontWeight: 600, marginLeft: 'auto' }}>{a.value}</span>
                                </div>
                            ))}
                            {allergenDonut.length === 0 && (
                                <span style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic' }}>Geen allergenen geregistreerd</span>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Recipe completeness */}
            <div className="mr-analyse-card">
                <MREyebrow style={{ marginBottom: 14 }}>Recipe completeness</MREyebrow>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {completenessRows.map((c, i) => {
                        const color = c.pct >= 75 ? 'var(--green, #22c55e)' : c.pct >= 50 ? 'var(--amber, #f59e0b)' : 'var(--red, #ef4444)';
                        return (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                <span style={{ width: 180, fontSize: 12, color: 'var(--muted)' }}>{c.label}</span>
                                <div style={{ flex: 1, height: 8, background: 'rgba(255,255,255,.04)', borderRadius: 4, overflow: 'hidden' }}>
                                    <div style={{ height: '100%', width: `${c.pct}%`, background: color, borderRadius: 4, transition: 'width .4s' }} />
                                </div>
                                <span style={{ fontSize: 12, fontWeight: 600, fontVariantNumeric: 'tabular-nums', width: 40, textAlign: 'right', color }}>{c.pct}%</span>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
