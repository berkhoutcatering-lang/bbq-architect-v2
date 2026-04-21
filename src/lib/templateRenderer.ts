/**
 * Template Renderer — Converts block configs to jsPDF output
 * Bridge between the template editor and the existing PDF generator
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import type {
  PdfTemplate, TemplateBlock, RenderContext, PageSettings,
  LogoBlock, TextBlock, ClientInfoBlock, DocumentBadgeBlock,
  ItemsTableBlock, MenuBlock, TotalsBlock, PaymentDetailsBlock,
  DividerBlock, SpacerBlock, ImageBlock, FooterBlock, HaccpTableBlock,
  ShapeBlock, IconBlock, StampBlock, BorderFrameBlock,
} from '@/types/template.types';
import { interpolateVariables, resolveColor } from '@/lib/templateVariables';

// ── Helpers (shared with pdfGenerator.ts) ──
function eur(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return '\u20ac 0,00';
  return '\u20ac ' + Number(n).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function loadImageAsBase64(src: string): Promise<{ data: string; w: number; h: number } | null> {
  return new Promise(function (resolve) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = function () {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      resolve({ data: canvas.toDataURL('image/png'), w: canvas.width, h: canvas.height });
    };
    img.onerror = function () { resolve(null); };
    img.src = src;
  });
}

// ── Cursor state ──
interface Cursor {
  y: number;
  pageWidth: number;
  pageHeight: number;
  margins: PageSettings['margins'];
  contentWidth: number;
}

// ── Block Renderers ──

function renderLogoBlock(doc: any, block: LogoBlock, ctx: RenderContext, cursor: Cursor): number {
  const logoUrl = block.variant === 'dark' ? ctx.branding.logoDarkUrl : ctx.branding.logoUrl;
  const logoData = logoUrl ? (ctx as any)._logos?.[block.variant] : null;

  // Compute placement using either real image ratio or block's max box
  let w = block.maxWidth;
  let h = block.maxHeight;
  if (logoData) {
    const ratio = logoData.w / logoData.h;
    w = Math.min(block.maxWidth, logoData.w * 0.264583); // px to mm
    h = w / ratio;
    if (h > block.maxHeight) { h = block.maxHeight; w = h * ratio; }
  }

  let x = cursor.margins.left;
  if (block.alignment === 'center') x = (cursor.pageWidth - w) / 2;
  else if (block.alignment === 'right') x = cursor.pageWidth - cursor.margins.right - w;

  if (logoData) {
    doc.addImage(logoData.data, 'PNG', x, cursor.y, w, h);
  } else {
    // Placeholder: dashed-border box with "Logo" label, so the user sees where the
    // logo will land in the PDF even when no image has been uploaded yet.
    doc.setDrawColor(180, 180, 180);
    doc.setLineWidth(0.3);
    doc.setLineDashPattern([1.2, 1.2], 0);
    doc.rect(x, cursor.y, w, h);
    doc.setLineDashPattern([], 0);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(150, 150, 150);
    doc.text('Logo', x + w / 2, cursor.y + h / 2 + 1, { align: 'center', baseline: 'middle' });
  }
  return h + 2;
}

function renderTextBlock(doc: any, block: TextBlock, ctx: RenderContext, cursor: Cursor): number {
  const text = interpolateVariables(block.content, ctx.variables);
  const color = resolveColor(block.color, ctx.branding);
  const rgb = hexToRgb(color);

  doc.setFontSize(block.fontSize);
  doc.setFont('helvetica', block.fontWeight === 'bold' ? 'bold' : block.fontStyle === 'italic' ? 'italic' : 'normal');
  doc.setTextColor(...rgb);

  let x = cursor.margins.left;
  const maxW = cursor.contentWidth;
  let align: 'left' | 'center' | 'right' = 'left';

  if (block.alignment === 'center') { x = cursor.pageWidth / 2; align = 'center'; }
  else if (block.alignment === 'right') { x = cursor.pageWidth - cursor.margins.right; align = 'right'; }

  const lines = doc.splitTextToSize(text, maxW);
  doc.text(lines, x, cursor.y, { align });

  return lines.length * block.fontSize * 0.3528 * block.lineHeight + 2;
}

function renderClientInfoBlock(doc: any, block: ClientInfoBlock, ctx: RenderContext, cursor: Cursor): number {
  let h = 0;
  const visibleFields = block.fields.filter(function (f) { return f.visible; });

  if (block.layout === 'two-column') {
    // Left column: client fields, Right column: document fields
    const clientFields = visibleFields.filter(function (f) { return ['client_naam', 'client_adres'].includes(f.key); });
    const docFields = visibleFields.filter(function (f) { return !['client_naam', 'client_adres'].includes(f.key); });

    let leftY = cursor.y;
    clientFields.forEach(function (f) {
      const val = ctx.variables[f.key] || '';
      if (!val) return;
      doc.setFontSize(f.bold ? 11 : 9);
      doc.setFont('helvetica', f.bold ? 'bold' : 'normal');
      doc.setTextColor(30, 30, 30);
      if (f.label) { doc.text(f.label, cursor.margins.left, leftY); leftY += 4; }
      doc.text(val, cursor.margins.left, leftY);
      leftY += f.bold ? 6 : 4;
    });

    let rightY = cursor.y;
    const rightX = cursor.pageWidth - cursor.margins.right - 60;
    docFields.forEach(function (f) {
      const val = ctx.variables[f.key] || '';
      if (!val) return;
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 100, 100);
      doc.text(f.label + ':', rightX, rightY);
      doc.setTextColor(30, 30, 30);
      doc.setFont('helvetica', 'bold');
      doc.text(val, rightX + 35, rightY);
      rightY += 5;
    });

    h = Math.max(leftY - cursor.y, rightY - cursor.y) + 4;
  } else {
    visibleFields.forEach(function (f) {
      const val = ctx.variables[f.key] || '';
      if (!val) return;
      doc.setFontSize(f.bold ? 11 : 9);
      doc.setFont('helvetica', f.bold ? 'bold' : 'normal');
      doc.setTextColor(30, 30, 30);
      const label = f.label ? f.label + ': ' : '';
      doc.text(label + val, cursor.margins.left, cursor.y + h);
      h += f.bold ? 6 : 4;
    });
    h += 2;
  }

  return h;
}

function renderDocumentBadgeBlock(doc: any, block: DocumentBadgeBlock, ctx: RenderContext, cursor: Cursor): number {
  const text = interpolateVariables(block.text, ctx.variables);
  const bgColor = resolveColor(block.backgroundColor, ctx.branding);
  const txtColor = resolveColor(block.textColor, ctx.branding);
  const bgRgb = hexToRgb(bgColor);
  const txtRgb = hexToRgb(txtColor);

  const badgeW = 70;
  const badgeH = 10;
  const x = (cursor.pageWidth - badgeW) / 2;

  doc.setFillColor(...bgRgb);
  doc.roundedRect(x, cursor.y, badgeW, badgeH, 2, 2, 'F');
  doc.setFontSize(block.fontSize);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...txtRgb);
  doc.text(text, cursor.pageWidth / 2, cursor.y + badgeH / 2 + 1.5, { align: 'center' });

  return badgeH + 4;
}

function renderItemsTableBlock(doc: any, block: ItemsTableBlock, ctx: RenderContext, cursor: Cursor): number {
  const items = ctx.data.items || [];
  if (items.length === 0) return 0;

  const headerBg = resolveColor(block.headerStyle.backgroundColor, ctx.branding);
  const headerRgb = hexToRgb(headerBg);
  const headerTxtRgb = hexToRgb(resolveColor(block.headerStyle.textColor, ctx.branding));

  const columns = block.columns.map(function (col) {
    return { header: col.label, dataKey: col.key };
  });

  const body = items.map(function (item) {
    const row: Record<string, string> = {};
    block.columns.forEach(function (col) {
      if (col.key === 'totaal') {
        row[col.key] = eur((item.qty || 1) * (item.prijs || 0));
      } else if (col.key === 'prijs_incl_btw') {
        row[col.key] = eur((item.prijs || 0) * (1 + (item.btw || 0) / 100));
      } else if (col.key === 'prijs') {
        row[col.key] = eur(item.prijs);
      } else if (col.key === 'btw') {
        row[col.key] = (item.btw || 0) + '%';
      } else {
        row[col.key] = String(item[col.key] || '');
      }
    });
    return row;
  });

  const columnStyles: Record<string, any> = {};
  block.columns.forEach(function (col) {
    columnStyles[col.key] = { halign: col.alignment, cellWidth: cursor.contentWidth * col.width / 100 };
  });

  const startY = cursor.y;
  (doc as any).autoTable({
    startY,
    head: [columns.reduce(function (acc: Record<string, string>, c) { acc[c.dataKey] = c.header; return acc; }, {})],
    body,
    columnStyles,
    headStyles: {
      fillColor: headerRgb,
      textColor: headerTxtRgb,
      fontSize: block.headerStyle.fontSize,
      fontStyle: 'bold',
    },
    bodyStyles: {
      fontSize: block.bodyStyle.fontSize,
      textColor: hexToRgb(resolveColor(block.bodyStyle.textColor, ctx.branding)),
    },
    theme: block.showGridLines ? 'grid' : 'plain',
    margin: { left: cursor.margins.left, right: cursor.margins.right },
    tableWidth: cursor.contentWidth,
  });

  return ((doc as any).lastAutoTable?.finalY || startY + 20) - startY + 4;
}

function renderTotalsBlock(doc: any, block: TotalsBlock, ctx: RenderContext, cursor: Cursor): number {
  let h = 0;
  const x = block.alignment === 'right' ? cursor.pageWidth - cursor.margins.right - 60 : cursor.margins.left;
  const valX = x + 40;

  doc.setFontSize(block.fontSize);

  if (block.showSubtotaal) {
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text('Subtotaal:', x, cursor.y + h);
    doc.setTextColor(30, 30, 30);
    doc.text(ctx.variables.subtotaal || '', valX, cursor.y + h, { align: 'right' });
    h += 5;
  }

  if (block.showBtw) {
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text('BTW:', x, cursor.y + h);
    doc.setTextColor(30, 30, 30);
    doc.text(ctx.variables.btw_bedrag || '', valX, cursor.y + h, { align: 'right' });
    h += 5;
  }

  if (block.showTotaal) {
    const barColor = resolveColor(block.totalBarColor, ctx.branding);
    doc.setFillColor(...hexToRgb(barColor));
    doc.roundedRect(x - 4, cursor.y + h - 1, 48, 8, 1.5, 1.5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text('Totaal:', x, cursor.y + h + 4);
    doc.text(ctx.variables.totaal || '', valX, cursor.y + h + 4, { align: 'right' });
    h += 12;
  }

  return h + 2;
}

function renderPaymentDetailsBlock(doc: any, block: PaymentDetailsBlock, ctx: RenderContext, cursor: Cursor): number {
  const text = interpolateVariables(block.content, ctx.variables);
  const bgRgb = hexToRgb(resolveColor(block.backgroundColor, ctx.branding));
  const borderRgb = hexToRgb(resolveColor(block.borderColor, ctx.branding));

  const boxW = cursor.contentWidth;
  const lines = text.split('\n');
  const boxH = lines.length * 5 + 10;

  doc.setFillColor(...bgRgb);
  doc.setDrawColor(...borderRgb);
  doc.setLineWidth(0.5);
  doc.roundedRect(cursor.margins.left, cursor.y, boxW, boxH, 2, 2, 'FD');

  doc.setFontSize(block.fontSize);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(60, 60, 60);

  lines.forEach(function (line, i) {
    doc.text(line, cursor.margins.left + 6, cursor.y + 6 + i * 5);
  });

  return boxH + 4;
}

function renderDividerBlock(doc: any, block: DividerBlock, ctx: RenderContext, cursor: Cursor): number {
  const color = resolveColor(block.color, ctx.branding);
  doc.setDrawColor(...hexToRgb(color));
  doc.setLineWidth(block.thickness * 0.264583);

  if (block.style === 'dashed') {
    doc.setLineDashPattern([2, 1]);
  } else if (block.style === 'dotted') {
    doc.setLineDashPattern([0.5, 0.5]);
  }

  doc.line(cursor.margins.left, cursor.y, cursor.pageWidth - cursor.margins.right, cursor.y);
  doc.setLineDashPattern([]);

  return block.thickness + 2;
}

function renderSpacerBlock(_doc: any, block: SpacerBlock): number {
  return block.height;
}

function renderFooterBlock(doc: any, block: FooterBlock, ctx: RenderContext, cursor: Cursor): number {
  const text = interpolateVariables(block.content, ctx.variables);
  let h = 0;

  if (block.showTopBorder) {
    const borderRgb = hexToRgb(resolveColor(block.borderColor, ctx.branding));
    doc.setDrawColor(...borderRgb);
    doc.setLineWidth(0.3);
    doc.line(cursor.margins.left, cursor.y, cursor.pageWidth - cursor.margins.right, cursor.y);
    h += 3;
  }

  const colorRgb = hexToRgb(resolveColor(block.color, ctx.branding));
  doc.setFontSize(block.fontSize);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...colorRgb);

  let x = cursor.margins.left;
  let align: 'left' | 'center' | 'right' = 'left';
  if (block.alignment === 'center') { x = cursor.pageWidth / 2; align = 'center'; }
  else if (block.alignment === 'right') { x = cursor.pageWidth - cursor.margins.right; align = 'right'; }

  doc.text(text, x, cursor.y + h + 3, { align });
  h += 6;

  return h;
}

function renderMenuBlock(doc: any, block: MenuBlock, ctx: RenderContext, cursor: Cursor): number {
  const menuData = ctx.data.menuSelectie;
  if (!menuData || Object.keys(menuData).length === 0) return 0;

  let h = 0;
  const gangs = Object.entries(menuData);

  if (block.layout === '2col') {
    const midX = cursor.pageWidth / 2;
    const colW = cursor.contentWidth / 2 - 5;
    const leftGangs = gangs.slice(0, Math.ceil(gangs.length / 2));
    const rightGangs = gangs.slice(Math.ceil(gangs.length / 2));

    let leftH = 0;
    let rightH = 0;

    [{ gangs: leftGangs, x: cursor.margins.left, hRef: leftH }, { gangs: rightGangs, x: midX + 5, hRef: rightH }].forEach(function (col) {
      let colH = 0;
      col.gangs.forEach(function ([gangName, dishes]) {
        const titleColor = resolveColor(block.gangTitleStyle.color, ctx.branding);
        doc.setFontSize(block.gangTitleStyle.fontSize);
        doc.setFont('helvetica', block.gangTitleStyle.fontWeight);
        doc.setTextColor(...hexToRgb(titleColor));

        const title = block.gangTitleStyle.uppercase ? gangName.toUpperCase() : gangName;
        const titleX = block.gangTitleStyle.alignment === 'center' ? col.x + colW / 2 : col.x;
        doc.text(title, titleX, cursor.y + colH, { align: block.gangTitleStyle.alignment });
        colH += 5;

        const dishColor = hexToRgb(resolveColor(block.dishNameStyle.color, ctx.branding));
        doc.setFontSize(block.dishNameStyle.fontSize);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...dishColor);

        (dishes as string[]).forEach(function (dish) {
          doc.text(dish, col.x, cursor.y + colH);
          colH += 4;
        });

        colH += 4;
      });

      if (col.x === cursor.margins.left) leftH = colH; else rightH = colH;
    });

    h = Math.max(leftH, rightH);
  } else {
    gangs.forEach(function ([gangName, dishes]) {
      const titleColor = resolveColor(block.gangTitleStyle.color, ctx.branding);
      doc.setFontSize(block.gangTitleStyle.fontSize);
      doc.setFont('helvetica', block.gangTitleStyle.fontWeight);
      doc.setTextColor(...hexToRgb(titleColor));

      const title = block.gangTitleStyle.uppercase ? gangName.toUpperCase() : gangName;
      const titleX = block.gangTitleStyle.alignment === 'center' ? cursor.pageWidth / 2 : cursor.margins.left;
      doc.text(title, titleX, cursor.y + h, { align: block.gangTitleStyle.alignment });
      h += 6;

      doc.setFontSize(block.dishNameStyle.fontSize);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...hexToRgb(resolveColor(block.dishNameStyle.color, ctx.branding)));

      (dishes as string[]).forEach(function (dish) {
        const dishX = block.gangTitleStyle.alignment === 'center' ? cursor.pageWidth / 2 : cursor.margins.left;
        doc.text(dish, dishX, cursor.y + h, { align: block.gangTitleStyle.alignment });
        h += 4;
      });

      h += block.gangSeparator === 'space' ? 6 : 3;
    });
  }

  return h + 2;
}

function renderHaccpTableBlock(doc: any, block: HaccpTableBlock, ctx: RenderContext, cursor: Cursor): number {
  const records = ctx.data.haccpRecords || [];
  if (records.length === 0) return 0;

  const headerRgb = hexToRgb(block.headerColor);
  const columns = block.columns.map(function (col) { return { header: col.label, dataKey: col.key }; });

  const body = records.map(function (r) {
    const row: Record<string, string> = {};
    block.columns.forEach(function (col) { row[col.key] = String(r[col.key] || ''); });
    return row;
  });

  const startY = cursor.y;
  (doc as any).autoTable({
    startY,
    head: [columns.reduce(function (acc: Record<string, string>, c) { acc[c.dataKey] = c.header; return acc; }, {})],
    body,
    headStyles: { fillColor: headerRgb, textColor: [255, 255, 255], fontSize: 9, fontStyle: 'bold' },
    bodyStyles: { fontSize: 8 },
    theme: 'grid',
    margin: { left: cursor.margins.left, right: cursor.margins.right },
    didParseCell: function (data: any) {
      if (data.section === 'body' && data.column.dataKey === 'status') {
        const val = (data.cell.raw || '').toString().toLowerCase();
        if (val === 'ok') data.cell.styles.textColor = hexToRgb(block.statusColors.ok);
        else if (val.includes('warn') || val === 'let op') data.cell.styles.textColor = hexToRgb(block.statusColors.warn);
        else if (val.includes('danger') || val.includes('afwijking')) data.cell.styles.textColor = hexToRgb(block.statusColors.danger);
      }
    },
  });

  return ((doc as any).lastAutoTable?.finalY || startY + 20) - startY + 4;
}

function renderImageBlock(doc: any, block: ImageBlock, ctx: RenderContext, cursor: Cursor): number {
  const src = interpolateVariables(block.src, ctx.variables);
  if (!src) return 0;

  // Try to load from pre-loaded context data (e.g. receipt_image)
  const imageData = (ctx as any)._images?.[src];
  if (!imageData) return 0;

  const ratio = imageData.w / imageData.h;
  let w = Math.min(block.maxWidth, imageData.w * 0.264583);
  let h = w / ratio;
  if (h > block.maxHeight) { h = block.maxHeight; w = h * ratio; }

  let x = cursor.margins.left;
  if (block.alignment === 'center') x = (cursor.pageWidth - w) / 2;
  else if (block.alignment === 'right') x = cursor.pageWidth - cursor.margins.right - w;

  doc.addImage(imageData.data, 'PNG', x, cursor.y, w, h);
  return h + 2;
}

// ── Decoratieve Blok Renderers ──

function renderShapeBlock(doc: any, block: ShapeBlock, ctx: RenderContext, cursor: Cursor): number {
  const x = cursor.margins.left;
  const y = cursor.y;
  const w = cursor.contentWidth;
  const h = block.height || 20;

  const hasFill = block.fillColor && block.fillColor !== 'none';
  const hasStroke = block.strokeColor && block.strokeColor !== 'none' && block.strokeWidth > 0;

  if (hasFill) doc.setFillColor(...hexToRgb(resolveColor(block.fillColor, ctx.branding)));
  if (hasStroke) {
    doc.setDrawColor(...hexToRgb(resolveColor(block.strokeColor, ctx.branding)));
    doc.setLineWidth(block.strokeWidth * 0.264583);
  }

  const style = hasFill && hasStroke ? 'FD' : hasFill ? 'F' : hasStroke ? 'S' : 'S';

  // Opacity support
  if (block.opacity !== undefined && block.opacity < 1) {
    doc.saveGraphicsState?.();
    doc.setGState?.(new (doc as any).GState({ opacity: block.opacity }));
  }

  switch (block.shape) {
    case 'rectangle':
      doc.rect(x, y, w, h, style);
      break;
    case 'rounded_rectangle':
      doc.roundedRect(x, y, w, h, block.cornerRadius || 3, block.cornerRadius || 3, style);
      break;
    case 'circle': {
      const r = Math.min(w, h) / 2;
      doc.circle(x + w / 2, y + h / 2, r, style);
      break;
    }
    case 'ellipse':
      doc.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, style);
      break;
    case 'line':
      doc.line(x, y + h / 2, x + w, y + h / 2);
      break;
    case 'triangle':
      doc.triangle(x + w / 2, y, x, y + h, x + w, y + h, style);
      break;
    case 'diamond':
      doc.triangle(x + w / 2, y, x, y + h / 2, x + w, y + h / 2, style);
      doc.triangle(x, y + h / 2, x + w, y + h / 2, x + w / 2, y + h, style);
      break;
  }

  if (block.opacity !== undefined && block.opacity < 1) doc.restoreGraphicsState?.();
  doc.setLineDashPattern?.([]);

  return h + 2;
}

function renderIconBlock(doc: any, block: IconBlock, ctx: RenderContext, cursor: Cursor): number {
  const color = resolveColor(block.color, ctx.branding);
  const rgb = hexToRgb(color);
  const size = block.size;
  const cx = cursor.margins.left + size / 2;
  const cy = cursor.y + size / 2;

  doc.setDrawColor(...rgb);
  doc.setFillColor(...rgb);
  doc.setLineWidth(Math.max(size * 0.08, 0.3));

  switch (block.icon) {
    case 'star': {
      const r = size / 2;
      const points: number[][] = [];
      for (let i = 0; i < 10; i++) {
        const angle = (Math.PI / 5) * i - Math.PI / 2;
        const rad = i % 2 === 0 ? r : r * 0.4;
        points.push([cx + Math.cos(angle) * rad, cy + Math.sin(angle) * rad]);
      }
      const lines = points.slice(1).map(function (p, i) { return [p[0] - points[i][0], p[1] - points[i][1]]; });
      lines.push([points[0][0] - points[9][0], points[0][1] - points[9][1]]);
      doc.lines(lines, points[0][0], points[0][1], [1, 1], 'F', true);
      break;
    }
    case 'heart': {
      const r = size / 4;
      doc.circle(cx - r, cy - r / 2, r, 'F');
      doc.circle(cx + r, cy - r / 2, r, 'F');
      doc.triangle(cx - 2 * r, cy - r / 2, cx + 2 * r, cy - r / 2, cx, cy + 2 * r, 'F');
      break;
    }
    case 'check': {
      doc.setLineWidth(size * 0.15);
      doc.line(cx - size / 3, cy, cx - size / 10, cy + size / 4);
      doc.line(cx - size / 10, cy + size / 4, cx + size / 3, cy - size / 3);
      break;
    }
    case 'plus': {
      doc.setLineWidth(size * 0.15);
      doc.line(cx - size / 3, cy, cx + size / 3, cy);
      doc.line(cx, cy - size / 3, cx, cy + size / 3);
      break;
    }
    case 'arrow_right': {
      doc.setLineWidth(size * 0.12);
      doc.line(cx - size / 3, cy, cx + size / 3, cy);
      doc.line(cx + size / 6, cy - size / 4, cx + size / 3, cy);
      doc.line(cx + size / 6, cy + size / 4, cx + size / 3, cy);
      break;
    }
    case 'flame': {
      // Stylised flame: droplet-like triangle
      doc.triangle(cx, cy - size / 2, cx - size / 3, cy + size / 3, cx + size / 3, cy + size / 3, 'F');
      doc.circle(cx, cy + size / 6, size / 4, 'F');
      break;
    }
    case 'leaf': {
      doc.ellipse(cx, cy, size / 2, size / 3.5, 'F');
      doc.setLineWidth(size * 0.06);
      doc.setDrawColor(255, 255, 255);
      doc.line(cx - size / 2, cy, cx + size / 2, cy);
      break;
    }
    case 'sparkle': {
      // 4-point diamond sparkle
      doc.triangle(cx, cy - size / 2, cx - size / 6, cy, cx + size / 6, cy, 'F');
      doc.triangle(cx, cy + size / 2, cx - size / 6, cy, cx + size / 6, cy, 'F');
      doc.triangle(cx - size / 2, cy, cx, cy - size / 6, cx, cy + size / 6, 'F');
      doc.triangle(cx + size / 2, cy, cx, cy - size / 6, cx, cy + size / 6, 'F');
      break;
    }
    case 'circle_dot': {
      doc.circle(cx, cy, size / 2, 'S');
      doc.circle(cx, cy, size / 6, 'F');
      break;
    }
    case 'diamond_small': {
      doc.triangle(cx, cy - size / 2, cx - size / 2, cy, cx + size / 2, cy, 'F');
      doc.triangle(cx, cy + size / 2, cx - size / 2, cy, cx + size / 2, cy, 'F');
      break;
    }
  }

  return size + 2;
}

function renderStampBlock(doc: any, block: StampBlock, ctx: RenderContext, cursor: Cursor): number {
  const text = interpolateVariables(block.text, ctx.variables).toUpperCase();
  const subtext = block.subtext ? interpolateVariables(block.subtext, ctx.variables).toUpperCase() : '';
  const color = resolveColor(block.color, ctx.branding);
  const rgb = hexToRgb(color);

  const w = block.width || 50;
  const h = block.height || 50;
  const cx = cursor.margins.left + w / 2;
  const cy = cursor.y + h / 2;

  // Rotation via transformation matrix
  const rot = block.rotation || 0;
  if (rot !== 0) {
    doc.saveGraphicsState?.();
    const rad = (rot * Math.PI) / 180;
    doc.setCurrentTransformationMatrix?.(
      Math.cos(rad), Math.sin(rad), -Math.sin(rad), Math.cos(rad),
      cx - cx * Math.cos(rad) + cy * Math.sin(rad),
      cy - cx * Math.sin(rad) - cy * Math.cos(rad),
    );
  }

  doc.setDrawColor(...rgb);
  doc.setLineWidth(1.5);

  if (block.borderStyle === 'dashed') doc.setLineDashPattern([2, 1]);
  else doc.setLineDashPattern([]);

  // Outer shape
  if (block.shape === 'circle') {
    doc.circle(cx, cy, Math.min(w, h) / 2, 'S');
    if (block.borderStyle === 'double') doc.circle(cx, cy, Math.min(w, h) / 2 - 1.5, 'S');
  } else if (block.shape === 'square') {
    doc.rect(cursor.margins.left, cursor.y, w, h, 'S');
    if (block.borderStyle === 'double') doc.rect(cursor.margins.left + 1.5, cursor.y + 1.5, w - 3, h - 3, 'S');
  } else {
    doc.roundedRect(cursor.margins.left, cursor.y, w, h, 3, 3, 'S');
    if (block.borderStyle === 'double') doc.roundedRect(cursor.margins.left + 1.5, cursor.y + 1.5, w - 3, h - 3, 2, 2, 'S');
  }

  doc.setLineDashPattern([]);

  // Text
  doc.setTextColor(...rgb);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(block.fontSize);
  doc.text(text, cx, cy + (subtext ? -1 : 2), { align: 'center' });

  if (subtext) {
    doc.setFontSize(Math.max(block.fontSize * 0.55, 6));
    doc.setFont('helvetica', 'normal');
    doc.text(subtext, cx, cy + 5, { align: 'center' });
  }

  if (rot !== 0) doc.restoreGraphicsState?.();

  return h + 2;
}

function renderBorderFrameBlock(doc: any, block: BorderFrameBlock, ctx: RenderContext, cursor: Cursor): number {
  const color = resolveColor(block.color, ctx.branding);
  const rgb = hexToRgb(color);
  doc.setDrawColor(...rgb);
  doc.setLineWidth(block.thickness * 0.264583);

  // Determine frame bounds
  let x: number; let y: number; let w: number; let h: number;
  if (block.useBlockBounds && block.width && block.height) {
    x = cursor.margins.left;
    y = cursor.y;
    w = block.width;
    h = block.height;
  } else {
    const inset = block.inset || 6;
    x = inset;
    y = inset;
    w = cursor.pageWidth - inset * 2;
    h = cursor.pageHeight - inset * 2;
  }

  const corner = block.cornerSize || 10;

  switch (block.style) {
    case 'single':
      doc.setLineDashPattern([]);
      doc.rect(x, y, w, h, 'S');
      break;
    case 'rounded':
      doc.setLineDashPattern([]);
      doc.roundedRect(x, y, w, h, 4, 4, 'S');
      break;
    case 'double':
      doc.setLineDashPattern([]);
      doc.rect(x, y, w, h, 'S');
      doc.rect(x + 2, y + 2, w - 4, h - 4, 'S');
      break;
    case 'dashed':
      doc.setLineDashPattern([3, 1.5]);
      doc.rect(x, y, w, h, 'S');
      doc.setLineDashPattern([]);
      break;
    case 'dotted':
      doc.setLineDashPattern([0.6, 0.8]);
      doc.rect(x, y, w, h, 'S');
      doc.setLineDashPattern([]);
      break;
    case 'corners':
      doc.setLineDashPattern([]);
      // Top-left
      doc.line(x, y, x + corner, y);
      doc.line(x, y, x, y + corner);
      // Top-right
      doc.line(x + w - corner, y, x + w, y);
      doc.line(x + w, y, x + w, y + corner);
      // Bottom-left
      doc.line(x, y + h - corner, x, y + h);
      doc.line(x, y + h, x + corner, y + h);
      // Bottom-right
      doc.line(x + w - corner, y + h, x + w, y + h);
      doc.line(x + w, y + h - corner, x + w, y + h);
      break;
    case 'ornament': {
      doc.setLineDashPattern([]);
      // Thin outer line
      doc.setLineWidth(block.thickness * 0.15);
      doc.rect(x, y, w, h, 'S');
      // Ornamental corner marks: small triangle + dot on each corner
      doc.setLineWidth(block.thickness * 0.264583);
      doc.setFillColor(...rgb);
      const s = corner / 2;
      // top-left
      doc.triangle(x, y, x + s, y, x, y + s, 'F');
      // top-right
      doc.triangle(x + w, y, x + w - s, y, x + w, y + s, 'F');
      // bottom-left
      doc.triangle(x, y + h, x + s, y + h, x, y + h - s, 'F');
      // bottom-right
      doc.triangle(x + w, y + h, x + w - s, y + h, x + w, y + h - s, 'F');
      // Small circle accents mid-sides
      const r = Math.max(s * 0.25, 0.8);
      doc.circle(x + w / 2, y, r, 'F');
      doc.circle(x + w / 2, y + h, r, 'F');
      doc.circle(x, y + h / 2, r, 'F');
      doc.circle(x + w, y + h / 2, r, 'F');
      break;
    }
  }
  doc.setLineDashPattern([]);
  return 0; // Frame doesn't advance cursor in flow mode
}

// ── Block Condition Evaluator ──
function evaluateConditions(conditions: TemplateBlock['conditions'], ctx: RenderContext): boolean {
  if (!conditions || conditions.length === 0) return true;
  return conditions.every(function (c) {
    // Special-case `document_type`: the variable resolves to the uppercase display
    // form ('FACTUUR') but defaults / template conditions use the canonical lowercase
    // form ('factuur'). Compare against ctx.documentType to avoid that mismatch.
    let val: string;
    if (c.field === 'document_type') {
      val = ctx.documentType || '';
    } else {
      val = ctx.variables[c.field] || '';
    }
    const a = String(val).toLowerCase();
    const b = String(c.value).toLowerCase();
    if (c.operator === 'eq') return a === b;
    if (c.operator === 'neq') return a !== b;
    if (c.operator === 'exists') return val !== '';
    return true;
  });
}

// ── Block Renderer Registry ──
const RENDERERS: Record<string, (doc: any, block: any, ctx: RenderContext, cursor: Cursor) => number> = {
  logo: renderLogoBlock,
  text: renderTextBlock,
  client_info: renderClientInfoBlock,
  document_badge: renderDocumentBadgeBlock,
  items_table: renderItemsTableBlock,
  menu: renderMenuBlock,
  totals: renderTotalsBlock,
  payment_details: renderPaymentDetailsBlock,
  divider: renderDividerBlock,
  spacer: renderSpacerBlock,
  image: renderImageBlock,
  footer: renderFooterBlock,
  haccp_table: renderHaccpTableBlock,
  shape: renderShapeBlock,
  icon: renderIconBlock,
  stamp: renderStampBlock,
  border_frame: renderBorderFrameBlock,
};

// ── Main Render Function ──
export async function renderFromTemplate(
  template: PdfTemplate,
  ctx: RenderContext,
  jsPDFLib: any
): Promise<any> {
  const { jsPDF } = jsPDFLib;
  const ps = template.page_settings;

  const doc = new jsPDF({
    orientation: ps.orientation,
    unit: 'mm',
    format: ps.format,
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - ps.margins.left - ps.margins.right;

  // Apply page background
  if (ps.backgroundColor && ps.backgroundColor !== '#ffffff') {
    const bgRgb = hexToRgb(ps.backgroundColor);
    doc.setFillColor(...bgRgb);
    doc.rect(0, 0, pageWidth, pageHeight, 'F');
  }

  // Apply per-template brand colour overrides if present (Settings tab → Huisstijlkleuren)
  if (ps.brandColors) {
    if (ps.brandColors.primary) {
      ctx.branding = { ...ctx.branding, primaryColor: ps.brandColors.primary, primaryRgb: hexToRgb(ps.brandColors.primary) };
    }
    if (ps.brandColors.accent) {
      ctx.branding = { ...ctx.branding, accentColor: ps.brandColors.accent, accentRgb: hexToRgb(ps.brandColors.accent) };
    }
  }

  // Pre-load logos
  const logos: Record<string, any> = {};
  if (ctx.branding.logoUrl) {
    logos.light = await loadImageAsBase64(ctx.branding.logoUrl);
  }
  if (ctx.branding.logoDarkUrl) {
    logos.dark = await loadImageAsBase64(ctx.branding.logoDarkUrl);
  }
  (ctx as any)._logos = logos;

  // ── Absolute layout mode (2D WYSIWYG) ──
  if (template.layout_mode === 'absolute') {
    // Sort by zIndex for correct paint order
    const sorted = [...template.blocks].sort(function (a, b) { return (a.zIndex || 0) - (b.zIndex || 0); });

    for (const block of sorted) {
      if (!evaluateConditions(block.conditions, ctx)) continue;

      // Create a cursor positioned at the block's absolute coordinates
      const blockCursor: Cursor = {
        y: block.y || ps.margins.top,
        pageWidth,
        pageHeight,
        margins: {
          ...ps.margins,
          left: block.x || ps.margins.left,
          right: pageWidth - (block.x || ps.margins.left) - (block.width || contentWidth),
        },
        contentWidth: block.width || contentWidth,
      };

      const renderer = RENDERERS[block.type];
      if (renderer) {
        renderer(doc, block, ctx, blockCursor);
      }
    }

    return doc;
  }

  // ── Flow layout mode (legacy vertical) ──
  const cursor: Cursor = {
    y: ps.margins.top,
    pageWidth,
    pageHeight,
    margins: ps.margins,
    contentWidth,
  };

  for (const block of template.blocks) {
    // Check conditions
    if (!evaluateConditions(block.conditions, ctx)) continue;

    // Check page overflow (leave room for footer)
    if (cursor.y > pageHeight - ps.margins.bottom - 20 && block.type !== 'footer') {
      doc.addPage();
      cursor.y = ps.margins.top;

      // Re-apply background on new page
      if (ps.backgroundColor && ps.backgroundColor !== '#ffffff') {
        const bgRgb = hexToRgb(ps.backgroundColor);
        doc.setFillColor(...bgRgb);
        doc.rect(0, 0, pageWidth, pageHeight, 'F');
      }
    }

    const renderer = RENDERERS[block.type];
    if (renderer) {
      const height = renderer(doc, block, ctx, cursor);
      cursor.y += height;
    }
  }

  return doc;
}
