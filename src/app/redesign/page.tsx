'use client';

import { useState, useEffect, useRef, useCallback, Fragment } from 'react';
import type { ReactNode, CSSProperties, JSX } from 'react';
import {
  LayoutDashboard, PartyPopper, FileText, Receipt, HeartHandshake,
  ChefHat, ClipboardList, Package, ShieldCheck, Euro, BarChart3,
  ChevronRight, Search, Bell, Filter, Plus, Download, Send, Check,
  CircleDot, Sparkles, TrendingUp, Target, Users, Calendar,
  MessageCircle, Copy, GitBranch, Flame, Leaf, Eye, Save, Activity,
  MoreHorizontal, Droplets, Truck, AlertTriangle, AlertOctagon,
  Thermometer, Share2, CheckCheck, Printer, Navigation, MapPin,
  Mail, Phone, Edit3, UtensilsCrossed, Layers, ExternalLink, X,
  XCircle, CheckCircle2,
} from 'lucide-react';

/* ═══════════════════════════════════════════════════════════════════
   SHARED ATOMS
   ═══════════════════════════════════════════════════════════════════ */

const BrandMark = ({ size = 22 }: { size?: number }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192" width={size} height={size}>
    <rect width="192" height="192" rx="24" fill="#121215" />
    <path d="M44 100 C44 60, 148 60, 148 100" fill="none" stroke="#c4a35a" strokeWidth="6" strokeLinecap="round" />
    <line x1="52" y1="100" x2="140" y2="100" stroke="#c4a35a" strokeWidth="4" strokeLinecap="round" />
    <line x1="60" y1="88" x2="60" y2="112" stroke="#c4a35a" strokeWidth="3" strokeLinecap="round" />
    <line x1="80" y1="82" x2="80" y2="112" stroke="#c4a35a" strokeWidth="3" strokeLinecap="round" />
    <line x1="96" y1="80" x2="96" y2="112" stroke="#c4a35a" strokeWidth="3" strokeLinecap="round" />
    <line x1="112" y1="82" x2="112" y2="112" stroke="#c4a35a" strokeWidth="3" strokeLinecap="round" />
    <line x1="132" y1="88" x2="132" y2="112" stroke="#c4a35a" strokeWidth="3" strokeLinecap="round" />
    <line x1="64" y1="112" x2="56" y2="144" stroke="#c4a35a" strokeWidth="5" strokeLinecap="round" />
    <line x1="128" y1="112" x2="136" y2="144" stroke="#c4a35a" strokeWidth="5" strokeLinecap="round" />
    <path d="M78 56 C78 48, 84 48, 84 40" fill="none" stroke="rgba(196,163,90,0.5)" strokeWidth="3" strokeLinecap="round" />
    <path d="M96 52 C96 44, 102 44, 102 36" fill="none" stroke="rgba(196,163,90,0.5)" strokeWidth="3" strokeLinecap="round" />
    <path d="M114 56 C114 48, 120 48, 120 40" fill="none" stroke="rgba(196,163,90,0.5)" strokeWidth="3" strokeLinecap="round" />
  </svg>
);

type PillVariant = 'draft' | 'ok' | 'optie' | 'send' | 'danger';
const Pill = ({ v = 'draft', children, icon }: { v?: PillVariant; children: ReactNode; icon?: ReactNode }) => (
  <span className={`pill p-${v}`}>{icon}{children}</span>
);

type BtnVariant = 'primary' | 'ghost';
const Btn = ({
  v = 'ghost', children, icon, size, onClick, style,
}: {
  v?: BtnVariant; children?: ReactNode; icon?: ReactNode; size?: 'sm';
  onClick?: () => void; style?: CSSProperties;
}) => (
  <button className={`btn btn-${v} ${size === 'sm' ? 'btn-sm' : ''}`} onClick={onClick} style={style}>
    {icon}{children}
  </button>
);

/* ═══════════════════════════════════════════════════════════════════
   CHROME — Sidebar + TopBar
   ═══════════════════════════════════════════════════════════════════ */

const Sidebar = ({ active }: { active: string }) => {
  const nav = [
    { s: 'Overzicht', items: [{ i: 'dashboard', l: 'Dashboard', Ic: LayoutDashboard }] },
    { s: 'Events & Sales', items: [
      { i: 'events', l: 'Events', Ic: PartyPopper },
      { i: 'quotes', l: 'Offertes', Ic: FileText, b: 3 },
      { i: 'invoices', l: 'Facturen', Ic: Receipt },
      { i: 'customers', l: 'Klanten', Ic: HeartHandshake },
    ] },
    { s: 'Keuken & Operatie', items: [
      { i: 'menus', l: 'Menu & Recepten', Ic: ChefHat },
      { i: 'prep', l: 'Prep Schema', Ic: ClipboardList },
      { i: 'stock', l: 'Voorraad', Ic: Package },
      { i: 'haccp', l: 'HACCP', Ic: ShieldCheck },
    ] },
    { s: 'Financieel', items: [
      { i: 'cogs', l: 'Inkoop & COGS', Ic: Euro },
      { i: 'reports', l: 'Rapportage', Ic: BarChart3 },
    ] },
  ] as const;
  return (
    <aside className="sidebar">
      <div className="sb-brand">
        <div style={{ width: 32, height: 32, borderRadius: 9, background: 'linear-gradient(180deg,#1a1a1e,#0e0e10)', border: '1px solid rgba(196,163,90,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <BrandMark size={20} />
        </div>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, letterSpacing: '.08em', fontSize: 12 }}>BBQ ARCHITECT</div>
          <div style={{ fontSize: 9, letterSpacing: '.2em', color: 'var(--muted)', textTransform: 'uppercase' }}>Hop &amp; Bites · Ambacht</div>
        </div>
      </div>
      {nav.map(g => (
        <div key={g.s}>
          <div className="sb-sec">{g.s}</div>
          {g.items.map(it => {
            const Ic = it.Ic;
            const badge = 'b' in it ? (it as { b?: number }).b : undefined;
            return (
              <div key={it.i} className={`nav-item ${active === it.i ? 'active' : ''}`}>
                <Ic size={15} />
                <span>{it.l}</span>
                {badge && <span className="nav-badge">{badge}</span>}
              </div>
            );
          })}
        </div>
      ))}
    </aside>
  );
};

