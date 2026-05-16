/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  BookOpen, Sparkles, Check, AlertCircle, FileText, Package2, Calendar,
  Loader2, ShieldCheck, Download, Mail, Settings, Receipt, Archive, Plus,
} from 'lucide-react';
import { RGS_CATERING_CATEGORIES, RGS_BY_CODE, SALES_CODES } from '@/lib/rgsCategories';
import BonAddSheet from './_components/BonAddSheet';

/**
 * /geld/boekhouder — Boekhouder-pakket UI
 * ────────────────────────────────────────
 * Pillar #1 (RGS-native) · #2 (catering-context) · #3 (twijfel-stapel) · #4 (maandpakket).
 *
 * 4 tabs:
 *   1. Bonnen-stapel   — inkoop-bonnen + AI-suggestie + 1-tap accept
 *   2. Verkoop          — verkoop-facturen + RGS-code per factuur
 *   3. Pakket          — genereer maand-PDF + CSV + email naar boekhouder
 *   4. Twijfel         — filtered queue van flagged items
 */

type Tab = 'stapel' | 'verkoop' | 'pakket' | 'twijfel' | 'archief';
type StatusFilter = 'alle' | 'pending' | 'auto' | 'twijfel';

interface Row {
  id: number;
  datum: string | null;
  totaal_bedrag: number | null;
  netto_bedrag: number | null;
  btw_laag_bedrag: number | null;
  btw_hoog_bedrag: number | null;
  notities: string | null;
  categorie: string | null;
  event_id: number | null;
  image_url: string | null;
  rgs_code: string | null;
  rgs_category_label: string | null;
  rgs_kind: string | null;
  rgs_btw_default: string | null;
  rgs_hint: string | null;
  ai_classify_status: string | null;
  ai_classify_confidence: number | null;
  ai_classify_reasoning: string | null;
  classified_at: string | null;
  locked_at: string | null;
  leverancier: { id: number; naam: string; type: string } | null;
  event: { id: number; name: string; date: string; guests: number } | null;
}

interface Counts {
  total: number;
  pending: number;
  auto_accepted: number;
  manual: number;
  twijfel: number;
  verified: number;
  locked: number;
}

function fmtEur(n: number | null | undefined): string {
  const v = Number(n) || 0;
  return v.toLocaleString('nl-NL', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 });
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso.length === 10 ? iso + 'T00:00:00' : iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' });
}

function defaultMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function BoekhouderPage() {
  const [tab, setTab] = useState<Tab>('stapel');
  const [month, setMonth] = useState<string>(defaultMonth());
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('alle');
  const [rows, setRows] = useState<Row[]>([]);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [loading, setLoading] = useState(true);
  const [classifying, setClassifying] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [migrationMissing, setMigrationMissing] = useState(false);
  const [bonAddOpen, setBonAddOpen] = useState(false);

  const fetchBonnen = useCallback(async function () {
    setLoading(true);
    try {
      const r = await fetch(
        `/api/boekhouder/bonnen?month=${month}&status=${statusFilter}`,
        { credentials: 'include' }
      );
      if (r.status === 503) {
        setMigrationMissing(true);
        setRows([]); setCounts(null);
        return;
      }
      setMigrationMissing(false);
      if (!r.ok) { setRows([]); setCounts(null); return; }
      const j = await r.json();
      setRows(j.rows || []);
      setCounts(j.counts || null);
    } catch {
      setRows([]); setCounts(null);
    } finally { setLoading(false); }
  }, [month, statusFilter]);

  useEffect(function () { fetchBonnen(); }, [fetchBonnen]);

  const pendingIds = useMemo(function () {
    return rows
      .filter(r => !r.ai_classify_status || r.ai_classify_status === 'pending')
      .map(r => r.id);
  }, [rows]);

  async function classifyPending() {
    if (pendingIds.length === 0) return;
    setClassifying(true);
    try {
      // Per batch van 20
      const batches: number[][] = [];
      for (let i = 0; i < pendingIds.length; i += 20) batches.push(pendingIds.slice(i, i + 20));
      for (const batch of batches) {
        await fetch('/api/boekhouder/classify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ bon_ids: batch }),
        });
      }
      await fetchBonnen();
    } finally {
      setClassifying(false);
    }
  }

  async function patchBon(id: number, action: 'accept' | 'mark_twijfel' | 'set_category', extra: Record<string, unknown> = {}) {
    await fetch('/api/boekhouder/bonnen', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ id, action, ...extra }),
    });
    await fetchBonnen();
  }

  const twijfelRows = useMemo(function () {
    return rows.filter(r => r.ai_classify_status === 'twijfel');
  }, [rows]);

  const visibleRows = tab === 'twijfel' ? twijfelRows : rows;

  return (
    <div className="boekhouder-page" style={{ padding: '24px var(--space-mobile-edge) 32px', maxWidth: 1440, margin: '0 auto' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 16, marginBottom: 20 }}>
        <div>
          <h1 style={{ fontFamily: 'Outfit, DM Sans, sans-serif', fontWeight: 200, fontSize: 34, letterSpacing: '-.015em', margin: 0, marginBottom: 4 }}>
            Boekhouder
          </h1>
          <div style={{ color: 'var(--muted)', fontSize: 14 }}>
            RGS-categorisering · maandelijks pakket dat je boekhouder zo importeert
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            type="button"
            className="bh-btn-primary"
            onClick={() => setBonAddOpen(true)}
            title="Bon of factuur toevoegen met AI-extract + voorraad-suggestie"
          >
            <Plus size={14} /> Bon toevoegen
          </button>
          <label style={{ fontSize: 12, color: 'var(--muted)' }}>Maand:</label>
          <input
            type="month"
            value={month}
            onChange={e => setMonth(e.target.value)}
            style={{ background: 'var(--card-solid)', color: 'var(--text, #f5f5f5)', border: '1px solid var(--border, rgba(255,255,255,.12))', borderRadius: 8, padding: '6px 10px', fontSize: 13 }}
          />
        </div>
      </header>

      {bonAddOpen && (
        <BonAddSheet
          onClose={() => setBonAddOpen(false)}
          onCommitted={() => { fetchBonnen(); }}
        />
      )}

      {/* Migration-missing banner */}
      {migrationMissing && (
        <div style={{
          background: 'rgba(245,158,11,.1)',
          border: '1px solid rgba(245,158,11,.35)',
          borderRadius: 12,
          padding: '14px 16px',
          marginBottom: 16,
          display: 'flex',
          alignItems: 'flex-start',
          gap: 12,
        }}>
          <AlertCircle size={18} style={{ color: 'var(--amber, #f59e0b)', flexShrink: 0, marginTop: 2 }} />
          <div style={{ fontSize: 13, lineHeight: 1.5 }}>
            <strong>Migration nog niet gedraaid.</strong> De boekhouder-tabel kolommen bestaan nog niet in de database.
            <br />
            <span style={{ color: 'var(--muted)' }}>
              Run <code style={{ background: 'rgba(0,0,0,.3)', padding: '2px 6px', borderRadius: 4 }}>supabase/migrations/20260511130000_boekhouder_pakket.sql</code> via Supabase Studio → SQL Editor, ververs daarna deze pagina.
            </span>
          </div>
        </div>
      )}

      {/* KPI strip */}
      {counts && (
        <div className="bh-kpi-strip">
          <KpiTile label="Totaal" value={counts.total} tone="neutral" />
          <KpiTile label="Nog te classificeren" value={counts.pending} tone={counts.pending > 0 ? 'warn' : 'ok'} icon={Sparkles} />
          <KpiTile label="Auto-geaccepteerd" value={counts.auto_accepted} tone="ok" icon={Check} />
          <KpiTile label="Handmatig" value={counts.manual} tone="neutral" />
          <KpiTile label="Twijfel" value={counts.twijfel} tone={counts.twijfel > 0 ? 'warn' : 'ok'} icon={AlertCircle} />
          <KpiTile label="Vergrendeld" value={counts.locked} tone="neutral" icon={ShieldCheck} />
        </div>
      )}

      {/* Tabs */}
      <nav className="bh-tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'stapel'} className={'bh-tab' + (tab === 'stapel' ? ' bh-tab--active' : '')} onClick={() => setTab('stapel')}>
          <Package2 size={14} /> Inkoop-bonnen <span className="bh-tab__count">{counts?.total ?? 0}</span>
        </button>
        <button role="tab" aria-selected={tab === 'verkoop'} className={'bh-tab' + (tab === 'verkoop' ? ' bh-tab--active' : '')} onClick={() => setTab('verkoop')}>
          <Receipt size={14} /> Verkoop-facturen
        </button>
        <button role="tab" aria-selected={tab === 'pakket'} className={'bh-tab' + (tab === 'pakket' ? ' bh-tab--active' : '')} onClick={() => setTab('pakket')}>
          <FileText size={14} /> Boekhouder-pakket
        </button>
        <button role="tab" aria-selected={tab === 'twijfel'} className={'bh-tab' + (tab === 'twijfel' ? ' bh-tab--active' : '')} onClick={() => setTab('twijfel')}>
          <AlertCircle size={14} /> Twijfel <span className="bh-tab__count">{twijfelRows.length}</span>
        </button>
        <button role="tab" aria-selected={tab === 'archief'} className={'bh-tab' + (tab === 'archief' ? ' bh-tab--active' : '')} onClick={() => setTab('archief')}>
          <Archive size={14} /> Archief
        </button>
      </nav>

      {/* TAB CONTENT */}
      {tab === 'archief' ? (
        <ArchiefTab />
      ) : tab === 'verkoop' ? (
        <VerkoopTab month={month} />
      ) : tab === 'pakket' ? (
        <PakketTab month={month} counts={counts} rows={rows} />
      ) : (
        <>
          {/* Filter strip */}
          {tab === 'stapel' && (
            <div className="bh-filter-strip">
              {(['alle', 'pending', 'auto', 'twijfel'] as StatusFilter[]).map(f => (
                <button
                  key={f}
                  className={'bh-filter' + (statusFilter === f ? ' bh-filter--active' : '')}
                  onClick={() => setStatusFilter(f)}
                >
                  {f === 'alle' ? 'Alle' : f === 'pending' ? 'Wachtend' : f === 'auto' ? 'Auto/verified' : 'Twijfel'}
                </button>
              ))}
              <div style={{ flex: 1 }} />
              {pendingIds.length > 0 && (
                <button onClick={classifyPending} disabled={classifying} className="bh-btn-primary">
                  {classifying ? <><Loader2 size={14} className="bh-spin" /> AI classificeert {pendingIds.length}…</> : <><Sparkles size={14} /> Classificeer {pendingIds.length} bonnen</>}
                </button>
              )}
            </div>
          )}

          {loading ? (
            <div className="bh-empty">Bonnen laden…</div>
          ) : visibleRows.length === 0 ? (
            <div className="bh-empty">
              {tab === 'twijfel' ? '🎉 Geen twijfels — perfecte maand!' : 'Geen bonnen voor deze maand/filter.'}
            </div>
          ) : (
            <ul className="bh-rows">
              {visibleRows.map(r => (
                <BonRow key={r.id} row={r} expanded={selectedId === r.id} onToggle={() => setSelectedId(selectedId === r.id ? null : r.id)} onPatch={patchBon} />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function KpiTile({ label, value, tone, icon: I }: { label: string; value: number; tone: 'ok' | 'warn' | 'neutral'; icon?: any }) {
  return (
    <div className={'bh-kpi bh-kpi--' + tone}>
      <div className="bh-kpi__label">
        {I && <I size={12} />} {label}
      </div>
      <div className="bh-kpi__value">{value}</div>
    </div>
  );
}

function BonRow({ row, expanded, onToggle, onPatch }: {
  row: Row;
  expanded: boolean;
  onToggle: () => void;
  onPatch: (id: number, action: 'accept' | 'mark_twijfel' | 'set_category', extra?: Record<string, unknown>) => Promise<void>;
}) {
  const status = row.ai_classify_status;
  const conf = row.ai_classify_confidence;
  const cat = row.rgs_code ? RGS_BY_CODE[row.rgs_code] : null;
  return (
    <li className={'bh-row bh-row--' + (status || 'pending')}>
      <button className="bh-row__main" onClick={onToggle} aria-expanded={expanded}>
        <span className="bh-row__date">{fmtDate(row.datum)}</span>
        <span className="bh-row__leverancier">{row.leverancier?.naam || '(geen leverancier)'}</span>
        <span className="bh-row__totaal">{fmtEur(row.totaal_bedrag)}</span>
        <span className="bh-row__cat">
          {cat ? (
            <>
              <span className="bh-row__cat-label">{cat.label}</span>
              {conf != null && <ConfidenceBadge confidence={conf} />}
            </>
          ) : (
            <span style={{ color: 'var(--muted)' }}>geen categorie</span>
          )}
        </span>
        {row.event && (
          <span className="bh-row__event" title={`${row.event.name} (${row.event.guests} gasten)`}>
            📅 {row.event.name.substring(0, 20)}
          </span>
        )}
        <StatusBadge status={status} locked={!!row.locked_at} />
      </button>

      {expanded && (
        <div className="bh-row__detail">
          {row.ai_classify_reasoning && (
            <div className="bh-row__reasoning">
              <Sparkles size={12} /> {row.ai_classify_reasoning}
            </div>
          )}
          <div className="bh-row__meta">
            <span>Netto: <strong>{fmtEur(row.netto_bedrag)}</strong></span>
            <span>BTW 9%: <strong>{fmtEur(row.btw_laag_bedrag)}</strong></span>
            <span>BTW 21%: <strong>{fmtEur(row.btw_hoog_bedrag)}</strong></span>
            {row.leverancier?.type && <span>Type: <strong>{row.leverancier.type}</strong></span>}
          </div>

          <div className="bh-row__cat-picker">
            <label style={{ fontSize: 11, color: 'var(--muted)', marginRight: 6 }}>Categorie wijzigen:</label>
            <select
              value={row.rgs_code || ''}
              onChange={async e => {
                if (!e.target.value) return;
                await onPatch(row.id, 'set_category', { rgs_code: e.target.value });
              }}
              disabled={!!row.locked_at}
              style={{ background: 'var(--card-solid)', color: 'var(--text, #f5f5f5)', border: '1px solid var(--border, rgba(255,255,255,.12))', borderRadius: 6, padding: '4px 8px', fontSize: 12, minWidth: 280 }}
            >
              <option value="">-- kies categorie --</option>
              {RGS_CATERING_CATEGORIES.filter(c => c.kind === 'kosten' || c.kind === 'investering' || c.kind === 'overig').map(c => (
                <option key={c.code} value={c.code}>
                  {c.label} ({c.code})
                </option>
              ))}
            </select>
          </div>

          {!row.locked_at && (
            <div className="bh-row__actions">
              {row.rgs_code && status !== 'verified' && (
                <button className="bh-btn-primary" onClick={() => onPatch(row.id, 'accept')}>
                  <Check size={12} /> Accepteer
                </button>
              )}
              {status !== 'twijfel' && (
                <button className="bh-btn-secondary" onClick={() => onPatch(row.id, 'mark_twijfel')}>
                  <AlertCircle size={12} /> Naar twijfel
                </button>
              )}
              {row.image_url && (
                <Link href={`/factuur-lezer?bon=${row.id}`} className="bh-btn-secondary">
                  <FileText size={12} /> Open bon
                </Link>
              )}
            </div>
          )}
          {row.locked_at && (
            <div style={{ color: 'var(--muted)', fontSize: 11, marginTop: 8 }}>
              <ShieldCheck size={11} /> Vergrendeld in maandpakket — read-only voor 7-jaar bewaarplicht
            </div>
          )}
        </div>
      )}
    </li>
  );
}

function ConfidenceBadge({ confidence }: { confidence: number }) {
  const pct = Math.round(confidence * 100);
  const tone = confidence >= 0.85 ? 'ok' : confidence >= 0.6 ? 'warn' : 'bad';
  return <span className={'bh-conf bh-conf--' + tone}>{pct}%</span>;
}

function StatusBadge({ status, locked }: { status: string | null; locked: boolean }) {
  if (locked) return <span className="bh-status bh-status--locked"><ShieldCheck size={10} /> vergrendeld</span>;
  if (status === 'verified') return <span className="bh-status bh-status--ok"><Check size={10} /> verified</span>;
  if (status === 'auto_accepted') return <span className="bh-status bh-status--ok"><Sparkles size={10} /> auto</span>;
  if (status === 'manual') return <span className="bh-status bh-status--ok">handmatig</span>;
  if (status === 'twijfel') return <span className="bh-status bh-status--warn"><AlertCircle size={10} /> twijfel</span>;
  return <span className="bh-status bh-status--neutral">wachtend</span>;
}

type PeriodMode = 'maand' | 'kwartaal' | 'jaar';
interface MargelekSummary {
  alerts_count: number;
  total_impact_eur: number;
  negative_impact_eur: number;
  open_alerts: number;
}

function currentQuarter(monthIso: string): string {
  const [y, m] = monthIso.split('-');
  const q = Math.floor((Number(m) - 1) / 3) + 1;
  return `${y}-Q${q}`;
}

function PakketTab({ month, counts, rows }: { month: string; counts: Counts | null; rows: Row[] }) {
  const [generating, setGenerating] = useState(false);
  const [emailing, setEmailing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [generated, setGenerated] = useState<{ pdfUrl: string; pdfName: string; csvUrl: string; csvName: string; zipUrl?: string | null; zipName?: string; bonnenCount: number; bonnenWithImage: number; periodLabel: string } | null>(null);
  const [periodMode, setPeriodMode] = useState<PeriodMode>('maand');
  const [zipBuilding, setZipBuilding] = useState(false);
  const [margelek, setMargelek] = useState<MargelekSummary | null>(null);

  // Boekhouder-settings
  const [settings, setSettings] = useState<{ boekhouder_email: string; boekhouder_naam: string; bonnen_retentie_jaar?: number } | null>(null);
  const [emailOverride, setEmailOverride] = useState('');
  const [customMessage, setCustomMessage] = useState('');

  const totals = useMemo(function () {
    let netto = 0, btw9 = 0, btw21 = 0, totaal = 0;
    rows.forEach(r => {
      netto += Number(r.netto_bedrag) || 0;
      btw9 += Number(r.btw_laag_bedrag) || 0;
      btw21 += Number(r.btw_hoog_bedrag) || 0;
      totaal += Number(r.totaal_bedrag) || 0;
    });
    return { netto, btw9, btw21, totaal, voorbelasting: btw9 + btw21 };
  }, [rows]);

  useEffect(function () {
    fetch('/api/boekhouder/settings', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(j => { if (j?.settings) setSettings(j.settings); })
      .catch(() => {});
  }, []);

  // Margelek-data voor huidige maand
  useEffect(function () {
    fetch(`/api/boekhouder/margelek?period=${month}`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(j => { if (j?.summary) setMargelek(j.summary); })
      .catch(() => {});
  }, [month]);

  function periodBody(): Record<string, unknown> {
    if (periodMode === 'maand') return { month };
    if (periodMode === 'kwartaal') return { quarter: currentQuarter(month) };
    return { year: Number(month.split('-')[0]) };
  }

  const unclassified = (counts?.pending || 0) + (counts?.twijfel || 0);
  const canLock = unclassified === 0 && rows.length > 0;

  async function generatePakket() {
    setGenerating(true);
    setMessage(null);
    try {
      const r = await fetch('/api/boekhouder/pakket', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(periodBody()),
      });
      const j = await r.json();
      if (!r.ok) {
        setMessage('Fout: ' + (j.error || 'onbekend'));
      } else {
        setGenerated({
          pdfUrl: j.pdf_data_url,
          pdfName: j.pdf_filename,
          csvUrl: j.csv_data_url,
          csvName: j.csv_filename,
          bonnenCount: j.bonnen_count,
          bonnenWithImage: j.bonnen_with_image || 0,
          periodLabel: j.period_label || month,
        });
        setMessage(`✓ Pakket gegenereerd (${j.bonnen_count} bonnen, ${j.facturen_count} facturen, ${j.kilometers_count} ritten). ${periodMode === 'maand' ? 'Maand' : periodMode === 'kwartaal' ? 'Kwartaal' : 'Jaar'} vergrendeld.`);
      }
    } catch (err: any) {
      setMessage('Fout: ' + (err?.message || 'onbekend'));
    } finally { setGenerating(false); }
  }

  async function downloadZip() {
    setZipBuilding(true);
    setMessage(null);
    try {
      const r = await fetch('/api/boekhouder/pakket', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ...periodBody(), format: 'zip' }),
      });
      const j = await r.json();
      if (!r.ok) {
        setMessage('Fout: ' + (j.error || 'onbekend'));
      } else if (j.zip_data_url) {
        download(j.zip_data_url, j.zip_filename || 'boekhouding.zip');
        setMessage(`✓ ZIP gedownload (${j.bonnen_count} bonnen, ${j.bonnen_with_image} met foto).`);
      }
    } catch (err: any) {
      setMessage('Fout: ' + (err?.message || 'onbekend'));
    } finally { setZipBuilding(false); }
  }

  function download(url: string, name: string) {
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
  }

  function periodLabel(): string {
    if (periodMode === 'maand') return new Date(month + '-01T00:00:00').toLocaleDateString('nl-NL', { year: 'numeric', month: 'long' });
    if (periodMode === 'kwartaal') return `Q${Math.floor((Number(month.split('-')[1]) - 1) / 3) + 1} ${month.split('-')[0]}`;
    return `Jaar ${month.split('-')[0]}`;
  }

  async function emailToBoekhouder() {
    setEmailing(true);
    setMessage(null);
    try {
      const r = await fetch('/api/boekhouder/pakket/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          month,
          to: emailOverride.trim() || undefined,
          message: customMessage.trim() || undefined,
        }),
      });
      const j = await r.json();
      if (!r.ok) setMessage('Fout: ' + (j.error || 'onbekend'));
      else setMessage(`✓ Verstuurd naar ${j.sent_to} (${j.bonnen_count} bonnen, ${j.facturen_count} facturen)`);
    } catch (err: any) {
      setMessage('Fout: ' + (err?.message || 'onbekend'));
    } finally { setEmailing(false); }
  }

  const recipientEmail = emailOverride.trim() || settings?.boekhouder_email || '';

  return (
    <div className="bh-pakket">
      <section className="bh-pakket__card">
        <header>
          <h2><Calendar size={16} /> Pakket voor {periodLabel()}</h2>
          <p>Eén klik → PDF + CSV + ZIP klaar voor je boekhouder. Vergrendelt de periode voor 7-jaar bewaarplicht.</p>
        </header>

        {/* Period-mode toggle */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
          {(['maand', 'kwartaal', 'jaar'] as PeriodMode[]).map(p => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriodMode(p)}
              className={'bh-filter' + (periodMode === p ? ' bh-filter--active' : '')}
            >
              {p === 'maand' ? 'Maand' : p === 'kwartaal' ? 'Kwartaal' : 'Heel jaar'}
            </button>
          ))}
        </div>

        <ul className="bh-pakket__contents">
          <li>✓ <strong>BTW-aangifte-PDF</strong> met rubrieken 1a, 1b, 5b (1-op-1 over te nemen in Belastingdienst-portaal)</li>
          <li>✓ <strong>BTW-uitsplitsing per RGS</strong> + investeringen (KIA-vraag) {'>'} €450</li>
          <li>✓ <strong>CSV met RGS-codes</strong> — direct import in Twinfield, Exact, SnelStart, AFAS</li>
          <li>✓ <strong>{counts?.total || 0} inkoop-bonnen</strong> gegroepeerd per RGS-categorie + kilometeraftrek</li>
          <li>✓ <strong>ZIP-archief</strong> met originele foto's per bon (voor Belastingdienst-controle)</li>
        </ul>

        <div className="bh-pakket__summary">
          <div><span>Bonnen</span><strong>{counts?.total || 0}</strong></div>
          <div><span>Inkoop totaal</span><strong>{fmtEur(totals.totaal)}</strong></div>
          <div><span>BTW 9% (food)</span><strong>{fmtEur(totals.btw9)}</strong></div>
          <div><span>BTW 21% (rest)</span><strong>{fmtEur(totals.btw21)}</strong></div>
        </div>

        {unclassified > 0 && (
          <div className="bh-pakket__warn">
            <AlertCircle size={14} /> Eerst {unclassified} bonnen classificeren / twijfels afhandelen vóór je vergrendelt.
          </div>
        )}

        {/* Margelek-tile als er alerts zijn deze maand */}
        {margelek && margelek.alerts_count > 0 && (
          <div style={{
            display: 'flex',
            gap: 10,
            padding: '10px 12px',
            background: 'rgba(245,158,11,.08)',
            border: '1px solid rgba(245,158,11,.25)',
            borderRadius: 8,
            marginBottom: 14,
            fontSize: 12,
            color: 'var(--muted-light)',
            alignItems: 'flex-start',
          }}>
            <AlertCircle size={14} style={{ color: 'var(--amber, #f59e0b)', flexShrink: 0, marginTop: 1 }} />
            <div>
              <strong style={{ color: 'var(--text, #f5f5f5)' }}>Margelek deze maand:</strong>
              {' '}{margelek.alerts_count} prijs-shifts bij leveranciers, totaal impact{' '}
              <strong style={{ color: margelek.total_impact_eur < 0 ? 'var(--red, #ef4444)' : 'var(--green, #22c55e)' }}>
                € {Math.abs(margelek.total_impact_eur).toFixed(2)}{margelek.total_impact_eur < 0 ? ' verlies' : ' winst'}
              </strong>.{' '}
              <Link href="/leveranciers" style={{ color: 'var(--gold, #c4a35a)' }}>open alerts ↗</Link>
            </div>
          </div>
        )}

        {!generated ? (
          <button
            className="bh-btn-primary bh-btn-primary--large"
            onClick={generatePakket}
            disabled={!canLock || generating}
          >
            {generating
              ? <><Loader2 size={14} className="bh-spin" /> Pakket bouwen…</>
              : canLock
                ? <><ShieldCheck size={14} /> Vergrendel {periodMode === 'maand' ? 'maand' : periodMode === 'kwartaal' ? 'kwartaal' : 'jaar'} + genereer pakket</>
                : 'Eerst alles classificeren'}
          </button>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
              <button className="bh-btn-primary" onClick={() => download(generated.pdfUrl, generated.pdfName)}>
                <Download size={14} /> Download PDF
              </button>
              <button className="bh-btn-primary" onClick={() => download(generated.csvUrl, generated.csvName)}>
                <Download size={14} /> Download CSV
              </button>
              <button className="bh-btn-primary" onClick={downloadZip} disabled={zipBuilding}>
                {zipBuilding
                  ? <><Loader2 size={14} className="bh-spin" /> ZIP bouwen…</>
                  : <><Download size={14} /> Download ZIP {generated.bonnenWithImage > 0 ? `(${generated.bonnenWithImage} foto's)` : ''}</>
                }
              </button>
            </div>
            {settings?.bonnen_retentie_jaar && (
              <div style={{
                fontSize: 11,
                color: 'var(--muted)',
                marginBottom: 12,
                padding: '6px 10px',
                background: 'rgba(99,102,241,.06)',
                border: '1px solid rgba(99,102,241,.18)',
                borderRadius: 6,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}>
                <ShieldCheck size={12} style={{ color: '#818cf8' }} />
                Bewaard tot {new Date(new Date().getFullYear() + (settings.bonnen_retentie_jaar || 7), new Date().getMonth(), new Date().getDate()).toLocaleDateString('nl-NL', { year: 'numeric', month: 'long' })} (Art. 52 AWR · {settings.bonnen_retentie_jaar} jaar)
              </div>
            )}
            <div className="bh-pakket__email">
              <h3 style={{ display: 'inline-flex', alignItems: 'center', gap: 6, margin: '12px 0 8px', fontSize: 14, fontWeight: 600 }}>
                <Mail size={14} /> Direct naar je boekhouder mailen
              </h3>
              <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 8px' }}>
                Stuurt PDF + CSV als bijlage. {settings?.boekhouder_email
                  ? <>Standaard naar <strong>{settings.boekhouder_email}</strong>.</>
                  : <>Geen email ingesteld <Link href="#" onClick={(e) => { e.preventDefault(); setEmailOverride('boekhouder@'); }}>vul hieronder in</Link>.</>
                }
              </p>
              <input
                type="email"
                placeholder={settings?.boekhouder_email || 'boekhouder@kantoor.nl'}
                value={emailOverride}
                onChange={e => setEmailOverride(e.target.value)}
                style={{ width: '100%', background: 'var(--card-solid)', color: 'var(--text, #f5f5f5)', border: '1px solid var(--border, rgba(255,255,255,.12))', borderRadius: 8, padding: '8px 12px', fontSize: 13, marginBottom: 8 }}
              />
              <textarea
                placeholder="Optionele begeleidende boodschap (bv. 'Eerste maand zelf gedaan, kun je dit checken?')"
                value={customMessage}
                onChange={e => setCustomMessage(e.target.value)}
                rows={2}
                style={{ width: '100%', background: 'var(--card-solid)', color: 'var(--text, #f5f5f5)', border: '1px solid var(--border, rgba(255,255,255,.12))', borderRadius: 8, padding: '8px 12px', fontSize: 13, marginBottom: 8, resize: 'vertical' }}
              />
              <button
                className="bh-btn-primary bh-btn-primary--large"
                onClick={emailToBoekhouder}
                disabled={emailing || !recipientEmail}
                style={{ width: '100%' }}
              >
                {emailing
                  ? <><Loader2 size={14} className="bh-spin" /> Versturen…</>
                  : <><Mail size={14} /> {recipientEmail ? `Verstuur naar ${recipientEmail}` : 'Geen email ingesteld'}</>
                }
              </button>
            </div>
          </>
        )}

        {message && <div className="bh-pakket__msg">{message}</div>}
      </section>

      {/* Boekhouder-settings inline */}
      <section className="bh-pakket__card" style={{ flex: '0 0 320px', maxWidth: 360 }}>
        <header>
          <h2 style={{ fontSize: 18 }}><Settings size={14} /> Boekhouder-instellingen</h2>
          <p>Eenmalig invullen — gebruikt voor email-versturen.</p>
        </header>
        <BoekhouderSettingsForm settings={settings} onSaved={(s) => setSettings(s)} />
      </section>
    </div>
  );
}

function BoekhouderSettingsForm({ settings, onSaved }: { settings: any; onSaved: (s: any) => void }) {
  const [email, setEmail] = useState('');
  const [naam, setNaam] = useState('');
  const [threshold, setThreshold] = useState(0.85);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(function () {
    if (settings) {
      setEmail(settings.boekhouder_email || '');
      setNaam(settings.boekhouder_naam || '');
      setThreshold(Number(settings.ai_classify_threshold) || 0.85);
    }
  }, [settings]);

  async function save() {
    setSaving(true); setMsg(null);
    try {
      const r = await fetch('/api/boekhouder/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          boekhouder_email: email,
          boekhouder_naam: naam,
          ai_classify_threshold: threshold,
        }),
      });
      const j = await r.json();
      if (!r.ok) setMsg('Fout: ' + (j.error || 'onbekend'));
      else {
        setMsg('✓ Opgeslagen');
        onSaved({ ...settings, boekhouder_email: email, boekhouder_naam: naam, ai_classify_threshold: threshold });
      }
    } catch (err: any) {
      setMsg('Fout: ' + (err?.message || 'onbekend'));
    } finally { setSaving(false); }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <label style={{ fontSize: 12, color: 'var(--muted)' }}>Naam boekhouder</label>
      <input
        type="text"
        placeholder="bv. Jan Visser"
        value={naam}
        onChange={e => setNaam(e.target.value)}
        style={{ background: 'var(--card-solid)', color: 'var(--text, #f5f5f5)', border: '1px solid var(--border, rgba(255,255,255,.12))', borderRadius: 8, padding: '7px 10px', fontSize: 13 }}
      />
      <label style={{ fontSize: 12, color: 'var(--muted)' }}>Email-adres</label>
      <input
        type="email"
        placeholder="jan@kantoor.nl"
        value={email}
        onChange={e => setEmail(e.target.value)}
        style={{ background: 'var(--card-solid)', color: 'var(--text, #f5f5f5)', border: '1px solid var(--border, rgba(255,255,255,.12))', borderRadius: 8, padding: '7px 10px', fontSize: 13 }}
      />
      <label style={{ fontSize: 12, color: 'var(--muted)' }}>
        AI auto-accept drempel: {Math.round(threshold * 100)}%
        <br />
        <span style={{ fontSize: 10, color: 'var(--muted)' }}>Lager = meer auto-accept, hoger = meer naar twijfel</span>
      </label>
      <input
        type="range"
        min={0.5}
        max={1}
        step={0.05}
        value={threshold}
        onChange={e => setThreshold(Number(e.target.value))}
      />
      <button className="bh-btn-primary" onClick={save} disabled={saving} style={{ marginTop: 8 }}>
        {saving ? 'Opslaan…' : 'Opslaan'}
      </button>
      {msg && <div style={{ fontSize: 12, color: msg.startsWith('✓') ? 'var(--green, #22c55e)' : 'var(--red, #ef4444)' }}>{msg}</div>}
    </div>
  );
}

interface ArchiefPakket {
  id: number;
  period_year: number;
  period_month: number | null;
  bonnen_count: number;
  facturen_count: number;
  total_purchases_eur: number;
  total_sales_eur: number;
  btw_af_te_dragen_eur: number;
  voorraadwaarde_eur: number | null;
  status: string;
  sent_to_email: string | null;
  sent_at: string | null;
  locked_at: string | null;
  created_at: string;
}

function ArchiefTab() {
  const [pakketten, setPakketten] = useState<ArchiefPakket[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState<string | null>(null);

  useEffect(function () {
    fetch('/api/boekhouder/pakket', { credentials: 'include' })
      .then(r => r.ok ? r.json() : { pakketten: [] })
      .then(j => setPakketten(j.pakketten || []))
      .catch(() => setPakketten([]))
      .finally(() => setLoading(false));
  }, []);

  async function regenerate(year: number, month: number, kind: 'pdf' | 'csv') {
    const m = `${year}-${String(month).padStart(2, '0')}`;
    setDownloading(`${m}-${kind}`);
    try {
      const r = await fetch('/api/boekhouder/pakket', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ month: m }),
      });
      const j = await r.json();
      if (!r.ok) { alert('Fout: ' + (j.error || 'onbekend')); return; }
      const a = document.createElement('a');
      a.href = kind === 'pdf' ? j.pdf_data_url : j.csv_data_url;
      a.download = kind === 'pdf' ? j.pdf_filename : j.csv_filename;
      a.click();
    } finally { setDownloading(null); }
  }

  if (loading) return <div className="bh-empty">Archief laden…</div>;
  if (pakketten.length === 0) return <div className="bh-empty">Nog geen vergrendelde pakketten in het archief.</div>;

  return (
    <ul className="bh-rows">
      {pakketten.map(function (p) {
        const periodLabel = p.period_month
          ? new Date(p.period_year, p.period_month - 1, 1).toLocaleDateString('nl-NL', { year: 'numeric', month: 'long' })
          : String(p.period_year);
        const pdfKey = `${p.period_year}-${String(p.period_month).padStart(2, '0')}-pdf`;
        const csvKey = `${p.period_year}-${String(p.period_month).padStart(2, '0')}-csv`;
        return (
          <li key={p.id} className={'bh-row bh-row--verified'}>
            <div className="bh-row__main" style={{ cursor: 'default' }}>
              <span className="bh-row__date">{periodLabel}</span>
              <span className="bh-row__leverancier">
                {p.bonnen_count} bonnen · {p.facturen_count} facturen
              </span>
              <span className="bh-row__totaal">{fmtEur(p.total_purchases_eur)}</span>
              <span className="bh-row__cat">
                <span className="bh-row__cat-label">
                  Af te dragen BTW: <strong>{fmtEur(p.btw_af_te_dragen_eur)}</strong>
                </span>
              </span>
              <div style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
                <button
                  className="bh-btn-secondary"
                  onClick={() => p.period_month && regenerate(p.period_year, p.period_month, 'pdf')}
                  disabled={downloading === pdfKey || !p.period_month}
                  title="Regenereer PDF (audit-trail intact)"
                >
                  {downloading === pdfKey ? <Loader2 size={12} className="bh-spin" /> : <Download size={12} />} PDF
                </button>
                <button
                  className="bh-btn-secondary"
                  onClick={() => p.period_month && regenerate(p.period_year, p.period_month, 'csv')}
                  disabled={downloading === csvKey || !p.period_month}
                >
                  {downloading === csvKey ? <Loader2 size={12} className="bh-spin" /> : <Download size={12} />} CSV
                </button>
              </div>
              {p.sent_at
                ? <span className="bh-status bh-status--ok" title={`Verstuurd naar ${p.sent_to_email}`}>
                    <Mail size={10} /> verstuurd
                  </span>
                : <span className="bh-status bh-status--locked"><ShieldCheck size={10} /> vergrendeld</span>}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

interface VerkoopRow {
  id: number;
  nummer: string;
  datum: string | null;
  client_naam: string;
  status: string;
  rgs_code: string;
  rgs_label: string;
  netto_eur: number;
  btw_9_eur: number;
  btw_21_eur: number;
  totaal_eur: number;
  locked_at: string | null;
}

function VerkoopTab({ month }: { month: string }) {
  const [rows, setRows] = useState<VerkoopRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [salesCodes, setSalesCodes] = useState<Array<{ code: string; label: string }>>([]);

  const fetchData = useCallback(async function () {
    setLoading(true);
    try {
      const r = await fetch(`/api/boekhouder/facturen?month=${month}`, { credentials: 'include' });
      if (r.ok) {
        const j = await r.json();
        setRows(j.rows || []);
        setSalesCodes(j.sales_codes || []);
      }
    } finally { setLoading(false); }
  }, [month]);

  useEffect(function () { fetchData(); }, [fetchData]);

  async function changeCode(id: number, code: string) {
    await fetch('/api/boekhouder/facturen', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ id, rgs_code: code }),
    });
    await fetchData();
  }

  const totals = useMemo(function () {
    return rows.reduce(function (acc, r) {
      acc.netto += r.netto_eur;
      acc.btw9 += r.btw_9_eur;
      acc.btw21 += r.btw_21_eur;
      acc.totaal += r.totaal_eur;
      return acc;
    }, { netto: 0, btw9: 0, btw21: 0, totaal: 0 });
  }, [rows]);

  if (loading) return <div className="bh-empty">Verkoop-facturen laden…</div>;
  if (rows.length === 0) return <div className="bh-empty">Geen verkoop-facturen voor {month}.</div>;

  return (
    <>
      <div className="bh-pakket__summary" style={{ marginBottom: 16 }}>
        <div><span>Facturen</span><strong>{rows.length}</strong></div>
        <div><span>Netto</span><strong>{fmtEur(totals.netto)}</strong></div>
        <div><span>BTW 9% (food)</span><strong>{fmtEur(totals.btw9)}</strong></div>
        <div><span>BTW 21% (overig)</span><strong>{fmtEur(totals.btw21)}</strong></div>
      </div>
      <ul className="bh-rows">
        {rows.map(function (r) {
          return (
            <li key={r.id} className={'bh-row bh-row--' + (r.locked_at ? 'verified' : 'auto_accepted')}>
              <div className="bh-row__main" style={{ cursor: 'default' }}>
                <span className="bh-row__date">{fmtDate(r.datum)}</span>
                <span className="bh-row__leverancier">{r.client_naam} — <span style={{ color: 'var(--muted)' }}>#{r.nummer}</span></span>
                <span className="bh-row__totaal">{fmtEur(r.totaal_eur)}</span>
                <select
                  value={r.rgs_code}
                  onChange={e => changeCode(r.id, e.target.value)}
                  disabled={!!r.locked_at}
                  style={{ background: 'var(--card-solid)', color: 'var(--text, #f5f5f5)', border: '1px solid var(--border, rgba(255,255,255,.12))', borderRadius: 6, padding: '4px 8px', fontSize: 12 }}
                >
                  {salesCodes.map(c => (
                    <option key={c.code} value={c.code}>{c.label}</option>
                  ))}
                </select>
                <span className="bh-row__event" style={{ visibility: 'hidden' }}>—</span>
                {r.locked_at
                  ? <span className="bh-status bh-status--locked"><ShieldCheck size={10} /> vergrendeld</span>
                  : <span className="bh-status bh-status--ok"><Check size={10} /> {r.status}</span>}
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}
