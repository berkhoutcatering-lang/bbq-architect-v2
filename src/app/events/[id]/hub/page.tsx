/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import type { CSSProperties } from 'react';
import {
  Calendar, MessageCircle, Share2, CheckCheck, FileText, UtensilsCrossed,
  Eye, Download, Send, Printer, Receipt, ClipboardList, Truck, ShieldCheck,
  ChefHat, Edit3, Sparkles, Check, Users, Plus, MapPin, Mail, Phone, Navigation,
  ArrowLeft, AlertTriangle, Flame, Thermometer, Star, Flag, Pencil,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useOrg } from '@/lib/OrgContext';
import { generatePDF } from '@/lib/pdfGenerator';
import { buildBrandingConfig } from '@/lib/branding';
import { calcLineTotals } from '@/lib/utils';
import { displayEventName, titleCase } from '@/components/redesign/displayHelpers';
import { useActiveResource } from '@/lib/ActiveResourceContext';
import EventMenuKaartBuilder from '@/components/EventMenuKaartBuilder';
import { MenuCard, type MenuCardTemplate } from '@/components/redesign/MenuCards';
import EventEditor from '@/components/events/EventEditor';
import CoursesEditor from '@/components/events/CoursesEditor';
import AllergiesEditor from '@/components/events/AllergiesEditor';
import TemplatePreview from '@/components/template-editor/TemplatePreview';
import type { PdfTemplate } from '@/types/template.types';
import '@/components/redesign/redesign.css';

const MENUKAART_STYLE_TO_NAME: Record<MenuCardTemplate, string> = {
  ambacht: 'Menukaart — Ambacht',
  modern: 'Menukaart — Modern',
  slate: 'Menukaart — Slate',
};
const MENUKAART_STYLE_TO_STARTER: Record<MenuCardTemplate, string> = {
  ambacht: 'menukaart-ambacht',
  modern: 'menukaart-modern',
  slate: 'menukaart-slate',
};