const TopBar = ({ crumbs = [] }: { crumbs?: string[] }) => (
  <header className="topbar">
    <div className="breadcrumb">
      {crumbs.map((c, i) => (
        <Fragment key={i}>
          {i > 0 && <ChevronRight size={11} />}
          {i === crumbs.length - 1 ? <strong>{c}</strong> : <span>{c}</span>}
        </Fragment>
      ))}
    </div>
    <div className="top-right">
      <button className="icon-btn"><Search size={15} /></button>
      <button className="icon-btn"><Bell size={15} /></button>
      <div style={{ fontSize: 11, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>09:42</div>
      <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(135deg, #c4a35a, #9e781c)', color: '#0a0a0c', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 11 }}>MB</div>
    </div>
  </header>
);

/* ═══════════════════════════════════════════════════════════════════
   SCREEN 1 — EVENTS
   ═══════════════════════════════════════════════════════════════════ */

const EventsBefore = () => (
  <main className="main">
    <div className="page-head">
      <div>
        <div className="page-eyebrow">18 events · 7 deze week</div>
        <h1 className="page-title">Events</h1>
      </div>
      <div className="hstack">
        <Btn v="ghost" icon={<Filter size={14} />}>Filters</Btn>
        <Btn v="primary" icon={<Plus size={14} />}>Nieuw event</Btn>
      </div>
    </div>
    <div className="events-before-filters">
      <button className="ev-chip active">Alle · 18</button>
      <button className="ev-chip">Optie · 5</button>
      <button className="ev-chip">Bevestigd · 11</button>
      <button className="ev-chip">Afgerond · 2</button>
    </div>
    <div className="vstack" style={{ gap: 8 }}>
      {[
        { d: '18', m: 'apr', t: 'Buurtfeest Scheveningen', s: <Pill v="ok">Bevestigd</Pill>, meta: '65 gasten · 18:30 · Hot Smoker · € 2.340 · marge 71%' },
        { d: '20', m: 'apr', t: 'Bruiloft Van Dijk', s: <Pill v="optie">Optie</Pill>, meta: '120 gasten · 17:00 · Full service · € 5.880 · marge 62%' },
        { d: '22', m: 'apr', t: 'Teamuitje ING Amsterdam', s: <Pill v="send">Verzonden</Pill>, meta: '40 gasten · 12:00 · Lunch BBQ · € 1.620' },
        { d: '24', m: 'apr', t: 'Opening Brasserie Noord', s: <Pill v="optie">Optie</Pill>, meta: '80 gasten · 16:00 · Low & slow · € 3.440' },
        { d: '27', m: 'apr', t: 'Verjaardag De Vries', s: <Pill v="ok">Bevestigd</Pill>, meta: '30 gasten · 19:00 · € 1.245 · marge 74%' },
        { d: '02', m: 'mei', t: 'Bedrijfsfeest KPN', s: <Pill v="ok">Bevestigd</Pill>, meta: '250 gasten · 15:00 · Festival setup · € 11.200' },
        { d: '05', m: 'mei', t: 'Huwelijksfeest Bakker–Visser', s: <Pill v="send">Verzonden</Pill>, meta: '90 gasten · 18:00 · Smoker + sides · € 4.680' },
        { d: '11', m: 'mei', t: 'Burendag Utrecht Oost', s: <Pill v="optie">Optie</Pill>, meta: '45 gasten · 14:00 · € 1.890' },
      ].map((e, i) => (
        <div key={i} className="metal clickable">
          <div className="metal-body" style={{ display: 'flex', gap: 14, alignItems: 'center', padding: 14 }}>
            <div className="date-chip"><div className="date-chip-mon">{e.m}</div><div className="date-chip-day">{e.d}</div></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                <span style={{ fontSize: 14, fontWeight: 600 }}>{e.t}</span>
                {e.s}
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>{e.meta}</div>
            </div>
            <ChevronRight size={15} color="var(--muted)" />
          </div>
        </div>
      ))}
    </div>
  </main>
);

const BookingPulse = () => {
  const data = [3, 5, 4, 6, 8, 7, 9, 11, 10, 12, 14, 13];
  const max = Math.max(...data);
  const w = 300, h = 110, pad = 4;
  const step = (w - pad * 2) / (data.length - 1);
  const pts = data.map((v, i) => [pad + i * step, h - pad - (v / max) * (h - pad * 2)] as const);
  const path = pts.map((p, i) => (i === 0 ? 'M' : 'L') + p[0] + ',' + p[1]).join(' ');
  const areaPath = path + ` L ${pad + (data.length - 1) * step},${h - pad} L ${pad},${h - pad} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" width="100%" height="100%">
      <defs>
        <linearGradient id="pulseGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFBF00" stopOpacity=".35" />
          <stop offset="100%" stopColor="#FFBF00" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill="url(#pulseGrad)" />
      <path d={path} fill="none" stroke="#c4a35a" strokeWidth="1.5" />
      {pts.map((p, i) => (
        <circle key={i} cx={p[0]} cy={p[1]} r={i === pts.length - 1 ? 3.5 : 0} fill="#FFBF00" />
      ))}
    </svg>
  );
};

type TlTone = 'confirmed' | 'option' | 'urgent';
type Tone = 'ok' | 'warn' | 'bad';
const TlRow = ({
  date, dow, mo, title, guests, time, kind, amount, margin, mTone, ready, rTone, status, tone,
}: {
  date: string; dow: string; mo: string; title: string; guests: string; time: string;
  kind: string; amount: string; margin: string; mTone: Tone; ready: number; rTone: Tone;
  status: ReactNode; tone: TlTone;
}) => (
  <div className={`tl-row ${tone}`}>
    <div className="tl-card">
      <div className="tl-date">
        <div className="dow">{dow}</div>
        <div className="day">{date}</div>
        <div className="mo">{mo}</div>
      </div>
      <div className="tl-body">
        <div className="title-row">
          <h4>{title}</h4>
          {status}
        </div>
        <div className="meta-row">
          <span><Users size={11} style={{ marginRight: 4, verticalAlign: 'middle' }} />{guests} gasten</span>
          <span className="dot"></span>
          <span>{time}</span>
          <span className="dot"></span>
          <span>{kind}</span>
        </div>
        <div className="ready-bar">
          <span className="lbl">Prep</span>
          <div className="track"><div className={`fill ${rTone}`} style={{ width: ready + '%' }} /></div>
          <span className="lbl" style={{ color: rTone === 'bad' ? 'var(--red)' : rTone === 'warn' ? 'var(--amber)' : 'var(--green)' }}>{ready}%</span>
        </div>
      </div>
      <div className="tl-meta">
        <div className="amount">{amount}</div>
        <div className={`margin ${mTone}`}>marge {margin}%</div>
      </div>
    </div>
  </div>
);

const EventsAfter = () => (
  <main className="main">
    <div className="page-head">
      <div>
        <div className="page-eyebrow" style={{ color: 'var(--brand-gold)' }}>Di 18 apr · week 16 · BBQ-seizoen begint</div>
        <h1 className="page-title">Events</h1>
      </div>
      <div className="hstack">
        <div style={{ display: 'flex', background: 'var(--card-solid)', border: '1px solid var(--border)', borderRadius: 9, padding: 3, gap: 2 }}>
          {['Tijdlijn', 'Kalender', 'Kanban'].map((v, i) => (
            <button key={v} style={{ padding: '6px 12px', borderRadius: 7, fontSize: 11.5, fontWeight: 600, background: i === 0 ? 'var(--brand)' : 'transparent', color: i === 0 ? '#000' : 'var(--muted)', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>{v}</button>
          ))}
        </div>
        <Btn v="ghost" icon={<Filter size={14} />}>Filters</Btn>
        <Btn v="primary" icon={<Plus size={14} />}>Nieuw event</Btn>
      </div>
    </div>

    <div className="ev-hero">
      <div className="ev-next-card">
        <div className="ev-next-eyebrow"><span className="dot"></span>Eerstvolgend · vandaag 18:30</div>
        <h2 className="ev-next-title">Buurtfeest Scheveningen</h2>
        <div className="ev-next-meta">65 gasten · Strandpaviljoen De Fuut · Hot Smoker + pulled pork setup</div>
        <div className="ev-next-stats">
          <div className="ev-next-stat"><div className="v">65</div><div className="l">Gasten</div></div>
          <div className="ev-next-stat"><div className="v">€ 2.340</div><div className="l">Omzet</div></div>
          <div className="ev-next-stat"><div className="v" style={{ color: 'var(--green)' }}>71%</div><div className="l">Marge</div></div>
          <div className="ev-next-stat"><div className="v" style={{ color: 'var(--brand-gold)' }}>04:12</div><div className="l">Tot show-time</div></div>
        </div>
        <div className="ev-next-checklist">
          <div className="ev-check-label">T-4u checklist</div>
          <div className="ev-check-row done"><div className="box"><Check size={12} /></div><span className="txt">Smoker aangestoken · 110°C</span><span className="meta">14:20</span></div>
          <div className="ev-check-row done"><div className="box"><Check size={12} /></div><span className="txt">Pulled pork bind-over afgerond</span><span className="meta">14:45</span></div>
          <div className="ev-check-row"><div className="box"></div><span>Sides inladen (coleslaw × 4, cornbread × 6)</span><span className="meta">15:30</span></div>
          <div className="ev-check-row"><div className="box"></div><span>Vertrek naar locatie</span><span className="meta">16:45</span></div>
        </div>
      </div>

      <div className="ev-pulse-card">
        <div className="ev-pulse-title">Booking pulse · 12 weken</div>
        <div className="ev-pulse-sub">Bevestigde events per week — seizoen pikt op</div>
        <div className="ev-pulse-graph"><BookingPulse /></div>
        <div className="ev-pulse-stats">
          <div className="ev-pulse-stat"><div className="v" style={{ color: 'var(--green)' }}>+38%</div><div className="l">vs vorig jaar</div></div>
          <div className="ev-pulse-stat"><div className="v">€ 42.1k</div><div className="l">Pijplijn mei</div></div>
          <div className="ev-pulse-stat"><div className="v">68%</div><div className="l">Win rate</div></div>
        </div>
      </div>
    </div>

    <div className="tl-section">
      <div className="tl-head">
        <h3>Deze week</h3>
        <span className="count">4 events</span>
        <span className="revenue">omzet <strong>€ 9.200</strong> · gem. marge <strong>68%</strong></span>
      </div>
      <div className="tl-rail">
        <TlRow tone="confirmed" dow="Di" date="18" mo="apr" title="Buurtfeest Scheveningen" status={<Pill v="ok" icon={<Check size={10} />}>Bevestigd</Pill>}
          guests="65" time="18:30" kind="Hot Smoker" amount="€ 2.340" margin="71" mTone="ok" ready={85} rTone="ok" />
        <TlRow tone="option" dow="Do" date="20" mo="apr" title="Bruiloft Van Dijk" status={<Pill v="optie" icon={<CircleDot size={10} />}>Optie · vervalt 22 apr</Pill>}
          guests="120" time="17:00" kind="Full service" amount="€ 5.880" margin="62" mTone="warn" ready={45} rTone="warn" />
        <TlRow tone="urgent" dow="Za" date="22" mo="apr" title="Teamuitje ING Amsterdam" status={<Pill v="send" icon={<Send size={10} />}>Verzonden</Pill>}
          guests="40" time="12:00" kind="Lunch BBQ" amount="€ 1.620" margin="58" mTone="warn" ready={12} rTone="bad" />
      </div>
    </div>

    <div className="tl-section">
      <div className="tl-head">
        <h3>Volgende week</h3>
        <span className="count">3 events</span>
        <span className="revenue">omzet <strong>€ 5.930</strong></span>
      </div>
      <div className="tl-rail">
        <TlRow tone="option" dow="Ma" date="24" mo="apr" title="Opening Brasserie Noord" status={<Pill v="optie">Optie</Pill>}
          guests="80" time="16:00" kind="Low & slow" amount="€ 3.440" margin="65" mTone="ok" ready={0} rTone="bad" />
        <TlRow tone="confirmed" dow="Do" date="27" mo="apr" title="Verjaardag De Vries" status={<Pill v="ok">Bevestigd</Pill>}
          guests="30" time="19:00" kind="Low & slow" amount="€ 1.245" margin="74" mTone="ok" ready={30} rTone="warn" />
      </div>
    </div>

    <div className="tl-section">
      <div className="tl-head">
        <h3>Mei · seizoensopening</h3>
        <span className="count">3 events</span>
        <span className="revenue">omzet <strong>€ 17.770</strong></span>
      </div>
      <div className="tl-rail">
        <TlRow tone="confirmed" dow="Za" date="02" mo="mei" title="Bedrijfsfeest KPN" status={<Pill v="ok">Bevestigd</Pill>}
          guests="250" time="15:00" kind="Festival setup" amount="€ 11.200" margin="69" mTone="ok" ready={8} rTone="bad" />
        <TlRow tone="confirmed" dow="Vr" date="05" mo="mei" title="Huwelijksfeest Bakker–Visser" status={<Pill v="send">Verzonden</Pill>}
          guests="90" time="18:00" kind="Smoker + sides" amount="€ 4.680" margin="64" mTone="ok" ready={0} rTone="bad" />
        <TlRow tone="option" dow="Do" date="11" mo="mei" title="Burendag Utrecht Oost" status={<Pill v="optie">Optie</Pill>}
          guests="45" time="14:00" kind="Classic BBQ" amount="€ 1.890" margin="66" mTone="ok" ready={0} rTone="bad" />
      </div>
    </div>
  </main>
);

/* ═══════════════════════════════════════════════════════════════════
   SCREEN 2 — QUOTE DETAIL
   ═══════════════════════════════════════════════════════════════════ */

const fmtEur = (n: number) => '€ ' + n.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtEur0 = (n: number) => '€ ' + n.toLocaleString('nl-NL', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

const QuoteBefore = () => {
  const lines = [
    { qty: 120, name: 'Pulled pork (low & slow 14u)', unit: 8.50, cost: 3.20 },
    { qty: 120, name: 'Brisket, smoked 12u', unit: 12.00, cost: 5.40 },
    { qty: 120, name: 'Coleslaw huisgemaakt', unit: 2.80, cost: 0.90 },
    { qty: 120, name: 'Cornbread, boter van thuiskarn', unit: 1.90, cost: 0.60 },
    { qty: 120, name: 'BBQ saus (3 soorten)', unit: 1.20, cost: 0.35 },
    { qty: 4, name: 'Pitmaster + crew (6u)', unit: 180.00, cost: 95.00 },
  ];
  const total = lines.reduce((s, l) => s + l.qty * l.unit, 0);
  const totalCost = lines.reduce((s, l) => s + l.qty * l.cost, 0);
  const margin = ((total - totalCost) / total * 100).toFixed(1);
  return (
    <main className="main" style={{ maxWidth: 1000 }}>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">Offerte · OFF-2026-0142</div>
          <h1 className="page-title">Bruiloft Van Dijk</h1>
          <div className="hstack" style={{ marginTop: 8 }}>
            <Pill v="optie" icon={<CircleDot size={10} />}>Optie · wacht op reactie</Pill>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>Verstuurd 15 apr · vervalt 22 apr</span>
          </div>
        </div>
        <div className="hstack">
          <Btn v="ghost" icon={<Download size={14} />}>PDF</Btn>
          <Btn v="ghost" icon={<Send size={14} />}>Follow-up</Btn>
          <Btn v="primary" icon={<Check size={14} />}>Markeer geaccepteerd</Btn>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 20 }}>
        <div className="metal"><div className="metal-body">
          <div className="eyebrow" style={{ marginBottom: 6 }}>Totaal incl. btw</div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 30, fontVariantNumeric: 'tabular-nums' }}>{fmtEur(total * 1.09)}</div>
        </div></div>
        <div className="metal"><div className="metal-body">
          <div className="eyebrow" style={{ marginBottom: 6 }}>Marge</div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 30, fontVariantNumeric: 'tabular-nums', color: 'var(--green)' }}>{margin}%</div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>Brutomarge {fmtEur(total - totalCost)}</div>
        </div></div>
        <div className="metal"><div className="metal-body">
          <div className="eyebrow" style={{ marginBottom: 6 }}>Gasten</div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 30 }}>120</div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>17:00 · 5 mei</div>
        </div></div>
      </div>
      <div className="metal">
        <div className="metal-head">
          <span style={{ fontSize: 14, fontWeight: 600 }}>Regels</span>
          <Btn size="sm" v="ghost" icon={<Plus size={14} />}>Regel toevoegen</Btn>
        </div>
        <table className="qb-table">
          <thead>
            <tr><th>Aantal</th><th className="left">Omschrijving</th><th>Stuk</th><th>Kost</th><th>Marge</th><th>Totaal</th></tr>
          </thead>
          <tbody>
            {lines.map((l, i) => {
              const rm = Math.round((l.unit - l.cost) / l.unit * 100);
              const mc = rm > 50 ? 'var(--green)' : rm > 35 ? 'var(--amber)' : 'var(--red)';
              return (
                <tr key={i}>
                  <td className="tabular">{l.qty}×</td>
                  <td className="left" style={{ fontWeight: 500 }}>{l.name}</td>
                  <td className="tabular muted">€ {l.unit.toFixed(2)}</td>
                  <td className="tabular muted">€ {l.cost.toFixed(2)}</td>
                  <td className="tabular"><span style={{ color: mc }}>{rm}%</span></td>
                  <td className="tabular"><strong>{fmtEur(l.qty * l.unit)}</strong></td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr><td colSpan={5} className="muted" style={{ textAlign: 'right' }}>Subtotaal</td><td className="tabular">{fmtEur(total)}</td></tr>
            <tr><td colSpan={5} className="muted" style={{ textAlign: 'right' }}>BTW 9%</td><td className="tabular">{fmtEur(total * 0.09)}</td></tr>
            <tr style={{ borderTop: '1px solid var(--border)' }}>
              <td colSpan={5} style={{ textAlign: 'right', fontWeight: 600 }}>Totaal</td>
              <td className="tabular" style={{ fontFamily: 'var(--font-display)', fontSize: 18, color: 'var(--brand-gold)', fontWeight: 700 }}>{fmtEur(total * 1.09)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </main>
  );
};

const InteractiveMarginDoctor = ({
  value, total, totalCost,
}: { value: number; total: number; totalCost: number }) => {
  const [target, setTarget] = useState(60);
  const [dragging, setDragging] = useState(false);
  const ringRef = useRef<SVGSVGElement | null>(null);
  const size = 200, stroke = 8, r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const pct = Math.min(value, 100) / 100;
  const tone: Tone = value >= target ? 'ok' : value >= target - 10 ? 'warn' : 'bad';
  const delta = value - target;
  const projectedRevenue = totalCost / (1 - target / 100);
  const upliftNeeded = projectedRevenue - total;

  const updateFromEvent = useCallback((e: MouseEvent | TouchEvent | React.MouseEvent | React.TouchEvent) => {
    if (!ringRef.current) return;
    const rect = ringRef.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const touches = (e as TouchEvent).touches;
    const clientX = touches && touches[0] ? touches[0].clientX : (e as MouseEvent).clientX;
    const clientY = touches && touches[0] ? touches[0].clientY : (e as MouseEvent).clientY;
    const angle = Math.atan2(clientY - cy, clientX - cx) * 180 / Math.PI;
    const norm = (angle + 90 + 360) % 360;
    const newTarget = Math.max(30, Math.min(90, Math.round(norm / 3.6)));
    setTarget(newTarget);
  }, []);

  useEffect(() => {
    if (!dragging) return;
    const move = (e: MouseEvent | TouchEvent) => { e.preventDefault(); updateFromEvent(e); };
    const up = () => setDragging(false);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    window.addEventListener('touchmove', move, { passive: false });
    window.addEventListener('touchend', up);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      window.removeEventListener('touchmove', move);
      window.removeEventListener('touchend', up);
    };
  }, [dragging, updateFromEvent]);

  const hx = size / 2 + r * Math.cos(target * 3.6 * Math.PI / 180);
  const hy = size / 2 + r * Math.sin(target * 3.6 * Math.PI / 180);
  const strokeColor = tone === 'ok' ? 'var(--green)' : tone === 'warn' ? 'var(--amber)' : 'var(--red)';

  return (
    <div className="mdoc-card">
      <div className="mdoc-eyebrow">
        <Sparkles size={11} />Margin doctor · interactief
      </div>
      <div className={`mdoc-interactive-ring ${dragging ? 'dragging' : ''}`}>
        <svg ref={ringRef} viewBox={`0 0 ${size} ${size}`}
          onMouseDown={e => { setDragging(true); updateFromEvent(e); }}
          onTouchStart={e => { setDragging(true); updateFromEvent(e); }}>
          <defs>
            <linearGradient id="dialGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor={strokeColor} stopOpacity="0.4" />
              <stop offset="100%" stopColor={strokeColor} stopOpacity="1" />
            </linearGradient>
          </defs>
          <circle className="dial-bg" cx={size / 2} cy={size / 2} r={r} />
          <circle cx={size / 2} cy={size / 2} r={r}
            fill="none" stroke={strokeColor} strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${c * pct} ${c}`} />
          <circle className="dial-target-ring" cx={size / 2} cy={size / 2} r={r} strokeDasharray="2 4" opacity="0.4" />
          <circle className="dial-target" cx={hx} cy={hy} r={8} />
        </svg>
        <div className="dial-center">
          <div className={`dial-pct ${tone}`}>{value.toFixed(1)}<span style={{ fontSize: '0.45em', color: 'var(--muted)' }}>%</span></div>
          <div className="dial-lbl">actuele marge</div>
          <div className="dial-tgt">
            <Target size={11} color="var(--brand-gold)" />
            Target {target}% {delta >= 0
              ? <span style={{ color: 'var(--green)' }}>+{delta.toFixed(1)}</span>
              : <span style={{ color: 'var(--red)' }}>{delta.toFixed(1)}</span>}
          </div>
        </div>
      </div>
      <div className="mdoc-hint">
        <kbd>sleep</kbd> handle op de ring om target aan te passen
      </div>

      <div style={{
        fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.55,
        padding: '10px 12px', borderRadius: 8,
        background: 'rgba(196,163,90,.05)', border: '1px solid rgba(196,163,90,.15)',
        marginBottom: 14,
      }}>
        {delta >= 0
          ? <>✓ <strong style={{ color: 'var(--green)' }}>{delta.toFixed(1)}%</strong> boven target. Ruimte van <strong style={{ color: 'var(--text)' }}>{fmtEur0(Math.abs(upliftNeeded))}</strong> voor korting of extra upsell.</>
          : <>Om target te halen: verhoog omzet met <strong style={{ color: 'var(--brand-gold)' }}>{fmtEur0(Math.abs(upliftNeeded))}</strong> of verlaag inkoop met <strong style={{ color: 'var(--text)' }}>{fmtEur0(Math.abs(upliftNeeded) * (1 - target / 100))}</strong>.</>}
      </div>

      <div className="mdoc-split">
        <div className="mdoc-split-row"><span className="k">Omzet</span><span className="v tabular">{fmtEur0(total)}</span></div>
        <div className="mdoc-split-row"><span className="k">Inkoop & crew</span><span className="v tabular" style={{ color: 'var(--muted)' }}>−{fmtEur0(totalCost)}</span></div>
        <div className="mdoc-split-row" style={{ borderTop: '1px solid var(--border)', paddingTop: 10, marginTop: 2 }}>
          <span className="k" style={{ color: 'var(--text)', fontWeight: 600 }}>Brutomarge</span>
          <span className="v tabular" style={{ color: 'var(--brand-gold)' }}>{fmtEur0(total - totalCost)}</span>
        </div>
      </div>
    </div>
  );
};

const SUGGESTIONS = [
  {
    delta: '+4.2%', tone: 'gold',
    title: 'Swap naar huisgemaakte brisket rub',
    sub: 'Bespaart € 0,45 p/p op de brisket-regel zonder kwaliteitsverlies',
    why: 'Je inkoopt nu Meat Church Holy Cow (€ 0,95 p/p). De huisrub van pitmaster-school Rotterdam kost € 0,50 p/p aan ingrediënten en scoort in je eigen blind tests 4.6/5 vs 4.4 voor Holy Cow.',
    impact: [
      { k: 'Kost per brisket', v: '€ 5,40 → € 4,95' },
      { k: 'Brutomarge brisket', v: '55% → 59%' },
      { k: 'Effect op dit event', v: '+ € 54 marge' },
      { k: 'Jaarimpact (bij 18 events)', v: '+ € 972' },
    ],
  },
  {
    delta: '+€ 540', tone: 'gold',
    title: 'Voeg dessert-module toe',
    sub: 'Smoked cheesecake p/p — past bij bruiloftstijl · 62% marge',
    why: 'Bruiloft-briefings zoals deze converteren op 73% voor desserts wanneer ze proactief aangeboden worden. Smoked cheesecake past thematisch bij de low-&-slow BBQ en onderscheidt je van standaard catering.',
    impact: [
      { k: 'Prijs p/p', v: '€ 7,50' },
      { k: 'Kost p/p', v: '€ 2,85' },
      { k: 'Brutomarge', v: '62%' },
      { k: 'Event-totaal', v: '+ € 540' },
    ],
  },
  {
    delta: '⚑', tone: 'amber',
    title: 'BBQ saus onder branche-marge',
    sub: 'Huidige 71% is prima — maar overweeg premium-saus als upsell',
    why: 'Benchmark in premium-catering voor huissauzen ligt op 78%. Een 3-pack "Pitmaster Selection" in handgelabelde flessen kan als add-on verkocht worden voor € 14,50 (kost € 3,20).',
    impact: [
      { k: 'Huidige marge sauzen', v: '71%' },
      { k: 'Potentiële upsell', v: '€ 14,50 / 3-pack' },
      { k: 'Attach rate (verwacht)', v: '22%' },
      { k: 'Event-totaal', v: '+ € 380' },
    ],
  },
] as const;

const ExpandableSuggestions = () => {
  const [open, setOpen] = useState<number>(0);
  const [applied, setApplied] = useState<Record<number, boolean>>({});
  return (
    <div className="suggest-card">
      <div className="sc-head">
        <Sparkles size={14} color="var(--brand-gold)" />
        <span className="title">Pitmaster suggesties</span>
        <span className="count">{SUGGESTIONS.length}</span>
      </div>
      {SUGGESTIONS.map((s, i) => {
        const isOpen = open === i;
        const isApplied = applied[i];
        const deltaColor = s.tone === 'amber' ? 'var(--amber)' : 'var(--green)';
        return (
          <div key={i} className={`sc-item ${isOpen ? 'open' : ''}`}>
            <div className="sc-item-head" onClick={() => setOpen(isOpen ? -1 : i)}>
              <div className="delta" style={{ color: deltaColor }}>{s.delta}</div>
              <div className="body">
                <div className="t">{s.title}</div>
                <div className="s">{s.sub}</div>
              </div>
              <span className="chev"><ChevronRight size={14} /></span>
            </div>
            <div className="sc-item-detail">
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 9.5, letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--brand-gold)', fontWeight: 700, marginBottom: 5 }}>Waarom</div>
                <div style={{ color: 'var(--text)', fontSize: 11.5, lineHeight: 1.55 }}>{s.why}</div>
              </div>
              <div style={{ fontSize: 9.5, letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--brand-gold)', fontWeight: 700, marginBottom: 6 }}>Impact</div>
              {s.impact.map((row, j) => (
                <div key={j} className="sc-row">
                  <span className="k">{row.k}</span>
                  <span className="v green">{row.v}</span>
                </div>
              ))}
              <div className="sc-actions">
                <button className="apply" onClick={() => setApplied({ ...applied, [i]: !isApplied })}>
                  {isApplied ? '✓ Toegepast' : 'Pas toe'}
                </button>
                <button>Negeer</button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

const QLine = ({
  qty, unit_label, name, sub, unit_price, cost,
}: {
  qty: number; unit_label?: string; name: string; sub?: string;
  unit_price: number; cost: number;
}) => {
  const m = Math.round((unit_price - cost) / unit_price * 100);
  const mTone: Tone = m >= 55 ? 'ok' : m >= 40 ? 'warn' : 'bad';
  return (
    <div className="qline">
      <div className="qty">{qty}<span className="x">×{unit_label ? ` ${unit_label}` : ''}</span></div>
      <div>
        <div className="name">{name}</div>
        {sub && <div className="name-sub">{sub}</div>}
      </div>
      <div className="unit">
        {fmtEur(unit_price)}
        <span className="sub">cost {fmtEur(cost)}</span>
      </div>
      <div className="margin-strip">
        <div className={`pct ${mTone}`}>{m}% marge</div>
        <div className="track">
          <div className={`fill ${mTone}`} style={{ width: Math.min(m, 100) + '%' }} />
          <div className="marker" style={{ left: '60%' }} title="Target 60%" />
        </div>
      </div>
      <div className="total">{fmtEur(qty * unit_price)}</div>
    </div>
  );
};

const QuoteAfter = () => {
  const total = 120 * (8.50 + 12.00 + 2.80 + 1.90 + 1.20) + 4 * 180;
  const totalCost = 120 * (3.20 + 5.40 + 0.90 + 0.60 + 0.35) + 4 * 95;
  const margin = ((total - totalCost) / total * 100);
  return (
    <main className="main">
      <div className="page-head" style={{ marginBottom: 14, alignItems: 'flex-start', gap: 20 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="page-eyebrow">Offerte · OFF-2026-0142 · versie 2</div>
          <h1 className="page-title" style={{ margin: '0 0 8px', whiteSpace: 'normal', overflow: 'visible' }}>Bruiloft Van Dijk</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span className="pill p-optie" style={{ whiteSpace: 'nowrap' }}>
              <CircleDot size={10} />Optie · vervalt over 4d
            </span>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>120 gasten · Kasteel De Hooge Vuursche · za 5 mei · 17:00 — Full service BBQ</span>
          </div>
        </div>
        <div className="hstack" style={{ flexShrink: 0, marginTop: 24 }}>
          <Btn v="ghost" icon={<Eye size={14} />}>Preview</Btn>
          <Btn v="ghost" icon={<Download size={14} />}>PDF</Btn>
          <Btn v="primary" icon={<Send size={14} />}>Stuur herinnering</Btn>
        </div>
      </div>

      <div className="quote-grid">
        <div className="quote-main">
          <div className="quote-hero">
            <div className="quote-hero-top">
              <div>
                <div className="eyebrow" style={{ marginBottom: 4 }}>Totaal</div>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 300, fontSize: 36, letterSpacing: '-.01em' }}>
                  {fmtEur(total * 1.09)} <span style={{ fontSize: 14, color: 'var(--muted)', fontWeight: 400 }}>incl. 9% btw</span>
                </div>
              </div>
              <div className="hstack" style={{ gap: 8 }}>
                <Btn v="ghost" size="sm" icon={<Copy size={14} />}>Dupliceer</Btn>
                <Btn v="ghost" size="sm" icon={<GitBranch size={14} />}>Nieuwe versie</Btn>
              </div>
            </div>
            <div className="quote-hero-stats">
              <div className="qhs"><div className="l">Gasten</div><div className="v">120</div></div>
              <div className="qhs"><div className="l">Per hoofd</div><div className="v">€ {(total / 120).toFixed(2).replace('.', ',')}</div></div>
              <div className="qhs"><div className="l">Brutomarge</div><div className="v gold">{fmtEur(total - totalCost)}</div><div className="delta"><TrendingUp size={11} />+€ 280 vs v1</div></div>
              <div className="qhs"><div className="l">COGS ratio</div><div className="v">{(totalCost / total * 100).toFixed(1)}%</div></div>
            </div>
          </div>

          <div className="qline-group">
            <div className="qline-group-head">
              <div className="icon"><Flame size={15} /></div>
              <div><div className="title">Smoker mains</div><div className="count">2 regels · low & slow 12–14u</div></div>
              <div className="sum">{fmtEur(120 * (8.50 + 12.00))}</div>
            </div>
            <QLine qty={120} unit_label="p/p" name="Pulled pork" sub="Low & slow 14u · applewood · huisrub" unit_price={8.50} cost={3.20} />
            <QLine qty={120} unit_label="p/p" name="Brisket, smoked 12u" sub="Texas-stijl · salt & pepper rub" unit_price={12.00} cost={5.40} />
          </div>

          <div className="qline-group">
            <div className="qline-group-head">
              <div className="icon"><Leaf size={15} /></div>
              <div><div className="title">Sides & sauzen</div><div className="count">3 regels</div></div>
              <div className="sum">{fmtEur(120 * (2.80 + 1.90 + 1.20))}</div>
            </div>
            <QLine qty={120} unit_label="p/p" name="Coleslaw huisgemaakt" unit_price={2.80} cost={0.90} />
            <QLine qty={120} unit_label="p/p" name="Cornbread, boter van thuiskarn" unit_price={1.90} cost={0.60} />
            <QLine qty={120} unit_label="p/p" name="BBQ saus (3 soorten)" sub="Classic · Carolina · habanero" unit_price={1.20} cost={0.35} />
            <div className="qline-add"><Plus size={13} />Voeg regel toe</div>
          </div>

          <div className="qline-group">
            <div className="qline-group-head">
              <div className="icon"><Users size={15} /></div>
              <div><div className="title">Crew & logistiek</div><div className="count">1 regel · 6 uur service</div></div>
              <div className="sum">{fmtEur(4 * 180)}</div>
            </div>
            <QLine qty={4} unit_label="pers × 6u" name="Pitmaster + crew" sub="1 pitmaster · 1 sous · 2 service" unit_price={180.00} cost={95.00} />
            <div className="qline-add"><Plus size={13} />Voeg logistiek toe (transport, tent, verhuur…)</div>
          </div>

          <div className="quote-footer">
            <div className="totals">
              <span className="sub">Subtotaal {fmtEur(total)} · btw {fmtEur(total * 0.09)}</span>
              <div className="big">{fmtEur(total * 1.09)} <span className="brand">incl.</span></div>
            </div>
            <div className="actions">
              <Btn v="ghost" icon={<Save size={14} />}>Opslaan</Btn>
              <Btn v="primary" icon={<Send size={14} />}>Verstuur v2</Btn>
            </div>
          </div>
        </div>

        <div className="quote-rail">
          <InteractiveMarginDoctor value={margin} total={total} totalCost={totalCost} />
          <ExpandableSuggestions />
          <div className="client-card">
            <div className="cc-row">
              <div className="cc-avatar">VD</div>
              <div className="cc-meta">
                <div className="n">Familie Van Dijk</div>
                <div className="s">emma.vandijk@gmail.com · 3e opdracht</div>
              </div>
              <button className="icon-btn"><MessageCircle size={14} /></button>
            </div>
            <div className="cc-stats">
              <div><div className="k">Eerdere omzet</div><div className="v">€ 3.240</div></div>
              <div><div className="k">Gem. marge</div><div className="v" style={{ color: 'var(--green)' }}>69%</div></div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
};

/* ═══════════════════════════════════════════════════════════════════
   SCREEN 3 — HACCP
   ═══════════════════════════════════════════════════════════════════ */

const HaccpBefore = () => (
  <main className="main">
    <div className="page-head">
      <div>
        <div className="page-eyebrow">Coming soon</div>
        <h1 className="page-title">HACCP</h1>
      </div>
    </div>
    <div className="metal" style={{ marginTop: 20 }}>
      <div className="empty-state">
        <div className="ic"><ShieldCheck size={28} /></div>
        <h2>HACCP-registratie</h2>
        <p>Deze sectie is nog niet inbegrepen in de UI-kit demo. Bekijk Dashboard, Events of Offertes voor interactieve voorbeelden.</p>
        <Btn v="primary" icon={<Plus size={14} />}>Nieuw logboek</Btn>
      </div>
    </div>
  </main>
);

const TempSparkline = ({ data, range = [0, 10], alertHigh = 7 }: { data: number[]; range?: [number, number]; alertHigh?: number }) => {
  const w = 280, h = 42, pad = 3;
  const min = Math.min(...data), max = Math.max(...data);
  const lo = Math.min(range[0], min), hi = Math.max(range[1], max);
  const step = (w - pad * 2) / (data.length - 1);
  const y = (v: number) => h - pad - ((v - lo) / (hi - lo)) * (h - pad * 2);
  const path = data.map((v, i) => (i === 0 ? 'M' : 'L') + (pad + i * step).toFixed(1) + ',' + y(v).toFixed(1)).join(' ');
  const yAlert = y(alertHigh);
  const lastX = pad + (data.length - 1) * step;
  const lastY = y(data[data.length - 1]);
  const breached = data[data.length - 1] > alertHigh;
  const color = breached ? '#ef4444' : '#22c55e';
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" width="100%" height="100%">
      <line x1={pad} x2={w - pad} y1={yAlert} y2={yAlert} stroke="rgba(239,68,68,.25)" strokeWidth="1" strokeDasharray="2 3" />
      <path d={path} fill="none" stroke={color} strokeWidth="1.5" />
      <circle cx={lastX} cy={lastY} r="3" fill={color} />
      <circle cx={lastX} cy={lastY} r="6" fill="none" stroke={color} strokeOpacity=".3" />
    </svg>
  );
};

const HaccpAfter = () => {
  const coolerData = [3.8, 3.9, 4.1, 4.0, 4.2, 4.1, 4.3, 4.2, 4.4, 4.3, 4.2, 4.5];
  const freezerData = [-18.2, -18.1, -18.0, -18.3, -18.2, -18.1, -18.0, -18.2, -18.1, -18.0, -17.9, -17.8];
  const smokerData = [108, 110, 112, 109, 111, 113, 110, 108, 112, 114, 110, 109];
  const hotholdData = [64, 63, 62, 61, 60.5, 60, 59.8, 59.2, 58.5, 59.0, 59.5, 60.0];

  return (
    <main className="main">
      <div className="page-head">
        <div>
          <div className="page-eyebrow" style={{ color: 'var(--brand-gold)' }}>Di 18 apr · 09:42 · laatste sensor-sync 2 min geleden</div>
          <h1 className="page-title">HACCP <span style={{ color: 'var(--muted)', fontWeight: 200 }}>· Control</span></h1>
        </div>
        <div className="hstack">
          <Btn v="ghost" icon={<Download size={14} />}>Auditrapport</Btn>
          <Btn v="ghost" icon={<Thermometer size={14} />}>Handmatig loggen</Btn>
          <Btn v="primary" icon={<Plus size={14} />}>Nieuwe meting</Btn>
        </div>
      </div>

      <div className="haccp-status-row">
        <div className="hs-card ok">
          <div className="l"><ShieldCheck size={11} />Compliance</div>
          <div className="v">100<span style={{ fontSize: 18, color: 'var(--muted)' }}>%</span></div>
          <div className="s">Geen openstaande tekortkomingen</div>
          <div className="tick"></div>
        </div>
        <div className="hs-card ok">
          <div className="l"><Thermometer size={11} />Sensoren</div>
          <div className="v">4<span style={{ fontSize: 18, color: 'var(--muted)' }}>/4</span></div>
          <div className="s">Allen online · laatste ping 2 min</div>
          <div className="tick"></div>
        </div>
        <div className="hs-card warn">
          <div className="l"><ClipboardList size={11} />Taken vandaag</div>
          <div className="v">6<span style={{ fontSize: 18, color: 'var(--muted)' }}>/9</span></div>
          <div className="s">3 openstaand · 1 te laat</div>
          <div className="tick"></div>
        </div>
        <div className="hs-card bad">
          <div className="l"><AlertTriangle size={11} />Incidenten (30d)</div>
          <div className="v">1</div>
          <div className="s">Koeling 3 · afwijking opgelost 14 apr</div>
          <div className="tick"></div>
        </div>
      </div>

      <div className="haccp-grid">
        <div>
          <div className="temp-log">
            <div className="temp-log-head">
              <div className="title">
                <span className="icon"><Thermometer size={16} /></span>
                Temperatuur-sensoren <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 400 }}>· live · afgelopen 12u</span>
              </div>
              <div className="hstack">
                <Pill v="ok" icon={<Activity size={10} />}>Live</Pill>
                <button className="icon-btn"><MoreHorizontal size={14} /></button>
              </div>
            </div>
            <div className="temp-log-body">
              <div className="sensor-row">
                <div className="sensor-name">
                  <div className="n">Koeling 1 · rauw vlees</div>
                  <div className="s">Setpoint 4°C · grens &lt; 7°C</div>
                </div>
                <div className="sensor-spark"><TempSparkline data={coolerData} range={[2, 8]} alertHigh={7} /></div>
                <div className="sensor-now">
                  <div className="t ok">4,5°C</div>
                  <div className="d">Veilig</div>
                </div>
              </div>
              <div className="sensor-row">
                <div className="sensor-name">
                  <div className="n">Vriezer · crew</div>
                  <div className="s">Setpoint −18°C · grens &gt; −15°C</div>
                </div>
                <div className="sensor-spark"><TempSparkline data={freezerData} range={[-22, -12]} alertHigh={-15} /></div>
                <div className="sensor-now">
                  <div className="t ok">−17,8°C</div>
                  <div className="d">Veilig</div>
                </div>
              </div>
              <div className="sensor-row">
                <div className="sensor-name">
                  <div className="n">Smoker · big green egg</div>
                  <div className="s">Cook-zone · low &amp; slow</div>
                </div>
                <div className="sensor-spark"><TempSparkline data={smokerData} range={[95, 125]} alertHigh={120} /></div>
                <div className="sensor-now">
                  <div className="t ok">109°C</div>
                  <div className="d">In range</div>
                </div>
              </div>
              <div className="sensor-row">
                <div className="sensor-name">
                  <div className="n">Hot-hold · service</div>
                  <div className="s">Setpoint 63°C · grens &gt; 60°C</div>
                </div>
                <div className="sensor-spark"><TempSparkline data={hotholdData} range={[55, 70]} alertHigh={60} /></div>
                <div className="sensor-now">
                  <div className="t warn">60,0°C</div>
                  <div className="d">Op grens</div>
                </div>
              </div>
            </div>
          </div>

          <div className="checks-card">
            <div className="checks-head">
              <div>
                <div className="t">Dagtaken · 18 apr</div>
                <div className="s">9 taken · Maurice + Jens on shift</div>
              </div>
              <div className="checks-progress">
                <div className="bar"><div className="fill" style={{ width: '67%' }} /></div>
                <div className="pct">6/9</div>
              </div>
            </div>
            <div className="check-item done">
              <div className="tickbox"><Check size={14} /></div>
              <div className="body"><div className="t">Koeling 1 handmatig controleren</div><div className="s">06:30 · ingecheckt op 4,1°C</div></div>
              <div className="who"><span>06:28</span><div className="av">MB</div></div>
            </div>
            <div className="check-item done">
              <div className="tickbox"><Check size={14} /></div>
              <div className="body"><div className="t">Werkbladen ontsmetten</div><div className="s">Voor eerste prep — Chloor 200ppm</div></div>
              <div className="who"><span>06:45</span><div className="av">MB</div></div>
            </div>
            <div className="check-item done">
              <div className="tickbox"><Check size={14} /></div>
              <div className="body"><div className="t">Pulled pork · kerntemperatuur bij bind-over</div><div className="s">Buurtfeest · gemeten 92°C</div></div>
              <div className="who"><span>14:45</span><div className="av">MB</div></div>
            </div>
            <div className="check-item">
              <div className="tickbox"></div>
              <div className="body"><div className="t">Ontvangstcontrole leveranciers</div><div className="s">Versvlees De Graaf · verwacht 15:00</div></div>
              <div className="who"><span style={{ color: 'var(--amber)' }}>15:00</span></div>
            </div>
            <div className="check-item">
              <div className="tickbox"></div>
              <div className="body"><div className="t">Allergenen-check menu Buurtfeest</div><div className="s">Cross-contaminatie pinda / gluten</div></div>
              <div className="who"><span className="overdue-tag">Te laat · 15m</span></div>
            </div>
            <div className="check-item">
              <div className="tickbox"></div>
              <div className="body"><div className="t">Afsluitcontrole koeling</div><div className="s">Einde shift · alle units dicht + foto</div></div>
              <div className="who"><span>22:00</span></div>
            </div>
          </div>
        </div>

        <div className="vstack" style={{ gap: 16 }}>
          <div className="audit-card">
            <div className="audit-eyebrow"><ShieldCheck size={11} style={{ verticalAlign: 'middle', marginRight: 4 }} />Audit-readiness</div>
            <div className="audit-score">A<span className="u">+</span></div>
            <div className="audit-desc">NVWA-klaar. Laatste externe audit: 12 feb 2026 — geen bevindingen. Volgende verwacht okt 2026.</div>
            <div className="audit-breakdown">
              <div className="audit-row"><span className="k">Temperatuurlogs 30d</span><span className="v ok">100%</span></div>
              <div className="audit-row"><span className="k">Reiniging-schema</span><span className="v ok">100%</span></div>
              <div className="audit-row"><span className="k">Personeelsregistratie</span><span className="v ok">Volledig</span></div>
              <div className="audit-row"><span className="k">Corrigerende acties</span><span className="v warn">1 open</span></div>
              <div className="audit-row"><span className="k">Traceability batches</span><span className="v ok">100%</span></div>
            </div>
          </div>

          <div className="risk-card">
            <div className="risk-head"><span className="icon"><AlertTriangle size={14} /></span>Attentiepunten</div>
            <div className="risk-item">
              <div className="dot"></div>
              <div className="body">
                <div className="t">Hot-hold nadert grens (60,0°C)</div>
                <div className="s">Verhoog setpoint naar 65°C voor buffer tijdens service piek.</div>
              </div>
            </div>
            <div className="risk-item">
              <div className="dot"></div>
              <div className="body">
                <div className="t">Kalibratie sondes verloopt in 12 dagen</div>
                <div className="s">3 thermocouples · plan kalibratie-sessie voor 30 apr.</div>
              </div>
            </div>
            <div className="risk-item">
              <div className="dot"></div>
              <div className="body">
                <div className="t">Allergenen-briefing KPN (250 gasten)</div>
                <div className="s">Event over 14d · verzamel gastdiëten via formulier.</div>
              </div>
            </div>
          </div>

          <div className="client-card">
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 10 }}>Logboek · snel toegang</div>
            {[
              { Ic: Thermometer, t: 'Temperatuur', sub: '14 entries vandaag' },
              { Ic: Droplets, t: 'Reiniging', sub: '3 entries vandaag' },
              { Ic: Truck, t: 'Goederen-ontvangst', sub: '1 gepland' },
              { Ic: AlertOctagon, t: 'Afwijkingen', sub: '0 open' },
            ].map((r, i) => {
              const Ic = r.Ic;
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: i === 0 ? 'none' : '1px solid rgba(130,130,130,.08)', cursor: 'pointer' }}>
                  <div style={{ width: 26, height: 26, borderRadius: 7, background: 'rgba(196,163,90,.1)', border: '1px solid rgba(196,163,90,.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--brand-gold)' }}>
                    <Ic size={12} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 500 }}>{r.t}</div>
                    <div style={{ fontSize: 10.5, color: 'var(--muted)' }}>{r.sub}</div>
                  </div>
                  <ChevronRight size={13} color="var(--muted-light)" />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </main>
  );
};

/* ═══════════════════════════════════════════════════════════════════
   SCREEN 4 — EVENT HUB
   ═══════════════════════════════════════════════════════════════════ */

const EventHubBefore = () => (
  <main className="main">
    <div className="page-head">
      <div>
        <div className="page-eyebrow">Event · EV-2026-0087</div>
        <h1 className="page-title">Bruiloft Van Dijk</h1>
      </div>
    </div>
    <div className="metal" style={{ marginTop: 20 }}>
      <div style={{ padding: 24, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {['Offerte — ga naar offertes', 'Factuur — ga naar facturen', 'Menu — ga naar menu & recepten', 'Prep — ga naar prep schema', 'Klant — ga naar klanten', 'HACCP — ga naar HACCP'].map((t, i) => (
          <div key={i} style={{ padding: 18, border: '1px solid var(--border)', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 12, color: 'var(--muted)', fontSize: 13 }}>
            <ExternalLink size={14} />{t}
          </div>
        ))}
      </div>
      <div style={{ padding: '0 24px 24px', color: 'var(--muted)', fontSize: 12, fontStyle: 'italic' }}>
        Je moet telkens naar een andere sectie om offerte, menukaart, factuur of prep-schema te vinden. Geen overzicht per klus.
      </div>
    </div>
  </main>
);

const MenuCardAmbacht = () => (
  <div style={{ background: '#f5eedf', color: '#1a1410', height: '100%', padding: '24px 22px 18px', fontFamily: 'var(--font-artisan)', position: 'relative', boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.06)' }}>
    <div style={{ textAlign: 'center', borderBottom: '1px solid rgba(0,0,0,.15)', paddingBottom: 12, marginBottom: 16 }}>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 9, letterSpacing: '.28em', fontWeight: 700, color: '#9e781c', textTransform: 'uppercase' }}>Hop &amp; Bites · Ambacht</div>
      <div style={{ fontSize: 24, fontStyle: 'italic', fontWeight: 600, marginTop: 6, lineHeight: 1 }}>Bruiloft Van Dijk</div>
      <div style={{ fontFamily: 'var(--font-sans)', fontSize: 9.5, letterSpacing: '.18em', color: '#6b5a3e', marginTop: 7, textTransform: 'uppercase' }}>5 mei 2026 · De Hooge Vuursche</div>
    </div>
    <div style={{ fontFamily: 'var(--font-display)', fontSize: 9, letterSpacing: '.22em', color: '#9e781c', fontWeight: 700, textTransform: 'uppercase', marginBottom: 6 }}>— Uit de smoker —</div>
    <div style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.3 }}>Pulled pork</div>
    <div style={{ fontFamily: 'var(--font-sans)', fontSize: 11, color: '#6b5a3e', marginBottom: 10 }}>14u low &amp; slow · applewood · huisrub</div>
    <div style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.3 }}>Brisket</div>
    <div style={{ fontFamily: 'var(--font-sans)', fontSize: 11, color: '#6b5a3e', marginBottom: 16 }}>Texas-stijl · salt &amp; pepper, 12u gerookt</div>
    <div style={{ fontFamily: 'var(--font-display)', fontSize: 9, letterSpacing: '.22em', color: '#9e781c', fontWeight: 700, textTransform: 'uppercase', marginBottom: 6 }}>— Bijgerechten —</div>
    <div style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: '#3a2f20', lineHeight: 1.7 }}>Coleslaw · Cornbread · Sauzen trio</div>
    <div style={{ position: 'absolute', bottom: 14, left: 0, right: 0, textAlign: 'center', fontFamily: 'var(--font-sans)', fontSize: 8, color: '#9e781c', letterSpacing: '.25em', textTransform: 'uppercase', fontWeight: 700 }}>— Geniet ervan —</div>
  </div>
);

