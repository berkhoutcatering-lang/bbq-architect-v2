/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  BookOpen, Sparkles, Check, AlertCircle, FileText, Package2, Calendar,
  ChevronDown, Loader2, ShieldCheck, X,
} from 'lucide-react';
import { RGS_CATERING_CATEGORIES, RGS_BY_CODE, type RgsCategory } from '@/lib/rgsCategories';
import { fmt } from '@/lib/utils';

/**
 * /geld/boekhouder — Boekhouder-pakket UI
 * ────────────────────────────────────────
 * Pillar #1 (RGS-native) · #2 (catering-context) · #3 (twijfel-stapel) · #4 (maandpakket).
 *
 * 3 tabs:
 *   1. Bonnen-stapel   — alle bonnen + AI-suggestie + 1-tap accept
 *   2. Pakket          — genereer maand-ZIP voor boekhouder
 *   3. Twijfel         — filtered queue van flagged items
 */

type Tab = 'stapel' | 'pakket' | 'twijfel';
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

  const fetchBonnen = useCallback(async function () {
    setLoading(true);
    try {
      const r = await fetch(
        `/api/boekhouder/bonnen?month=${month}&status=${statusFilter}`,
        { credentials: 'include' }
      );
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
          <label style={{ fontSize: 12, color: 'var(--muted)' }}>Maand:</label>
          <input
            type="month"
            value={month}
            onChange={e => setMonth(e.target.value)}
            style={{ background: 'var(--card-solid)', color: 'var(--text, #f5f5f5)', border: '1px solid var(--border, rgba(255,255,255,.12))', borderRadius: 8, padding: '6px 10px', fontSize: 13 }}
          />
        </div>
      </header>

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
          <Package2 size={14} /> Bonnen-stapel <span className="bh-tab__count">{counts?.total ?? 0}</span>
        </button>
        <button role="tab" aria-selected={tab === 'pakket'} className={'bh-tab' + (tab === 'pakket' ? ' bh-tab--active' : '')} onClick={() => setTab('pakket')}>
          <FileText size={14} /> Boekhouder-pakket
        </button>
        <button role="tab" aria-selected={tab === 'twijfel'} className={'bh-tab' + (tab === 'twijfel' ? ' bh-tab--active' : '')} onClick={() => setTab('twijfel')}>
          <AlertCircle size={14} /> Twijfel <span className="bh-tab__count">{twijfelRows.length}</span>
        </button>
      </nav>

      {/* TAB CONTENT */}
      {tab === 'pakket' ? (
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

function PakketTab({ month, counts, rows }: { month: string; counts: Counts | null; rows: Row[] }) {
  const [generating, setGenerating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

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
        body: JSON.stringify({ month }),
      });
      const j = await r.json();
      if (!r.ok) {
        setMessage('Fout: ' + (j.error || 'onbekend'));
      } else if (j.zip_data_url) {
        // Trigger download
        const a = document.createElement('a');
        a.href = j.zip_data_url;
        a.download = `boekhouding-${month}.zip`;
        a.click();
        setMessage(`✓ Pakket gedownload (${j.bonnen_count} bonnen). Maand vergrendeld.`);
      }
    } catch (err: any) {
      setMessage('Fout: ' + (err?.message || 'onbekend'));
    } finally { setGenerating(false); }
  }

  return (
    <div className="bh-pakket">
      <section className="bh-pakket__card">
        <header>
          <h2><Calendar size={16} /> Pakket voor {month}</h2>
          <p>Eind van de maand 1 klik → ZIP klaar voor je boekhouder.</p>
        </header>

        <ul className="bh-pakket__contents">
          <li>✓ {counts?.total || 0} bonnen + foto's (PDF/JPG)</li>
          <li>✓ Index.csv met RGS-codes</li>
          <li>✓ BTW-overzicht-concept-PDF</li>
          <li>✓ Totale voorbelasting: <strong>{fmtEur(totals.voorbelasting)}</strong></li>
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

        <button
          className="bh-btn-primary bh-btn-primary--large"
          onClick={generatePakket}
          disabled={!canLock || generating}
        >
          {generating
            ? <><Loader2 size={14} className="bh-spin" /> Pakket bouwen…</>
            : canLock
              ? <><ShieldCheck size={14} /> Vergrendel maand + download ZIP</>
              : 'Eerst alles classificeren'}
        </button>

        {message && <div className="bh-pakket__msg">{message}</div>}
      </section>
    </div>
  );
}
