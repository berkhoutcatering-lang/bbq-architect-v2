'use client';
/**
 * MoneybirdImportCard — backfill-knop voor inkoopfacturen uit Moneybird.
 *
 * Drie staten:
 *  - Niet verbonden (of scope te beperkt) → "Verbind met Moneybird"
 *  - Verbonden + scope OK → preview-telling + "Importeer historie"
 *  - Importing → batched progress, klikt /api/integrations/moneybird/import
 *    in een lus tot er niets nieuws meer is.
 *
 * Roept aan: GET /api/integrations/moneybird/import/preview
 *            POST /api/integrations/moneybird/import
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  Receipt, Check, AlertTriangle, Loader2, ArrowRight, Sparkles,
  RefreshCw, ExternalLink, TrendingUp,
} from 'lucide-react';
import { useToast } from '@/components/Toast';

const GOLD = '#c4a35a';

interface PreviewState {
  loading: boolean;
  ok: boolean;
  scopeOk: boolean;
  error?: string;
  invoicesTotal: number;
  invoicesNew: number;
  alreadyImported: number;
  suppliersTotal: number;
  oldest?: string;
  newest?: string;
}

interface ImportState {
  running: boolean;
  done: boolean;
  totalProcessed: number;
  mutationsCreated: number;
  withDetails: number;
  withPdf: number;
  failed: number;
  costCents: number;
  lastError?: string;
}

const initialPreview: PreviewState = {
  loading: true,
  ok: false,
  scopeOk: true,
  invoicesTotal: 0,
  invoicesNew: 0,
  alreadyImported: 0,
  suppliersTotal: 0,
};

const initialImport: ImportState = {
  running: false,
  done: false,
  totalProcessed: 0,
  mutationsCreated: 0,
  withDetails: 0,
  withPdf: 0,
  failed: 0,
  costCents: 0,
};

function fmtEur(cents: number): string {
  return `€${(cents / 100).toFixed(2)}`;
}

function fmtDate(d?: string): string {
  if (!d) return '—';
  const date = new Date(d);
  if (isNaN(date.getTime())) return d;
  return date.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function MoneybirdImportCard() {
  const showToast = useToast();
  const [months, setMonths] = useState<number>(12);
  const [preview, setPreview] = useState<PreviewState>(initialPreview);
  const [imp, setImp] = useState<ImportState>(initialImport);

  const loadPreview = useCallback(async (m: number = months) => {
    setPreview(p => ({ ...p, loading: true }));
    try {
      const res = await fetch(`/api/integrations/moneybird/import/preview?months=${m}`);
      const body = await res.json();
      if (!res.ok || !body.ok) {
        setPreview({
          loading: false,
          ok: false,
          scopeOk: body.scopeOk !== false,
          error: body.error || 'Preview faalde',
          invoicesTotal: 0,
          invoicesNew: 0,
          alreadyImported: 0,
          suppliersTotal: 0,
        });
        return;
      }
      setPreview({
        loading: false,
        ok: true,
        scopeOk: true,
        invoicesTotal: body.invoicesTotal,
        invoicesNew: body.invoicesNew,
        alreadyImported: body.alreadyImported,
        suppliersTotal: body.suppliersTotal,
        oldest: body.oldest,
        newest: body.newest,
      });
    } catch (e) {
      setPreview({
        loading: false,
        ok: false,
        scopeOk: true,
        error: (e as Error).message || 'Netwerk-fout',
        invoicesTotal: 0,
        invoicesNew: 0,
        alreadyImported: 0,
        suppliersTotal: 0,
      });
    }
  }, [months]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadPreview(); }, [loadPreview]);

  async function runImport() {
    if (preview.invoicesNew === 0) {
      showToast('Niets nieuws om te importeren', 'info');
      return;
    }
    setImp({ ...initialImport, running: true });

    const BATCH = 20;
    let totalRemaining = preview.invoicesNew;
    let lastError: string | undefined;

    while (totalRemaining > 0) {
      try {
        const res = await fetch('/api/integrations/moneybird/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ months, batchSize: BATCH }),
        });
        const body = await res.json();
        if (!res.ok || !body.ok) {
          lastError = body.error || 'Import-call faalde';
          setImp(s => ({ ...s, lastError, running: false, done: true }));
          showToast(lastError ?? 'Import faalde', 'error');
          return;
        }
        setImp(s => ({
          running: true,
          done: false,
          totalProcessed: s.totalProcessed + (body.invoicesProcessed || 0),
          mutationsCreated: s.mutationsCreated + (body.mutationsCreated || 0),
          withDetails: s.withDetails + (body.invoicesWithDetails || 0),
          withPdf: s.withPdf + (body.invoicesWithPdf || 0),
          failed: s.failed + (body.invoicesFailed || 0),
          costCents: s.costCents + (body.totalCostCents || 0),
        }));
        const justProcessed = body.invoicesProcessed || 0;
        totalRemaining = Math.max(0, totalRemaining - justProcessed);
        if (justProcessed === 0) break; // klaar (of dedup hit)
      } catch (e) {
        lastError = (e as Error).message || 'Netwerk-fout tijdens import';
        setImp(s => ({ ...s, lastError, running: false, done: true }));
        showToast(lastError ?? 'Netwerk-fout', 'error');
        return;
      }
    }

    setImp(s => ({ ...s, running: false, done: true }));
    showToast(`Import klaar — ${imp.mutationsCreated} mutaties in review-queue`, 'success');
    // Refresh preview zodat alreadyImported up-to-date is
    void loadPreview();
  }

  /* ───────── RENDER ───────── */

  const cardStyle: React.CSSProperties = {
    position: 'relative',
    background: 'linear-gradient(180deg, rgba(76,175,80,.06), var(--card) 50%)',
    border: '1px solid rgba(76,175,80,.25)',
    borderRadius: 14,
    padding: 18,
    overflow: 'hidden',
    marginBottom: 20,
  };

  return (
    <div style={cardStyle}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: `linear-gradient(90deg, transparent, ${GOLD}80, transparent)`, pointerEvents: 'none' }} />

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={{
          width: 44, height: 44, borderRadius: 12,
          background: 'rgba(76,175,80,.16)',
          border: '1px solid rgba(76,175,80,.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#4CAF50', flexShrink: 0,
        }}>
          <Receipt size={22} />
        </div>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontSize: 10, letterSpacing: '.2em', textTransform: 'uppercase', color: '#4CAF50', fontWeight: 700, marginBottom: 2 }}>
            Moneybird-koppeling
          </div>
          <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 4 }}>
            Automatisch prijzen uit je inkoopfacturen
          </div>
          <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.45 }}>
            Sligro, Makro, Bidfood — al hun facturen staan al in Moneybird. We trekken er regel-voor-regel de
            <strong style={{ color: 'var(--text)' }}> echte betaalde prijzen </strong>
            uit (incl. staffel en jaarafspraken) en zetten ze in je review-queue.
          </div>
        </div>
      </div>

      {/* ───── STATE: preview loading ───── */}
      {preview.loading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 0', color: 'var(--muted)', fontSize: 13 }}>
          <Loader2 size={16} className="spin" />
          Checken hoeveel facturen er klaarstaan…
        </div>
      )}

      {/* ───── STATE: niet verbonden / fout ───── */}
      {!preview.loading && !preview.ok && (
        <div>
          <div style={{
            display: 'flex', gap: 10, padding: 12, borderRadius: 10,
            background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.25)',
            color: '#fca5a5', fontSize: 13, marginBottom: 12,
          }}>
            <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
            <div>
              {!preview.scopeOk
                ? 'Moneybird is verbonden maar de scope mist inkoopfactuur-toegang. Klik op "Herverbind" — je wordt 1× door de OAuth-flow geleid en daarna werkt het.'
                : preview.error || 'Moneybird is nog niet verbonden.'}
            </div>
          </div>
          <a href="/api/integrations/moneybird/connect" style={{ textDecoration: 'none' }}>
            <button style={{
              display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 16px',
              background: '#4CAF50', color: '#fff', fontWeight: 700, fontSize: 13,
              border: 'none', borderRadius: 10, cursor: 'pointer',
            }}>
              <RefreshCw size={14} />
              {preview.scopeOk ? 'Verbind met Moneybird' : 'Herverbind met Moneybird'}
              <ArrowRight size={14} />
            </button>
          </a>
        </div>
      )}

      {/* ───── STATE: verbonden + import-klaar (en niet bezig) ───── */}
      {!preview.loading && preview.ok && !imp.running && !imp.done && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 14 }}>
            <Stat label="Nieuw te importeren" value={preview.invoicesNew} accent={preview.invoicesNew > 0 ? GOLD : 'var(--muted)'} />
            <Stat label="Leveranciers" value={preview.suppliersTotal} />
            <Stat label="Al binnen" value={preview.alreadyImported} small />
            <Stat label="Periode" value={`${fmtDate(preview.oldest)} → ${fmtDate(preview.newest)}`} isText />
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ fontSize: 12, color: 'var(--muted)' }}>
              Historie:&nbsp;
              <select
                value={months}
                onChange={e => { const m = parseInt(e.target.value, 10); setMonths(m); loadPreview(m); }}
                style={{
                  background: 'var(--bg)', color: 'var(--text)',
                  border: '1px solid var(--border)', borderRadius: 6,
                  padding: '4px 8px', fontSize: 12,
                }}
              >
                <option value={3}>3 maanden</option>
                <option value={6}>6 maanden</option>
                <option value={12}>12 maanden</option>
                <option value={24}>24 maanden</option>
                <option value={60}>5 jaar (alles)</option>
              </select>
            </label>

            <div style={{ flex: 1 }} />

            <button
              onClick={runImport}
              disabled={preview.invoicesNew === 0}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 18px',
                background: preview.invoicesNew === 0 ? 'rgba(130,130,130,.18)' : 'var(--brand)',
                color: preview.invoicesNew === 0 ? 'var(--muted)' : 'var(--brand-background)',
                fontWeight: 700, fontSize: 13, border: 'none', borderRadius: 10,
                cursor: preview.invoicesNew === 0 ? 'not-allowed' : 'pointer',
                boxShadow: preview.invoicesNew === 0 ? 'none' : '0 4px 20px rgba(255,191,0,.22), inset 0 1px 0 rgba(255,255,255,.2)',
              }}
            >
              <Sparkles size={14} />
              {preview.invoicesNew === 0
                ? 'Niets nieuws'
                : `Importeer ${preview.invoicesNew} facturen`}
            </button>
          </div>
        </div>
      )}

      {/* ───── STATE: import bezig ───── */}
      {imp.running && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, color: GOLD }}>
            <Loader2 size={16} className="spin" />
            <span style={{ fontSize: 13, fontWeight: 600 }}>
              Importeren… {imp.totalProcessed}/{preview.invoicesNew} facturen
            </span>
          </div>
          <div style={{ height: 6, background: 'rgba(255,255,255,.06)', borderRadius: 3, overflow: 'hidden', marginBottom: 12 }}>
            <div style={{
              height: '100%',
              width: `${Math.min(100, (imp.totalProcessed / Math.max(1, preview.invoicesNew)) * 100)}%`,
              background: `linear-gradient(90deg, ${GOLD}, var(--brand))`,
              transition: 'width .25s ease',
            }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 8, fontSize: 11, color: 'var(--muted)' }}>
            <SubStat label="Direct (UBL)" value={imp.withDetails} good />
            <SubStat label="Via PDF + AI" value={imp.withPdf} />
            <SubStat label="Mutaties" value={imp.mutationsCreated} good />
            <SubStat label="AI-kosten" value={fmtEur(imp.costCents)} />
            {imp.failed > 0 && <SubStat label="Mislukt" value={imp.failed} bad />}
          </div>
        </div>
      )}

      {/* ───── STATE: klaar ───── */}
      {!imp.running && imp.done && (
        <div>
          <div style={{
            display: 'flex', gap: 10, padding: 12, borderRadius: 10,
            background: 'rgba(76,175,80,.08)', border: '1px solid rgba(76,175,80,.25)',
            color: '#86efac', fontSize: 13, marginBottom: 12,
          }}>
            <Check size={16} style={{ flexShrink: 0, marginTop: 1 }} />
            <div>
              Klaar! <strong>{imp.mutationsCreated}</strong> prijsmutaties klaargezet voor review.
              {imp.withDetails > 0 && <> {imp.withDetails} factuur(en) gingen direct (geen AI nodig).</>}
              {imp.withPdf > 0 && <> {imp.withPdf} via PDF + AI ({fmtEur(imp.costCents)}).</>}
              {imp.failed > 0 && <> {imp.failed} mislukt — zie tracking-tabel.</>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              onClick={() => { setImp(initialImport); void loadPreview(); }}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px',
                background: 'rgba(130,130,130,.12)', color: 'var(--text)', fontSize: 12,
                border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer',
              }}
            >
              <RefreshCw size={12} /> Refresh
            </button>
            <a href="#inbox-section" style={{ textDecoration: 'none' }}>
              <button style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px',
                background: GOLD, color: '#000', fontSize: 12, fontWeight: 700,
                border: 'none', borderRadius: 8, cursor: 'pointer',
              }}>
                <TrendingUp size={12} /> Ga naar review-queue <ExternalLink size={12} />
              </button>
            </a>
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        :global(.spin) { animation: spin .9s linear infinite; }
      `}</style>
    </div>
  );
}

function Stat({ label, value, accent, isText, small }: { label: string; value: number | string; accent?: string; isText?: boolean; small?: boolean }) {
  return (
    <div style={{
      padding: '10px 12px', background: 'rgba(255,255,255,.02)',
      border: '1px solid var(--border)', borderRadius: 10,
    }}>
      <div style={{ fontSize: 9, letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--muted-light)', fontWeight: 700, marginBottom: 4 }}>
        {label}
      </div>
      <div style={{
        fontSize: isText ? 11 : (small ? 16 : 22),
        fontWeight: 700,
        color: accent || 'var(--text)',
        letterSpacing: isText ? 'normal' : '-.02em',
        lineHeight: 1.1,
      }}>
        {value}
      </div>
    </div>
  );
}

function SubStat({ label, value, good, bad }: { label: string; value: number | string; good?: boolean; bad?: boolean }) {
  return (
    <div>
      <div style={{ color: 'var(--muted-light)', fontSize: 9, letterSpacing: '.14em', textTransform: 'uppercase', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 700, color: good ? '#86efac' : bad ? '#fca5a5' : 'var(--text)' }}>{value}</div>
    </div>
  );
}
