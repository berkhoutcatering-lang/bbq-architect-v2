'use client';

import { useState, useEffect, useRef, useCallback, useMemo, type ReactNode } from 'react';
import { VANDAAG, zichtbareWerkruimtes, type ZichtbaarheidOpties } from '@/lib/navigation';
import { useOnderdelen } from '@/lib/useOnderdelen';
import { useRouter } from 'next/navigation';
import { useIsPhone } from '@/hooks/useIsMobile';
import { supabase } from '@/lib/supabase';
import {
    Search, Calendar, FileText, Receipt, Package, ChefHat, BookOpen,
    Users, Euro, ArrowRight, Flame, Sparkles, ShoppingCart, Truck, Wrench, Clock,
    ShieldCheck, DollarSign, Settings, Globe, HelpCircle, Mail, Camera,
    Building2, MessageSquare, ClipboardList, Map, UtensilsCrossed, Bot
} from 'lucide-react';
import PaletteAiInput from '@/components/ai/PaletteAiInput';

interface SearchResult {
    id: string;
    type: 'event' | 'offerte' | 'factuur' | 'recept' | 'gerecht' | 'voorraad' | 'klant' | 'pagina';
    title: string;
    subtitle: string;
    href: string;
    icon: typeof Calendar;
    /** Icoon uit navigation.tsx (al een element); wint van `icon`. */
    iconNode?: ReactNode;
    accent: string;
}

/* Pagina's komen uit de werkruimtes (src/lib/navigation.tsx) — dezelfde bron
   als de balk en het tegelscherm. Deze lijst stond hier eerder los, en liep
   achter: Facturen stond onder Verkoop, Uren onder Geld, Logistiek onder
   Voorraad. Uitgezette onderdelen verschijnen hier ook niet.

   Hieronder alleen pagina's die géén tabblad zijn maar wel vindbaar moeten
   zijn via ⌘K ("dagelijks zichtbaar, zeldzaam vindbaar"). `hub` = slug van de
   werkruimte; staat die uit, dan valt de pagina ook weg. */
const EXTRA_PAGINAS: Array<Omit<SearchResult, 'accent' | 'type'> & { hub: string; adminOnly?: boolean }> = [
    { id: 'p_klantgesprek', title: 'Klantgesprek', subtitle: 'Plannen', href: '/klantgesprek', icon: MessageSquare, hub: 'plannen' },
    { id: 'p_prep', title: 'Prep Counter', subtitle: 'Plannen', href: '/prep-counter', icon: ClipboardList, hub: 'plannen' },
    { id: 'p_haccp', title: 'HACCP', subtitle: 'Plannen', href: '/haccp', icon: ShieldCheck, hub: 'plannen' },
    { id: 'p_haccp_field', title: 'HACCP Field (mobiel)', subtitle: 'Plannen', href: '/haccp/field', icon: ShieldCheck, hub: 'plannen' },
    { id: 'p_marges', title: 'Marges & analyse', subtitle: 'Keuken · BCG en foodcost', href: '/marges', icon: Sparkles, hub: 'gerechten' },
    { id: 'p_pitmaster', title: 'AI Pitmaster', subtitle: 'Keuken · AI chat', href: '/ai-chat', icon: Bot, hub: 'gerechten' },
    { id: 'p_los_label', title: 'Los label printen', subtitle: 'Inkoop & Voorraad · sticker op een doos of bak', href: '/labels/los', icon: Settings, hub: 'voorraad' },
    { id: 'p_printers', title: 'Labelprinters (Zebra)', subtitle: 'Systeem', href: '/instellingen/printers', icon: Settings, hub: 'systeem' },
    { id: 'p_onderdelen', title: 'Onderdelen aan/uit', subtitle: 'Systeem · wat je bedrijf gebruikt', href: '/instellingen/onderdelen', icon: Settings, hub: 'systeem' },
    { id: 'p_export', title: 'Data export', subtitle: 'Systeem', href: '/instellingen/data-export', icon: Settings, hub: 'systeem' },
    { id: 'p_referral', title: 'Referral', subtitle: 'Systeem', href: '/instellingen/referral', icon: Settings, hub: 'systeem' },
    { id: 'p_sitemap', title: "Sitemap (alle pagina's)", subtitle: 'Systeem · overzicht', href: '/hulp/sitemap', icon: Map, hub: 'systeem' },
    { id: 'p_admin_funnel', title: 'Funnel-analytics', subtitle: 'Platform Beheer', href: '/admin/funnel', icon: Building2, hub: 'systeem', adminOnly: true },
];

