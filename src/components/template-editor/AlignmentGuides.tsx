import type { TemplateBlock } from '@/types/template.types';

interface Props {
  blocks: TemplateBlock[];
  activeBlockId: string | null; // block being dragged
  pageWidthMm: number;
  pageHeightMm: number;
  marginLeft: number;
  marginTop: number;
  marginRight: number;
  marginBottom: number;
  mmToPx: number;
}

interface GuideLine {
  orientation: 'horizontal' | 'vertical';
  position: number; // mm
}

export default function AlignmentGuides({ blocks, activeBlockId, pageWidthMm, pageHeightMm, marginLeft, marginTop, marginRight, marginBottom, mmToPx }: Props) {
  if (!activeBlockId) return null;

  const activeBlock = blocks.find(function (b) { return b.id === activeBlockId; });
  if (!activeBlock || activeBlock.x === undefined || activeBlock.y === undefined) return null;

  const aLeft = activeBlock.x || 0;
  const aTop = activeBlock.y || 0;
  const aRight = aLeft + (activeBlock.width || 0);
  const aBottom = aTop + (activeBlock.height || 0);
  const aCenterX = (aLeft + aRight) / 2;
  const aCenterY = (aTop + aBottom) / 2;

  const guides: GuideLine[] = [];
  const threshold = 2; // mm

  // Check against page margins and center
  const pageRefLines = {
    vLines: [marginLeft, pageWidthMm - marginRight, pageWidthMm / 2],
    hLines: [marginTop, pageHeightMm - marginBottom, pageHeightMm / 2],
  };

  for (const vl of pageRefLines.vLines) {
    if (Math.abs(aLeft - vl) < threshold || Math.abs(aRight - vl) < threshold || Math.abs(aCenterX - vl) < threshold) {
      guides.push({ orientation: 'vertical', position: vl });
    }
  }
  for (const hl of pageRefLines.hLines) {
    if (Math.abs(aTop - hl) < threshold || Math.abs(aBottom - hl) < threshold || Math.abs(aCenterY - hl) < threshold) {
      guides.push({ orientation: 'horizontal', position: hl });
    }
  }

  // Check against other blocks
  for (const block of blocks) {
    if (block.id === activeBlockId || block.x === undefined || block.y === undefined) continue;
    const bLeft = block.x || 0;
    const bTop = block.y || 0;
    const bRight = bLeft + (block.width || 0);
    const bBottom = bTop + (block.height || 0);
    const bCenterX = (bLeft + bRight) / 2;
    const bCenterY = (bTop + bBottom) / 2;

    const vEdges = [bLeft, bRight, bCenterX];
    const hEdges = [bTop, bBottom, bCenterY];

    for (const ve of vEdges) {
      if (Math.abs(aLeft - ve) < threshold || Math.abs(aRight - ve) < threshold || Math.abs(aCenterX - ve) < threshold) {
        guides.push({ orientation: 'vertical', position: ve });
      }
    }
    for (const he of hEdges) {
      if (Math.abs(aTop - he) < threshold || Math.abs(aBottom - he) < threshold || Math.abs(aCenterY - he) < threshold) {
        guides.push({ orientation: 'horizontal', position: he });
      }
    }
  }

  // Deduplicate
  const unique = guides.filter(function (g, i, arr) {
    return arr.findIndex(function (x) { return x.orientation === g.orientation && Math.abs(x.position - g.position) < 0.5; }) === i;
  });

  const totalW = pageWidthMm * mmToPx;
  const totalH = pageHeightMm * mmToPx;

  return (
    <svg
      style={{ position: 'absolute', top: 0, left: 0, width: totalW, height: totalH, pointerEvents: 'none', zIndex: 9999 }}
    >
      {unique.map(function (g, i) {
        if (g.orientation === 'vertical') {
          return <line key={i} x1={g.position * mmToPx} y1={0} x2={g.position * mmToPx} y2={totalH} stroke="#f43f5e" strokeWidth={0.5} strokeDasharray="3,3" />;
        }
        return <line key={i} x1={0} y1={g.position * mmToPx} x2={totalW} y2={g.position * mmToPx} stroke="#3b82f6" strokeWidth={0.5} strokeDasharray="3,3" />;
      })}
    </svg>
  );
}
