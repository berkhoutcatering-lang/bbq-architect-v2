import Link from 'next/link';
import {
    UtensilsCrossed, Boxes, Package, TrendingUp, Minus,
    type LucideIcon,
} from 'lucide-react';
import Sparkline from './Sparkline';
import type { LibraryStat } from '../../_lib/health/types';

const ICONS: Record<string, LucideIcon> = {
    'utensils-crossed': UtensilsCrossed,
    boxes: Boxes,
    package: Package,
};

interface Props {
    stat: LibraryStat;
    sparkData: number[];
}

/* KPI-tile per library-categorie: groot getal + sparkline + 30d-delta.
   Klikbaar → linkt naar de bron-pagina van die categorie. */
export default function InsightKpiTile({ stat, sparkData }: Props) {
    const Icon = ICONS[stat.icon] ?? Boxes;
    const growth = stat.total - stat.prev30d;
    const pct = stat.prev30d ? Math.round((growth / stat.prev30d) * 100) : 0;
    const isUp = growth > 0;
    const deltaColor = isUp ? 'var(--green)' : 'var(--muted)';

    return (
        <Link href={stat.href} style={{ textDecoration: 'none', color: 'inherit' }}>
            <div className="metal clickable">
                <div className="metal-body" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                            <div style={{
                                width: 30, height: 30, borderRadius: 8,
                                background: 'rgba(196,163,90,.10)',
                                border: '1px solid rgba(196,163,90,.25)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                                <Icon size={15} color="var(--brand-gold)" />
                            </div>
                            <span className="eyebrow">{stat.label}</span>
                        </div>
                        <div className="metric" style={{ fontSize: 32, fontWeight: 700 }}>{stat.total}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                            {isUp
                                ? <TrendingUp size={12} color={deltaColor} />
                                : <Minus size={12} color={deltaColor} />}
                            <span style={{ fontSize: 11, color: deltaColor }}>
                                {isUp ? '+' : ''}{growth} ({pct}%) afgelopen 30d
                            </span>
                        </div>
                    </div>
                    <Sparkline data={sparkData} color={isUp ? 'var(--green)' : 'var(--muted)'} />
                </div>
            </div>
        </Link>
    );
}
