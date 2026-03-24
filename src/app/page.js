'use client';

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Calendar, ChefHat, Clock, FileText, TrendingUp, AlertTriangle, ArrowRight,
  Package, Users, Euro, Flame, CheckCircle2, Bell, Settings, Search, BarChart3,
  MapPin, ChevronRight, Sparkles, Shield, Star, ShoppingCart, UtensilsCrossed
} from "lucide-react";
import { useSupabase } from '@/lib/useSupabase';
import { fmt, fmtNl, safeJsonParse, calcMargeForOfferte, MAANDEN_KORT } from '@/lib/utils';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend } from 'recharts';

// ============================================
// UTILITY COMPONENTS
// ============================================
const MetallicCard = ({ children, className = "", hover = true, onClick }) => (
  <div
    onClick={onClick}
    className={`
      relative rounded-2xl overflow-hidden
      bg-gradient-to-br from-[#111113] to-[#0c0c0e]
      border border-[#1e1e22]
      ${hover ? "hover:border-[#2a2a30] hover:shadow-lg hover:shadow-black/20 transition-all duration-500 cursor-pointer" : ""}
      ${className}
    `}
  >
    <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#333338] to-transparent" />
    {children}
  </div>
);

const StatusDot = ({ status }) => {
  const colors = {
    confirmed: "bg-emerald-400",
    pending: "bg-amber-400",
    concept: "bg-zinc-500",
    optie: "bg-amber-400",
    geannuleerd: "bg-red-400",
    completed: "bg-[#3b82f6]",
    high: "bg-red-400",
    medium: "bg-amber-400",
    low: "bg-emerald-400",
  };
  return (
    <span className="relative flex h-2 w-2">
      <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-40 ${colors[status] || "bg-zinc-500"}`} />
      <span className={`relative inline-flex rounded-full h-2 w-2 ${colors[status] || "bg-zinc-500"}`} />
    </span>
  );
};

const KPICard = ({ icon, label, value, subtitle, trend, accentColor = "#8b8b8f" }) => (
  <MetallicCard className="p-6 group">
    <div className="flex items-start justify-between mb-4">
      <div
        className="p-2.5 rounded-xl"
        style={{
          background: `linear-gradient(135deg, ${accentColor}15, ${accentColor}08)`,
          border: `1px solid ${accentColor}20`,
        }}
      >
        {icon}
      </div>
      {trend && (
        <span className={`text-[11px] font-medium px-2 py-1 rounded-full ${trend.startsWith('+') ? 'text-emerald-400 bg-emerald-400/10' : 'text-red-400 bg-red-400/10'
          }`}>
          {trend}
        </span>
      )}
    </div>
    <p className="text-[11px] font-medium uppercase tracking-[0.15em] text-[#555558] mb-1.5">{label}</p>
    <p className="text-2xl font-light text-white tracking-tight">{value}</p>
    {subtitle && <p className="text-[12px] text-[#444447] mt-1">{subtitle}</p>}
  </MetallicCard>
);

// ============================================
// MAIN DASHBOARD
// ============================================
export default function DashboardPage() {
  var ev = useSupabase('events', []);
  var fac = useSupabase('facturen', []);
  var off = useSupabase('offertes', []);
  var inv = useSupabase('inventory', []);
  var sug = useSupabase('prep_suggestions', []);
  var gan = useSupabase('gangen', []);
  var ger = useSupabase('gerechten', []);

  var events = ev.data || [];
  var facturen = fac.data || [];
  var offertes = off.data || [];
  var inventory = inv.data || [];
  var suggestions = sug.data || [];
  var gangenData = gan.data || [];
  var gerechtenData = ger.data || [];

  const [currentTime, setCurrentTime] = useState(new Date());
  const [greeting, setGreeting] = useState("Welkom");
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    const hour = new Date().getHours();
    if (hour < 12) setGreeting("Goedemorgen");
    else if (hour < 18) setGreeting("Goedemiddag");
    else setGreeting("Goedenavond");
    return () => clearInterval(timer);
  }, []);

  // --- Real Data Calculations ---
  var today = new Date().toISOString().slice(0, 10);
  var jaarNu = new Date().getFullYear().toString();

  var confirmedEvents = events.filter(e => e.status === 'confirmed');
  var betaaldFacturen = facturen.filter(f => f.status === 'betaald');
  var totalRevenue = 0;
  betaaldFacturen.forEach(f => {
    (f.items || []).forEach(item => { totalRevenue += (item.qty || 0) * (item.prijs || 0); });
  });

  var openFacturen = facturen.filter(f => f.status !== 'betaald' && f.status !== 'geannuleerd');
  var openFacturenBedrag = 0;
  openFacturen.forEach(f => {
    (f.items || []).forEach(item => { openFacturenBedrag += (item.qty || 0) * (item.prijs || 0); });
  });

  var lowStockItems = inventory.filter(item => (item.current_stock || 0) < (item.min_stock || 0));
  var pendingSuggestions = suggestions.filter(s => s.status === 'pending');

  var openOffertes = offertes.filter(o => o.status === 'concept' || o.status === 'verzonden');
  var prognose = openOffertes.reduce((sum, o) => {
    return sum + (o.aantal_gasten || 0) * (o.basis_prijs_pp || 0);
  }, 0);

  function _calcMarge(o) {
    return calcMargeForOfferte(o, gerechtenData, inventory);
  }

  var lowMargeOffertes = offertes.filter(function (o) {
    if (!o.menu_selectie || (Array.isArray(o.menu_selectie) && o.menu_selectie.length === 0)) return false;
    var m = _calcMarge(o);
    return m.margePct < 40;
  }).slice(0, 3);

  // Next events (top 4 upcoming confirmed/pending/optie)
  var nextEventsList = events
    .filter(e => e.date >= today && e.status !== 'geannuleerd')
    .sort((a, b) => a.date < b.date ? -1 : 1)
    .slice(0, 4);

  var nextEventForPrep = nextEventsList.length > 0 ? nextEventsList[0] : null;

  // Prep events (offertes that are active & upcoming)
  var prepEvents = offertes
    .filter(o => (o.status === 'geaccepteerd' || o.status === 'goedgekeurd') && o.datum >= today)
    .sort((a, b) => a.datum < b.datum ? -1 : 1)
    .slice(0, 3);

  // Action Items mapping
  let liveActions = [];
  if (lowStockItems.length > 0) {
    liveActions.push({ id: 'a1', urgency: 'high', message: `${lowStockItems.length} items onder minimum voorraad`, link: '/voorraad', icon: 'fa-boxes-stacked' });
  }
  if (pendingSuggestions.length > 0) {
    liveActions.push({ id: 'a2', urgency: 'medium', message: `${pendingSuggestions.length} Pitmaster Ai suggesties`, link: '/agenda', icon: 'fa-wand-magic-sparkles' });
  }
  if (openFacturen.length > 0) {
    liveActions.push({ id: 'a3', urgency: 'medium', message: `${openFacturen.length} openstaande facturen`, link: '/facturen', icon: 'fa-file-invoice' });
  }
  lowMargeOffertes.forEach(o => {
    var m = _calcMarge(o);
    liveActions.push({ id: `o_${o.id}`, urgency: 'high', message: `Offerte ${o.client_naam} marge: ${m.margePct.toFixed(1)}%`, link: '/offertes', icon: 'fa-triangle-exclamation' });
  });

  // Recent Activity Feed Generation
  var recentFeed = [];
  events.slice(0, 5).forEach(e => recentFeed.push({ text: `Event toegevoegd: ${e.title || 'Nieuw'}`, time: e.created_at || 'recent', dot: '#10b981', ts: new Date(e.created_at || Date.now()).getTime() }));
  offertes.slice(0, 5).forEach(o => recentFeed.push({ text: `Offerte: ${o.client_naam || 'Nieuw'}`, time: o.created_at || 'recent', dot: '#3b82f6', ts: new Date(o.created_at || Date.now()).getTime() }));
  facturen.slice(0, 5).forEach(f => recentFeed.push({ text: `Factuur gegenereerd: ${f.factuur_nummer || 'Concept'}`, time: f.created_at || 'recent', dot: '#f59e0b', ts: new Date(f.created_at || Date.now()).getTime() }));
  recentFeed.sort((a, b) => b.ts - a.ts);
  var recentActivity = recentFeed.slice(0, 4);

  const formatCurrency = (amount) =>
    new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(amount);

  const formatDate = (dateStr) => {
    if (!dateStr) return { day: '?', month: '?', year: '?' };
    const parts = dateStr.includes('-') && dateStr.split('-')[0].length === 4 ? dateStr.split('-').reverse() : dateStr.split('-');
    const day = parts[0];
    const monthIndex = parseInt(parts[1]) - 1;
    const year = parts[2] || parts[0]; // depends on format
    const months = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
    return { day, month: months[monthIndex >= 0 && monthIndex < 12 ? monthIndex : 0], year };
  };

  if (!isMounted) {
    return (
      <div className="min-h-screen bg-[#121215] flex items-center justify-center text-white/50">
        <Flame className="w-8 h-8 text-[#c4a35a] animate-pulse" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#121215] text-white selection:bg-[#c4a35a]/30">
      {/* ========== HEADER ========== */}
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-[#121215]/80 border-b border-[#151518]">
        <div className="max-w-[1400px] mx-auto px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#222228] to-[#111115] flex items-center justify-center border border-[#2a2a30]">
                <Flame className="w-5 h-5 text-[#c4a35a]" />
              </div>
              <div className="absolute inset-0 rounded-full bg-[#c4a35a]/5 blur-md" />
            </div>
            <div>
              <h1 className="text-[15px] font-semibold tracking-[0.08em] text-white font-['Outfit']">BBQ ARCHITECT</h1>
              <p className="text-[10px] tracking-[0.25em] text-[#555558] uppercase">Hop & Bites • Ambacht</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button className="relative p-2.5 rounded-xl bg-[#111115] border border-[#1e1e22] hover:border-[#2a2a30] transition-colors">
              <Bell className="w-4 h-4 text-[#555558]" />
              {liveActions.some((a) => a.urgency === "high") && (
                <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-[#121215]" />
              )}
            </button>
            <div className="ml-2 text-right">
              <p className="text-[11px] text-[#555558] font-medium capitalize">
                {isMounted ? currentTime.toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long" }) : "Laden..."}
              </p>
              <p className="text-[13px] font-light text-[#888] tabular-nums">
                {isMounted ? currentTime.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" }) : "--:--"}
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* ========== MAIN CONTENT ========== */}
      <main className="max-w-[1400px] mx-auto px-8 py-8 font-['Outfit']">
        {/* Greeting Section */}
        <div className="mb-10">
          <h2 className="text-3xl font-extralight text-white tracking-tight mb-1">
            {greeting}, <span className="font-normal">Pitmaster</span>
          </h2>
          <p className="text-[14px] text-[#555558] font-light">Command Center — alles onder controle.</p>
        </div>

        {/* ========== ACTION ALERTS ========== */}
        {liveActions.some((a) => a.urgency === "high") && (
          <div className="mb-8">
            <div className="flex items-start gap-4 px-5 py-4 rounded-xl bg-red-500/[0.04] border border-red-500/[0.12]">
              <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <div className="flex-1 space-y-2">
                {liveActions.filter((a) => a.urgency === "high").map((action) => (
                  <Link key={action.id} href={action.link} className="group block w-full text-[13.5px] text-red-400 hover:text-red-300 font-medium tracking-tight">
                    <span className="flex items-center gap-2">
                      <ChevronRight className="w-3.5 h-3.5 opacity-60 group-hover:translate-x-1 transition-transform" />
                      {action.message}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ========== KPI GRID ========== */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          <KPICard
            icon={<Calendar className="w-4 h-4 text-[#3b82f6]" />}
            label="Bevestigde Events"
            value={confirmedEvents.length.toString()}
            subtitle={`totaal geregistreerd dit jaar`}
            accentColor="#3b82f6"
            trend="+12%"
          />
          <KPICard
            icon={<Euro className="w-4 h-4 text-emerald-400" />}
            label="Gerealiseerde Omzet"
            value={formatCurrency(totalRevenue)}
            subtitle={`${betaaldFacturen.length} betaalde facturen`}
            accentColor="#34d399"
            trend="+8.2%"
          />
          <KPICard
            icon={<FileText className="w-4 h-4 text-[#8b8bf0]" />}
            label="Open Facturen & Prognose"
            value={formatCurrency(prognose + openFacturenBedrag)}
            subtitle={`€${openFacturenBedrag} facturen / €${prognose} open offertes`}
            accentColor="#8b8bf0"
            trend="-3%"
          />
          <KPICard
            icon={<Users className="w-4 h-4 text-sky-400" />}
            label="Totaal Gasten"
            value={events.reduce((sum, e) => sum + (e.guests || 0), 0).toString()}
            subtitle="over alle geregistreerde events"
            accentColor="#38bdf8"
            trend="+24%"
          />
        </div>

        {/* ========== MAIN GRID (2 columns) ========== */}
        <div className="grid grid-cols-12 gap-6 pb-20">
          {/* ---- LEFT COLUMN (8/12) ---- */}
          <div className="col-span-8 space-y-6">

            {/* VOLGENDE EVENTS */}
            <MetallicCard className="p-6" hover={false}>
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-[#c4a35a]/10 border border-[#c4a35a]/20">
                    <Calendar className="w-4 h-4 text-[#c4a35a]" />
                  </div>
                  <div>
                    <h3 className="text-[15px] font-medium text-white tracking-tight">Aankomende Events</h3>
                    <p className="text-[11px] text-[#444447]">Geplande reserveringen en opties</p>
                  </div>
                </div>
                <Link href="/events" className="flex items-center gap-1.5 text-[11px] font-medium text-[#555558] hover:text-white transition-colors uppercase tracking-[0.1em]">
                  Alle events <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>

              {nextEventsList.length === 0 ? (
                <p className="text-center text-[13px] text-[#444447] py-6">Geen aankomende events.</p>
              ) : (
                <div className="space-y-2">
                  {nextEventsList.map((event) => {
                    const date = formatDate(event.date);
                    return (
                      <Link key={event.id} href={`/agenda`} className="group flex items-center gap-5 p-4 rounded-xl bg-[#0e0e10] hover:bg-[#121216] border border-transparent hover:border-[#1e1e22] transition-all duration-300">
                        <div className="flex-shrink-0 w-14 text-center">
                          <p className="text-[22px] font-light text-white leading-none">{date.day}</p>
                          <p className="text-[10px] uppercase tracking-[0.2em] text-[#555558] mt-1">{date.month}</p>
                        </div>
                        <div className="w-px h-10 bg-[#1e1e22]" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <StatusDot status={event.status} />
                            <p className="text-[13.5px] font-medium text-white truncate">{event.name}</p>
                          </div>
                          <div className="flex items-center gap-4 text-[11.5px] text-[#66666b]">
                            <span className="flex items-center gap-1.5"><Users className="w-3 h-3" /> {event.guests}p</span>
                            <span className="flex items-center gap-1.5"><MapPin className="w-3 h-3" /> {event.location || 'Onbekend'}</span>
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-[15px] font-light text-white tabular-nums">{formatCurrency((event.guests || 0) * (event.ppp || 0))}</p>
                          <p className="text-[10px] uppercase tracking-[0.15em] text-[#555558] mt-0.5">{event.status === 'confirmed' ? 'Bevestigd' : 'Pending'}</p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-[#333] group-hover:text-[#666] transition-colors flex-shrink-0 ml-1" />
                      </Link>
                    );
                  })}
                </div>
              )}
            </MetallicCard>

            {/* DAGPLANNING & PREP */}
            <MetallicCard className="p-6" hover={false}>
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-emerald-400/10 border border-emerald-400/20">
                    <ChefHat className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div>
                    <h3 className="text-[15px] font-medium text-white tracking-tight">Actuele Productielijst (Prep)</h3>
                    <p className="text-[11px] text-[#444447]">{prepEvents.length > 0 ? `${prepEvents[0].client_naam} • ${prepEvents[0].datum}` : "Geen geaccepteerde/goedgekeurde offertes nabij."}</p>
                  </div>
                </div>
                {prepEvents.length > 0 && <span className="text-[11px] font-medium text-emerald-400 bg-emerald-400/10 px-3 py-1 rounded-full border border-emerald-400/20">{prepEvents[0].aantal_gasten}p</span>}
              </div>

              {prepEvents.length > 0 ? (
                <div className="space-y-4">
                  {prepEvents.slice(0, 2).map((offerte, oIndex) => {
                    var sel = safeJsonParse(offerte.menu_selectie, {});
                    // Flatten menu items for the mockPrep look
                    var prepItems = [];
                    gangenData.sort((a, b) => (a.volgorde || 0) - (b.volgorde || 0)).forEach(g => {
                      var dishes = sel[g.slug] || [];
                      dishes.forEach(d => {
                        var dishName = typeof d === 'string' ? d : (d.naam || d.gerecht_naam || 'Onbekend gerecht');
                        prepItems.push({ dish: dishName, gang: g.naam });
                      });
                    });

                    return prepItems.length > 0 ? (
                      <div key={offerte.id} className="space-y-2">
                        {oIndex > 0 && <div className="h-px w-full bg-[#151518] my-4" />}
                        <div className="mb-2 text-[12px] font-semibold text-[#8b8b8f] tracking-wide">{offerte.client_naam}</div>
                        {prepItems.map((item, idx) => (
                          <div key={idx} className="flex items-center gap-4 p-3.5 rounded-xl bg-[#0e0e10] border border-[#151518]">
                            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-[#1a1a1e]">
                              <Clock className="w-4 h-4 text-[#444447]" />
                            </div>
                            <div className="flex-1">
                              <p className="text-[13px] text-white font-medium">{item.dish}</p>
                              <p className="text-[11px] text-[#444447]">{item.gang}</p>
                            </div>
                            <span className="text-[10px] uppercase tracking-[0.15em] px-2.5 py-1 rounded-full text-[#555558] bg-[#1a1a1e] border border-[#222]">
                              Prep To Do
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : null;
                  })}
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-[13px] text-[#444447]">Geen actuele prep voor vandaag</p>
                </div>
              )}
            </MetallicCard>

          </div>

          {/* ---- RIGHT COLUMN (4/12) ---- */}
          <div className="col-span-4 space-y-6">

            {/* QUICK ACTIONS */}
            <MetallicCard className="p-6" hover={false}>
              <h3 className="text-[11px] font-medium uppercase tracking-[0.2em] text-[#555558] mb-4">Snelle Acties</h3>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { icon: <FileText className="w-4 h-4" />, label: "Offertes", href: "/offertes" },
                  { icon: <Calendar className="w-4 h-4" />, label: "Agenda", href: "/agenda" },
                  { icon: <ShoppingCart className="w-4 h-4" />, label: "Inkoop", href: "/inkoop" },
                  { icon: <UtensilsCrossed className="w-4 h-4" />, label: "Menu Engineering", href: "/menu-engineering" },
                ].map((action) => (
                  <Link key={action.label} href={action.href} className="flex flex-col items-center gap-2.5 p-4 rounded-xl bg-[#0e0e10] border border-[#151518] hover:border-[#3b82f6]/30 hover:bg-[#121216] transition-all duration-300 group">
                    <div className="text-[#444447] group-hover:text-[#3b82f6] transition-colors">{action.icon}</div>
                    <span className="text-[10px] font-medium uppercase tracking-[0.1em] text-[#444447] group-hover:text-[#888] transition-colors text-center">{action.label}</span>
                  </Link>
                ))}
              </div>
            </MetallicCard>

            {/* ACTIES VEREIST */}
            <MetallicCard className="p-6" hover={false}>
              <div className="flex items-center gap-3 mb-5">
                <div className="p-2 rounded-xl bg-amber-400/10 border border-amber-400/20">
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                </div>
                <h3 className="text-[15px] font-medium text-white tracking-tight">Meldingen Center</h3>
              </div>
              {liveActions.length > 0 ? (
                <div className="space-y-2">
                  {liveActions.map((action, i) => (
                    <Link key={i} href={action.link} className="flex items-center gap-3 p-3 rounded-xl bg-[#0e0e10] hover:bg-[#121216] border border-transparent hover:border-[#1e1e22] transition-all duration-300 group">
                      <StatusDot status={action.urgency} />
                      <span className="text-[12.5px] font-medium text-[#888] group-hover:text-white transition-colors flex-1 line-clamp-1">{action.message}</span>
                      <ChevronRight className="w-3.5 h-3.5 text-[#333] group-hover:text-[#666] transition-colors" />
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="text-[13px] text-[#444447]">Geen lopende acties of alerts ontdekt.</div>
              )}
            </MetallicCard>

            {/* RECENTE ACTIVITEIT */}
            <MetallicCard className="p-6" hover={false}>
              <div className="flex flex-col mb-5">
                <h3 className="text-[15px] font-medium text-white tracking-tight leading-none">Recente activiteit</h3>
                <p className="text-[10px] text-[#444447] mt-1.5 uppercase tracking-wider">Laatste updates van vandaag</p>
              </div>
              <div className="space-y-4">
                {recentActivity.map((item, i) => (
                  <div key={i} className="flex items-center justify-between pb-3 last:pb-0 last:border-0 border-b border-[#151518]/50">
                    <div className="flex items-center gap-3">
                      <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: item.dot }} />
                      <span className="text-[12.5px] font-medium text-[#888]">{item.text}</span>
                    </div>
                    <span className="text-[10px] font-medium text-[#444447] whitespace-nowrap ml-4">
                      {item.time === 'recent' ? 'nu' : new Date(item.ts).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                ))}
                {recentActivity.length === 0 && (
                  <p className="text-[13px] text-[#444447]">Nog geen activiteit geregistreerd.</p>
                )}
              </div>
            </MetallicCard>

            {/* OMZET BREAKDOWN */}
            <MetallicCard className="p-6" hover={false}>
              <h3 className="text-[11px] font-medium uppercase tracking-[0.2em] text-[#555558] mb-4">Pipeline Top Offertes</h3>
              {openOffertes.length > 0 ? (
                <>
                  <div className="space-y-3">
                    {openOffertes.sort((a, b) => ((b.aantal_gasten || 0) * (b.basis_prijs_pp || 0)) - ((a.aantal_gasten || 0) * (a.basis_prijs_pp || 0))).slice(0, 4).map((off) => {
                      var eventTotal = (off.aantal_gasten || 0) * (off.basis_prijs_pp || 0);
                      var percentage = prognose > 0 ? (eventTotal / prognose) * 100 : 0;
                      return (
                        <div key={off.id}>
                          <div className="flex justify-between items-center mb-1.5">
                            <span className="text-[11px] text-[#888] truncate max-w-[140px] font-medium">{off.client_naam || off.nummer}</span>
                            <span className="text-[11px] text-[#888] tabular-nums">{formatCurrency(eventTotal)}</span>
                          </div>
                          <div className="h-1 bg-[#151518] rounded-full overflow-hidden">
                            <div className="h-full rounded-full bg-gradient-to-r from-[#c4a35a] to-[#d4b36a] transition-all duration-700" style={{ width: `${percentage}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-4 pt-4 border-t border-[#151518] flex justify-between items-center">
                    <span className="text-[10px] uppercase tracking-[0.15em] text-[#555558]">Totaal Prognose</span>
                    <span className="text-[15px] font-medium text-white tabular-nums">{formatCurrency(prognose)}</span>
                  </div>
                </>
              ) : (
                <div className="text-[13px] text-[#444447]">Geen actuele pijplijn of concept offertes.</div>
              )}
            </MetallicCard>

            {/* QUOTE */}
            <div className="relative px-6 py-5">
              <div className="absolute left-6 top-0 bottom-0 w-px bg-gradient-to-b from-transparent via-[#c4a35a]/30 to-transparent" />
              <blockquote className="pl-5">
                <p className="text-[12px] text-[#555558] italic leading-relaxed font-light">
                  &ldquo;A perfect dish is no accident. It’s the seamless execution of logistics, craft, and fire.&rdquo;
                </p>
                <footer className="mt-2 text-[10px] uppercase tracking-[0.2em] text-[#333338]">— Mathijs Berkhout</footer>
              </blockquote>
            </div>

          </div>
        </div>
      </main>

      {/* Remove global layout conflicts from globals.css just for this page if needed via classes */}
    </div>
  );
}
