'use client';

/* /verkoop/leads — Lead Funnel pijplijn (operator-kant) — design-versie.
   ─────────────────────────────────────────────────────────────────────
   Inkomende aanvragen (publiek formulier of handmatig) in één pijplijn:
   Nieuw → In gesprek → Offerte → Gewonnen/Verloren. Kanban (drag-to-move) +
   lijst, detail-drawer met relatie-pills (ecosysteem), AI-concept-menu en
   "Maak offerte" die de bestaande AI-wizard prefilled opent (nul dubbele invoer).

   UI uit design-handoff (leads-*.jsx). Data ongewijzigd: reads via useSupabase
   (RLS), writes via server actions (Zod + re-auth), AI-concept via recipe-generate. */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Plus, Search, SearchX, Inbox, LayoutGrid, List, X, Mail, Phone, Calendar, Users, MapPin,
  Trash2, ArrowRight, Sparkles, Flame, Loader2, RefreshCw, MessageCircle, FileText,
  CheckCircle2, XCircle, GripVertical, Pencil, Link2, Check, Save, Layers,
} from 'lucide-react';
import { formatEur } from '@/lib/format';
import type { MenuSelectieSnapshot } from '@/types/arrangement';
import { useSupabase } from '@/lib/useSupabase';
import { useOrg } from '@/lib/OrgContext';
import { useToast } from '@/components/Toast';
import { useConfirm } from '@/components/ConfirmDialog';
import RelatedEntityPills from '@/components/RelatedEntityPills';
import { upsertLead, updateLeadStatus, deleteLead, saveLeadConcept } from './actions';
import './leads.css';

interface AiConcept {
  menu_naam?: string;
  thema?: string;
  gerechten?: Array<{ naam: string; gang?: string }>;
  adviesprijs_pp?: number;
  totale_kostprijs_pp?: number;
}

interface Lead {
  id: number;
  naam: string;
  email: string | null;
  telefoon: string | null;
  event_datum: string | null;
  gasten: number | null;
  locatie: string | null;
  event_type: string | null;
  budget_indicatie: string | null;
  bericht: string | null;
  status: string;
  source: string;
  offerte_id: number | null;
  client_naam: string | null;
  ai_concept: AiConcept | null;
  menu_selectie: MenuSelectieSnapshot | null;
  menu_prijs_indicatie: number | null;
  follow_up_at: string | null;
  created_at: string;
}

interface GerechtLite { id: number; naam: string; gang?: string | null; categorie?: string | null; tags?: string[] | null; }

type LeadStatus = 'nieuw' | 'in_gesprek' | 'offerte' | 'gewonnen' | 'verloren';

/* Pipeline-stages met spec-kleuren (design leads-data.jsx), gekoppeld aan de
   DB-statuswaarden. Nieuw=amber · In gesprek=blauw · Offerte=goud · Gewonnen=groen
   · Verloren=rood. Kleur verdient z'n plek via dot (+glow) + icoon. */
const LEAD_STATUS: Record<LeadStatus, { label: string; Icon: typeof Inbox; dot: string; text: string; bg: string; border: string; glow?: boolean }> = {
  nieuw:      { label: 'Nieuw',      Icon: Inbox,         dot: '#FFBF00', text: '#FFCF33', bg: 'rgba(255,191,0,.10)',  border: 'rgba(255,191,0,.28)',  glow: true },
  in_gesprek: { label: 'In gesprek', Icon: MessageCircle, dot: '#60a5fa', text: '#7cb6ff', bg: 'rgba(59,130,246,.10)', border: 'rgba(59,130,246,.30)', glow: true },
  offerte:    { label: 'Offerte',    Icon: FileText,      dot: '#f59e0b', text: '#fbbf24', bg: 'rgba(245,158,11,.10)', border: 'rgba(245,158,11,.28)', glow: true },
  gewonnen:   { label: 'Gewonnen',   Icon: CheckCircle2,  dot: '#22c55e', text: '#4ade80', bg: 'rgba(34,197,94,.10)',  border: 'rgba(34,197,94,.28)' },
  verloren:   { label: 'Verloren',   Icon: XCircle,       dot: '#ef4444', text: '#f87171', bg: 'rgba(239,68,68,.10)',  border: 'rgba(239,68,68,.28)' },
};
const STAGES: LeadStatus[] = ['nieuw', 'in_gesprek', 'offerte', 'gewonnen', 'verloren'];

const SOURCE_LABEL: Record<string, string> = { public_form: 'Aanvraagformulier', manual: 'Handmatig', klantgesprek: 'Klantgesprek', arrangement: 'Zelf samengesteld' };
const EVENT_TYPES = ['Bruiloft', 'Bedrijfsfeest', 'Verjaardag', 'Festival', 'Jubileum', 'Anders'];
const MND = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

function fmtDateShort(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso + 'T00:00:00');
  if (isNaN(d.getTime())) return '—';
  return d.getDate() + ' ' + MND[d.getMonth()];
}
function relTime(iso: string | null): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'zojuist';
  if (min < 60) return `${min} min geleden`;
  const u = Math.floor(min / 60);
  if (u < 24) return `${u} uur geleden`;
  const dg = Math.floor(u / 24);
  if (dg === 1) return 'gisteren';
  if (dg < 14) return `${dg} dagen geleden`;
  return `${Math.floor(dg / 7)} ${Math.floor(dg / 7) === 1 ? 'week' : 'weken'} geleden`;
}
function sourceIcon(src: string) {
  if (src === 'klantgesprek') return Phone;
  if (src === 'manual') return Pencil;
  if (src === 'arrangement') return Layers;
  return Link2;
}

