/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import type { CSSProperties } from 'react';
import {
  Calendar, MessageCircle, Share2, CheckCheck, FileText, UtensilsCrossed,
  Eye, Download, Send, Printer, Receipt, ClipboardList, Truck, ShieldCheck,
  ChefHat, Edit3, Sparkles, Check, Users, Plus, MapPin, Mail, Phone, Navigation,
  ArrowLeft, AlertTriangle,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useOrg } from '@/lib/OrgContext';
import { generatePDF } from '@/lib/pdfGenerator';
import { buildBrandingConfig } from '@/lib/branding';
import { calcLineTotals } from '@/lib/utils';
import { displayEventName, titleCase } from '@/components/redesign/displayHelpers';
import '@/app/redesign/redesign.css';

type TplKey = 'ambacht' | 'modern' | 'slate';

const fmtEur = (n: number) => '€ ' + n.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtEur0 = (n: number) => '€ ' + Math.round(n).toLocaleString('nl-NL');

const moNamesShort = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
const moNamesLong = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];

function parseMenu(m: unknown): number[] {
  if (!m) return [];
  if (Array.isArray(m)) return m.map(x => Number(x)).filter(Boolean);
  if (typeof m === 'string') {
    try { const p = JSON.parse(m); return Array.isArray(p) ? p.map(x => Number(x)).filter(Boolean) : []; }
    catch { return []; }
  }
  return [];
}

function MenuCardAmbacht({ eventName, dateLabel, groups }: { eventName: string; dateLabel: string; groups: Array<{ title: string; items: Array<{ n: string; s?: string }> }> }) {
  return (
    <div style={{ background: '#f5eedf', color: '#1a1410', height: '100%', padding: '24px 22px 18px', fontFamily: 'var(--font-artisan)', position: 'relative' }}>
      <div style={{ textAlign: 'center', borderBottom: '1px solid rgba(0,0,0,.15)', paddingBottom: 12, marginBottom: 16 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 9, letterSpacing: '.28em', fontWeight: 700, color: '#9e781c', textTransform: 'uppercase' }}>Hop &amp; Bites · Ambacht</div>
        <div style={{ fontSize: 22, fontStyle: 'italic', fontWeight: 600, marginTop: 6, lineHeight: 1.1 }}>{eventName}</div>
        <div style={{ fontFamily: 'var(--font-sans)', fontSize: 9.5, letterSpacing: '.18em', color: '#6b5a3e', marginTop: 7, textTransform: 'uppercase' }}>{dateLabel}</div>
      </div>
      {groups.map((g, gi) => (
        <div key={gi} style={{ marginBottom: 10 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 9, letterSpacing: '.22em', color: '#9e781c', fontWeight: 700, textTransform: 'uppercase', marginBottom: 6 }}>— {g.title} —</div>
          {g.items.map((it, ii) => (
            <div key={ii}>
              <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.3 }}>{it.n}</div>
              {it.s && <div style={{ fontFamily: 'var(--font-sans)', fontSize: 11, color: '#6b5a3e', marginBottom: 6 }}>{it.s}</div>}
            </div>
          ))}
        </div>
      ))}
      <div style={{ position: 'absolute', bottom: 14, left: 0, right: 0, textAlign: 'center', fontFamily: 'var(--font-sans)', fontSize: 8, color: '#9e781c', letterSpacing: '.25em', textTransform: 'uppercase', fontWeight: 700 }}>— Geniet ervan —</div>
    </div>
  );
}

function MenuCardModern({ eventName, dateLabel, groups }: { eventName: string; dateLabel: string; groups: Array<{ title: string; items: Array<{ n: string; s?: string }> }> }) {
  return (
    <div style={{ background: '#ffffff', color: '#0a0a0c', height: '100%', padding: '28px 22px', fontFamily: 'var(--font-sans)', position: 'relative' }}>
      <div style={{ width: 28, height: 3, background: '#FFBF00', marginBottom: 18 }}></div>
      <div style={{ fontSize: 9, letterSpacing: '.25em', fontWeight: 700, color: '#9e781c', textTransform: 'uppercase', marginBottom: 4 }}>Hop &amp; Bites</div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 300, letterSpacing: '-.01em', lineHeight: 1.1, marginBottom: 6 }}>{eventName}</div>
      <div style={{ fontSize: 10, color: '#6b6b6b', letterSpacing: '.04em', marginBottom: 22, fontVariantNumeric: 'tabular-nums' }}>{dateLabel}</div>
      {groups.map((g, gi) => (
        <div key={gi} style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 4 }}>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 400, color: '#FFBF00' }}>{String(gi + 1).padStart(2, '0')}</span>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{g.title}</span>
          </div>
          <div style={{ fontSize: 10.5, color: '#707070', marginLeft: 32 }}>{g.items.map(x => x.n).join(' · ')}</div>
        </div>
      ))}
    </div>
  );
}

