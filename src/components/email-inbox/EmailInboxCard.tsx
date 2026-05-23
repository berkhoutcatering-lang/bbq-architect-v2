'use client';
import { useEffect, useState } from 'react';
import { Mail, Inbox } from 'lucide-react';
import EmailInboxCopyButton from './EmailInboxCopyButton';

/* Client-component (omdat /instellingen client-side is). Fetcht stats via
   /api/email-inbox/stats. Toont eigen forward-adres, 30d-stats, en setup-
   instructies in een uitklap-detail. */

interface InboxStats {
    inboundAddress: string;
    total: number;
    parsed: number;
    received: number;
    failed: number;
    tableMissing?: boolean;
    error?: string;
}

export default function EmailInboxCard() {
    const [stats, setStats] = useState<InboxStats | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(function () {
        let cancelled = false;
        (async function () {
            try {
                const res = await fetch('/api/email-inbox/stats', { credentials: 'include' });
                const body = await res.json();
                if (cancelled) return;
                if (!res.ok) {
                    setStats({ inboundAddress: '', total: 0, parsed: 0, received: 0, failed: 0, error: body.error || 'Laden mislukt' });
                } else {
                    setStats(body);
                }
            } catch (e: unknown) {
                if (!cancelled) {
                    const msg = e instanceof Error ? e.message : 'Onbekende fout';
                    setStats({ inboundAddress: '', total: 0, parsed: 0, received: 0, failed: 0, error: msg });
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return function () { cancelled = true; };
    }, []);

    return (
        <section id="email-inbox" style={{
            padding: 20, marginBottom: 20, borderRadius: 14,
            background: 'rgba(255,255,255,.02)',
            border: '1px solid var(--border)',
        }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 14 }}>
                <div style={{
                    width: 40, height: 40, borderRadius: 10,
                    background: 'rgba(96,165,250,.08)', color: '#60a5fa',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                    <Mail size={18} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 17, fontWeight: 400, color: 'var(--text)', marginBottom: 4 }}>
                        Email-inbox voor bonnen & facturen
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--muted-light)', lineHeight: 1.5 }}>
                        Stuur leveranciers-facturen door naar je eigen adres en BBQ Architect leest ze
                        automatisch in. Werkt voor PDF, foto en inline-tekst. Verschijnt daarna in <strong>Archief</strong>.
                    </div>
                </div>
            </div>

            {loading && (
                <div style={{ padding: 14, fontSize: 12, color: 'var(--muted)' }}>Laden…</div>
            )}

            {!loading && stats && stats.inboundAddress && (
                <div style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 14px', borderRadius: 10,
                    background: 'rgba(0,0,0,.3)', border: '1px solid var(--border)',
                    marginBottom: 14, flexWrap: 'wrap',
                }}>
                    <Inbox size={14} style={{ color: 'var(--muted)', flexShrink: 0 }} aria-hidden />
                    <code style={{
                        flex: 1, fontFamily: 'ui-monospace, SFMono-Regular, monospace',
                        fontSize: 13, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis',
                        minWidth: 0,
                    }}>{stats.inboundAddress}</code>
                    <EmailInboxCopyButton value={stats.inboundAddress} />
                </div>
            )}

            {!loading && stats && !stats.inboundAddress && !stats.error && (
                <div style={{
                    padding: '10px 14px', borderRadius: 10, marginBottom: 14,
                    background: 'rgba(245,158,11,.08)', border: '1px solid rgba(245,158,11,.3)',
                    fontSize: 12, color: '#f59e0b',
                }}>
                    Email-adres niet beschikbaar — je organisatie heeft nog geen <code>slug</code>.
                    Een admin moet die zetten in Platform-Beheer.
                </div>
            )}

            {!loading && stats && stats.inboundAddress && !stats.tableMissing && !stats.error && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 14 }}>
                    <StatTile label="Deze 30 dagen" value={stats.total} accent={null} />
                    <StatTile label="Verwerkt" value={stats.parsed} accent="#10b981" />
                    <StatTile label="In review" value={stats.received} accent="#f59e0b" />
                    <StatTile label="Mislukt" value={stats.failed} accent={stats.failed > 0 ? '#ef4444' : null} />
                </div>
            )}

            {!loading && stats?.tableMissing && (
                <div style={{
                    padding: '10px 14px', borderRadius: 10, marginBottom: 14,
                    background: 'rgba(245,158,11,.08)', border: '1px solid rgba(245,158,11,.3)',
                    fontSize: 12, color: '#f59e0b',
                }}>
                    Email-inbox tabel niet beschikbaar — run <code>024_email_inbox_and_review_queue.sql</code> in Supabase Studio.
                </div>
            )}

            {!loading && stats?.error && (
                <div style={{
                    padding: '10px 14px', borderRadius: 10, marginBottom: 14,
                    background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.3)',
                    fontSize: 12, color: '#ef4444',
                }}>
                    {stats.error}
                </div>
            )}

            <details>
                <summary style={{
                    cursor: 'pointer', fontSize: 12, fontWeight: 600, color: 'var(--muted)',
                    padding: '6px 0', userSelect: 'none',
                }}>Hoe zet ik dit aan?</summary>
                <ol style={{ fontSize: 12, color: 'var(--muted-light)', lineHeight: 1.6, marginTop: 10, paddingLeft: 18 }}>
                    <li>Kopieer het adres hierboven.</li>
                    <li>Forward losse facturen vanuit je mail-client — of vraag leveranciers om dit adres in CC te zetten bij elke factuur.</li>
                    <li>Binnen ~30 seconden verschijnt de bon in <strong>Archief</strong>, geclassificeerd door AI.</li>
                    <li>Mails worden gededupliceerd op message-ID — twee keer doorsturen geeft geen dubbele bon.</li>
                    <li>SPF/DKIM-status wordt gelogd; verdachte mails komen in &ldquo;In review&rdquo; voor handmatige bevestiging.</li>
                </ol>
            </details>
        </section>
    );
}

function StatTile({ label, value, accent }: { label: string; value: number; accent: string | null }) {
    return (
        <div style={{
            padding: '10px 12px', borderRadius: 10,
            background: accent ? `${accent}10` : 'rgba(0,0,0,.25)',
            border: `1px solid ${accent ? `${accent}30` : 'var(--border)'}`,
        }}>
            <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.1em', fontWeight: 700, marginBottom: 4 }}>
                {label}
            </div>
            <div style={{ fontSize: 22, fontWeight: 600, color: accent ?? 'var(--text)', fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>
                {value}
            </div>
        </div>
    );
}