/* € waarde van een lead: indicatie-omzet (arrangement) of geparsete budget-tekst. */
function leadValue(l: Lead): number {
  if (l.menu_prijs_indicatie != null) return l.menu_prijs_indicatie;
  if (l.budget_indicatie) {
    const n = parseFloat(l.budget_indicatie.replace(/[^\d,.]/g, '').replace(/\./g, '').replace(',', '.'));
    if (!Number.isNaN(n)) return n;
  }
  return 0;
}
/* >24u onbeantwoord in kolom Nieuw → aandacht nodig. */
function isStale(l: Lead, status: LeadStatus): boolean {
  if (status !== 'nieuw' || !l.created_at) return false;
  return Date.now() - new Date(l.created_at).getTime() >= 24 * 3600 * 1000;
}

function LeadBadge({ status, size = 'md' }: { status: string; size?: 'sm' | 'md' }) {
  const s = LEAD_STATUS[(status as LeadStatus)] || LEAD_STATUS.nieuw;
  const sm = size === 'sm';
  const I = s.Icon;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: sm ? 5 : 6, padding: sm ? '4px 9px' : '5px 11px', borderRadius: 999, whiteSpace: 'nowrap', fontSize: sm ? 10 : 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', background: s.bg, color: s.text, border: `1px solid ${s.border}` }}>
      <span style={{ width: 6, height: 6, borderRadius: 999, background: s.dot, flexShrink: 0, boxShadow: s.glow ? `0 0 6px ${s.dot}` : 'none' }} />
      <I size={sm ? 11 : 12} color={s.text} strokeWidth={2} />
      {s.label}
    </span>
  );
}

const emptyForm = {
  id: undefined as number | undefined,
  naam: '', email: '', telefoon: '', event_datum: '', gasten: '',
  locatie: '', event_type: '', budget_indicatie: '', bericht: '',
  client_naam: '', status: 'nieuw' as LeadStatus,
};
type FormState = typeof emptyForm;

