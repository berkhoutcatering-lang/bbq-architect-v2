'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import {
    Search, Calendar, FileText, Receipt, Package, ChefHat, BookOpen,
    Users, MapPin, Euro, X, ArrowRight, Flame
} from 'lucide-react';

interface SearchResult {
    id: string;
    type: 'event' | 'offerte' | 'factuur' | 'recept' | 'gerecht' | 'voorraad' | 'klant' | 'pagina';
    title: string;
    subtitle: string;
    href: string;
    icon: typeof Calendar;
    accent: string;
}

const pages: SearchResult[] = [
    { id: 'p1', type: 'pagina', title: 'Dashboard', subtitle: 'Command Center', href: '/', icon: Flame, accent: '#c4a35a' },
    { id: 'p2', type: 'pagina', title: 'Offertes', subtitle: 'Verkoop', href: '/offertes', icon: FileText, accent: '#3b82f6' },
    { id: 'p3', type: 'pagina', title: 'Facturen', subtitle: 'Verkoop', href: '/facturen', icon: Receipt, accent: '#f59e0b' },
    { id: 'p4', type: 'pagina', title: 'Events', subtitle: 'Operatie', href: '/events', icon: Calendar, accent: '#10b981' },
    { id: 'p5', type: 'pagina', title: 'Agenda', subtitle: 'Operatie', href: '/agenda', icon: Calendar, accent: '#10b981' },
    { id: 'p6', type: 'pagina', title: 'Recepten', subtitle: 'Keuken', href: '/recepten', icon: BookOpen, accent: '#8b5cf6' },
    { id: 'p7', type: 'pagina', title: 'Gerechten', subtitle: 'Keuken', href: '/gerechten', icon: ChefHat, accent: '#8b5cf6' },
    { id: 'p8', type: 'pagina', title: 'Menu Engineering', subtitle: 'Keuken', href: '/menu-engineering', icon: ChefHat, accent: '#8b5cf6' },
    { id: 'p9', type: 'pagina', title: 'Voorraad', subtitle: 'Beheer', href: '/voorraad', icon: Package, accent: '#06b6d4' },
    { id: 'p10', type: 'pagina', title: 'Inkoop', subtitle: 'Beheer', href: '/inkoop', icon: Package, accent: '#06b6d4' },
    { id: 'p11', type: 'pagina', title: 'Boekhouding', subtitle: 'Verkoop', href: '/boekhouding', icon: Euro, accent: '#f59e0b' },
    { id: 'p12', type: 'pagina', title: 'Analytics', subtitle: 'Verkoop', href: '/financien', icon: Euro, accent: '#f59e0b' },
    { id: 'p13', type: 'pagina', title: 'Pitmaster Studio', subtitle: 'Keuken', href: '/ai-chat', icon: Flame, accent: '#c4a35a' },
    { id: 'p14', type: 'pagina', title: 'Instellingen', subtitle: 'Systeem', href: '/instellingen', icon: Flame, accent: '#828282' },
    { id: 'p15', type: 'pagina', title: 'HACCP', subtitle: 'Beheer', href: '/haccp', icon: Package, accent: '#06b6d4' },
    { id: 'p16', type: 'pagina', title: 'Logistiek', subtitle: 'Beheer', href: '/logistiek', icon: Package, accent: '#06b6d4' },
    { id: 'p17', type: 'pagina', title: 'Materieel', subtitle: 'Beheer', href: '/materieel', icon: Package, accent: '#06b6d4' },
    { id: 'p18', type: 'pagina', title: 'Uren', subtitle: 'Beheer', href: '/uren', icon: Users, accent: '#06b6d4' },
];

const typeConfig: Record<string, { icon: typeof Calendar; accent: string; label: string }> = {
    event: { icon: Calendar, accent: '#10b981', label: 'Event' },
    offerte: { icon: FileText, accent: '#3b82f6', label: 'Offerte' },
    factuur: { icon: Receipt, accent: '#f59e0b', label: 'Factuur' },
    recept: { icon: BookOpen, accent: '#8b5cf6', label: 'Recept' },
    gerecht: { icon: ChefHat, accent: '#8b5cf6', label: 'Gerecht' },
    voorraad: { icon: Package, accent: '#06b6d4', label: 'Voorraad' },
    klant: { icon: Users, accent: '#ec4899', label: 'Klant' },
    pagina: { icon: ArrowRight, accent: '#828282', label: 'Pagina' },
};