function bouwPaginas(opties: ZichtbaarheidOpties): SearchResult[] {
    const werkruimtes = zichtbareWerkruimtes(opties);
    const uit: SearchResult[] = [
        { id: 'p_home', type: 'pagina', title: VANDAAG.title, subtitle: 'Startpagina', href: VANDAAG.href, icon: Flame, accent: VANDAAG.kleur },
    ];
    for (const w of werkruimtes) {
        for (const c of w.children) {
            uit.push({ id: 'p_' + c.href, type: 'pagina', title: c.label, subtitle: w.title, href: c.href, icon: ArrowRight, iconNode: c.icon, accent: w.kleur });
        }
    }
    for (const e of EXTRA_PAGINAS) {
        const w = werkruimtes.find(function (x) { return x.slug === e.hub; });
        if (!w) continue;
        if (e.adminOnly && !opties.isPlatformAdmin) continue;
        uit.push({ id: e.id, type: 'pagina', title: e.title, subtitle: e.subtitle, href: e.href, icon: e.icon, accent: w.kleur });
    }
    return uit;
}

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
    const isPhone = useIsPhone();
    const [open, setOpen] = useState(false);
    const [mode, setMode] = useState<'search' | 'ask'>('search');
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<SearchResult[]>([]);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [loading, setLoading] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const router = useRouter();
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const { opties } = useOnderdelen();
    const pages = useMemo(function () { return bouwPaginas(opties); }, [opties]);
    const pagesRef = useRef<SearchResult[]>(pages);
    useEffect(function () { pagesRef.current = pages; }, [pages]);

    /* G-prefix sneltoetsen (Linear-stijl): druk 'g' dan een letter om naar een hub te springen.
       G H = Vandaag, G P = Plannen, G V = Verkoop, G K = Keuken, G W = Voorraad,
       G G = Geld, G S = Systeem, G A = Agenda, G O = Offertes, G E = Events,
       G F = Facturen, G C = Klanten. Skip wanneer gebruiker typt in een input. */
    const lastGRef = useRef<number>(0);
    const openRef = useRef<boolean>(false);
    useEffect(function () { openRef.current = open; }, [open]);

    useEffect(function () {
        function handleKeyDown(e: KeyboardEvent) {
            // ⌘K / Ctrl+K: toggle palette
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                setOpen(function (prev) { return !prev; });
                return;
            }
            if (e.key === 'Escape') { setOpen(false); return; }

            // Skip sneltoetsen wanneer in input/textarea/contenteditable of palette open
            const target = e.target as HTMLElement | null;
            const isTyping = !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
            if (isTyping || openRef.current) return;

            // Eerste 'g' zet de prefix-timer
            if (e.key === 'g' && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) {
                lastGRef.current = Date.now();
                return;
            }

            // Tweede toets binnen 1500ms = sneltoets (IA 2026-05-02 — task-frequency sidebar)
            if (lastGRef.current && (Date.now() - lastGRef.current) < 1500) {
                const shortcuts: Record<string, string> = {
                    // Top-level sidebar items
                    h: '/',                  // Home / Vandaag
                    a: '/agenda',
                    e: '/events',
                    r: '/gerechten',         // Recepten (canonical URL = /gerechten)
                    f: '/archief',
                    s: '/systeem',
                    // Veelgebruikte sub-pages
                    o: '/offertes',
                    i: '/facturen',          // Invoices
                    b: '/financien',         // Boekhouding/finance
                    u: '/uren',
                    c: '/klanten',
                    w: '/voorraad',          // Warehouse
                };
                const dest = shortcuts[e.key.toLowerCase()];
                if (dest) {
                    e.preventDefault();
                    router.push(dest);
                    lastGRef.current = 0;
                }
            }
        }
        // External open trigger (e.g. mobile FAB, AppShell button).
        // Zelfde patroon als `open-tegelscherm` (werkruimte/events.ts).
        function handleOpenEvent() { setOpen(true); }
        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('open-command-palette', handleOpenEvent);
        return function () {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('open-command-palette', handleOpenEvent);
        };
    }, [router]);

    useEffect(function () {
        if (open && inputRef.current && mode === 'search') {
            setTimeout(function () { inputRef.current?.focus(); }, 50);
        }
        if (!open) { setQuery(''); setResults([]); setSelectedIndex(0); setMode('search'); }
    }, [open, mode]);

    const searchData = useCallback(async function (q: string) {
        if (!q || q.length < 2) {
            setResults(pagesRef.current.filter(function (p) { return p.title.toLowerCase().includes(q.toLowerCase()); }).slice(0, 6));
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
            const matchingPages = pagesRef.current.filter(function (p) {
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
        } else if (e.key === 'Tab') {
            // Tab schakelt naar Vraag-Rook-mode. Huidige query wordt
            // doorgegeven zodat de gebruiker niet hoeft over te typen.
            e.preventDefault();
            setMode('ask');
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
                {mode === 'ask' ? (
                    <PaletteAiInput
                        initialQuery={query}
                        onClose={function () { setOpen(false); }}
                        onSwitchToSearch={function () { setMode('search'); }}
                    />
                ) : (
                <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
                    <Search size={18} style={{ color: 'var(--muted)', flexShrink: 0 }} />
                    <input
                        ref={inputRef}
                        value={query}
                        onChange={function (e) { setQuery(e.target.value); }}
                        onKeyDown={handleKeyDown}
                        placeholder={isPhone ? "Zoek…" : "Zoek events, offertes, recepten, klanten..."}
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
                    {!isPhone && (
                        <kbd style={{
                            fontSize: 10,
                            padding: '2px 6px',
                            borderRadius: 4,
                            background: 'var(--muted-extra-light)',
                            border: '1px solid var(--border-strong)',
                            color: 'var(--muted)',
                            fontFamily: 'monospace',
                        }}>ESC</kbd>
                    )}
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
                                    {result.iconNode
                                        ? <span style={{ color: result.accent, display: 'inline-flex' }}>{result.iconNode}</span>
                                        : <Icon size={15} style={{ color: result.accent }} />}
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
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                    fontSize: 10,
                    color: 'var(--color-text-muted)',
                }}>
                    {!isPhone ? (
                        <div style={{ display: 'flex', gap: 16 }}>
                            <span><kbd style={{ padding: '1px 4px', borderRadius: 3, background: 'var(--muted-extra-light)', border: '1px solid var(--border)', fontFamily: 'monospace', fontSize: 9 }}>↑↓</kbd> navigeren</span>
                            <span><kbd style={{ padding: '1px 4px', borderRadius: 3, background: 'var(--muted-extra-light)', border: '1px solid var(--border)', fontFamily: 'monospace', fontSize: 9 }}>↵</kbd> openen</span>
                            <span><kbd style={{ padding: '1px 4px', borderRadius: 3, background: 'var(--muted-extra-light)', border: '1px solid var(--border)', fontFamily: 'monospace', fontSize: 9 }}>esc</kbd> sluiten</span>
                        </div>
                    ) : <div style={{ fontSize: 11, color: 'var(--muted)' }}>Tik om te openen</div>}
                    <button
                        type="button"
                        onClick={function () { setMode('ask'); }}
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '4px 10px',
                            background: 'var(--brand-tint-subtle)',
                            border: '1px solid var(--brand-tint-border)',
                            borderRadius: 'var(--radius-full)',
                            color: 'var(--brand)',
                            fontSize: 11,
                            fontWeight: 600,
                            cursor: 'pointer',
                        }}
                        aria-label="Schakel naar Vraag Rook modus"
                    >
                        <Bot size={11} aria-hidden="true" />
                        Vraag Rook
                        {!isPhone && (
                            <kbd style={{ padding: '0 4px', borderRadius: 3, background: 'var(--card-solid)', border: '1px solid var(--brand-tint-border)', fontFamily: 'monospace', fontSize: 9, color: 'var(--brand)' }}>Tab</kbd>
                        )}
                    </button>
                </div>
                </>
                )}
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
