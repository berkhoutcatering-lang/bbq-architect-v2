'use client';

import { Package, Thermometer, Flame, UtensilsCrossed, RefreshCw, type LucideIcon } from 'lucide-react';

import styles from '../haccp.module.css';
import { CHECK_TYPES, type HaccpCheck, type HaccpCheckType, type HaccpDish } from '../_data';

const CHECK_ICONS: Record<HaccpCheckType, LucideIcon> = {
    ontvangst: Package,
    bewaring: Thermometer,
    kern: Flame,
    uitgifte: UtensilsCrossed,
    regenereren: RefreshCw,
};

interface Props {
    checks: HaccpCheck[];
    dishes: HaccpDish[];
    servingH?: number;
}

export default function ResourceTimeline({ checks, dishes, servingH = 17 }: Props) {
    const enabled = checks.filter((c) => c.enabled !== false);
    const allH = enabled.map((c) => c.hour).concat([servingH]);
    if (allH.length === 0) allH.push(servingH);

    const minH = Math.max(0, Math.floor(Math.min(...allH)) - 1);
    const maxH = Math.min(24, Math.ceil(Math.max(...allH)) + 1);
    const START = minH;
    const END = maxH;
    const SPAN = END - START || 1;
    const pct = (h: number) => Math.max(0, Math.min(100, ((h - START) / SPAN) * 100));

    const hours: number[] = [];
    const step = SPAN > 12 ? 2 : 1;
    for (let h = START; h <= END; h += step) hours.push(h);

    const rows = dishes.map((d) => ({
        dish: d,
        checks: enabled.filter((c) => c.dishIds.includes(d.id)),
    }));

    return (
        <div className={styles.tlWrap}>
            <div className={styles.tlHead}>
                <div className={styles.tlLblCol} />
                <div className={styles.tlAxis}>
                    {hours.map((h) => (
                        <div
                            key={h}
                            className={styles.tlHourMark}
                            style={{ left: `${pct(h)}%` }}
                        >
                            {String(h).padStart(2, '0')}:00
                        </div>
                    ))}
                </div>
            </div>
            <div className={styles.tlBody}>
                {rows.map(({ dish, checks: dChecks }) => (
                    <div key={dish.id} className={styles.tlRow}>
                        <div className={styles.tlLblCol}>
                            <div style={{ fontSize: 12, fontWeight: 600 }}>{dish.name}</div>
                            <div
                                style={{
                                    fontSize: 9,
                                    color: 'var(--muted)',
                                    marginTop: 1,
                                }}
                            >
                                {dish.sub}
                            </div>
                        </div>
                        <div className={styles.tlTrack}>
                            {hours.map((h) => (
                                <div
                                    key={h}
                                    className={styles.tlGridLine}
                                    style={{ left: `${pct(h)}%` }}
                                />
                            ))}
                            <div
                                className={styles.tlPrep}
                                style={{
                                    left: `${pct(dish.prepStart)}%`,
                                    width: `${(dish.cookH / SPAN) * 100}%`,
                                    background:
                                        CHECK_TYPES[dChecks[0]?.type]?.color ?? 'var(--muted)',
                                }}
                            />
                            <div
                                className={styles.tlServeMark}
                                style={{ left: `${pct(servingH)}%` }}
                            />
                            {dChecks.map((c) => {
                                const ct = CHECK_TYPES[c.type];
                                const Icon = CHECK_ICONS[c.type];
                                return (
                                    <div
                                        key={c.id}
                                        className={styles.tlDot}
                                        style={{ left: `${pct(c.hour)}%`, background: ct.color }}
                                        title={`${c.label}\n${c.time} · ${c.target}`}
                                    >
                                        <Icon size={9} color="#fff" />
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>
            <div className={styles.tlLegend}>
                {Object.entries(CHECK_TYPES).map(([k, v]) => (
                    <span key={k} className={styles.tlLegendItem}>
                        <span
                            className={styles.tlLegendDot}
                            style={{ background: v.color }}
                        />
                        {v.label}
                    </span>
                ))}
                <span className={styles.tlLegendItem}>
                    <span
                        className={styles.tlLegendDot}
                        style={{
                            background: 'var(--brand)',
                            width: 2,
                            borderRadius: 0,
                        }}
                    />
                    Serveren
                </span>
            </div>
        </div>
    );
}