export default function CommandPalette() {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<SearchResult[]>([]);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [loading, setLoading] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const router = useRouter();
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(function () {
        function handleKeyDown(e: KeyboardEvent) {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                setOpen(function (prev) { return !prev; });
            }
            if (e.key === 'Escape') setOpen(false);
        }
        window.addEventListener('keydown', handleKeyDown);
        return function () { window.removeEventListener('keydown', handleKeyDown); };
    }, []);

    useEffect(function () {
        if (open && inputRef.current) {
            setTimeout(function () { inputRef.current?.focus(); }, 50);
        }
        if (!open) { setQuery(''); setResults([]); setSelectedIndex(0); }
    }, [open]);

    const searchData = useCallback(async function (q: string) {
        if (!q || q.length < 2) {
            setResults(pages.filter(function (p) { return p.title.toLowerCase().includes(q.toLowerCase()); }).slice(0, 6));
            setLoading(false);
            return;
        }

        setLoading(true);
        const term = '%' + q + '%';

        try {
            const [evRes, offRes, facRes, recRes, gerRes, invRes, klRes] = await Promise.all([
                supabase.from('events').select('id,name,date,guests,location,status,client_naam').or('name.ilike.' + term + ',client_naam.ilike.' + term + ',location.ilike.' + term).limit(5),
                supabase.from('offertes').select('id,nummer,client_naam,datum,status').or('client_naam.ilike.' + term + ',nummer.ilike.' + term + ',notitie.ilike.' + term).limit(5),
                supabase.from('facturen').select('id,nummer,client_naam,datum,status').or('client_naam.ilike.' + term + ',nummer.ilike.' + term).limit(5),
                supabase.from('recepten').select('id,naam,categorie').ilike('naam', term).limit(5),
                supabase.from('gerechten').select('id,naam,categorie').ilike('naam', term).limit(5),
                supabase.from('inventory').select('id,naam,categorie,current_stock,unit').ilike('naam', term).limit(5),
                supabase.from('klanten').select('id,naam,bedrijf,type,plaats').or('naam.ilike.' + term + ',bedrijf.ilike.' + term + ',plaats.ilike.' + term).limit(5),
            ]);

            const items: SearchResult[] = [];

            (evRes.data || []).forEach(function (e: any) {
                items.push({
                    id: 'ev_' + e.id,
                    type: 'event',
                    title: e.name,
                    subtitle: (e.date || '') + ' • ' + (e.guests || 0) + ' gasten • ' + (e.location || ''),
                    href: '/events',
                    icon: Calendar,
                    accent: '#10b981',
                });
            });

            (offRes.data || []).forEach(function (o: any) {
                items.push({
                    id: 'off_' + o.id,
                    type: 'offerte',
                    title: o.nummer + ' — ' + (o.client_naam || ''),
                    subtitle: (o.datum || '') + ' • ' + o.status,
                    href: '/offertes',
                    icon: FileText,
                    accent: '#3b82f6',
                });
            });

            (facRes.data || []).forEach(function (f: any) {
                items.push({
                    id: 'fac_' + f.id,
                    type: 'factuur',
                    title: f.nummer + ' — ' + (f.client_naam || ''),
                    subtitle: (f.datum || '') + ' • ' + f.status,
                    href: '/facturen',
                    icon: Receipt,
                    accent: '#f59e0b',
                });
            });

            (recRes.data || []).forEach(function (r: any) {
                items.push({
                    id: 'rec_' + r.id,
                    type: 'recept',
                    title: r.naam,
                    subtitle: r.categorie || 'Recept',
                    href: '/recepten',
                    icon: BookOpen,
                    accent: '#8b5cf6',
                });
            });

            (gerRes.data || []).forEach(function (g: any) {
                items.push({
                    id: 'ger_' + g.id,
                    type: 'gerecht',
                    title: g.naam,
                    subtitle: g.categorie || 'Gerecht',
                    href: '/gerechten',
                    icon: ChefHat,
                    accent: '#8b5cf6',
                });
            });

            (invRes.data || []).forEach(function (i: any) {
                items.push({
                    id: 'inv_' + i.id,
                    type: 'voorraad',
                    title: i.naam,
                    subtitle: (i.current_stock || 0) + ' ' + (i.unit || '') + ' • ' + (i.categorie || ''),
                    href: '/voorraad',
                    icon: Package,
                    accent: '#06b6d4',
                });
            });

            // Klanten uit eigen tabel (primair)
            (klRes.data || []).forEach(function (k: any) {
                items.push({
                    id: 'klant_' + k.id,
                    type: 'klant',
                    title: k.naam,
                    subtitle: [k.bedrijf, k.type, k.plaats].filter(Boolean).join(' • ') || 'Klant',
                    href: '/klanten?zoek=' + encodeURIComponent(k.naam),
                    icon: Users,
                    accent: '#ec4899',
                });
            });

            // Also include matching pages
            const matchingPages = pages.filter(function (p) {
                return p.title.toLowerCase().includes(q.toLowerCase());
            });

            setResults(items.concat(matchingPages).slice(0, 15));
            setSelectedIndex(0);
        } catch (err) {
            console.error('[Search]', err);
        }
        setLoading(false);
    }, []);

    useEffect(function () {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(function () { searchData(query); }, 200);
        return function () { if (debounceRef.current) clearTimeout(debounceRef.current); };
    }, [query, searchData]);

    function handleSelect(result: SearchResult) {
        setOpen(false);
        router.push(result.href);
    }

    function handleKeyDown(e: React.KeyboardEvent) {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedIndex(function (i) { return Math.min(i + 1, results.length - 1); });
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedIndex(function (i) { return Math.max(i - 1, 0); });
        } else if (e.key === 'Enter' && results[selectedIndex]) {
            e.preventDefault();
            handleSelect(results[selectedIndex]);
        }
    }

    if (!open) return null;

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-label="Zoeken en navigeren"
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: 99999,
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'center',
                paddingTop: '15vh',
                background: 'var(--overlay)',
                backdropFilter: 'blur(4px)',
            }}
            onClick={function () { setOpen(false); }}
        >
            <div
                onClick={function (e) { e.stopPropagation(); }}
                style={{
                    width: '100%',
                    maxWidth: 580,
                    background: 'var(--card-solid)',
                    border: '1px solid var(--border-strong)',
                    borderRadius: 16,
                    overflow: 'hidden',
                    boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
                    animation: 'cmdFadeIn 0.15s ease',
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
                    <Search size={18} style={{ color: 'var(--muted)', flexShrink: 0 }} />
                    <input
                        ref={inputRef}
                        value={query}
                        onChange={function (e) { setQuery(e.target.value); }}
                        onKeyDown={handleKeyDown}
                        placeholder="Zoek events, offertes, recepten, klanten..."
                        aria-label="Zoeken"
                        style={{
                            flex: 1,
                            background: 'none',
                            border: 'none',
                            outline: 'none',
                            color: 'var(--text)',
                            fontSize: 15,
                            fontFamily: 'inherit',
                        }}
                    />
                    <kbd style={{
                        fontSize: 10,
                        padding: '2px 6px',
                        borderRadius: 4,
                        background: 'var(--muted-extra-light)',
                        border: '1px solid var(--border-strong)',
                        color: 'var(--muted)',
                        fontFamily: 'monospace',
                    }}>ESC</kbd>
                </div>

                <div role="listbox" aria-label="Zoekresultaten" style={{ maxHeight: 400, overflowY: 'auto', padding: '6px 0' }}>
                    {loading && (
                        <div style={{ padding: '20px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
                            Zoeken...
                        </div>
                    )}
                    {!loading && results.length === 0 && query.length >= 2 && (
                        <div style={{ padding: '24px', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: 13 }}>
                            Geen resultaten voor &ldquo;{query}&rdquo;
                        </div>
                    )}
                    {!loading && results.length === 0 && query.length < 2 && (
                        <div style={{ padding: '16px 18px', color: 'var(--color-text-muted)', fontSize: 12 }}>
                            Typ minimaal 2 tekens om te zoeken, of navigeer naar een pagina...
                        </div>
                    )}
                    {!loading && results.map(function (result, i) {
                        const cfg = typeConfig[result.type];
                        const Icon = result.icon;
                        const isSelected = i === selectedIndex;
                        return (
                            <div
                                key={result.id}
                                role="option"
                                aria-selected={isSelected}
                                onClick={function () { handleSelect(result); }}
                                onMouseEnter={function () { setSelectedIndex(i); }}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 12,
                                    padding: '10px 18px',
                                    cursor: 'pointer',
                                    background: isSelected ? 'var(--muted-extra-light)' : 'transparent',
                                    transition: 'background 0.1s',
                                }}
                            >
                                <div style={{
                                    width: 32,
                                    height: 32,
                                    borderRadius: 8,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    background: result.accent + '15',
                                    border: '1px solid ' + result.accent + '25',
                                    flexShrink: 0,
                                }}>
                                    <Icon size={15} style={{ color: result.accent }} />
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        {result.title}
                                    </div>
                                    <div style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        {result.subtitle}
                                    </div>
                                </div>
                                <span style={{
                                    fontSize: 9,
                                    fontWeight: 700,
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.1em',
                                    color: result.accent,
                                    padding: '2px 8px',
                                    borderRadius: 4,
                                    background: result.accent + '10',
                                    flexShrink: 0,
                                }}>
                                    {cfg?.label || result.type}
                                </span>
                            </div>
                        );
                    })}
                </div>

                <div style={{
                    padding: '8px 18px',
                    borderTop: '1px solid var(--border)',
                    display: 'flex',
                    gap: 16,
                    fontSize: 10,
                    color: 'var(--color-text-muted)',
                }}>
                    <span><kbd style={{ padding: '1px 4px', borderRadius: 3, background: 'var(--muted-extra-light)', border: '1px solid var(--border)', fontFamily: 'monospace', fontSize: 9 }}>↑↓</kbd> navigeren</span>
                    <span><kbd style={{ padding: '1px 4px', borderRadius: 3, background: 'var(--muted-extra-light)', border: '1px solid var(--border)', fontFamily: 'monospace', fontSize: 9 }}>↵</kbd> openen</span>
                    <span><kbd style={{ padding: '1px 4px', borderRadius: 3, background: 'var(--muted-extra-light)', border: '1px solid var(--border)', fontFamily: 'monospace', fontSize: 9 }}>esc</kbd> sluiten</span>
                </div>
            </div>

            <style>{`
                @keyframes cmdFadeIn {
                    from { opacity: 0; transform: translateY(-8px) scale(0.98); }
                    to   { opacity: 1; transform: translateY(0) scale(1); }
                }
            `}</style>
        </div>
    );
}