export default function LeadsPage() {
  const router = useRouter();
  const showToast = useToast();
  const showConfirm = useConfirm();
  const { data: leads, loading, refetch } = useSupabase<Lead>('leads', []);
  const { data: gerechten } = useSupabase<GerechtLite>('gerechten', []);
  const { organization } = useOrg();
  const slug = (organization as { slug?: string } | null)?.slug;

  const [q, setQ] = useState('');
  const [eventFilter, setEventFilter] = useState<string>('');
  const [viewMode, setViewMode] = useState<'kanban' | 'lijst'>('kanban');
  const [drawer, setDrawer] = useState<Lead | 'new' | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [concept, setConcept] = useState<AiConcept | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [dragId, setDragId] = useState<number | null>(null);
  const [overStage, setOverStage] = useState<LeadStatus | null>(null);
  const [pending, setPending] = useState<Record<number, LeadStatus>>({});
  const hasFocused = useRef(false);

  /* ?focus=<id> deeplink — opent de lead-drawer (zelfde patroon als /facturen). */
  useEffect(() => {
    if (hasFocused.current || loading) return;
    const focus = new URLSearchParams(window.location.search).get('focus');
    if (focus) {
      const lead = leads.find((l) => String(l.id) === focus);
      if (lead) { openLead(lead); hasFocused.current = true; }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leads, loading]);

  function openLead(lead: Lead) {
    setForm({
      id: lead.id, naam: lead.naam || '', email: lead.email || '', telefoon: lead.telefoon || '',
      event_datum: lead.event_datum || '', gasten: lead.gasten != null ? String(lead.gasten) : '',
      locatie: lead.locatie || '', event_type: lead.event_type || '',
      budget_indicatie: lead.budget_indicatie || '', bericht: lead.bericht || '',
      client_naam: lead.client_naam || '', status: (lead.status as LeadStatus) || 'nieuw',
    });
    setConcept(lead.ai_concept || null);
    setDrawer(lead);
  }
  function openNew() { setForm(emptyForm); setConcept(null); setDrawer('new'); }
  function closeDrawer() { setDrawer(null); }
  const setF = (k: keyof FormState, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const ql = q.trim().toLowerCase();
  const filtered = useMemo(() => leads.filter((l) =>
    (ql === '' || [l.naam, l.email, l.locatie, l.event_type, l.client_naam].filter(Boolean).join(' ').toLowerCase().includes(ql))
    && (eventFilter === '' || (l.event_type || 'Anders') === eventFilter)
  ), [leads, ql, eventFilter]);

  const statusOf = (l: Lead): LeadStatus => (pending[l.id] || (l.status as LeadStatus) || 'nieuw');

  /* KPI-header: open pijplijn, win-ratio, gewonnen waarde, te-lang-stil. */
  const kpi = useMemo(() => {
    const open = leads.filter((l) => ['nieuw', 'in_gesprek', 'offerte'].includes(statusOf(l)));
    const won = leads.filter((l) => statusOf(l) === 'gewonnen');
    const lost = leads.filter((l) => statusOf(l) === 'verloren');
    const beslist = won.length + lost.length;
    return {
      open: open.length,
      openValue: open.reduce((s, l) => s + leadValue(l), 0),
      winRatio: beslist > 0 ? Math.round((won.length / beslist) * 100) : null,
      won: won.length, lost: lost.length,
      wonValue: won.reduce((s, l) => s + leadValue(l), 0),
      stale: leads.filter((l) => isStale(l, statusOf(l))).length,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leads, pending]);

  async function handleSave() {
    if (!form.naam.trim()) { showToast('Naam is verplicht', 'error'); return; }
    setSaving(true);
    const res = await upsertLead({ ...form, gasten: form.gasten || undefined });
    setSaving(false);
    if ('error' in res) { showToast(res.error === 'validation' ? 'Controleer de velden' : res.error, 'error'); return; }
    showToast(form.id ? 'Aanvraag bijgewerkt' : 'Aanvraag toegevoegd', 'success');
    closeDrawer(); refetch();
  }

  async function quickStatus(lead: Lead, status: LeadStatus) {
    setForm((f) => (f.id === lead.id ? { ...f, status } : f));
    const res = await updateLeadStatus({ id: lead.id, status });
    if ('error' in res) { showToast(res.error, 'error'); return; }
    refetch();
  }

  function handleDelete(lead: Lead) {
    showConfirm('Weet je zeker dat je deze aanvraag wilt verwijderen?', async () => {
      const res = await deleteLead(lead.id);
      if ('error' in res) { showToast(res.error, 'error'); return; }
      showToast('Aanvraag verwijderd', 'success');
      closeDrawer(); refetch();
    });
  }

  /* Drag-to-move tussen kolommen — optimistisch + server-write + refetch. */
  async function handleDrop(stage: LeadStatus) {
    const id = dragId;
    setDragId(null); setOverStage(null);
    if (id == null) return;
    const lead = leads.find((l) => l.id === id);
    if (!lead || statusOf(lead) === stage) return;
    setPending((p) => ({ ...p, [id]: stage }));
    const res = await updateLeadStatus({ id, status: stage });
    if ('error' in res) { showToast(res.error, 'error'); setPending((p) => { const n = { ...p }; delete n[id]; return n; }); return; }
    showToast(`${lead.naam} → ${LEAD_STATUS[stage].label}`, 'success');
    await refetch();
    setPending((p) => { const n = { ...p }; delete n[id]; return n; });
  }

  /* AI-concept: menu-voorstel gegrond in eigen receptenbibliotheek (recipe-generate,
     mode='menu', Sonnet + Citations + cost-cap). Klant-tekst via <user_query>-wrap = injection-veilig. */
  async function genConcept(lead: Lead) {
    setAiLoading(true);
    try {
      const promptParts = [
        lead.event_type ? `Type event: ${lead.event_type}.` : '',
        lead.gasten ? `${lead.gasten} gasten.` : '',
        lead.budget_indicatie ? `Budget-indicatie: ${lead.budget_indicatie}.` : '',
        lead.locatie ? `Locatie: ${lead.locatie}.` : '',
        lead.bericht ? `Wensen van de klant: ${lead.bericht}` : '',
      ].filter(Boolean).join(' ');
      const res = await fetch('/api/recipe-generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'menu', prompt: promptParts || `BBQ-menu voor ${lead.gasten || 30} gasten`,
          existing: gerechten.map((g) => ({ naam: g.naam, gang: g.gang || undefined, categorie: g.categorie || undefined, tags: g.tags || undefined })),
          options: { gasten: lead.gasten || 30, gangen: 3 },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success && data.data) {
        const c = data.data as AiConcept;
        setConcept(c); await saveLeadConcept(lead.id, c); refetch();
        showToast('AI-concept gegenereerd', 'success');
      } else { showToast(data.error || 'AI-concept mislukt — probeer opnieuw', 'error'); }
    } catch { showToast('AI-concept mislukt — probeer opnieuw', 'error'); }
    finally { setAiLoading(false); }
  }

  /* "Maak offerte": prefill de AI-offerte-wizard via localStorage + navigeer.
     Zet de lead op 'offerte'. offerte_id-terugkoppeling op de offertes-pagina. */
  async function maakOfferte(lead: Lead) {
    const draft = {
      clientName: lead.client_naam || lead.naam || '', clientAddress: lead.locatie || '',
      eventDate: lead.event_datum || '', gasten: lead.gasten || 0, vegaCount: 0, gangen: {},
      prompt: [
        lead.event_type, lead.budget_indicatie ? 'budget ' + lead.budget_indicatie : '', lead.bericht,
        concept?.gerechten?.length ? 'Voorgesteld AI-menu: ' + concept.gerechten.map((g) => g.naam).join(', ') : '',
      ].filter(Boolean).join(' · '),
      /* Volledige AI-concept meegeven: wizard opent dan direct op het
         controle-scherm i.p.v. een tweede (identieke) generatie van ~2 min. */
      generated: concept || undefined,
      savedAt: Date.now(),
    };
    try {
      localStorage.setItem('bbq_ai_offerte_wizard_draft', JSON.stringify(draft));
      localStorage.setItem('bbq_lead_convert', JSON.stringify({ leadId: lead.id, email: lead.email || '' }));
    } catch { /* private mode — prefill leeg */ }
    await quickStatus(lead, 'offerte');
    router.push('/offertes?wizard=true');
  }

  function copyFormLink() {
    if (!slug) return;
    const url = `${window.location.origin}/aanvraag/${slug}`;
    navigator.clipboard?.writeText(url).then(() => showToast('Formulier-link gekopieerd', 'success')).catch(() => {});
  }

  const isEmpty = !loading && leads.length === 0;
  const total = leads.length;

  return (
    <div className="leads-root" style={{ padding: '8px 28px 40px', maxWidth: 1340, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 18 }}>
        <div>
          <h1 style={{ fontSize: 27, fontWeight: 800, color: 'var(--text)', margin: 0, display: 'flex', alignItems: 'center', gap: 12 }}>
            Aanvragen
            {!isEmpty && total > 0 && (
              <span className="mono" style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted-light)', background: 'var(--card-solid)', border: '1px solid var(--border)', borderRadius: 999, padding: '3px 10px' }}>{total}</span>
            )}
          </h1>
          <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 5, maxWidth: 540, lineHeight: 1.45 }}>Inkomende aanvragen — van eerste contact tot gewonnen offerte.</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          {!isEmpty && (
            <div style={{ display: 'flex', gap: 0, borderRadius: 12, border: '1px solid var(--border)', background: 'var(--card-solid)', overflow: 'hidden' }}>
              {[
                { label: 'Open leads', value: String(kpi.open), sub: `€ ${(kpi.openValue / 1000).toFixed(1)}k in pijplijn`, tone: 'var(--text)' },
                { label: 'Win-ratio', value: kpi.winRatio == null ? '—' : kpi.winRatio + '%', sub: `${kpi.won} gewonnen · ${kpi.lost} verloren`, tone: 'var(--green)' },
                { label: 'Gewonnen waarde', value: `€ ${(kpi.wonValue / 1000).toFixed(1)}k`, sub: 'dit seizoen', tone: 'var(--brand-gold, var(--brand))' },
                { label: 'Te lang stil', value: String(kpi.stale), sub: 'nieuw · >24u', tone: kpi.stale > 0 ? 'var(--orange, #f97316)' : 'var(--muted)' },
              ].map((s) => (
                <div key={s.label} style={{ padding: '10px 16px', borderLeft: '1px solid var(--border)', minWidth: 108 }}>
                  <div className="lead-eyebrow" style={{ fontSize: 9.5, marginBottom: 3 }}>{s.label}</div>
                  <div className="mono" style={{ fontSize: 19, fontWeight: 800, color: s.tone, lineHeight: 1.1 }}>{s.value}</div>
                  <div style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 2, whiteSpace: 'nowrap' }}>{s.sub}</div>
                </div>
              ))}
            </div>
          )}
          <button className="btn btn-brand" onClick={openNew} style={{ flexShrink: 0, minHeight: 42 }}><Plus size={15} /> Nieuwe aanvraag</button>
        </div>
      </div>

      {isEmpty ? (
        <EmptyLeads onNew={openNew} onCopyLink={slug ? copyFormLink : undefined} />
      ) : (
        <>
          {/* Toolbar: search + view toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
              <span style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', display: 'inline-flex' }}><Search size={16} color="var(--muted)" /></span>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Zoek op naam, type, plaats of nummer…"
                style={{ width: '100%', boxSizing: 'border-box', background: 'var(--bg-deep, var(--card))', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 10, padding: '11px 14px 11px 38px', fontSize: 13.5, outline: 'none', minHeight: 44 }} />
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {['', ...EVENT_TYPES].map((t) => {
                const on = eventFilter === t;
                const label = t === '' ? 'Alle events' : t;
                return (
                  <button key={t || 'alle'} onClick={() => setEventFilter(t)}
                    style={{
                      padding: '7px 13px', borderRadius: 999, fontSize: 12, fontWeight: on ? 700 : 500, cursor: 'pointer',
                      border: on ? '1px solid rgba(255,191,0,.4)' : '1px solid var(--border)',
                      background: on ? 'var(--brand-tint)' : 'transparent',
                      color: on ? 'var(--brand)' : 'var(--muted)', transition: 'all .12s', whiteSpace: 'nowrap',
                    }}>{label}</button>
                );
              })}
            </div>
            <div style={{ display: 'flex', gap: 4, padding: 4, borderRadius: 10, background: 'var(--bg-deep, var(--card))', border: '1px solid var(--border)', flexShrink: 0 }}>
              {([['kanban', 'Kanban', LayoutGrid], ['lijst', 'Lijst', List]] as const).map(([v, label, IconC]) => {
                const on = viewMode === v;
                return (
                  <button key={v} onClick={() => setViewMode(v)}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '0 14px', minHeight: 36, borderRadius: 7, border: 'none', cursor: 'pointer', background: on ? 'var(--brand-tint)' : 'transparent', color: on ? 'var(--text)' : 'var(--muted)', fontSize: 13, fontWeight: 600, transition: 'all .12s' }}>
                    <IconC size={15} color={on ? 'var(--brand)' : 'var(--muted)'} />{label}
                  </button>
                );
              })}
            </div>
          </div>

          {filtered.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '60px 24px', color: 'var(--muted)' }}>
              <SearchX size={28} color="var(--muted-weak, var(--muted))" />
              <p style={{ marginTop: 14, fontSize: 14 }}>Geen aanvragen gevonden voor “{q}”.</p>
            </div>
          ) : viewMode === 'kanban' ? (
            <div style={{ display: 'flex', gap: 16, overflowX: 'auto', overflowY: 'hidden', padding: '2px 2px 6px' }}>
              {STAGES.map((stage) => {
                const items = filtered.filter((l) => statusOf(l) === stage);
                const s = LEAD_STATUS[stage];
                const isOver = overStage === stage && dragId != null;
                return (
                  <section key={stage}
                    onDragOver={(e) => { e.preventDefault(); setOverStage(stage); }}
                    onDragLeave={(e) => { if (e.currentTarget.contains(e.relatedTarget as Node)) return; setOverStage(null); }}
                    onDrop={(e) => { e.preventDefault(); handleDrop(stage); }}
                    style={{ display: 'flex', flexDirection: 'column', minWidth: 268, width: 268, flexShrink: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '0 4px 11px' }}>
                      <span style={{ width: 7, height: 7, borderRadius: 999, background: s.dot, boxShadow: s.glow ? `0 0 6px ${s.dot}` : 'none' }} />
                      <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text)', whiteSpace: 'nowrap' }}>{s.label}</span>
                      <span className="mono" style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted-light)', background: 'var(--card-solid)', border: '1px solid var(--border)', borderRadius: 999, minWidth: 22, height: 20, padding: '0 7px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{items.length}</span>
                      {(() => {
                        const staleN = items.filter((l) => isStale(l, statusOf(l))).length;
                        return staleN > 0 ? (
                          <span title={`${staleN} niet gereageerd >24u`} className="mono" style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--orange, #f97316)', background: 'rgba(249,115,22,.10)', border: '1px solid rgba(249,115,22,.3)', borderRadius: 999, height: 20, padding: '0 7px', display: 'inline-flex', alignItems: 'center', gap: 3 }}>{staleN}</span>
                        ) : null;
                      })()}
                      {(() => {
                        const v = items.reduce((sm, l) => sm + leadValue(l), 0);
                        return v > 0 ? <span className="mono" style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--muted-light)' }}>€ {(v / 1000).toFixed(1)}k</span> : null;
                      })()}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minHeight: 96, padding: '4px 4px 8px', borderRadius: 12, transition: 'background .15s, border-color .15s', border: `1.5px dashed ${isOver ? s.border : 'transparent'}`, background: isOver ? s.bg : 'transparent' }}>
                      {items.map((l) => <LeadCard key={l.id} lead={l} onOpen={() => openLead(l)} onDragStart={() => setDragId(l.id)} onDragEnd={() => { setDragId(null); setOverStage(null); }} dragging={dragId === l.id} />)}
                      {items.length === 0 && (
                        <div style={{ flex: 1, minHeight: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', borderRadius: 10, border: '1px dashed var(--border)', color: 'var(--muted-weak, var(--muted))', fontSize: 12, padding: 16 }}>
                          {isOver ? 'Laat los om te verplaatsen' : 'Sleep een aanvraag hierheen'}
                        </div>
                      )}
                    </div>
                  </section>
                );
              })}
            </div>
          ) : (
            <div className="panel" style={{ overflow: 'hidden', borderRadius: 12 }}>
              <div className="leads-list-head lead-eyebrow" style={{ display: 'grid', gridTemplateColumns: '1fr 130px 70px 130px 150px', gap: 14, padding: '12px 18px', borderBottom: '1px solid var(--border)' }}>
                <span>Aanvraag</span><span className="leads-cell-hide-sm">Datum</span><span className="leads-cell-hide-sm">Gasten</span><span className="leads-cell-hide-sm">Budget</span><span>Status</span>
              </div>
              {filtered.map((l, i) => (
                <div key={l.id} className="leads-list-row" onClick={() => openLead(l)}
                  style={{ display: 'grid', gridTemplateColumns: '1fr 130px 70px 130px 150px', gap: 14, padding: '13px 18px', alignItems: 'center', cursor: 'pointer', borderBottom: i < filtered.length - 1 ? '1px solid var(--border)' : 'none' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,.02)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.naam}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {[l.event_type, l.locatie, SOURCE_LABEL[l.source] || l.source].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  <span className="mono leads-cell-hide-sm" style={{ fontSize: 12.5, color: 'var(--muted-light)' }}>{fmtDateShort(l.event_datum)}</span>
                  <span className="mono leads-cell-hide-sm" style={{ fontSize: 12.5, color: 'var(--muted-light)' }}>{l.gasten != null ? l.gasten + 'p' : '—'}</span>
                  <span className="mono leads-cell-hide-sm" style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--brand-gold, var(--brand))' }}>{l.menu_prijs_indicatie != null ? '~ ' + formatEur(l.menu_prijs_indicatie) : (l.budget_indicatie || '—')}</span>
                  <span style={{ justifySelf: 'start' }}><LeadBadge status={statusOf(l)} size="sm" /></span>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Detail / edit drawer */}
      {drawer && (
        <div onClick={closeDrawer} className="lead-drawer-scrim" style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(0,0,0,.55)', backdropFilter: 'blur(3px)', display: 'flex', justifyContent: 'flex-end' }}>
          <div onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Aanvraag" className="lead-drawer-panel"
            style={{ width: 'min(480px, 100%)', height: '100%', background: 'var(--bg)', borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column', boxShadow: '-24px 0 70px rgba(0,0,0,.5)' }}>
            {/* header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '16px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
              <div style={{ minWidth: 0 }}>
                <div className="lead-eyebrow" style={{ color: 'var(--brand)', marginBottom: 5 }}>Aanvraag</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <h2 style={{ fontSize: 19, fontWeight: 800, color: 'var(--text)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {drawer === 'new' ? 'Nieuwe aanvraag' : (form.naam || drawer.naam)}
                  </h2>
                  {drawer !== 'new' && <LeadBadge status={form.status} size="sm" />}
                </div>
              </div>
              <button onClick={closeDrawer} className="btn btn-icon btn-ghost" aria-label="Sluiten" style={{ minHeight: 40, minWidth: 40, flexShrink: 0 }}><X size={18} /></button>
            </div>

            {/* body */}
            <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 20 }}>
              {drawer !== 'new' && (
                <>
                  <RelatedEntityPills kind="lead" id={drawer.id} title="Gekoppeld" />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', fontSize: 12.5 }}>
                    {form.email && <a href={`mailto:${form.email}`} onClick={(e) => e.stopPropagation()} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--brand)', textDecoration: 'none', fontWeight: 600 }}><Mail size={14} color="var(--brand)" />Mail</a>}
                    {form.telefoon && <a href={`tel:${form.telefoon.replace(/\s/g, '')}`} onClick={(e) => e.stopPropagation()} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--brand)', textDecoration: 'none', fontWeight: 600 }}><Phone size={14} color="var(--brand)" />Bel</a>}
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--muted)', marginLeft: 'auto' }}>
                      {(() => { const SI = sourceIcon(drawer.source); return <SI size={13} />; })()}
                      {SOURCE_LABEL[drawer.source] || drawer.source} · {relTime(drawer.created_at)}
                    </span>
                  </div>
                </>
              )}

              {/* Zelf samengesteld arrangement — gekozen niveaus + indicatie-omzet */}
              {drawer !== 'new' && drawer.menu_selectie && <ArrangementLeadBlock lead={drawer} />}

              {/* AI-concept menu — gegrond in eigen receptenbibliotheek */}
              {drawer !== 'new' && <AIConceptBlock lead={drawer} concept={concept} loading={aiLoading} onGenerate={() => genConcept(drawer)} onUse={() => maakOfferte(drawer)} />}

              {/* Status-selector (5 segmenten) */}
              {drawer !== 'new' && (
                <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  <span className="lead-eyebrow">Status</span>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 5, padding: 5, borderRadius: 11, background: 'var(--bg-deep, var(--card))', border: '1px solid var(--border)' }}>
                    {STAGES.map((st) => {
                      const s = LEAD_STATUS[st]; const on = form.status === st; const I = s.Icon;
                      return (
                        <button key={st} onClick={() => quickStatus(drawer, st)} title={s.label} type="button"
                          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '8px 2px', borderRadius: 7, cursor: 'pointer', border: on ? `1px solid ${s.border}` : '1px solid transparent', background: on ? s.bg : 'transparent', transition: 'all .12s' }}>
                          <I size={16} color={on ? s.text : 'var(--muted)'} />
                          <span style={{ fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: on ? s.text : 'var(--muted)', lineHeight: 1, whiteSpace: 'nowrap' }}>{s.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </label>
              )}

              {/* editable fields */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <DField label="Naam"><input style={dInput} value={form.naam} onChange={(e) => setF('naam', e.target.value)} placeholder="Voor- en achternaam" /></DField>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <DField label="E-mail"><input type="email" style={dInput} value={form.email} onChange={(e) => setF('email', e.target.value)} placeholder="naam@voorbeeld.nl" /></DField>
                  <DField label="Telefoon" optional><input type="tel" style={dInput} value={form.telefoon} onChange={(e) => setF('telefoon', e.target.value)} placeholder="06 – 12 34 56 78" /></DField>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <DField label="Datum" optional><input type="date" style={dInput} value={form.event_datum} onChange={(e) => setF('event_datum', e.target.value)} /></DField>
                  <DField label="Gasten" optional><input type="number" min={0} style={dInput} value={form.gasten} onChange={(e) => setF('gasten', e.target.value)} placeholder="bijv. 80" /></DField>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <DField label="Type event" optional>
                    <select value={form.event_type} onChange={(e) => setF('event_type', e.target.value)} style={{ ...dInput, appearance: 'none', cursor: 'pointer' }}>
                      <option value="">Kies…</option>
                      {EVENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </DField>
                  <DField label="Budget" optional><input style={dInput} value={form.budget_indicatie} onChange={(e) => setF('budget_indicatie', e.target.value)} placeholder="€ 2.000" /></DField>
                </div>
                <DField label="Locatie" optional><input style={dInput} value={form.locatie} onChange={(e) => setF('locatie', e.target.value)} placeholder="Plaats of adres" /></DField>
                <DField label="Bericht" optional><textarea value={form.bericht} onChange={(e) => setF('bericht', e.target.value)} placeholder="Wensen, dieetwensen & sfeer…" rows={4} style={{ ...dInput, minHeight: 92, resize: 'vertical', lineHeight: 1.5 }} /></DField>
              </div>
            </div>

            {/* footer */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 16, borderTop: '1px solid var(--border)', flexShrink: 0 }}>
              <button className="btn btn-brand" style={{ flex: 1.3, justifyContent: 'center', minHeight: 42 }} onClick={handleSave} disabled={saving}><Check size={15} />{saving ? 'Opslaan…' : 'Opslaan'}</button>
              {drawer !== 'new' && (
                <>
                  <button className="btn btn-ghost" style={{ flex: 1.2, justifyContent: 'center', minHeight: 42 }} onClick={() => maakOfferte(drawer)}>Maak offerte<ArrowRight size={14} /></button>
                  <button className="btn btn-icon btn-red" title="Aanvraag verwijderen" style={{ flexShrink: 0, minHeight: 42, minWidth: 42 }} onClick={() => handleDelete(drawer)}><Trash2 size={16} /></button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Kanban-kaart ──────────────────────────────────────────────────────── */
function LeadCard({ lead, onOpen, onDragStart, onDragEnd, dragging }: { lead: Lead; onOpen: () => void; onDragStart: () => void; onDragEnd: () => void; dragging: boolean }) {
  const s = LEAD_STATUS[(lead.status as LeadStatus)] || LEAD_STATUS.nieuw;
  const [hover, setHover] = useState(false);
  const SI = sourceIcon(lead.source);
  return (
    <article draggable onClick={onOpen}
      onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; onDragStart(); }} onDragEnd={onDragEnd}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ position: 'relative', cursor: 'pointer', borderRadius: 12, overflow: 'hidden', flexShrink: 0, background: 'var(--card-solid)', border: '1px solid var(--border)', boxShadow: hover ? 'var(--shadow-card-hover)' : 'var(--shadow-card)', transform: dragging ? 'scale(.98)' : hover ? 'translateY(-2px)' : 'none', opacity: dragging ? 0.4 : 1, transition: 'transform .18s ease, box-shadow .25s ease, opacity .12s' }}>
      <div style={{ height: 3, background: s.dot, opacity: 0.85 }} />
      <div style={{ padding: '13px 14px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--text)', lineHeight: 1.25, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lead.naam}</div>
            {lead.event_type && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 3 }}>{lead.event_type}</div>}
          </div>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            {isStale(lead, (lead.status as LeadStatus) || 'nieuw') && (
              <span title="Niet gereageerd >24u" className="mono" style={{ fontSize: 9.5, fontWeight: 800, color: 'var(--orange, #f97316)', background: 'rgba(249,115,22,.12)', border: '1px solid rgba(249,115,22,.32)', borderRadius: 999, padding: '2px 7px', letterSpacing: '.03em' }}>&gt;24u</span>
            )}
            <span style={{ opacity: hover ? 0.7 : 0, transition: 'opacity .15s', color: 'var(--muted)', marginTop: -2, cursor: 'grab' }}><GripVertical size={15} /></span>
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px 12px', marginTop: 11 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--muted-light)', whiteSpace: 'nowrap' }}><Calendar size={13} color="var(--muted)" /><span className="mono">{fmtDateShort(lead.event_datum)}</span></span>
          {lead.gasten != null && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--muted-light)', whiteSpace: 'nowrap' }}><Users size={13} color="var(--muted)" /><span className="mono">{lead.gasten}</span></span>}
          {lead.locatie && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--muted-light)', minWidth: 0 }}><MapPin size={13} color="var(--muted)" /><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lead.locatie}</span></span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 12, paddingTop: 11, borderTop: '1px solid var(--border)' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--muted)' }}><SI size={11} color="var(--muted)" />{relTime(lead.created_at)}</span>
          {lead.menu_prijs_indicatie != null
            ? <span className="mono" title="Indicatie-omzet — zelf samengesteld" style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--brand-gold, var(--brand))' }}>~ {formatEur(lead.menu_prijs_indicatie)}</span>
            : lead.budget_indicatie && <span className="mono" style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--brand-gold, var(--brand))' }}>{lead.budget_indicatie}</span>}
        </div>
      </div>
    </article>
  );
}

