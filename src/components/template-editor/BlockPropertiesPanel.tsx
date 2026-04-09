'use client';

import { Trash2, Copy, Lock, Unlock } from 'lucide-react';
import VariablePicker from './VariablePicker';
import type { TemplateBlock, PageSettings, PdfTemplate } from '@/types/template.types';

interface Props {
  block: TemplateBlock | null;
  documentType: PdfTemplate['document_type'];
  onUpdate: (updates: Partial<TemplateBlock>) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  pageSettings: PageSettings;
  onPageSettingsChange: (ps: PageSettings) => void;
}

function ColorInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const isVar = value === 'brand_primary' || value === 'brand_accent';
  return (
    <div style={{ marginBottom: 8 }}>
      <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 3 }}>{label}</label>
      <div style={{ display: 'flex', gap: 4 }}>
        <select value={isVar ? value : 'custom'} onChange={function (e) { onChange(e.target.value === 'custom' ? '#333333' : e.target.value); }}
          style={{ flex: 1, padding: '4px 6px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 11 }}>
          <option value="brand_primary">Huisstijl primair</option>
          <option value="brand_accent">Huisstijl accent</option>
          <option value="custom">Aangepast...</option>
        </select>
        {!isVar && (
          <input type="color" value={value} onChange={function (e) { onChange(e.target.value); }}
            style={{ width: 28, height: 28, border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', padding: 1, background: 'transparent' }} />
        )}
      </div>
    </div>
  );
}

function NumberInput({ label, value, onChange, min, max, step }: { label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 3 }}>{label}</label>
      <input type="number" value={value} min={min} max={max} step={step || 1}
        onChange={function (e) { onChange(Number(e.target.value)); }}
        style={{ width: '100%', padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 12 }} />
    </div>
  );
}

function SelectInput({ label, value, onChange, options }: { label: string; value: string; onChange: (v: any) => void; options: { value: string; label: string }[] }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 3 }}>{label}</label>
      <select value={value} onChange={function (e) { onChange(e.target.value); }}
        style={{ width: '100%', padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 12 }}>
        {options.map(function (o) { return <option key={o.value} value={o.value}>{o.label}</option>; })}
      </select>
    </div>
  );
}

