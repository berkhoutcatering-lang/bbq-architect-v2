'use client';

import { useState } from 'react';
import { Trash2, Copy, Lock, Unlock, ChevronDown, ChevronRight } from 'lucide-react';
import VariablePicker from './VariablePicker';
import type { TemplateBlock, PageSettings, PdfTemplate } from '@/types/template.types';

/* eslint-disable @typescript-eslint/no-explicit-any */

interface Props {
  block: TemplateBlock | null;
  documentType: PdfTemplate['document_type'];
  onUpdate: (updates: Partial<TemplateBlock>) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  pageSettings: PageSettings;
  onPageSettingsChange: (ps: PageSettings) => void;
}

// Collapsible section
function Section({ title, defaultOpen, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen !== false);
  return (
    <div style={{ borderBottom: '1px solid var(--border)' }}>
      <button onClick={function () { setOpen(!open); }}
        style={{
          display: 'flex', alignItems: 'center', gap: 4, width: '100%',
          padding: '8px 12px', background: 'none', border: 'none', cursor: 'pointer',
          fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase',
          letterSpacing: '0.04em',
        }}>
        {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        {title}
      </button>
      {open && <div style={{ padding: '0 12px 10px' }}>{children}</div>}
    </div>
  );
}

// Brand-colour swatch values used in the picker preview.
// These mirror the preview-context branding (#9e781c primary, #8b6914 accent) so the
// user sees a representative chip; the renderer resolves brand_* tokens to the
// organisation's actual brand colours at PDF time.
const BRAND_PRIMARY_PREVIEW = '#9e781c';
const BRAND_ACCENT_PREVIEW = '#8b6914';

function ColorInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const isPrimary = value === 'brand_primary';
  const isAccent = value === 'brand_accent';
  const isCustom = !isPrimary && !isAccent;

  function chipStyle(active: boolean, color: string): React.CSSProperties {
    return {
      flex: 1,
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
      padding: '4px 6px',
      borderRadius: 4,
      border: active ? '2px solid var(--brand)' : '1px solid var(--border)',
      background: 'var(--bg)',
      color: 'var(--text)',
      fontSize: 10, fontWeight: 600,
      cursor: 'pointer',
      transition: 'border-color 0.1s',
    };
  }

  return (
    <div style={{ marginBottom: 6 }}>
      <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>{label}</label>
      {/* Quick-bind swatches — always visible so primary/accent are one click away */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
        <button
          type="button"
          title="Bind aan huisstijl primair — past automatisch aan op de organisatiekleur"
          aria-pressed={isPrimary}
          onClick={function () { onChange('brand_primary'); }}
          style={chipStyle(isPrimary, BRAND_PRIMARY_PREVIEW)}
        >
          <span aria-hidden="true" style={{ width: 12, height: 12, borderRadius: 3, background: BRAND_PRIMARY_PREVIEW, boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.15)' }} />
          Primair
        </button>
        <button
          type="button"
          title="Bind aan huisstijl accent — past automatisch aan op de organisatiekleur"
          aria-pressed={isAccent}
          onClick={function () { onChange('brand_accent'); }}
          style={chipStyle(isAccent, BRAND_ACCENT_PREVIEW)}
        >
          <span aria-hidden="true" style={{ width: 12, height: 12, borderRadius: 3, background: BRAND_ACCENT_PREVIEW, boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.15)' }} />
          Accent
        </button>
        <button
          type="button"
          title="Eigen kleur kiezen"
          aria-pressed={isCustom}
          onClick={function () { if (!isCustom) onChange('#333333'); }}
          style={chipStyle(isCustom, '#333333')}
        >
          Eigen
        </button>
      </div>
      {isCustom && (
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <input
            type="color"
            value={value}
            onChange={function (e) { onChange(e.target.value); }}
            aria-label={label + ' (eigen kleur kiezen)'}
            style={{ width: 28, height: 26, border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer', padding: 1, background: 'transparent' }}
          />
          <input
            type="text"
            value={value}
            onChange={function (e) { onChange(e.target.value); }}
            aria-label={label + ' hex'}
            spellCheck={false}
            style={{ flex: 1, padding: '3px 6px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 10, fontFamily: 'monospace' }}
          />
        </div>
      )}
    </div>
  );
}

function NumberInput({ label, value, onChange, min, max, step, suffix }: { label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; suffix?: string }) {
  return (
    <div style={{ marginBottom: 6 }}>
      <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 2 }}>{label}</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <input type="number" value={value} min={min} max={max} step={step || 1}
          onChange={function (e) { let v = Number(e.target.value); if (min !== undefined && v < min) v = min; if (max !== undefined && v > max) v = max; onChange(v); }}
          style={{ flex: 1, padding: '3px 6px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 11 }} />
        {suffix && <span style={{ fontSize: 9, color: 'var(--muted)' }}>{suffix}</span>}
      </div>
    </div>
  );
}

function SelectInput({ label, value, onChange, options }: { label: string; value: string; onChange: (v: any) => void; options: { value: string; label: string }[] }) {
  return (
    <div style={{ marginBottom: 6 }}>
      <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 2 }}>{label}</label>
      <select value={value} onChange={function (e) { onChange(e.target.value); }}
        style={{ width: '100%', padding: '3px 6px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 11 }}>
        {options.map(function (o) { return <option key={o.value} value={o.value}>{o.label}</option>; })}
      </select>
    </div>
  );
}

function CheckboxInput({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text)', cursor: 'pointer', marginBottom: 4 }}>
      <input type="checkbox" checked={checked} onChange={function (e) { onChange(e.target.checked); }} />
      {label}
    </label>
  );
}

function TextAreaInput({ label, value, onChange, documentType, onInsertVar }: { label: string; value: string; onChange: (v: string) => void; documentType: string; onInsertVar: (v: string) => void }) {
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
        <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--muted)' }}>{label}</label>
        <VariablePicker documentType={documentType as any} onInsert={onInsertVar} />
      </div>
      <textarea value={value} onChange={function (e) { onChange(e.target.value); }} rows={3}
        style={{ width: '100%', padding: '4px 6px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 11, resize: 'vertical' }} />
    </div>
  );
}

export default function BlockPropertiesPanel({ block, documentType, onUpdate, onDelete, onDuplicate, pageSettings, onPageSettingsChange }: Props) {
  // No block selected → page settings
  if (!block) {
    return (
      <div>
        <Section title="Pagina-instellingen" defaultOpen>
          <ColorInput label="Achtergrondkleur" value={pageSettings.backgroundColor} onChange={function (v) { onPageSettingsChange({ ...pageSettings, backgroundColor: v }); }} />
          <SelectInput label="Formaat" value={pageSettings.format} onChange={function (v) { onPageSettingsChange({ ...pageSettings, format: v as 'a4' | 'letter' }); }}
            options={[{ value: 'a4', label: 'A4' }, { value: 'letter', label: 'Letter' }]} />
          <SelectInput label="Orientatie" value={pageSettings.orientation} onChange={function (v) { onPageSettingsChange({ ...pageSettings, orientation: v as 'portrait' | 'landscape' }); }}
            options={[{ value: 'portrait', label: 'Staand' }, { value: 'landscape', label: 'Liggend' }]} />
        </Section>
        <Section title="Marges" defaultOpen>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            <NumberInput label="Boven" value={pageSettings.margins.top} onChange={function (v) { onPageSettingsChange({ ...pageSettings, margins: { ...pageSettings.margins, top: v } }); }} min={5} max={50} suffix="mm" />
            <NumberInput label="Rechts" value={pageSettings.margins.right} onChange={function (v) { onPageSettingsChange({ ...pageSettings, margins: { ...pageSettings.margins, right: v } }); }} min={5} max={50} suffix="mm" />
            <NumberInput label="Onder" value={pageSettings.margins.bottom} onChange={function (v) { onPageSettingsChange({ ...pageSettings, margins: { ...pageSettings.margins, bottom: v } }); }} min={5} max={50} suffix="mm" />
            <NumberInput label="Links" value={pageSettings.margins.left} onChange={function (v) { onPageSettingsChange({ ...pageSettings, margins: { ...pageSettings.margins, left: v } }); }} min={5} max={50} suffix="mm" />
          </div>
        </Section>
        <div style={{ padding: '12px', fontSize: 10, color: 'var(--muted)', lineHeight: 1.5, textAlign: 'center', fontStyle: 'italic' }}>
          Klik op een blok om eigenschappen te bewerken
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Block header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 12px', borderBottom: '1px solid var(--border)', background: 'color-mix(in srgb, var(--blue) 3%, transparent)',
      }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--blue)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          {block.type.replace('_', ' ')}
        </span>
        <div style={{ display: 'flex', gap: 2 }}>
          <button onClick={onDuplicate} title="Dupliceer" style={{ padding: 3, borderRadius: 4, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}>
            <Copy size={12} />
          </button>
          <button onClick={function () { onUpdate({ locked: !block.locked }); }} title={block.locked ? 'Ontgrendel' : 'Vergrendel'}
            style={{ padding: 3, borderRadius: 4, background: 'none', border: 'none', cursor: 'pointer', color: block.locked ? 'var(--amber)' : 'var(--muted)' }}>
            {block.locked ? <Lock size={12} /> : <Unlock size={12} />}
          </button>
          <button onClick={onDelete} title="Verwijder" style={{ padding: 3, borderRadius: 4, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)' }}>
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {/* Position & Size — all block types */}
      <Section title="Positie & afmeting" defaultOpen={false}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          <NumberInput label="X" value={Math.round((block.x || 0) * 10) / 10} onChange={function (v) { onUpdate({ x: v } as any); }} min={0} max={300} step={0.5} suffix="mm" />
          <NumberInput label="Y" value={Math.round((block.y || 0) * 10) / 10} onChange={function (v) { onUpdate({ y: v } as any); }} min={0} max={400} step={0.5} suffix="mm" />
          <NumberInput label="Breedte" value={Math.round((block.width || 180) * 10) / 10} onChange={function (v) { onUpdate({ width: v } as any); }} min={10} max={300} step={0.5} suffix="mm" />
          <NumberInput label="Hoogte" value={Math.round((block.height || 20) * 10) / 10} onChange={function (v) { onUpdate({ height: v } as any); }} min={5} max={400} step={0.5} suffix="mm" />
        </div>
        <div style={{ marginTop: 6, display: 'flex', gap: 4 }}>
          <button onClick={function () { onUpdate({ zIndex: (block.zIndex || 0) + 1 } as any); }}
            style={{ flex: 1, padding: '4px 8px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg)', cursor: 'pointer', fontSize: 10, color: 'var(--text)' }}>
            Naar voren
          </button>
          <button onClick={function () { onUpdate({ zIndex: Math.max(0, (block.zIndex || 0) - 1) } as any); }}
            style={{ flex: 1, padding: '4px 8px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg)', cursor: 'pointer', fontSize: 10, color: 'var(--text)' }}>
            Naar achteren
          </button>
        </div>
      </Section>

      {/* Text block */}
      {block.type === 'text' && (
        <>
          <Section title="Inhoud" defaultOpen>
            <TextAreaInput label="Tekst" value={block.content} documentType={documentType}
              onChange={function (v) { onUpdate({ content: v }); }}
              onInsertVar={function (v) { onUpdate({ content: block.content + v }); }} />
          </Section>
          <Section title="Typografie" defaultOpen>
            <NumberInput label="Lettergrootte" value={block.fontSize} onChange={function (v) { onUpdate({ fontSize: v }); }} min={6} max={36} suffix="pt" />
            <SelectInput label="Gewicht" value={block.fontWeight} onChange={function (v) { onUpdate({ fontWeight: v }); }}
              options={[{ value: 'normal', label: 'Normaal' }, { value: 'bold', label: 'Vet' }]} />
            <SelectInput label="Stijl" value={block.fontStyle} onChange={function (v) { onUpdate({ fontStyle: v }); }}
              options={[{ value: 'normal', label: 'Normaal' }, { value: 'italic', label: 'Cursief' }]} />
            <SelectInput label="Uitlijning" value={block.alignment} onChange={function (v) { onUpdate({ alignment: v }); }}
              options={[{ value: 'left', label: 'Links' }, { value: 'center', label: 'Midden' }, { value: 'right', label: 'Rechts' }]} />
            <NumberInput label="Regelhoogte" value={block.lineHeight} onChange={function (v) { onUpdate({ lineHeight: v }); }} min={1} max={3} step={0.1} />
          </Section>
          <Section title="Stijl">
            <ColorInput label="Kleur" value={block.color} onChange={function (v) { onUpdate({ color: v }); }} />
          </Section>
        </>
      )}

      {/* Logo block */}
      {block.type === 'logo' && (
        <Section title="Logo instellingen" defaultOpen>
          <SelectInput label="Variant" value={block.variant} onChange={function (v) { onUpdate({ variant: v }); }}
            options={[{ value: 'light', label: 'Lichte achtergrond' }, { value: 'dark', label: 'Donkere achtergrond' }]} />
          <NumberInput label="Max breedte" value={block.maxWidth} onChange={function (v) { onUpdate({ maxWidth: v }); }} min={10} max={150} suffix="mm" />
          <NumberInput label="Max hoogte" value={block.maxHeight} onChange={function (v) { onUpdate({ maxHeight: v }); }} min={5} max={80} suffix="mm" />
          <SelectInput label="Uitlijning" value={block.alignment} onChange={function (v) { onUpdate({ alignment: v }); }}
            options={[{ value: 'left', label: 'Links' }, { value: 'center', label: 'Midden' }, { value: 'right', label: 'Rechts' }]} />
        </Section>
      )}

      {/* Document badge */}
      {block.type === 'document_badge' && (
        <>
          <Section title="Inhoud" defaultOpen>
            <TextAreaInput label="Tekst" value={block.text} documentType={documentType}
              onChange={function (v) { onUpdate({ text: v }); }}
              onInsertVar={function (v) { onUpdate({ text: block.text + v }); }} />
            <NumberInput label="Lettergrootte" value={block.fontSize} onChange={function (v) { onUpdate({ fontSize: v }); }} min={8} max={24} suffix="pt" />
          </Section>
          <Section title="Stijl">
            <ColorInput label="Achtergrond" value={block.backgroundColor} onChange={function (v) { onUpdate({ backgroundColor: v }); }} />
            <ColorInput label="Tekstkleur" value={block.textColor} onChange={function (v) { onUpdate({ textColor: v }); }} />
          </Section>
        </>
      )}

      {/* Divider */}
      {block.type === 'divider' && (
        <Section title="Lijn instellingen" defaultOpen>
          <SelectInput label="Stijl" value={block.style} onChange={function (v) { onUpdate({ style: v }); }}
            options={[{ value: 'solid', label: 'Doorgetrokken' }, { value: 'dashed', label: 'Gestreept' }, { value: 'dotted', label: 'Gestippeld' }]} />
          <ColorInput label="Kleur" value={block.color} onChange={function (v) { onUpdate({ color: v }); }} />
          <NumberInput label="Dikte" value={block.thickness} onChange={function (v) { onUpdate({ thickness: v }); }} min={1} max={5} suffix="px" />
        </Section>
      )}

      {/* Spacer */}
      {block.type === 'spacer' && (
        <Section title="Ruimte instellingen" defaultOpen>
          <NumberInput label="Hoogte" value={block.height} onChange={function (v) { onUpdate({ height: v }); }} min={1} max={50} suffix="mm" />
        </Section>
      )}

      {/* Footer */}
      {block.type === 'footer' && (
        <>
          <Section title="Inhoud" defaultOpen>
            <TextAreaInput label="Tekst" value={block.content} documentType={documentType}
              onChange={function (v) { onUpdate({ content: v }); }}
              onInsertVar={function (v) { onUpdate({ content: block.content + v }); }} />
          </Section>
          <Section title="Typografie">
            <NumberInput label="Lettergrootte" value={block.fontSize} onChange={function (v) { onUpdate({ fontSize: v }); }} min={5} max={14} suffix="pt" />
            <ColorInput label="Kleur" value={block.color} onChange={function (v) { onUpdate({ color: v }); }} />
            <SelectInput label="Uitlijning" value={block.alignment} onChange={function (v) { onUpdate({ alignment: v }); }}
              options={[{ value: 'left', label: 'Links' }, { value: 'center', label: 'Midden' }, { value: 'right', label: 'Rechts' }]} />
          </Section>
          <Section title="Rand">
            <CheckboxInput label="Bovenlijn tonen" checked={block.showTopBorder} onChange={function (v) { onUpdate({ showTopBorder: v }); }} />
            {block.showTopBorder && <ColorInput label="Lijnkleur" value={block.borderColor} onChange={function (v) { onUpdate({ borderColor: v }); }} />}
          </Section>
        </>
      )}

      {/* Totals */}
      {block.type === 'totals' && (
        <>
          <Section title="Zichtbaarheid" defaultOpen>
            <CheckboxInput label="Subtotaal tonen" checked={block.showSubtotaal} onChange={function (v) { onUpdate({ showSubtotaal: v }); }} />
            <CheckboxInput label="BTW tonen" checked={block.showBtw} onChange={function (v) { onUpdate({ showBtw: v }); }} />
            <CheckboxInput label="Totaal tonen" checked={block.showTotaal} onChange={function (v) { onUpdate({ showTotaal: v }); }} />
          </Section>
          <Section title="Stijl">
            <ColorInput label="Totaal balk kleur" value={block.totalBarColor} onChange={function (v) { onUpdate({ totalBarColor: v }); }} />
            <SelectInput label="Uitlijning" value={block.alignment} onChange={function (v) { onUpdate({ alignment: v }); }}
              options={[{ value: 'left', label: 'Links' }, { value: 'right', label: 'Rechts' }]} />
            <NumberInput label="Lettergrootte" value={block.fontSize} onChange={function (v) { onUpdate({ fontSize: v }); }} min={8} max={16} suffix="pt" />
          </Section>
        </>
      )}

      {/* Payment details */}
      {block.type === 'payment_details' && (
        <>
          <Section title="Inhoud" defaultOpen>
            <TextAreaInput label="Tekst" value={block.content} documentType={documentType}
              onChange={function (v) { onUpdate({ content: v }); }}
              onInsertVar={function (v) { onUpdate({ content: block.content + v }); }} />
          </Section>
          <Section title="Stijl">
            <ColorInput label="Achtergrond" value={block.backgroundColor} onChange={function (v) { onUpdate({ backgroundColor: v }); }} />
            <ColorInput label="Randkleur" value={block.borderColor} onChange={function (v) { onUpdate({ borderColor: v }); }} />
            <NumberInput label="Lettergrootte" value={block.fontSize} onChange={function (v) { onUpdate({ fontSize: v }); }} min={7} max={14} suffix="pt" />
          </Section>
        </>
      )}

      {/* Menu */}
      {block.type === 'menu' && (
        <>
          <Section title="Layout" defaultOpen>
            <SelectInput label="Kolommen" value={block.layout} onChange={function (v) { onUpdate({ layout: v }); }}
              options={[{ value: '1col', label: '1 kolom' }, { value: '2col', label: '2 kolommen' }]} />
            <SelectInput label="Gang scheiding" value={block.gangSeparator} onChange={function (v) { onUpdate({ gangSeparator: v }); }}
              options={[{ value: 'line', label: 'Lijn' }, { value: 'space', label: 'Ruimte' }, { value: 'none', label: 'Geen' }]} />
            <CheckboxInput label="Beschrijvingen tonen" checked={block.showDescriptions} onChange={function (v) { onUpdate({ showDescriptions: v }); }} />
          </Section>
          <Section title="Gang titels">
            <NumberInput label="Lettergrootte" value={block.gangTitleStyle.fontSize} onChange={function (v) { onUpdate({ gangTitleStyle: { ...block.gangTitleStyle, fontSize: v } }); }} min={8} max={18} suffix="pt" />
            <ColorInput label="Kleur" value={block.gangTitleStyle.color} onChange={function (v) { onUpdate({ gangTitleStyle: { ...block.gangTitleStyle, color: v } }); }} />
            <SelectInput label="Uitlijning" value={block.gangTitleStyle.alignment} onChange={function (v) { onUpdate({ gangTitleStyle: { ...block.gangTitleStyle, alignment: v } }); }}
              options={[{ value: 'left', label: 'Links' }, { value: 'center', label: 'Midden' }]} />
            <CheckboxInput label="Hoofdletters" checked={block.gangTitleStyle.uppercase} onChange={function (v) { onUpdate({ gangTitleStyle: { ...block.gangTitleStyle, uppercase: v } }); }} />
          </Section>
        </>
      )}

      {/* Image */}
      {block.type === 'image' && (
        <Section title="Afbeelding instellingen" defaultOpen>
          <NumberInput label="Max breedte" value={block.maxWidth} onChange={function (v) { onUpdate({ maxWidth: v }); }} min={10} max={200} suffix="mm" />
          <NumberInput label="Max hoogte" value={block.maxHeight} onChange={function (v) { onUpdate({ maxHeight: v }); }} min={10} max={250} suffix="mm" />
          <SelectInput label="Uitlijning" value={block.alignment} onChange={function (v) { onUpdate({ alignment: v }); }}
            options={[{ value: 'left', label: 'Links' }, { value: 'center', label: 'Midden' }, { value: 'right', label: 'Rechts' }]} />
        </Section>
      )}

      {/* Shape */}
      {block.type === 'shape' && (
        <>
          <Section title="Vorm" defaultOpen>
            <SelectInput label="Type" value={block.shape} onChange={function (v) { onUpdate({ shape: v }); }}
              options={[
                { value: 'rectangle', label: 'Rechthoek' },
                { value: 'rounded_rectangle', label: 'Afgeronde rechthoek' },
                { value: 'circle', label: 'Cirkel' },
                { value: 'ellipse', label: 'Ellips' },
                { value: 'line', label: 'Lijn' },
                { value: 'triangle', label: 'Driehoek' },
                { value: 'diamond', label: 'Ruit' },
              ]} />
            {block.shape === 'rounded_rectangle' && (
              <NumberInput label="Hoekradius" value={block.cornerRadius} onChange={function (v) { onUpdate({ cornerRadius: v }); }} min={0} max={30} suffix="mm" />
            )}
          </Section>
          <Section title="Stijl" defaultOpen>
            <ColorInput label="Vulkleur" value={block.fillColor === 'none' ? '#e0e0e0' : block.fillColor} onChange={function (v) { onUpdate({ fillColor: v }); }} />
            <CheckboxInput label="Geen vulling" checked={block.fillColor === 'none'} onChange={function (v) { onUpdate({ fillColor: v ? 'none' : '#e0e0e0' }); }} />
            <ColorInput label="Randkleur" value={block.strokeColor === 'none' ? '#333333' : block.strokeColor} onChange={function (v) { onUpdate({ strokeColor: v }); }} />
            <CheckboxInput label="Geen rand" checked={block.strokeColor === 'none'} onChange={function (v) { onUpdate({ strokeColor: v ? 'none' : '#333333' }); }} />
            <NumberInput label="Randdikte" value={block.strokeWidth} onChange={function (v) { onUpdate({ strokeWidth: v }); }} min={0} max={10} step={0.5} suffix="pt" />
            <NumberInput label="Transparantie" value={Math.round(block.opacity * 100)} onChange={function (v) { onUpdate({ opacity: v / 100 }); }} min={0} max={100} suffix="%" />
          </Section>
        </>
      )}

      {/* Icon */}
      {block.type === 'icon' && (
        <Section title="Icoon" defaultOpen>
          <SelectInput label="Symbool" value={block.icon} onChange={function (v) { onUpdate({ icon: v }); }}
            options={[
              { value: 'star', label: 'Ster' },
              { value: 'heart', label: 'Hart' },
              { value: 'check', label: 'Vinkje' },
              { value: 'plus', label: 'Plus' },
              { value: 'arrow_right', label: 'Pijl rechts' },
              { value: 'flame', label: 'Vlam' },
              { value: 'leaf', label: 'Blad' },
              { value: 'sparkle', label: 'Glinstering' },
              { value: 'circle_dot', label: 'Cirkel + stip' },
              { value: 'diamond_small', label: 'Kleine ruit' },
            ]} />
          <ColorInput label="Kleur" value={block.color} onChange={function (v) { onUpdate({ color: v }); }} />
          <NumberInput label="Grootte" value={block.size} onChange={function (v) { onUpdate({ size: v }); }} min={3} max={60} suffix="mm" />
        </Section>
      )}

      {/* Stamp */}
      {block.type === 'stamp' && (
        <>
          <Section title="Tekst" defaultOpen>
            <TextAreaInput label="Hoofdtekst" value={block.text} documentType={documentType}
              onChange={function (v) { onUpdate({ text: v }); }}
              onInsertVar={function (v) { onUpdate({ text: block.text + v }); }} />
            <TextAreaInput label="Subtekst" value={block.subtext} documentType={documentType}
              onChange={function (v) { onUpdate({ subtext: v }); }}
              onInsertVar={function (v) { onUpdate({ subtext: block.subtext + v }); }} />
            <NumberInput label="Lettergrootte" value={block.fontSize} onChange={function (v) { onUpdate({ fontSize: v }); }} min={8} max={28} suffix="pt" />
          </Section>
          <Section title="Vorm">
            <SelectInput label="Vorm" value={block.shape} onChange={function (v) { onUpdate({ shape: v }); }}
              options={[{ value: 'circle', label: 'Cirkel' }, { value: 'rounded', label: 'Afgerond' }, { value: 'square', label: 'Vierkant' }]} />
            <SelectInput label="Randstijl" value={block.borderStyle} onChange={function (v) { onUpdate({ borderStyle: v }); }}
              options={[{ value: 'solid', label: 'Enkel' }, { value: 'double', label: 'Dubbel' }, { value: 'dashed', label: 'Gestreept' }]} />
            <ColorInput label="Kleur" value={block.color} onChange={function (v) { onUpdate({ color: v }); }} />
            <NumberInput label="Rotatie" value={block.rotation} onChange={function (v) { onUpdate({ rotation: v }); }} min={-45} max={45} suffix="°" />
          </Section>
        </>
      )}

      {/* Border Frame */}
      {block.type === 'border_frame' && (
        <>
          <Section title="Randstijl" defaultOpen>
            <SelectInput label="Stijl" value={block.style} onChange={function (v) { onUpdate({ style: v }); }}
              options={[
                { value: 'corners', label: 'Hoek-accenten' },
                { value: 'single', label: 'Enkele lijn' },
                { value: 'double', label: 'Dubbele lijn' },
                { value: 'rounded', label: 'Afgerond' },
                { value: 'dashed', label: 'Gestreept' },
                { value: 'dotted', label: 'Gestippeld' },
                { value: 'ornament', label: 'Ornament' },
              ]} />
            <ColorInput label="Kleur" value={block.color} onChange={function (v) { onUpdate({ color: v }); }} />
            <NumberInput label="Dikte" value={block.thickness} onChange={function (v) { onUpdate({ thickness: v }); }} min={0.5} max={6} step={0.5} suffix="pt" />
            {(block.style === 'corners' || block.style === 'ornament') && (
              <NumberInput label="Hoekgrootte" value={block.cornerSize} onChange={function (v) { onUpdate({ cornerSize: v }); }} min={4} max={40} suffix="mm" />
            )}
          </Section>
          <Section title="Positionering">
            <CheckboxInput label="Volg blokafmeting" checked={block.useBlockBounds} onChange={function (v) { onUpdate({ useBlockBounds: v }); }} />
            {!block.useBlockBounds && (
              <NumberInput label="Inspringing" value={block.inset} onChange={function (v) { onUpdate({ inset: v }); }} min={0} max={30} suffix="mm" />
            )}
            <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4, fontStyle: 'italic', lineHeight: 1.4 }}>
              {block.useBlockBounds ? 'Rand volgt dit blok — sleep hem naar de gewenste plek.' : 'Rand spant de hele pagina af met de ingestelde inspringing.'}
            </div>
          </Section>
        </>
      )}

      {/* Items table - compact */}
      {block.type === 'items_table' && (
        <>
          <Section title="Tabel stijl" defaultOpen>
            <CheckboxInput label="Rasterlijnen tonen" checked={block.showGridLines} onChange={function (v) { onUpdate({ showGridLines: v }); }} />
          </Section>
          <Section title="Header">
            <ColorInput label="Achtergrond" value={block.headerStyle.backgroundColor} onChange={function (v) { onUpdate({ headerStyle: { ...block.headerStyle, backgroundColor: v } }); }} />
            <ColorInput label="Tekstkleur" value={block.headerStyle.textColor} onChange={function (v) { onUpdate({ headerStyle: { ...block.headerStyle, textColor: v } }); }} />
            <NumberInput label="Lettergrootte" value={block.headerStyle.fontSize} onChange={function (v) { onUpdate({ headerStyle: { ...block.headerStyle, fontSize: v } }); }} min={7} max={14} suffix="pt" />
          </Section>
          <Section title="Body">
            <NumberInput label="Lettergrootte" value={block.bodyStyle.fontSize} onChange={function (v) { onUpdate({ bodyStyle: { ...block.bodyStyle, fontSize: v } }); }} min={7} max={14} suffix="pt" />
            <ColorInput label="Tekstkleur" value={block.bodyStyle.textColor} onChange={function (v) { onUpdate({ bodyStyle: { ...block.bodyStyle, textColor: v } }); }} />
          </Section>
        </>
      )}
    </div>
  );
}
