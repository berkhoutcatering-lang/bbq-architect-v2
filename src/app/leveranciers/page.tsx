/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';
/**
 * /leveranciers — Leveranciers-management hub.
 *
 * Lijst van alle actieve leveranciers + "+ Toevoegen" wizard met 4 import-paden.
 * Per leverancier: status, # producten, laatste sync, "Sync nu"-knop (extension-flow).
 *
 * Pillar #1 — wizard maakt het self-service: Sam voegt zelf nieuwe leveranciers
 * toe zonder dat ik er iets aan hoef te bouwen, ook voor onbekende portals.
 */

import React, { useEffect, useState, useCallback } from 'react';
import { useToast } from '@/components/Toast';
import { useConfirm } from '@/components/ConfirmDialog';
import { RequireTier } from '@/components/PaywallPrompt';
import {
    Plus, Store, AlertTriangle, Loader2, Trash2, RefreshCw, X,
    Globe, Mail, Upload, PenTool, ChevronRight, Sparkles, ExternalLink, Chrome,
} from 'lucide-react';
import ExtensionConnectPanel from './_components/ExtensionConnectPanel';
import LeverancierReviewSheet from './_components/LeverancierReviewSheet';

const GOLD = '#c4a35a';

interface Leverancier {
    id: number;
    naam: string;
    type: string | null;
    contact: string | null;
    email: string | null;
    tel: string | null;
    import_method: 'extension' | 'email_in' | 'csv' | 'manual' | null;
    portal_url: string | null;
    portal_hint: string | null;
    last_sync_at: string | null;
    last_sync_status: 'never' | 'running' | 'completed' | 'partial' | 'failed' | null;
    products_count: number;
    notes: string | null;
    scope_filter: 'alles' | 'food_drinks' | 'custom' | null;
    scope_keywords: string[] | null;
    created_at: string;
    pendingMutations?: number;
}

const KNOWN_PORTALS = [
    { hint: 'sligro',     naam: 'Sligro',      url: 'https://www.sligro.nl/' },
    { hint: 'makro',      naam: 'Makro',       url: 'https://www.makro.nl/' },
    { hint: 'baktotaal',  naam: 'Baktotaal',   url: 'https://www.baktotaal.nl/' },
    { hint: 'vuurenrook', naam: 'Vuur & Rook', url: 'https://vuurenrook.nl/' },
    { hint: 'hanos',      naam: 'Hanos',       url: 'https://www.hanos.nl/' },
    { hint: 'bidfood',    naam: 'Bidfood',     url: 'https://www.bidfood.nl/' },
];

