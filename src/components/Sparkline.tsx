'use client';

import React from 'react';

interface SparklineProps {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
  fillColor?: string;
  strokeWidth?: number;
}

/**
 * Lichte SVG-sparkline. Geen library, geen externe deps.
 * Rendert een line + optionele fill onder de lijn. Werkt met
 * 0 of meer datapoints; bij <2 punten of allemaal nul: rendert niets.
 */
export default function Sparkline({
  values,
  width = 80,
  height = 24,
  color = 'currentColor',
  fillColor,
  strokeWidth = 1.5,
}: SparklineProps): React.ReactElement | null {
  if (!values || values.length < 2) return null;

  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const step = width / (values.length - 1);

  const points = values.map((v, i) => {
    const x = i * step;
    const y = height - ((v - min) / range) * height;
    return [x, y];
  });

  const linePath = points.reduce((acc, [x, y], i) => {
    return acc + (i === 0 ? `M ${x.toFixed(1)} ${y.toFixed(1)}` : ` L ${x.toFixed(1)} ${y.toFixed(1)}`);
  }, '');

  const areaPath = fillColor
    ? `${linePath} L ${width.toFixed(1)} ${height.toFixed(1)} L 0 ${height.toFixed(1)} Z`
    : null;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ display: 'block', overflow: 'visible' }}
      aria-hidden="true"
    >
      {areaPath && <path d={areaPath} fill={fillColor} stroke="none" opacity={0.25} />}
      <path
        d={linePath}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
