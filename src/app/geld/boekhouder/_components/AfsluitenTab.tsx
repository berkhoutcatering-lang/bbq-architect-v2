'use client';
/* AfsluitenTab — maand afsluiten (vergrendelen) + per kwartaal de exacte
   BTW-aangifte-cijfers om over te typen bij de Belastingdienst (kopieer-knop
   per bedrag). Kwartaal vastzetten kan als alle maanden ervan zijn afgesloten. */

import { useState, useEffect, useCallback } from 'react';
import { Lock, Unlock, Copy, Check, ShieldCheck, ChevronLeft, ChevronRight } from 'lucide-react';
import { fmt } from '@/lib/utils';

const MAAND_NAMEN = ['Jan', 'Feb', 'Mrt', 'Apr', 'Mei', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec'];

interface Rubrieken {
    rubriek_1a: { omzet: number; btw: number };
    rubriek_1b: { omzet: number; btw: number };
    rubriek_5a: number;
    rubriek_5b: number;
    saldo: number;
}
interface Maand { maand: number; heeft_data: boolean; afgesloten: boolean; }
interface Kwartaal { kwartaal: number; rubrieken: Rubrieken; vastgezet: boolean; alle_maanden_afgesloten: boolean; }

export default function AfsluitenTab() {
    const [year, setYear] = useState(new Date().getFullYear());
    const [maanden, setMaanden] = useState<Maand[]>([]);
    const [kwartalen, setKwartalen] = useState<Kwartaal[]>([]);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [copied, setCopied] = useState<string | null>(null);
    const [fout, setFout] = useState<string | null>(null);

    const laad = useCallback(async () => {
        setLoading(true);
        try {
            const r = await fetch(`/api/boekhouder/afsluiten?year=${year}`, { credentials: 'include' });
            if (r.ok) { const j = await r.json(); setMaanden(j.maanden || []); setKwartalen(j.kwartalen || []); }
        } finally { setLoading(false); }
    }, [year]);
    useEffect(() => { laad(); }, [laad]);

    async function maandActie(maand: number, action: 'sluit' | 'heropen') {
        setBusy(true); setFout(null);
        try {
            const r = await fetch('/api/boekhouder/afsluiten', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
                body: JSON.stringify({ jaar: year, maand, action }),
            });
            if (!r.ok) { const j = await r.json().catch(() => ({})); setFout(j.error || 'Mislukt'); }
            await laad();
        } finally { setBusy(false); }
    }

    async function vastzetten(kwartaal: number) {
        setBusy(true); setFout(null);
        try {
            const r = await fetch('/api/financien/btw-aangifte', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
                body: JSON.stringify({ year, quarter: kwartaal }),
            });
            if (!r.ok) { const j = await r.json().catch(() => ({})); setFout(j.error || 'Mislukt'); }
            await laad();
        } finally { setBusy(false); }
    }

    function kopieer(key: string, value: number) {
        try { navigator.clipboard?.writeText(value.toFixed(2)); } catch { /* clipboard geblokkeerd */ }
        setCopied(key);
        setTimeout(() => setCopied(c => (c === key ? null : c)), 1500);
    }

    const Bedrag = ({ id, value, sub }: { id: string; value: number; sub?: string }) => (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
            <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{fmt(value)}</span>
            <button
                onClick={() => kopieer(id, value)}
                title={sub || 'Kopieer bedrag'}
                aria-label="Kopieer bedrag"
                style={{ display: 'inline-flex', alignItems: 'center', background: 'transparent', border: '1px solid var(--border, rgba(255,255,255,.12))', borderRadius: 6, padding: '3px 6px', cursor: 'pointer', color: copied === id ? 'var(--green, #22c55e)' : 'var(--muted)' }}
            >
                {copied === id ? <Check size={12} /> : <Copy size={12} />}
            </button>
        </span>
    );

    const RubriekRij = ({ code, label, omzet, btw, keyPrefix }: { code: string; label: string; omzet?: number; btw: number; keyPrefix: string }) => (
        <div style={{ display: 'grid', gridTemplateColumns: '44px 1fr auto auto', alignItems: 'center', gap: 12, padding: '9px 0', borderBottom: '1px solid var(--border, rgba(255,255,255,.08))' }}>
            <span style={{ fontWeight: 700, fontFamily: 'ui-monospace, monospace', fontSize: 13 }}>{code}</span>
            <span style={{ fontSize: 13, color: 'var(--muted)' }}>{label}</span>
            <span style={{ minWidth: 150, textAlign: 'right' }}>{omzet !== undefined ? <Bedrag id={`${keyPrefix}-omzet`} value={omzet} sub="omzet" /> : <span style={{ color: 'var(--muted)', fontSize: 11 }}>—</span>}</span>
            <span style={{ minWidth: 150, textAlign: 'right' }}><Bedrag id={`${keyPrefix}-btw`} value={btw} sub="btw" /></span>
        </div>
    );

    return (
        <div style={{ marginTop: 8 }}>
            {/* Jaar-nav */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <div style={{ fontSize: 13, color: 'var(--muted)' }}>Sluit elke maand af als 'ie klaar is. Zodra een heel kwartaal is afgesloten, kun je de aangifte vastzetten en de cijfers overtypen bij de Belastingdienst.</div>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <button onClick={() => setYear(y => y - 1)} className="bh-btn" style={{ minHeight: 32, padding: '0 8px' }} aria-label="Vorig jaar"><ChevronLeft size={14} /></button>
                    <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', minWidth: 48, textAlign: 'center' }}>{year}</span>
                    <button onClick={() => setYear(y => y + 1)} className="bh-btn" style={{ minHeight: 32, padding: '0 8px' }} aria-label="Volgend jaar"><ChevronRight size={14} /></button>
                </div>
            </div>

            {fout && (
                <div style={{ padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13, background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.25)', color: 'var(--red, #ef4444)' }}>{fout}</div>
            )}

            {loading ? (
                <div className="bh-empty" style={{ padding: 24, textAlign: 'center', color: 'var(--muted)' }}>Laden…</div>
            ) : (
                <>
                    {/* Maanden afsluiten */}
                    <div style={{ marginBottom: 8, fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.03em', color: 'var(--muted)' }}>Maanden</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10, marginBottom: 28 }}>
                        {maanden.map(m => {
                            const disabled = busy || !m.heeft_data;
                            return (
                                <div key={m.maand} style={{ padding: '12px 14px', borderRadius: 12, border: '1px solid var(--border, rgba(255,255,255,.1))', background: m.afgesloten ? 'rgba(34,197,94,.05)' : 'var(--card-solid, rgba(255,255,255,.02))', opacity: m.heeft_data ? 1 : 0.45 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                        <span style={{ fontWeight: 700 }}>{MAAND_NAMEN[m.maand - 1]}</span>
                                        {m.afgesloten
                                            ? <span style={{ fontSize: 11, color: 'var(--green, #22c55e)', display: 'inline-flex', alignItems: 'center', gap: 3 }}><Lock size={11} /> op slot</span>
                                            : <span style={{ fontSize: 11, color: 'var(--muted)' }}>{m.heeft_data ? 'open' : 'geen data'}</span>}
                                    </div>
                                    {m.heeft_data && (
                                        m.afgesloten
                                            ? <button onClick={() => maandActie(m.maand, 'heropen')} disabled={disabled} className="bh-btn" style={{ width: '100%', minHeight: 32, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}><Unlock size={12} /> Heropen</button>
                                            : <button onClick={() => maandActie(m.maand, 'sluit')} disabled={disabled} className="bh-btn-primary" style={{ width: '100%', minHeight: 32, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}><Lock size={12} /> Afsluiten</button>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {/* Kwartalen — aangiftecijfers */}
                    <div style={{ marginBottom: 8, fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.03em', color: 'var(--muted)' }}>BTW-aangifte per kwartaal</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
                        {kwartalen.map(q => {
                            const r = q.rubrieken;
                            const teBetalen = r.saldo >= 0;
                            return (
                                <div key={q.kwartaal} style={{ borderRadius: 14, border: '1px solid var(--border, rgba(255,255,255,.1))', overflow: 'hidden', background: 'var(--card-solid, rgba(255,255,255,.02))' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--border, rgba(255,255,255,.08))' }}>
                                        <span style={{ fontWeight: 700 }}>Q{q.kwartaal} {year}</span>
                                        {q.vastgezet
                                            ? <span style={{ fontSize: 11, color: 'var(--green, #22c55e)', display: 'inline-flex', alignItems: 'center', gap: 4 }}><ShieldCheck size={12} /> vastgezet</span>
                                            : <span style={{ fontSize: 11, color: 'var(--muted)' }}>concept</span>}
                                    </div>
                                    <div style={{ padding: '4px 16px 12px' }}>
                                        <RubriekRij code="1a" label="Hoog tarief (21%)" omzet={r.rubriek_1a.omzet} btw={r.rubriek_1a.btw} keyPrefix={`q${q.kwartaal}-1a`} />
                                        <RubriekRij code="1b" label="Laag tarief (9%)" omzet={r.rubriek_1b.omzet} btw={r.rubriek_1b.btw} keyPrefix={`q${q.kwartaal}-1b`} />
                                        <div style={{ display: 'grid', gridTemplateColumns: '44px 1fr auto', alignItems: 'center', gap: 12, padding: '9px 0', borderBottom: '1px solid var(--border, rgba(255,255,255,.08))' }}>
                                            <span style={{ fontWeight: 700, fontFamily: 'ui-monospace, monospace', fontSize: 13 }}>5a</span>
                                            <span style={{ fontSize: 13, color: 'var(--muted)' }}>Verschuldigde BTW</span>
                                            <span style={{ minWidth: 150, textAlign: 'right' }}><Bedrag id={`q${q.kwartaal}-5a`} value={r.rubriek_5a} /></span>
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '44px 1fr auto', alignItems: 'center', gap: 12, padding: '9px 0', borderBottom: '1px solid var(--border, rgba(255,255,255,.08))' }}>
                                            <span style={{ fontWeight: 700, fontFamily: 'ui-monospace, monospace', fontSize: 13 }}>5b</span>
                                            <span style={{ fontSize: 13, color: 'var(--muted)' }}>Voorbelasting</span>
                                            <span style={{ minWidth: 150, textAlign: 'right' }}><Bedrag id={`q${q.kwartaal}-5b`} value={r.rubriek_5b} /></span>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 12 }}>
                                            <span style={{ fontWeight: 800 }}>{teBetalen ? 'Te betalen' : 'Terug te vragen'}</span>
                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                                                <span style={{ fontSize: 18, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: teBetalen ? 'var(--brand)' : 'var(--green, #22c55e)' }}>{fmt(Math.abs(r.saldo))}</span>
                                                <button onClick={() => kopieer(`q${q.kwartaal}-saldo`, Math.abs(r.saldo))} title="Kopieer" style={{ background: 'transparent', border: '1px solid var(--border, rgba(255,255,255,.12))', borderRadius: 6, padding: '3px 6px', cursor: 'pointer', color: copied === `q${q.kwartaal}-saldo` ? 'var(--green, #22c55e)' : 'var(--muted)' }}>{copied === `q${q.kwartaal}-saldo` ? <Check size={12} /> : <Copy size={12} />}</button>
                                            </span>
                                        </div>
                                    </div>
                                    <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border, rgba(255,255,255,.08))', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                                        <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                                            {q.vastgezet ? 'Aangifte vastgezet ✓' : q.alle_maanden_afgesloten ? 'Alle maanden afgesloten — klaar om vast te zetten' : 'Sluit eerst alle maanden van dit kwartaal af'}
                                        </span>
                                        {!q.vastgezet && (
                                            <button onClick={() => vastzetten(q.kwartaal)} disabled={busy || !q.alle_maanden_afgesloten} className="bh-btn-primary" style={{ minHeight: 32, display: 'inline-flex', alignItems: 'center', gap: 5, opacity: (busy || !q.alle_maanden_afgesloten) ? 0.5 : 1 }}>
                                                <ShieldCheck size={12} /> Vastzetten
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    <div style={{ marginTop: 16, fontSize: 11, color: 'var(--muted)', lineHeight: 1.6 }}>
                        Bedragen zijn server-berekend uit je facturen + bonnen — geen AI. Kopieer ze met de knop en vul ze in bij <strong>Mijn Belastingdienst Zakelijk → Omzetbelasting</strong>. Concept-facturen tellen niet mee.
                    </div>
                </>
            )}
        </div>
    );
}
