'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import {
    Search, Calendar, FileText, Receipt, Package, ChefHat, BookOpen,
    Users, Euro, ArrowRight, Flame, Sparkles, ShoppingCart, Truck, Wrench, Clock,
    ShieldCheck, DollarSign, Settings, Globe, HelpCircle, Mail, Camera,
    Building2, MessageSquare, ClipboardList, Map, UtensilsCrossed
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

/* Hub-accent kleuren (gelijk aan sidebar). */
const HUB_ACCENT = {
    vandaag: '#c4a35a',
    plannen: '#10b981',
    verkoop: '#3b82f6',
    geld: '#f59e0b',
    keuken: '#8b5cf6',
    voorraad: '#06b6d4',
    systeem: '#828282',
};

const pages: SearchResult[] = [
    /* Vandaag */
    { id: 'p_home', type: 'pagina', title: 'Vandaag', subtitle: 'Startpagina', href: '/', icon: Flame, accent: HUB_ACCENT.vandaag },

    /* Plannen & Events */
    { id: 'p_plannen', type: 'pagina', title: 'Plannen-hub', subtitle: 'Plannen & Events', href: '/plannen', icon: Calendar, accent: HUB_ACCENT.plannen },
    { id: 'p_agenda', type: 'pagina', title: 'Agenda', subtitle: 'Plannen & Events', href: '/agenda', icon: Calendar, accent: HUB_ACCENT.plannen },
    { id: 'p_events', type: 'pagina', title: 'Events', subtitle: 'Plannen & Events', href: '/events', icon: Calendar, accent: HUB_ACCENT.plannen },
    { id: 'p_klantgesprek', type: 'pagina', title: 'Klantgesprek', subtitle: 'Plannen & Events', href: '/klantgesprek', icon: MessageSquare, accent: HUB_ACCENT.plannen },
    { id: 'p_prep', type: 'pagina', title: 'Prep Counter', subtitle: 'Plannen & Events', href: '/prep-counter', icon: ClipboardList, accent: HUB_ACCENT.plannen },
    { id: 'p_haccp_plannen', type: 'pagina', title: 'HACCP', subtitle: 'Plannen & Events', href: '/haccp', icon: ShieldCheck, accent: HUB_ACCENT.plannen },

    /* Verkoop & Klanten */
    { id: 'p_offertes', type: 'pagina', title: 'Offertes', subtitle: 'Verkoop & Klanten', href: '/offertes', icon: FileText, accent: HUB_ACCENT.verkoop },
    { id: 'p_facturen', type: 'pagina', title: 'Facturen', subtitle: 'Verkoop & Klanten', href: '/facturen', icon: Receipt, accent: HUB_ACCENT.verkoop },
    { id: 'p_klanten', type: 'pagina', title: 'Klanten', subtitle: 'Verkoop & Klanten', href: '/klanten', icon: Users, accent: HUB_ACCENT.verkoop },

    /* Geld & Boekhouding */
    { id: 'p_financien', type: 'pagina', title: 'Financiën', subtitle: 'Geld & Boekhouding', href: '/financien', icon: Euro, accent: HUB_ACCENT.geld },
    { id: 'p_uren', type: 'pagina', title: 'Uren', subtitle: 'Geld & Boekhouding', href: '/uren', icon: Clock, accent: HUB_ACCENT.geld },
    { id: 'p_boekhouding', type: 'pagina', title: 'Boekhouding (alias)', subtitle: 'Geld & Boekhouding', href: '/financien?tab=wv', icon: Euro, accent: HUB_ACCENT.geld },

    /* Keuken */
    { id: 'p_gerechten', type: 'pagina', title: 'Gerechten', subtitle: 'Keuken', href: '/gerechten', icon: ChefHat, accent: HUB_ACCENT.keuken },
    { id: 'p_menus', type: 'pagina', title: 'Menu\u2019s', subtitle: 'Keuken \u00b7 opgeslagen menu-templates', href: '/gerechten?view=menus', icon: UtensilsCrossed, accent: HUB_ACCENT.keuken },
    { id: 'p_marges', type: 'pagina', title: 'Marges & analyse', subtitle: 'Keuken \u00b7 BCG en foodcost', href: '/marges', icon: Sparkles, accent: HUB_ACCENT.keuken },
    { id: 'p_pitmaster', type: 'pagina', title: 'AI Pitmaster', subtitle: 'Keuken \u00b7 AI chat (power)', href: '/ai-chat', icon: Sparkles, accent: HUB_ACCENT.keuken },

    /* Voorraad & Beheer */
    { id: 'p_voorraad', type: 'pagina', title: 'Voorraad', subtitle: 'Voorraad & Beheer', href: '/voorraad', icon: Package, accent: HUB_ACCENT.voorraad },
    { id: 'p_inkoop', type: 'pagina', title: 'Inkoop', subtitle: 'Voorraad & Beheer', href: '/inkoop', icon: ShoppingCart, accent: HUB_ACCENT.voorraad },
    { id: 'p_logistiek', type: 'pagina', title: 'Logistiek', subtitle: 'Voorraad & Beheer', href: '/logistiek', icon: Truck, accent: HUB_ACCENT.voorraad },
    { id: 'p_materieel', type: 'pagina', title: 'Materieel', subtitle: 'Voorraad & Beheer', href: '/materieel', icon: Wrench, accent: HUB_ACCENT.voorraad },
    { id: 'p_haccp_field', type: 'pagina', title: 'HACCP Field (mobiel)', subtitle: 'Plannen & Events · power', href: '/haccp/field', icon: ShieldCheck, accent: HUB_ACCENT.plannen },
    { id: 'p_prijzen', type: 'pagina', title: 'Prijsintelligentie', subtitle: 'Voorraad & Beheer', href: '/price-intelligence', icon: DollarSign, accent: HUB_ACCENT.voorraad },

    /* Power-features (verstopt — vindbaar via ⌘K) */
    { id: 'p_sitemap', type: 'pagina', title: 'Sitemap (alle pagina\'s)', subtitle: 'Power · overzicht', href: '/hulp/sitemap', icon: Map, accent: '#c4a35a' },
    { id: 'p_margin', type: 'pagina', title: 'Margin Doctor', subtitle: 'Power · open offerte → tab', href: '/offertes', icon: Sparkles, accent: '#3b82f6' },
    { id: 'p_admin_funnel', type: 'pagina', title: 'Funnel-analytics', subtitle: 'Admin · power', href: '/admin/funnel', icon: Building2, accent: '#828282' },

    /* Instellingen & Hulp */
    { id: 'p_instellingen', type: 'pagina', title: 'Instellingen', subtitle: 'Instellingen & Hulp', href: '/instellingen', icon: Settings, accent: HUB_ACCENT.systeem },
    { id: 'p_integraties', type: 'pagina', title: 'Integraties', subtitle: 'Instellingen & Hulp', href: '/instellingen/integraties', icon: Settings, accent: HUB_ACCENT.systeem },
    { id: 'p_export', type: 'pagina', title: 'Data export', subtitle: 'Instellingen & Hulp', href: '/instellingen/data-export', icon: Settings, accent: HUB_ACCENT.systeem },
    { id: 'p_referral', type: 'pagina', title: 'Referral', subtitle: 'Instellingen & Hulp', href: '/instellingen/referral', icon: Settings, accent: HUB_ACCENT.systeem },
    { id: 'p_gebruikers', type: 'pagina', title: 'Gebruikers', subtitle: 'Instellingen & Hulp', href: '/gebruikers', icon: Users, accent: HUB_ACCENT.systeem },
    { id: 'p_mailbox', type: 'pagina', title: 'Mailbox', subtitle: 'Instellingen & Hulp', href: '/mailbox', icon: Mail, accent: HUB_ACCENT.systeem },
    { id: 'p_website', type: 'pagina', title: 'Website', subtitle: 'Instellingen & Hulp', href: '/website', icon: Globe, accent: HUB_ACCENT.systeem },
    { id: 'p_foto', type: 'pagina', title: 'Foto-archief', subtitle: 'Menu & Recepten · media', href: '/foto-archief', icon: Camera, accent: HUB_ACCENT.keuken },
    { id: 'p_help', type: 'pagina', title: 'Help Center', subtitle: 'Instellingen & Hulp', href: '/hulp', icon: HelpCircle, accent: HUB_ACCENT.systeem },
    { id: 'p_admin', type: 'pagina', title: 'Platform Beheer', subtitle: 'Admin · power', href: '/admin', icon: Building2, accent: HUB_ACCENT.systeem },
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
            /* recepten samengevouwen onder gerechten 2026-05-01 — één zoek-bron. */
            const [evRes, offRes, facRes, gerRes, invRes, klRes] = await Promise.all([
                supabase.from('events').select('id,name,date,guests,location,status,client_naam').or('name.ilike.' + term + ',client_naam.ilike.' + term + ',location.ilike.' + term).limit(5),
                supabase.from('offertes').select('id,nummer,client_naam,datum,status').or('client_naam.ilike.' + term + ',nummer.ilike.' + term + ',notitie.ilike.' + term).limit(5),
                supabase.from('facturen').select('id,nummer,client_naam,datum,status').or('client_naam.ilike.' + term + ',nummer.ilike.' + term).limit(5),
                supabase.from('gerechten').select('id,naam,gang_slug').ilike('naam', term).limit(8),
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

            (gerRes.data || []).forEach(function (g: any) {
                items.push({
                    id: 'ger_' + g.id,
                    type: 'gerecht',
                    title: g.naam,
                    subtitle: g.gang_slug || 'Gerecht',
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
