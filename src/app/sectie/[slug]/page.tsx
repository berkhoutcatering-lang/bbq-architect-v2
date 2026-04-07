'use client';

import React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
    ArrowRight, TrendingUp, AlertTriangle, CheckCircle2,
    Euro, Users, Package, FileText, Calendar, UtensilsCrossed,
    ShoppingCart, Truck
} from 'lucide-react';
import { getSectionBySlug } from '@/lib/navigation';
import { useSupabase } from '@/lib/useSupabase';
import { fmt } from '@/lib/utils';

/* ── KPI Card ─────────────────────────────────────────────── */

function KPICard({ icon, label, value, subtitle, accent = '#3b82f6' }: {
    icon: React.ReactNode;
    label: string;
    value: string | number;
    subtitle?: string;
    accent?: string;
}) {
    return (
        <div className="relative rounded-2xl overflow-hidden bg-gradient-to-br from-[#111113] to-[#0c0c0e] border border-[#1e1e22] p-4">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#333338] to-transparent" />
            <div className="flex items-center gap-2 mb-2">
                <span style={{ color: accent }} className="opacity-80">{icon}</span>
                <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">{label}</span>
            </div>
            <p className="text-xl font-bold text-white tracking-tight">{value}</p>
            {subtitle && <p className="text-[11px] text-[var(--muted)] mt-1">{subtitle}</p>}
        </div>
    );
}

/* ── Section Stats ────────────────────────────────────────── */

function DeKeukenStats() {
    const { data: gerechten, loading } = useSupabase<any>('gerechten', []);
    if (loading) return <StatsLoading />;

    const total = gerechten.length;
    const actief = gerechten.filter((g: any) => g.actief !== false).length;
    const metKostprijs = gerechten.filter((g: any) => g.kostprijs_pp && g.kostprijs_pp > 0).length;
    const gemKostprijs = metKostprijs > 0
        ? gerechten.filter((g: any) => g.kostprijs_pp > 0).reduce((s: number, g: any) => s + g.kostprijs_pp, 0) / metKostprijs
        : 0;

    return (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
            <KPICard icon={<UtensilsCrossed size={16} />} label="Totaal gerechten" value={total} subtitle={`${actief} actief`} />
            <KPICard icon={<CheckCircle2 size={16} />} label="Met kostprijs" value={metKostprijs} subtitle={`${total - metKostprijs} nog berekenen`} accent="#10b981" />
            <KPICard icon={<Euro size={16} />} label="Gem. kostprijs p.p." value={fmt(gemKostprijs)} subtitle="over alle gerechten" accent="#f59e0b" />
            <KPICard icon={<TrendingUp size={16} />} label="Gem. marge" value={gemKostprijs > 0 ? `${Math.round((1 - gemKostprijs / 45) * 100)}%` : '–'} subtitle="op €45 menu" accent="#8b5cf6" />
        </div>
    );
}

function OperatieStats() {
    const { data: events, loading } = useSupabase<any>('events', []);
    if (loading) return <StatsLoading />;

    const today = new Date().toISOString().slice(0, 10);
    const upcoming = events.filter((e: any) => e.date >= today && e.status !== 'geannuleerd');
    const confirmed = events.filter((e: any) => e.status === 'confirmed');
    const completed = events.filter((e: any) => e.status === 'completed');
    const totalGuests = upcoming.reduce((s: number, e: any) => s + (e.guests || 0), 0);

    return (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
            <KPICard icon={<Calendar size={16} />} label="Aankomende events" value={upcoming.length} subtitle="gepland" />
            <KPICard icon={<CheckCircle2 size={16} />} label="Bevestigd" value={confirmed.length} subtitle="events bevestigd" accent="#10b981" />
            <KPICard icon={<Users size={16} />} label="Totaal gasten" value={totalGuests} subtitle="komende events" accent="#f59e0b" />
            <KPICard icon={<TrendingUp size={16} />} label="Voltooid" value={completed.length} subtitle="afgeronde events" accent="#8b5cf6" />
        </div>
    );
}

function DeZaakStats() {
    const { data: offertes, loading: lo } = useSupabase<any>('offertes', []);
    const { data: facturen, loading: lf } = useSupabase<any>('facturen', []);
    if (lo || lf) return <StatsLoading />;

    const openOffertes = offertes.filter((o: any) => o.status === 'concept' || o.status === 'verzonden');
    const betaald = facturen.filter((f: any) => f.status === 'betaald');
    let revenue = 0;
    betaald.forEach((f: any) => { (f.items || []).forEach((i: any) => { revenue += (i.qty || 0) * (i.prijs || 0); }); });

    const openFact = facturen.filter((f: any) => f.status !== 'betaald' && f.status !== 'geannuleerd');
    let openBedrag = 0;
    openFact.forEach((f: any) => { (f.items || []).forEach((i: any) => { openBedrag += (i.qty || 0) * (i.prijs || 0); }); });

    const geaccepteerd = offertes.filter((o: any) => ['geaccepteerd', 'goedgekeurd', 'akkoord', 'definitief'].includes(o.status));
    const convRatio = offertes.length > 0 ? Math.round((geaccepteerd.length / offertes.length) * 100) : 0;

    return (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
            <KPICard icon={<FileText size={16} />} label="Open offertes" value={openOffertes.length} subtitle={`${offertes.length} totaal`} />
            <KPICard icon={<Euro size={16} />} label="Omzet (betaald)" value={fmt(revenue)} subtitle={`${betaald.length} facturen`} accent="#10b981" />
            <KPICard icon={<AlertTriangle size={16} />} label="Open facturen" value={fmt(openBedrag)} subtitle={`${openFact.length} facturen`} accent="#f59e0b" />
            <KPICard icon={<TrendingUp size={16} />} label="Conversieratio" value={`${convRatio}%`} subtitle="offertes geaccepteerd" accent="#8b5cf6" />
        </div>
    );
}

