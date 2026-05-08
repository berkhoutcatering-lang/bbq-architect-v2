/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';
/**
 * Modal voor Chrome-extensie setup: install-link + API-key generator + key-list.
 *
 * Eenmalige flow: download extensie → genereer API-key → plak key in extensie.
 * Je hoeft dit per BBQ Architect-account maar 1× te doen.
 */

import React, { useEffect, useState } from 'react';
import { useToast } from '@/components/Toast';
import { useConfirm } from '@/components/ConfirmDialog';
import { Download, Key, Copy, Check, X, Loader2, Trash2, Chrome } from 'lucide-react';

const GOLD = '#c4a35a';

interface KeyRow {
    id: string;
    label: string;
    key_prefix: string;
    last_used_at: string | null;
    use_count: number;
    revoked_at: string | null;
    created_at: string;
}

export default function ExtensionConnectPanel({ onClose }: { onClose: () => void }) {
    const showToast = useToast();
    const showConfirm = useConfirm();
    const [keys, setKeys] = useState<KeyRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState(false);
    const [newKey, setNewKey] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const [keyLabel, setKeyLabel] = useState('Mijn laptop');

    async function load() {
        setLoading(true);
        try {
            const r = await fetch('/api/extension-keys');
            const d = await r.json();
            if (r.ok) setKeys(d.data || []);
        } finally {
            setLoading(false);
        }
    }
    useEffect(() => { load(); }, []);

    async function generate() {
        setGenerating(true);
        try {
            const r = await fetch('/api/extension-keys', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ label: keyLabel }),
            });
            const d = await r.json();
            if (!r.ok) throw new Error(d?.error || 'Genereren mislukt');
            setNewKey(d.rawKey);
            showToast('Nieuwe API-key gegenereerd — bewaar deze!', 'success');
            load();
        } catch (e) {
            showToast((e as Error).message, 'error');
        } finally {
            setGenerating(false);
        }
    }

    async function revoke(id: string, prefix: string) {
        showConfirm(`Key ${prefix} intrekken? Extensies die deze key gebruiken werken daarna niet meer.`, async () => {
            const r = await fetch(`/api/extension-keys/${id}`, { method: 'DELETE' });
            if (r.ok) { showToast('Key ingetrokken', 'success'); load(); }
            else showToast('Intrekken mislukt', 'error');
        });
    }

    function copyKey() {
        if (!newKey) return;
        navigator.clipboard.writeText(newKey).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2500);
        });
    }

    const activeKeys = keys.filter(k => !k.revoked_at);

    return (
        <div onClick={onClose} style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,.65)', zIndex: 110,
            display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '40px 16px',
            backdropFilter: 'blur(4px)', overflow: 'auto',
        }}>
            <div onClick={e => e.stopPropagation()} style={{
                width: '100%', maxWidth: 640,
                background: 'var(--bg)', border: `1px solid ${GOLD}44`, borderRadius: 14,
            }}>
                <div style={{
                    padding: '18px 22px', borderBottom: '1px solid var(--border)',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Chrome size={20} style={{ color: GOLD }} />
                        <div>
                            <div style={{ fontSize: 16, fontWeight: 700 }}>Chrome-extensie verbinden</div>
                            <div style={{ fontSize: 11, color: 'var(--muted)' }}>Eenmalig per laptop / Chrome-profiel</div>
                        </div>
                    </div>
                    <button onClick={onClose} style={{
                        width: 32, height: 32, borderRadius: 8, background: 'transparent',
                        border: '1px solid var(--border)', cursor: 'pointer', color: 'var(--muted)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                        <X size={14} />
                    </button>
                </div>

                <div style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 22 }}>
                    {/* Step 1: Install */}
                    <Step n={1} title="Installeer de extensie">
                        <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6, marginBottom: 10 }}>
                            Download het zip-bestand, pak uit, en laad in Chrome via{' '}
                            <code style={{ background: 'var(--card)', padding: '2px 6px', borderRadius: 4, fontSize: 11 }}>chrome://extensions</code>
                            {' '}→ "Developer mode" aan → "Load unpacked".
                        </div>
                        <a
                            href="/extension/bbq-architect-extension.zip"
                            download
                            style={{
                                display: 'inline-flex', alignItems: 'center', gap: 8,
                                padding: '10px 14px', borderRadius: 10,
                                background: 'var(--card)', border: '1px solid var(--border)',
                                color: 'var(--text)', textDecoration: 'none', fontSize: 13, fontWeight: 600,
                            }}
                        >
                            <Download size={14} /> Download extensie (.zip)
                        </a>
                    </Step>

                    {/* Step 2: Generate key */}
                    <Step n={2} title="Genereer een API-key">
                        {newKey ? (
                            <div style={{
                                padding: 14, borderRadius: 10,
                                background: `${GOLD}10`, border: `1px solid ${GOLD}55`,
                            }}>
                                <div style={{ fontSize: 11, color: GOLD, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 8 }}>
                                    ⚠ Bewaar deze key — je ziet 'm nooit meer
                                </div>
                                <div style={{
                                    display: 'flex', alignItems: 'center', gap: 8,
                                    padding: '10px 12px', borderRadius: 8,
                                    background: 'var(--bg)', border: '1px solid var(--border)',
                                    fontFamily: 'JetBrains Mono, monospace', fontSize: 12,
                                    wordBreak: 'break-all',
                                }}>
                                    <span style={{ flex: 1, color: 'var(--text)' }}>{newKey}</span>
                                    <button onClick={copyKey} style={{
                                        padding: '6px 10px', borderRadius: 6,
                                        background: copied ? '#7ec97a' : GOLD, color: '#0a0a0c', border: 'none',
                                        cursor: 'pointer', fontSize: 11, fontWeight: 700, flexShrink: 0,
                                        display: 'inline-flex', alignItems: 'center', gap: 4,
                                    }}>
                                        {copied ? <><Check size={12} /> Gekopieerd</> : <><Copy size={12} /> Kopieer</>}
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div>
                                <input
                                    value={keyLabel}
                                    onChange={e => setKeyLabel(e.target.value)}
                                    placeholder="Naam (bv. Mijn laptop)"
                                    style={{
                                        width: '100%', padding: '10px 12px', borderRadius: 8,
                                        background: 'var(--card)', border: '1px solid var(--border)',
                                        color: 'var(--text)', fontSize: 13, marginBottom: 8,
                                    }}
                                />
                                <button
                                    onClick={generate}
                                    disabled={generating}
                                    style={{
                                        display: 'inline-flex', alignItems: 'center', gap: 6,
                                        padding: '10px 14px', borderRadius: 10,
                                        background: GOLD, color: '#0a0a0c', border: 'none',
                                        cursor: generating ? 'wait' : 'pointer', opacity: generating ? 0.5 : 1,
                                        fontWeight: 700, fontSize: 13,
                                    }}
                                >
                                    {generating ? <Loader2 size={14} className="animate-spin" /> : <Key size={14} />}
                                    Genereer nieuwe key
                                </button>
                            </div>
                        )}
                    </Step>

                    {/* Step 3: Paste key */}
                    <Step n={3} title="Plak de key in de extensie">
                        <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>
                            Klik op het BBQ Architect-icoontje rechtsboven in Chrome → Settings →
                            plak de key in het veld "API-key" → klik <strong>Verbinden</strong>.
                            Je ziet dan "Verbonden met: Hop & Bites".
                        </div>
                    </Step>

                    {/* Existing keys */}
                    {!loading && activeKeys.length > 0 && (
                        <div>
                            <div style={{ fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 700, marginBottom: 8 }}>
                                Bestaande keys
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                {activeKeys.map(k => (
                                    <div key={k.id} style={{
                                        display: 'flex', alignItems: 'center', gap: 10,
                                        padding: '8px 12px', borderRadius: 8,
                                        background: 'var(--card)', border: '1px solid var(--border)',
                                    }}>
                                        <Key size={14} style={{ color: 'var(--muted)' }} />
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{k.label}</div>
                                            <div style={{ fontSize: 10, color: 'var(--muted)' }}>
                                                {k.key_prefix} · {k.use_count} gebruikt
                                                {k.last_used_at && ` · laatst ${new Date(k.last_used_at).toLocaleDateString('nl-NL')}`}
                                            </div>
                                        </div>
                                        <button onClick={() => revoke(k.id, k.key_prefix)} title="Intrekken" style={{
                                            width: 28, height: 28, borderRadius: 6, background: 'transparent',
                                            border: '1px solid var(--border)', color: '#e57373', cursor: 'pointer',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        }}>
                                            <Trash2 size={12} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
    return (
        <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <div style={{
                    width: 24, height: 24, borderRadius: 6, background: GOLD, color: '#0a0a0c',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, fontWeight: 700, flexShrink: 0,
                }}>
                    {n}
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{title}</div>
            </div>
            <div style={{ marginLeft: 34 }}>{children}</div>
        </div>
    );
}
