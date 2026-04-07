/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
    Menu,
    X,
    Filter,
    RefreshCw,
    Plus,
    CircleAlert,
    CheckCircle2,
    Eye,
    FileText,
    BrainCircuit,
    ArrowLeft,
    Calendar,
    Euro,
    AlertTriangle,
    TrendingUp,
    Zap,
} from "lucide-react";
import Link from "next/link";
import { useSupabase } from "@/lib/useSupabase";
import { fmt, fmtNl } from "@/lib/utils";
import { useApp } from "@/lib/AppContext";
import { acceptOfferte } from "@/lib/syncEngine";
import MetallicCard from '@/components/MetallicCard';
import StatusBadge from '@/components/StatusBadge';

const KPICard = ({ icon: Icon, label, value, accent = "var(--brand)" }: { icon: any; label: string; value: string | number; accent?: string }) => (
    <MetallicCard className="p-5">
        <div className="flex items-start justify-between mb-3">
            <div className="p-2 rounded-xl" style={{ background: `${accent}18`, border: `1px solid ${accent}25` }}>
                <Icon className="h-4 w-4" style={{ color: accent }} />
            </div>
        </div>
        <p className="text-2xl font-black tabular-nums mb-1">{value}</p>
        <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--muted)]">{label}</p>
    </MetallicCard>
);

