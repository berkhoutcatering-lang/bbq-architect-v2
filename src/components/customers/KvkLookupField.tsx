'use client';

// Sprint 2-deel-3 C8 — KvK autocomplete combobox.
// Debounced search (300ms), max 10 suggestions, click → autofill velden.
// Lars-persona-gate: 44px touch-targets (option-rows + input).

import { useCallback, useEffect, useRef, useState } from 'react';
import { Building2, Loader2, MapPin } from 'lucide-react';
import { lookupKvk } from '@/lib/actions/lookupKvk';
import type { KvkResult } from '@/lib/kvk';

interface Props {
  value: string;
  onChange: (kvkNummer: string) => void;
  onAutofill?: (data: KvkResult) => void;
  placeholder?: string;
  label?: string;
}

const DEBOUNCE_MS = 300;

export function KvkLookupField({ value, onChange, onAutofill, placeholder, label }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const [suggestions, setSuggestions] = useState<KvkResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [source, setSource] = useState<'kvk_official' | 'openkvk' | null>(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync external value-prop changes
  useEffect(() => { setQuery(value); }, [value]);

  // Click-outside dismiss
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      window.addEventListener('mousedown', onDown);
      return () => window.removeEventListener('mousedown', onDown);
    }
  }, [open]);

  const runSearch = useCallback(async (q: string) => {
    if (q.length < 3) {
      setSuggestions([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const result = await lookupKvk({ q });
    setLoading(false);
    if (result.ok) {
      setSuggestions(result.data.results);
      setSource(result.data.source);
      setActiveIdx(0);
    } else {
      setSuggestions([]);
      setSource(null);
    }
  }, []);

  function onInput(next: string) {
    setQuery(next);
    onChange(next);
    setOpen(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(next), DEBOUNCE_MS);
  }

  function select(r: KvkResult) {
    setOpen(false);
    setQuery(r.kvk_nummer);
    onChange(r.kvk_nummer);
    onAutofill?.(r);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || suggestions.length === 0) return;
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActiveIdx(i => Math.min(suggestions.length - 1, i + 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIdx(i => Math.max(0, i - 1));
        break;
      case 'Enter':
        e.preventDefault();
        if (suggestions[activeIdx]) select(suggestions[activeIdx]);
        break;
      case 'Escape':
        setOpen(false);
        break;
    }
  }

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      {label && (
        <label style={{
          display: 'block', fontSize: 11, fontWeight: 600,
          color: 'var(--muted)', marginBottom: 4,
          letterSpacing: '.04em', textTransform: 'uppercase',
        }}>{label}</label>
      )}
      <div style={{ position: 'relative' }}>
        <input
          type="text"
          value={query}
          onChange={(e) => onInput(e.target.value)}
          onFocus={() => { if (suggestions.length > 0) setOpen(true); }}
          onKeyDown={onKeyDown}
          placeholder={placeholder ?? 'KvK-nummer of bedrijfsnaam'}
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls="kvk-suggestions"
          style={{
            width: '100%',
            minHeight: 44, // Lars touch-target
            padding: '10px 36px 10px 12px',
            background: 'var(--card)',
            color: 'var(--text)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            fontSize: 13,
            outline: 'none',
          }}
        />
        {loading && (
          <Loader2 size={16} className="animate-spin" style={{
            position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
            color: 'var(--muted)',
          }} />
        )}
      </div>

      {open && suggestions.length > 0 && (
        <ul
          id="kvk-suggestions"
          role="listbox"
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0, right: 0,
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: 4,
            margin: 0,
            listStyle: 'none',
            zIndex: 100,
            maxHeight: 320,
            overflowY: 'auto',
            boxShadow: '0 4px 24px rgba(0,0,0,.2)',
          }}
        >
          {suggestions.map((r, i) => (
            <li
              key={`${r.kvk_nummer}-${i}`}
              role="option"
              aria-selected={i === activeIdx}
              onMouseEnter={() => setActiveIdx(i)}
              onClick={() => select(r)}
              style={{
                padding: '10px 12px',
                borderRadius: 6,
                cursor: 'pointer',
                background: i === activeIdx ? 'color-mix(in oklch, var(--brand), transparent 88%)' : 'transparent',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10,
                minHeight: 44, // Lars touch-target
              }}
            >
              <Building2 size={16} style={{ color: 'var(--brand)', marginTop: 2, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 13, fontWeight: 600, color: 'var(--text)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{r.bedrijfsnaam}</div>
                <div style={{
                  fontSize: 11, color: 'var(--muted)', marginTop: 2,
                  display: 'flex', alignItems: 'center', gap: 4,
                }}>
                  <span>KvK {r.kvk_nummer}</span>
                  {r.plaats && (<>
                    <span style={{ opacity: 0.5 }}>·</span>
                    <MapPin size={10} />
                    <span>{[r.straat, r.huisnummer].filter(Boolean).join(' ')}{r.plaats && `, ${r.plaats}`}</span>
                  </>)}
                </div>
              </div>
            </li>
          ))}
          {source && (
            <li style={{
              padding: '6px 12px',
              fontSize: 9,
              color: 'var(--muted)',
              borderTop: '1px solid var(--border)',
              marginTop: 4,
              textAlign: 'right',
              letterSpacing: '.04em',
              textTransform: 'uppercase',
            }}>
              Via {source === 'kvk_official' ? 'officiële KvK API' : 'OpenKvK fallback'}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
