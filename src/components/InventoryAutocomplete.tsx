'use client';
/**
 * InventoryAutocomplete — rijke ingrediënt-zoeker.
 *
 * Gebruik: in elke editor waar je een product uit voorraad wilt selecteren.
 * Tik 3+ letters → popup met de top 8 matches uit `inventory`, elk met
 * naam, huidige voorraad, prijs en leverancier. Klik of Enter selecteert.
 *
 * Pillar: ingrediënt-naam blijft de "key" (compat met bestaande
 * ingredient_costs JSONB), maar de `inventory_id` kan optioneel mee in een
 * tweede onChange-arg voor toekomstige harde koppeling.
 */

import React, {
  KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Package, Search, AlertTriangle, Plus, CheckCircle2, XCircle } from 'lucide-react';

export interface InventoryRow {
  id: number;
  naam: string;
  unit?: string;
  current_stock?: number;
  min_stock?: number;
  purchase_price?: number;
  last_price_eur?: number | null;
  supplier?: string | null;
  categorie?: string;
}

interface Props {
  inventory: InventoryRow[];
  value: string;
  onChange: (naam: string, item?: InventoryRow) => void;
  onCommit?: () => void;          // bv. Enter na keuze → voeg toe
  placeholder?: string;
  minChars?: number;               // default 3
  maxResults?: number;             // default 8
  autoFocus?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

const GOLD = '#c4a35a';

function normalize(s: string): string {
  return (s || '').toLowerCase().trim();
}

function score(query: string, item: InventoryRow): number {
  const q = normalize(query);
  const n = normalize(item.naam);
  if (!q || !n) return 0;
  if (n === q) return 1000;
  if (n.startsWith(q)) return 500 + (100 - Math.min(100, n.length));
  if (n.includes(q)) return 200 + (100 - Math.min(100, n.length));
  // ruwe substring-aanwezigheid van elk woord
  const words = q.split(/\s+/).filter(Boolean);
  let s = 0;
  for (const w of words) if (n.includes(w)) s += 20;
  return s;
}

function pickPrice(item: InventoryRow): { price: number; fresh: boolean } {
  const last = Number(item.last_price_eur);
  if (last > 0) return { price: last, fresh: true };
  const purch = Number(item.purchase_price);
  if (purch > 0) return { price: purch, fresh: false };
  return { price: 0, fresh: false };
}

function stockStatus(item: InventoryRow): { color: string; label: string; Icon: typeof CheckCircle2 } {
  const stock = Number(item.current_stock) || 0;
  const min = Number(item.min_stock) || 0;
  if (stock <= 0) return { color: '#ef4444', label: 'op', Icon: XCircle };
  if (min > 0 && stock <= min) return { color: '#f59e0b', label: 'laag', Icon: AlertTriangle };
  return { color: '#22c55e', label: 'voldoende', Icon: CheckCircle2 };
}

const LISTBOX_ID = 'inventory-autocomplete-listbox';
function optionId(itemId: number): string {
  return `inventory-option-${itemId}`;
}

export default function InventoryAutocomplete({
  inventory,
  value,
  onChange,
  onCommit,
  placeholder = 'Tik 3+ letters…',
  minChars = 3,
  maxResults = 8,
  autoFocus,
  className,
  style,
}: Props) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const matches = useMemo(() => {
    const q = normalize(value);
    if (q.length < minChars) return [];
    const scored = inventory
      .map(it => ({ item: it, s: score(value, it) }))
      .filter(x => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, maxResults)
      .map(x => x.item);
    return scored;
  }, [inventory, value, minChars, maxResults]);

  useEffect(() => {
    if (matches.length === 0) setActive(0);
    else if (active >= matches.length) setActive(matches.length - 1);
  }, [matches, active]);