function fmtRelative(iso: string | null): string {
    if (!iso) return 'nooit';
    const d = new Date(iso);
    const diff = (Date.now() - d.getTime()) / 1000;
    if (diff < 60) return `${Math.floor(diff)}s geleden`;
    if (diff < 3600) return `${Math.floor(diff / 60)} min geleden`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} uur geleden`;
    if (diff < 604800) return `${Math.floor(diff / 86400)} dgn geleden`;
    return d.toLocaleDateString('nl-NL', { day: '2-digit', month: 'short' });
}

export default function LeveranciersPage() {
    const showToast = useToast();
    const showConfirm = useConfirm();
    const [leveranciers, setLeveranciers] = useState<Leverancier[]>([]);
    const [loading, setLoading] = useState(true);
    const [wizardOpen, setWizardOpen] = useState(false);
    const [extPanelOpen, setExtPanelOpen] = useState(false);
    const [reviewOpen, setReviewOpen] = useState<{ id: number; naam: string } | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const r = await fetch('/api/leveranciers');
            const d = await r.json();
            if (!r.ok) throw new Error(d?.error || 'kon leveranciers niet laden');
            const list: Leverancier[] = d.data || [];
            /* Fetch pending counts in parallel */
            const counts = await Promise.all(list.map(async (lev) => {
                try {
                    const r = await fetch(`/api/leveranciers/${lev.id}/mutations`);
                    if (!r.ok) return 0;
                    const dd = await r.json();
                    return dd.count || 0;
                } catch { return 0; }
            }));
            setLeveranciers(list.map((lev, i) => ({ ...lev, pendingMutations: counts[i] })));
        } catch (e) {
            showToast((e as Error).message, 'error');
        } finally {
            setLoading(false);
        }
    }, [showToast]);

    useEffect(() => { load(); }, [load]);

    async function archive(id: number, naam: string) {
        showConfirm(`Leverancier "${naam}" archiveren? Producten blijven in voorraad.`, async () => {
            const r = await fetch(`/api/leveranciers/${id}`, { method: 'DELETE' });
            if (!r.ok) {
                const d = await r.json().catch(() => ({}));
                showToast(d?.error || 'archiveren mislukt', 'error');
                return;
            }
            showToast('Gearchiveerd', 'success');
            load();
        });
    }

    return (
        <RequireTier feature="price_intelligence">
            <div style={{ padding: '24px var(--space-mobile-edge) 32px', maxWidth: 1280, margin: '0 auto' }}>
                <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end',
                    marginBottom: 22, flexWrap: 'wrap', gap: 16,
                }}>
                    <div>
                        <h1 style={{
                            fontFamily: 'Outfit, DM Sans, sans-serif', fontWeight: 200, fontSize: 34,
                            letterSpacing: '-.015em', margin: 0, marginBottom: 4,
                        }}>
                            Leveranciers
                        </h1>
                        <div style={{ color: 'var(--muted)', fontSize: 14 }}>
                            Beheer waar je producten + prijzen vandaan komen.
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button
                            onClick={() => setExtPanelOpen(true)}
                            style={{
                                display: 'inline-flex', alignItems: 'center', gap: 8,
                                padding: '11px 14px', borderRadius: 10,
                                background: 'transparent', color: 'var(--text)',
                                border: '1px solid var(--border)', cursor: 'pointer',
                                fontWeight: 600, fontSize: 13,
                            }}
                        >
                            <Chrome size={15} /> Extensie verbinden
                        </button>
                        <button
                            onClick={() => setWizardOpen(true)}
                            style={{
                                display: 'inline-flex', alignItems: 'center', gap: 8,
                                padding: '11px 16px', borderRadius: 10,
                                background: GOLD, color: '#0a0a0c', border: 'none', cursor: 'pointer',
                                fontWeight: 700, fontSize: 13,
                                boxShadow: '0 4px 16px rgba(196,163,90,.3)',
                            }}
                        >
                            <Plus size={15} /> Leverancier toevoegen
                        </button>
                    </div>
                </div>

                {loading && leveranciers.length === 0 ? (
                    <SkeletonList />
                ) : leveranciers.length === 0 ? (
                    <EmptyState onAdd={() => setWizardOpen(true)} />
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {leveranciers.map(lev => (
                            <LeverancierCard
                                key={lev.id}
                                lev={lev}
                                onArchive={() => archive(lev.id, lev.naam)}
                                onRefresh={load}
                                onReview={() => setReviewOpen({ id: lev.id, naam: lev.naam })}
                            />
                        ))}
                    </div>
                )}

                {wizardOpen && (
                    <AddWizard
                        onClose={() => setWizardOpen(false)}
                        onCreated={() => { setWizardOpen(false); load(); }}
                    />
                )}
                {extPanelOpen && (
                    <ExtensionConnectPanel onClose={() => setExtPanelOpen(false)} />
                )}
                {reviewOpen && (
                    <LeverancierReviewSheet
                        leverancierId={reviewOpen.id}
                        leverancierNaam={reviewOpen.naam}
                        onClose={() => { setReviewOpen(null); load(); }}
                    />
                )}
            </div>
        </RequireTier>
    );
}

/* ════════════════ LIST ════════════════ */

function safeHostname(url: string | null | undefined): string | null {
    if (!url) return null;
    try {
        const h = new URL(url).hostname;
        return h || null;
    } catch {
        return null;
    }
}

function LeverancierCard({ lev, onArchive, onRefresh, onReview }: { lev: Leverancier; onArchive: () => void; onRefresh: () => void; onReview: () => void }) {
    const isRunning = lev.last_sync_status === 'running';
    const isFailed = lev.last_sync_status === 'failed';
    const hasPending = (lev.pendingMutations ?? 0) > 0;
    const methodIcon =
        lev.import_method === 'extension' ? Globe :
        lev.import_method === 'email_in' ? Mail :
        lev.import_method === 'csv' ? Upload : PenTool;
    const MethodIcon = methodIcon;
    const methodLabel =
        lev.import_method === 'extension' ? 'Extensie scan' :
        lev.import_method === 'email_in' ? 'Email-in' :
        lev.import_method === 'csv' ? 'CSV upload' :
        lev.import_method === 'manual' ? 'Handmatig' : 'Niet ingesteld';
    const portalHost = safeHostname(lev.portal_url);

    return (
        <div style={{
            background: 'var(--card)',
            border: `1px solid ${isFailed ? '#e5737355' : hasPending ? `${GOLD}66` : isRunning ? `${GOLD}55` : 'var(--border)'}`,
            borderRadius: 12, padding: 14,
            display: 'flex', alignItems: 'center', gap: 14,
        }}>
            <div style={{
                width: 44, height: 44, borderRadius: 12,
                background: `${GOLD}1A`, border: `1px solid ${GOLD}44`,
                display: 'flex', alignItems: 'center', justifyContent: 'center', color: GOLD,
                flexShrink: 0, overflow: 'hidden',
            }}>
                {portalHost ? (
                    <img
                        src={`https://www.google.com/s2/favicons?domain=${portalHost}&sz=64`}
                        width={28} height={28}
                        style={{ borderRadius: 4 }}
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        alt=""
                    />
                ) : (
                    <Store size={20} />
                )}
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{lev.naam}</span>
                    {lev.type && (
                        <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: 'rgba(130,130,130,.12)', color: 'var(--muted)', letterSpacing: '.06em', textTransform: 'uppercase', fontWeight: 600 }}>
                            {lev.type}
                        </span>
                    )}
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <MethodIcon size={11} /> {methodLabel}
                    </span>
                    {lev.scope_filter && lev.scope_filter !== 'alles' && (
                        <span style={{ color: GOLD, fontWeight: 600 }}>
                            {lev.scope_filter === 'food_drinks' ? '🍴 Food & drinks' : '🔍 Custom-scope'}
                        </span>
                    )}
                    <span>{lev.products_count} producten</span>
                    <span>Laatste sync: {fmtRelative(lev.last_sync_at)}</span>
                    {isRunning && <span style={{ color: GOLD, display: 'inline-flex', alignItems: 'center', gap: 4 }}><Loader2 size={11} className="animate-spin" /> bezig…</span>}
                    {isFailed && <span style={{ color: '#e57373', display: 'inline-flex', alignItems: 'center', gap: 4 }}><AlertTriangle size={11} /> mislukt</span>}
                </div>
                {lev.portal_url && (
                    <a href={lev.portal_url} target="_blank" rel="noopener noreferrer" style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        fontSize: 11, color: GOLD, textDecoration: 'none', marginTop: 4,
                    }}>
                        Open portal <ExternalLink size={10} />
                    </a>
                )}
            </div>

            <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }}>
                {hasPending && (
                    <button
                        onClick={onReview}
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: 6,
                            padding: '8px 14px', borderRadius: 8,
                            background: GOLD, color: '#0a0a0c', border: 'none', cursor: 'pointer',
                            fontWeight: 700, fontSize: 12,
                            boxShadow: '0 4px 12px rgba(196,163,90,.25)',
                        }}
                    >
                        <Sparkles size={13} /> Review {lev.pendingMutations}
                    </button>
                )}
                <button
                    onClick={onRefresh}
                    title="Refresh status"
                    style={{
                        width: 34, height: 34, borderRadius: 8, background: 'transparent',
                        border: '1px solid var(--border)', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)',
                    }}
                >
                    <RefreshCw size={14} />
                </button>
                <button
                    onClick={onArchive}
                    title="Archiveer"
                    style={{
                        width: 34, height: 34, borderRadius: 8, background: 'transparent',
                        border: '1px solid var(--border)', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#e57373',
                    }}
                >
                    <Trash2 size={14} />
                </button>
            </div>
        </div>
    );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
    return (
        <div style={{
            background: 'var(--card)', border: '1px dashed var(--border)',
            borderRadius: 14, padding: '38px 22px', textAlign: 'center',
        }}>
            <div style={{
                width: 56, height: 56, borderRadius: 14,
                background: `${GOLD}14`, border: `1px solid ${GOLD}33`,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: GOLD,
                marginBottom: 14,
            }}>
                <Store size={26} />
            </div>
            <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>
                Nog geen leveranciers
            </div>
            <div style={{ fontSize: 13, color: 'var(--muted)', maxWidth: 460, margin: '0 auto', lineHeight: 1.6 }}>
                Voeg je eerste leverancier toe — Sligro, Makro, Baktotaal, Vuur & Rook of een lokale slager.
                Vier methodes om hun producten in BBQ Architect te krijgen.
            </div>
            <button
                onClick={onAdd}
                style={{
                    marginTop: 18, display: 'inline-flex', alignItems: 'center', gap: 8,
                    padding: '11px 16px', borderRadius: 10,
                    background: GOLD, color: '#0a0a0c', border: 'none', cursor: 'pointer',
                    fontWeight: 700, fontSize: 13,
                }}
            >
                <Plus size={15} /> Leverancier toevoegen
            </button>
        </div>
    );
}

