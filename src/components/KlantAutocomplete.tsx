'use client';

import { useState, useEffect, useRef } from 'react';
import { Lightbulb } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface Klant {
    id: number;
    naam: string;
    bedrijf: string;
    adres: string;
    postcode: string;
    plaats: string;
    telefoon: string;
    email: string;
    type: string;
}

interface Props {
    value: string;
    onChange: (naam: string) => void;
    onSelect?: (klant: Klant) => void;
    label?: string;
    style?: React.CSSProperties;
    error?: string;
}

export default function KlantAutocomplete({ value, onChange, onSelect, label, style, error }: Props) {
    const [suggestions, setSuggestions] = useState<Klant[]>([]);
    const [showDropdown, setShowDropdown] = useState(false);
    const [selectedIdx, setSelectedIdx] = useState(-1);
    const wrapperRef = useRef<HTMLDivElement>(null);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(function () {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        if (!value || value.length < 2) { setSuggestions([]); return; }

        debounceRef.current = setTimeout(function () {
            supabase.from('klanten').select('*').ilike('naam', '%' + value + '%').limit(6).then(function (res) {
                setSuggestions((res.data || []) as Klant[]);
                setShowDropdown((res.data || []).length > 0);
                setSelectedIdx(-1);
            });
        }, 200);

        return function () { if (debounceRef.current) clearTimeout(debounceRef.current); };
    }, [value]);

    useEffect(function () {
        function handleClick(e: MouseEvent) {
            if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
                setShowDropdown(false);
            }
        }
        document.addEventListener('mousedown', handleClick);
        return function () { document.removeEventListener('mousedown', handleClick); };
    }, []);

    function handleSelect(klant: Klant) {
        onChange(klant.naam);
        setShowDropdown(false);
        if (onSelect) onSelect(klant);
    }

    function handleKeyDown(e: React.KeyboardEvent) {
        if (!showDropdown) return;
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedIdx(function (i) { return Math.min(i + 1, suggestions.length - 1); });
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedIdx(function (i) { return Math.max(i - 1, 0); });
        } else if (e.key === 'Enter' && selectedIdx >= 0) {
            e.preventDefault();
            handleSelect(suggestions[selectedIdx]);
        } else if (e.key === 'Escape') {
            setShowDropdown(false);
        }
    }

    return (
        <div className="field" ref={wrapperRef} style={Object.assign({ position: 'relative' }, style || {})}>
            {label && <label>{label}</label>}
            <input
                value={value}
                onChange={function (e) { onChange(e.target.value); }}
                onFocus={function () { if (suggestions.length > 0) setShowDropdown(true); }}
                onKeyDown={handleKeyDown}
                placeholder="Begin te typen..."
                style={error ? { borderColor: 'var(--red)' } : {}}
            />
            {error && <span style={{ fontSize: 11, color: 'var(--red)', marginTop: 4, display: 'block' }}>{error}</span>}
            {showDropdown && suggestions.length > 0 && (
                <div style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    zIndex: 100,
                    background: 'var(--card-solid)',
                    border: '1px solid rgba(130,130,130,0.2)',
                    borderRadius: 8,
                    marginTop: 4,
                    overflow: 'hidden',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                }}>
                    {suggestions.map(function (k, i) {
                        return (
                            <div
                                key={k.id}
                                onClick={function () { handleSelect(k); }}
                                onMouseEnter={function () { setSelectedIdx(i); }}
                                style={{
                                    padding: '8px 12px',
                                    cursor: 'pointer',
                                    background: i === selectedIdx ? 'var(--muted-extra-light)' : 'transparent',
                                    borderBottom: i < suggestions.length - 1 ? '1px solid rgba(130,130,130,0.08)' : 'none',
                                }}
                            >
                                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                                    {k.naam}
                                    {k.bedrijf && <span style={{ fontWeight: 400, color: 'var(--muted)', marginLeft: 6 }}>({k.bedrijf})</span>}
                                </div>
                                <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                                    {[k.adres, k.plaats, k.email].filter(Boolean).join(' • ')}
                                </div>
                            </div>
                        );
                    })}
                    <div style={{ padding: '6px 12px', fontSize: 10, color: 'var(--muted-light)', borderTop: '1px solid rgba(130,130,130,0.08)' }}>
                        <Lightbulb size={10} style={{ marginRight: 4, display: 'inline-block', verticalAlign: 'middle' }} />
                        Selecteer een klant of typ een nieuwe naam
                    </div>
                </div>
            )}
        </div>
    );
}
