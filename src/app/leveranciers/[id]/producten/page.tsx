'use client';
/**
 * /leveranciers/[id]/producten
 *
 * Overzicht van de gesynchroniseerde/geïmporteerde leveranciersproducten
 * (Catalogus B) met de huidige prijs en de prijs per kg/liter/stuk.
 * Donker app-thema (tokens uit globals.css) + server-side zoeken (alle producten).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useToast } from '@/components/Toast';
import { ArrowLeft, Search, Package, Loader2, RefreshCw, X, ExternalLink, History, Plus, Scale } from 'lucide-react';

const BRAND = 'var(--brand)';

interface ProductRow {
    id: number;
    name: string;
    supplier_sku: string | null;
    ean: string | null;
    unit: string | null;
    package_size: number | null;
    package_unit: string | null;
    price_cents: number | null;
    effective_price_ex_vat: number | null;
    per_kg: number | null;
    per_liter: number | null;
    per_piece: number | null;
    variable_weight: boolean;
    source: string | null;
    last_seen_at: string | null;
}

interface PriceHistoryRow {
    id: number;
    effective_price_ex_vat: number | null;
    regular_price_ex_vat: number | null;
    promo_price_ex_vat: number | null;
    price_per_kg_ex_vat: number | null;
    price_per_liter_ex_vat: number | null;
    price_per_piece_ex_vat: number | null;
    tax_mode: string | null;
    price_basis: string | null;
    is_current: boolean;
    captured_at: string | null;
    created_at: string | null;
}

const euro = (n: number | null | undefined) =>
    n === null || n === undefined || !Number.isFinite(n) ? '—' : `€${n.toFixed(2).replace('.', ',')}`;

function perUnitLabel(p: ProductRow): string {
    if (p.per_kg != null) return `€${p.per_kg.toFixed(2).replace('.', ',')} / kg`;
    if (p.per_liter != null) return `€${p.per_liter.toFixed(2).replace('.', ',')} / liter`;
    if (p.per_piece != null) return `€${p.per_piece.toFixed(2).replace('.', ',')} / stuk`;
    return '—';
}
function verpakking(p: ProductRow): string {
    if (p.package_size && p.package_unit) return `${p.package_size} ${p.package_unit}`;
    if (p.variable_weight) return 'variabel gewicht';
    return '—';
}
function fmtDate(iso: string | null | undefined): string {
    if (!iso) return '—';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit', year: '2-digit' });
}
function histPerUnit(h: PriceHistoryRow): string {
    if (h.price_per_kg_ex_vat != null) return `€${h.price_per_kg_ex_vat.toFixed(2).replace('.', ',')}/kg`;
    if (h.price_per_liter_ex_vat != null) return `€${h.price_per_liter_ex_vat.toFixed(2).replace('.', ',')}/l`;
    if (h.price_per_piece_ex_vat != null) return `€${h.price_per_piece_ex_vat.toFixed(2).replace('.', ',')}/st`;
    return '—';
}

export default function LeverancierProductenPage() {
    const params = useParams<{ id: string }>();
    const levId = Number(params?.id);
    const showToast = useToast();
    const first = useRef(true);
    const [lev, setLev] = useState<{ id: number; naam: string } | null>(null);
    const [products, setProducts] = useState<ProductRow[]>([]);
    const [count, setCount] = useState(0);
    const [shown, setShown] = useState(0);
    const [loading, setLoading] = useState(true);
    const [searching, setSearching] = useState(false);
    // Begin-zoekterm uit de URL (?q=…) — client-side, zodat de "Zoek op …"-knop
    // vanaf de bestellijst meteen de juiste zoekopdracht opent. (Geen useSearchParams
    // → geen Suspense-vereiste die de build breekt.)
    const [q, setQ] = useState(() => {
        if (typeof window === 'undefined') return '';
        try { return new URLSearchParams(window.location.search).get('q') || ''; } catch { return ''; }
    });
    const [sel, setSel] = useState<ProductRow | null>(null);
    const [detail, setDetail] = useState<{ product: Record<string, unknown>; history: PriceHistoryRow[] } | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [makingComponent, setMakingComponent] = useState(false);

    const load = useCallback(async (term?: string) => {
        if (!Number.isInteger(levId)) return;
        if (first.current) setLoading(true); else setSearching(true);
        try {
            const url = `/api/leveranciers/${levId}/products${term ? `?q=${encodeURIComponent(term)}` : ''}`;
            const r = await fetch(url);
            const d = await r.json();
            if (!r.ok) throw new Error(d?.error || 'kon producten niet laden');
            setLev(d.leverancier || null);
            setProducts((d.products || []) as ProductRow[]);
            setCount(d.count ?? 0);
            setShown(d.shown ?? (d.products || []).length);
        } catch (e) {
            showToast((e as Error).message, 'error');
        } finally {
            setLoading(false);
            setSearching(false);
            first.current = false;
        }
    }, [levId, showToast]);

    // Eerste load + debounced server-zoeken (doorzoekt álle producten).
    useEffect(() => {
        const t = setTimeout(() => load(q.trim() || undefined), q ? 300 : 0);
        return () => clearTimeout(t);
    }, [q, load]);

    const makeComponent = useCallback(async (p: ProductRow) => {
        setMakingComponent(true);
        try {
            const r = await fetch(`/api/leveranciers/${levId}/products/${p.id}`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ action: 'make_component' }),
            });
            const d = await r.json();
            if (!r.ok) throw new Error(d?.error || 'kon ingrediënt niet maken');
            showToast(d.existed ? 'Ingrediënt bestond al — te gebruiken in gerechten.' : 'Ingrediënt gemaakt — voeg het toe aan een gerecht; de prijs volgt automatisch.', 'success');
        } catch (e) {
            showToast((e as Error).message, 'error');
        } finally {
            setMakingComponent(false);
        }
    }, [levId, showToast]);

    const openDetail = useCallback(async (p: ProductRow) => {
        setSel(p);
        setDetail(null);
        setDetailLoading(true);
        try {
            const r = await fetch(`/api/leveranciers/${levId}/products/${p.id}`);
            const d = await r.json();
            if (!r.ok) throw new Error(d?.error || 'kon detail niet laden');
            setDetail({ product: d.product, history: (d.history || []) as PriceHistoryRow[] });
        } catch (e) {
            showToast((e as Error).message, 'error');
        } finally {
            setDetailLoading(false);
        }
    }, [levId, showToast]);

    const closeDrawer = () => { setSel(null); setDetail(null); };
    const moreThanShown = count > shown && !q;

    return (
        <div style={{ maxWidth: 1160, margin: '0 auto', padding: '24px var(--space-mobile-edge, 16px) 48px', color: 'var(--text)' }}>
            <Link href="/leveranciers" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--muted)', textDecoration: 'none', marginBottom: 16 }}>
                <ArrowLeft size={15} /> Leveranciers
            </Link>

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 42, height: 42, borderRadius: 11, display: 'grid', placeItems: 'center', background: 'var(--brand-tint, rgba(255,191,0,.14))', border: '1px solid var(--brand-tint-border, rgba(255,191,0,.3))', flexShrink: 0 }}>
                        <Package size={20} style={{ color: BRAND }} />
                    </div>
                    <div>
                        <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', margin: 0, letterSpacing: '-.01em' }}>{lev?.naam || 'Leverancier'}</h1>
                        <p style={{ fontSize: 13, color: 'var(--muted)', margin: '3px 0 0' }}>
                            {loading ? 'laden…' : `${count.toLocaleString('nl-NL')} product${count === 1 ? '' : 'en'} · prijzen excl. BTW`}
                        </p>
                    </div>
                </div>
                <button onClick={() => load(q.trim() || undefined)} disabled={searching}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 600, padding: '9px 14px', borderRadius: 10, background: 'transparent', color: 'var(--text)', border: '1px solid var(--border)', cursor: 'pointer' }}>
                    <RefreshCw size={14} className={searching ? 'animate-spin' : ''} /> Ververs
                </button>
            </div>

            {/* Zoekbalk */}
            <div style={{ position: 'relative', marginBottom: moreThanShown ? 8 : 18 }}>
                {searching
                    ? <Loader2 size={16} className="animate-spin" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: BRAND }} />
                    : <Search size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />}
                <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Zoek op naam, artikelnummer of EAN…"
                    style={{ width: '100%', padding: '12px 14px 12px 40px', borderRadius: 12, background: 'var(--card-solid, #1e1e22)', color: 'var(--text)', border: '1px solid var(--border)', fontSize: 14, outline: 'none' }}
                    onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--brand-tint-border, rgba(255,191,0,.4))'; }}
                    onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; }}
                />
            </div>
            {moreThanShown && (
                <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 16px', paddingLeft: 2 }}>
                    Toont de eerste {shown.toLocaleString('nl-NL')} — typ om alle {count.toLocaleString('nl-NL')} producten te doorzoeken.
                </p>
            )}

            {/* Lijst */}
            {loading ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--muted)', padding: '56px 0', justifyContent: 'center' }}>
                    <Loader2 size={18} className="animate-spin" /> Producten laden…
                </div>
            ) : products.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--muted)', padding: '56px 16px', border: '1px dashed var(--border)', borderRadius: 14 }}>
                    {q ? `Geen producten gevonden voor “${q}”.` : 'Nog geen gesynchroniseerde producten voor deze leverancier.'}
                </div>
            ) : (
                <div style={{ border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden', background: 'var(--card, rgba(30,30,34,.7))' }}>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
                            <thead>
                                <tr style={{ textAlign: 'left', color: 'var(--muted)', background: 'var(--bg-elevated, #151518)' }}>
                                    <th style={thStyle}>Product</th>
                                    <th style={thStyle}>Artikelnr.</th>
                                    <th style={thStyle}>Verpakking</th>
                                    <th style={{ ...thStyle, textAlign: 'right' }}>Prijs</th>
                                    <th style={{ ...thStyle, textAlign: 'right' }}>Per eenheid</th>
                                </tr>
                            </thead>
                            <tbody>
                                {products.map((p) => (
                                    <tr key={p.id} onClick={() => openDetail(p)}
                                        style={{ borderTop: '1px solid var(--border)', cursor: 'pointer', transition: 'background .12s' }}
                                        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--brand-tint-subtle, rgba(255,191,0,.06))'; }}
                                        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
                                        <td style={{ ...tdStyle, color: 'var(--text)', fontWeight: 500 }}>
                                            {p.name}
                                            {p.variable_weight && (
                                                <span style={badgeStyle}><Scale size={10} /> variabel</span>
                                            )}
                                        </td>
                                        <td style={{ ...tdStyle, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>{p.supplier_sku || '—'}</td>
                                        <td style={{ ...tdStyle, color: 'var(--muted-light, #b4b4b4)' }}>{verpakking(p)}</td>
                                        <td style={{ ...tdStyle, textAlign: 'right', color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{euro(p.effective_price_ex_vat)}</td>
                                        <td style={{ ...tdStyle, textAlign: 'right', color: BRAND, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{perUnitLabel(p)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Detail-drawer (rechts) */}
            {sel && (
                <>
                    <div onClick={closeDrawer} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 40 }} />
                    <div style={{ position: 'fixed', top: 0, right: 0, height: '100%', width: '100%', maxWidth: 440, background: 'var(--surface, #1e1e22)', borderLeft: '1px solid var(--border)', boxShadow: '-8px 0 40px rgba(0,0,0,.4)', zIndex: 50, overflowY: 'auto', color: 'var(--text)' }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, padding: 18, borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, background: 'var(--surface, #1e1e22)', zIndex: 1 }}>
                            <div>
                                <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', margin: 0, lineHeight: 1.3 }}>{sel.name}</h2>
                                {sel.supplier_sku && <p style={{ fontSize: 12, color: 'var(--muted)', margin: '4px 0 0' }}>Art. {sel.supplier_sku}</p>}
                            </div>
                            <button onClick={closeDrawer} style={{ color: 'var(--muted)', background: 'transparent', border: 'none', cursor: 'pointer', padding: 4 }}><X size={18} /></button>
                        </div>

                        <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 18 }}>
                            {/* Prijs-hero */}
                            <div style={{ borderRadius: 14, padding: '16px 18px', background: 'var(--brand-tint-subtle, rgba(255,191,0,.06))', border: '1px solid var(--brand-tint-border, rgba(255,191,0,.25))' }}>
                                <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>Prijs per eenheid</div>
                                <div style={{ fontSize: 26, fontWeight: 800, color: BRAND, letterSpacing: '-.01em' }}>{perUnitLabel(sel)}</div>
                                <div style={{ fontSize: 13, color: 'var(--muted-light, #b4b4b4)', marginTop: 4 }}>
                                    {euro(sel.effective_price_ex_vat)} · {verpakking(sel)}
                                </div>
                            </div>

                            <dl style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '10px 12px', fontSize: 13, margin: 0 }}>
                                <dt style={{ color: 'var(--muted)' }}>EAN</dt><dd style={{ textAlign: 'right', margin: 0, fontVariantNumeric: 'tabular-nums' }}>{sel.ean || '—'}</dd>
                                <dt style={{ color: 'var(--muted)' }}>Bron</dt><dd style={{ textAlign: 'right', margin: 0 }}>{sel.source || '—'}</dd>
                                <dt style={{ color: 'var(--muted)' }}>Laatst gezien</dt><dd style={{ textAlign: 'right', margin: 0, color: 'var(--muted-light, #b4b4b4)' }}>{fmtDate(sel.last_seen_at)}</dd>
                            </dl>

                            <button onClick={() => makeComponent(sel)} disabled={makingComponent}
                                title="Maak er een ingrediënt van dat je in gerechten kunt gebruiken; de kostprijs volgt automatisch deze leveranciersprijs."
                                style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 14, fontWeight: 700, padding: '12px 16px', borderRadius: 11, width: '100%', color: '#151518', background: BRAND, border: 'none', cursor: makingComponent ? 'default' : 'pointer', opacity: makingComponent ? .6 : 1 }}>
                                {makingComponent ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
                                Maak ingrediënt
                            </button>

                            {detail && typeof detail.product?.product_url === 'string' && (
                                <a href={detail.product.product_url as string} target="_blank" rel="noreferrer"
                                    style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, fontSize: 13, fontWeight: 600, padding: '10px 14px', borderRadius: 11, border: '1px solid var(--border)', color: 'var(--text)', textDecoration: 'none', width: '100%' }}>
                                    Open bij leverancier <ExternalLink size={14} />
                                </a>
                            )}

                            <div>
                                <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6, margin: '0 0 10px' }}>
                                    <History size={14} style={{ color: 'var(--muted)' }} /> Prijshistorie
                                </h3>
                                {detailLoading ? (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--muted)', padding: '16px 0', justifyContent: 'center' }}><Loader2 size={15} className="animate-spin" /> Laden…</div>
                                ) : detail && detail.history.length > 0 ? (
                                    <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                                        <thead>
                                            <tr style={{ textAlign: 'left', color: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>
                                                <th style={{ padding: '5px 0', fontWeight: 600 }}>Datum</th>
                                                <th style={{ padding: '5px 0', fontWeight: 600, textAlign: 'right' }}>Prijs</th>
                                                <th style={{ padding: '5px 0', fontWeight: 600, textAlign: 'right' }}>Per eenheid</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {detail.history.map((h) => (
                                                <tr key={h.id} style={{ borderBottom: '1px solid var(--border)' }}>
                                                    <td style={{ padding: '6px 0', color: 'var(--muted-light, #b4b4b4)' }}>
                                                        {fmtDate(h.captured_at || h.created_at)}
                                                        {h.is_current && <span style={{ marginLeft: 6, color: BRAND, fontWeight: 600 }}>• huidig</span>}
                                                    </td>
                                                    <td style={{ padding: '6px 0', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{euro(h.effective_price_ex_vat)}</td>
                                                    <td style={{ padding: '6px 0', textAlign: 'right', color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>{histPerUnit(h)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                ) : (
                                    <p style={{ fontSize: 12, color: 'var(--muted)' }}>Nog geen prijshistorie — verschijnt zodra je een volgende keer synchroniseert.</p>
                                )}
                            </div>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}

const thStyle: React.CSSProperties = { padding: '11px 14px', fontWeight: 600, fontSize: 11, letterSpacing: '.04em', textTransform: 'uppercase' };
const tdStyle: React.CSSProperties = { padding: '11px 14px', verticalAlign: 'middle' };
const badgeStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 3, marginLeft: 8, fontSize: 10, padding: '2px 6px', borderRadius: 5, background: 'rgba(130,130,130,.14)', color: 'var(--muted)', fontWeight: 600, verticalAlign: 'middle' };
