import type { TemplateBlock, PageSettings } from '@/types/template.types';

// Height estimates per block type (mm) — calibrated to match jsPDF templateRenderer output
function estimateBlockHeight(block: TemplateBlock, contentWidth?: number): number {
  const ptToMm = 0.3528;
  switch (block.type) {
    case 'spacer': return block.height;
    case 'divider': return block.thickness * ptToMm + 2;
    case 'logo': return block.maxHeight + 2;
    case 'document_badge': return block.fontSize * ptToMm + 8;
    case 'client_info': {
      const visibleFields = block.fields.filter(function (f) { return f.visible; });
      return Math.max(visibleFields.length * 4, 12) + 2;
    }
    case 'items_table': {
      const rows = 2; // example data rows
      const headerH = block.headerStyle.fontSize * ptToMm * 1.5 + 2;
      const bodyH = rows * (block.bodyStyle.fontSize * ptToMm * 1.5 + 2);
      return headerH + bodyH + 4;
    }
    case 'totals': {
      let h = 0;
      if (block.showSubtotaal) h += block.fontSize * ptToMm + 2;
      if (block.showBtw) h += block.fontSize * ptToMm + 2;
      if (block.showTotaal) h += block.fontSize * ptToMm + 6;
      return h + 2;
    }
    case 'payment_details': {
      const lines = block.content.split('\n').length;
      return lines * block.fontSize * ptToMm * 1.6 + 8;
    }
    case 'footer': return block.fontSize * ptToMm + 6;
    case 'menu': return 50; // dynamic, best estimate
    case 'image': return block.maxHeight + 2;
    case 'haccp_table': return 35;
    case 'text': {
      const cw = contentWidth || 180;
      const charWidthMm = block.fontSize * ptToMm * 0.5;
      const charsPerLine = Math.max(1, Math.floor(cw / charWidthMm));
      const lines = Math.max(1, Math.ceil(block.content.length / charsPerLine));
      return lines * block.fontSize * ptToMm * block.lineHeight + 2;
    }
    default: return 20;
  }
}

function getPageDimensions(ps: PageSettings): { pageW: number; pageH: number } {
  const w = ps.format === 'a4' ? 210 : 216;
  const h = ps.format === 'a4' ? 297 : 279;
  if (ps.orientation === 'landscape') return { pageW: h, pageH: w };
  return { pageW: w, pageH: h };
}

// Converts legacy flow-based blocks (no x/y) to absolute positioned blocks
export function migrateToAbsoluteLayout(blocks: TemplateBlock[], pageSettings: PageSettings): TemplateBlock[] {
  const { pageW } = getPageDimensions(pageSettings);
  const contentWidth = pageW - pageSettings.margins.left - pageSettings.margins.right;
  let currentY = pageSettings.margins.top;

  return blocks.map(function (block, index) {
    const blockWidth = getBlockWidth(block, contentWidth);
    const blockX = getBlockX(block, pageSettings.margins.left, contentWidth, blockWidth);
    const blockHeight = estimateBlockHeight(block, contentWidth);

    const migrated = {
      ...block,
      x: blockX,
      y: currentY,
      width: blockWidth,
      height: blockHeight,
      zIndex: index,
    };

    currentY += blockHeight;
    return migrated as TemplateBlock;
  });
}

function getBlockWidth(block: TemplateBlock, contentWidth: number): number {
  if (block.type === 'logo') return Math.min(block.maxWidth + 10, contentWidth);
  if (block.type === 'image') return Math.min(block.maxWidth + 10, contentWidth);
  if (block.type === 'document_badge') return contentWidth * 0.5;
  return contentWidth;
}

function getBlockX(block: TemplateBlock, marginLeft: number, contentWidth: number, blockWidth: number): number {
  if (blockWidth >= contentWidth) return marginLeft;
  const align = 'alignment' in block ? (block as { alignment: string }).alignment : 'left';
  if (align === 'center') return marginLeft + (contentWidth - blockWidth) / 2;
  if (align === 'right') return marginLeft + contentWidth - blockWidth;
  return marginLeft;
}

// Check if blocks need migration (no x/y properties)
export function needsMigration(blocks: TemplateBlock[]): boolean {
  if (blocks.length === 0) return false;
  return blocks[0].x === undefined || blocks[0].y === undefined;
}