const MenuCardModern = () => (
  <div style={{ background: '#ffffff', color: '#0a0a0c', height: '100%', padding: '28px 22px', fontFamily: 'var(--font-sans)', position: 'relative' }}>
    <div style={{ width: 28, height: 3, background: '#FFBF00', marginBottom: 18 }}></div>
    <div style={{ fontSize: 9, letterSpacing: '.25em', fontWeight: 700, color: '#9e781c', textTransform: 'uppercase', marginBottom: 4 }}>Hop &amp; Bites</div>
    <div style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 300, letterSpacing: '-.01em', lineHeight: 1.05, marginBottom: 6 }}>Bruiloft<br />Van Dijk</div>
    <div style={{ fontSize: 10, color: '#6b6b6b', letterSpacing: '.04em', marginBottom: 22, fontVariantNumeric: 'tabular-nums' }}>05.05.2026 &nbsp;·&nbsp; 17:00</div>

    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 4 }}>
      <span style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 400, color: '#FFBF00' }}>01</span>
      <span style={{ fontSize: 14, fontWeight: 600 }}>Pulled pork</span>
    </div>
    <div style={{ fontSize: 10.5, color: '#707070', marginLeft: 32, marginBottom: 12 }}>14u low &amp; slow · applewood</div>

    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 4 }}>
      <span style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 400, color: '#FFBF00' }}>02</span>
      <span style={{ fontSize: 14, fontWeight: 600 }}>Brisket</span>
    </div>
    <div style={{ fontSize: 10.5, color: '#707070', marginLeft: 32, marginBottom: 12 }}>Texas-stijl · 12u gerookt</div>

    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 4 }}>
      <span style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 400, color: '#FFBF00' }}>03</span>
      <span style={{ fontSize: 14, fontWeight: 600 }}>Bijgerechten</span>
    </div>
    <div style={{ fontSize: 10.5, color: '#707070', marginLeft: 32 }}>Coleslaw · Cornbread · Sauzen</div>

    <div style={{ position: 'absolute', bottom: 16, left: 22, right: 22, display: 'flex', justifyContent: 'space-between', fontSize: 8.5, color: '#9e781c', letterSpacing: '.2em', textTransform: 'uppercase', fontWeight: 700, borderTop: '1px solid #e8e8e8', paddingTop: 10 }}>
      <span>Menu</span><span>Hopbites.nl</span>
    </div>
  </div>
);

