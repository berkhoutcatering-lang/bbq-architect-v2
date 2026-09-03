'use client';

/**
 * PriceTrendSparkline — Pillar #1
 *
 * Lichte sparkline (80px hoog) op kostprijs-trend van een gerecht.
 * Data komt uit recipe_cost_snapshots via RPC get_latest_gerecht_cost_delta.
 */

import { useMemo } from 'react';
import { LineChart, Line, ResponsiveContainer, Tooltip, YAxis } from 'recharts';

import { formatEur } from '@/lib/format';

export interface SparkPoint {
    day: string;          // ISO date (YYYY-MM-DD)
    kost_cents: number;
}

interface Props {
    data: SparkPoint[];
    height?: number;
    accentColor?: string;
}

export default function PriceTrendSparkline({ data, height = 80, accentColor }: Props) {
    const points = useMemo(() => data ?? [], [data]);

    if (points.length < 2) {
        return (
            <div
                style={{
                    height,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--color-text-muted, #94a3b8)',
                    fontSize: 12,
                }}
            >
                Nog geen prijs-historie
            </div>
        );
    }

    const color = accentColor ?? 'var(--color-accent-gold, #d97706)';

    return (
        <div style={{ width: '100%', height }}>
            <ResponsiveContainer>
                <LineChart data={points} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                    <YAxis hide domain={['dataMin', 'dataMax']} />
                    <Tooltip
                        formatter={(value: number) => [
                            `${formatEur((value / 100))}`,
                            'Kostprijs',
                        ]}
                        labelFormatter={(label: string) =>
                            new Date(label).toLocaleDateString('nl-NL', {
                                day: '2-digit',
                                month: 'short',
                            })
                        }
                        contentStyle={{
                            background: 'var(--color-bg-secondary, #1f2937)',
                            border: '1px solid var(--color-border, #374151)',
                            borderRadius: 6,
                            padding: '4px 8px',
                            fontSize: 12,
                        }}
                    />
                    <Line
                        type="monotone"
                        dataKey="kost_cents"
                        stroke={color}
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 3 }}
                        isAnimationActive={false}
                    />
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
}
