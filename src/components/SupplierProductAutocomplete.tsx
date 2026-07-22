'use client';
/**
 * SupplierProductAutocomplete — kies een leverancier-product uit je prijslijsten.
 *
 * Tik 2+ letters → debounced zoekopdracht op /api/catalog/search → popup met
 * elke leverancier-versie van dat product (Beef Club 29 / Bitfood / Hanos…),
 * elk met eigen prijs. Klik of Enter kiest er één; die keuze koppelt het
 * ingrediënt aan dat leverancier-product en vult de prijs.
 *
 * De naam blijft de zichtbare "key" (compat met de bestaande ingredients-JSONB);
 * de harde koppeling (master_product_id + supplier_price_id) gaat mee via onPick.
 * Vind je 'm niet in de catalogus? Blijf typen — het veld werkt gewoon als een
 * vrij tekstveld (onChange), zodat niets breekt voor producten zonder prijslijst.
 */

import React, {
    KeyboardEvent,
    useCallback,
    useEffect,
    useId,
    useRef,
    useState,
} from 'react';
import { createPortal } from 'react-dom';
import { Search, ShoppingBag, Loader2 } from 'lucide-react';
import type { CatalogSearchHit } from '@/app/api/catalog/search/route';

export type { CatalogSearchHit };

interface Props {
    value: string;
    onChange: (naam: string) => void;         // vrij typen (naam-key)
    onPick: (hit: CatalogSearchHit) => void;  // koos een leverancier-product
    placeholder?: string;
    minChars?: number;                         // default 2
    autoFocus?: boolean;
    className?: string;
    style?: React.CSSProperties;
}

const GOLD = '#c4a35a';

function priceLabel(h: CatalogSearchHit): string {
    if (h.prijs_per_kg && h.prijs_per_kg > 0) return `€${h.prijs_per_kg.toFixed(2)} / kg`;
    if (h.prijs_per_stuk && h.prijs_per_stuk > 0) return `€${h.prijs_per_stuk.toFixed(2)} / stuk`;
    if (h.prijs > 0) return `€${h.prijs.toFixed(2)}${h.eenheid ? ' / ' + h.eenheid : ''}`;
    return 'geen prijs';
}

function optionKey(h: CatalogSearchHit): string {
    return `${h.master_product_id}-${h.supplier_price_id}`;
}