const MenuCardSlate = () => (
  <div style={{ background: '#1a1a1c', color: '#f0e8d0', height: '100%', padding: '24px 22px 18px', fontFamily: 'var(--font-sans)', position: 'relative', backgroundImage: 'radial-gradient(ellipse at top right, rgba(196,163,90,.15), transparent 60%)' }}>
    <div style={{ textAlign: 'center', borderBottom: '1px solid rgba(196,163,90,.2)', paddingBottom: 12, marginBottom: 16 }}>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 8.5, letterSpacing: '.3em', fontWeight: 700, color: '#c4a35a', textTransform: 'uppercase' }}>★ Hop &amp; Bites ★</div>
      <div style={{ fontFamily: 'var(--font-artisan)', fontSize: 22, fontStyle: 'italic', fontWeight: 600, marginTop: 8, lineHeight: 1, color: '#fff' }}>Bruiloft Van Dijk</div>
      <div style={{ fontSize: 9, letterSpacing: '.18em', color: '#8a7c60', marginTop: 8, textTransform: 'uppercase' }}>5 mei 2026</div>
    </div>
    <div style={{ fontFamily: 'var(--font-display)', fontSize: 8.5, letterSpacing: '.28em', color: '#c4a35a', fontWeight: 700, textTransform: 'uppercase', marginBottom: 8, textAlign: 'center' }}>Uit de smoker</div>
    <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.3, color: '#fff' }}>Pulled pork</div>
    <div style={{ fontSize: 10.5, color: '#9a8a6a', marginBottom: 10 }}>14u · applewood · huisrub</div>
    <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.3, color: '#fff' }}>Brisket Texas</div>
    <div style={{ fontSize: 10.5, color: '#9a8a6a', marginBottom: 14 }}>S&amp;P rub · 12u gerookt</div>
    <div style={{ height: 1, background: 'linear-gradient(90deg, transparent, rgba(196,163,90,.3), transparent)', margin: '12px 0' }}></div>
    <div style={{ fontFamily: 'var(--font-display)', fontSize: 8.5, letterSpacing: '.28em', color: '#c4a35a', fontWeight: 700, textTransform: 'uppercase', marginBottom: 8, textAlign: 'center' }}>Bijgerechten</div>
    <div style={{ fontSize: 11.5, color: '#d4c8a0', lineHeight: 1.6, textAlign: 'center' }}>Coleslaw · Cornbread<br />BBQ saus trio</div>
    <div style={{ position: 'absolute', bottom: 12, left: 0, right: 0, textAlign: 'center', fontSize: 8, color: '#c4a35a', letterSpacing: '.3em', textTransform: 'uppercase', fontWeight: 700 }}>— Eet smakelijk —</div>
  </div>
);

