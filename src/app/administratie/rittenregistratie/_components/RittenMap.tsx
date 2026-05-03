'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

/* Bbox: lng 5.8 → 7.4 (west-oost), lat 52.20 → 53.40 (zuid-noord) */
const BBOX = { lngMin: 5.8, lngMax: 7.4, latMin: 52.2, latMax: 53.4 };

export type LatLng = readonly [number, number]; // [lat, lng]

interface ProjectedPoint {
  x: number;
  y: number;
}

const project = (coord: LatLng, w: number, h: number, pad = 40): ProjectedPoint => {
  const [lat, lng] = coord;
  const x = pad + ((lng - BBOX.lngMin) / (BBOX.lngMax - BBOX.lngMin)) * (w - pad * 2);
  const y = pad + ((BBOX.latMax - lat) / (BBOX.latMax - BBOX.latMin)) * (h - pad * 2);
  return { x, y };
};

const STEDEN: ReadonlyArray<{ naam: string; coord: LatLng; hub?: boolean }> = [
  { naam: 'Borger', coord: [52.917, 6.799], hub: true },
  { naam: 'Emmen', coord: [52.785, 6.897] },
  { naam: 'Assen', coord: [52.995, 6.564] },
  { naam: 'Groningen', coord: [53.222, 6.566] },
  { naam: 'Hoogeveen', coord: [52.722, 6.48] },
  { naam: 'Westerbork', coord: [52.851, 6.609] },
  { naam: 'Markelo', coord: [52.25, 6.48] },
  { naam: 'Borne', coord: [52.299, 6.745] },
  { naam: 'Delden', coord: [52.27, 6.73] },
  { naam: 'Denekamp', coord: [52.378, 6.971] },
  { naam: 'Odoorn', coord: [52.852, 6.87] },
  { naam: 'Meppel', coord: [52.696, 6.193] },
];

const curvedPath = (a: ProjectedPoint, b: ProjectedPoint, curvature = 0.18): string => {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const cx = mx - dy * curvature;
  const cy = my + dx * curvature;
  return `M ${a.x},${a.y} Q ${cx},${cy} ${b.x},${b.y}`;
};

/* ── Background grid + topo ─────────── */
function TopoLayer({ w, h }: { w: number; h: number }) {
  const lines: React.ReactElement[] = [];
  for (let i = 0; i < 8; i++) {
    const y = (h / 8) * i + Math.sin(i * 1.3) * 6;
    lines.push(
      <path
        key={'h' + i}
        d={`M 0 ${y} Q ${w / 2} ${y + Math.sin(i) * 14} ${w} ${y - Math.cos(i) * 8}`}
        stroke="rgba(196,163,90,0.04)"
        strokeWidth="1"
        fill="none"
      />,
    );
  }
  const dots: React.ReactElement[] = [];
  for (let x = 0; x < w; x += 28) {
    for (let y = 0; y < h; y += 28) {
      dots.push(<circle key={x + '-' + y} cx={x} cy={y} r="0.6" fill="rgba(196,163,90,0.08)" />);
    }
  }
  return (
    <g>
      {lines}
      {dots}
    </g>
  );
}

/* ── Compass rose ──────── */
function Compass({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <circle r="22" fill="rgba(18,18,21,0.85)" stroke="rgba(196,163,90,0.4)" strokeWidth="1" />
      <path d="M 0 -16 L 4 0 L 0 4 L -4 0 Z" fill="#FFBF00" />
      <path d="M 0 16 L 4 0 L 0 -4 L -4 0 Z" fill="rgba(196,163,90,0.5)" />
      <text y="-26" textAnchor="middle" fontSize="9" fill="#FFBF00" fontWeight="700">
        N
      </text>
    </g>
  );
}

function ScaleBar({ x, y, w }: { x: number; y: number; w: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <line x1="0" y1="0" x2={w} y2="0" stroke="rgba(196,163,90,0.5)" strokeWidth="1.5" />
      <line x1="0" y1="-4" x2="0" y2="4" stroke="rgba(196,163,90,0.5)" strokeWidth="1.5" />
      <line x1={w} y1="-4" x2={w} y2="4" stroke="rgba(196,163,90,0.5)" strokeWidth="1.5" />
      <line x1={w / 2} y1="-3" x2={w / 2} y2="3" stroke="rgba(196,163,90,0.5)" strokeWidth="1" />
      <text x={w / 2} y="-8" textAnchor="middle" fontSize="9" fill="var(--muted)">
        ~ 20 km
      </text>
    </g>
  );
}

export interface MapRoute {
  id: string;
  from: LatLng;
  to: LatLng;
  color?: string;
  curvature?: number;
  dashed?: boolean;
}

export interface MapMarker {
  coord: LatLng;
  kind?: 'home' | 'stop';
  color?: string;
  label?: string;
}

interface RittenMapProps {
  routes?: MapRoute[];
  markers?: MapMarker[];
  activeRouteId?: string | null;
  height?: number;
  onMarkerClick?: (marker: MapMarker) => void;
  onRouteClick?: (id: string) => void;
}

