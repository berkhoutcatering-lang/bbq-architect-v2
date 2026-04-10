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
  if (!logoUrl) return 0;

  // Logo is loaded async before render starts — stored in ctx
  const logoData = (ctx as any)._logos?.[block.variant];
  if (!logoData) return 0;

  const ratio = logoData.w / logoData.h;
  let w = Math.min(block.maxWidth, logoData.w * 0.264583); // px to mm
  let h = w / ratio;
  if (h > block.maxHeight) { h = block.maxHeight; w = h * ratio; }

  let x = cursor.margins.left;
  if (block.alignment === 'center') x = (cursor.pageWidth - w) / 2;
  else if (block.alignment === 'right') x = cursor.pageWidth - cursor.margins.right - w;

  doc.addImage(logoData.data, 'PNG', x, cursor.y, w, h);
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

// ── Block Condition Evaluator ──
function evaluateConditions(conditions: TemplateBlock['conditions'], ctx: RenderContext): boolean {
  if (!conditions || conditions.length === 0) return true;
  return conditions.every(function (c) {
    const val = ctx.variables[c.field] || '';
    if (c.operator === 'eq') return val === c.value;
    if (c.operator === 'neq') return val !== c.value;
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

  // Pre-load logos
  const logos: Record<string, any> = {};
  if (ctx.branding.logoUrl) {
    logos.light = await loadImageAsBase64(ctx.branding.logoUrl);
  }
  if (ctx.branding.logoDarkUrl) {
    logos.dark = await loadImageAsBase64(ctx.branding.logoDarkUrl);
  }
  (ctx as any)._logos = logos;

  // Render blocks
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
