'use client';
/**
 * EstimatedPriceFixButton — camera/drop-knop op een geschatte ingredient-regel.
 *
 * Sam ziet een ingrediënt met "Geschat €X" naast de prijs. Klikt op de
 * camera-knop, dropt een screenshot van Sligro-portal of fotografeert
 * een bon. Haiku-vision leest naam + echte prijs + eenheid, geeft
 * suggesties terug. Sam kiest:
 *  - "Gebruik deze prijs" → updatet ingredient-regel (geen voorraad-add)
 *  - "Gebruik én voeg toe aan voorraad" → schrijft inventory-row
 */

import React, { useCallback, useRef, useState } from 'react';
import { Camera, Upload, X, Loader2, Check, AlertTriangle, Package } from 'lucide-react';
import { useToast } from '@/components/Toast';

import { formatEur } from '@/lib/format';

const GOLD = '#c4a35a';

interface ExtractedPrice {
  found: boolean;
  naam: string | null;
  prijs: number | null;
  unit: string | null;
  supplier: string | null;
  confidence: number;
  notes: string | null;
}

export interface FixResult {
  /** Echte gemeten prijs (vervangt estimated_price_eur) */
  price: number;
  /** Eenheid uit foto (kan wijken van geschatte unit) */
  unit: string;
  /** Geretourneerde naam (kan duidelijker zijn dan wat AI eerst gaf) */
  naam: string;
  /** Supplier zoals herkend in foto */
  supplier: string | null;
  /** True = Sam wil dit ook in voorraad toevoegen */
  addToInventory: boolean;
}

interface Props {
  /** Naam van het huidige ingrediënt — hint voor de AI */
  ingredientName: string;
  /** Huidige eenheid in recept */
  ingredientUnit: string;
  /** Geschatte prijs (om naast te tonen) */
  estimatedPrice: number | null;
  onResult: (r: FixResult) => Promise<void> | void;
}

