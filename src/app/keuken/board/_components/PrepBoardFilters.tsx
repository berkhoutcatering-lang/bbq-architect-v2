'use client';

import { User, Calendar, Filter } from 'lucide-react';
import type { KitchenStation } from '@/types/database.types';

export type DateFilter = 'today' | 'tomorrow' | 'next48h' | 'week' | 'alles';

interface Props {
    dateFilter: DateFilter;
    onDateFilterChange: (f: DateFilter) => void;
    onlyMine: boolean;
    onToggleMine: () => void;
    selectedStationIds: number[];
    onToggleStation: (id: number) => void;
    stations: KitchenStation[];
    /** Total tasks before filter — voor "X verborgen" hint */
    totalCount: number;
    /** Tasks after filter */
    visibleCount: number;
}

const DATE_LABELS: Record<DateFilter, string> = {
    today: 'Vandaag',
    tomorrow: 'Morgen',
    next48h: 'Komende 48u',
    week: 'Deze week',
    alles: 'Alles',
};

/**
 * Filter pill-bar onder topstrip. "Glass filter pill bar" pattern (memory).
 * Sticky, scrollable horizontaal op kleine schermen.
 *
 * Pillar #2 (multi-event): station-filters voor aggregated view.
 * Pillar #3 (gloved-hand): 56pt pill tap-targets.
 */
export default function PrepBoardFilters({
    dateFilter, onDateFilterChange,
    onlyMine, onToggleMine,
    selectedStationIds, onToggleStation,
    stations, totalCount, visibleCount,
}: Props) {
    const hiddenCount = Math.max(0, totalCount - visibleCount);

    return (
        <div className="prep-filters">
            <div className="prep-filters__scroll">
                {/* Date filters */}
                {(Object.keys(DATE_LABELS) as DateFilter[]).map((key) => (
                    <button
                        key={key}
                        className={`prep-pill ${dateFilter === key ? 'is-active' : ''}`}
                        onClick={() => onDateFilterChange(key)}
                    >
                        <Calendar size={14} />
                        <span>{DATE_LABELS[key]}</span>
                    </button>
                ))}

                <span className="prep-filters__divider" aria-hidden />

                {/* Mine toggle */}
                <button
                    className={`prep-pill ${onlyMine ? 'is-active' : ''}`}
                    onClick={onToggleMine}
                    aria-pressed={onlyMine}
                >
                    <User size={14} />
                    <span>Mijn taken</span>
                </button>

                <span className="prep-filters__divider" aria-hidden />

                {/* Station filters */}
                {stations.map((s) => {
                    const active = selectedStationIds.includes(s.id);
                    return (
                        <button
                            key={s.id}
                            className={`prep-pill prep-pill--station ${active ? 'is-active' : ''}`}
                            onClick={() => onToggleStation(s.id)}
                            aria-pressed={active}
                            style={active ? { borderColor: s.color, background: `${s.color}22` } : undefined}
                        >
                            <span
                                className="prep-pill__station-dot"
                                style={{ background: s.color }}
                                aria-hidden
                            />
                            <span>{s.name}</span>
                        </button>
                    );
                })}
            </div>
            {hiddenCount > 0 && (
                <span className="prep-filters__hidden" aria-live="polite">
                    <Filter size={12} />
                    {hiddenCount} verborgen
                </span>
            )}
        </div>
    );
}
