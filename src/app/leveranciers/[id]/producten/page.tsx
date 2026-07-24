'use client';
/**
 * /leveranciers/[id]/producten
 *
 * Overzicht van de gesynchroniseerde/geïmporteerde leveranciersproducten
 * (Catalogus B) met de huidige prijs en de prijs per kg/liter/stuk.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useToast } from '@/components/Toast';
import { ArrowLeft, Search, Package, Loader2, RefreshCw, X, ExternalLink, History } from 'lucide-react';

const BRAND = 'var(--brand, #6B7A3F)';

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
    const [lev, setLev] = useState<{ id: number; naam: string } | null>(null);
    const [products, setProducts] = useState<ProductRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [q, setQ] = useState('');
    const [sel, setSel] = useState<ProductRow | null>(null);
    const [detail, setDetail] = useState<{ product: Record<string, unknown>; history: PriceHistoryRow[] } | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);

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

    const load = useCallback(async () => {
        if (!Number.isInteger(levId)) return;
        setLoading(true);
        try {
            const r = await fetch(`/api/leveranciers/${levId}/products`);
            const d = await r.json();
            if (!r.ok) throw new Error(d?.error || 'kon producten niet laden');
            setLev(d.leverancier || null);
            setProducts((d.products || []) as ProductRow[]);
        } catch (e) {
            showToast((e as Error).message, 'error');
        } finally {
            setLoading(false);
        }
    }, [levId, showToast]);

    useEffect(() => { load(); }, [load]);

    const filtered = useMemo(() => {
        const term = q.trim().toLowerCase();
        if (!term) return products;
        return products.filter((p) =>
            p.name.toLowerCase().includes(term) ||
            (p.supplier_sku || '').toLowerCase().includes(term) ||
            (p.ean || '').toLowerCase().includes(term));
    }, [products, q]);

    return (
        <div className="max-w-5xl mx-auto px-4 py-6">
            <Link href="/leveranciers" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-4">
                <ArrowLeft size={16} /> Leveranciers
            </Link>

            <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <Package size={22} style={{ color: BRAND }} />
                        {lev?.naam || 'Leverancier'}
                    </h1>
                    <p className="text-sm text-gray-500 mt-0.5">
                        {loading ? 'laden…' : `${products.length} product${products.length === 1 ? '' : 'en'} · prijzen excl. BTW`}
                    </p>
                </div>
                <button onClick={load} className="inline-flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50">
                    <RefreshCw size={14} /> Ververs
                </button>
            </div>

            <div className="relative mb-3">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Zoek op naam, artikelnummer of EAN…"
                    className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2"
                    style={{ ['--tw-ring-color' as string]: BRAND }}
                />
            </div>

            {loading ? (
                <div className="flex items-center gap-2 text-gray-500 py-12 justify-center">
                    <Loader2 size={18} className="animate-spin" /> Producten laden…
                </div>
            ) : filtered.length === 0 ? (
                <div className="text-center text-gray-500 py-12 border border-dashed border-gray-200 rounded-xl">
                    {products.length === 0 ? 'Nog geen gesynchroniseerde producten voor deze leverancier.' : 'Geen producten gevonden voor deze zoekterm.'}
                </div>
            ) : (
                <div className="overflow-x-auto border border-gray-200 rounded-xl">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-left text-gray-500 border-b border-gray-200 bg-gray-50">
                                <th className="px-3 py-2 font-medium">Product</th>
                                <th className="px-3 py-2 font-medium">Artikelnr.</th>
                                <th className="px-3 py-2 font-medium">Verpakking</th>
                                <th className="px-3 py-2 font-medium text-right">Prijs</th>
                                <th className="px-3 py-2 font-medium text-right">Per eenheid</th>
                                <th className="px-3 py-2 font-medium">Bron</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map((p) => (
                                <tr key={p.id} onClick={() => openDetail(p)} className="border-b border-gray-100 hover:bg-gray-50/60 cursor-pointer">
                                    <td className="px-3 py-2 text-gray-900">{p.name}</td>
                                    <td className="px-3 py-2 text-gray-500 tabular-nums">{p.supplier_sku || '—'}</td>
                                    <td className="px-3 py-2 text-gray-600">{verpakking(p)}</td>
                                    <td className="px-3 py-2 text-right tabular-nums text-gray-900">{euro(p.effective_price_ex_vat)}</td>
                                    <td className="px-3 py-2 text-right tabular-nums font-medium" style={{ color: BRAND }}>{perUnitLabel(p)}</td>
                                    <td className="px-3 py-2 text-gray-400 text-xs">{p.source || '—'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {sel && (
                <>
                    <div onClick={() => { setSel(null); setDetail(null); }} className="fixed inset-0 bg-black/30 z-40" />
                    <div className="fixed top-0 right-0 h-full w-full max-w-md bg-white shadow-xl z-50 overflow-y-auto">
                        <div className="flex items-start justify-between gap-3 p-4 border-b border-gray-200 sticky top-0 bg-white">
                            <div>
                                <h2 className="font-semibold text-gray-900 leading-tight">{sel.name}</h2>
                                <p className="text-xs text-gray-500 mt-0.5">{sel.supplier_sku ? `Art. ${sel.supplier_sku}` : ''}</p>
                            </div>
                            <button onClick={() => { setSel(null); setDetail(null); }} className="text-gray-400 hover:text-gray-700 p-1"><X size={18} /></button>
                        </div>
                        <div className="p-4 space-y-4">
                            {detailLoading ? (
                                <div className="flex items-center gap-2 text-gray-500 py-8 justify-center"><Loader2 size={16} className="animate-spin" /> Laden…</div>
                            ) : (
                                <>
                                    <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                                        <dt className="text-gray-500">Prijs (excl. BTW)</dt><dd className="text-right font-medium tabular-nums">{euro(sel.effective_price_ex_vat)}</dd>
                                        <dt className="text-gray-500">Per eenheid</dt><dd className="text-right font-medium tabular-nums" style={{ color: BRAND }}>{perUnitLabel(sel)}</dd>
                                        <dt className="text-gray-500">Verpakking</dt><dd className="text-right">{verpakking(sel)}</dd>
                                        <dt className="text-gray-500">EAN</dt><dd className="text-right tabular-nums">{sel.ean || '—'}</dd>
                                        <dt className="text-gray-500">Bron</dt><dd className="text-right">{sel.source || '—'}</dd>
                                        <dt className="text-gray-500">Laatst gezien</dt><dd className="text-right text-xs text-gray-500">{fmtDate(sel.last_seen_at)}</dd>
                                    </dl>
                                    {detail && typeof detail.product?.product_url === 'string' && (
                                        <a href={detail.product.product_url as string} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-1.5 text-sm px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 w-full">
                                            Open bij leverancier <ExternalLink size={14} />
                                        </a>
                                    )}
                                    <div>
                                        <h3 className="text-sm font-medium text-gray-700 flex items-center gap-1.5 mb-2"><History size={14} /> Prijshistorie</h3>
                                        {detail && detail.history.length > 0 ? (
                                            <table className="w-full text-xs">
                                                <thead>
                                                    <tr className="text-left text-gray-400 border-b border-gray-200">
                                                        <th className="py-1 font-medium">Datum</th>
                                                        <th className="py-1 font-medium text-right">Prijs</th>
                                                        <th className="py-1 font-medium text-right">Per eenheid</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {detail.history.map((h) => (
                                                        <tr key={h.id} className="border-b border-gray-100">
                                                            <td className="py-1 text-gray-600">
                                                                {fmtDate(h.captured_at || h.created_at)}
                                                                {h.is_current && <span className="ml-1" style={{ color: BRAND }}>• huidig</span>}
                                                            </td>
                                                            <td className="py-1 text-right tabular-nums">{euro(h.effective_price_ex_vat)}</td>
                                                            <td className="py-1 text-right tabular-nums text-gray-500">{histPerUnit(h)}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        ) : (
                                            <p className="text-xs text-gray-400">Nog geen prijshistorie.</p>
                                        )}
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
