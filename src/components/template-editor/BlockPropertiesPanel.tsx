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

function ColorInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const isVar = value === 'brand_primary' || value === 'brand_accent';
  return (
    <div style={{ marginBottom: 6 }}>
      <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 2 }}>{label}</label>
      <div style={{ display: 'flex', gap: 4 }}>
        <select value={isVar ? value : 'custom'} onChange={function (e) { onChange(e.target.value === 'custom' ? 'var(--color-text-ghost)' : e.target.value); }}
          style={{ flex: 1, padding: '3px 6px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 10 }}>
          <option value="brand_primary">Huisstijl primair</option>
          <option value="brand_accent">Huisstijl accent</option>
          <option value="custom">Aangepast...</option>
        </select>
        {!isVar && (
          <input type="color" value={value} onChange={function (e) { onChange(e.target.value); }}
            style={{ width: 26, height: 26, border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer', padding: 1, background: 'transparent' }} />
        )}
      </div>
    </div>
  );
}

function NumberInput({ label, value, onChange, min, max, step, suffix }: { label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; suffix?: string }) {
  return (
    <div style={{ marginBottom: 6 }}>
      <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 2 }}>{label}</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <input type="number" value={value} min={min} max={max} step={step || 1}
          onChange={function (e) { onChange(Number(e.target.value)); }}
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
