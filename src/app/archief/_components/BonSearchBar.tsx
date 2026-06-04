/**
 * BonSearchBar — search-input voor het Bonnenkistje.
 *
 * Design DNA uit Claude archief-kistje.jsx:7-36.
 * Notion-stijl monolithic search-bar, 14px padding, glass background.
 *
 * Werking:
 *   - URL-state via nuqs: ?q=... staat in URL, share-baar
 *   - 250ms debounce voordat URL update (vermijdt re-render storm)
 *   - ⌘K opent de globale CommandPalette met "Zoek in bonnen…" preset
 *   - Esc cleart de zoekterm
 */
'use client';

import { useEffect, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { useQueryState } from 'nuqs';

const DEBOUNCE_MS = 250;

export function BonSearchBar({ autoFocus = false }: { autoFocus?: boolean }) {
    const [q, setQ] = useQueryState('q', { defaultValue: '', clearOnDefault: true });
    const [local, setLocal] = useState(q ?? '');
    const inputRef = useRef<HTMLInputElement>(null);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Sync URL → local zodat externe links met ?q= meteen invullen.
    useEffect(() => {
        setLocal(q ?? '');
    }, [q]);

    // Debounce local → URL
    useEffect(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
            if (local !== (q ?? '')) {
                void setQ(local || null);
            }
        }, DEBOUNCE_MS);
        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [local]);

    // Keyboard: '/' focust de zoekbalk (Linear pattern)
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            const tag = (e.target as HTMLElement | null)?.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA') return;
            if (e.key === '/' && !e.metaKey && !e.ctrlKey) {
                e.preventDefault();
                inputRef.current?.focus();
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, []);

    return (
        <div className="mb-4">
            <div
                className="flex items-center gap-3 rounded-[14px] border px-4 py-3 transition-colors"
                style={{
                    background: 'var(--card)',
                    borderColor: 'var(--border)',
                    backdropFilter: 'var(--glass-blur)',
                }}
            >
                <Search
                    size={20}
                    className={local ? 'text-[var(--brand)]' : 'text-[var(--muted)]'}
                />
                <input
                    ref={inputRef}
                    type="search"
                    role="searchbox"
                    aria-label="Zoek in alle bonnen, facturen en documenten"
                    placeholder="Zoek in alle bonnen, facturen en documenten…"
                    value={local}
                    onChange={(e) => setLocal(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                            setLocal('');
                        }
                    }}
                    autoFocus={autoFocus}
                    className="flex-1 border-none bg-transparent text-[15px] text-[var(--text)] outline-none"
                    style={{ fontFamily: 'var(--font-sans)' }}
                />
                {local && (
                    <button
                        type="button"
                        onClick={() => setLocal('')}
                        aria-label="Wis zoekterm"
                        className="flex text-[var(--muted)] transition hover:text-[var(--text)]"
                    >
                        <X size={16} />
                    </button>
                )}
                <kbd
                    className="hidden-mobile-cmdk rounded-[6px] border px-2 py-0.5 font-mono text-[10px] text-[var(--muted)]"
                    style={{
                        borderColor: 'var(--border)',
                        background: 'rgba(130,130,130,.06)',
                    }}
                >
                    /
                </kbd>
            </div>
        </div>
    );
}
