'use client';

/**
 * LoadMenuTemplateSheet — rechter-drawer in de offerte-wizard.
 *
 * Toont de gebruiker's opgeslagen menukaarten en laadt er één in de wizard.
 * Reuses menu_templates.menu_selectie (legacy by-naam shape) als bron voor
 * prefill — die JSONB wordt server-side gesynchroniseerd vanuit
 * menu_template_items door rpc_upsert_menu_template, dus altijd up-to-date.
 *
 * Bij klik op een template callt onLoad met de wizard-vriendelijke payload.
 * MenuWizard zet die meteen door naar z'n eigen state.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { X, BookOpen, Star, Loader2, Search, ExternalLink } from 'lucide-react';
import { supabase } from '@/lib/supabase';

export interface LoadedMenuTemplate {
    id: number;
    naam: string;
    menu_selectie: Record<string, string[]>;
    basis_prijs_pp: number;
    aantal_gasten: number;
}

interface TemplateRow {
    id: number;
    naam: string;
    beschrijving: string | null;
    basis_prijs_pp: number | string;
    aantal_gasten: number | null;
    is_default: boolean | null;
    menu_selectie: unknown;
    updated_at: string;
}

interface Props {
    open: boolean;
    onClose: () => void;
    onLoad: (t: LoadedMenuTemplate) => void;
}

function parseSelectie(raw: unknown): Record<string, string[]> {
    if (!raw) return {};
    if (typeof raw === 'string') {
        try { return parseSelectie(JSON.parse(raw)); } catch { return {}; }
    }
    if (typeof raw === 'object' && !Array.isArray(raw)) {
        const out: Record<string, string[]> = {};
        for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
            if (Array.isArray(v)) {
                out[k] = v.filter((s): s is string => typeof s === 'string');
            }
        }
        return out;
    }
    return {};
}

export default function LoadMenuTemplateSheet({ open, onClose, onLoad }: Props) {
    const [rows, setRows] = useState<TemplateRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [query, setQuery] = useState('');
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!open || !supabase) return;
        let cancelled = false;
        setLoading(true);
        setError(null);
        supabase
            .from('menu_templates')
            .select('id, naam, beschrijving, basis_prijs_pp, aantal_gasten, is_default, menu_selectie, updated_at')
            .eq('actief', true)
            .order('is_default', { ascending: false })
            .order('updated_at', { ascending: false })
            .limit(50)
            .then((res) => {
                if (cancelled) return;
                setLoading(false);
                if (res.error) {
                    setError(res.error.message);
                    return;
                }
                setRows((res.data ?? []) as TemplateRow[]);
            });
        return () => { cancelled = true; };
    }, [open]);

    const filtered = useMemo(() => {
        if (!query.trim()) return rows;
        const q = query.toLowerCase();
        return rows.filter(r =>
            r.naam.toLowerCase().includes(q) ||
            (r.beschrijving ?? '').toLowerCase().includes(q),
        );
    }, [rows, query]);

    if (!open) return null;

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-label="Laad menukaart"
            className="mr-modal-scrim"
            onClick={onClose}
            style={{ background: 'rgba(0,0,0,0.55)' }}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                style={{
                    position: 'fixed', right: 0, top: 0, bottom: 0, width: '95%', maxWidth: 480,
                    background: 'var(--surface)', borderLeft: '1px solid var(--border)',
                    display: 'flex', flexDirection: 'column',
                    boxShadow: '-12px 0 32px rgba(0,0,0,0.25)',
                }}
            >
                <div style={{
                    padding: 14, borderBottom: '1px solid var(--border)',
                    display: 'flex', alignItems: 'center', gap: 10,
                }}>
                    <BookOpen size={18} color="var(--brand, #c4a35a)" />
                    <h3 style={{ margin: 0, flex: 1, fontSize: 15 }}>Laad menukaart</h3>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Sluit"
                        style={{ border: 'none', background: 'transparent', color: 'var(--muted)', cursor: 'pointer', padding: 4 }}
                    >
                        <X size={16} />
                    </button>
                </div>

                <div style={{ padding: 12, borderBottom: '1px solid var(--border)' }}>
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6,
                    }}>
                        <Search size={14} color="var(--muted)" />
                        <input
                            type="text"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Zoek op naam of beschrijving…"
                            style={{
                                flex: 1, border: 'none', background: 'transparent', color: 'var(--text)',
                                fontSize: 13, outline: 'none',
                            }}
                            autoFocus
                        />
                    </div>
                </div>

                <div style={{ flex: 1, overflow: 'auto', padding: 12 }}>
                    {loading && (
                        <div style={{ textAlign: 'center', padding: 24, color: 'var(--muted)' }}>
                            <Loader2 size={18} className="animate-spin" /> Menukaarten laden…
                        </div>
                    )}
                    {error && (
                        <div style={{
                            padding: 12, background: 'rgba(220,50,47,.07)',
                            border: '1px solid rgba(220,50,47,.25)', borderRadius: 6,
                            color: 'var(--text)', fontSize: 13,
                        }}>
                            Kon menukaarten niet laden: {error}
                        </div>
                    )}
                    {!loading && !error && filtered.length === 0 && (
                        <div style={{
                            textAlign: 'center', padding: 28, color: 'var(--muted)',
                            border: '1px dashed var(--border)', borderRadius: 8, fontSize: 13,
                        }}>
                            {query.trim()
                                ? `Geen menukaarten gevonden voor "${query}".`
                                : 'Nog geen menukaarten opgeslagen.'}
                            <div style={{ marginTop: 12 }}>
                                <Link
                                    href="/gerechten/menukaarten/nieuw"
                                    target="_blank"
                                    style={{
                                        display: 'inline-flex', alignItems: 'center', gap: 6,
                                        padding: '6px 12px', fontSize: 12,
                                        border: '1px solid var(--border)', borderRadius: 4,
                                        color: 'var(--text)', textDecoration: 'none',
                                    }}
                                >
                                    Maak menukaart <ExternalLink size={12} />
                                </Link>
                            </div>
                        </div>
                    )}
                    {filtered.map((t) => {
                        const selectie = parseSelectie(t.menu_selectie);
                        const totaal = Object.values(selectie).reduce((s, arr) => s + arr.length, 0);
                        const gangen = Object.keys(selectie).length;
                        return (
                            <button
                                key={t.id}
                                type="button"
                                onClick={() => {
                                    onLoad({
                                        id: t.id,
                                        naam: t.naam,
                                        menu_selectie: selectie,
                                        basis_prijs_pp: Number(t.basis_prijs_pp ?? 0),
                                        aantal_gasten: Number(t.aantal_gasten ?? 40),
                                    });
                                }}
                                style={{
                                    display: 'block', width: '100%', textAlign: 'left',
                                    padding: 12, marginBottom: 10, borderRadius: 8,
                                    border: '1px solid var(--border)', background: 'transparent',
                                    color: 'var(--text)', cursor: 'pointer',
                                }}
                            >
                                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                                    <strong style={{ fontSize: 14, flex: 1 }}>{t.naam}</strong>
                                    {t.is_default && (
                                        <span style={{
                                            display: 'inline-flex', alignItems: 'center', gap: 4,
                                            padding: '2px 8px', fontSize: 10, fontWeight: 600,
                                            color: 'var(--brand, #c4a35a)', background: 'rgba(196,163,90,.1)',
                                            borderRadius: 99,
                                        }}>
                                            <Star size={10} /> Default
                                        </span>
                                    )}
                                </div>
                                {t.beschrijving && (
                                    <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {t.beschrijving}
                                    </div>
                                )}
                                <div style={{ display: 'flex', gap: 12, marginTop: 8, fontSize: 11, color: 'var(--muted)' }}>
                                    <span>{gangen} gangen</span>
                                    <span>{totaal} gerechten</span>
                                    <span>€ {Number(t.basis_prijs_pp ?? 0).toFixed(2)} p.p.</span>
                                    <span>{t.aantal_gasten ?? 40} gasten</span>
                                </div>
                            </button>
                        );
                    })}
                </div>

                <div style={{
                    padding: 10, borderTop: '1px solid var(--border)',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    fontSize: 12, color: 'var(--muted)',
                }}>
                    <Link
                        href="/gerechten/menukaarten"
                        target="_blank"
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            color: 'var(--text)', textDecoration: 'none',
                        }}
                    >
                        Beheer menukaarten <ExternalLink size={12} />
                    </Link>
                    <button
                        type="button"
                        onClick={onClose}
                        style={{
                            padding: '6px 12px', fontSize: 12,
                            border: '1px solid var(--border)', borderRadius: 4,
                            background: 'transparent', color: 'var(--text)', cursor: 'pointer',
                        }}
                    >
                        Annuleer
                    </button>
                </div>
            </div>
        </div>
    );
}
