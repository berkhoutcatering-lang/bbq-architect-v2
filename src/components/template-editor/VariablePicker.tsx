'use client';

import { useState } from 'react';
import { Variable, X } from 'lucide-react';
import { getVariablesByCategory, CATEGORY_LABELS } from '@/lib/templateVariables';
import type { PdfTemplate } from '@/types/template.types';

interface Props {
  documentType: PdfTemplate['document_type'];
  onInsert: (variable: string) => void;
}

export default function VariablePicker({ documentType, onInsert }: Props) {
  const [open, setOpen] = useState(false);
  const groups = getVariablesByCategory(documentType);

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        onClick={function () { setOpen(!open); }}
        style={{
          display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px',
          borderRadius: 6, background: 'rgba(59,130,246,.08)', border: '1px solid rgba(59,130,246,.2)',
          cursor: 'pointer', fontSize: 11, fontWeight: 600, color: 'var(--blue)',
        }}
      >
        <Variable size={12} /> Variabele
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, zIndex: 100,
          width: 260, maxHeight: 320, overflowY: 'auto',
          background: 'var(--card)', borderRadius: 10,
          border: '1px solid var(--border)', boxShadow: '0 8px 24px rgba(0,0,0,.15)',
          marginTop: 4,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text)' }}>Variabele invoegen</span>
            <button onClick={function () { setOpen(false); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 2 }}>
              <X size={14} />
            </button>
          </div>

          {Object.entries(groups).map(function ([category, vars]) {
            return (
              <div key={category}>
                <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '8px 12px 4px' }}>
                  {CATEGORY_LABELS[category] || category}
                </div>
                {vars.map(function (v) {
                  return (
                    <button
                      key={v.key}
                      onClick={function () { onInsert('{{' + v.key + '}}'); setOpen(false); }}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        width: '100%', padding: '5px 12px', background: 'none', border: 'none',
                        cursor: 'pointer', fontSize: 12, color: 'var(--text)', textAlign: 'left',
                      }}
                    >
                      <span>{v.label}</span>
                      <span style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'monospace' }}>{'{{'}{v.key}{'}}'}</span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