/* ── Zelf-samengesteld-arrangement-blok (gekozen niveaus + indicatie-omzet) ── */
function ArrangementLeadBlock({ lead }: { lead: Lead }) {
  const sel = lead.menu_selectie;
  if (!sel) return null;
  const totaal = lead.menu_prijs_indicatie != null ? lead.menu_prijs_indicatie : sel.pp * sel.gasten;
  return (
    <div style={{ borderRadius: 14, overflow: 'hidden', flexShrink: 0, background: 'var(--card-solid)', border: '1px solid var(--border)' }}>
      <div style={{ padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 14 }}>
          <span style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--brand-tint)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Layers size={15} color="var(--brand)" /></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)' }}>Zelf samengesteld arrangement</div>
            <div style={{ fontSize: 11.5, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sel.arrangement_naam} · {sel.gasten} gasten</div>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {sel.regels.map((r, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, fontSize: 12.5 }}>
              <span style={{ color: 'var(--muted)', flex: 'none' }}>{r.categorie}</span>
              <span style={{ flex: 1, borderBottom: '1px dotted var(--border)', margin: '0 2px', transform: 'translateY(-3px)' }} />
              <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 8, flex: 'none' }}>
                <span style={{ fontWeight: 600, color: 'var(--text)' }}>{r.niveau}</span>
                <span className="mono" style={{ color: 'var(--muted-light)', fontSize: 11.5 }}>{formatEur(r.prijs_pp)} p.p.</span>
              </span>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 14, paddingTop: 13, borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10 }}>
          <div>
            <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 700 }}>Indicatie-omzet</div>
            <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>{formatEur(sel.pp)} p.p. × {sel.gasten} gasten</div>
          </div>
          <div className="mono" style={{ fontSize: 21, fontWeight: 800, color: 'var(--brand-gold, var(--brand))', letterSpacing: '-.02em' }}>~ {formatEur(totaal)}</div>
        </div>
        <div style={{ marginTop: 8, fontSize: 10.5, color: 'var(--muted)' }}>Indicatie op basis van de keuze van de klant — niet bindend. Eindprijs bepaal je in de offerte.</div>
      </div>
    </div>
  );
}