function SkeletonList() {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[0, 1, 2].map(i => (
                <div key={i} style={{
                    height: 76, borderRadius: 12,
                    background: 'linear-gradient(90deg, var(--card), rgba(255,255,255,0.04), var(--card))',
                    backgroundSize: '200% 100%', animation: 'shimmer 1.4s infinite',
                    border: '1px solid var(--border)',
                }} />
            ))}
            <style jsx>{`@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>
        </div>
    );
}

/* ════════════════ ADD WIZARD ════════════════ */

interface DetectedInfo {
    naam: string;
    portal_hint: string | null;
    portal_url: string;
    scope_filter: 'alles' | 'food_drinks';
    import_method_suggestion: 'extension' | 'email_in' | 'csv' | 'manual';
    favicon_url: string | null;
    known: boolean;
    notes: string | null;
}

function AddWizard({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
    const showToast = useToast();
    const [url, setUrl] = useState('');
    const [detecting, setDetecting] = useState(false);
    const [detected, setDetected] = useState<DetectedInfo | null>(null);
    const [naam, setNaam] = useState('');
    const [scopeFilter, setScopeFilter] = useState<'alles' | 'food_drinks' | 'custom'>('food_drinks');
    const [scopeKeywords, setScopeKeywords] = useState('');
    const [portalHint, setPortalHint] = useState<string | null>(null);
    const [portalUrl, setPortalUrl] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);

    async function detect(targetUrl: string) {
        const trimmed = targetUrl.trim();
        if (!trimmed) return;
        setDetecting(true);
        setDetected(null);
        try {
            const r = await fetch('/api/leveranciers/detect', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ url: trimmed }),
            });
            const d = await r.json();
            if (!r.ok) throw new Error(d?.error || 'Detectie mislukt');
            setDetected(d);
            setNaam(d.naam || '');
            setScopeFilter(d.scope_filter || 'food_drinks');
            setPortalHint(d.portal_hint || null);
            setPortalUrl(d.portal_url || trimmed);
        } catch (e) {
            showToast((e as Error).message, 'error');
        } finally {
            setDetecting(false);
        }
    }

    function pickKnownPortal(p: typeof KNOWN_PORTALS[number]) {
        const targetUrl = p.url;
        setUrl(targetUrl);
        detect(targetUrl);
    }

    async function createLeverancier(method: 'extension' | 'email_in' | 'csv' | 'manual') {
        if (naam.trim().length < 2) {
            showToast('Naam minimaal 2 karakters', 'error');
            return;
        }
        setSubmitting(true);
        try {
            const keywords = scopeFilter === 'custom'
                ? scopeKeywords.split(',').map(s => s.trim()).filter(s => s.length > 0).slice(0, 30)
                : null;
            const r = await fetch('/api/leveranciers', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    naam: naam.trim(),
                    import_method: method,
                    portal_hint: portalHint,
                    portal_url: portalUrl || null,
                    scope_filter: scopeFilter,
                    scope_keywords: keywords,
                }),
            });
            const d = await r.json();
            if (!r.ok) throw new Error(d?.error || 'Aanmaken mislukt');
            showToast(`${naam} toegevoegd${d.restored ? ' (hersteld)' : ''}`, 'success');
            onCreated();
        } catch (e) {
            showToast((e as Error).message, 'error');
        } finally {
            setSubmitting(false);
        }
    }

    const canDetect = url.trim().length > 4 && !detecting;
    const hasResult = !!detected;
    const suggestedMethod = detected?.import_method_suggestion || 'extension';

    return (
        <div onClick={onClose} style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,.65)', zIndex: 100,
            display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 16,
            backdropFilter: 'blur(4px)',
        }}>
            <div onClick={e => e.stopPropagation()} style={{
                width: '100%', maxWidth: 640, maxHeight: '90vh', overflow: 'auto',
                background: 'var(--bg)', border: `1px solid ${GOLD}44`, borderRadius: 14,
            }}>
                {/* Header */}
                <div style={{
                    padding: '18px 22px', borderBottom: '1px solid var(--border)',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                    <div>
                        <div style={{ fontSize: 16, fontWeight: 700 }}>Leverancier toevoegen</div>
                        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                            Plak de website-URL — AI detecteert de rest
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

                <div style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 18 }}>

                    {/* URL input + detect button */}
                    <div>
                        <label style={{ display: 'block', fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 700, marginBottom: 6 }}>
                            Website-URL van de leverancier
                        </label>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <input
                                autoFocus
                                value={url}
                                onChange={e => { setUrl(e.target.value); setDetected(null); }}
                                onKeyDown={e => { if (e.key === 'Enter' && canDetect) detect(url); }}
                                placeholder="https://www.makro.nl"
                                style={{
                                    flex: 1, padding: '11px 14px', borderRadius: 10,
                                    background: 'var(--card)', border: '1px solid var(--border)',
                                    color: 'var(--text)', fontSize: 14,
                                }}
                            />
                            <button
                                onClick={() => detect(url)}
                                disabled={!canDetect}
                                style={{
                                    display: 'inline-flex', alignItems: 'center', gap: 6,
                                    padding: '11px 16px', borderRadius: 10, flexShrink: 0,
                                    background: canDetect ? GOLD : 'var(--card)',
                                    color: canDetect ? '#0a0a0c' : 'var(--muted)',
                                    border: `1px solid ${canDetect ? GOLD : 'var(--border)'}`,
                                    cursor: canDetect ? 'pointer' : 'not-allowed',
                                    fontWeight: 700, fontSize: 13, transition: 'all .15s',
                                }}
                            >
                                {detecting
                                    ? <><Loader2 size={14} className="animate-spin" /> Detecteren…</>
                                    : <><Sparkles size={14} /> AI detecteert</>
                                }
                            </button>
                        </div>
                    </div>

                    {/* Bekende portalen quickpick */}
                    <div>
                        <div style={{ fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 700, marginBottom: 8 }}>
                            Snelkeuze bekende portalen
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 7 }}>
                            {KNOWN_PORTALS.map(p => {
                                const isActive = detected?.portal_hint === p.hint;
                                return (
                                    <button
                                        key={p.hint}
                                        onClick={() => pickKnownPortal(p)}
                                        disabled={detecting}
                                        style={{
                                            padding: '9px 11px', borderRadius: 10,
                                            background: isActive ? `${GOLD}1A` : 'var(--card)',
                                            border: `1px solid ${isActive ? `${GOLD}66` : 'var(--border)'}`,
                                            cursor: detecting ? 'wait' : 'pointer', textAlign: 'left',
                                            display: 'flex', alignItems: 'center', gap: 8,
                                            transition: 'all .12s',
                                        }}
                                    >
                                        <img
                                            src={`https://www.google.com/s2/favicons?domain=${new URL(p.url).hostname}&sz=32`}
                                            width={16} height={16} style={{ borderRadius: 3 }} alt=""
                                        />
                                        <span style={{ fontSize: 13, fontWeight: 600, color: isActive ? GOLD : 'var(--text)' }}>{p.naam}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Detectie-resultaat */}
                    {hasResult && (
                        <div style={{
                            background: `${GOLD}08`, border: `1px solid ${GOLD}33`,
                            borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 14,
                        }}>
                            {/* Naam + favicon */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                {detected!.favicon_url && (
                                    <img src={detected!.favicon_url} width={36} height={36}
                                        style={{ borderRadius: 8, border: '1px solid var(--border)', flexShrink: 0 }}
                                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                        alt=""
                                    />
                                )}
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <input
                                        value={naam}
                                        onChange={e => setNaam(e.target.value)}
                                        style={{
                                            width: '100%', padding: '8px 12px', borderRadius: 8,
                                            background: 'var(--card)', border: '1px solid var(--border)',
                                            color: 'var(--text)', fontSize: 15, fontWeight: 700,
                                        }}
                                        placeholder="Naam leverancier"
                                    />
                                </div>
                                {detected!.known && (
                                    <span style={{
                                        padding: '4px 9px', borderRadius: 6, flexShrink: 0,
                                        background: `${GOLD}26`, color: GOLD,
                                        fontSize: 10, fontWeight: 700, letterSpacing: '.08em',
                                    }}>
                                        SNEL PAD
                                    </span>
                                )}
                            </div>

                            {detected!.notes && (
                                <div style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <AlertTriangle size={12} /> {detected!.notes}
                                </div>
                            )}

                            {/* Scope */}
                            <div>
                                <div style={{ fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 700, marginBottom: 8 }}>
                                    Wat halen we op?
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                    <ScopeOption
                                        value="food_drinks" active={scopeFilter === 'food_drinks'}
                                        onClick={() => setScopeFilter('food_drinks')}
                                        title="Alleen food & drinks"
                                        hint="Skip schoonmaak/kantoor/gadgets — aanbevolen voor Sligro, Makro"
                                    />
                                    <ScopeOption
                                        value="alles" active={scopeFilter === 'alles'}
                                        onClick={() => setScopeFilter('alles')}
                                        title="Alles"
                                        hint="Élk product op de site — voor BBQ-shops als Vuur & Rook"
                                    />
                                    <ScopeOption
                                        value="custom" active={scopeFilter === 'custom'}
                                        onClick={() => setScopeFilter('custom')}
                                        title="Custom keywords"
                                        hint="Alleen producten waarvan naam matched met jouw lijst"
                                    />
                                    {scopeFilter === 'custom' && (
                                        <input
                                            value={scopeKeywords}
                                            onChange={e => setScopeKeywords(e.target.value)}
                                            placeholder="vlees, vis, zuivel, kaas, brood, saus, kruiden, …"
                                            style={{
                                                marginTop: 6, padding: '8px 10px', borderRadius: 8,
                                                background: 'var(--bg)', border: '1px solid var(--border)',
                                                color: 'var(--text)', fontSize: 12, width: '100%',
                                            }}
                                        />
                                    )}
                                </div>
                            </div>

                            {/* Import-methode keuze */}
                            <div>
                                <div style={{ fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 700, marginBottom: 8 }}>
                                    Hoe halen we de catalogus binnen?
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    <MethodCard
                                        icon={Globe}
                                        title="Lees uit online portaal"
                                        tagline={detected!.known ? 'Snel pad — wij kennen dit portaal' : 'Werkt voor élk portaal waar je inlogt'}
                                        hint="Vereist Chrome-extensie (eenmalig installeren). Jij logt in zoals altijd → 1 klik scan."
                                        accent={suggestedMethod === 'extension'}
                                        onClick={() => createLeverancier('extension')}
                                        disabled={submitting}
                                    />
                                    <MethodCard
                                        icon={Mail}
                                        title="Stuur prijslijst-mails hierheen"
                                        tagline="Voor leveranciers die mailen"
                                        hint="Forward naar pl-{org}@in.bbqarchitect.app of zet een filter."
                                        accent={suggestedMethod === 'email_in'}
                                        onClick={() => createLeverancier('email_in')}
                                        disabled={submitting}
                                    />
                                    <MethodCard
                                        icon={Upload}
                                        title="Ik heb een CSV / Excel"
                                        tagline="Eenmalige import"
                                        hint="Drag-drop in /price-intelligence → tab Pricelists."
                                        onClick={() => createLeverancier('csv')}
                                        disabled={submitting}
                                    />
                                    <MethodCard
                                        icon={PenTool}
                                        title="Begin leeg, vul handmatig"
                                        tagline="Voor lokale leveranciers met weinig items"
                                        hint="Lege start — typ producten in voorraad."
                                        onClick={() => createLeverancier('manual')}
                                        disabled={submitting}
                                    />
                                </div>
                            </div>

                            {submitting && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: GOLD, fontSize: 13 }}>
                                    <Loader2 size={14} className="animate-spin" /> Bezig…
                                </div>
                            )}
                        </div>
                    )}

                    {!hasResult && !detecting && (
                        <div style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 13, padding: '8px 0' }}>
                            Plak een URL of kies een portaal hierboven — AI detecteert naam, scope en de beste import-methode.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function ScopeOption({ value, active, onClick, title, hint }: {
    value: string; active: boolean; onClick: () => void; title: string; hint: string;
}) {
    return (
        <button
            onClick={onClick}
            style={{
                display: 'flex', alignItems: 'flex-start', gap: 10,
                padding: '8px 10px', borderRadius: 8,
                background: active ? `${GOLD}10` : 'transparent',
                border: `1px solid ${active ? `${GOLD}55` : 'var(--border)'}`,
                cursor: 'pointer', textAlign: 'left',
            }}
        >
            <span style={{
                width: 14, height: 14, flexShrink: 0, borderRadius: 99, marginTop: 1,
                border: `2px solid ${active ? GOLD : 'var(--muted)'}`,
                background: active ? GOLD : 'transparent',
                boxShadow: active ? 'inset 0 0 0 2px var(--bg)' : 'none',
            }} />
            <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{title}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>{hint}</div>
            </div>
        </button>
    );
}