export default function EstimatedPriceFixButton({
  ingredientName,
  ingredientUnit,
  estimatedPrice,
  onResult,
}: Props) {
  const showToast = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [extracted, setExtracted] = useState<ExtractedPrice | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [addToInventory, setAddToInventory] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File) => {
    setError(null);
    setExtracted(null);
    setLoading(true);

    try {
      // Validatie + size cap (5MB ruwe foto, Haiku vision)
      if (file.size > 6 * 1024 * 1024) {
        setError('Bestand te groot (max 6 MB).');
        setLoading(false);
        return;
      }
      const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
      if (!validTypes.includes(file.type)) {
        setError('Alleen JPG, PNG of WebP.');
        setLoading(false);
        return;
      }

      const preview = URL.createObjectURL(file);
      setPreviewUrl(preview);

      // Naar base64
      const buf = await file.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let binary = '';
      for (let i = 0; i < bytes.length; i += 0x8000) {
        binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + 0x8000)));
      }
      const base64 = btoa(binary);

      const res = await fetch('/api/recipe/refine-price', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_base64: base64,
          image_mime: file.type,
          hint: `Ingrediënt in recept: "${ingredientName}" (eenheid: ${ingredientUnit})`,
        }),
      });
      const body = await res.json();
      if (!res.ok || !body.ok) {
        setError(body.error || `AI-call faalde (${res.status})`);
        setLoading(false);
        return;
      }
      const data = body.data as ExtractedPrice;
      if (!data.found || !data.prijs) {
        setError('Geen prijs herkend in de foto. Probeer een duidelijkere foto.');
        setLoading(false);
        return;
      }
      setExtracted(data);
      setLoading(false);
    } catch (e) {
      setError((e as Error).message || 'Iets ging mis');
      setLoading(false);
    }
  }, [ingredientName, ingredientUnit]);

  async function applyResult() {
    if (!extracted || !extracted.prijs) return;
    await onResult({
      price: extracted.prijs,
      unit: extracted.unit || ingredientUnit,
      naam: extracted.naam || ingredientName,
      supplier: extracted.supplier,
      addToInventory,
    });
    showToast(`Prijs bijgewerkt: ${formatEur(extracted.prijs)}${addToInventory ? ' + toegevoegd aan voorraad' : ''}`, 'success');
    closeModal();
  }

  function closeModal() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setExtracted(null);
    setError(null);
    setOpen(false);
    setLoading(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Verfijn met een foto/screenshot"
        aria-label={`Verfijn prijs van ${ingredientName} met een foto`}
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 24, height: 24, padding: 0,
          background: 'rgba(196,163,90,.12)', color: GOLD,
          border: `1px solid ${GOLD}66`, borderRadius: 6,
          cursor: 'pointer',
        }}
      >
        <Camera size={12} />
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="fix-price-title"
          onClick={(e) => { if (e.target === e.currentTarget && !loading) closeModal(); }}
          style={{
            position: 'fixed', inset: 0, zIndex: 200,
            background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(6px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 16,
          }}
        >
          <div style={{
            background: 'var(--card)', border: '1px solid var(--border)',
            borderRadius: 14, padding: 22, width: '100%', maxWidth: 520,
            boxShadow: '0 24px 60px rgba(0,0,0,.5)',
            position: 'relative',
          }}>
            <button
              type="button" onClick={closeModal} disabled={loading}
              aria-label="Sluit"
              style={{
                position: 'absolute', top: 10, right: 10,
                background: 'transparent', border: 'none',
                color: 'var(--muted)', cursor: loading ? 'not-allowed' : 'pointer',
                padding: 6, borderRadius: 6,
              }}
            >
              <X size={16} />
            </button>

            <h2 id="fix-price-title" style={{ fontSize: 17, fontWeight: 700, margin: 0, marginBottom: 4 }}>
              Echte prijs voor &ldquo;{ingredientName}&rdquo;
            </h2>
            <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 16px' }}>
              {estimatedPrice != null
                ? `Geschat op ${formatEur(estimatedPrice)} — sleep een screenshot of foto erin voor de echte prijs.`
                : 'Sleep een screenshot van Sligro/Makro of foto van bon erin.'}
            </p>

            {!extracted && (
              <div
                onDragOver={e => e.preventDefault()}
                onDrop={e => {
                  e.preventDefault();
                  if (e.dataTransfer.files?.[0]) handleFile(e.dataTransfer.files[0]);
                }}
                onClick={() => fileRef.current?.click()}
                style={{
                  border: `2px dashed ${loading ? GOLD : 'var(--border-strong)'}`,
                  borderRadius: 12, padding: 28, textAlign: 'center',
                  cursor: loading ? 'wait' : 'pointer',
                  background: loading ? `${GOLD}10` : 'transparent',
                  transition: 'background .15s',
                }}
              >
                {loading ? (
                  <>
                    <Loader2 size={28} className="spin" style={{ color: GOLD, margin: '0 auto 8px' }} />
                    <div style={{ fontSize: 13, color: 'var(--text)' }}>AI leest de foto…</div>
                    {previewUrl && (
                      <img
                        src={previewUrl}
                        alt="Geüploade foto"
                        style={{ marginTop: 12, maxWidth: '100%', maxHeight: 140, borderRadius: 8, opacity: 0.6 }}
                      />
                    )}
                  </>
                ) : (
                  <>
                    <Upload size={28} style={{ color: GOLD, margin: '0 auto 8px' }} />
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                      Sleep foto/screenshot hier
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                      of klik om te kiezen · JPG/PNG/WebP, max 6 MB
                    </div>
                  </>
                )}
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  style={{ display: 'none' }}
                  onChange={e => {
                    if (e.target.files?.[0]) handleFile(e.target.files[0]);
                    e.target.value = '';
                  }}
                />
              </div>
            )}

            {error && (
              <div style={{
                display: 'flex', gap: 8, padding: 10, borderRadius: 8, marginTop: 12,
                background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.25)',
                color: '#fca5a5', fontSize: 12,
              }}>
                <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                <div>{error}</div>
              </div>
            )}

            {extracted && extracted.prijs && (
              <div style={{
                marginTop: 12, padding: 14, borderRadius: 10,
                background: 'rgba(34,197,94,.08)', border: '1px solid rgba(34,197,94,.3)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <Check size={16} style={{ color: '#86efac' }} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#86efac', letterSpacing: '.1em', textTransform: 'uppercase' }}>
                    Herkend (confidence {Math.round(extracted.confidence * 100)}%)
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 4, fontSize: 13 }}>
                  <span style={{ color: 'var(--muted)' }}>Naam:</span>
                  <span style={{ fontWeight: 600, color: 'var(--text)' }}>{extracted.naam || '—'}</span>
                  <span style={{ color: 'var(--muted)' }}>Prijs:</span>
                  <span style={{ fontWeight: 700, color: 'var(--text)' }}>
                    {formatEur(extracted.prijs)}{extracted.unit ? ` / ${extracted.unit}` : ''}
                  </span>
                  {extracted.supplier && (
                    <>
                      <span style={{ color: 'var(--muted)' }}>Leverancier:</span>
                      <span style={{ color: 'var(--text)' }}>{extracted.supplier}</span>
                    </>
                  )}
                  {estimatedPrice != null && (
                    <>
                      <span style={{ color: 'var(--muted)' }}>Was geschat:</span>
                      <span style={{ color: 'var(--muted)', textDecoration: 'line-through' }}>
                        {formatEur(estimatedPrice)}
                      </span>
                    </>
                  )}
                </div>

                <label style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  marginTop: 14, fontSize: 12, cursor: 'pointer',
                  color: 'var(--text)',
                }}>
                  <input
                    type="checkbox"
                    checked={addToInventory}
                    onChange={e => setAddToInventory(e.target.checked)}
                    style={{ width: 16, height: 16, accentColor: GOLD }}
                  />
                  <Package size={14} style={{ color: 'var(--muted)' }} />
                  Voeg ook toe aan voorraad (volgende keer matched de autocomplete 'm)
                </label>

                <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                  <button
                    type="button"
                    onClick={() => { setExtracted(null); setPreviewUrl(null); }}
                    style={{
                      padding: '8px 14px', fontSize: 12, fontWeight: 600,
                      background: 'transparent', color: 'var(--muted)',
                      border: '1px solid var(--border)', borderRadius: 8,
                      cursor: 'pointer',
                    }}
                  >
                    Opnieuw
                  </button>
                  <div style={{ flex: 1 }} />
                  <button
                    type="button"
                    onClick={applyResult}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      padding: '9px 16px', fontSize: 12, fontWeight: 700,
                      background: '#22c55e', color: '#0a0a0c',
                      border: 'none', borderRadius: 8, cursor: 'pointer',
                    }}
                  >
                    <Check size={13} /> Gebruik deze prijs
                  </button>
                </div>
              </div>
            )}

            <style jsx>{`
              @keyframes spin { to { transform: rotate(360deg); } }
              :global(.spin) { animation: spin .9s linear infinite; }
            `}</style>
          </div>
        </div>
      )}
    </>
  );
}