type TplKey = MenuCardTemplate;

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
  const [haccpRecords, setHaccpRecords] = useState<any[]>([]);
  const [serviceLogs, setServiceLogs] = useState<any[]>([]);
  const [reflectie, setReflectie] = useState<any>(null);
  const [inkooplijst, setInkooplijst] = useState<any>(null);
  const [gangen, setGangen] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tpl, setTpl] = useState<TplKey>('ambacht');
  const [prepState, setPrepState] = useState<Record<number, boolean>>({});
  const [downloading, setDownloading] = useState<string | null>(null);
  const [menuBuilderOpen, setMenuBuilderOpen] = useState(false);
  const [menuIds, setMenuIds] = useState<number[]>([]);
  const [menuBuilderQuery, setMenuBuilderQuery] = useState('');
  const [menuSaving, setMenuSaving] = useState(false);
  const [menuTemplates, setMenuTemplates] = useState<PdfTemplate[]>([]);

  useEffect(() => {
    if (event) setMenuIds(parseMenu(event.menu));
  }, [event]);

  const { setActive: setActiveResource } = useActiveResource();
  useEffect(() => {
    if (!event) return;
    const naam = displayEventName(event.name) || event.name || `Event #${eventId}`;
    let datumDisplay = '';
    if (event.date) {
      const d = new Date(event.date + 'T00:00:00');
      if (!isNaN(d.getTime())) datumDisplay = `${d.getDate()} ${moNamesShort[d.getMonth()]}`;
    }
    setActiveResource({
      kind: 'event',
      id: eventId,
      label: datumDisplay ? `${naam} — ${datumDisplay}` : naam,
      href: `/events/${eventId}/hub`,
      meta: event.guests ? `${event.guests} gasten${event.ppp ? ` · €${event.ppp}/p` : ''}` : undefined,
    });
  }, [event, eventId, setActiveResource]);

  // Laad opgeslagen menukaart-templates voor deze org zodat de 3 stijl-tabs
  // de aangepaste template tonen (en niet alleen de hardcoded MenuCard-variant).
  useEffect(() => {
    if (!orgId) return;
    fetch('/api/templates?type=menukaart&orgId=' + orgId)
      .then(r => r.json())
      .then(d => { setMenuTemplates(d.templates || []); })
      .catch(() => { /* fall back to hardcoded MenuCards */ });
  }, [orgId]);

  const activeTemplate = useMemo(() => {
    const expectedName = MENUKAART_STYLE_TO_NAME[tpl];
    return menuTemplates.find(t => t.name === expectedName && (t.organization_id === orgId || !t.organization_id)) || null;
  }, [menuTemplates, tpl, orgId]);

  async function saveMenu() {
    if (!event) return;
    setMenuSaving(true);
    try {
      await supabase.from('events').update({ menu: menuIds } as any).eq('id', event.id);
      setEvent({ ...event, menu: menuIds });
      setMenuBuilderOpen(false);
    } finally { setMenuSaving(false); }
  }
  function toggleMenuItem(id: number) {
    setMenuIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  useEffect(() => {
    if (!eventId || Number.isNaN(eventId)) return;
    (async () => {
      const { data: ev } = await supabase.from('events').select('*').eq('id', eventId).single();
      if (!ev) { setLoading(false); return; }
      setEvent(ev);
      const [rOff, rPrep, rFact, rRec, rGer, rKlant, rSet, rHaccp, rSvc, rRefl, rInk, rGang] = await Promise.all([
        ev.offerte_id ? supabase.from('offertes').select('*').eq('id', ev.offerte_id).single() : Promise.resolve({ data: null }) as any,
        supabase.from('prep_tasks').select('*').eq('event_id', eventId).order('dagen', { ascending: false }),
        supabase.from('facturen').select('*').eq('client_naam', ev.client_naam || '__none__').limit(1),
        supabase.from('recepten').select('*'),
        supabase.from('gerechten').select('*'),
        ev.client_naam ? supabase.from('klanten').select('*').eq('naam', ev.client_naam).limit(1) : Promise.resolve({ data: null }) as any,
        supabase.from('settings').select('*').limit(1).maybeSingle(),
        supabase.from('haccp_records').select('*').eq('event_id', eventId),
        ev.offerte_id ? supabase.from('service_logs').select('*').eq('offerte_id', ev.offerte_id) : Promise.resolve({ data: [] }) as any,
        supabase.from('event_reflecties').select('*').eq('event_id', eventId).limit(1),
        supabase.from('inkooplijsten').select('*').eq('event_id', eventId).limit(1),
        supabase.from('gangen').select('*').order('volgorde', { ascending: true }),
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
      setHaccpRecords(rHaccp.data || []);
      setServiceLogs(rSvc.data || []);
      if (rRefl.data && rRefl.data.length > 0) setReflectie(rRefl.data[0]);
      if (rInk.data && rInk.data.length > 0) setInkooplijst(rInk.data[0]);
      setGangen(rGang.data || []);
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

  /* Gang name lookup for service logs */
  const gangNameMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const g of gangen) { if (g?.slug) m[g.slug] = g.naam || g.slug; }
    return m;
  }, [gangen]);

  /* Workflow stages (Offerte → Acceptatie → Voorbereiding → Event dag → Afronding) */
  const stages = useMemo(() => {
    if (!event) return [] as Array<{ key: string; label: string; status: 'done' | 'active' | 'upcoming'; hint: string }>;
    const isConfirmed = event.status === 'confirmed' || event.status === 'completed';
    const isCompleted = event.status === 'completed';
    const accepted = ['geaccepteerd', 'akkoord', 'betaald', 'definitief', 'goedgekeurd'];
    const today = new Date().toISOString().slice(0, 10);
    const isToday = event.date === today;
    const allPrepDone = prepTasks.length > 0 && prepTasks.every(t => prepState[t.id]);

    const out: Array<{ key: string; label: string; status: 'done' | 'active' | 'upcoming'; hint: string }> = [];
    out.push({
      key: 'offerte', label: 'Offerte',
      status: offerte && accepted.includes(offerte.status) ? 'done' : offerte ? 'active' : 'upcoming',
      hint: offerte ? `${offerte.nummer || 'Offerte'} · ${offerte.status || 'concept'}` : 'Nog geen offerte',
    });
    out.push({
      key: 'acceptatie', label: 'Acceptatie',
      status: isConfirmed && factuur && prepTasks.length > 0 ? 'done' : isConfirmed ? 'active' : 'upcoming',
      hint: isConfirmed ? `Bevestigd · ${factuur ? 'factuur actief' : 'nog geen factuur'}` : 'Wacht op akkoord',
    });
    out.push({
      key: 'voorbereiding', label: 'Voorbereiding',
      status: allPrepDone ? 'done' : isConfirmed && prepTasks.length > 0 ? 'active' : 'upcoming',
      hint: prepTasks.length > 0 ? `${prepDoneCount}/${prepTasks.length} prep-taken` : 'Geen prep-taken',
    });
    out.push({
      key: 'eventdag', label: 'Event dag',
      status: isCompleted ? 'done' : isToday || (isConfirmed && serviceLogs.length > 0) ? 'active' : 'upcoming',
      hint: serviceLogs.length > 0 ? `${serviceLogs.length} gangen gelogd` : isToday ? 'Vandaag' : `${derived?.daysLeft ?? 0}d te gaan`,
    });
    const factBetaald = factuur && factuur.status === 'betaald';
    out.push({
      key: 'afronding', label: 'Afronding',
      status: factBetaald && reflectie ? 'done' : isCompleted ? 'active' : 'upcoming',
      hint: reflectie ? `Reflectie ${reflectie.score}/10` : factBetaald ? 'Factuur betaald · reflectie open' : 'Na het event',
    });
    return out;
  }, [event, offerte, factuur, prepTasks, prepState, prepDoneCount, serviceLogs, reflectie, derived]);

  const menuGroups = useMemo(() => {
    if (!event) return [] as Array<{ title: string; items: Array<{ n: string; s?: string }> }>;
    const menuIds = parseMenu(event.menu);
    if (menuIds.length === 0) {
      return [{ title: 'Menu', items: [{ n: 'Nog geen menu gekoppeld', s: 'Voeg recepten toe via de event-editor' }] }];
    }
    // Zoek elk ID zowel in recepten als in gerechten — menu-builder slaat beide soorten op.
    function resolveMenuItem(id: number): { naam: string; cat: string; omschrijving?: string } | null {
      const rec = recepten.find((r: any) => r.id === id);
      if (rec) return { naam: rec.naam || '—', cat: rec.categorie || 'Hoofdgerechten', omschrijving: rec.beschrijving };
      const ger = gerechten.find((g: any) => g.id === id);
      if (ger) return { naam: ger.naam || '—', cat: ger.gang_slug || ger.categorie || 'Hoofdgerechten', omschrijving: ger.beschrijving };
      return null;
    }
    const resolved = menuIds.map(resolveMenuItem).filter(Boolean) as Array<{ naam: string; cat: string; omschrijving?: string }>;
    if (resolved.length === 0) {
      return [{ title: 'Menu', items: [{ n: 'Menu niet gevonden', s: 'Recepten of gerechten zijn mogelijk verwijderd' }] }];
    }
    const groupsByCat: Record<string, Array<{ n: string; s?: string }>> = {};
    for (const r of resolved) {
      if (!groupsByCat[r.cat]) groupsByCat[r.cat] = [];
      groupsByCat[r.cat].push({ n: r.naam, s: r.omschrijving });
    }
    return Object.entries(groupsByCat).map(([title, its]) => ({ title, items: its }));
  }, [event, recepten, gerechten]);

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
                <button className="btn btn-ghost" onClick={() => { document.getElementById('gegevens')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}><Pencil size={14} />Bewerken</button>
                <button className="btn btn-ghost" onClick={() => router.push(`/events/${event.id}/field`)}>
                  <Flame size={14} />Ga live (KDS)
                </button>
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

        <div className="responsive-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 20 }}>
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
                        // Open de wizard op /offertes met event-prefill via query params
                        router.push(`/offertes?new=1&event=${encodeURIComponent(event.name || '')}&gasten=${event.guests || 50}&ppp=${event.ppp || 45}&datum=${event.date || ''}&client=${encodeURIComponent(event.client_naam || '')}`);
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
                    onClick: () => document.getElementById('gegevens')?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
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
                <div className="hstack"><Flag size={15} color="var(--brand-gold)" /><span style={{ fontSize: 14, fontWeight: 600 }}>Workflow · 5 stappen</span></div>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>{stages.filter(s => s.status === 'done').length} / {stages.length} afgerond</span>
              </div>
              <div style={{ padding: 18, display: 'grid', gridTemplateColumns: `repeat(${stages.length}, 1fr)`, gap: 8, position: 'relative' }}>
                <div style={{ position: 'absolute', left: '8%', right: '8%', top: 30, height: 2, background: 'linear-gradient(90deg, rgba(196,163,90,.35), rgba(196,163,90,.08))', zIndex: 0 }} />
                {stages.map(s => {
                  const color = s.status === 'done' ? 'var(--green)' : s.status === 'active' ? 'var(--brand)' : 'var(--muted)';
                  const bg = s.status === 'done' ? 'var(--green)' : s.status === 'active' ? 'rgba(255,191,0,.14)' : 'rgba(130,130,130,.08)';
                  return (
                    <div key={s.key} style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 24, height: 24, borderRadius: '50%', background: bg, border: '2px solid ' + color, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: s.status === 'active' ? '0 0 0 4px rgba(255,191,0,.15)' : 'none' }}>
                        {s.status === 'done' && <Check size={12} style={{ color: 'var(--brand-background)' }} />}
                        {s.status === 'active' && <div style={{ width: 6, height: 6, borderRadius: '50%', background: color }} />}
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 11.5, fontWeight: 700, color: s.status === 'upcoming' ? 'var(--muted)' : 'var(--text)', letterSpacing: '-.005em' }}>{s.label}</div>
                        <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2, lineHeight: 1.35 }}>{s.hint}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="metal">
              <div className="metal-head">
                <div className="hstack"><ChefHat size={15} color="var(--brand-gold)" /><span style={{ fontSize: 14, fontWeight: 600 }}>Menu &amp; automatische menukaart</span></div>
                <div className="hstack" style={{ gap: 6 }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => setMenuBuilderOpen(true)}><Edit3 size={14} />Menu aanpassen</button>
                  <button className="btn btn-primary btn-sm" onClick={printMenukaart}><Printer size={14} />Print {event.guests || 0}×</button>
                </div>
              </div>
              <div className="responsive-grid" style={{ padding: 20, display: 'grid', gridTemplateColumns: '1fr 300px', gap: 24 }}>
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
                      {activeTemplate ? (
                        <TemplatePreview
                          blocks={activeTemplate.blocks}
                          pageSettings={activeTemplate.page_settings}
                          documentType="menukaart"
                          branding={{
                            primary: settings?.brand_primary || '#9e781c',
                            accent: settings?.brand_accent || '#8b6914',
                            logoUrl: settings?.logo_url || null,
                            logoDarkUrl: settings?.logo_dark_url || null,
                            bedrijfsnaam: settings?.bedrijfsnaam || 'Hop & Bites',
                          }}
                          variables={{
                            event_naam: titleCase(displayEventName(event.name)),
                            event_datum: dateUpper,
                            aantal_gasten: String(event.guests || 0),
                            bedrijfsnaam: settings?.bedrijfsnaam || 'Hop & Bites',
                            ondertitel: settings?.ondertitel || '',
                            bedrijf_email: settings?.email || '',
                            bedrijf_telefoon: settings?.telefoon || '',
                            bedrijf_adres: settings?.adres || '',
                            website: settings?.website || '',
                          }}
                          menuGroups={menuGroups.map(g => ({ gang: g.title, dishes: g.items }))}
                          width={300}
                        />
                      ) : (
                        <MenuCard template={tpl} eventName={titleCase(displayEventName(event.name))} dateLabel={dateUpper} groups={menuGroups} />
                      )}
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
                    <div style={{ marginTop: 8, display: 'flex', justifyContent: 'center' }}>
                      <a href={activeTemplate?.id
                        ? `/template-editor?id=${activeTemplate.id}`
                        : `/template-editor?type=menukaart&start=${MENUKAART_STYLE_TO_STARTER[tpl]}`}
                        style={{ fontSize: 11, color: 'var(--brand-gold)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 6, border: '1px solid color-mix(in srgb, var(--brand-gold) 30%, transparent)' }}>
                        <Pencil size={11} /> {activeTemplate ? 'Template aanpassen' : 'Template maken'}
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="metal">
              <div className="metal-head">
                <div className="hstack"><ClipboardList size={15} color="var(--brand-gold)" /><span style={{ fontSize: 14, fontWeight: 600 }}>Prep-agenda · {derived?.daysLeft ?? 0}d tot event</span></div>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>{prepDoneCount} / {prepTasks.length} afgerond</span>
              </div>
              <div style={{ padding: 18 }}>
                {prepTasks.length === 0 ? (
                  <div style={{ padding: 8, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
                    Nog geen prep-taken — voeg toe via de event-editor.
                  </div>
                ) : (() => {
                  /* Bucket tasks by dagen (T-Nd). Sort descending: T-5 → T-0. */
                  const buckets = new Map<number, any[]>();
                  for (const t of prepTasks) {
                    const d = typeof t.dagen === 'number' ? t.dagen : 0;
                    if (!buckets.has(d)) buckets.set(d, []);
                    buckets.get(d)!.push(t);
                  }
                  const sortedDagen = Array.from(buckets.keys()).sort((a, b) => b - a);
                  const today0 = derived?.daysLeft ?? 0;
                  const dayLabel = (d: number) => d === 0 ? 'D-day' : d < 0 ? `D+${Math.abs(d)}` : `D-${d}`;
                  const dayTitle: Record<number, string> = {
                    5: 'Bestellen & voorcheck',
                    4: 'Rubs & marinades',
                    3: 'Bestellen & checken',
                    2: 'Marineren & rubben',
                    1: 'Inladen & mise-en-place',
                    0: 'Event dag · service',
                  };
                  return (
                    <div style={{ position: 'relative', paddingLeft: 28 }}>
                      <div style={{ position: 'absolute', left: 9, top: 10, bottom: 10, width: 2, background: 'linear-gradient(180deg, rgba(196,163,90,.35), rgba(196,163,90,.08))', borderRadius: 1 }} />
                      {sortedDagen.map((d) => {
                        const tasks = buckets.get(d)!;
                        const doneCount = tasks.filter(t => prepState[t.id]).length;
                        const pct = Math.round((doneCount / tasks.length) * 100);
                        const isToday = today0 === d;
                        const isPast = today0 > d;
                        const isOnDeck = today0 - d >= 0 && today0 - d <= 1;
                        const dotColor = pct === 100 ? 'var(--green)' : isToday ? 'var(--brand)' : isOnDeck ? 'var(--amber)' : 'var(--brand-gold)';
                        return (
                          <div key={d} style={{ position: 'relative', marginBottom: 18 }}>
                            <div style={{ position: 'absolute', left: -28 + 2, top: 4, width: 16, height: 16, borderRadius: '50%', background: pct === 100 ? dotColor : 'var(--bg-subtle, #0e0e10)', border: '2px solid ' + dotColor, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2, boxShadow: isToday ? '0 0 0 4px rgba(255,191,0,.18)' : 'none' }}>
                              {pct === 100 && <Check size={9} style={{ color: 'var(--brand-background)' }} />}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 6 }}>
                              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 16, color: dotColor, letterSpacing: '-.005em' }}>{dayLabel(d)}</span>
                              <span style={{ fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 700 }}>{dayTitle[d] || (d === 0 ? 'Event dag' : d < 0 ? 'Na afloop' : 'Voorbereiding')}</span>
                              <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>{doneCount}/{tasks.length}</span>
                            </div>
                            <div style={{ height: 3, background: 'rgba(130,130,130,.15)', borderRadius: 2, marginBottom: 10, overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: pct + '%', background: pct === 100 ? 'var(--green)' : isOnDeck ? 'var(--amber)' : 'var(--brand-gold)', borderRadius: 2, transition: 'width .3s' }} />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                              {tasks.map((c: any) => {
                                const done = !!prepState[c.id];
                                const daysUntil = typeof c.dagen === 'number' && derived ? derived.daysLeft - c.dagen : null;
                                const isKeyStep = !done && daysUntil != null && daysUntil >= 0 && daysUntil <= 1;
                                const badge = isKeyStep ? 'Key step' : (!done && isPast ? 'Achterstand' : null);
                                const badgeColor = isKeyStep ? 'var(--amber)' : 'var(--red)';
                                return (
                                  <label key={c.id} className="prep-task-row" style={{ display: 'grid', gridTemplateColumns: '20px 1fr auto', gap: 10, alignItems: 'center', padding: '7px 10px', borderRadius: 8, cursor: 'pointer', background: isKeyStep ? 'rgba(245,158,11,.06)' : 'transparent', border: isKeyStep ? '1px solid rgba(245,158,11,.22)' : '1px solid transparent', transition: 'background .15s' } as CSSProperties}>
                                    <input
                                      type="checkbox"
                                      checked={done}
                                      onChange={() => togglePrep(c.id)}
                                      aria-label={`${c.text || 'Taak'} — ${dayLabel(d)}${badge ? ` · ${badge}` : ''}`}
                                      style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', clipPath: 'inset(50%)', whiteSpace: 'nowrap' }}
                                    />
                                    <span aria-hidden="true" style={{ width: 18, height: 18, borderRadius: 5, border: '1.5px solid ' + (done ? 'var(--green)' : isPast ? 'var(--amber)' : 'var(--muted)'), background: done ? 'var(--green)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--brand-background)' }}>
                                      {done && <Check size={12} />}
                                    </span>
                                    <span style={{ fontSize: 13, fontWeight: 500, color: done ? 'var(--muted)' : 'var(--text)', textDecoration: done ? 'line-through' : 'none' }}>{c.text || '—'}</span>
                                    {badge && (
                                      <span style={{ fontSize: 9.5, color: badgeColor, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase' }}>{badge}</span>
                                    )}
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            </div>

            {(serviceLogs.length > 0 || haccpRecords.length > 0 || reflectie || event.status === 'completed') && (
              <div className="metal">
                <div className="metal-head">
                  <div className="hstack"><Flame size={15} color="var(--brand-gold)" /><span style={{ fontSize: 14, fontWeight: 600 }}>Uitvoering &amp; nazorg</span></div>
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                    {serviceLogs.length} service-log{serviceLogs.length === 1 ? '' : 's'} · {haccpRecords.length} HACCP · {reflectie ? 'reflectie ingevuld' : 'geen reflectie'}
                  </span>
                </div>
                <div style={{ padding: 18, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
                  <div>
                    <div style={{ fontSize: 10, letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--brand-gold)', fontWeight: 700, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Flame size={11} />Service-logs · gangen
                    </div>
                    {serviceLogs.length === 0 ? (
                      <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>
                        Nog geen service-log. Start tijdens het event via <button onClick={() => router.push('/service')} style={{ background: 'none', border: 'none', color: 'var(--brand-gold)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, padding: 0, textDecoration: 'underline' }}>Service Mode</button>.
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                        {serviceLogs.slice(0, 6).map((log: any, i: number) => {
                          const gangName = gangNameMap[log.gang_slug] || log.gang_slug || 'Gang';
                          const mins = log.duration_seconds ? Math.round(log.duration_seconds / 60) : null;
                          return (
                            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'rgba(255,255,255,.02)', borderRadius: 8, border: '1px solid var(--border)' }}>
                              <span style={{ fontSize: 13, fontWeight: 500 }}>{gangName}</span>
                              <span style={{ fontSize: 11, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>{mins != null ? `${mins} min` : '—'}</span>
                            </div>
                          );
                        })}
                        {serviceLogs.length > 6 && (
                          <div style={{ fontSize: 11, color: 'var(--muted)', paddingTop: 4 }}>+ {serviceLogs.length - 6} meer</div>
                        )}
                      </div>
                    )}
                  </div>
                  <div>
                    <div style={{ fontSize: 10, letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--brand-gold)', fontWeight: 700, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Thermometer size={11} />HACCP · laatste metingen
                    </div>
                    {haccpRecords.length === 0 ? (
                      <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>
                        Nog geen metingen voor dit event.
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                        {haccpRecords.slice(0, 6).map((rec: any, i: number) => {
                          const statusColor = rec.status === 'ok' ? 'var(--green)' : rec.status === 'warn' ? 'var(--amber)' : 'var(--red)';
                          return (
                            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'rgba(255,255,255,.02)', borderRadius: 8, border: '1px solid var(--border)' }}>
                              <span style={{ fontSize: 13, fontWeight: 500 }}>{rec.wat || 'Meting'}</span>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ fontSize: 11, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{rec.temp != null && rec.temp > 0 ? `${rec.temp}°C` : '—'}</span>
                                <span style={{ width: 8, height: 8, borderRadius: '50%', background: statusColor }} />
                              </div>
                            </div>
                          );
                        })}
                        {haccpRecords.length > 6 && (
                          <div style={{ fontSize: 11, color: 'var(--muted)', paddingTop: 4 }}>+ {haccpRecords.length - 6} meer</div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                {(event.status === 'completed' || reflectie) && (
                  <div style={{ padding: '14px 18px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, background: 'rgba(255,191,0,.04)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <Star size={16} color="var(--brand)" />
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>Reflectie</div>
                        <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                          {reflectie ? `Score ${reflectie.score}/10 · ${reflectie.wat_goed ? String(reflectie.wat_goed).slice(0, 60) : 'Ingevuld'}` : 'Nog niet ingevuld — doe dit binnen een week na het event.'}
                        </div>
                      </div>
                    </div>
                    <button className="btn btn-ghost btn-sm" onClick={() => router.push(`/events/${event.id}/reflectie`)}>
                      <Pencil size={13} />{reflectie ? 'Bekijk' : 'Invullen'}
                    </button>
                  </div>
                )}
              </div>
            )}
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

            <div className="metal">
              <div className="metal-head" style={{ padding: '12px 16px' }}>
                <div className="hstack"><Users size={14} color="var(--brand-gold)" /><span style={{ fontSize: 13, fontWeight: 600 }}>Crew</span></div>
                <button className="btn btn-ghost btn-sm" onClick={() => document.getElementById('gegevens')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}><Plus size={12} />Toevoegen</button>
              </div>
              <div style={{ padding: 12 }}>
                {(event.team || []).length === 0 ? (
                  <div style={{ padding: '8px 4px', fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>
                    Nog geen crew ingepland. <button onClick={() => document.getElementById('gegevens')?.scrollIntoView({ behavior: 'smooth', block: 'start' })} style={{ background: 'none', border: 'none', color: 'var(--brand-gold)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, padding: 0, textDecoration: 'underline' }}>Voeg toe in de editor</button>.
                  </div>
                ) : (event.team as string[]).map((p, i) => (
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
          </div>
          {/* ═════════ KEUKEN COMMAND — Inkooplijst + HACCP + Draaiboek ═════════ */}
          <div style={{ marginTop: 20, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14 }}>
            <EventInkooplijstCard eventId={eventId} eventName={event.name} menuGroups={menuGroups} recepten={recepten} gerechten={gerechten} />
            <EventHaccpCard eventId={eventId} />
            <EventDraaiboekCard event={event} onSave={async (draaiboek) => {
              await supabase.from('events').update({ draaiboek } as any).eq('id', eventId);
              setEvent({ ...event, draaiboek });
            }} />
          </div>
        </div>

        {/* ═════════ SERVICE DATA — Gangen + Allergieën voor KDS ═════════ */}
        <div id="service-data" className="metal" style={{ marginTop: 20 }}>
          <div className="metal-head">
            <div className="hstack"><ChefHat size={15} color="var(--brand-gold)" /><span style={{ fontSize: 14, fontWeight: 600 }}>Service-data — Gangen & Allergieën</span></div>
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>Voedt de Service Mode KDS bij dit event</span>
          </div>
          <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 24 }}>
            <div>
              <h4 style={{ fontSize: 12, fontWeight: 700, color: 'var(--brand-gold)', textTransform: 'uppercase', marginBottom: 12, letterSpacing: '.05em' }}>Gangen</h4>
              <CoursesEditor eventId={event.id} eventGuests={event.guests || 0} />
            </div>
            <div>
              <h4 style={{ fontSize: 12, fontWeight: 700, color: 'var(--brand-gold)', textTransform: 'uppercase', marginBottom: 12, letterSpacing: '.05em' }}>Allergieën & Diëten</h4>
              <AllergiesEditor eventId={event.id} />
            </div>
          </div>
        </div>

        <div id="gegevens" className="metal" style={{ marginTop: 20 }}>
          <div className="metal-head">
            <div className="hstack"><Pencil size={15} color="var(--brand-gold)" /><span style={{ fontSize: 14, fontWeight: 600 }}>Gegevens bewerken</span></div>
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>Velden worden opgeslagen op &quot;Opslaan&quot;</span>
          </div>
          <div style={{ padding: 20 }}>
            <EventEditor
              eventId={event.id}
              onSaved={async () => {
                /* Refetch the event so hub-level stats reflect the edit */
                const { data: ev } = await supabase.from('events').select('*').eq('id', eventId).single();
                if (ev) setEvent(ev);
              }}
              onDeleted={() => router.push('/events')}
            />
          </div>
        </div>
      </div>
      <EventMenuKaartBuilder
        open={menuBuilderOpen}
        onClose={() => setMenuBuilderOpen(false)}
        eventId={eventId}
        initialMenuIds={menuIds}
        onSaved={(ids) => { setMenuIds(ids); setEvent({ ...event, menu: ids }); }}
        eventName={event.name}
      />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   INKOOPLIJST CARD — met AI-generator uit menu
   ═══════════════════════════════════════════════════════════════════ */
function EventInkooplijstCard({ eventId, eventName, menuGroups, recepten, gerechten }: { eventId: number; eventName: string; menuGroups: any[]; recepten: any[]; gerechten: any[] }) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [aiBusy, setAiBusy] = useState(false);
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('inkooplijsten').select('*').eq('event_id', eventId).maybeSingle();
      if (data?.items) setItems(Array.isArray(data.items) ? data.items : []);
      setLoading(false);
    })();
  }, [eventId]);
  async function saveItems(next: any[]) {
    setItems(next);
    const { data: existing } = await supabase.from('inkooplijsten').select('id').eq('event_id', eventId).maybeSingle();
    if (existing) {
      await supabase.from('inkooplijsten').update({ items: next } as any).eq('id', existing.id);
    } else {
      await supabase.from('inkooplijsten').insert([{ event_id: eventId, items: next }] as any);
    }
  }
  async function generateFromMenu() {
    setAiBusy(true);
    try {
      const menuDescription = menuGroups.map(g => `${g.title}: ${g.items.map((i: any) => i.n).join(', ')}`).join(' | ');
      const existing = [...(recepten || []).map((r: any) => ({ naam: r.naam, categorie: r.categorie })), ...(gerechten || []).map((g: any) => ({ naam: g.naam }))];
      const res = await fetch('/api/recipe-generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'menu', prompt: `Genereer inkooplijst voor event "${eventName}" met menu: ${menuDescription}. Geef alleen de samengevatte_inkooplijst met concrete producten, hoeveelheden (kg/L/stuks) en categorieën.`,
          existing, options: { gasten: 20, gangen: menuGroups.length },
          model: 'haiku',
        }),
      });
      const body = await res.json();
      if (!res.ok) { alert('AI fout: ' + (body.error || 'onbekend')); return; }
      const inkoop = body.data?.samengevatte_inkooplijst || [];
      const mapped = inkoop.map((i: any) => ({ naam: i.product, hoeveelheid: i.totale_hoeveelheid, eenheid: i.eenheid, categorie: i.categorie, besteld: false }));
      await saveItems(mapped);
    } catch (e: any) {
      alert('Fout: ' + (e.message || 'onbekend'));
    } finally {
      setAiBusy(false);
    }
  }
  return (
    <div className="metal">
      <div className="metal-head" style={{ padding: '12px 16px' }}>
        <div className="hstack"><ClipboardList size={14} color="var(--brand-gold)" /><span style={{ fontSize: 13, fontWeight: 600 }}>Inkooplijst</span>{items.length > 0 && <span style={{ fontSize: 11, color: 'var(--muted)' }}>· {items.length} items</span>}</div>
        <button className="btn btn-ghost btn-sm" onClick={generateFromMenu} disabled={aiBusy || menuGroups.length === 0}><Sparkles size={12} />{aiBusy ? 'AI denkt...' : 'AI uit menu'}</button>
      </div>
      <div style={{ padding: 12, maxHeight: 360, overflowY: 'auto' }}>
        {loading ? <div style={{ fontSize: 12, color: 'var(--muted)' }}>Laden...</div>
          : items.length === 0 ? (
            <div style={{ padding: '8px 4px', fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>
              Nog geen inkooplijst. Klik <button onClick={generateFromMenu} disabled={aiBusy} style={{ background: 'none', border: 'none', color: 'var(--brand-gold)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, padding: 0, textDecoration: 'underline' }}>AI uit menu</button> om automatisch te laten genereren uit de menu-items.
            </div>
          ) : items.map((it: any, i: number) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto auto auto', gap: 8, padding: '6px 4px', fontSize: 12, alignItems: 'center', borderBottom: i < items.length - 1 ? '1px solid rgba(130,130,130,.08)' : 'none' }}>
              <input type="checkbox" checked={!!it.besteld} onChange={e => saveItems(items.map((x, idx) => idx === i ? { ...x, besteld: e.target.checked } : x))} />
              <span style={{ textDecoration: it.besteld ? 'line-through' : 'none', opacity: it.besteld ? 0.5 : 1 }}>{it.naam}</span>
              <span style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase' }}>{it.categorie || ''}</span>
              <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{it.hoeveelheid}</span>
              <span style={{ color: 'var(--brand-gold)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em' }}>{it.eenheid}</span>
            </div>
          ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   HACCP QUICK-LOG — temperatuur meting in één klik
   ═══════════════════════════════════════════════════════════════════ */
function EventHaccpCard({ eventId }: { eventId: number }) {
  const [records, setRecords] = useState<any[]>([]);
  const [temp, setTemp] = useState('');
  const [wat, setWat] = useState('');
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('haccp_records').select('*').eq('event_id', eventId).order('created_at', { ascending: false }).limit(10);
      setRecords(data || []);
    })();
  }, [eventId]);
  async function logMeting() {
    if (!temp || !wat) return;
    const tempNum = parseFloat(temp);
    const status = tempNum < 7 ? 'ok' : tempNum > 63 ? 'ok' : 'warn';
    const { data } = await supabase.from('haccp_records').insert([{ event_id: eventId, temp: tempNum, wat, status, type: 'kern' }] as any).select().single();
    if (data) setRecords([data, ...records].slice(0, 10));
    setTemp(''); setWat('');
  }
  return (
    <div className="metal">
      <div className="metal-head" style={{ padding: '12px 16px' }}>
        <div className="hstack"><ShieldCheck size={14} color="var(--brand-gold)" /><span style={{ fontSize: 13, fontWeight: 600 }}>HACCP log</span>{records.length > 0 && <span style={{ fontSize: 11, color: 'var(--muted)' }}>· {records.length}</span>}</div>
      </div>
      <div style={{ padding: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 70px auto', gap: 6, marginBottom: 10 }}>
          <input value={wat} onChange={e => setWat(e.target.value)} placeholder="bv. kippendij" style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--card-solid)', background: 'var(--color-bg-deep)', color: 'var(--text)', fontSize: 12, outline: 'none' }} />
          <input type="number" step="0.1" value={temp} onChange={e => setTemp(e.target.value)} placeholder="°C" style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--card-solid)', background: 'var(--color-bg-deep)', color: 'var(--text)', fontSize: 12, outline: 'none' }} />
          <button className="btn btn-primary btn-sm" onClick={logMeting} disabled={!temp || !wat}><Plus size={11} />Log</button>
        </div>
        {records.length === 0 ? (
          <div style={{ padding: '8px 4px', fontSize: 11, color: 'var(--muted)' }}>Nog geen metingen. Log kerntemperaturen hierboven.</div>
        ) : records.map(r => (
          <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 4px', fontSize: 11, borderBottom: '1px solid rgba(130,130,130,.08)' }}>
            <span style={{ flex: 1 }}>{r.wat}</span>
            <span style={{ fontWeight: 700, color: r.status === 'ok' ? 'var(--green)' : r.status === 'warn' ? 'var(--amber)' : 'var(--red)', fontVariantNumeric: 'tabular-nums' }}>{r.temp}°C</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   DRAAIBOEK — tijdlijn voor event-dag
   ═══════════════════════════════════════════════════════════════════ */
function EventDraaiboekCard({ event, onSave }: { event: any; onSave: (d: any[]) => void }) {
  const [items, setItems] = useState<any[]>(() => {
    if (Array.isArray(event.draaiboek)) return event.draaiboek;
    if (typeof event.draaiboek === 'string') { try { const p = JSON.parse(event.draaiboek); return Array.isArray(p) ? p : []; } catch { return []; } }
    return [];
  });
  const [tijd, setTijd] = useState('');
  const [wat, setWat] = useState('');
  async function add() {
    if (!tijd || !wat) return;
    const next = [...items, { tijd, wat }].sort((a, b) => (a.tijd || '').localeCompare(b.tijd || ''));
    setItems(next); onSave(next);
    setTijd(''); setWat('');
  }
  async function remove(i: number) {
    const next = items.filter((_, idx) => idx !== i);
    setItems(next); onSave(next);
  }
  return (
    <div className="metal">
      <div className="metal-head" style={{ padding: '12px 16px' }}>
        <div className="hstack"><Calendar size={14} color="var(--brand-gold)" /><span style={{ fontSize: 13, fontWeight: 600 }}>Draaiboek</span>{items.length > 0 && <span style={{ fontSize: 11, color: 'var(--muted)' }}>· {items.length} stappen</span>}</div>
      </div>
      <div style={{ padding: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '70px 1fr auto', gap: 6, marginBottom: 10 }}>
          <input type="time" value={tijd} onChange={e => setTijd(e.target.value)} style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--card-solid)', background: 'var(--color-bg-deep)', color: 'var(--text)', fontSize: 12, outline: 'none' }} />
          <input value={wat} onChange={e => setWat(e.target.value)} placeholder="bv. Voorgerecht uit" style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--card-solid)', background: 'var(--color-bg-deep)', color: 'var(--text)', fontSize: 12, outline: 'none' }} />
          <button className="btn btn-primary btn-sm" onClick={add} disabled={!tijd || !wat}><Plus size={11} /></button>
        </div>
        {items.length === 0 ? (
          <div style={{ padding: '8px 4px', fontSize: 11, color: 'var(--muted)' }}>Nog geen tijdlijn. Plan service-momenten hierboven (bv. 17:00 Welkom, 18:00 Voorgerecht).</div>
        ) : items.map((it, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '56px 1fr auto', gap: 8, padding: '5px 4px', fontSize: 11, alignItems: 'center', borderBottom: i < items.length - 1 ? '1px solid rgba(130,130,130,.08)' : 'none' }}>
            <span style={{ fontWeight: 700, color: 'var(--brand-gold)', fontVariantNumeric: 'tabular-nums' }}>{it.tijd}</span>
            <span>{it.wat}</span>
            <button onClick={() => remove(i)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: 2, fontSize: 13 }}>×</button>
          </div>
        ))}
      </div>
    </div>
  );
}