function MethodCard({ icon: Icon, title, tagline, hint, accent, onClick, disabled }: {
    icon: any; title: string; tagline: string; hint: string; accent?: boolean;
    onClick: () => void; disabled?: boolean;
}) {
    return (
        <button onClick={onClick} disabled={disabled} style={{
            background: accent ? `${GOLD}10` : 'var(--card)',
            border: `1px solid ${accent ? `${GOLD}66` : 'var(--border)'}`,
            borderRadius: 12, padding: 14, textAlign: 'left',
            display: 'flex', alignItems: 'flex-start', gap: 12,
            cursor: disabled ? 'wait' : 'pointer', opacity: disabled ? 0.5 : 1,
            transition: 'all .15s',
        }}>
            <div style={{
                width: 38, height: 38, borderRadius: 10, flexShrink: 0,
                background: accent ? `${GOLD}26` : 'rgba(130,130,130,.12)',
                border: `1px solid ${accent ? `${GOLD}66` : 'var(--border)'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: accent ? GOLD : 'var(--muted)',
            }}>
                <Icon size={17} />
            </div>
            <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{title}</span>
                    {accent && <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, background: `${GOLD}26`, color: GOLD, fontWeight: 700, letterSpacing: '.1em' }}>AANBEVOLEN</span>}
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{tagline}</div>
                <div style={{ fontSize: 11, color: 'var(--muted-light)', marginTop: 6, lineHeight: 1.5 }}>{hint}</div>
            </div>
            <ChevronRight size={16} style={{ color: 'var(--muted)', flexShrink: 0, marginTop: 12 }} />
        </button>
    );
}

function primaryBtn(disabled?: boolean): React.CSSProperties {
    return {
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '10px 14px', borderRadius: 10,
        background: GOLD, color: '#0a0a0c', border: 'none',
        cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
        fontWeight: 700, fontSize: 13,
    };
}
function ghostBtn(): React.CSSProperties {
    return {
        padding: '10px 14px', borderRadius: 10,
        background: 'transparent', color: 'var(--text)', border: '1px solid var(--border)',
        cursor: 'pointer', fontWeight: 600, fontSize: 13,
    };
}

