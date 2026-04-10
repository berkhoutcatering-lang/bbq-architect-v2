'use client';

import type { TemplateBlock, PdfTemplate } from '@/types/template.types';
import { TEMPLATE_VARIABLES } from '@/lib/templateVariables';
import { Image, ChefHat, Thermometer } from 'lucide-react';

// Build example data map from TEMPLATE_VARIABLES
const EXAMPLE_DATA: Record<string, string> = {};
TEMPLATE_VARIABLES.forEach(function (v) { EXAMPLE_DATA[v.key] = v.example; });

// HTML preview of a block — approximation of PDF output using real example data
export default function BlockRenderer({ block, documentType }: { block: TemplateBlock; documentType: PdfTemplate['document_type'] }) {
  const brandColor = '#c4a35a';
  const isDark = documentType === 'menukaart';

  function resolveC(c: string): string {
    if (c === 'brand_primary') return brandColor;
    if (c === 'brand_accent') return '#8b6914';
    return c;
  }

  // Replace {{var}} with example data
  function resolveVars(text: string): string {
    return text.replace(/\{\{(\w+)\}\}/g, function (_m, key) {
      return EXAMPLE_DATA[key] || key;
    });
  }

  switch (block.type) {
    case 'logo':
      return (
        <div style={{ textAlign: block.alignment, padding: '4px 0' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            width: block.maxWidth * 2.5, height: block.maxHeight * 2.5,
            background: isDark ? 'rgba(255,255,255,.04)' : 'rgba(158,120,28,.05)', borderRadius: 6,
            border: '1px dashed ' + (isDark ? 'rgba(196,163,90,.2)' : 'rgba(158,120,28,.2)'),
          }}>
            <Image size={16} style={{ color: brandColor, opacity: 0.4 }} />
            <span style={{ fontSize: 9, color: brandColor, opacity: 0.5, fontWeight: 500 }}>Logo</span>
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
          {resolveVars(block.content)}
        </div>
      );

    case 'client_info':
      return (
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', gap: 20 }}>
          <div>
            {block.fields.filter(function (f) { return f.visible && ['client_naam', 'client_adres'].includes(f.key); }).map(function (f) {
              return <div key={f.key} style={{ fontSize: f.bold ? 12 : 10, fontWeight: f.bold ? 700 : 400, color: isDark ? '#e8e0d0' : '#333', marginBottom: 2 }}>
                {f.label ? f.label + ': ' : ''}{EXAMPLE_DATA[f.key] || f.key}
              </div>;
            })}
          </div>
          <div style={{ textAlign: 'right', fontSize: 10, color: isDark ? '#999' : '#666' }}>
            {block.fields.filter(function (f) { return f.visible && !['client_naam', 'client_adres'].includes(f.key); }).map(function (f) {
              return <div key={f.key} style={{ marginBottom: 2 }}>{f.label}: <strong style={{ color: isDark ? '#e8e0d0' : '#333' }}>{EXAMPLE_DATA[f.key] || f.key}</strong></div>;
            })}
          </div>
        </div>
      );

    case 'document_badge':
      return (
        <div style={{ textAlign: 'center', padding: '8px 0' }}>
          <span style={{
            display: 'inline-block', padding: '6px 28px', borderRadius: 6,
            background: resolveC(block.backgroundColor), color: resolveC(block.textColor),
            fontSize: block.fontSize * 1.1, fontWeight: 700, letterSpacing: '0.15em',
          }}>
            {resolveVars(block.text)}
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
              {[
                { omschrijving: 'BBQ Catering pakket Premium', qty: '1', prijs: '\u20ac 1.000,00', btw: '21%', totaal: '\u20ac 1.000,00' },
                { omschrijving: 'Extra bediening (4 uur)', qty: '2', prijs: '\u20ac 125,00', btw: '21%', totaal: '\u20ac 250,00' },
              ].map(function (row, ri) {
                return (
                  <tr key={ri} style={{ borderBottom: '1px solid ' + (isDark ? 'rgba(255,255,255,.06)' : '#f0f0f0') }}>
                    {block.columns.map(function (col) {
                      return <td key={col.key} style={{ padding: '4px 8px', textAlign: col.alignment, color: isDark ? '#ccc' : resolveC(block.bodyStyle.textColor), fontSize: block.bodyStyle.fontSize * 1.1 }}>
                        {(row as Record<string, string>)[col.key] || ''}
                      </td>;
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      );

    case 'menu':
      return (
        <div style={{ padding: '6px 0' }}>
          {block.layout === '2col' ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {[
                { gang: 'Voorgerechten', dishes: ['Pulled Pork Slider', 'Coleslaw'] },
                { gang: 'Hoofdgerechten', dishes: ['Smoked Brisket', 'BBQ Ribs'] },
              ].map(function (g) {
                return (
                  <div key={g.gang}>
                    <div style={{ fontSize: block.gangTitleStyle.fontSize * 1.1, fontWeight: block.gangTitleStyle.fontWeight === 'bold' ? 700 : 400, color: resolveC(block.gangTitleStyle.color), textAlign: block.gangTitleStyle.alignment, textTransform: block.gangTitleStyle.uppercase ? 'uppercase' : 'none', letterSpacing: block.gangTitleStyle.uppercase ? '0.06em' : 'normal', marginBottom: 4 }}>
                      {g.gang}
                    </div>
                    {g.dishes.map(function (d) {
                      return <div key={d} style={{ fontSize: block.dishNameStyle.fontSize * 1.1, color: resolveC(block.dishNameStyle.color), textAlign: block.gangTitleStyle.alignment, marginBottom: 2 }}>{d}</div>;
                    })}
                  </div>
                );
              })}
            </div>
          ) : (
            <div>
              {[
                { gang: 'Voorgerechten', dishes: ['Pulled Pork Slider', 'Coleslaw'] },
                { gang: 'Hoofdgerechten', dishes: ['Smoked Brisket', 'BBQ Ribs', 'Grilled Corn'] },
              ].map(function (g) {
                return (
                  <div key={g.gang} style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: block.gangTitleStyle.fontSize * 1.1, fontWeight: block.gangTitleStyle.fontWeight === 'bold' ? 700 : 400, color: resolveC(block.gangTitleStyle.color), textAlign: block.gangTitleStyle.alignment, textTransform: block.gangTitleStyle.uppercase ? 'uppercase' : 'none', letterSpacing: block.gangTitleStyle.uppercase ? '0.06em' : 'normal', marginBottom: 3 }}>
                      {g.gang}
                    </div>
                    {g.dishes.map(function (d) {
                      return <div key={d} style={{ fontSize: block.dishNameStyle.fontSize * 1.1, color: resolveC(block.dishNameStyle.color), textAlign: block.gangTitleStyle.alignment, marginBottom: 1 }}>{d}</div>;
                    })}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      );

    case 'totals':
      return (
        <div style={{ textAlign: block.alignment, padding: '4px 0', fontSize: block.fontSize * 1.1 }}>
          {block.showSubtotaal && <div style={{ color: isDark ? '#999' : '#666', marginBottom: 3 }}>Subtotaal: <strong style={{ color: isDark ? '#e8e0d0' : '#333' }}>{EXAMPLE_DATA.subtotaal}</strong></div>}
          {block.showBtw && <div style={{ color: isDark ? '#999' : '#666', marginBottom: 3 }}>BTW: <strong style={{ color: isDark ? '#e8e0d0' : '#333' }}>{EXAMPLE_DATA.btw_bedrag}</strong></div>}
          {block.showTotaal && (
            <span style={{ display: 'inline-block', padding: '4px 16px', borderRadius: 4, background: resolveC(block.totalBarColor), color: '#fff', fontWeight: 700 }}>
              Totaal: {EXAMPLE_DATA.totaal}
            </span>
          )}
        </div>
      );

    case 'payment_details':
      return (
        <div style={{
          padding: '10px 14px', borderRadius: 6, fontSize: block.fontSize * 1.1,
          background: resolveC(block.backgroundColor), border: '1px solid ' + resolveC(block.borderColor),
          color: isDark ? '#ccc' : '#555', whiteSpace: 'pre-wrap', lineHeight: 1.6,
        }}>
          {resolveVars(block.content)}
        </div>
      );

    case 'divider':
      return (
        <div style={{ padding: '4px 0' }}>
          <hr style={{ border: 'none', borderTop: block.thickness + 'px ' + block.style + ' ' + resolveC(block.color), margin: 0 }} />
        </div>
      );

    case 'spacer':
      return (
        <div style={{ height: block.height * 2.5, background: 'transparent', position: 'relative' }}>
          <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', fontSize: 8, color: '#ccc', pointerEvents: 'none' }}>
            {block.height}mm
          </div>
        </div>
      );

    case 'image':
      return (
        <div style={{ textAlign: block.alignment, padding: '4px 0' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            width: Math.min(block.maxWidth * 2.5, 400), height: block.maxHeight * 1.5,
            background: 'rgba(0,0,0,.02)', borderRadius: 6, border: '1px dashed #ddd',
          }}>
            <Image size={16} style={{ color: '#bbb' }} />
            <span style={{ fontSize: 9, color: '#bbb' }}>Afbeelding</span>
          </div>
        </div>
      );

    case 'footer':
      return (
        <div style={{ padding: '6px 0' }}>
          {block.showTopBorder && <hr style={{ border: 'none', borderTop: '1px solid ' + resolveC(block.borderColor), marginBottom: 4 }} />}
          <div style={{ fontSize: block.fontSize * 1.2, color: resolveC(block.color), textAlign: block.alignment }}>
            {resolveVars(block.content)}
          </div>
        </div>
      );

    case 'haccp_table':
      return (
        <div style={{ padding: '4px 0' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 9 }}>
            <thead>
              <tr style={{ background: block.headerColor, color: '#fff' }}>
                {block.columns.map(function (col) {
                  return <th key={col.key} style={{ padding: '4px 6px', textAlign: col.alignment, fontWeight: 600 }}>{col.label}</th>;
                })}
              </tr>
            </thead>
            <tbody>
              {[
                { tijd: '14:30', wat: 'Brisket', type: 'kern', temp: '92.5', status: 'ok', notitie: '' },
                { tijd: '08:00', wat: 'Koeling', type: 'opslag', temp: '3.2', status: 'ok', notitie: '' },
              ].map(function (row, ri) {
                return (
                  <tr key={ri} style={{ borderBottom: '1px solid #eee' }}>
                    {block.columns.map(function (col) {
                      const val = (row as Record<string, string>)[col.key] || '';
                      const statusColor = col.key === 'status' ? (val === 'ok' ? block.statusColors.ok : val === 'warn' ? block.statusColors.warn : val === 'danger' ? block.statusColors.danger : undefined) : undefined;
                      return <td key={col.key} style={{ padding: '3px 6px', textAlign: col.alignment, color: statusColor || '#555', fontWeight: statusColor ? 600 : 400 }}>{val}</td>;
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      );

    default:
      return <div style={{ padding: 8, color: '#999', fontSize: 11 }}>Onbekend blok: {(block as TemplateBlock).type}</div>;
  }
}