function BeheerStats() {
    const { data: inventory, loading: li } = useSupabase<any>('inventory', []);
    const { data: leveranciers, loading: ll } = useSupabase<any>('leveranciers', []);
    if (li || ll) return <StatsLoading />;

    const lowStock = inventory.filter((i: any) => (i.current_stock || 0) < (i.min_stock || 0));
    const totalValue = inventory.reduce((s: number, i: any) => s + ((i.current_stock || 0) * (i.purchase_price || 0)), 0);

    return (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
            <KPICard icon={<Package size={16} />} label="Producten" value={inventory.length} subtitle="in voorraad" />
            <KPICard icon={<AlertTriangle size={16} />} label="Onder minimum" value={lowStock.length} subtitle={lowStock.length > 0 ? 'actie vereist' : 'alles op peil'} accent={lowStock.length > 0 ? '#ef4444' : '#10b981'} />
            <KPICard icon={<Euro size={16} />} label="Voorraadwaarde" value={fmt(totalValue)} subtitle="totale waarde" accent="#f59e0b" />
            <KPICard icon={<Truck size={16} />} label="Leveranciers" value={leveranciers.length} subtitle="geregistreerd" accent="#8b5cf6" />
        </div>
    );
}

function StatsLoading() {
    return (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
            {[1, 2, 3, 4].map((i) => (
                <div key={i} className="relative rounded-2xl overflow-hidden bg-gradient-to-br from-[#111113] to-[#0c0c0e] border border-[#1e1e22] p-4 animate-pulse">
                    <div className="h-3 w-20 bg-[#1e1e22] rounded mb-3" />
                    <div className="h-6 w-16 bg-[#1e1e22] rounded mb-2" />
                    <div className="h-2 w-24 bg-[#1e1e22] rounded" />
                </div>
            ))}
        </div>
    );
}

const sectionStatsMap: Record<string, React.FC> = {
    'de-keuken': DeKeukenStats,
    'operatie': OperatieStats,
    'de-zaak': DeZaakStats,
    'beheer-logistiek': BeheerStats,
};

/* ── Page ─────────────────────────────────────────────────── */

export default function SectiePage() {
    const { slug } = useParams<{ slug: string }>();
    const section = getSectionBySlug(slug);

    if (!section) {
        return (
            <div className="flex-1 flex items-center justify-center min-h-[60vh]">
                <div className="text-center">
                    <p className="text-[var(--muted)] text-lg">Sectie niet gevonden</p>
                    <Link href="/" className="text-[#3b82f6] text-sm mt-2 inline-block hover:underline">
                        Terug naar dashboard
                    </Link>
                </div>
            </div>
        );
    }

    const StatsComponent = sectionStatsMap[slug];

    return (
        <div className="flex-1 p-6 md:p-10 max-w-6xl">
            {/* Header */}
            <div className="mb-8">
                <div className="flex items-center gap-3 mb-2">
                    <span className="text-[#3b82f6]">
                        {React.cloneElement(section.icon as React.ReactElement<any>, { size: 28 })}
                    </span>
                    <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">
                        {section.title}
                    </h1>
                </div>
                <p className="text-[var(--muted)] text-sm mt-1 ml-[42px]">
                    {section.description}
                </p>
            </div>

            {/* Stats */}
            {StatsComponent && <StatsComponent />}

            {/* Navigation cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {section.children.map((child) => (
                    <Link
                        key={child.href}
                        href={child.href}
                        className="group relative rounded-2xl overflow-hidden bg-gradient-to-br from-[#111113] to-[#0c0c0e] border border-[#1e1e22] hover:border-[#2a2a30] hover:shadow-lg hover:shadow-black/20 transition-all duration-500 p-5 flex flex-col gap-3"
                    >
                        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#333338] to-transparent" />

                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-[#3b82f6]/10 flex items-center justify-center text-[#3b82f6] group-hover:bg-[#3b82f6]/20 transition-colors duration-300">
                                {React.cloneElement(child.icon as React.ReactElement<any>, { size: 20 })}
                            </div>
                            <h2 className="text-[15px] font-semibold text-white group-hover:text-[#3b82f6] transition-colors duration-300">
                                {child.label}
                            </h2>
                        </div>

                        {child.description && (
                            <p className="text-[12px] text-[var(--muted)] leading-relaxed">
                                {child.description}
                            </p>
                        )}

                        <div className="flex items-center gap-1 text-[11px] text-[var(--muted)] group-hover:text-[#3b82f6] transition-colors duration-300 mt-auto">
                            <span>Openen</span>
                            <ArrowRight size={12} className="group-hover:translate-x-1 transition-transform duration-300" />
                        </div>
                    </Link>
                ))}
            </div>
        </div>
    );
}
