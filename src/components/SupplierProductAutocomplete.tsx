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
import { formatEur } from '@/lib/format';
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
    /* Ook de gescande bestel-catalogus (supplier_products, Catalog B) doorzoeken —
       bv. voor het koppelen van een inkoop-component aan een Bidfood-product. */
    includeSupplierProducts?: boolean;
}

const GOLD = '#c4a35a';

/* Geld altijd via de canon in lib/format.ts — anders staat er "€7.50" met een punt
   tussen alle andere bedragen die netjes "€ 7,50" schrijven. */
function priceLabel(h: CatalogSearchHit): string {
    if (h.prijs_per_kg && h.prijs_per_kg > 0) return `${formatEur(h.prijs_per_kg)} / kg`;
    if (h.prijs_per_stuk && h.prijs_per_stuk > 0) return `${formatEur(h.prijs_per_stuk)} / stuk`;
    if (h.prijs > 0) return `${formatEur(h.prijs)}${h.eenheid ? ' / ' + h.eenheid : ''}`;
    return 'geen prijs';
}

function optionKey(h: CatalogSearchHit): string {
    return h.source === 'supplier_product'
        ? `sp-${h.supplier_product_id}`
        : `mp-${h.master_product_id}-${h.supplier_price_id}`;
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
    includeSupplierProducts,
}: Props) {
    const [open, setOpen] = useState(false);
    const [active, setActive] = useState(0);
    const [hits, setHits] = useState<CatalogSearchHit[]>([]);
    /* Aantal treffers dat NIET getoond wordt. Een lijst die vol lijkt maar er 796
       verzwijgt, leest als "meer is er niet" — en dan zoekt niemand verder. */
    const [meer, setMeer] = useState(0);
    const [loading, setLoading] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const reqSeq = useRef(0);
    const listboxId = useId();
    const [mounted, setMounted] = useState(false);
    const [pos, setPos] = useState<{ top: number; left: number; width: number; openUp: boolean } | null>(null);
    useEffect(() => { setMounted(true); }, []);

    /* Word je met autoFocus én een voorgevulde term geopend (de brug vanuit een
       lege zoekresultaat-lijst), zet de lijst dan meteen open. Anders staat de
       zoekterm er wel, maar gebeurt er pas iets als je zelf in het veld klikt —
       en dat leest als "hij vindt niets". Alleen bij mount, daarna neemt
       onFocus/onChange het over. */
    useEffect(() => {
        if (autoFocus && value.trim().length >= minChars) setOpen(true);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    /* Debounced fetch — alleen terwijl de popup open is. Zo vuurt een bestaande
       (voorgevulde) regel bij het openen van de drawer geen zoekopdracht + spinner
       af; pas als de gebruiker het veld gebruikt, gaan we zoeken. */
    useEffect(() => {
        const q = value.trim();
        /* Ook hier de teller ophogen: anders kan een antwoord dat nog onderweg was
           toen je de zoekterm wiste alsnog binnenkomen en de lijst vullen onder een
           heel andere term — je klikt dan een product aan dat niets met je zoekterm
           te maken heeft, en koppelt stilletjes de verkeerde inkoop. */
        if (!open || q.length < minChars) { reqSeq.current++; setLoading(false); setHits([]); setMeer(0); return; }
        setLoading(true);
        const seq = ++reqSeq.current;
        const t = setTimeout(async () => {
            try {
                const res = await fetch(`/api/catalog/search?q=${encodeURIComponent(q)}${includeSupplierProducts ? '&supplierProducts=1' : ''}`, { credentials: 'include' });
                const body = await res.json().catch(() => ({}));
                if (seq !== reqSeq.current) return;
                setHits(Array.isArray(body.results) ? body.results : []);
                setMeer(Number(body?.totals?.meer) || 0);
                setActive(0);
            } catch {
                if (seq === reqSeq.current) { setHits([]); setMeer(0); }
            } finally {
                if (seq === reqSeq.current) setLoading(false);
            }
        }, 220);
        return () => clearTimeout(t);
    }, [value, minChars, open, includeSupplierProducts]);

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
                        /* Diagnostisch, niet dooddoend. De oude tekst stuurde altijd naar
                           "importeer een prijslijst" — ook als er allang gezocht was in de
                           gescande bestel-catalogus. Wie op een merk zoekt ("bresc") gaat
                           dan een import doen die niets oplost, want merknamen staan niet
                           in de productnaam. Zeg dus wáár we gekeken hebben en wat wél werkt. */
                        <div style={{ padding: '12px 14px', color: 'var(--muted)', fontSize: 12, lineHeight: 1.5 }}>
                            Niets gevonden op &ldquo;{q}&rdquo; — niet in je prijslijsten
                            {includeSupplierProducts ? ' en niet in je gescande bestel-catalogus' : ''}.<br />
                            Zoek op de <strong>productnaam</strong> (bv. &ldquo;tomatensalsa&rdquo;); merknamen staan
                            meestal niet in de catalogusnaam. Of tik gewoon door om het als los ingrediënt te noteren.
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
                    {!showEmpty && meer > 0 && (
                        <div style={{
                            padding: '8px 10px', marginTop: 2, borderTop: '1px solid var(--border, #2b3444)',
                            color: 'var(--muted)', fontSize: 11.5, lineHeight: 1.45,
                        }}>
                            Nog <strong style={{ color: 'var(--text)' }}>{meer.toLocaleString('nl-NL')}</strong> treffers
                            die hier niet passen — tik een woord erbij om te verfijnen.
                        </div>
                    )}
                </div>,
                document.body,
            )}
        </div>
    );
}
