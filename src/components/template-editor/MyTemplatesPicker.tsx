'use client';

import { X } from 'lucide-react';
import type { PdfTemplate } from '@/types/template.types';

interface Props {
  templates: PdfTemplate[];
  loading: boolean;
  currentTemplateId: string | null;
  onClose: () => void;
  onSetTemplates: (updater: (prev: PdfTemplate[]) => PdfTemplate[]) => void;
  showToast: (title: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
}

export default function MyTemplatesPicker({ templates, loading, currentTemplateId, onClose, onSetTemplates, showToast }: Props) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 99998,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.45)', padding: 20,
    }} onClick={onClose}>
      <div onClick={function (e) { e.stopPropagation(); }} style={{
        background: 'var(--card)', borderRadius: 10, maxWidth: 720, width: '100%', maxHeight: '80vh',
        boxShadow: '0 20px 60px rgba(0,0,0,.4)', display: 'flex', flexDirection: 'column', overflow: 'hidden',
        border: '1px solid var(--border)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Mijn templates</div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>Open een eerder opgeslagen template, of markeer er een als actief (zichtbaar in event hub).</div>
          </div>
          <button onClick={onClose}
            style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 6, color: 'var(--muted)' }}>
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: 20, overflowY: 'auto', flex: 1, background: 'var(--bg)' }}>
          {loading && (
            <div style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', padding: 30 }}>Laden...</div>
          )}
          {!loading && templates.length === 0 && (
            <div style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', padding: 30 }}>
              Nog geen opgeslagen templates voor deze documentsoort. Begin via &quot;Sjablonen&quot;.
            </div>
          )}
          {!loading && templates.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {templates.map(function (t) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const isActive = (t as any).is_default === true;
                const isCurrent = t.id === currentTemplateId;
                return (
                  <div key={t.id} style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: 12, borderRadius: 8,
                    background: 'var(--card)', border: '1px solid ' + (isCurrent ? 'var(--brand)' : 'var(--border)'),
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{t.name || 'Naamloos'}</div>
                        {isActive && (
                          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--brand-background, #fff)', background: 'var(--brand)', padding: '2px 7px', borderRadius: 10 }}>Actief</span>
                        )}
                        {isCurrent && (
                          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--muted)', border: '1px solid var(--border)', padding: '2px 7px', borderRadius: 10 }}>In bewerking</span>
                        )}
                      </div>
                      {t.description && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>{t.description}</div>}
                      <div style={{ fontSize: 10, color: 'var(--muted-light)', marginTop: 2 }}>{(t.blocks || []).length} blokken · v{t.version}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {!isActive && (
                        <button
                          onClick={async function () {
                            const res = await fetch('/api/templates/' + t.id, {
                              method: 'PUT',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ isDefault: true }),
                            });
                            if (res.ok) {
                              onSetTemplates(function (prev) {
                                return prev.map(function (x) {
                                  if (x.id === t.id) return { ...x, is_default: true } as PdfTemplate;
                                  if (x.document_type === t.document_type && x.organization_id === t.organization_id) {
                                    return { ...x, is_default: false } as PdfTemplate;
                                  }
                                  return x;
                                });
                              });
                              showToast('Ingesteld als actief', 'success');
                            } else {
                              showToast('Instellen mislukt', 'error');
                            }
                          }}
                          style={{
                            padding: '6px 10px', fontSize: 11, fontWeight: 600,
                            background: 'transparent', color: 'var(--brand)',
                            border: '1px solid color-mix(in srgb, var(--brand) 40%, transparent)',
                            borderRadius: 6, cursor: 'pointer',
                          }}>
                          Actief maken
                        </button>
                      )}
                      <button
                        disabled={isCurrent}
                        onClick={function () {
                          window.location.href = '/template-editor?type=' + t.document_type + '&id=' + t.id;
                        }}
                        style={{
                          padding: '6px 14px', fontSize: 11, fontWeight: 600,
                          background: isCurrent ? 'var(--border)' : 'var(--brand)', color: 'var(--brand-background, #fff)',
                          border: 'none', borderRadius: 6, cursor: isCurrent ? 'default' : 'pointer',
                          opacity: isCurrent ? 0.6 : 1,
                        }}>
                        {isCurrent ? 'Actief geopend' : 'Openen'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