  // Close on outside click
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!listRef.current || !inputRef.current) return;
      if (
        !listRef.current.contains(e.target as Node) &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const pick = useCallback((item: InventoryRow) => {
    onChange(item.naam, item);
    setOpen(false);
    inputRef.current?.focus();
  }, [onChange]);

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      setOpen(true);
      e.preventDefault();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive(a => Math.min(matches.length - 1, a + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive(a => Math.max(0, a - 1));
    } else if (e.key === 'Enter') {
      if (open && matches.length > 0) {
        e.preventDefault();
        pick(matches[active]);
      } else if (value.trim()) {
        // Free-tekst commit (bestaand product niet gevonden — laat de pagina afhandelen)
        e.preventDefault();
        onCommit?.();
        setOpen(false);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  const showPopup = open && matches.length > 0;
  const showEmpty = open && value.trim().length >= minChars && matches.length === 0;

  return (
    <div style={{ position: 'relative', ...style }} className={className}>
      <div style={{ position: 'relative' }}>
        <Search
          size={14}
          style={{
            position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
            color: 'var(--muted-light)', pointerEvents: 'none',
          }}
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
          aria-expanded={open && (matches.length > 0 || value.trim().length >= minChars)}
          aria-controls={LISTBOX_ID}
          aria-activedescendant={
            open && matches.length > 0 ? optionId(matches[active]?.id ?? 0) : undefined
          }
          className="inv-ac-input"
          style={{
            width: '100%', padding: '7px 10px 7px 30px', fontSize: 12,
            background: 'var(--bg)', color: 'var(--text)',
            border: '1px solid var(--border)', borderRadius: 8,
            outline: 'none',
          }}
        />
        <style jsx>{`
          .inv-ac-input:focus-visible {
            outline: 2px solid #c4a35a;
            outline-offset: 1px;
            border-color: #c4a35a;
          }
        `}</style>
      </div>

      {(showPopup || showEmpty) && (
        <div
          ref={listRef}
          id={LISTBOX_ID}
          role="listbox"
          aria-label="Voorraad-zoekresultaten"
          style={{
            position: 'absolute', top: 'calc(100% + 4px)', left: 0,
            width: 420, maxWidth: '92vw',
            background: 'var(--card)', border: '1px solid var(--border)',
            borderRadius: 10, padding: 4, zIndex: 100,
            boxShadow: '0 10px 36px rgba(0,0,0,.36)',
            maxHeight: 340, overflowY: 'auto',
          }}
        >
          {showEmpty ? (
            <div style={{ padding: '12px 14px', color: 'var(--muted)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertTriangle size={14} style={{ color: '#f59e0b' }} />
              <div>
                Niet in voorraad. Tik <kbd style={{ padding: '0 4px', borderRadius: 3, background: 'rgba(255,255,255,.08)' }}>Enter</kbd> om als nieuw ingrediënt toe te voegen.
              </div>
            </div>
          ) : (
            matches.map((it, idx) => {
              const isActive = idx === active;
              const { price, fresh } = pickPrice(it);
              const stock = stockStatus(it);
              const stockTxt = Number.isFinite(it.current_stock)
                ? `${(it.current_stock as number).toLocaleString('nl-NL', { maximumFractionDigits: 2 })} ${it.unit || ''}`
                : '— voorraad';
              const StockIcon = stock.Icon;
              return (
                <div
                  key={it.id}
                  id={optionId(it.id)}
                  role="option"
                  aria-selected={isActive}
                  onMouseEnter={() => setActive(idx)}
                  onMouseDown={e => { e.preventDefault(); pick(it); }}
                  style={{
                    padding: '8px 10px', borderRadius: 7, cursor: 'pointer',
                    background: isActive ? `${GOLD}15` : 'transparent',
                    border: isActive ? `1px solid ${GOLD}55` : '1px solid transparent',
                    display: 'flex', alignItems: 'center', gap: 10,
                  }}
                >
                  <Package size={14} style={{ color: isActive ? GOLD : 'var(--muted)' }} aria-hidden="true" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {it.naam}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span style={{ color: stock.color, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                        <StockIcon size={11} aria-hidden="true" />
                        <span aria-label={`voorraad ${stock.label}`}>{stockTxt}</span>
                      </span>
                      {it.supplier && <span style={{ opacity: 0.85 }}>· {it.supplier}</span>}
                      {it.categorie && <span style={{ opacity: 0.7 }}>· {it.categorie}</span>}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    {price > 0 ? (
                      <>
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
                          €{price.toFixed(2)}
                          <span style={{ fontSize: 10, color: 'var(--muted)', marginLeft: 2 }}>/{it.unit || 'st'}</span>
                        </div>
                        <div
                          title={fresh ? 'Prijs van de laatste 30 dagen' : 'Prijs ouder dan 30 dagen — overweeg te verversen'}
                          style={{ fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase', color: fresh ? '#86efac' : '#f59e0b', fontWeight: 700 }}
                        >
                          {fresh ? 'recent' : 'oud'}
                        </div>
                      </>
                    ) : (
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>geen prijs</div>
                    )}
                  </div>
                </div>
              );
            })
          )}

          {showPopup && value.trim().length >= minChars && (
            <div
              onMouseDown={e => { e.preventDefault(); onCommit?.(); setOpen(false); }}
              style={{
                padding: '7px 10px', borderRadius: 7, cursor: 'pointer',
                marginTop: 4, borderTop: '1px dashed var(--border)',
                color: 'var(--muted)', fontSize: 11, display: 'flex', alignItems: 'center', gap: 8,
              }}
            >
              <Plus size={12} />
              Niet wat je zoekt? Voeg &ldquo;{value}&rdquo; toe als nieuw ingrediënt
            </div>
          )}
        </div>
      )}
    </div>
  );
}
