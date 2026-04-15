// Generates CSS background for a visual grid overlay on the canvas
export function gridBackground(gridMm: number, mmToPx: number): React.CSSProperties | undefined {
  if (!gridMm) return undefined;
  const px = gridMm * mmToPx;
  return {
    backgroundImage:
      'linear-gradient(to right, rgba(0,0,0,0.04) 1px, transparent 1px),' +
      'linear-gradient(to bottom, rgba(0,0,0,0.04) 1px, transparent 1px)',
    backgroundSize: px + 'px ' + px + 'px',
  };
}
