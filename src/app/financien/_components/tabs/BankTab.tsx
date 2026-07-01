'use client';
/* BankTab — bankafschrift importeren + afletteren tegen facturen.
   Upload CAMT.053/MT940 → transacties → per binnenkomende betaling een
   match-suggestie die je met één klik bevestigt (zet factuur op betaald). */

import { useState, useEffect, useCallback, useRef } from 'react';
import { Upload, Link2, Check, X, Landmark, ArrowDownLeft, ArrowUpRight, Unlink } from 'lucide-react';
import MetallicCard from '@/components/MetallicCard';
import { fmt } from '@/lib/utils';

interface Suggestie { factuur_id?: number | string; factuur_nummer?: string; confidence: 'hoog' | 'middel' | 'laag'; reden: string; }
interface BankTx {
    id: string;
    datum: string;
    bedrag: number;
    tegennaam?: string | null;
    omschrijving?: string | null;
    status: 'ongematcht' | 'gematcht' | 'genegeerd';
    matched_factuur_id?: number | null;
    suggestie?: Suggestie | null;
}

const CONF_KLEUR: Record<string, string> = { hoog: 'var(--green)', middel: 'var(--brand)', laag: 'var(--muted)' };

export default function BankTab() {
    const [txs, setTxs] = useState<BankTx[]>([]);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState<string | null>(null);
    const [melding, setMelding] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);

    const laad = useCallback(async () => {
        setLoading(true);
        try {
            const r = await fetch('/api/financien/bank', { credentials: 'include' });
            if (r.ok) { const j = await r.json(); setTxs(j.transacties || []); }
        } finally { setLoading(false); }
    }, []);
    useEffect(() => { laad(); }, [laad]);

    async function upload(file: File) {
        setBusy('upload'); setMelding(null);
        try {
            const content = await file.text();
            const r = await fetch('/api/financien/bank', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
                body: JSON.stringify({ content }),
            });
            const j = await r.json();
            if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
            setMelding({ type: 'ok', text: `${j.geimporteerd} nieuwe transactie(s) geïmporteerd (${j.gevonden} in bestand).` });
            await laad();
        } catch (e) {
            setMelding({ type: 'err', text: (e as Error).message });
        } finally { setBusy(null); if (fileRef.current) fileRef.current.value = ''; }
    }

    async function actie(id: string, action: 'match' | 'ignore' | 'unmatch', factuur_id?: number | string) {
        setBusy(id);
        try {
            await fetch('/api/financien/bank', {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
                body: JSON.stringify({ id, action, factuur_id }),
            });
            await laad();
        } finally { setBusy(null); }
    }

    const ongematcht = txs.filter(t => t.status === 'ongematcht' && t.bedrag > 0);
    const gematcht = txs.filter(t => t.status === 'gematcht');

    return (
        <div style={{ marginTop: 16 }}>
            {/* Upload-blok */}
            <div style={{ padding: '18px 22px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 14, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(96,165,250,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Landmark size={20} color="var(--blue)" />
                </div>
                <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>Bankafschrift importeren</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>Exporteer bij je bank een <strong>CAMT.053</strong> of <strong>MT940</strong>-bestand en sleep het hierheen. Betalingen worden automatisch aan je facturen gekoppeld.</div>
                </div>
                <input ref={fileRef} type="file" accept=".xml,.xaf,.sta,.940,.txt,text/xml" style={{ display: 'none' }}
                    onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); }} />
                <button onClick={() => fileRef.current?.click()} disabled={busy === 'upload'} className="btn btn-brand"
                    style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center', gap: 6, opacity: busy === 'upload' ? 0.6 : 1 }}>
                    <Upload size={14} /> {busy === 'upload' ? 'Inlezen…' : 'Bestand kiezen'}
                </button>
            </div>

            {melding && (
                <div style={{ padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13,
                    background: melding.type === 'ok' ? 'rgba(34,197,94,.08)' : 'rgba(239,68,68,.08)',
                    border: `1px solid ${melding.type === 'ok' ? 'rgba(34,197,94,.25)' : 'rgba(239,68,68,.25)'}`,
                    color: melding.type === 'ok' ? 'var(--green)' : 'var(--red)' }}>
                    {melding.text}
                </div>
            )}

            {/* KPI */}
            <div className="stat-grid mb-24">
                <div className="stat-card"><div className="stat-val">{ongematcht.length}</div><div className="stat-label">Af te letteren</div><div className="stat-sub">binnenkomende betalingen</div></div>
                <div className="stat-card"><div className="stat-val" style={{ color: 'var(--green)' }}>{gematcht.length}</div><div className="stat-label">Gekoppeld</div><div className="stat-sub">aan een factuur</div></div>
                <div className="stat-card"><div className="stat-val">{txs.length}</div><div className="stat-label">Transacties</div><div className="stat-sub">totaal ingelezen</div></div>
            </div>

            {loading ? (
                <div className="bh-empty" style={{ padding: 24, textAlign: 'center', color: 'var(--muted)' }}>Transacties laden…</div>
            ) : txs.length === 0 ? (
                <MetallicCard hover={false}>
                    <div className="empty-state" style={{ padding: 32, textAlign: 'center' }}>
                        <Landmark size={20} style={{ opacity: .5 }} />
                        <p style={{ color: 'var(--muted)', marginTop: 8 }}>Nog geen bankafschrift ingelezen. Upload een CAMT.053- of MT940-bestand om te beginnen.</p>
                    </div>
                </MetallicCard>
            ) : (
                <MetallicCard hover={false}>
                    <div className="panel-head"><h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Link2 size={13} style={{ color: 'var(--brand)' }} /> Transacties</h3></div>
                    <div style={{ padding: 4 }}>
                        {txs.map(t => {
                            const incoming = t.bedrag > 0;
                            return (
                                <div key={t.id} data-testid={`bank-tx-${t.id}`} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: '1px solid var(--border)', opacity: t.status === 'genegeerd' ? 0.5 : 1 }}>
                                    {incoming ? <ArrowDownLeft size={16} color="var(--green)" style={{ flexShrink: 0 }} /> : <ArrowUpRight size={16} color="var(--red)" style={{ flexShrink: 0 }} />}
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.tegennaam || 'Onbekend'}</div>
                                        <div style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.datum} · {t.omschrijving || '—'}</div>
                                    </div>
                                    <div style={{ fontSize: 14, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: incoming ? 'var(--green)' : 'var(--red)', flexShrink: 0 }}>
                                        {incoming ? '+' : ''}{fmt(t.bedrag)}
                                    </div>
                                    <div style={{ width: 300, flexShrink: 0, textAlign: 'right' }}>
                                        {t.status === 'gematcht' ? (
                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                                                <span style={{ fontSize: 12, color: 'var(--green)', display: 'inline-flex', alignItems: 'center', gap: 4 }}><Check size={12} /> gekoppeld</span>
                                                <button onClick={() => actie(t.id, 'unmatch')} disabled={busy === t.id} className="btn btn-ghost" style={{ padding: '4px 8px', minHeight: 30 }} title="Ontkoppelen"><Unlink size={12} /></button>
                                            </span>
                                        ) : t.status === 'genegeerd' ? (
                                            <span style={{ fontSize: 12, color: 'var(--muted)' }}>genegeerd</span>
                                        ) : t.suggestie ? (
                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                                <span style={{ fontSize: 11, color: CONF_KLEUR[t.suggestie.confidence], textAlign: 'right' }}>
                                                    → {t.suggestie.factuur_nummer}<br /><span style={{ fontSize: 9, color: 'var(--muted)' }}>{t.suggestie.reden}</span>
                                                </span>
                                                <button onClick={() => actie(t.id, 'match', t.suggestie!.factuur_id)} disabled={busy === t.id} className="btn btn-brand" style={{ padding: '5px 10px', minHeight: 32, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                                    <Check size={12} /> Match
                                                </button>
                                                <button onClick={() => actie(t.id, 'ignore')} disabled={busy === t.id} className="btn btn-ghost" style={{ padding: '5px 8px', minHeight: 32 }} title="Negeren"><X size={12} /></button>
                                            </span>
                                        ) : incoming ? (
                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                                <span style={{ fontSize: 11, color: 'var(--muted)' }}>geen match</span>
                                                <button onClick={() => actie(t.id, 'ignore')} disabled={busy === t.id} className="btn btn-ghost" style={{ padding: '5px 8px', minHeight: 32 }} title="Negeren"><X size={12} /></button>
                                            </span>
                                        ) : (
                                            <span style={{ fontSize: 11, color: 'var(--muted)' }}>uitgaand</span>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </MetallicCard>
            )}
        </div>
    );
}
