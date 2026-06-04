'use client';

import { X } from 'lucide-react';
import { useTemplateBranding } from './TemplateBrandingContext';
import { STARTER_TEMPLATES, type StarterTemplate } from '@/lib/templateDefaults';
import type { TemplateBlock, PdfTemplate } from '@/types/template.types';

interface Props {
  documentType: PdfTemplate['document_type'];
  pendingStarter: StarterTemplate | null;
  onSelect: (starter: StarterTemplate) => void;
  onApply: () => void;
  onClose: () => void;
}

export default function StarterPicker({ documentType, pendingStarter, onSelect, onApply, onClose }: Props) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 99998,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.45)', padding: 20,
    }} onClick={onClose}>
      <div onClick={function (e) { e.stopPropagation(); }} style={{
        background: 'var(--card)', borderRadius: 10, maxWidth: 960, width: '100%', maxHeight: '90vh',
        boxShadow: '0 20px 60px rgba(0,0,0,.25)', display: 'flex', flexDirection: 'column', overflow: 'hidden',
        border: '1px solid var(--border)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Sjabloon kiezen</div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>Begin met een kant-en-klare lay-out — je past hem daarna volledig aan.</div>
          </div>
          <button onClick={onClose}
            style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 6, color: 'var(--muted)' }}>
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: 20, overflowY: 'auto', flex: 1, background: 'var(--bg)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
            {(STARTER_TEMPLATES[documentType] || []).map(function (starter) {
              const isPending = pendingStarter?.id === starter.id;
              return (
                <div key={starter.id}
                  onClick={function () { onSelect(starter); }}
                  style={{
                    background: 'var(--card)', borderRadius: 8,
                    border: isPending ? '2px solid var(--brand)' : '1px solid var(--border)',
                    padding: 14, cursor: 'pointer', transition: 'all 0.15s',
                    boxShadow: isPending ? '0 4px 12px color-mix(in srgb, var(--brand) 18%, transparent)' : '0 1px 3px rgba(0,0,0,.04)',
                  }}>
                  <StarterThumbnail starter={starter} documentType={documentType} />
                  <div style={{ marginTop: 10, fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{starter.name}</div>
                  <div style={{ marginTop: 4, fontSize: 11, color: 'var(--muted)', lineHeight: 1.5 }}>{starter.description}</div>
                  <div style={{ marginTop: 8, fontSize: 10, color: 'var(--muted-light)' }}>{starter.blocks.length} blokken</div>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '14px 20px', borderTop: '1px solid var(--border)', background: 'var(--card)' }}>
          <button onClick={onClose}
            style={{ padding: '8px 16px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--card)', cursor: 'pointer', fontSize: 12, color: 'var(--muted)' }}>
            Annuleren
          </button>
          <button onClick={onApply}
            disabled={!pendingStarter}
            style={{
              padding: '8px 18px', borderRadius: 4, border: 'none', cursor: pendingStarter ? 'pointer' : 'default',
              background: pendingStarter ? 'var(--brand)' : 'var(--border)',
              color: 'var(--brand-background, #fff)', fontSize: 12, fontWeight: 600,
            }}>
            Sjabloon toepassen
          </button>
        </div>
      </div>
    </div>
  );
}

function StarterThumbnail({ starter, documentType }: { starter: StarterTemplate; documentType: PdfTemplate['document_type'] }) {
  const branding = useTemplateBranding();
  const bg = starter.pageSettings.backgroundColor;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const frameBlock = starter.blocks.find(function (b) { return b.type === 'border_frame'; }) as any;
  const accent = documentType === 'haccp' ? '#c83232' : branding.primary;
  const frameColor = frameBlock ? (frameBlock.color === 'brand_primary' ? accent : frameBlock.color) : null;

  function frameOverlay() {
    if (!frameBlock || !frameColor) return null;
    const style = frameBlock.style;
    if (style === 'single' || style === 'dashed' || style === 'dotted' || style === 'rounded') {
      return <div style={{
        position: 'absolute', inset: '4%', pointerEvents: 'none',
        border: '1px ' + (style === 'rounded' ? 'solid' : style) + ' ' + frameColor,
        borderRadius: style === 'rounded' ? 3 : 0,
      }} />;
    }
    if (style === 'double') {
      return <div style={{ position: 'absolute', inset: '4%', border: '1px solid ' + frameColor, pointerEvents: 'none' }}>
        <div style={{ position: 'absolute', inset: 2, border: '1px solid ' + frameColor }} />
      </div>;
    }
    if (style === 'corners') {
      const sz = 10;
      return (
        <div style={{ position: 'absolute', inset: '4%', pointerEvents: 'none' }}>
          {[{ t: 0, l: 0 }, { t: 0, r: 0 }, { b: 0, l: 0 }, { b: 0, r: 0 }].map(function (p, i) {
            const lineStyle: React.CSSProperties = { position: 'absolute', ...p };
            return (
              <div key={i}>
                <div style={{ ...lineStyle, width: sz, height: 1, background: frameColor }} />
                <div style={{ ...lineStyle, width: 1, height: sz, background: frameColor }} />
              </div>
            );
          })}
        </div>
      );
    }
    if (style === 'ornament') {
      return <div style={{ position: 'absolute', inset: '4%', border: '1px solid ' + frameColor, pointerEvents: 'none' }}>
        {[{ t: 0, l: 0 }, { t: 0, r: 0 }, { b: 0, l: 0 }, { b: 0, r: 0 }].map(function (p, i) {
          return <div key={i} style={{ position: 'absolute', ...p, width: 5, height: 5, background: frameColor, clipPath: 'polygon(0 0, 100% 0, 0 100%)', transform: 'rotate(' + (i * 90) + 'deg)' }} />;
        })}
      </div>;
    }
    return null;
  }

  return (
    <div style={{
      width: '100%', aspectRatio: '210 / 297', background: bg,
      border: '1px solid #e0e0e0', borderRadius: 4, overflow: 'hidden', position: 'relative',
      boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.02)',
    }}>
      <div style={{ position: 'absolute', inset: 0, padding: '8%', display: 'flex', flexDirection: 'column', gap: 3 }}>
        {starter.blocks.slice(0, 9).map(function (b, i) {
          return <MiniBlock key={i} block={b} docType={documentType} />;
        })}
      </div>
      {frameOverlay()}
    </div>
  );
}

function MiniBlock({ block, docType }: { block: TemplateBlock; docType: PdfTemplate['document_type'] }) {
  const accent = docType === 'haccp' ? '#c83232' : docType === 'menukaart' ? '#c4a35a' : '#c4a35a';
  const muted = docType === 'menukaart' ? 'rgba(255,255,255,.4)' : '#d0d0d0';

  switch (block.type) {
    case 'logo':
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return <div style={{ height: 12, width: '35%', alignSelf: (block as any).alignment === 'center' ? 'center' : (block as any).alignment === 'right' ? 'flex-end' : 'flex-start', background: 'rgba(0,0,0,.06)', borderRadius: 2 }} />;
    case 'document_badge':
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return <div style={{ height: 8, width: '40%', alignSelf: 'center', background: (block as any).backgroundColor === 'brand_primary' ? accent : (block as any).backgroundColor, borderRadius: 1 }} />;
    case 'divider':
      return <div style={{ height: 1, width: '100%', background: accent }} />;
    case 'text':
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return <div style={{ height: 3, width: (block as any).alignment === 'center' ? '60%' : '80%', alignSelf: (block as any).alignment === 'center' ? 'center' : 'flex-start', background: muted, borderRadius: 1 }} />;
    case 'client_info':
      return (
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div style={{ height: 3, width: '80%', background: muted }} />
            <div style={{ height: 2, width: '60%', background: muted, opacity: 0.6 }} />
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div style={{ height: 2, width: '100%', background: muted, opacity: 0.6 }} />
            <div style={{ height: 2, width: '90%', background: muted, opacity: 0.6 }} />
          </div>
        </div>
      );
    case 'items_table':
      return (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ height: 4, width: '100%', background: accent }} />
          <div style={{ height: 2, width: '100%', background: muted, opacity: 0.4, marginTop: 1 }} />
          <div style={{ height: 2, width: '100%', background: muted, opacity: 0.4, marginTop: 1 }} />
        </div>
      );
    case 'menu':
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <div style={{ height: 3, width: '50%', alignSelf: 'center', background: accent }} />
          <div style={{ height: 2, width: '80%', alignSelf: 'center', background: muted, opacity: 0.6 }} />
          <div style={{ height: 2, width: '70%', alignSelf: 'center', background: muted, opacity: 0.6 }} />
        </div>
      );
    case 'totals':
      return <div style={{ height: 4, width: '40%', alignSelf: 'flex-end', background: accent, borderRadius: 1 }} />;
    case 'payment_details':
      return <div style={{ height: 14, width: '100%', background: 'rgba(0,0,0,.04)', border: '1px solid ' + accent, borderRadius: 2 }} />;
    case 'footer':
      return <div style={{ height: 2, width: '60%', alignSelf: 'center', background: muted, opacity: 0.5, marginTop: 'auto' }} />;
    case 'haccp_table':
      return (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ height: 4, width: '100%', background: accent }} />
          <div style={{ height: 2, width: '100%', background: muted, opacity: 0.4, marginTop: 1 }} />
          <div style={{ height: 2, width: '100%', background: muted, opacity: 0.4, marginTop: 1 }} />
        </div>
      );
    case 'image':
      return <div style={{ height: 24, width: '100%', background: 'rgba(0,0,0,.05)', border: '1px dashed ' + muted, borderRadius: 2 }} />;
    case 'spacer':
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return <div style={{ height: Math.min((block as any).height / 3, 8) }} />;
    case 'shape':
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return <div style={{ height: 6, width: '100%', background: (block as any).fillColor === 'brand_primary' ? accent : (block as any).fillColor, borderRadius: 1 }} />;
    case 'icon':
      return <div style={{ height: 5, width: 5, borderRadius: '50%', alignSelf: 'center', background: accent }} />;
    case 'stamp':
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return <div style={{ height: 14, width: 14, borderRadius: '50%', alignSelf: 'center', border: '1.5px solid ' + ((block as any).color || accent), margin: '2px 0' }} />;
    case 'border_frame':
      return null;
    default:
      return <div style={{ height: 3, width: '50%', background: muted, opacity: 0.4 }} />;
  }
}