/* ── AI-concept-blok (3 fases: leeg → laden → klaar) ───────────────────── */
function AIConceptBlock({ lead, concept, loading, onGenerate, onUse }: { lead: Lead; concept: AiConcept | null; loading: boolean; onGenerate: () => void; onUse: () => void }) {
  const phase = loading ? 'loading' : concept ? 'done' : 'empty';
  return (
    <div style={{ position: 'relative', borderRadius: 14, overflow: 'hidden', flexShrink: 0, background: 'linear-gradient(155deg, rgba(255,191,0,.13), rgba(196,163,90,.05) 55%, rgba(255,191,0,.02))', border: '1px solid var(--brand-tint-border, var(--border))', boxShadow: 'inset 0 0 28px rgba(255,191,0,.05)' }}>
      <div style={{ padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: phase === 'empty' ? 10 : 14 }}>
          <span style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--brand-tint)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Sparkles size={15} color="var(--brand)" /></span>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 7 }}>AI-concept menu<span className="lead-prem-badge" style={{ padding: '2px 7px', fontSize: 9.5 }}>Premium</span></div>
        </div>

        {phase === 'empty' && (
          <>
            <p style={{ fontSize: 12.5, color: 'var(--muted-light)', lineHeight: 1.5, margin: '0 0 14px' }}>Wij stellen op basis van type, gasten en wensen een passend menu samen — gegrond in je eigen recepten. Jij past het daarna aan.</p>
            <button onClick={onGenerate} style={{ width: '100%', justifyContent: 'center', display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 46, border: 'none', borderRadius: 10, cursor: 'pointer', background: 'var(--gold-gradient)', color: '#0a0a0c', fontSize: 13.5, fontWeight: 700, boxShadow: '0 4px 16px rgba(196,163,90,.28)' }}><Sparkles size={16} color="#0a0a0c" /> Genereer concept-menu</button>
          </>
        )}

        {phase === 'loading' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '6px 0 4px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><span className="lead-spin"><Loader2 size={18} color="var(--brand-gold, var(--brand))" /></span><span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Genereren…</span></div>
            <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>Menu afstemmen op {lead.gasten || 0} gasten{lead.event_type ? ' · ' + lead.event_type.toLowerCase() : ''}</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 2 }}>{[88, 72, 80].map((w, i) => <div key={i} className="lead-skel" style={{ width: w + '%', height: 11, borderRadius: 6 }} />)}</div>
          </div>
        )}

        {phase === 'done' && concept && (
          <div style={{ animation: 'lead-fade .25s ease' }}>
            {concept.menu_naam && <div style={{ fontFamily: 'var(--font-artisan, var(--font-display, inherit))', fontStyle: 'italic', fontWeight: 600, fontSize: 19, color: 'var(--text)', lineHeight: 1.2, marginBottom: 11 }}>{concept.menu_naam}</div>}
            {concept.gerechten?.length ? (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {concept.gerechten.map((g, i) => (
                  <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 9, fontSize: 13, color: 'var(--muted-light)', lineHeight: 1.35 }}>
                    <Flame size={13} color="var(--brand-gold, var(--brand))" style={{ marginTop: 3, flexShrink: 0 }} /><span>{g.naam}{g.gang ? ` — ${g.gang}` : ''}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            {concept.adviesprijs_pp ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 14, paddingTop: 13, borderTop: '1px solid var(--brand-tint-border, var(--border))' }}>
                <span className="lead-eyebrow" style={{ color: 'var(--brand)' }}>Advies p.p.</span>
                <span className="mono" style={{ fontFamily: 'var(--font-display, inherit)', fontWeight: 600, fontSize: 22, color: 'var(--brand)' }}>{formatEur(concept.adviesprijs_pp)}</span>
              </div>
            ) : null}
            <div style={{ display: 'flex', gap: 8, marginTop: 13 }}>
              <button onClick={onGenerate} className="btn btn-ghost btn-sm" style={{ flex: 1, justifyContent: 'center' }}><RefreshCw size={13} />Opnieuw</button>
              <button onClick={onUse} className="btn btn-gold btn-sm" style={{ flex: 1.4, justifyContent: 'center' }}><ArrowRight size={13} />Gebruik in offerte</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Empty state ───────────────────────────────────────────────────────── */
function EmptyLeads({ onNew, onCopyLink }: { onNew: () => void; onCopyLink?: () => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '56px 24px', minHeight: 420 }}>
      <div style={{ width: 76, height: 76, borderRadius: 20, background: 'var(--lampion-glow), var(--card-solid)', border: '1px solid var(--brand-tint-border, var(--border))', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 22, boxShadow: 'var(--shadow-card)' }}>
        <Inbox size={32} color="var(--brand)" strokeWidth={1.6} />
      </div>
      <h2 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text)', margin: '0 0 10px' }}>Nog geen aanvragen</h2>
      <p style={{ color: 'var(--muted)', fontSize: 14.5, maxWidth: 430, lineHeight: 1.6, margin: 0 }}>Zodra iemand je aanvraagformulier invult, landt de aanvraag hier — van eerste contact tot gewonnen offerte. Deel je formulier-link of voeg er handmatig één toe.</p>
      <div style={{ display: 'flex', gap: 10, marginTop: 24, flexWrap: 'wrap', justifyContent: 'center' }}>
        <button className="btn btn-brand" onClick={onNew}><Plus size={15} />Nieuwe aanvraag</button>
        {onCopyLink && <button className="btn btn-ghost" onClick={onCopyLink}><Link2 size={15} />Kopieer formulier-link</button>}
      </div>
      <div style={{ marginTop: 30, display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--muted-weak, var(--muted))' }}>
        <Sparkles size={13} color="var(--brand-gold, var(--brand))" />Tip: bij elke aanvraag stel je met één klik een AI-concept-menu voor.
      </div>
    </div>
  );
}

/* ── kleine veld-helpers ───────────────────────────────────────────────── */
const dInput: React.CSSProperties = { width: '100%', background: 'var(--bg-deep, var(--card))', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 10, padding: '11px 12px', fontSize: 14, outline: 'none', minHeight: 44, boxSizing: 'border-box' };
function DField({ label, optional, children }: { label: string; optional?: boolean; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      <span className="lead-eyebrow" style={{ display: 'flex', alignItems: 'center', gap: 7 }}>{label}{optional && <span style={{ color: 'var(--muted-weak, var(--muted))', fontWeight: 600, letterSpacing: 0, textTransform: 'none', fontSize: 10 }}>optioneel</span>}</span>
      {children}
    </label>
  );
}