const EventHubAfter = () => {
  const [tpl, setTpl] = useState<'ambacht' | 'modern' | 'slate'>('ambacht');
  const daysTotal = 30;
  const daysLeft = 17;
  const circumference = 2 * Math.PI * 86;
  const progress = (daysTotal - daysLeft) / daysTotal;
  return (
    <main className="main">
      <div className="eh-hero">
        <div className="eh-hero-bg"></div>
        <div className="eh-hero-content">
          <div className="eh-hero-left">
            <div>
              <div className="eh-hero-eyebrow"><span className="dot"></span>Event · EV-2026-0087</div>
              <h1 className="eh-hero-title">Bruiloft Van Dijk</h1>
              <div className="eh-hero-sub">
                <span className="pill">Optie · wacht op akkoord</span>
                <span className="sep">·</span>
                <span>120 gasten</span>
                <span className="sep">·</span>
                <span>za 5 mei 17:00</span>
                <span className="sep">·</span>
                <span>Kasteel De Hooge Vuursche</span>
                <span className="sep">·</span>
                <span>Full service BBQ</span>
              </div>
            </div>
            <div className="eh-hero-actions">
              <Btn v="ghost" icon={<Calendar size={14} />}>In agenda</Btn>
              <Btn v="ghost" icon={<MessageCircle size={14} />}>Contact klant</Btn>
              <Btn v="ghost" icon={<Share2 size={14} />}>Deel</Btn>
              <Btn v="primary" icon={<CheckCheck size={14} />}>Markeer bevestigd</Btn>
            </div>
          </div>
          <div className="eh-countdown">
            <div className="eh-countdown-ring">
              <svg viewBox="0 0 200 200">
                <defs>
                  <linearGradient id="countdownGrad" x1="0" x2="1" y1="0" y2="1">
                    <stop offset="0%" stopColor="#FFBF00" />
                    <stop offset="60%" stopColor="#ff8c20" />
                    <stop offset="100%" stopColor="#ff5010" />
                  </linearGradient>
                </defs>
                <circle className="bg-ring" cx="100" cy="100" r="86" />
                <circle className="fg-ring" cx="100" cy="100" r="86"
                  strokeDasharray={circumference}
                  strokeDashoffset={circumference * (1 - progress)} />
                {Array.from({ length: 30 }).map((_, i) => {
                  const a = (i / 30) * Math.PI * 2;
                  const x1 = 100 + Math.cos(a) * 72;
                  const y1 = 100 + Math.sin(a) * 72;
                  const x2 = 100 + Math.cos(a) * 76;
                  const y2 = 100 + Math.sin(a) * 76;
                  return <line key={i} className="tick" x1={x1} y1={y1} x2={x2} y2={y2} />;
                })}
              </svg>
              <div className="eh-countdown-center">
                <div className="eh-countdown-num">{daysLeft}</div>
                <div className="eh-countdown-lbl">Dagen te gaan</div>
                <div className="eh-countdown-sub">tot 5 mei 17:00</div>
              </div>
            </div>
          </div>
        </div>
        <div className="eh-hero-stats">
          <div className="eh-hero-stat">
            <div className="l">Gasten</div>
            <div className="v">120</div>
            <div className="s">Full service</div>
          </div>
          <div className="eh-hero-stat">
            <div className="l">Omzet</div>
            <div className="v">{fmtEur(4237.92)}</div>
            <div className="s">incl. 9% btw</div>
          </div>
          <div className="eh-hero-stat">
            <div className="l">Marge</div>
            <div className="v warn">53,2%</div>
            <div className="s">{fmtEur(2254)}</div>
            <div className="bar"><div className="fill" style={{ width: '88%', background: 'var(--amber)' }}></div></div>
          </div>
          <div className="eh-hero-stat">
            <div className="l">Prep-ready</div>
            <div className="v warn">45%</div>
            <div className="s">4 / 9 taken · nog 12d</div>
            <div className="bar"><div className="fill" style={{ width: '45%', background: 'var(--amber)' }}></div></div>
          </div>
          <div className="eh-hero-stat">
            <div className="l">Saldo</div>
            <div className="v muted">{fmtEur(0)}</div>
            <div className="s">wacht op akkoord</div>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 20 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <FileText size={15} color="var(--brand-gold)" />
                <span style={{ fontSize: 14, fontWeight: 600 }}>Documenten voor deze klus</span>
              </div>
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>2 actiepunten · 4 klaar om te downloaden</span>
            </div>

            <div className="doc-primary-row">
              <div className="doc-primary">
                <div className="doc-primary-top">
                  <div className="doc-primary-icon"><FileText size={20} /></div>
                  <div className="doc-primary-head">
                    <div className="t">Offerte v2</div>
                    <div className="s">Verstuurd 15 apr · €&nbsp;4.237,92 · 3 pagina&apos;s</div>
                  </div>
                  <span className="doc-primary-tag sent">Verstuurd</span>
                </div>
                <div className="doc-primary-actions">
                  <button><Eye size={13} />Bekijk</button>
                  <button><Download size={13} />PDF</button>
                  <button className="primary"><Send size={13} />Herinnering</button>
                </div>
              </div>
              <div className="doc-primary">
                <div className="doc-primary-top">
                  <div className="doc-primary-icon"><UtensilsCrossed size={20} /></div>
                  <div className="doc-primary-head">
                    <div className="t">Menukaart</div>
                    <div className="s">Auto-gegenereerd · A5 · klaar voor 120 gasten</div>
                  </div>
                  <span className="doc-primary-tag ready">Klaar</span>
                </div>
                <div className="doc-primary-actions">
                  <button><Eye size={13} />Voorvertoning</button>
                  <button><Download size={13} />PDF</button>
                  <button className="primary"><Printer size={13} />Print 120×</button>
                </div>
              </div>
            </div>

            <div className="doc-secondary-grid">
              {[
                { Ic: Receipt, t: 'Factuur', s: 'Bij akkoord' },
                { Ic: ClipboardList, t: 'Prep-lijst', s: 'Voor crew · 1p' },
                { Ic: Truck, t: 'Laadlijst', s: 'Ingr. + equip.' },
                { Ic: ShieldCheck, t: 'HACCP-pakket', s: 'Allergenen' },
              ].map((d, i) => {
                const Ic = d.Ic;
                return (
                  <div key={i} className="doc-secondary">
                    <div className="i"><Ic size={14} /></div>
                    <div className="c">
                      <div className="t">{d.t}</div>
                      <div className="s">{d.s}</div>
                    </div>
                    <button className="icon-btn" style={{ width: 24, height: 24 }}><Download size={12} /></button>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="metal">
            <div className="metal-head">
              <div className="hstack"><ChefHat size={15} color="var(--brand-gold)" /><span style={{ fontSize: 14, fontWeight: 600 }}>Menu &amp; automatische menukaart</span></div>
              <div className="hstack" style={{ gap: 6 }}>
                <Btn v="ghost" size="sm" icon={<Edit3 size={14} />}>Menu aanpassen</Btn>
                <Btn v="primary" size="sm" icon={<Printer size={14} />}>Print 120×</Btn>
              </div>
            </div>
            <div style={{ padding: 20, display: 'grid', gridTemplateColumns: '1fr 300px', gap: 24 }}>
              <div>
                <div style={{ fontSize: 11, letterSpacing: '.15em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 700, marginBottom: 10 }}>Menu-samenstelling</div>
                {[
                  { g: 'Uit de smoker', items: [{ n: 'Pulled pork', s: '14u low & slow · applewood' }, { n: 'Brisket Texas-stijl', s: '12u gerookt · S&P rub' }] },
                  { g: 'Bijgerechten', items: [{ n: 'Coleslaw', s: 'Huisgemaakt, appelazijn' }, { n: 'Cornbread', s: 'Met thuiskarn-boter' }] },
                  { g: 'Sauzen', items: [{ n: 'BBQ saus trio', s: 'Classic · Carolina · habanero' }] },
                ].map((g, gi) => (
                  <div key={gi} style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 10, letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--brand-gold)', fontWeight: 700, marginBottom: 6 }}>{g.g}</div>
                    {g.items.map((it, ii) => (
                      <div key={ii} style={{ padding: '6px 0', borderTop: ii === 0 ? 'none' : '1px solid rgba(130,130,130,.08)', display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--brand-gold)' }}></div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, fontWeight: 500 }}>{it.n}</div>
                          <div style={{ fontSize: 11, color: 'var(--muted)' }}>{it.s}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
                <div style={{ marginTop: 12, padding: '10px 12px', background: 'rgba(255,191,0,.06)', border: '1px solid rgba(255,191,0,.2)', borderRadius: 9, fontSize: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Sparkles size={14} color="var(--brand)" />
                  <div style={{ flex: 1, color: 'var(--muted)' }}>Menukaart wordt automatisch gegenereerd uit bovenstaand menu — template <strong style={{ color: 'var(--text)' }}>{tpl === 'ambacht' ? 'Ambacht' : tpl === 'modern' ? 'Modern' : 'Slate'} — A5</strong>.</div>
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, letterSpacing: '.15em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 700, marginBottom: 10, textAlign: 'center' }}>Live voorvertoning</div>
                <div className="mk-preview-wrap">
                  <div className="mk-preview-card">
                    {tpl === 'ambacht' && <MenuCardAmbacht />}
                    {tpl === 'modern' && <MenuCardModern />}
                    {tpl === 'slate' && <MenuCardSlate />}
                  </div>
                  <div className="mk-template-tabs">
                    <button className={tpl === 'ambacht' ? 'on' : ''} onClick={() => setTpl('ambacht')}>
                      <span className="swatch" style={{ background: '#f5eedf' }}></span>Ambacht
                    </button>
                    <button className={tpl === 'modern' ? 'on' : ''} onClick={() => setTpl('modern')}>
                      <span className="swatch" style={{ background: '#fff' }}></span>Modern
                    </button>
                    <button className={tpl === 'slate' ? 'on' : ''} onClick={() => setTpl('slate')}>
                      <span className="swatch" style={{ background: '#1a1a1c' }}></span>Slate
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="metal">
            <div className="metal-head">
              <div className="hstack"><ClipboardList size={15} color="var(--brand-gold)" /><span style={{ fontSize: 14, fontWeight: 600 }}>Prep-schema · 12 dagen voor event</span></div>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>4 / 9 taken afgerond</span>
            </div>
            <div style={{ padding: 0 }}>
              {[
                { t: 'Inkoop bestellen bij De Graaf', w: 'Mathijs', d: '23 apr', done: true },
                { t: 'Brisket order bevestigen (25kg)', w: 'Mathijs', d: '26 apr', done: true },
                { t: 'Appelwood chunks aanvullen (8kg)', w: 'Jens', d: '28 apr', done: true },
                { t: 'Crew-briefing sturen (4 pers)', w: 'Mathijs', d: '30 apr', done: true },
                { t: 'Coleslaw + dressing prep', w: 'Jens', d: '03 mei · 12u', done: false },
                { t: 'Brisket in de smoker (T-24u)', w: 'Mathijs', d: '04 mei · 17:00', done: false, urgent: true },
                { t: 'Pulled pork opstart (T-14u)', w: 'Mathijs', d: '05 mei · 03:00', done: false },
                { t: 'Laadlijst controleren', w: 'Jens', d: '05 mei · 14:00', done: false },
                { t: 'Vertrek naar locatie', w: 'Crew', d: '05 mei · 15:30', done: false },
              ].map((c, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '26px 1fr auto', gap: 12, alignItems: 'center', padding: '11px 18px', borderTop: i === 0 ? 'none' : '1px solid rgba(130,130,130,.08)' }}>
                  <div style={{ width: 20, height: 20, borderRadius: 5, border: '1.5px solid ' + (c.done ? 'var(--green)' : 'var(--muted)'), background: c.done ? 'var(--green)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#000' }}>
                    {c.done && <Check size={13} />}
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: c.done ? 'var(--muted)' : 'var(--text)', textDecoration: c.done ? 'line-through' : 'none' }}>{c.t}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>{c.w} · {c.d}</div>
                  </div>
                  {c.urgent && <span style={{ fontSize: 10, color: 'var(--amber)', fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase' }}>Key step</span>}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="client-card">
            <div className="cc-row">
              <div className="cc-avatar">VD</div>
              <div className="cc-meta">
                <div className="n">Emma &amp; Tim van Dijk</div>
                <div className="s">3e opdracht · sinds 2023</div>
              </div>
              <button className="icon-btn"><Phone size={14} /></button>
              <button className="icon-btn"><Mail size={14} /></button>
            </div>
            <div style={{ padding: '12px 0 0', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 7, fontSize: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Mail size={12} color="var(--muted)" /><span style={{ color: 'var(--muted)' }}>emma.vandijk@gmail.com</span></div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Phone size={12} color="var(--muted)" /><span style={{ color: 'var(--muted)' }}>+31 6 21 47 39 85</span></div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><MapPin size={12} color="var(--muted)" /><span style={{ color: 'var(--muted)' }}>Kasteel De Hooge Vuursche, Baarn</span></div>
            </div>
            <div className="cc-stats" style={{ marginTop: 12 }}>
              <div><div className="k">Eerder</div><div className="v">{fmtEur(3240)}</div></div>
              <div><div className="k">Gem. marge</div><div className="v" style={{ color: 'var(--green)' }}>69%</div></div>
            </div>
          </div>

          <div className="metal">
            <div className="metal-head" style={{ padding: '12px 16px' }}>
              <div className="hstack"><Users size={14} color="var(--brand-gold)" /><span style={{ fontSize: 13, fontWeight: 600 }}>Crew</span></div>
              <Btn v="ghost" size="sm" icon={<Plus size={14} />}>Toevoegen</Btn>
            </div>
            <div style={{ padding: 12 }}>
              {[
                { i: 'MB', n: 'Mathijs', r: 'Pitmaster', c: true },
                { i: 'JB', n: 'Jens', r: 'Sous-chef', c: true },
                { i: 'AK', n: 'Anna', r: 'Service', c: false },
                { i: 'TV', n: 'Thomas', r: 'Service', c: false },
              ].map((p, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 4px', borderTop: i === 0 ? 'none' : '1px solid rgba(130,130,130,.08)' }}>
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(135deg, #c4a35a, #9e781c)', color: '#0a0a0c', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)' }}>{p.i}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 500 }}>{p.n}</div>
                    <div style={{ fontSize: 10.5, color: 'var(--muted)' }}>{p.r}</div>
                  </div>
                  {p.c ? <span style={{ fontSize: 10, color: 'var(--green)', fontWeight: 700, letterSpacing: '.05em' }}>✓ bevestigd</span> : <span style={{ fontSize: 10, color: 'var(--amber)', fontWeight: 700, letterSpacing: '.05em' }}>wacht</span>}
                </div>
              ))}
            </div>
          </div>

          <div className="metal">
            <div className="metal-head" style={{ padding: '12px 16px' }}>
              <div className="hstack"><MapPin size={14} color="var(--brand-gold)" /><span style={{ fontSize: 13, fontWeight: 600 }}>Locatie &amp; tijden</span></div>
            </div>
            <div style={{ padding: 14, fontSize: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--muted)' }}>Opbouw</span><span className="tabular">05 mei · 15:00</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--muted)' }}>Service start</span><span className="tabular" style={{ color: 'var(--brand-gold)', fontWeight: 600 }}>17:00</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--muted)' }}>Service eind</span><span className="tabular">22:30</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--muted)' }}>Afbouw klaar</span><span className="tabular">00:00</span></div>
              <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }}></div>
              <div style={{ color: 'var(--muted)' }}>Kasteel De Hooge Vuursche</div>
              <div style={{ color: 'var(--muted)', fontSize: 11 }}>Hilverbeeklaan 1 · 3744 HJ Baarn</div>
              <Btn v="ghost" size="sm" icon={<Navigation size={14} />} style={{ marginTop: 4, width: '100%', justifyContent: 'center' } as CSSProperties}>Route plannen</Btn>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
};

/* ═══════════════════════════════════════════════════════════════════
   TOP SHELL — screen switcher + mode toggle + diagnosis + frame
   ═══════════════════════════════════════════════════════════════════ */

type ScreenId = 'events' | 'quotes' | 'haccp' | 'eventhub';
type Mode = 'before' | 'after';

const SCREENS: Array<{
  id: ScreenId;
  label: string;
  Ic: typeof PartyPopper;
  num: string;
  navId: string;
  crumbs: string[];
  Before: () => JSX.Element;
  After: () => JSX.Element;
  beforeDiag: ReactNode;
  afterDiag: ReactNode;
}> = [
  {
    id: 'events', label: 'Events', Ic: PartyPopper, num: '01', navId: 'events',
    crumbs: ['Events & Sales', 'Events'],
    Before: EventsBefore, After: EventsAfter,
    beforeDiag: <><strong>Platte scroll-wall.</strong> Elk event — dat van vandaag, van volgende week, van volgende maand — ziet er identiek uit. Geen visuele triage: urgente prep en een casual optie vechten om dezelfde aandacht. Geen gevoel van &quot;wat is het volgende&quot;, geen business-momentum.</>,
    afterDiag: <><strong>Timeline + pulse.</strong> Het eerstvolgende event krijgt hero-behandeling met live T-4u checklist. Zustercard toont de 12-weken booking-pulse zodat de pitmaster momentum in één oogopslag leest. Events groeperen per week, met per-event <em>prep-readiness</em> balken zodat urgentie ruimtelijk wordt, niet verstopt in copy.</>,
  },
  {
    id: 'quotes', label: 'Offerte', Ic: FileText, num: '02', navId: 'quotes',
    crumbs: ['Offertes', 'OFF-2026-0142'],
    Before: QuoteBefore, After: QuoteAfter,
    beforeDiag: <><strong>Spreadsheet-brain.</strong> Marge — de core-metric van het product — is één KPI-tegel, dan een kolom in een dichte tabel. Onmogelijk om te zien welke regel de deal naar beneden trekt zonder rekenen. Geen vergelijk met target, geen suggesties, geen groepering.</>,
    afterDiag: <><strong>Margin-first composer.</strong> Elke regel heeft zijn eigen margin-balk tegen de 60%-target-lijn — diagnose is visueel. De Margin Doctor rechts maakt van de Pitmaster AI een concrete adviseur met &quot;Pas toe&quot;-knoppen. Regels gegroepeerd per gang (Smoker / Sides / Crew) in plaats van één platte lijst.</>,
  },
  {
    id: 'haccp', label: 'HACCP', Ic: ShieldCheck, num: '03', navId: 'haccp',
    crumbs: ['Keuken & Operatie', 'HACCP'],
    Before: HaccpBefore, After: HaccpAfter,
    beforeDiag: <><strong>Leeg placeholder-scherm.</strong> HACCP is een wettelijke verplichting voor elke catering. Voor een product dat zichzelf neerzet als <em>command center</em> is dit een kritieke gap.</>,
    afterDiag: <><strong>Live control-center.</strong> Status-lint beantwoordt &quot;ben ik nu compliant?&quot; in &lt; 1 seconde. Live temperatuur-sparklines met breach-thresholds vervangen papieren logboeken. Check-off lijst met ownership + timestamps. Audit-readiness card geeft NVWA-grade zekerheid die het merk belooft.</>,
  },
  {
    id: 'eventhub', label: 'Event hub', Ic: Layers, num: '04', navId: 'events',
    crumbs: ['Events & Sales', 'EV-2026-0087'],
    Before: EventHubBefore, After: EventHubAfter,
    beforeDiag: <><strong>Verspreid over 7 schermen.</strong> Voor één klus moet de pitmaster heen en weer springen tussen Events, Offertes, Facturen, Menu &amp; Recepten, Prep, Klanten en HACCP — telkens context wisselen, telkens zoeken. Geen &quot;alles op één plek&quot;.</>,
    afterDiag: <><strong>Alles op één plek.</strong> Eén hub per event met documenten (offerte, factuur, menukaart, prep-lijst, HACCP-pakket) direct downloadbaar. Menukaart wordt <em>auto-gegenereerd</em> uit het menu met een live voorvertoning. Prep, crew, klant en locatie zitten allemaal op dezelfde pagina. Key stats bovenaan, één klik naar bevestigen.</>,
  },
];

export default function RedesignPage() {
  const [screen, setScreen] = useState<ScreenId>('events');
  const [mode, setMode] = useState<Mode>('after');

  useEffect(() => {
    try {
      const s = localStorage.getItem('bbq_rd_screen');
      if (s === 'events' || s === 'quotes' || s === 'haccp' || s === 'eventhub') setScreen(s);
      const m = localStorage.getItem('bbq_rd_mode');
      if (m === 'before' || m === 'after') setMode(m);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { try { localStorage.setItem('bbq_rd_screen', screen); } catch { /* ignore */ } }, [screen]);
  useEffect(() => { try { localStorage.setItem('bbq_rd_mode', mode); } catch { /* ignore */ } }, [mode]);

  const s = SCREENS.find(x => x.id === screen) ?? SCREENS[0];
  const ScreenComp = mode === 'before' ? s.Before : s.After;

  return (
    <>
      <div className="critique">
        <div className="critique-inner">
          <div className="crit-brand">
            <div className="crit-brand-icon"><BrandMark size={20} /></div>
            <div>
              <div className="crit-brand-word">BBQ ARCHITECT · UX REDESIGN</div>
              <div className="crit-brand-sub">4 worst screens, fixed</div>
            </div>
          </div>
          <div className="crit-tabs">
            {SCREENS.map(sc => {
              const Ic = sc.Ic;
              return (
                <button key={sc.id} className={`crit-tab ${screen === sc.id ? 'active' : ''}`} onClick={() => setScreen(sc.id)}>
                  <span className="crit-tab-num">{sc.num}</span>
                  <Ic size={13} />
                  <span>{sc.label}</span>
                </button>
              );
            })}
          </div>
          <div className="crit-spacer" />
          <div className="ba-toggle">
            <button className={`ba-btn before ${mode === 'before' ? 'active' : ''}`} onClick={() => setMode('before')}>
              <XCircle size={12} />Before
            </button>
            <button className={`ba-btn after ${mode === 'after' ? 'active' : ''}`} onClick={() => setMode('after')}>
              <CheckCircle2 size={12} />After
            </button>
          </div>
        </div>
      </div>

      <div className="intro-strip">
        <div className="intro-eyebrow">Redesign · {s.num} / 04</div>
        <h1 className="intro-title">{s.label} — <em>{mode === 'before' ? 'zoals het nu is' : 'zoals het moet zijn'}</em></h1>
        <div className="intro-sub">
          Gekozen op basis van UX-impact: deze vier schermen raken de dagelijkse pitmaster-workflow het hardst. Schakel tussen <em>Before</em> en <em>After</em>, of klik door de vier redesigns.
        </div>
      </div>
      <div className="diagnosis">
        <div className="diag-card before">
          <div className="diag-head"><span className="diag-tag red">Before · probleem</span></div>
          <div className="diag-body">{s.beforeDiag}</div>
        </div>
        <div className="diag-card after">
          <div className="diag-head"><span className="diag-tag green">After · oplossing</span></div>
          <div className="diag-body">{s.afterDiag}</div>
        </div>
      </div>

      <div className="stage">
        <div className="frame">
          <div className="frame-chrome">
            <div className="frame-dots">
              <div className="frame-dot" style={{ background: '#ff5f56' }}></div>
              <div className="frame-dot" style={{ background: '#ffbd2e' }}></div>
              <div className="frame-dot" style={{ background: '#27c93f' }}></div>
            </div>
            <div className="frame-url">app.bbq-architect.nl/{s.id}</div>
            <div style={{ width: 44 }}></div>
          </div>
          <div className="app-shell">
            <Sidebar active={s.navId} />
            <div style={{ minWidth: 0 }}>
              <TopBar crumbs={s.crumbs} />
              <ScreenComp />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