function MenuCardSlate({ eventName, dateLabel, groups }: { eventName: string; dateLabel: string; groups: Array<{ title: string; items: Array<{ n: string; s?: string }> }> }) {
  return (
    <div style={{ background: '#1a1a1c', color: '#f0e8d0', height: '100%', padding: '24px 22px 18px', fontFamily: 'var(--font-sans)', position: 'relative', backgroundImage: 'radial-gradient(ellipse at top right, rgba(196,163,90,.15), transparent 60%)' }}>
      <div style={{ textAlign: 'center', borderBottom: '1px solid rgba(196,163,90,.2)', paddingBottom: 12, marginBottom: 16 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 8.5, letterSpacing: '.3em', fontWeight: 700, color: '#c4a35a', textTransform: 'uppercase' }}>★ Hop &amp; Bites ★</div>
        <div style={{ fontFamily: 'var(--font-artisan)', fontSize: 20, fontStyle: 'italic', fontWeight: 600, marginTop: 8, lineHeight: 1.1, color: '#fff' }}>{eventName}</div>
        <div style={{ fontSize: 9, letterSpacing: '.18em', color: '#8a7c60', marginTop: 8, textTransform: 'uppercase' }}>{dateLabel}</div>
      </div>
      {groups.map((g, gi) => (
        <div key={gi} style={{ marginBottom: 10 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 8.5, letterSpacing: '.28em', color: '#c4a35a', fontWeight: 700, textTransform: 'uppercase', marginBottom: 6, textAlign: 'center' }}>{g.title}</div>
          {g.items.map((it, ii) => (
            <div key={ii} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>{it.n}</div>
              {it.s && <div style={{ fontSize: 10.5, color: '#9a8a6a', marginBottom: 4 }}>{it.s}</div>}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export default function EventHubPage() {
  const params = useParams();
  const router = useRouter();
  const eventId = parseInt(String(params.id), 10);

  const { orgId } = useOrg();
  const [event, setEvent] = useState<any>(null);
  const [offerte, setOfferte] = useState<any>(null);
  const [prepTasks, setPrepTasks] = useState<any[]>([]);
  const [factuur, setFactuur] = useState<any>(null);
  const [recepten, setRecepten] = useState<any[]>([]);
  const [gerechten, setGerechten] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>(null);
  const [klant, setKlant] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tpl, setTpl] = useState<TplKey>('ambacht');
  const [prepState, setPrepState] = useState<Record<number, boolean>>({});
  const [downloading, setDownloading] = useState<string | null>(null);

  useEffect(() => {
    if (!eventId || Number.isNaN(eventId)) return;
    (async () => {
      const { data: ev } = await supabase.from('events').select('*').eq('id', eventId).single();
      if (!ev) { setLoading(false); return; }
      setEvent(ev);
      const [rOff, rPrep, rFact, rRec, rGer, rKlant, rSet] = await Promise.all([
        ev.offerte_id ? supabase.from('offertes').select('*').eq('id', ev.offerte_id).single() : Promise.resolve({ data: null }) as any,
        supabase.from('prep_tasks').select('*').eq('event_id', eventId).order('dagen', { ascending: false }),
        supabase.from('facturen').select('*').eq('client_naam', ev.client_naam || '__none__').limit(1),
        supabase.from('recepten').select('*'),
        supabase.from('gerechten').select('*'),
        ev.client_naam ? supabase.from('klanten').select('*').eq('naam', ev.client_naam).limit(1) : Promise.resolve({ data: null }) as any,
        supabase.from('settings').select('*').limit(1).maybeSingle(),
      ]);
      if (rOff && 'data' in rOff && rOff.data) setOfferte(rOff.data);
      setPrepTasks(rPrep.data || []);
      const initState: Record<number, boolean> = {};
      (rPrep.data || []).forEach((p: any) => { initState[p.id] = !!p.done; });
      setPrepState(initState);
      if (rFact.data && rFact.data.length > 0) setFactuur(rFact.data[0]);
      setRecepten(rRec.data || []);
      setGerechten(rGer.data || []);
      if (rSet && 'data' in rSet && rSet.data) setSettings(rSet.data);
      if (rKlant && 'data' in rKlant && rKlant.data && rKlant.data.length > 0) setKlant(rKlant.data[0]);
      setLoading(false);
    })();
  }, [eventId]);

  const derived = useMemo(() => {
    if (!event) return null;
    const guests = event.guests || 0;
    const omzet = (event.guests || 0) * (event.ppp || 0);
    let cogs = 0;
    let margin: number | null = null;
    if (offerte) {
      let rawItems: unknown = offerte.items;
      if (typeof rawItems === 'string') { try { rawItems = JSON.parse(rawItems); } catch { rawItems = []; } }
      const lineItems = Array.isArray(rawItems) ? rawItems as Array<Record<string, unknown>> : [];
      const hasCostField = lineItems.length > 0 && lineItems.every(it => Number(it.cost) > 0);
      if (hasCostField) {
        const revenue = lineItems.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.prijs) || 0), 0);
        cogs = lineItems.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.cost) || 0), 0);
        margin = revenue > 0 ? ((revenue - cogs) / revenue) * 100 : null;
      }
    }
    const evDate = new Date(event.date + 'T17:00:00');
    const daysLeft = Math.max(0, Math.ceil((evDate.getTime() - Date.now()) / 86400000));
    /* Fixed horizon of max(60d, days-since-created) so the ring is never an uninformative empty circle on fresh events */
    const createdAt = event.created_at ? new Date(event.created_at) : evDate;
    const daysSinceCreated = Math.max(0, Math.ceil((evDate.getTime() - createdAt.getTime()) / 86400000));
    const daysTotal = Math.max(60, daysSinceCreated);
    const progress = daysTotal === 0 ? 1 : Math.max(0, Math.min(1, (daysTotal - daysLeft) / daysTotal));
    return { guests, omzet, cogs, margin, daysLeft, progress };
  }, [event, offerte]);

  const prepDoneCount = prepTasks.filter(p => prepState[p.id]).length;
  const prepReady = prepTasks.length === 0 ? 0 : Math.round((prepDoneCount / prepTasks.length) * 100);

  const menuGroups = useMemo(() => {
    if (!event) return [] as Array<{ title: string; items: Array<{ n: string; s?: string }> }>;
    const menuIds = parseMenu(event.menu);
    if (menuIds.length === 0) {
      return [{ title: 'Menu', items: [{ n: 'Nog geen menu gekoppeld', s: 'Voeg recepten toe via de event-editor' }] }];
    }
    const items = menuIds
      .map(id => recepten.find(r => r.id === id))
      .filter(Boolean)
      .map((r: any) => ({ n: r.naam || '—', s: r.categorie || r.type || undefined }));
    const groupsByCat: Record<string, Array<{ n: string; s?: string }>> = {};
    for (const r of menuIds.map(id => recepten.find(x => x.id === id)).filter(Boolean) as any[]) {
      const cat = r.categorie || 'Hoofdgerechten';
      if (!groupsByCat[cat]) groupsByCat[cat] = [];
      groupsByCat[cat].push({ n: r.naam || '—' });
    }
    if (Object.keys(groupsByCat).length === 0) return [{ title: 'Menu', items }];
    return Object.entries(groupsByCat).map(([title, its]) => ({ title, items: its }));
  }, [event, recepten]);

  async function togglePrep(id: number) {
    const prev = prepState[id];
    const next = !prev;
    /* Optimistic update */
    setPrepState(s => ({ ...s, [id]: next }));
    const { error } = await supabase.from('prep_tasks').update({ done: next }).eq('id', id);
    if (error) {
      /* Rollback on failure */
      setPrepState(s => ({ ...s, [id]: prev }));
      // eslint-disable-next-line no-console
      console.error('[PREP] toggle failed, reverted:', error.message);
      if (typeof window !== 'undefined') {
        alert('Kon taak niet bijwerken. Probeer opnieuw.');
      }
    }
  }

  async function downloadOffertePdf() {
    if (!offerte) return;
    setDownloading('offerte');
    try {
      const totals = calcLineTotals(offerte.items);
      const branding = buildBrandingConfig(settings);
      await generatePDF({ type: 'offerte', form: offerte, settings, totals, branding, orgId: orgId || undefined });
    } finally { setDownloading(null); }
  }

  async function downloadMenukaartPdf() {
    if (!offerte) { alert('Maak eerst een offerte aan.'); return; }
    setDownloading('menukaart');
    try {
      const branding = buildBrandingConfig(settings);
      await generatePDF({ type: 'menukaart', form: offerte, settings, gerechten, branding, orgId: orgId || undefined });
    } finally { setDownloading(null); }
  }

  async function downloadFactuurPdf() {
    if (!factuur) { router.push('/facturen'); return; }
    setDownloading('factuur');
    try {
      const totals = calcLineTotals(factuur.items);
      const branding = buildBrandingConfig(settings);
      await generatePDF({ type: 'factuur', form: factuur, settings, totals, branding, orgId: orgId || undefined });
    } finally { setDownloading(null); }
  }

  async function downloadHaccpPdf() {
    setDownloading('haccp');
    try {
      const branding = buildBrandingConfig(settings);
      const { data: records } = await supabase.from('haccp_records').select('*').eq('event_id', eventId);
      await generatePDF({
        type: 'haccp',
        settings,
        branding,
        orgId: orgId || undefined,
        eventName: event?.name || '',
        eventDatum: event?.date || '',
        eventGasten: event?.guests || 0,
        records: records || [],
      });
    } finally { setDownloading(null); }
  }

  function downloadPrepList() {
    if (prepTasks.length === 0) { alert('Geen prep-taken om te exporteren.'); return; }
    const title = `Prep-lijst — ${displayEventName(event?.name)} — ${event?.date || ''}`;
    const body = prepTasks.map(p => {
      const d = typeof p.dagen === 'number' ? (p.dagen === 0 ? 'Op de dag' : `T-${p.dagen}d`) : '';
      return `[${prepState[p.id] ? 'x' : ' '}] ${p.text} — ${d}`;
    }).join('\n');
    const blob = new Blob([title + '\n\n' + body], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `prep-${event?.id || 'event'}-${event?.date || ''}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function downloadLaadlijst() {
    if (!event) return;
    const lines: string[] = [];
    lines.push(`Laadlijst — ${displayEventName(event.name)} — ${event.date}`);
    lines.push(`${event.guests || 0} gasten · Locatie: ${event.location || '—'}`);
    lines.push('');
    lines.push('## Menu');
    for (const g of menuGroups) {
      lines.push(`\n${g.title}`);
      for (const it of g.items) lines.push(`  - ${it.n}${it.s ? ' (' + it.s + ')' : ''}`);
    }
    if ((event.draaiboek || []).length > 0) {
      lines.push('\n## Draaiboek');
      for (const slot of event.draaiboek) lines.push(`  ${slot.tijd || '—'} — ${slot.activiteit || ''}`);
    }
    if ((event.team || []).length > 0) {
      lines.push('\n## Crew');
      for (const p of event.team) lines.push(`  - ${p}`);
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `laadlijst-${event.id}-${event.date}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function printMenukaart() {
    /* Triggers browser print dialog.
       CSS @media print rules in redesign.css hide everything except .mk-printable. */
    if (typeof window === 'undefined') return;
    window.print();
  }

  async function markBevestigd() {
    if (!event) return;
    await supabase.from('events').update({ status: 'confirmed' }).eq('id', event.id);
    setEvent({ ...event, status: 'confirmed' });
  }

  if (loading) {
    return (
      <div className="redesign-root" style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
        Laden…
      </div>
    );
  }

  if (!event) {
    return (
      <div className="redesign-root" style={{ padding: 40, textAlign: 'center' }}>
        <div style={{ maxWidth: 420, margin: '80px auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 56, height: 56, borderRadius: 14, background: 'rgba(130,130,130,.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)' }}>
            <AlertTriangle size={24} />
          </div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 300, fontSize: 22, margin: 0 }}>Event niet gevonden</h2>
          <p style={{ color: 'var(--muted)', fontSize: 13, lineHeight: 1.5, margin: 0 }}>
            Deze event bestaat niet (meer) of je hebt er geen toegang tot. Controleer de URL of ga terug naar het overzicht.
          </p>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button className="btn btn-ghost" onClick={() => router.back()}><ArrowLeft size={14} />Terug</button>
            <button className="btn btn-primary" onClick={() => router.push('/events')}>Naar events</button>
          </div>
        </div>
      </div>
    );
  }

  const evDate = new Date(event.date + 'T17:00:00');
  const dateLabel = `${evDate.getDate()} ${moNamesLong[evDate.getMonth()]} ${evDate.getFullYear()}`;
  const dateUpper = `${evDate.getDate()} ${moNamesShort[evDate.getMonth()].toUpperCase()} ${evDate.getFullYear()}`;
  const circumference = 2 * Math.PI * 86;

  const statusLabel = event.status === 'confirmed' ? 'Bevestigd' : event.status === 'optie' ? 'Optie · wacht op akkoord' : event.status === 'completed' ? 'Afgerond' : 'Nieuw';
  const statusPillVariant = event.status === 'confirmed' ? 'p-ok' : event.status === 'completed' ? 'p-draft' : event.status === 'optie' ? 'p-optie' : 'p-send';

  const saldo = factuur ? (Number(factuur.totaal) || 0) - (Number(factuur.betaald) || 0) : 0;
  const saldoLabel = factuur
    ? (saldo === 0 ? 'Volledig betaald' : saldo > 0 ? `Open · ${factuur.nummer}` : `Overbetaald · ${factuur.nummer}`)
    : 'Geen factuur';

  return (
    <div className="redesign-root">
      <div className="main" style={{ padding: '24px 0 40px' }}>
        <div style={{ marginBottom: 12 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => router.push('/events')}>
            <ArrowLeft size={14} />Terug naar events
          </button>
        </div>
        <div className="eh-hero">
          <div className="eh-hero-bg"></div>
          <div className="eh-hero-content">
            <div className="eh-hero-left">
              <div>
                <div className="eh-hero-eyebrow"><span className="dot"></span>Event · {event.id ? `EV-${String(event.id).padStart(4, '0')}` : ''}</div>
                <h1 className="eh-hero-title">{titleCase(displayEventName(event.name))}</h1>
                <div className="eh-hero-sub">
                  <span className={`pill ${statusPillVariant}`}>{statusLabel}</span>
                  <span className="sep">·</span>
                  <span>{event.guests || 0} gasten</span>
                  <span className="sep">·</span>
                  <span>{dateLabel}</span>
                  {event.location && <>
                    <span className="sep">·</span>
                    <span>{event.location}</span>
                  </>}
                  {event.type && <>
                    <span className="sep">·</span>
                    <span>{event.type}</span>
                  </>}
                </div>
              </div>
              <div className="eh-hero-actions">
                <button className="btn btn-ghost" onClick={() => router.push('/agenda')}><Calendar size={14} />In agenda</button>
                {event.client_email && (
                  <a className="btn btn-ghost" href={`mailto:${event.client_email}`}><MessageCircle size={14} />Contact klant</a>
                )}
                <button className="btn btn-ghost"><Share2 size={14} />Deel</button>
                {event.status !== 'confirmed' && (
                  <button className="btn btn-primary" onClick={markBevestigd}><CheckCheck size={14} />Markeer bevestigd</button>
                )}
              </div>
            </div>
            <div className="eh-countdown">
              <div className="eh-countdown-ring">
                <svg viewBox="0 0 200 200">
                  <defs>
                    <linearGradient id="countdownGradHub" x1="0" x2="1" y1="0" y2="1">
                      <stop offset="0%" stopColor="#FFBF00" />
                      <stop offset="60%" stopColor="#ff8c20" />
                      <stop offset="100%" stopColor="#ff5010" />
                    </linearGradient>
                  </defs>
                  <circle className="bg-ring" cx="100" cy="100" r="86" />
                  <circle className="fg-ring" cx="100" cy="100" r="86"
                    stroke="url(#countdownGradHub)"
                    strokeDasharray={circumference}
                    strokeDashoffset={circumference * (1 - (derived?.progress ?? 0))} />
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
                  <div className="eh-countdown-num">{derived?.daysLeft ?? 0}</div>
                  <div className="eh-countdown-lbl">Dagen te gaan</div>
                  <div className="eh-countdown-sub">tot {dateUpper}</div>
                </div>
              </div>
            </div>
          </div>
          <div className="eh-hero-stats">
            <div className="eh-hero-stat">
              <div className="l">Gasten</div>
              <div className="v">{event.guests || 0}</div>
              <div className="s">{event.type || 'Event'}</div>
            </div>
            <div className="eh-hero-stat">
              <div className="l">Omzet</div>
              <div className="v">{fmtEur0(derived?.omzet ?? 0)}</div>
              <div className="s">{event.ppp ? `€ ${event.ppp}/p` : '—'}</div>
            </div>
            <div className="eh-hero-stat">
              <div className="l">Marge</div>
              <div className={`v ${derived?.margin != null && derived.margin >= 55 ? 'ok' : derived?.margin != null && derived.margin >= 40 ? 'warn' : 'muted'}`}>
                {derived?.margin != null ? `${derived.margin.toFixed(1)}%` : '—'}
              </div>
              <div className="s">
                {derived?.margin != null
                  ? fmtEur0((derived.omzet || 0) - (derived.cogs || 0))
                  : (offerte ? 'Geen cost per regel' : 'Geen offerte')}
              </div>
              {derived?.margin != null && (
                <div className="bar"><div className="fill" style={{ width: `${Math.min(derived.margin, 100)}%`, background: derived.margin >= 55 ? 'var(--green)' : 'var(--amber)' }}></div></div>
              )}
            </div>
            <div className="eh-hero-stat">
              <div className="l">Prep-ready</div>
              <div className={`v ${prepReady >= 70 ? 'ok' : prepReady >= 30 ? 'warn' : 'muted'}`}>{prepReady}%</div>
              <div className="s">{prepDoneCount} / {prepTasks.length} taken</div>
              <div className="bar"><div className="fill" style={{ width: `${prepReady}%`, background: prepReady >= 70 ? 'var(--green)' : 'var(--amber)' }}></div></div>
            </div>
            <div className="eh-hero-stat">
              <div className="l">Saldo</div>
              <div className={`v ${factuur && saldo === 0 ? 'ok' : saldo > 0 ? 'warn' : 'muted'}`}>{fmtEur0(saldo)}</div>
              <div className="s">{saldoLabel}</div>
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
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                  {offerte ? 'Offerte gekoppeld' : 'Geen offerte'} · {factuur ? 'factuur actief' : 'geen factuur'}
                </span>
              </div>

              <div className="doc-primary-row">
                <div className="doc-primary" onClick={() => offerte && router.push(`/offertes/${offerte.id}/view`)}>
                  <div className="doc-primary-top">
                    <div className="doc-primary-icon"><FileText size={20} /></div>
                    <div className="doc-primary-head">
                      <div className="t">{offerte ? `Offerte ${offerte.nummer || ''}` : 'Geen offerte'}</div>
                      <div className="s">
                        {offerte
                          ? `${offerte.status || 'concept'} · ${(offerte.items || []).length} regels`
                          : 'Maak een offerte voor dit event'}
                      </div>
                    </div>
                    {offerte && (
                      <span className={`doc-primary-tag ${offerte.status === 'verzonden' ? 'sent' : 'ready'}`}>
                        {offerte.status === 'verzonden' ? 'Verstuurd' : offerte.status || 'Concept'}
                      </span>
                    )}
                  </div>
                  <div className="doc-primary-actions">
                    <button disabled={!offerte} onClick={(e) => { e.stopPropagation(); if (offerte) router.push(`/offertes/${offerte.id}/view`); }}>
                      <Eye size={13} />Bekijk
                    </button>
                    <button disabled={!offerte || downloading === 'offerte'} onClick={(e) => { e.stopPropagation(); downloadOffertePdf(); }}>
                      <Download size={13} />{downloading === 'offerte' ? 'Bezig…' : 'PDF'}
                    </button>
                    <button className="primary" onClick={(e) => {
                      e.stopPropagation();
                      if (!offerte) {
                        router.push(`/offerte-editor?event=${encodeURIComponent(event.name || '')}&gasten=${event.guests || 50}&ppp=${event.ppp || 45}&datum=${event.date || ''}&client=${encodeURIComponent(event.client_naam || '')}`);
                      } else {
                        router.push(`/offertes?edit=${offerte.id}`);
                      }
                    }}>
                      {offerte ? <><Edit3 size={13} />Bewerken</> : <><Plus size={13} />Maak offerte</>}
                    </button>
                  </div>
                </div>
                <div className="doc-primary">
                  <div className="doc-primary-top">
                    <div className="doc-primary-icon"><UtensilsCrossed size={20} /></div>
                    <div className="doc-primary-head">
                      <div className="t">Menukaart</div>
                      <div className="s">
                        {menuGroups[0]?.items[0]?.n === 'Nog geen menu gekoppeld'
                          ? 'Nog geen menu samengesteld'
                          : `Auto-gegenereerd · klaar voor ${event.guests || 0} gasten`}
                      </div>
                    </div>
                    <span className="doc-primary-tag ready">Live</span>
                  </div>
                  <div className="doc-primary-actions">
                    <button onClick={() => {
                      const el = document.querySelector('.mk-preview-wrap');
                      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }}>
                      <Eye size={13} />Voorvertoning
                    </button>
                    <button disabled={!offerte || downloading === 'menukaart'} onClick={downloadMenukaartPdf}>
                      <Download size={13} />{downloading === 'menukaart' ? 'Bezig…' : 'PDF'}
                    </button>
                    <button className="primary" onClick={printMenukaart}>
                      <Printer size={13} />Print {event.guests || 0}×
                    </button>
                  </div>
                </div>
              </div>

              <div className="doc-secondary-grid">
                {([
                  {
                    key: 'factuur' as const,
                    Ic: Receipt,
                    t: factuur ? `Factuur ${factuur.nummer || ''}` : 'Factuur',
                    s: factuur ? (factuur.status || 'concept') : 'Bij akkoord',
                    onClick: () => factuur ? router.push(`/facturen?id=${factuur.id}`) : router.push('/facturen'),
                    download: factuur ? downloadFactuurPdf : undefined,
                    disabled: !factuur,
                  },
                  {
                    key: 'prep' as const,
                    Ic: ClipboardList,
                    t: 'Prep-lijst',
                    s: `${prepTasks.length} taken`,
                    onClick: () => router.push('/agenda'),
                    download: prepTasks.length > 0 ? downloadPrepList : undefined,
                    disabled: prepTasks.length === 0,
                  },
                  {
                    key: 'laadlijst' as const,
                    Ic: Truck,
                    t: 'Laadlijst',
                    s: 'Ingr. + crew + tijden',
                    onClick: () => router.push(`/events/${event.id}`),
                    download: downloadLaadlijst,
                    disabled: false,
                  },
                  {
                    key: 'haccp' as const,
                    Ic: ShieldCheck,
                    t: 'HACCP-pakket',
                    s: 'Records + audit',
                    onClick: () => router.push('/haccp'),
                    download: downloadHaccpPdf,
                    disabled: downloading === 'haccp',
                  },
                ]).map(d => {
                  const Ic = d.Ic;
                  return (
                    <div key={d.key} className="doc-secondary" onClick={d.onClick}>
                      <div className="i"><Ic size={14} /></div>
                      <div className="c">
                        <div className="t">{d.t}</div>
                        <div className="s">{d.s}</div>
                      </div>
                      <button
                        className="icon-btn"
                        style={{ width: 24, height: 24, opacity: d.disabled ? 0.35 : 1, cursor: d.disabled ? 'not-allowed' : 'pointer' }}
                        aria-label={`Download ${d.t}`}
                        title={d.disabled ? `${d.t} niet beschikbaar` : `Download ${d.t}`}
                        onClick={(e) => { e.stopPropagation(); if (!d.disabled && d.download) d.download(); }}
                        disabled={d.disabled}
                      >
                        <Download size={12} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="metal">
              <div className="metal-head">
                <div className="hstack"><ChefHat size={15} color="var(--brand-gold)" /><span style={{ fontSize: 14, fontWeight: 600 }}>Menu &amp; automatische menukaart</span></div>
                <div className="hstack" style={{ gap: 6 }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => router.push(`/events/${event.id}`)}><Edit3 size={14} />Menu aanpassen</button>
                  <button className="btn btn-primary btn-sm" onClick={printMenukaart}><Printer size={14} />Print {event.guests || 0}×</button>
                </div>
              </div>
              <div style={{ padding: 20, display: 'grid', gridTemplateColumns: '1fr 300px', gap: 24 }}>
                <div>
                  <div style={{ fontSize: 11, letterSpacing: '.15em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 700, marginBottom: 10 }}>Menu-samenstelling</div>
                  {menuGroups.map((g, gi) => (
                    <div key={gi} style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 10, letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--brand-gold)', fontWeight: 700, marginBottom: 6 }}>{g.title}</div>
                      {g.items.map((it, ii) => (
                        <div key={ii} style={{ padding: '6px 0', borderTop: ii === 0 ? 'none' : '1px solid rgba(130,130,130,.08)', display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--brand-gold)' }}></div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 13, fontWeight: 500 }}>{it.n}</div>
                            {it.s && <div style={{ fontSize: 11, color: 'var(--muted)' }}>{it.s}</div>}
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                  <div style={{ marginTop: 12, padding: '10px 12px', background: 'rgba(255,191,0,.06)', border: '1px solid rgba(255,191,0,.2)', borderRadius: 9, fontSize: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Sparkles size={14} color="var(--brand)" />
                    <div style={{ flex: 1, color: 'var(--muted)' }}>Menukaart wordt automatisch gegenereerd — template <strong style={{ color: 'var(--text)' }}>{tpl === 'ambacht' ? 'Ambacht' : tpl === 'modern' ? 'Modern' : 'Slate'}</strong>.</div>
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, letterSpacing: '.15em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 700, marginBottom: 10, textAlign: 'center' }}>Live voorvertoning</div>
                  <div className="mk-preview-wrap">
                    <div className="mk-preview-card mk-printable">
                      {tpl === 'ambacht' && <MenuCardAmbacht eventName={titleCase(displayEventName(event.name))} dateLabel={dateUpper} groups={menuGroups} />}
                      {tpl === 'modern' && <MenuCardModern eventName={titleCase(displayEventName(event.name))} dateLabel={dateUpper} groups={menuGroups} />}
                      {tpl === 'slate' && <MenuCardSlate eventName={titleCase(displayEventName(event.name))} dateLabel={dateUpper} groups={menuGroups} />}
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
                <div className="hstack"><ClipboardList size={15} color="var(--brand-gold)" /><span style={{ fontSize: 14, fontWeight: 600 }}>Prep-schema · {derived?.daysLeft ?? 0}d tot event</span></div>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>{prepDoneCount} / {prepTasks.length} afgerond</span>
              </div>
              <div style={{ padding: 0 }}>
                {prepTasks.length === 0 ? (
                  <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
                    Nog geen prep-taken — voeg toe via de event-editor.
                  </div>
                ) : prepTasks.map((c, i) => {
                  const done = !!prepState[c.id];
                  const dagenLabel = typeof c.dagen === 'number' ? (c.dagen === 0 ? 'Op de dag' : `T-${c.dagen}d`) : '';
                  return (
                    <div key={c.id} style={{ display: 'grid', gridTemplateColumns: '26px 1fr auto', gap: 12, alignItems: 'center', padding: '11px 18px', borderTop: i === 0 ? 'none' : '1px solid rgba(130,130,130,.08)', cursor: 'pointer' } as CSSProperties} onClick={() => togglePrep(c.id)}>
                      <div style={{ width: 20, height: 20, borderRadius: 5, border: '1.5px solid ' + (done ? 'var(--green)' : 'var(--muted)'), background: done ? 'var(--green)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#000' }}>
                        {done && <Check size={13} />}
                      </div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 500, color: done ? 'var(--muted)' : 'var(--text)', textDecoration: done ? 'line-through' : 'none' }}>{c.text || '—'}</div>
                        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>{dagenLabel}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="client-card">
              <div className="cc-row">
                <div className="cc-avatar">{(event.client_naam || 'VD').split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()}</div>
                <div className="cc-meta">
                  <div className="n">{event.client_naam || 'Geen klant'}</div>
                  <div className="s">{klant ? `${klant.type || 'Klant'} · ${klant.postcode || ''}` : 'Via event'}</div>
                </div>
                {event.client_tel && <a className="icon-btn" href={`tel:${event.client_tel}`} aria-label={`Bel ${event.client_naam || 'klant'}`} title={`Bel ${event.client_tel}`}><Phone size={14} /></a>}
                {event.client_email && <a className="icon-btn" href={`mailto:${event.client_email}`} aria-label={`Email ${event.client_naam || 'klant'}`} title={`Email ${event.client_email}`}><Mail size={14} /></a>}
              </div>
              <div style={{ padding: '12px 0 0', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 7, fontSize: 12 }}>
                {event.client_email && <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Mail size={12} color="var(--muted)" /><span style={{ color: 'var(--muted)' }}>{event.client_email}</span></div>}
                {event.client_tel && <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Phone size={12} color="var(--muted)" /><span style={{ color: 'var(--muted)' }}>{event.client_tel}</span></div>}
                {event.client_adres && <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><MapPin size={12} color="var(--muted)" /><span style={{ color: 'var(--muted)' }}>{event.client_adres}</span></div>}
              </div>
              <div className="cc-stats" style={{ marginTop: 12 }}>
                <div><div className="k">Omzet</div><div className="v">{fmtEur0(derived?.omzet ?? 0)}</div></div>
                <div>
                  <div className="k">Marge</div>
                  <div className="v" style={{ color: derived?.margin != null && derived.margin >= 55 ? 'var(--green)' : derived?.margin != null ? 'var(--brand-gold)' : 'var(--muted)' }}>
                    {derived?.margin != null ? derived.margin.toFixed(0) + '%' : '—'}
                  </div>
                </div>
              </div>
            </div>

            <div className="metal">
              <div className="metal-head" style={{ padding: '12px 16px' }}>
                <div className="hstack"><MapPin size={14} color="var(--brand-gold)" /><span style={{ fontSize: 13, fontWeight: 600 }}>Locatie &amp; tijden</span></div>
              </div>
              <div style={{ padding: 14, fontSize: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {(event.draaiboek || []).length > 0 ? (event.draaiboek as any[]).slice(0, 5).map((slot, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--muted)' }}>{slot.activiteit || '—'}</span>
                    <span className="tabular">{slot.tijd || ''}</span>
                  </div>
                )) : (
                  <div style={{ color: 'var(--muted)' }}>Geen draaiboek — voeg tijdslots toe via event-editor.</div>
                )}
                <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }}></div>
                <div style={{ color: 'var(--muted)' }}>{event.location || 'Locatie onbekend'}</div>
                {event.location && (
                  <a className="btn btn-ghost btn-sm" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.location)}`} target="_blank" rel="noopener" style={{ marginTop: 4, width: '100%', justifyContent: 'center' } as CSSProperties}>
                    <Navigation size={14} />Route plannen
                  </a>
                )}
              </div>
            </div>

            {(event.team || []).length > 0 && (
              <div className="metal">
                <div className="metal-head" style={{ padding: '12px 16px' }}>
                  <div className="hstack"><Users size={14} color="var(--brand-gold)" /><span style={{ fontSize: 13, fontWeight: 600 }}>Crew</span></div>
                </div>
                <div style={{ padding: 12 }}>
                  {(event.team as string[]).map((p, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 4px', borderTop: i === 0 ? 'none' : '1px solid rgba(130,130,130,.08)' }}>
                      <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(135deg, #c4a35a, #9e781c)', color: '#0a0a0c', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)' }}>{p.slice(0, 2).toUpperCase()}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 500 }}>{p}</div>
                        <div style={{ fontSize: 10.5, color: 'var(--muted)' }}>Crew</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
