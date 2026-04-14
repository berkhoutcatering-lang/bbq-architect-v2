/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';
import React from 'react';
import { GANGEN, type GangConfig, type GerechtData } from './GerechtKaart';

export function MapStation({ gang, gerechten, onRemove, onPublish, onDrop }: {
  gang: GangConfig;
  gerechten: GerechtData[];
  onRemove: (id: number) => void;
  onPublish: (gang: GangConfig, gerechten: GerechtData[]) => void;
  onDrop: (id: string) => void;
}) {
  const kleur = gang.kleur;
  const isEmpty = gerechten.length === 0;
  const [dragOver, setDragOver] = React.useState(false);

  return (
    <div
      onDragOver={function (e: React.DragEvent) { e.preventDefault(); setDragOver(true); }}
      onDragLeave={function () { setDragOver(false); }}
      onDrop={function (e: React.DragEvent) {
        e.preventDefault();
        setDragOver(false);
        const id = e.dataTransfer.getData('gerecht_id');
        if (id) onDrop(id);
      }}
      style={{
        background: dragOver ? 'rgba(255,255,255,.04)' : 'var(--card)',
        border: dragOver ? '1px solid ' + kleur + '80' : '1px solid var(--border)',
        borderTop: '2px solid ' + kleur,
        borderRadius: 12,
        padding: '14px',
        minHeight: 120,
        transition: 'border-color .15s, background .15s',
      }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 18 }}>{gang.icon}</span>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{gang.label}</div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,.4)' }}>{gerechten.length} gerecht{gerechten.length !== 1 ? 'en' : ''}</div>
        </div>
        {gerechten.length > 0 && (
          <button
            onClick={function () { onPublish(gang, gerechten); }}
            style={{
              marginLeft: 'auto', background: kleur + '18', border: '1px solid ' + kleur + '40',
              color: kleur, padding: '8px 14px', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer'
            }}
          >
            Publiceer {gerechten.length} →
          </button>
        )}
      </div>

      {isEmpty ? (
        <div style={{
          border: '1px dashed rgba(255,255,255,.1)', borderRadius: 8, padding: '16px 10px',
          textAlign: 'center', fontSize: 12, color: 'rgba(255,255,255,.2)'
        }}>
          Sleep of klik &quot;→ Zet in map&quot;
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {gerechten.map(function (g) {
            return (
              <div key={g.id} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '6px 10px', background: 'rgba(255,255,255,.04)',
                borderRadius: 7, fontSize: 12
              }}>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.naam}</span>
                {g.kostprijs_pp && g.kostprijs_pp > 0 && (
                  <span style={{ fontSize: 12, color: 'rgba(255,255,255,.35)', flexShrink: 0 }}>€{Number(g.kostprijs_pp).toFixed(2)}</span>
                )}
                <button
                  onClick={function () { onRemove(g.id); }}
                  style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,.25)', cursor: 'pointer', fontSize: 13, padding: '8px 14px', minWidth: 36, minHeight: 36, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                  title="Uit map verwijderen"
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function GangPickerModal({ gerecht, onPick, onClose }: {
  gerecht: GerechtData | null;
  onPick: (gerecht: GerechtData, slug: string) => void;
  onClose: () => void;
}) {
  if (!gerecht) return null;
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,.7)', display: 'flex', alignItems: 'center', justifyContent: 'center'
    }} onClick={onClose}>
      <div
        style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, padding: 24, width: 360, maxWidth: '90vw' }}
        onClick={function (e: React.MouseEvent) { e.stopPropagation(); }}
      >
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>
          Zet <span style={{ color: 'var(--brand)' }}>{gerecht.naam}</span> in:
        </div>
        <div className="grid grid-cols-2 gap-2">
          {GANGEN.map(function (g) {
            return (
              <button
                key={g.slug}
                onClick={function () { onPick(gerecht, g.slug); }}
                style={{
                  background: 'rgba(255,255,255,.04)', border: '1px solid var(--border)',
                  borderRadius: 10, padding: '10px', cursor: 'pointer',
                  textAlign: 'left', transition: 'border-color .15s',
                  display: 'flex', alignItems: 'center', gap: 8
                }}
                onMouseEnter={function (e: React.MouseEvent<HTMLButtonElement>) { (e.currentTarget as HTMLButtonElement).style.borderColor = g.kleur + '60'; }}
                onMouseLeave={function (e: React.MouseEvent<HTMLButtonElement>) { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)'; }}
              >
                <span style={{ fontSize: 18 }}>{g.icon}</span>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: g.kleur }}>{g.label}</div>
                </div>
              </button>
            );
          })}
        </div>
        <button onClick={onClose} style={{ marginTop: 14, width: '100%', background: 'none', border: 'none', color: 'rgba(255,255,255,.4)', cursor: 'pointer', fontSize: 12 }}>
          Annuleren
        </button>
      </div>
    </div>
  );
}
