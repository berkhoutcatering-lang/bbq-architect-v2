/* Tiny line chart — 5 data points wordt een gestyleerde polyline + eind-dot.
   Pure SVG, geen client-state nodig dus server-renderable. */

interface SparklineProps {
    data: number[];
    width?: number;
    height?: number;
    color?: string;
}

export default function Sparkline({ data, width = 64, height = 24, color = 'var(--brand-gold)' }: SparklineProps) {
    if (!data || data.length < 2) return null;
    const max = Math.max(...data);
    const min = Math.min(...data);
    const range = max - min || 1;
    const pad = 2;
    const step = (width - pad * 2) / (data.length - 1);
    const points = data.map((v, i) => {
        const x = pad + i * step;
        const y = height - pad - ((v - min) / range) * (height - pad * 2);
        return `${x},${y}`;
    }).join(' ');
    const lastX = pad + (data.length - 1) * step;
    const lastY = height - pad - ((data[data.length - 1] - min) / range) * (height - pad * 2);
    return (
        <svg width={width} height={height} style={{ display: 'block', flexShrink: 0 }} aria-hidden>
            <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.7" />
            <circle cx={lastX} cy={lastY} r="2.5" fill={color} />
        </svg>
    );
}