export default function BlockPropertiesPanel({ block, documentType, onUpdate, onDelete, onDuplicate, pageSettings, onPageSettingsChange }: Props) {
  if (!block) {
    // Show page settings when no block is selected
    return (
      <div style={{ width: 260, flexShrink: 0, borderLeft: '1px solid var(--border)', background: 'var(--card)', padding: '16px 12px', overflowY: 'auto' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>Pagina-instellingen</div>
        <ColorInput label="Achtergrondkleur" value={pageSettings.backgroundColor} onChange={function (v) { onPageSettingsChange({ ...pageSettings, backgroundColor: v }); }} />
        <SelectInput label="Formaat" value={pageSettings.format} onChange={function (v) { onPageSettingsChange({ ...pageSettings, format: v as 'a4' | 'letter' }); }}
          options={[{ value: 'a4', label: 'A4' }, { value: 'letter', label: 'Letter' }]} />
        <SelectInput label="Orientatie" value={pageSettings.orientation} onChange={function (v) { onPageSettingsChange({ ...pageSettings, orientation: v as 'portrait' | 'landscape' }); }}
          options={[{ value: 'portrait', label: 'Staand' }, { value: 'landscape', label: 'Liggend' }]} />
        <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--muted)', marginTop: 12, marginBottom: 6 }}>Marges (mm)</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          <NumberInput label="Boven" value={pageSettings.margins.top} onChange={function (v) { onPageSettingsChange({ ...pageSettings, margins: { ...pageSettings.margins, top: v } }); }} min={5} max={50} />
          <NumberInput label="Rechts" value={pageSettings.margins.right} onChange={function (v) { onPageSettingsChange({ ...pageSettings, margins: { ...pageSettings.margins, right: v } }); }} min={5} max={50} />
          <NumberInput label="Onder" value={pageSettings.margins.bottom} onChange={function (v) { onPageSettingsChange({ ...pageSettings, margins: { ...pageSettings.margins, bottom: v } }); }} min={5} max={50} />
          <NumberInput label="Links" value={pageSettings.margins.left} onChange={function (v) { onPageSettingsChange({ ...pageSettings, margins: { ...pageSettings.margins, left: v } }); }} min={5} max={50} />
        </div>
        <div style={{ marginTop: 16, fontSize: 10, color: 'var(--muted)', lineHeight: 1.5 }}>
          Klik op een blok in het canvas om de eigenschappen te bewerken.
        </div>
      </div>
    );
  }

  return (
    <div style={{ width: 260, flexShrink: 0, borderLeft: '1px solid var(--border)', background: 'var(--card)', padding: '16px 12px', overflowY: 'auto' }}>
      {/* Block header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text)', textTransform: 'uppercase' }}>
          {block.type.replace('_', ' ')}
        </span>
        <div style={{ display: 'flex', gap: 4 }}>
          <button onClick={onDuplicate} title="Dupliceer" style={{ padding: 4, borderRadius: 4, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}>
            <Copy size={13} />
          </button>
          <button onClick={function () { onUpdate({ locked: !block.locked }); }} title={block.locked ? 'Ontgrendel' : 'Vergrendel'}
            style={{ padding: 4, borderRadius: 4, background: 'none', border: 'none', cursor: 'pointer', color: block.locked ? '#f59e0b' : 'var(--muted)' }}>
            {block.locked ? <Lock size={13} /> : <Unlock size={13} />}
          </button>
          <button onClick={onDelete} title="Verwijder" style={{ padding: 4, borderRadius: 4, background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444' }}>
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {/* Block-specific properties */}
      {block.type === 'text' && (
        <>
          <div style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
              <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--muted)' }}>Tekst</label>
              <VariablePicker documentType={documentType} onInsert={function (v) { onUpdate({ content: block.content + v }); }} />
            </div>
            <textarea value={block.content} onChange={function (e) { onUpdate({ content: e.target.value }); }} rows={3}
              style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 11, resize: 'vertical' }} />
          </div>
          <NumberInput label="Lettergrootte (pt)" value={block.fontSize} onChange={function (v) { onUpdate({ fontSize: v }); }} min={6} max={36} />
          <SelectInput label="Gewicht" value={block.fontWeight} onChange={function (v) { onUpdate({ fontWeight: v }); }}
            options={[{ value: 'normal', label: 'Normaal' }, { value: 'bold', label: 'Vet' }]} />
          <SelectInput label="Stijl" value={block.fontStyle} onChange={function (v) { onUpdate({ fontStyle: v }); }}
            options={[{ value: 'normal', label: 'Normaal' }, { value: 'italic', label: 'Cursief' }]} />
          <SelectInput label="Uitlijning" value={block.alignment} onChange={function (v) { onUpdate({ alignment: v }); }}
            options={[{ value: 'left', label: 'Links' }, { value: 'center', label: 'Midden' }, { value: 'right', label: 'Rechts' }]} />
          <ColorInput label="Kleur" value={block.color} onChange={function (v) { onUpdate({ color: v }); }} />
          <NumberInput label="Regelhoogte" value={block.lineHeight} onChange={function (v) { onUpdate({ lineHeight: v }); }} min={1} max={3} step={0.1} />
        </>
      )}

      {block.type === 'logo' && (
        <>
          <SelectInput label="Variant" value={block.variant} onChange={function (v) { onUpdate({ variant: v }); }}
            options={[{ value: 'light', label: 'Lichte achtergrond' }, { value: 'dark', label: 'Donkere achtergrond' }]} />
          <NumberInput label="Max breedte (mm)" value={block.maxWidth} onChange={function (v) { onUpdate({ maxWidth: v }); }} min={10} max={150} />
          <NumberInput label="Max hoogte (mm)" value={block.maxHeight} onChange={function (v) { onUpdate({ maxHeight: v }); }} min={5} max={80} />
          <SelectInput label="Uitlijning" value={block.alignment} onChange={function (v) { onUpdate({ alignment: v }); }}
            options={[{ value: 'left', label: 'Links' }, { value: 'center', label: 'Midden' }, { value: 'right', label: 'Rechts' }]} />
        </>
      )}

      {block.type === 'document_badge' && (
        <>
          <div style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
              <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--muted)' }}>Tekst</label>
              <VariablePicker documentType={documentType} onInsert={function (v) { onUpdate({ text: block.text + v }); }} />
            </div>
            <input value={block.text} onChange={function (e) { onUpdate({ text: e.target.value }); }}
              style={{ width: '100%', padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 12 }} />
          </div>
          <ColorInput label="Achtergrond" value={block.backgroundColor} onChange={function (v) { onUpdate({ backgroundColor: v }); }} />
          <ColorInput label="Tekstkleur" value={block.textColor} onChange={function (v) { onUpdate({ textColor: v }); }} />
          <NumberInput label="Lettergrootte" value={block.fontSize} onChange={function (v) { onUpdate({ fontSize: v }); }} min={8} max={24} />
        </>
      )}

      {block.type === 'divider' && (
        <>
          <SelectInput label="Stijl" value={block.style} onChange={function (v) { onUpdate({ style: v }); }}
            options={[{ value: 'solid', label: 'Doorgetrokken' }, { value: 'dashed', label: 'Gestreept' }, { value: 'dotted', label: 'Gestippeld' }]} />
          <ColorInput label="Kleur" value={block.color} onChange={function (v) { onUpdate({ color: v }); }} />
          <NumberInput label="Dikte (px)" value={block.thickness} onChange={function (v) { onUpdate({ thickness: v }); }} min={1} max={5} />
        </>
      )}

      {block.type === 'spacer' && (
        <NumberInput label="Hoogte (mm)" value={block.height} onChange={function (v) { onUpdate({ height: v }); }} min={1} max={50} />
      )}

      {block.type === 'footer' && (
        <>
          <div style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
              <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--muted)' }}>Inhoud</label>
              <VariablePicker documentType={documentType} onInsert={function (v) { onUpdate({ content: block.content + v }); }} />
            </div>
            <textarea value={block.content} onChange={function (e) { onUpdate({ content: e.target.value }); }} rows={2}
              style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 11, resize: 'vertical' }} />
          </div>
          <NumberInput label="Lettergrootte" value={block.fontSize} onChange={function (v) { onUpdate({ fontSize: v }); }} min={5} max={14} />
          <ColorInput label="Kleur" value={block.color} onChange={function (v) { onUpdate({ color: v }); }} />
          <SelectInput label="Uitlijning" value={block.alignment} onChange={function (v) { onUpdate({ alignment: v }); }}
            options={[{ value: 'left', label: 'Links' }, { value: 'center', label: 'Midden' }, { value: 'right', label: 'Rechts' }]} />
          <div style={{ marginBottom: 8 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text)', cursor: 'pointer' }}>
              <input type="checkbox" checked={block.showTopBorder} onChange={function (e) { onUpdate({ showTopBorder: e.target.checked }); }} />
              Bovenlijn tonen
            </label>
          </div>
          {block.showTopBorder && <ColorInput label="Lijnkleur" value={block.borderColor} onChange={function (v) { onUpdate({ borderColor: v }); }} />}
        </>
      )}

      {block.type === 'totals' && (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
            {[
              { key: 'showSubtotaal', label: 'Subtotaal tonen' },
              { key: 'showBtw', label: 'BTW tonen' },
              { key: 'showTotaal', label: 'Totaal tonen' },
            ].map(function (opt) {
              return (
                <label key={opt.key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={(block as unknown as Record<string, unknown>)[opt.key] as boolean} onChange={function (e) { onUpdate({ [opt.key]: e.target.checked }); }} />
                  {opt.label}
                </label>
              );
            })}
          </div>
          <ColorInput label="Totaal balk kleur" value={block.totalBarColor} onChange={function (v) { onUpdate({ totalBarColor: v }); }} />
          <SelectInput label="Uitlijning" value={block.alignment} onChange={function (v) { onUpdate({ alignment: v }); }}
            options={[{ value: 'left', label: 'Links' }, { value: 'right', label: 'Rechts' }]} />
          <NumberInput label="Lettergrootte" value={block.fontSize} onChange={function (v) { onUpdate({ fontSize: v }); }} min={8} max={16} />
        </>
      )}

      {block.type === 'payment_details' && (
        <>
          <div style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
              <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--muted)' }}>Inhoud</label>
              <VariablePicker documentType={documentType} onInsert={function (v) { onUpdate({ content: block.content + v }); }} />
            </div>
            <textarea value={block.content} onChange={function (e) { onUpdate({ content: e.target.value }); }} rows={4}
              style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 11, resize: 'vertical' }} />
          </div>
          <ColorInput label="Achtergrond" value={block.backgroundColor} onChange={function (v) { onUpdate({ backgroundColor: v }); }} />
          <ColorInput label="Randkleur" value={block.borderColor} onChange={function (v) { onUpdate({ borderColor: v }); }} />
          <NumberInput label="Lettergrootte" value={block.fontSize} onChange={function (v) { onUpdate({ fontSize: v }); }} min={7} max={14} />
        </>
      )}

      {block.type === 'menu' && (
        <>
          <SelectInput label="Layout" value={block.layout} onChange={function (v) { onUpdate({ layout: v }); }}
            options={[{ value: '1col', label: '1 kolom' }, { value: '2col', label: '2 kolommen' }]} />
          <NumberInput label="Gang titel grootte" value={block.gangTitleStyle.fontSize} onChange={function (v) { onUpdate({ gangTitleStyle: { ...block.gangTitleStyle, fontSize: v } }); }} min={8} max={18} />
          <ColorInput label="Gang titel kleur" value={block.gangTitleStyle.color} onChange={function (v) { onUpdate({ gangTitleStyle: { ...block.gangTitleStyle, color: v } }); }} />
          <SelectInput label="Gang uitlijning" value={block.gangTitleStyle.alignment} onChange={function (v) { onUpdate({ gangTitleStyle: { ...block.gangTitleStyle, alignment: v as 'left' | 'center' } }); }}
            options={[{ value: 'left', label: 'Links' }, { value: 'center', label: 'Midden' }]} />
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text)', cursor: 'pointer', marginBottom: 8 }}>
            <input type="checkbox" checked={block.gangTitleStyle.uppercase} onChange={function (e) { onUpdate({ gangTitleStyle: { ...block.gangTitleStyle, uppercase: e.target.checked } }); }} />
            Hoofdletters
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text)', cursor: 'pointer', marginBottom: 8 }}>
            <input type="checkbox" checked={block.showDescriptions} onChange={function (e) { onUpdate({ showDescriptions: e.target.checked }); }} />
            Beschrijvingen tonen
          </label>
          <SelectInput label="Gang scheiding" value={block.gangSeparator} onChange={function (v) { onUpdate({ gangSeparator: v }); }}
            options={[{ value: 'line', label: 'Lijn' }, { value: 'space', label: 'Ruimte' }, { value: 'none', label: 'Geen' }]} />
        </>
      )}

      {block.type === 'image' && (
        <>
          <NumberInput label="Max breedte (mm)" value={block.maxWidth} onChange={function (v) { onUpdate({ maxWidth: v }); }} min={10} max={200} />
          <NumberInput label="Max hoogte (mm)" value={block.maxHeight} onChange={function (v) { onUpdate({ maxHeight: v }); }} min={10} max={250} />
          <SelectInput label="Uitlijning" value={block.alignment} onChange={function (v) { onUpdate({ alignment: v }); }}
            options={[{ value: 'left', label: 'Links' }, { value: 'center', label: 'Midden' }, { value: 'right', label: 'Rechts' }]} />
        </>
      )}
    </div>
  );
}