export default function SupplierProductAutocomplete({
    value,
    onChange,
    onPick,
    placeholder = 'Tik 2+ letters — zoek in je leverancier-prijzen…',
    minChars = 2,
    autoFocus,
    className,
    style,
}: Props) {
    const [open, setOpen] = useState(false);
    const [active, setActive] = useState(0);
    const [hits, setHits] = useState<CatalogSearchHit[]>([]);
    const [loading, setLoading] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const reqSeq = useRef(0);
    const listboxId = useId();
    const [mounted, setMounted] = useState(false);
    const [pos, setPos] = useState<{ top: number; left: number; width: number; openUp: boolean } | null>(null);
    useEffect(() => { setMounted(true); }, []);

    /* Debounced fetch — alleen terwijl de popup open is. Zo vuurt een bestaande
       (voorgevulde) regel bij het openen van de drawer geen zoekopdracht + spinner
       af; pas als de gebruiker het veld gebruikt, gaan we zoeken. */
    useEffect(() => {
        const q = value.trim();
        if (!open || q.length < minChars) { setLoading(false); return; }
        setLoading(true);
        const seq = ++reqSeq.current;
        const t = setTimeout(async () => {
            try {
                const res = await fetch(`/api/catalog/search?q=${encodeURIComponent(q)}`, { credentials: 'include' });
                const body = await res.json().catch(() => ({}));
                if (seq !== reqSeq.current) return;
                setHits(Array.isArray(body.results) ? body.results : []);
                setActive(0);
            } catch {
                if (seq === reqSeq.current) setHits([]);
            } finally {
                if (seq === reqSeq.current) setLoading(false);
            }
        }, 220);
        return () => clearTimeout(t);
    }, [value, minChars, open]);

    /* Sluiten bij klik buiten. */
    useEffect(() => {
        function onDoc(e: MouseEvent) {
            if (!listRef.current || !inputRef.current) return;
            if (!listRef.current.contains(e.target as Node) && !inputRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        }
        document.addEventListener('mousedown', onDoc);
        return () => document.removeEventListener('mousedown', onDoc);
    }, []);

    const pick = useCallback((h: CatalogSearchHit) => {
        onPick(h);
        setOpen(false);
        inputRef.current?.blur();
    }, [onPick]);

    function onKey(e: KeyboardEvent<HTMLInputElement>) {
        if (!open && e.key === 'ArrowDown') { setOpen(true); e.preventDefault(); return; }
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive(a => Math.min(hits.length - 1, a + 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive(a => Math.max(0, a - 1));
        } else if (e.key === 'Enter') {
            if (open && hits.length > 0) { e.preventDefault(); pick(hits[active]); }
        } else if (e.key === 'Escape') {
            setOpen(false);
        }
    }

    const q = value.trim();
    const showList = open && q.length >= minChars;
    const showEmpty = showList && !loading && hits.length === 0;

    /* Positie berekenen voor de geportalde dropdown. Nodig omdat de drawer-body
       (.kf-body) overflow:auto is en een absolute popup zou afkappen; met een
       fixed portal op document.body zweeft de lijst er overheen. */
    useEffect(() => {
        if (!showList) return;
        function place() {
            const el = inputRef.current;
            if (!el) return;
            const r = el.getBoundingClientRect();
            const width = Math.min(440, Math.max(r.width, 300), window.innerWidth * 0.92);
            const spaceBelow = window.innerHeight - r.bottom;
            const openUp = spaceBelow < 320 && r.top > spaceBelow;
            setPos({
                top: openUp ? r.top - 4 : r.bottom + 4,
                left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)),
                width,
                openUp,
            });
        }
        place();
        window.addEventListener('scroll', place, true);
        window.addEventListener('resize', place);
        return () => {
            window.removeEventListener('scroll', place, true);
            window.removeEventListener('resize', place);
        };
    }, [showList]);

    /* Actieve optie in beeld scrollen bij pijltjes-navigatie. */
    useEffect(() => {
        if (!showList || hits.length === 0) return;
        document.getElementById(`${listboxId}-opt-${active}`)?.scrollIntoView({ block: 'nearest' });
    }, [active, showList, hits.length, listboxId]);

    return (
        <div style={{ position: 'relative', ...style }} className={className}>
            <div style={{ position: 'relative' }}>
                <Search
                    size={13}
                    style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted-light, var(--muted))', pointerEvents: 'none' }}
                />
                <input
                    ref={inputRef}
                    type="text"
                    value={value}
                    autoFocus={autoFocus}
                    onChange={e => { onChange(e.target.value); setOpen(true); }}
                    onFocus={() => { if (value.trim().length >= minChars) setOpen(true); }}
                    onKeyDown={onKey}
                    placeholder={placeholder}
                    role="combobox"
                    aria-autocomplete="list"
                    aria-expanded={showList}
                    aria-controls={listboxId}
                    aria-activedescendant={showList && hits.length > 0 ? `${listboxId}-opt-${active}` : undefined}
                    className="kf-input"
                    style={{ paddingLeft: 26 }}
                />
                {loading && (
                    <Loader2
                        size={13}
                        className="animate-spin"
                        style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }}
                    />
                )}
            </div>

            {mounted && showList && pos && createPortal(
                <div
                    ref={listRef}
                    id={listboxId}
                    role="listbox"
                    aria-label="Leverancier-producten"
                    style={{
                        position: 'fixed', top: pos.top, left: pos.left, width: pos.width,
                        transform: pos.openUp ? 'translateY(-100%)' : undefined,
                        background: 'var(--card, #1b2130)', border: '1px solid var(--border, #2b3444)',
                        color: 'var(--text, #e5e7eb)',
                        borderRadius: 10, padding: 4, zIndex: 3000,
                        boxShadow: '0 10px 36px rgba(0,0,0,.36)',
                        maxHeight: 340, overflowY: 'auto',
                    }}
                >
                    {showEmpty ? (
                        <div style={{ padding: '12px 14px', color: 'var(--muted)', fontSize: 12, lineHeight: 1.5 }}>
                            Geen leverancier-prijs gevonden voor &ldquo;{q}&rdquo;.<br />
                            Importeer een prijslijst bij <strong>Leveranciers</strong>, of tik gewoon door om het als los ingrediënt te noteren.
                        </div>
                    ) : (
                        hits.map((h, idx) => {
                            const isActive = idx === active;
                            return (
                                <div
                                    key={optionKey(h)}
                                    id={`${listboxId}-opt-${idx}`}
                                    role="option"
                                    aria-selected={isActive}
                                    onMouseEnter={() => setActive(idx)}
                                    onMouseDown={e => { e.preventDefault(); pick(h); }}
                                    style={{
                                        padding: '8px 10px', borderRadius: 7, cursor: 'pointer',
                                        background: isActive ? `${GOLD}15` : 'transparent',
                                        border: isActive ? `1px solid ${GOLD}55` : '1px solid transparent',
                                        display: 'flex', alignItems: 'center', gap: 10,
                                    }}
                                >
                                    <ShoppingBag size={14} style={{ color: isActive ? GOLD : 'var(--muted)', flexShrink: 0 }} aria-hidden="true" />
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {h.naam}
                                        </div>
                                        <div style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                                            <span style={{ color: 'var(--text)', fontWeight: 600, opacity: 0.9 }}>{h.leverancier || 'onbekende leverancier'}</span>
                                            {h.categorie && <span style={{ opacity: 0.7 }}>· {h.categorie}</span>}
                                        </div>
                                    </div>
                                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', textAlign: 'right', flexShrink: 0 }}>
                                        {priceLabel(h)}
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>,
                document.body,
            )}
        </div>
    );
}