export default function EventPlannerDashboard() {
    const { data: offertes, loading: loadingOffertes, refetch, update } = useSupabase("offertes", []);
    const { data: events, loading: loadingEvents } = useSupabase("events", []);
    const { pushNotification } = useApp();
    const [syncing, setSyncing] = useState(false);

    const [userRole, setUserRole] = useState("planner");
    const roleRank: Record<string, number> = { viewer: 0, planner: 1, manager: 2, admin: 3 };
    const hasPlannerAccess = roleRank[userRole] >= roleRank.planner;

    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [quickActionOpen, setQuickActionOpen] = useState(false);
    const [showSuccessBanner, setShowSuccessBanner] = useState(false);
    const [selectedId, setSelectedId] = useState<number | null>(null);

    const [filters, setFilters] = useState({ status: "All", planner: "All" });

    const loading = loadingOffertes || loadingEvents;

    useEffect(() => {
        if (!loading && offertes.length > 0) {
            setShowSuccessBanner(true);
            if (!selectedId && offertes[0]) setSelectedId(offertes[0].id);
            const t = setTimeout(() => setShowSuccessBanner(false), 2500);
            return () => clearTimeout(t);
        }
    }, [loading]);

    const statusOptions = useMemo(
        () => ["All", ...Array.from(new Set(offertes.map((o: any) => o.status)))],
        [offertes]
    );
    const plannerOptions = useMemo(
        () => ["All", ...Array.from(new Set(events.map((e: any) => e.client_naam).filter(Boolean)))],
        [events]
    );

    const setFilter = (key: string, value: string) => {
        setFilters((prev) => ({ ...prev, [key]: value }));
    };

    const filteredOffertes = useMemo(() => {
        return offertes
            .filter((o: any) => (filters.status === "All" ? true : o.status === filters.status));
    }, [offertes, filters]);

    const selectedQuote = filteredOffertes.find((o: any) => o.id === selectedId) || null;
    const selectedEvent = selectedQuote
        ? events.find((e: any) => e.offerte_id === selectedQuote.id || e.client_naam === selectedQuote.client_naam)
        : null;

    const kpis = useMemo(() => {
        const items = offertes.map((o: any) => {
            const lineItems = Array.isArray(o.items) ? o.items : [];
            const total = lineItems.reduce((s: number, i: any) => s + (i.prijs || 0) * (i.qty || 0), 0);
            return { ...o, totalExcl: total };
        });

        const totalAmt = items.reduce((s: number, o: any) => s + o.totalExcl, 0);
        const awaiting = offertes.filter((o: any) => o.status === "concept" || o.status === "Awaiting Approval").length;
        const confirmed = offertes.filter((o: any) => o.status === "geaccepteerd" || o.status === "Confirmed").length;
        const upcoming = events.filter((e: any) => e.date && new Date(e.date) >= new Date()).length;
        return { total: totalAmt, awaiting, confirmed, upcoming };
    }, [offertes, events]);

    const aiSuggestion = useMemo(() => {
        if (kpis.awaiting > 1) return "Tip: Batch follow-ups voor offertes in behandeling vóór 16:00 om conversie te verbeteren.";
        if (filteredOffertes.length === 0) return "Tip: Verwijder filters om kandidaat-offertes zichtbaar te maken voor toewijzing.";
        return "Tip: Prioriteer bevestigde high-value events voor logistieke afstemming deze week.";
    }, [filteredOffertes, kpis]);

    const handleAcceptOfferte = useCallback(async function (offerte: any) {
        if (syncing) return;
        setSyncing(true);
        try {
            const result = await acceptOfferte(offerte);
            if (result?.event) {
                pushNotification(
                    '✅ Offerte ' + (offerte.nummer || offerte.id) + ' geaccepteerd! Event aangemaakt' + (result.factuur ? ' + factuur-concept klaar.' : '.'),
                    'success',
                    5000
                );
                refetch();
            } else {
                pushNotification('Sync mislukt. Probeer opnieuw.', 'error');
            }
        } catch (e: any) {
            pushNotification('Fout: ' + e.message, 'error');
        } finally {
            setSyncing(false);
        }
    }, [syncing, pushNotification, refetch]);

    const disabledClasses = hasPlannerAccess ? "" : "opacity-40 cursor-not-allowed pointer-events-none";

    const handleRefresh = () => { refetch(); };

    return (
        <div className="min-h-screen bg-[var(--bg)] text-white">
            <div className="flex min-h-screen">
                {sidebarOpen && (
                    <div className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm lg:hidden" onClick={() => setSidebarOpen(false)} />
                )}

                <main className="flex-1 p-4 sm:p-6 lg:p-8">
                    <header className="mb-6">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="flex items-center gap-4">
                                <Link href="/" className="p-2 hover:bg-white/5 rounded-lg transition-colors">
                                    <ArrowLeft className="h-5 w-5 text-[var(--muted)]" />
                                </Link>
                                <div>
                                    <h1 className="text-xl font-black tracking-tight">Event Planner</h1>
                                    <p className="text-[11px] text-[var(--muted)] uppercase tracking-widest font-medium">Offerte & Event overzicht</p>
                                </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                                <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wider border ${hasPlannerAccess ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300" : "bg-red-500/10 border-red-500/30 text-red-300"}`}>
                                    {userRole}
                                </span>

                                <select
                                    className="rounded-xl border border-[var(--border)] bg-black/40 px-3 py-1.5 text-xs font-bold focus:border-[var(--brand)] outline-none"
                                    value={userRole}
                                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setUserRole(e.target.value)}
                                >
                                    <option value="viewer">viewer</option>
                                    <option value="planner">planner</option>
                                    <option value="manager">manager</option>
                                </select>

                                <button
                                    className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-white/5 px-4 py-2 text-xs font-bold uppercase tracking-wider hover:bg-white/10 transition-colors"
                                    onClick={handleRefresh}
                                >
                                    <RefreshCw className="h-3.5 w-3.5" />
                                    Vernieuwen
                                </button>
                                <button
                                    className={`inline-flex items-center gap-2 rounded-xl bg-[var(--brand)] px-4 py-2 text-xs font-bold uppercase tracking-wider text-black hover:opacity-90 transition-opacity ${disabledClasses}`}
                                    onClick={() => setQuickActionOpen(true)}
                                >
                                    <Plus className="h-3.5 w-3.5" />
                                    Actie
                                </button>
                            </div>
                        </div>

                        {!hasPlannerAccess && (
                            <div className="mt-4 flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
                                <CircleAlert className="h-4 w-4 mt-0.5 shrink-0" />
                                <p>Je hebt minimaal <strong>planner</strong> rechten nodig om acties uit te voeren. Je kunt alleen meekijken.</p>
                            </div>
                        )}
                        {showSuccessBanner && (
                            <div className="mt-4 flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">
                                <CheckCircle2 className="h-4 w-4 shrink-0" />
                                Data succesvol geladen.
                            </div>
                        )}
                    </header>

                    <section className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
                        <KPICard icon={FileText} label="Actieve Offertes" value={offertes.length} />
                        <KPICard icon={Calendar} label="Aankomende Events" value={kpis.upcoming} accent="#10b981" />
                        <KPICard icon={AlertTriangle} label="Wacht op Akkoord" value={kpis.awaiting} accent="#f59e0b" />
                        <KPICard icon={Euro} label="Totaal Excl. BTW" value={fmt(kpis.total)} accent="var(--brand)" />
                    </section>

                    <MetallicCard className="mb-6 p-5">
                        <div className="flex items-center gap-2 mb-4">
                            <Filter className="h-4 w-4 text-[var(--muted)]" />
                            <span className="text-[11px] font-black uppercase tracking-widest text-[var(--muted)]">Filters</span>
                        </div>
                        <div className="space-y-3">
                            <div>
                                <p className="mb-2 text-[10px] font-bold uppercase text-[var(--muted)]">Status</p>
                                <div className="flex flex-wrap gap-2">
                                    {statusOptions.map((s: string) => (
                                        <button
                                            key={s}
                                            onClick={() => setFilter("status", s)}
                                            className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider transition-colors ${filters.status === s ? "bg-[var(--brand)] text-black" : "bg-white/5 border border-[var(--border)] text-[var(--muted)] hover:border-[var(--muted)]"}`}
                                        >
                                            {s}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                        <div className="mt-4 rounded-xl border border-[var(--border)] bg-black/30 px-4 py-2 text-[10px] text-[var(--muted)] font-mono">
                            status={filters.status} | {filteredOffertes.length} resultaten
                        </div>
                    </MetallicCard>

                    <section className="grid grid-cols-1 gap-6 xl:grid-cols-3">
                        <div className="xl:col-span-2 space-y-6">
                            <MetallicCard className="p-6">
                                <h2 className="text-sm font-black uppercase tracking-widest mb-5">Actieve Offertes</h2>

                                {loading ? (
                                    <div className="py-10 flex flex-col items-center justify-center gap-3 text-[var(--muted)]">
                                        <RefreshCw className="h-6 w-6 animate-spin" />
                                        <p className="text-xs font-bold uppercase tracking-widest">Laden...</p>
                                    </div>
                                ) : filteredOffertes.length === 0 ? (
                                    <div className="py-10 border-2 border-dashed border-[var(--border)] rounded-2xl flex items-center justify-center text-[var(--muted)] text-xs font-medium uppercase tracking-widest">
                                        Geen offertes gevonden — verwijder een filter
                                    </div>
                                ) : (
                                    <>
                                        <div className="hidden md:block overflow-x-auto">
                                            <table className="min-w-full text-sm">
                                                <thead>
                                                    <tr className="border-b border-[var(--border)] text-left">
                                                        <th className="pb-2 pr-3 text-[10px] font-bold uppercase tracking-widest text-[var(--muted)]">Nummer</th>
                                                        <th className="pb-2 pr-3 text-[10px] font-bold uppercase tracking-widest text-[var(--muted)]">Klant</th>
                                                        <th className="pb-2 pr-3 text-[10px] font-bold uppercase tracking-widest text-[var(--muted)]">Status</th>
                                                        <th className="pb-2 pr-3 text-[10px] font-bold uppercase tracking-widest text-[var(--muted)]">Datum</th>
                                                        <th className="pb-2 text-[10px] font-bold uppercase tracking-widest text-[var(--muted)]">Acties</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {filteredOffertes.map((o: any) => (
                                                        <tr
                                                            key={o.id}
                                                            className={`border-b border-[var(--border)] transition-colors ${selectedId === o.id ? "bg-white/5" : "hover:bg-white/[0.02]"}`}
                                                        >
                                                            <td className="py-3 pr-3 text-xs font-mono font-bold text-[var(--brand)]">{o.nummer}</td>
                                                            <td className="py-3 pr-3 text-sm font-medium">{o.client_naam}</td>
                                                            <td className="py-3 pr-3"><StatusBadge status={o.status} size="sm" /></td>
                                                            <td className="py-3 pr-3 text-xs text-[var(--muted)]">{fmtNl(o.datum)}</td>
                                                            <td className="py-3">
                                                                <div className="flex gap-2">
                                                                    <button
                                                                        className={`inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-[10px] font-bold uppercase hover:bg-white/5 transition-colors ${disabledClasses}`}
                                                                        onClick={() => setSelectedId(o.id)}
                                                                    >
                                                                        <Eye className="h-3 w-3" />
                                                                        Open
                                                                    </button>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>

                                        <div className="space-y-3 md:hidden">
                                            {filteredOffertes.map((o: any) => (
                                                <div
                                                    key={o.id}
                                                    onClick={() => setSelectedId(o.id)}
                                                    className={`p-4 rounded-2xl border cursor-pointer transition-all ${selectedId === o.id ? "border-[var(--brand)]/50 bg-[var(--brand)]/5" : "border-[var(--border)] bg-black/20"}`}
                                                >
                                                    <div className="flex items-center justify-between mb-2">
                                                        <span className="text-[10px] font-mono font-black text-[var(--brand)]">{o.nummer}</span>
                                                        <StatusBadge status={o.status} size="sm" />
                                                    </div>
                                                    <p className="font-bold text-sm">{o.client_naam}</p>
                                                    <p className="text-[10px] text-[var(--muted)] mt-1">{fmtNl(o.datum)}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </>
                                )}
                            </MetallicCard>

                            <MetallicCard className="p-6">
                                <h3 className="text-sm font-black uppercase tracking-widest mb-4">Geselecteerde Offerte</h3>
                                {!selectedQuote ? (
                                    <p className="text-xs text-[var(--muted)] font-medium">Geen offerte geselecteerd.</p>
                                ) : (
                                    <div className="space-y-3 text-sm">
                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="p-3 bg-black/30 rounded-xl border border-[var(--border)]">
                                                <p className="text-[10px] text-[var(--muted)] font-bold uppercase tracking-widest mb-1">Klant</p>
                                                <p className="font-bold">{selectedQuote.client_naam}</p>
                                            </div>
                                            <div className="p-3 bg-black/30 rounded-xl border border-[var(--border)]">
                                                <p className="text-[10px] text-[var(--muted)] font-bold uppercase tracking-widest mb-1">Datum</p>
                                                <p className="font-bold">{fmtNl(selectedQuote.datum)}</p>
                                            </div>
                                        </div>

                                        {selectedEvent && (
                                            <div className="p-3 bg-emerald-500/5 rounded-xl border border-emerald-500/20">
                                                <p className="text-[10px] text-emerald-400 font-black uppercase tracking-widest mb-1">Gekoppeld Event</p>
                                                <p className="font-bold">{selectedEvent.name}</p>
                                                <p className="text-[10px] text-[var(--muted)] mt-0.5">{selectedEvent.guests} gasten • {fmtNl(selectedEvent.date)}</p>
                                            </div>
                                        )}

                                        <div className="p-3 bg-[var(--brand)]/5 rounded-xl border border-[var(--brand)]/15">
                                            <p className="text-[10px] text-[var(--brand)] font-black uppercase tracking-widest mb-1">Volgende Stap</p>
                                            <p className="text-xs text-[var(--muted-light)] mb-3">
                                                {selectedQuote.status === "concept"
                                                    ? "Finaliseer en accepteer om een event + prep-taken aan te maken."
                                                    : selectedQuote.status === "geaccepteerd"
                                                        ? "Event is aangemaakt. Coördineer de logistieke en keuken-timing."
                                                        : "Volg op bij de klant."}
                                            </p>
                                            {selectedQuote.status === "concept" && (
                                                <button
                                                    className={`w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--brand)] px-4 py-2.5 text-xs font-black uppercase tracking-wider text-black hover:opacity-90 transition-opacity ${disabledClasses} ${syncing ? 'opacity-60 cursor-wait' : ''}`}
                                                    onClick={() => handleAcceptOfferte(selectedQuote)}
                                                    disabled={syncing}
                                                >
                                                    <Zap className="h-3.5 w-3.5" />
                                                    {syncing ? 'Verwerken...' : 'Accepteren + Event aanmaken'}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </MetallicCard>
                        </div>

                        <aside className="space-y-6">
                            <MetallicCard className="p-5">
                                <h3 className="text-sm font-black uppercase tracking-widest mb-4">Overzicht</h3>
                                <div className="space-y-2">
                                    {[
                                        { label: "Concept offertes", value: offertes.filter((o: any) => o.status === 'concept').length, color: "text-[var(--muted)]" },
                                        { label: "Geaccepteerd", value: offertes.filter((o: any) => o.status === 'geaccepteerd').length, color: "text-emerald-400" },
                                        { label: "Geannuleerd", value: offertes.filter((o: any) => o.status === 'geannuleerd').length, color: "text-red-400" },
                                        { label: "Events in agenda", value: events.length, color: "text-[var(--brand)]" },
                                    ].map((s) => (
                                        <div key={s.label} className="flex justify-between items-center py-2 border-b border-[var(--border)] last:border-0">
                                            <span className="text-xs text-[var(--muted)]">{s.label}</span>
                                            <span className={`text-sm font-black tabular-nums ${s.color}`}>{s.value}</span>
                                        </div>
                                    ))}
                                </div>
                            </MetallicCard>

                            <MetallicCard className="p-5">
                                <div className="flex items-center gap-2 mb-3">
                                    <BrainCircuit className="h-4 w-4 text-[var(--brand)]" />
                                    <h3 className="text-sm font-black uppercase tracking-widest">Croq AI</h3>
                                </div>
                                <p className="text-xs text-[var(--muted-light)] leading-relaxed">{aiSuggestion}</p>
                            </MetallicCard>

                            <MetallicCard className="p-5">
                                <h3 className="text-sm font-black uppercase tracking-widest mb-4">Snelle Links</h3>
                                <div className="space-y-2">
                                    {[
                                        { label: "Nieuwe Offerte", href: "/offerte-editor" },
                                        { label: "Offertes", href: "/offertes" },
                                        { label: "Agenda", href: "/agenda" },
                                        { label: "Events", href: "/events" },
                                    ].map((l) => (
                                        <Link key={l.href} href={l.href} className="flex items-center justify-between p-2.5 rounded-xl hover:bg-white/5 border border-transparent hover:border-[var(--border)] transition-all group">
                                            <span className="text-xs font-bold text-[var(--muted)] group-hover:text-white transition-colors">{l.label}</span>
                                            <ArrowLeft className="h-3 w-3 text-[var(--muted)] rotate-180" />
                                        </Link>
                                    ))}
                                </div>
                            </MetallicCard>
                        </aside>
                    </section>

                    <footer className="mt-8 border-t border-[var(--border)] pt-4 text-[10px] text-[var(--muted)] flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <p>© 2026 BBQ Architect • Event Planner Workspace</p>
                        <div className="flex gap-4">
                            <Link href="/instellingen" className="hover:text-white transition-colors">Instellingen</Link>
                            <Link href="/haccp" className="hover:text-white transition-colors">HACCP</Link>
                        </div>
                    </footer>
                </main>
            </div>

            {quickActionOpen && (
                <div className="fixed inset-0 z-50 flex justify-end bg-black/70 backdrop-blur-sm">
                    <div className="h-full w-full max-w-md border-l border-[var(--border)] bg-[#111113] flex flex-col">
                        <div className="p-6 border-b border-[var(--border)] flex items-center justify-between">
                            <h3 className="text-base font-black uppercase tracking-widest">Snelle Actie</h3>
                            <button className="p-2 hover:bg-white/5 rounded-lg transition-colors" onClick={() => setQuickActionOpen(false)}>
                                <X className="h-5 w-5 text-[var(--muted)]" />
                            </button>
                        </div>

                        <div className="p-6 space-y-4 flex-1 overflow-y-auto">
                            <div className="p-4 bg-black/30 rounded-2xl border border-[var(--border)]">
                                <p className="text-[10px] font-bold uppercase text-[var(--muted)] mb-1">Type Actie</p>
                                <p className="text-sm font-medium">Follow-up • Goedkeuring • Interne notitie</p>
                            </div>
                            <div className="p-4 bg-black/30 rounded-2xl border border-[var(--border)]">
                                <p className="text-[10px] font-bold uppercase text-[var(--muted)] mb-1">Geselecteerde Offerte</p>
                                <p className="text-sm font-medium">{selectedQuote?.nummer || "Geen geselecteerd"}</p>
                            </div>
                            <div className="p-4 bg-black/30 rounded-2xl border border-[var(--border)]">
                                <p className="text-[10px] font-bold uppercase text-[var(--muted)] mb-1">Deadline</p>
                                <p className="text-sm font-medium">Binnen 24 uur</p>
                            </div>
                        </div>

                        <div className="p-6 border-t border-[var(--border)]">
                            <button
                                className={`w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--brand)] px-4 py-3 text-xs font-black uppercase tracking-wider text-black hover:opacity-90 transition-opacity ${disabledClasses}`}
                                onClick={() => setQuickActionOpen(false)}
                            >
                                Concept Opslaan
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