export default function RittenMap({
  routes = [],
  markers = [],
  activeRouteId,
  height = 460,
  onMarkerClick,
  onRouteClick,
}: RittenMapProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: height });

  useEffect(() => {
    const update = () => {
      if (!wrapRef.current) return;
      const r = wrapRef.current.getBoundingClientRect();
      setSize({ w: Math.max(320, r.width), h: height });
    };
    update();
    const obs = new ResizeObserver(update);
    if (wrapRef.current) obs.observe(wrapRef.current);
    return () => obs.disconnect();
  }, [height]);

  const { w, h } = size;
  const stedenMarkers = useMemo(
    () => STEDEN.map((s) => ({ ...s, p: project(s.coord, w, h) })),
    [w, h],
  );

  const routePaths = useMemo(
    () =>
      routes.map((r) => ({
        id: r.id,
        d: curvedPath(project(r.from, w, h), project(r.to, w, h), r.curvature ?? 0.18),
        color: r.color || '#FFBF00',
        dashed: r.dashed,
      })),
    [routes, w, h],
  );

  return (
    <div
      ref={wrapRef}
      style={{
        position: 'relative',
        width: '100%',
        height,
        borderRadius: 14,
        overflow: 'hidden',
        background: 'radial-gradient(ellipse at 30% 20%, #1a1a1f 0%, #0e0e10 50%, #0a0a0c 100%)',
        border: '1px solid var(--border)',
        boxShadow: 'inset 0 1px 0 rgba(196,163,90,0.08), 0 8px 32px rgba(0,0,0,0.4)',
      }}
    >
      <svg width={w} height={h} style={{ display: 'block' }} aria-label="Rittenkaart Drenthe en omstreken">
        <defs>
          <radialGradient id="markerGlow">
            <stop offset="0%" stopColor="#FFBF00" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#FFBF00" stopOpacity="0" />
          </radialGradient>
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <TopoLayer w={w} h={h} />

        {stedenMarkers.map((s, i) => (
          <g key={i}>
            <circle
              cx={s.p.x}
              cy={s.p.y}
              r={s.hub ? 3 : 1.8}
              fill={s.hub ? '#FFBF00' : 'rgba(196,163,90,0.5)'}
              stroke={s.hub ? 'rgba(255,191,0,0.3)' : 'none'}
              strokeWidth="6"
              opacity={s.hub ? 1 : 0.6}
            />
            <text
              x={s.p.x + 7}
              y={s.p.y + 3}
              fontSize={s.hub ? 11 : 9.5}
              fontWeight={s.hub ? 600 : 400}
              fill={s.hub ? '#FFBF00' : 'rgba(196,163,90,0.55)'}
              letterSpacing={s.hub ? '0.05em' : '0.02em'}
            >
              {s.naam}
            </text>
          </g>
        ))}

        {routePaths.map((r) => {
          const isActive = activeRouteId === r.id;
          return (
            <g
              key={r.id}
              opacity={activeRouteId && !isActive ? 0.25 : 1}
              style={{ transition: 'opacity .3s', cursor: onRouteClick ? 'pointer' : 'default' }}
              onClick={() => onRouteClick?.(r.id)}
            >
              <path
                d={r.d}
                stroke={r.color}
                strokeWidth={isActive ? 8 : 5}
                fill="none"
                opacity="0.18"
                filter="url(#glow)"
              />
              <path
                d={r.d}
                stroke={r.color}
                strokeWidth={isActive ? 2.5 : 1.6}
                fill="none"
                strokeLinecap="round"
                strokeDasharray={r.dashed ? '4 4' : 'none'}
              />
              {isActive && (
                <path
                  d={r.d}
                  stroke="#fff"
                  strokeWidth="1.8"
                  fill="none"
                  strokeLinecap="round"
                  strokeDasharray="3 14"
                  className="ritten-map-dashflow"
                />
              )}
            </g>
          );
        })}

        {markers.map((m, i) => {
          const p = project(m.coord, w, h);
          const c = m.color || '#FFBF00';
          const r = m.kind === 'home' ? 8 : 6;
          return (
            <g
              key={i}
              style={{ cursor: onMarkerClick ? 'pointer' : 'default' }}
              onClick={() => onMarkerClick?.(m)}
            >
              <circle cx={p.x} cy={p.y} r={r * 3} fill="url(#markerGlow)" />
              <circle cx={p.x} cy={p.y} r={r} fill={c} stroke="#0a0a0c" strokeWidth="2" />
              {m.kind === 'home' && <circle cx={p.x} cy={p.y} r={r - 3} fill="#0a0a0c" />}
              {m.label && (
                <g>
                  <rect
                    x={p.x + 12}
                    y={p.y - 10}
                    width={m.label.length * 6.2 + 12}
                    height="20"
                    rx="4"
                    fill="rgba(18,18,21,0.92)"
                    stroke="rgba(196,163,90,0.3)"
                    strokeWidth="1"
                  />
                  <text x={p.x + 18} y={p.y + 3} fontSize="10.5" fill={c} fontWeight="600">
                    {m.label}
                  </text>
                </g>
              )}
            </g>
          );
        })}

        <Compass x={w - 36} y={36} />
        <ScaleBar x={20} y={h - 24} w={70} />
      </svg>

      <div
        style={{
          position: 'absolute',
          top: 14,
          left: 16,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '5px 11px',
          background: 'rgba(18,18,21,0.85)',
          backdropFilter: 'blur(6px)',
          border: '1px solid rgba(196,163,90,0.3)',
          borderRadius: 999,
          fontSize: 10,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          fontWeight: 700,
          color: 'var(--brand)',
        }}
      >
        <span className="ritten-map-ping" />
        Live · Drenthe & omstreken
      </div>

      <style jsx global>{`
        @keyframes ritten-map-dashflow {
          to {
            stroke-dashoffset: -34;
          }
        }
        @keyframes ritten-map-ping {
          0%,
          100% {
            opacity: 1;
          }
          50% {
            opacity: 0.4;
          }
        }
        .ritten-map-dashflow {
          animation: ritten-map-dashflow 1.6s linear infinite;
        }
        .ritten-map-ping {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #ffbf00;
          box-shadow: 0 0 8px #ffbf00;
          animation: ritten-map-ping 2s ease infinite;
          display: inline-block;
        }
      `}</style>
    </div>
  );
}

export { project, BBOX, STEDEN };
