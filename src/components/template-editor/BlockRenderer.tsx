'use client';

import type { TemplateBlock, PdfTemplate } from '@/types/template.types';
import { TEMPLATE_VARIABLES } from '@/lib/templateVariables';
import { Image, Star, Heart, Check, Plus, ArrowRight, Flame, Leaf, Sparkles, Circle, Diamond } from 'lucide-react';

// ── Unit conversion: match jsPDF output on the 2.5px/mm canvas ──
const MM = 2.5;          // 1mm = 2.5px on canvas
const PT = 0.3528 * MM;  // 1pt = 0.3528mm = 0.882px on canvas

// Build example data map from TEMPLATE_VARIABLES
const EXAMPLE_DATA: Record<string, string> = {};
TEMPLATE_VARIABLES.forEach(function (v) { EXAMPLE_DATA[v.key] = v.example; });

// HTML preview of a block — calibrated to match jsPDF PDF output
export default function BlockRenderer({ block, documentType }: { block: TemplateBlock; documentType: PdfTemplate['document_type'] }) {
  const brandColor = '#c4a35a';
  const isDark = documentType === 'menukaart';

  function resolveC(c: string): string {
    if (c === 'brand_primary') return brandColor;
    if (c === 'brand_accent') return '#8b6914';
    return c;
  }

  function resolveVars(text: string): string {
    return text.replace(/\{\{(\w+)\}\}/g, function (_m, key) {
      return EXAMPLE_DATA[key] || key;
    });
  }

  switch (block.type) {
    case 'logo':
      return (
        <div style={{ textAlign: block.alignment, padding: 1 * MM + 'px 0' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4,
            width: block.maxWidth * MM, height: block.maxHeight * MM,
            background: isDark ? 'rgba(255,255,255,.04)' : 'rgba(158,120,28,.05)', borderRadius: 4,
            border: '1px dashed ' + (isDark ? 'rgba(196,163,90,.2)' : 'rgba(158,120,28,.2)'),
          }}>
            <Image size={14} style={{ color: brandColor, opacity: 0.4 }} />
            <span style={{ fontSize: 8, color: brandColor, opacity: 0.5, fontWeight: 500 }}>Logo</span>
          </div>
        </div>
      );

    case 'text':
      return (
        <div style={{
          fontSize: block.fontSize * PT, fontWeight: block.fontWeight,
          fontStyle: block.fontStyle, color: resolveC(block.color),
          textAlign: block.alignment, lineHeight: block.lineHeight,
          padding: 1 * MM + 'px 0', whiteSpace: 'pre-wrap',
        }}>
          {resolveVars(block.content)}
        </div>
      );

    case 'client_info':
      return (
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: 1 * MM + 'px 0', gap: 8 * MM }}>
          <div>
            {block.fields.filter(function (f) { return f.visible && ['client_naam', 'client_adres'].includes(f.key); }).map(function (f) {
              return <div key={f.key} style={{ fontSize: (f.bold ? 11 : 9) * PT, fontWeight: f.bold ? 700 : 400, color: isDark ? '#e8e0d0' : '#333', marginBottom: 1 * MM }}>
                {f.label ? f.label + ': ' : ''}{EXAMPLE_DATA[f.key] || f.key}
              </div>;
            })}
          </div>
          <div style={{ textAlign: 'right', fontSize: 9 * PT, color: isDark ? '#999' : '#666' }}>
            {block.fields.filter(function (f) { return f.visible && !['client_naam', 'client_adres'].includes(f.key); }).map(function (f) {
              return <div key={f.key} style={{ marginBottom: 1 * MM }}>{f.label}: <strong style={{ color: isDark ? '#e8e0d0' : '#333' }}>{EXAMPLE_DATA[f.key] || f.key}</strong></div>;
            })}
          </div>
        </div>
      );

    case 'document_badge':
      return (
        <div style={{ textAlign: 'center', padding: 2 * MM + 'px 0' }}>
          <span style={{
            display: 'inline-block', padding: 2 * MM + 'px ' + 8 * MM + 'px', borderRadius: 4,
            background: resolveC(block.backgroundColor), color: resolveC(block.textColor),
            fontSize: block.fontSize * PT, fontWeight: 700, letterSpacing: '0.15em',
          }}>
            {resolveVars(block.text)}
          </span>
        </div>
      );

    case 'items_table':
      return (
        <div style={{ padding: 2 * MM + 'px 0' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: resolveC(block.headerStyle.backgroundColor), color: resolveC(block.headerStyle.textColor) }}>
                {block.columns.map(function (col) {
                  return <th key={col.key} style={{ padding: 1.5 * MM + 'px ' + 2 * MM + 'px', textAlign: col.alignment, fontWeight: 600, fontSize: block.headerStyle.fontSize * PT, width: col.width + '%' }}>{col.label}</th>;
                })}
              </tr>
            </thead>
            <tbody>
              {[
                { omschrijving: 'BBQ Catering pakket Premium', qty: '1', prijs: '\u20ac 1.000,00', btw: '21%', prijs_incl_btw: '\u20ac 1.210,00', totaal: '\u20ac 1.000,00' },
                { omschrijving: 'Extra bediening (4 uur)', qty: '2', prijs: '\u20ac 125,00', btw: '21%', prijs_incl_btw: '\u20ac 151,25', totaal: '\u20ac 250,00' },
              ].map(function (row, ri) {
                return (
                  <tr key={ri} style={{ borderBottom: '1px solid ' + (isDark ? 'rgba(255,255,255,.06)' : '#f0f0f0') }}>
                    {block.columns.map(function (col) {
                      return <td key={col.key} style={{ padding: 1 * MM + 'px ' + 2 * MM + 'px', textAlign: col.alignment, color: isDark ? '#ccc' : resolveC(block.bodyStyle.textColor), fontSize: block.bodyStyle.fontSize * PT }}>
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
        <div style={{ padding: 2 * MM + 'px 0' }}>
          {block.layout === '2col' ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 * MM }}>
              {[
                { gang: 'Voorgerechten', dishes: ['Pulled Pork Slider', 'Coleslaw'] },
                { gang: 'Hoofdgerechten', dishes: ['Smoked Brisket', 'BBQ Ribs'] },
              ].map(function (g) {
                return (
                  <div key={g.gang}>
                    <div style={{ fontSize: block.gangTitleStyle.fontSize * PT, fontWeight: block.gangTitleStyle.fontWeight === 'bold' ? 700 : 400, color: resolveC(block.gangTitleStyle.color), textAlign: block.gangTitleStyle.alignment, textTransform: block.gangTitleStyle.uppercase ? 'uppercase' : 'none', letterSpacing: block.gangTitleStyle.uppercase ? '0.06em' : 'normal', marginBottom: 1.5 * MM }}>
                      {g.gang}
                    </div>
                    {g.dishes.map(function (d) {
                      return <div key={d} style={{ fontSize: block.dishNameStyle.fontSize * PT, color: resolveC(block.dishNameStyle.color), textAlign: block.gangTitleStyle.alignment, marginBottom: 0.5 * MM }}>{d}</div>;
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
                  <div key={g.gang} style={{ marginBottom: 3 * MM }}>
                    <div style={{ fontSize: block.gangTitleStyle.fontSize * PT, fontWeight: block.gangTitleStyle.fontWeight === 'bold' ? 700 : 400, color: resolveC(block.gangTitleStyle.color), textAlign: block.gangTitleStyle.alignment, textTransform: block.gangTitleStyle.uppercase ? 'uppercase' : 'none', letterSpacing: block.gangTitleStyle.uppercase ? '0.06em' : 'normal', marginBottom: 1 * MM }}>
                      {g.gang}
                    </div>
                    {g.dishes.map(function (d) {
                      return <div key={d} style={{ fontSize: block.dishNameStyle.fontSize * PT, color: resolveC(block.dishNameStyle.color), textAlign: block.gangTitleStyle.alignment, marginBottom: 0.5 * MM }}>{d}</div>;
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
        <div style={{ textAlign: block.alignment, padding: 1 * MM + 'px 0', fontSize: block.fontSize * PT }}>
          {block.showSubtotaal && <div style={{ color: isDark ? '#999' : '#666', marginBottom: 1 * MM }}>Subtotaal: <strong style={{ color: isDark ? '#e8e0d0' : '#333' }}>{EXAMPLE_DATA.subtotaal}</strong></div>}
          {block.showBtw && <div style={{ color: isDark ? '#999' : '#666', marginBottom: 1 * MM }}>BTW: <strong style={{ color: isDark ? '#e8e0d0' : '#333' }}>{EXAMPLE_DATA.btw_bedrag}</strong></div>}
          {block.showTotaal && (
            <span style={{ display: 'inline-block', padding: 1.5 * MM + 'px ' + 4 * MM + 'px', borderRadius: 3, background: resolveC(block.totalBarColor), color: '#fff', fontWeight: 700 }}>
              Totaal: {EXAMPLE_DATA.totaal}
            </span>
          )}
        </div>
      );

    case 'payment_details':
      return (
        <div style={{
          padding: 3 * MM + 'px ' + 4 * MM + 'px', borderRadius: 4, fontSize: block.fontSize * PT,
          background: resolveC(block.backgroundColor), border: '1px solid ' + resolveC(block.borderColor),
          color: isDark ? '#ccc' : '#555', whiteSpace: 'pre-wrap', lineHeight: 1.6,
        }}>
          {resolveVars(block.content)}
        </div>
      );

    case 'divider':
      return (
        <div style={{ padding: 1 * MM + 'px 0' }}>
          <hr style={{ border: 'none', borderTop: (block.thickness * MM) + 'px ' + block.style + ' ' + resolveC(block.color), margin: 0 }} />
        </div>
      );

    case 'spacer':
      return (
        <div style={{ height: block.height * MM, background: 'transparent' }} />
      );

    case 'image':
      return (
        <div style={{ textAlign: block.alignment, padding: 1 * MM + 'px 0' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4,
            width: block.maxWidth * MM, height: block.maxHeight * MM,
            background: 'rgba(0,0,0,.02)', borderRadius: 4, border: '1px dashed #ddd',
          }}>
            <Image size={14} style={{ color: '#bbb' }} />
            <span style={{ fontSize: 8, color: '#bbb' }}>Afbeelding</span>
          </div>
        </div>
      );

    case 'footer':
      return (
        <div style={{ padding: 2 * MM + 'px 0' }}>
          {block.showTopBorder && <hr style={{ border: 'none', borderTop: '1px solid ' + resolveC(block.borderColor), marginBottom: 2 * MM }} />}
          <div style={{ fontSize: block.fontSize * PT, color: resolveC(block.color), textAlign: block.alignment }}>
            {resolveVars(block.content)}
          </div>
        </div>
      );

    case 'haccp_table':
      return (
        <div style={{ padding: 2 * MM + 'px 0' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 9 * PT }}>
            <thead>
              <tr style={{ background: block.headerColor, color: '#fff' }}>
                {block.columns.map(function (col) {
                  return <th key={col.key} style={{ padding: 1.5 * MM + 'px ' + 2 * MM + 'px', textAlign: col.alignment, fontWeight: 600, width: col.width + '%' }}>{col.label}</th>;
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
                      return <td key={col.key} style={{ padding: 1 * MM + 'px ' + 2 * MM + 'px', textAlign: col.alignment, color: statusColor || '#555', fontWeight: statusColor ? 600 : 400 }}>{val}</td>;
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      );

    case 'shape': {
      const fill = block.fillColor && block.fillColor !== 'none' ? resolveC(block.fillColor) : 'transparent';
      const stroke = block.strokeColor && block.strokeColor !== 'none' ? resolveC(block.strokeColor) : 'transparent';
      const opacity = block.opacity ?? 1;
      const baseStyle: React.CSSProperties = {
        width: '100%', height: '100%', background: fill,
        border: stroke !== 'transparent' ? (block.strokeWidth * 0.5) + 'px solid ' + stroke : 'none',
        opacity,
      };
      if (block.shape === 'circle' || block.shape === 'ellipse') {
        return <div style={{ ...baseStyle, borderRadius: '50%' }} />;
      }
      if (block.shape === 'rounded_rectangle') {
        return <div style={{ ...baseStyle, borderRadius: (block.cornerRadius * MM) + 'px' }} />;
      }
      if (block.shape === 'rectangle') {
        return <div style={baseStyle} />;
      }
      if (block.shape === 'line') {
        return <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center' }}>
          <div style={{ width: '100%', height: Math.max(1, block.strokeWidth * 0.5) + 'px', background: stroke !== 'transparent' ? stroke : '#333', opacity }} />
        </div>;
      }
      if (block.shape === 'triangle') {
        return <div style={{ width: '100%', height: '100%', opacity }}>
          <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
            <polygon points="50,0 0,100 100,100" fill={fill} stroke={stroke} strokeWidth={block.strokeWidth} />
          </svg>
        </div>;
      }
      if (block.shape === 'diamond') {
        return <div style={{ width: '100%', height: '100%', opacity }}>
          <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
            <polygon points="50,0 100,50 50,100 0,50" fill={fill} stroke={stroke} strokeWidth={block.strokeWidth} />
          </svg>
        </div>;
      }
      return <div style={baseStyle} />;
    }

    case 'icon': {
      const ICON_MAP: Record<string, typeof Star> = {
        star: Star, heart: Heart, check: Check, plus: Plus, arrow_right: ArrowRight,
        flame: Flame, leaf: Leaf, sparkle: Sparkles, circle_dot: Circle, diamond_small: Diamond,
      };
      const Ico = ICON_MAP[block.icon] || Star;
      const px = block.size * MM;
      return (
        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Ico size={px} color={resolveC(block.color)} fill={block.icon === 'star' || block.icon === 'heart' || block.icon === 'flame' || block.icon === 'leaf' || block.icon === 'sparkle' || block.icon === 'diamond_small' ? resolveC(block.color) : 'none'} strokeWidth={2} />
        </div>
      );
    }

    case 'stamp': {
      const c = resolveC(block.color);
      const borderStyle = block.borderStyle === 'dashed' ? 'dashed' : 'solid';
      const isDouble = block.borderStyle === 'double';
      const shapeStyle: React.CSSProperties = {
        width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        border: '1.5px ' + borderStyle + ' ' + c, color: c,
        transform: 'rotate(' + block.rotation + 'deg)',
        fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
        boxShadow: isDouble ? 'inset 0 0 0 3px transparent, inset 0 0 0 4px ' + c : 'none',
      };
      if (block.shape === 'circle') shapeStyle.borderRadius = '50%';
      else if (block.shape === 'rounded') shapeStyle.borderRadius = '8px';
      return (
        <div style={shapeStyle}>
          <div style={{ fontSize: block.fontSize * PT, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', lineHeight: 1 }}>
            {resolveVars(block.text)}
          </div>
          {block.subtext && (
            <div style={{ fontSize: Math.max(block.fontSize * 0.55, 6) * PT, marginTop: 2, letterSpacing: '0.08em' }}>
              {resolveVars(block.subtext).toUpperCase()}
            </div>
          )}
        </div>
      );
    }

    case 'border_frame': {
      const c = resolveC(block.color);
      const t = Math.max(block.thickness * 0.5, 1);

      if (block.style === 'corners') {
        const s = (block.cornerSize * MM) + 'px';
        return (
          <div style={{ position: 'relative', width: '100%', height: '100%' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, width: s, height: t + 'px', background: c }} />
            <div style={{ position: 'absolute', top: 0, left: 0, width: t + 'px', height: s, background: c }} />
            <div style={{ position: 'absolute', top: 0, right: 0, width: s, height: t + 'px', background: c }} />
            <div style={{ position: 'absolute', top: 0, right: 0, width: t + 'px', height: s, background: c }} />
            <div style={{ position: 'absolute', bottom: 0, left: 0, width: s, height: t + 'px', background: c }} />
            <div style={{ position: 'absolute', bottom: 0, left: 0, width: t + 'px', height: s, background: c }} />
            <div style={{ position: 'absolute', bottom: 0, right: 0, width: s, height: t + 'px', background: c }} />
            <div style={{ position: 'absolute', bottom: 0, right: 0, width: t + 'px', height: s, background: c }} />
          </div>
        );
      }

      if (block.style === 'double') {
        return (
          <div style={{ width: '100%', height: '100%', border: t + 'px solid ' + c, padding: 3 }}>
            <div style={{ width: '100%', height: '100%', border: t + 'px solid ' + c }} />
          </div>
        );
      }

      if (block.style === 'ornament') {
        const s = (block.cornerSize * MM) / 2 + 'px';
        return (
          <div style={{ position: 'relative', width: '100%', height: '100%', border: '1px solid ' + c }}>
            {[{ t: 0, l: 0 }, { t: 0, r: 0 }, { b: 0, l: 0 }, { b: 0, r: 0 }].map(function (p, i) {
              const rot = i === 0 ? 0 : i === 1 ? 90 : i === 2 ? 270 : 180;
              return (
                <div key={i} style={{
                  position: 'absolute', top: p.t, left: p.l, right: p.r, bottom: p.b,
                  width: s, height: s,
                  background: c, clipPath: 'polygon(0 0, 100% 0, 0 100%)', transform: 'rotate(' + rot + 'deg)',
                }} />
              );
            })}
            <div style={{ position: 'absolute', top: -2, left: '50%', transform: 'translateX(-50%)', width: 4, height: 4, borderRadius: '50%', background: c }} />
            <div style={{ position: 'absolute', bottom: -2, left: '50%', transform: 'translateX(-50%)', width: 4, height: 4, borderRadius: '50%', background: c }} />
            <div style={{ position: 'absolute', left: -2, top: '50%', transform: 'translateY(-50%)', width: 4, height: 4, borderRadius: '50%', background: c }} />
            <div style={{ position: 'absolute', right: -2, top: '50%', transform: 'translateY(-50%)', width: 4, height: 4, borderRadius: '50%', background: c }} />
          </div>
        );
      }

      const styleKey = block.style === 'rounded' ? 'solid' : block.style;
      return (
        <div style={{
          width: '100%', height: '100%',
          border: t + 'px ' + styleKey + ' ' + c,
          borderRadius: block.style === 'rounded' ? '6px' : '0',
        }} />
      );
    }

    default:
      return <div style={{ padding: 2 * MM, color: '#999', fontSize: 10 * PT }}>Onbekend blok: {(block as TemplateBlock).type}</div>;
  }
}
