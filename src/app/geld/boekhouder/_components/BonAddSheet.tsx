/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useRef, useState } from 'react';
import { Camera, Loader2, X, Check, AlertCircle, Package, Plus } from 'lucide-react';
import { resizeImage } from '@/lib/utils';
import { RGS_CATERING_CATEGORIES } from '@/lib/rgsCategories';

/**
 * BonAddSheet
 * ───────────
 * Modal voor bon-toevoegen vanuit /geld/boekhouder.
 *
 * Flow:
 *  1. Cateraar kiest foto (camera of file-upload)
 *  2. AI-call /api/boekhouder/bon-extract levert preview + voorraad-suggesties
 *  3. Cateraar bevestigt per regel of het ook in voorraad moet ("hey dit is
 *     ook voor voorraad bedoeld?")
 *  4. Commit via /api/boekhouder/bon-commit → bon + stock_movements + price_history
 *
 * Geen DB-writes voor commit-fase. Hard rules:
 *  - User confirmt per item de qty toe te voegen aan voorraad
 *  - BTW-bedragen uit foto (AI-extract), niet AI-derived percentages
 */

interface BonAddSheetProps {
  onClose: () => void;
  onCommitted?: (bonId: number, stockMovements: number) => void;
}

interface Preview {
  leverancier_naam: string | null;
  datum: string | null;
  totaal_bedrag: number;
  btw_laag_bedrag: number;
  btw_hoog_bedrag: number;
  netto_bedrag: number;
  rgs_code: string | null;
  rgs_label: string | null;
}

interface Suggestion {
  naam: string;
  aantal: number;
  eenheid: string;
  prijs_per_eenheid: number;
  totaal: number;
  btw_pct: number;
  inventory_id: number | null;
  inventory_naam: string | null;
  match_confidence: 'high' | 'medium' | 'low' | 'none';
  qty_in_inventory_unit: number;
}

interface ItemChoice {
  add: boolean;
  create_new: boolean;
}

function fmtEur(n: number): string {
  return (Number(n) || 0).toLocaleString('nl-NL', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 });
}

