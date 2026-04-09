'use client';

import type { TemplateBlock, PdfTemplate } from '@/types/template.types';
import { Image, ChefHat, Table, Calculator, CreditCard, Thermometer } from 'lucide-react';

// HTML preview of a block — approximation of PDF output
export default function BlockRenderer({ block, documentType }: { block: TemplateBlock; documentType: PdfTemplate['document_type'] }) {
  const brandColor = '#c4a35a';
  const isDark = documentType === 'menukaart';

  function resolveC(c: string): string {
    if (c === 'brand_primary') return brandColor;
    if (c === 'brand_accent') return '#8b6914';
    return c;
  }

  switch (block.type) {
    case 'logo':
      return (
        <div style={{ textAlign: block.alignment, padding: '4px 0' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: block.maxWidth * 2.5, height: block.maxHeight * 2.5,
            background: 'rgba(158,120,28,.08)', borderRadius: 6, border: '1px dashed rgba(158,120,28,.3)',
          }}>
            <Image size={20} style={{ color: brandColor, opacity: 0.5 }} />
          </div>
        </div>
      );

    case 'text':
      return (
        <div style={{
          fontSize: block.fontSize * 1.2, fontWeight: block.fontWeight,
          fontStyle: block.fontStyle, color: resolveC(block.color),
          textAlign: block.alignment, lineHeight: block.lineHeight,
          padding: '2px 0', whiteSpace: 'pre-wrap',
        }}>
          {block.content.replace(/\{\{(\w+)\}\}/g, function (_m, k) { return '[' + k + ']'; })}
        </div>
      );

    case 'client_info':
      return (
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', gap: 20 }}>
          <div>
            {block.fields.filter(function (f) { return f.visible && ['client_naam', 'client_adres'].includes(f.key); }).map(function (f) {
              return <div key={f.key} style={{ fontSize: f.bold ? 13 : 11, fontWeight: f.bold ? 700 : 400, color: isDark ? '#e8e0d0' : '#333', marginBottom: 2 }}>
                {f.label ? f.label + ': ' : ''}[{f.key}]
              </div>;
            })}
          </div>
          <div style={{ textAlign: 'right', fontSize: 10, color: isDark ? '#999' : '#666' }}>
            {block.fields.filter(function (f) { return f.visible && !['client_naam', 'client_adres'].includes(f.key); }).map(function (f) {
              return <div key={f.key} style={{ marginBottom: 2 }}>{f.label}: <strong style={{ color: isDark ? '#e8e0d0' : '#333' }}>[{f.key}]</strong></div>;
            })}
          </div>
        </div>
      );

    case 'document_badge':
      return (
        <div style={{
          textAlign: 'center', padding: '8px 0',
        }}>
          <span style={{
            display: 'inline-block', padding: '6px 28px', borderRadius: 6,
            background: resolveC(block.backgroundColor), color: resolveC(block.textColor),
            fontSize: block.fontSize * 1.1, fontWeight: 700, letterSpacing: '0.15em',
          }}>
            {block.text.replace(/\{\{(\w+)\}\}/g, function (_m, k) { return '[' + k + ']'; })}
          </span>
        </div>
      );

    case 'items_table':
      return (
        <div style={{ padding: '4px 0' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
            <thead>
              <tr style={{ background: resolveC(block.headerStyle.backgroundColor), color: resolveC(block.headerStyle.textColor) }}>
                {block.columns.map(function (col) {
                  return <th key={col.key} style={{ padding: '5px 8px', textAlign: col.alignment, fontWeight: 600, fontSize: block.headerStyle.fontSize * 1.1 }}>{col.label}</th>;
                })}
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: '1px solid #eee' }}>
                {block.columns.map(function (col) {
                  return <td key={col.key} style={{ padding: '4px 8px', textAlign: col.alignment, color: isDark ? '#ccc' : '#666', fontSize: block.bodyStyle.fontSize * 1.1 }}>
                    {col.key === 'omschrijving' ? 'Voorbeeld item' : col.key === 'qty' ? '2' : col.key === 'prijs' ? '\u20ac 25,00' : col.key === 'btw' ? '21%' : '\u20ac 50,00'}
                  </td>;
                })}
              </tr>
            </tbody>
          </table>
        </div>
      );

    case 'menu':
      return (
        <div style={{ padding: '6px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 16, background: isDark ? 'rgba(196,163,90,.05)' : 'rgba(158,120,28,.04)', borderRadius: 8, border: '1px dashed rgba(158,120,28,.2)' }}>
            <ChefHat size={16} style={{ color: brandColor }} />
            <span style={{ fontSize: 12, color: isDark ? '#c4a35a' : '#666' }}>Menu sectie ({block.layout})</span>
          </div>
        </div>
      );

    case 'totals':
      return (
        <div style={{ textAlign: block.alignment, padding: '4px 0', fontSize: block.fontSize * 1.1 }}>
          {block.showSubtotaal && <div style={{ color: isDark ? '#999' : '#666', marginBottom: 3 }}>Subtotaal: <strong style={{ color: isDark ? '#e8e0d0' : '#333' }}>\u20ac 100,00</strong></div>}
          {block.showBtw && <div style={{ color: isDark ? '#999' : '#666', marginBottom: 3 }}>BTW: <strong style={{ color: isDark ? '#e8e0d0' : '#333' }}>\u20ac 21,00</strong></div>}
          {block.showTotaal && (
            <span style={{ display: 'inline-block', padding: '4px 16px', borderRadius: 4, background: resolveC(block.totalBarColor), color: '#fff', fontWeight: 700 }}>
              Totaal: \u20ac 121,00
            </span>
          )}
        </div>
      );

    case 'payment_details':
      return (
        <div style={{
          padding: '10px 14px', borderRadius: 8, fontSize: block.fontSize * 1.1,
          background: resolveC(block.backgroundColor), border: '1px solid ' + resolveC(block.borderColor),
          color: isDark ? '#ccc' : '#555', whiteSpace: 'pre-wrap', lineHeight: 1.6,
        }}>
          {block.content.replace(/\{\{(\w+)\}\}/g, function (_m, k) { return '[' + k + ']'; })}
        </div>
      );

    case 'divider':
      return (
        <div style={{ padding: '4px 0' }}>
          <hr style={{ border: 'none', borderTop: block.thickness + 'px ' + block.style + ' ' + resolveC(block.color), margin: 0 }} />
        </div>
      );

    case 'spacer':
      return <div style={{ height: block.height * 2.5, background: 'transparent' }} />;

    case 'image':
      return (
        <div style={{ textAlign: block.alignment, padding: '4px 0' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: Math.min(block.maxWidth * 2.5, 400), height: block.maxHeight * 1.5,
            background: 'rgba(0,0,0,.03)', borderRadius: 6, border: '1px dashed #ccc',
          }}>
            <Image size={20} style={{ color: '#999' }} />
          </div>
        </div>
      );

    case 'footer':
      return (
        <div style={{ padding: '6px 0' }}>
          {block.showTopBorder && <hr style={{ border: 'none', borderTop: '1px solid ' + resolveC(block.borderColor), marginBottom: 4 }} />}
          <div style={{ fontSize: block.fontSize * 1.2, color: resolveC(block.color), textAlign: block.alignment }}>
            {block.content.replace(/\{\{(\w+)\}\}/g, function (_m, k) { return '[' + k + ']'; })}
          </div>
        </div>
      );

    case 'haccp_table':
      return (
        <div style={{ padding: '12px', display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center', background: 'rgba(200,50,50,.04)', borderRadius: 8, border: '1px dashed rgba(200,50,50,.2)' }}>
          <Thermometer size={16} style={{ color: '#c83232' }} />
          <span style={{ fontSize: 12, color: '#c83232' }}>HACCP temperatuurtabel</span>
        </div>
      );

    default:
      return <div style={{ padding: 8, color: '#999', fontSize: 11 }}>Onbekend blok: {(block as TemplateBlock).type}</div>;
  }
}