export default function BonAddSheet({ onClose, onCommitted }: BonAddSheetProps) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [image, setImage] = useState<string | null>(null);
  const [imageOrig, setImageOrig] = useState<string | null>(null);
  const [phase, setPhase] = useState<'pick' | 'extracting' | 'review' | 'committing' | 'done' | 'error'>('pick');
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [items, setItems] = useState<Suggestion[]>([]);
  const [choices, setChoices] = useState<ItemChoice[]>([]);
  const [datumOverride, setDatumOverride] = useState<string>('');
  const [rgsOverride, setRgsOverride] = useState<string>('');
  const [result, setResult] = useState<{ bon_id: number; stock_movements: number; inventory_created: number } | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setPhase('extracting');
    try {
      const reader = new FileReader();
      const dataUrl: string = await new Promise(function (resolve, reject) {
        reader.onload = function () { resolve(String(reader.result)); };
        reader.onerror = function () { reject(reader.error); };
        reader.readAsDataURL(file);
      });
      const resized = await resizeImage(dataUrl, 1600, 2200, 0.85);
      setImage(resized);
      setImageOrig(dataUrl);

      const r = await fetch('/api/boekhouder/bon-extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ image_data_url: resized }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) {
        setError(j.error || 'AI kon de bon niet lezen');
        setPhase('error');
        return;
      }
      setPreview(j.bon_preview);
      setItems(j.items_with_suggestions || []);
      setDatumOverride(j.bon_preview.datum || new Date().toISOString().slice(0, 10));
      setRgsOverride(j.bon_preview.rgs_code || '');
      // Default per item: add_to_inventory aan als match >= medium
      setChoices((j.items_with_suggestions || []).map((it: Suggestion) => ({
        add: it.match_confidence === 'high' || it.match_confidence === 'medium',
        create_new: false,
      })));
      setPhase('review');
    } catch (err: any) {
      setError(err?.message || 'Onbekende fout');
      setPhase('error');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function commit() {
    if (!preview) return;
    setPhase('committing');
    setError(null);
    try {
      const payload = {
        image_data_url: image,
        datum: datumOverride || preview.datum || new Date().toISOString().slice(0, 10),
        totaal_bedrag: preview.totaal_bedrag,
        btw_laag_bedrag: preview.btw_laag_bedrag,
        btw_hoog_bedrag: preview.btw_hoog_bedrag,
        netto_bedrag: preview.netto_bedrag,
        rgs_code: rgsOverride || preview.rgs_code || undefined,
        leverancier_naam_hint: preview.leverancier_naam || undefined,
        items: items.map((it, i) => ({
          naam: it.naam,
          qty: it.qty_in_inventory_unit,
          unit: it.inventory_naam ? '' : it.eenheid, // bestaand item gebruikt z'n eigen unit
          unit_price: it.prijs_per_eenheid,
          btw_pct: it.btw_pct,
          add_to_inventory: choices[i]?.add || false,
          inventory_id: it.inventory_id || null,
          create_new_inventory: choices[i]?.create_new || false,
        })),
      };
      const r = await fetch('/api/boekhouder/bon-commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) {
        setError(j.error || 'Commit mislukt');
        setPhase('error');
        return;
      }
      setResult({
        bon_id: j.bon_id,
        stock_movements: j.stock_movements_created,
        inventory_created: j.inventory_items_created,
      });
      setPhase('done');
      if (onCommitted) onCommitted(j.bon_id, j.stock_movements_created);
    } catch (err: any) {
      setError(err?.message || 'Onbekende fout');
      setPhase('error');
    }
  }

  const stockProposals = items.filter((it, i) => choices[i]?.add).length;

  return (
    <div className="modal-bg" onClick={onClose} role="presentation">
      <div
        className="modal-box bh-bon-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bon-sheet-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="bh-bon-sheet__header">
          <h2 id="bon-sheet-title">
            <Camera size={16} /> Bon toevoegen
          </h2>
          <button type="button" onClick={onClose} aria-label="Sluiten">
            <X size={16} />
          </button>
        </header>

        {phase === 'pick' && (
          <div className="bh-bon-sheet__pick">
            <p style={{ marginBottom: 14, color: 'var(--muted)', fontSize: 13 }}>
              AI leest je bon, categoriseert hem voor de boekhouder én herkent
              welke regels ook voor je voorraad bedoeld zijn. Jij bevestigt per regel.
            </p>
            <input
              ref={fileRef}
              type="file"
              accept="image/*,application/pdf"
              capture="environment"
              onChange={onFile}
              style={{ display: 'none' }}
            />
            <button
              type="button"
              className="bh-btn-primary bh-btn-primary--large"
              onClick={() => fileRef.current?.click()}
              style={{ width: '100%' }}
            >
              <Camera size={14} /> Kies foto of PDF
            </button>
            <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 12 }}>
              Tip: scan papieren bon met telefoon-camera, of upload een PDF-factuur van Sligro/Makro.
            </p>
          </div>
        )}

        {phase === 'extracting' && (
          <div className="bh-bon-sheet__loading">
            <Loader2 size={24} className="bh-spin" />
            <p>AI leest de bon…</p>
            <p style={{ fontSize: 11, color: 'var(--muted)' }}>Extract leverancier, datum, BTW + items.</p>
          </div>
        )}

        {phase === 'review' && preview && (
          <div className="bh-bon-sheet__review">
            <section className="bh-bon-sheet__meta">
              <h3>Bon-data</h3>
              <div className="bh-bon-sheet__meta-grid">
                <label>
                  <span>Leverancier</span>
                  <strong>{preview.leverancier_naam || '(onbekend)'}</strong>
                </label>
                <label>
                  <span>Datum</span>
                  <input
                    type="date"
                    value={datumOverride}
                    onChange={(e) => setDatumOverride(e.target.value)}
                  />
                </label>
                <label>
                  <span>Totaal</span>
                  <strong>{fmtEur(preview.totaal_bedrag)}</strong>
                </label>
                <label>
                  <span>BTW 9%</span>
                  <strong>{fmtEur(preview.btw_laag_bedrag)}</strong>
                </label>
                <label>
                  <span>BTW 21%</span>
                  <strong>{fmtEur(preview.btw_hoog_bedrag)}</strong>
                </label>
                <label>
                  <span>RGS-categorie</span>
                  <select
                    value={rgsOverride}
                    onChange={(e) => setRgsOverride(e.target.value)}
                  >
                    <option value="">— kies —</option>
                    {RGS_CATERING_CATEGORIES.filter(c => c.kind === 'kosten' || c.kind === 'investering' || c.kind === 'overig').map(c => (
                      <option key={c.code} value={c.code}>{c.label} ({c.code})</option>
                    ))}
                  </select>
                </label>
              </div>
            </section>

            <section className="bh-bon-sheet__items">
              <h3>
                Regels op de bon ({items.length})
                {stockProposals > 0 && (
                  <span className="bh-bon-sheet__pill">
                    <Package size={11} /> {stockProposals} naar voorraad
                  </span>
                )}
              </h3>
              <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 10px' }}>
                AI suggereert welke regels ook in je voorraad horen. Vink uit wat alleen kosten zijn.
              </p>

              <ul className="bh-bon-sheet__item-list">
                {items.map((it, i) => {
                  const choice = choices[i] || { add: false, create_new: false };
                  return (
                    <li key={i} className={'bh-bon-sheet__item bh-bon-sheet__item--' + it.match_confidence}>
                      <div className="bh-bon-sheet__item-main">
                        <strong>{it.naam}</strong>
                        <span>{it.aantal} {it.eenheid} × {fmtEur(it.prijs_per_eenheid)} = <strong>{fmtEur(it.totaal)}</strong></span>
                      </div>
                      {it.inventory_naam && (
                        <div className="bh-bon-sheet__match">
                          <Check size={11} style={{ color: it.match_confidence === 'high' ? 'var(--green, #22c55e)' : 'var(--amber, #f59e0b)' }} />
                          Lijkt op voorraad-item <strong>{it.inventory_naam}</strong>
                          {' '}<span style={{ color: 'var(--muted)' }}>({it.match_confidence === 'high' ? '95%+ zeker' : it.match_confidence === 'medium' ? 'naam lijkt' : 'lage match'})</span>
                        </div>
                      )}
                      {!it.inventory_naam && (
                        <div className="bh-bon-sheet__match">
                          <AlertCircle size={11} style={{ color: 'var(--muted)' }} />
                          Geen match in voorraad — als je dit wel wil tracken: vink "→ Nieuw voorraad-item" aan
                        </div>
                      )}
                      <div className="bh-bon-sheet__item-actions">
                        {it.inventory_id ? (
                          <label className="bh-bon-sheet__chk">
                            <input
                              type="checkbox"
                              checked={choice.add}
                              onChange={(e) => {
                                setChoices(c => {
                                  const next = [...c];
                                  next[i] = { add: e.target.checked, create_new: false };
                                  return next;
                                });
                              }}
                            />
                            <span>→ Voorraad +{it.qty_in_inventory_unit.toFixed(2)} {it.eenheid}</span>
                          </label>
                        ) : (
                          <label className="bh-bon-sheet__chk">
                            <input
                              type="checkbox"
                              checked={choice.add && choice.create_new}
                              onChange={(e) => {
                                setChoices(c => {
                                  const next = [...c];
                                  next[i] = { add: e.target.checked, create_new: e.target.checked };
                                  return next;
                                });
                              }}
                            />
                            <span>
                              <Plus size={10} /> Nieuw voorraad-item + {it.aantal} {it.eenheid}
                            </span>
                          </label>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>

            <footer className="bh-bon-sheet__footer">
              <button type="button" className="bh-btn-secondary" onClick={onClose}>
                Annuleren
              </button>
              <button
                type="button"
                className="bh-btn-primary"
                onClick={commit}
                disabled={!preview.totaal_bedrag}
              >
                {stockProposals > 0
                  ? `Bevestig bon + ${stockProposals} voorraad-update${stockProposals === 1 ? '' : 's'}`
                  : 'Bevestig bon (geen voorraad-mutatie)'}
              </button>
            </footer>
          </div>
        )}

        {phase === 'committing' && (
          <div className="bh-bon-sheet__loading">
            <Loader2 size={24} className="bh-spin" />
            <p>Bon opslaan…</p>
          </div>
        )}

        {phase === 'done' && result && (
          <div className="bh-bon-sheet__done">
            <Check size={32} style={{ color: 'var(--green, #22c55e)' }} />
            <h3>Bon toegevoegd</h3>
            <p>
              Bon #{result.bon_id} opgeslagen.
              {result.stock_movements > 0 && <> {result.stock_movements} voorraad-mutatie{result.stock_movements === 1 ? '' : 's'} verwerkt.</>}
              {result.inventory_created > 0 && <> {result.inventory_created} nieuw voorraad-item aangemaakt.</>}
            </p>
            <button type="button" className="bh-btn-primary" onClick={onClose}>
              Sluiten
            </button>
          </div>
        )}

        {phase === 'error' && (
          <div className="bh-bon-sheet__error">
            <AlertCircle size={24} style={{ color: 'var(--red, #ef4444)' }} />
            <h3>Er ging iets mis</h3>
            <p>{error || 'Onbekende fout'}</p>
            <button type="button" className="bh-btn-secondary" onClick={() => setPhase('pick')}>
              Opnieuw proberen
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
