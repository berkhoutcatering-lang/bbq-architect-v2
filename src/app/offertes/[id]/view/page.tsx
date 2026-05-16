/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  CircleDot, Eye, Download, Send, Copy, GitBranch, TrendingUp, Flame, Leaf,
  Users, Plus, Save, Sparkles, Target, ChevronRight, MessageCircle, ArrowLeft,
  AlertTriangle,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { calcDishCostPP as sharedCalcDishCostPP } from '@/lib/costCalculations';
import '@/components/redesign/redesign.css';

type Tone = 'ok' | 'warn' | 'bad';

const fmtEur = (n: number) => '€ ' + n.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtEur0 = (n: number) => '€ ' + Math.round(n).toLocaleString('nl-NL');

function InteractiveMarginDoctorEmpty({ total, reason }: { total: number; reason: string }) {
  return (
    <div className="mdoc-card" style={{ borderColor: 'var(--border)' }}>
      <div className="mdoc-eyebrow" style={{ color: 'var(--muted)' }}>
        <Sparkles size={11} />Margin doctor · wacht op data
      </div>
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        textAlign: 'center', padding: '24px 12px', gap: 10,
        aspectRatio: '1 / 1', maxWidth: 200, margin: '0 auto 8px',
        borderRadius: '50%', border: '1px dashed rgba(130,130,130,.3)',
      }}>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 200, fontSize: 42, color: 'var(--muted)', lineHeight: 1 }}>—</div>
        <div style={{ fontSize: 9, letterSpacing: '.2em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 700 }}>marge onbekend</div>
      </div>
      <div style={{
        fontSize: 11.5, color: 'var(--text)', lineHeight: 1.55,
        padding: '10px 12px', borderRadius: 8,
        background: 'rgba(245,158,11,.05)', border: '1px solid rgba(245,158,11,.2)',
        marginBottom: 14,
      }}>
        <strong style={{ color: 'var(--amber)' }}>Geen cost-data.</strong> {reason}
      </div>
      <div className="mdoc-split">
        <div className="mdoc-split-row"><span className="k">Omzet</span><span className="v tabular">{fmtEur0(total)}</span></div>
        <div className="mdoc-split-row"><span className="k">Inkoop & crew</span><span className="v tabular" style={{ color: 'var(--muted)' }}>—</span></div>
        <div className="mdoc-split-row" style={{ borderTop: '1px solid var(--border)', paddingTop: 10, marginTop: 2 }}>
          <span className="k" style={{ color: 'var(--text)', fontWeight: 600 }}>Brutomarge</span>
          <span className="v tabular" style={{ color: 'var(--muted)' }}>—</span>
        </div>
      </div>
    </div>
  );
}

function InteractiveMarginDoctor({ value, total, totalCost }: { value: number; total: number; totalCost: number }) {
  const [target, setTarget] = useState(60);
  const [dragging, setDragging] = useState(false);
  const ringRef = useRef<SVGSVGElement | null>(null);
  const size = 200, stroke = 8, r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const pct = Math.min(value, 100) / 100;
  const tone: Tone = value >= target ? 'ok' : value >= target - 10 ? 'warn' : 'bad';
  const delta = value - target;
  const projectedRevenue = target < 100 ? totalCost / (1 - target / 100) : total;
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
}

function QLine({ qty, unit_label, name, sub, unit_price, cost }: { qty: number; unit_label?: string; name: string; sub?: string; unit_price: number; cost: number | null }) {
  const hasCost = cost != null && cost > 0 && unit_price > 0;
  const m = hasCost ? Math.round((unit_price - (cost as number)) / unit_price * 100) : null;
  const mTone: Tone = m == null ? 'ok' : m >= 55 ? 'ok' : m >= 40 ? 'warn' : 'bad';
  return (
    <div className="qline">
      <div className="qty">{qty}<span className="x">×{unit_label ? ` ${unit_label}` : ''}</span></div>
      <div>
        <div className="name">{name}</div>
        {sub && <div className="name-sub">{sub}</div>}
      </div>
      <div className="unit">
        {fmtEur(unit_price)}
        {hasCost ? <span className="sub">cost {fmtEur(cost as number)}</span> : <span className="sub" style={{ color: 'var(--muted-light)' }}>cost —</span>}
      </div>
      <div className="margin-strip">
        {m != null ? (
          <>
            <div className={`pct ${mTone}`}>{m}% marge</div>
            <div className="track">
              <div className={`fill ${mTone}`} style={{ width: Math.min(Math.max(m, 0), 100) + '%' }} />
              <div className="marker" style={{ left: '60%' }} title="Target 60%" />
            </div>
          </>
        ) : (
          <div style={{ fontSize: 11, color: 'var(--muted-light)', fontStyle: 'italic' }}>marge onbekend</div>
        )}
      </div>
      <div className="total">{fmtEur(qty * unit_price)}</div>
    </div>
  );
}

/* Group items by keywords for Smoker / Sides / Crew rendering */
function groupItems(items: any[]): { title: string; Ic: typeof Flame; items: any[] }[] {
  const smoker: any[] = [];
  const sides: any[] = [];
  const crew: any[] = [];
  const other: any[] = [];
  for (const it of items) {
    const d = (it.omschrijving || '').toLowerCase();
    if (/pitmaster|crew|service|personeel|uren|transport|logist/i.test(d)) crew.push(it);
    else if (/brisket|smoke|pulled|ribs|bbq|low.?slow|kip|zalm|bavette|burger/i.test(d)) smoker.push(it);
    else if (/sides|saus|coleslaw|cornbread|salade|brood|groent|dessert/i.test(d)) sides.push(it);
    else other.push(it);
  }
  const groups: { title: string; Ic: typeof Flame; items: any[] }[] = [];
  if (smoker.length) groups.push({ title: 'Smoker mains', Ic: Flame, items: smoker });
  if (sides.length) groups.push({ title: 'Sides & sauzen', Ic: Leaf, items: sides });
  if (other.length) groups.push({ title: 'Overige', Ic: Leaf, items: other });
  if (crew.length) groups.push({ title: 'Crew & logistiek', Ic: Users, items: crew });
  if (groups.length === 0 && items.length) groups.push({ title: 'Regels', Ic: Flame, items });
  return groups;
}

export default function OfferteViewPage() {
  const params = useParams();
  const router = useRouter();
  const offerteId = parseInt(String(params.id), 10);

  const [offerte, setOfferte] = useState<any>(null);
  const [klant, setKlant] = useState<any>(null);
  const [previousQuotes, setPreviousQuotes] = useState<any[]>([]);
  const [gerechten, setGerechten] = useState<any[]>([]);
  const [inventory, setInventory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!offerteId || Number.isNaN(offerteId)) return;
    (async () => {
      const { data } = await supabase.from('offertes').select('*').eq('id', offerteId).single();
      if (!data) { setLoading(false); return; }
      setOfferte(data);
      const [rKlant, rPrev, rGer, rInv] = await Promise.all([
        data.client_naam ? supabase.from('klanten').select('*').eq('naam', data.client_naam).limit(1) : Promise.resolve({ data: null }) as any,
        supabase.from('offertes').select('*').eq('client_naam', data.client_naam || '__none__').neq('id', offerteId).order('datum', { ascending: false }).limit(5),
        supabase.from('gerechten').select('*'),
        supabase.from('inventory').select('*'),
      ]);
      if (rKlant && 'data' in rKlant && rKlant.data && rKlant.data.length > 0) setKlant(rKlant.data[0]);
      setPreviousQuotes(rPrev.data || []);
      setGerechten(rGer.data || []);
      setInventory(rInv.data || []);
      setLoading(false);
    })();
  }, [offerteId]);

  /* Cost model: prefer real data from menu_selectie + vaste_kosten + gerechten/inventory,
     fallback to 40% estimate on raw items. Tracks which mode is used.
     ingredient_costs kan als string-JSON in DB staan; we normaliseren naar array
     vóór we de gedeelde calculator aanroepen. */
  function calcDishCostPP(gerechtNaam: string): number {
    const g: any = gerechten.find((x: any) => x.naam === gerechtNaam);
    if (!g) return 0;
    let ingredients: any = g.ingredient_costs;
    if (typeof ingredients === 'string') { try { ingredients = JSON.parse(ingredients); } catch { ingredients = []; } }
    const normalized = [{ naam: gerechtNaam, ingredient_costs: Array.isArray(ingredients) ? ingredients : [] }];
    return sharedCalcDishCostPP(normalized as any, inventory as any, gerechtNaam);
  }

  const items = useMemo(() => {
    if (!offerte) return [] as any[];
    let rawItems = offerte.items;
    if (typeof rawItems === 'string') { try { rawItems = JSON.parse(rawItems); } catch { rawItems = []; } }
    return Array.isArray(rawItems) ? rawItems : [];
  }, [offerte]);

  /* Compute costs only from real data. No fake 40% fallback — we'd rather show nothing. */
  const costBreakdown = useMemo(() => {
    if (!offerte) return { totalCost: 0, available: false, reason: 'Geen offerte.', itemCosts: new Map<number, number>() };
    const guests = offerte.aantal_gasten || items[0]?.qty || 0;

    let menuSel = offerte.menu_selectie;
    if (typeof menuSel === 'string') { try { menuSel = JSON.parse(menuSel); } catch { menuSel = null; } }
    const menuArray: any[] = Array.isArray(menuSel) ? menuSel : (menuSel ? Object.values(menuSel).flat() as any[] : []);

    let vk = offerte.vaste_kosten;
    if (typeof vk === 'string') { try { vk = JSON.parse(vk); } catch { vk = null; } }
    const vasteKostenTotal = Array.isArray(vk) ? vk.reduce((s: number, k: any) => s + (parseFloat(k.bedrag) || 0), 0) : 0;

    /* Path 1: per-line cost field on items */
    const itemCosts = new Map<number, number>();
    const allLinesHaveCost = items.length > 0 && items.every((it, i) => {
      const c = Number(it.cost);
      if (c > 0) { itemCosts.set(i, c); return true; }
      return false;
    });
    if (allLinesHaveCost) {
      const totalCost = items.reduce((s, it, i) => s + (Number(it.qty) || 0) * (itemCosts.get(i) || 0), 0);
      return { totalCost, available: true as const, reason: '', itemCosts };
    }

    /* Path 2: menu_selectie + gerechten with ingredient_costs */
    if (menuArray.length > 0 && gerechten.length > 0) {
      let foodcostPP = 0;
      let allGerechtenHaveCosts = true;
      for (const sel of menuArray) {
        if (!sel) continue;
        const name = sel.gerecht_naam || sel.naam || '';
        const g = gerechten.find((x: any) => x.naam === name);
        if (!g || !g.ingredient_costs || (Array.isArray(g.ingredient_costs) && g.ingredient_costs.length === 0)) {
          allGerechtenHaveCosts = false;
        }
        foodcostPP += calcDishCostPP(name);
      }
      if (allGerechtenHaveCosts && foodcostPP > 0) {
        const foodcostTotal = foodcostPP * guests;
        return { totalCost: foodcostTotal + vasteKostenTotal, available: true as const, reason: '', itemCosts: new Map<number, number>() };
      }
      return {
        totalCost: 0,
        available: false as const,
        reason: 'De gekoppelde gerechten missen ingredient_costs. Voeg ingrediënten-kosten toe per gerecht voor een echte marge-berekening.',
        itemCosts: new Map<number, number>(),
      };
    }

    return {
      totalCost: 0,
      available: false as const,
      reason: 'Geen cost-per-regel en geen menu_selectie met recept-kosten. Koppel een Menu Wizard resultaat of vul per regel een cost-bedrag in.',
      itemCosts: new Map<number, number>(),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offerte, items, gerechten, inventory]);

  const totals = useMemo(() => {
    const subtotaal = items.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.prijs) || 0), 0);
    const btw = items.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.prijs) || 0) * ((Number(it.btw) || 9) / 100), 0);
    const totalCost = costBreakdown.available ? costBreakdown.totalCost : 0;
    const margin = costBreakdown.available && subtotaal > 0 ? ((subtotaal - totalCost) / subtotaal) * 100 : null;
    const guests = offerte?.aantal_gasten || items[0]?.qty || 0;
    return { subtotaal, btw, totalCost, margin, guests, totaal: subtotaal + btw };
  }, [items, offerte, costBreakdown]);

  const grouped = useMemo(() => groupItems(items), [items]);

  const clientStats = useMemo(() => {
    if (previousQuotes.length === 0) return { count: 0, revenue: 0, avgMargin: null as number | null };
    const revenue = previousQuotes.reduce((s, q) => {
      const its = typeof q.items === 'string' ? (() => { try { return JSON.parse(q.items); } catch { return []; } })() : (q.items || []);
      return s + (its || []).reduce((ss: number, it: any) => ss + (Number(it.qty) || 0) * (Number(it.prijs) || 0), 0);
    }, 0);
    return { count: previousQuotes.length, revenue, avgMargin: null };
  }, [previousQuotes]);

  if (loading) {
    return <div className="redesign-root" style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Laden…</div>;
  }
  if (!offerte) {
    return (
      <div className="redesign-root" style={{ padding: 40, textAlign: 'center' }}>
        <div style={{ maxWidth: 420, margin: '80px auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 56, height: 56, borderRadius: 14, background: 'rgba(130,130,130,.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)' }}>
            <AlertTriangle size={24} />
          </div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 300, fontSize: 22, margin: 0 }}>Offerte niet gevonden</h2>
          <p style={{ color: 'var(--muted)', fontSize: 13, lineHeight: 1.5, margin: 0 }}>
            Deze offerte bestaat niet (meer) of je hebt er geen toegang tot.
          </p>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button className="btn btn-ghost" onClick={() => router.back()}><ArrowLeft size={14} />Terug</button>
            <button className="btn btn-primary" onClick={() => router.push('/offertes')}>Naar offertes</button>
          </div>
        </div>
      </div>
    );
  }

  const statusLabel = offerte.status || 'concept';
  const isOptie = statusLabel === 'concept' || statusLabel === 'verzonden';
  const geldigDate = offerte.geldig_tot ? new Date(offerte.geldig_tot) : null;
  const daysUntilExpiry = geldigDate ? Math.ceil((geldigDate.getTime() - Date.now()) / 86400000) : null;

  return (
    <div className="redesign-root">
      <div className="main" style={{ padding: '24px 0 40px' }}>
        <div style={{ marginBottom: 12 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => router.push('/offertes')}>
            <ArrowLeft size={14} />Terug naar offertes
          </button>
        </div>

        <div className="page-head" style={{ marginBottom: 14, alignItems: 'flex-start', gap: 20 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="page-eyebrow">Offerte · {offerte.nummer}</div>
            <h1 className="page-title" style={{ margin: '0 0 8px', whiteSpace: 'normal', overflow: 'visible' }}>{offerte.client_naam}</h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span className={`pill ${isOptie ? 'p-optie' : 'p-ok'}`} style={{ whiteSpace: 'nowrap' }}>
                <CircleDot size={10} />{statusLabel}{daysUntilExpiry != null && daysUntilExpiry > 0 ? ` · vervalt over ${daysUntilExpiry}d` : ''}
              </span>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                {totals.guests} gasten{offerte.client_adres ? ' · ' + offerte.client_adres : ''}{offerte.datum ? ' · ' + offerte.datum : ''}
              </span>
            </div>
          </div>
          <div className="hstack" style={{ flexShrink: 0, marginTop: 24 }}>
            <button
              className="btn btn-ghost"
              onClick={() => offerte.public_token && window.open(`/q/${offerte.public_token}`, '_blank')}
              disabled={!offerte.public_token}
              title={offerte.public_token ? 'Open publieke link in nieuw tabblad' : 'Nog geen publieke link — publiceer eerst via de offerte-editor'}
              style={!offerte.public_token ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
            >
              <Eye size={14} />Preview
            </button>
            <button className="btn btn-ghost"><Download size={14} />PDF</button>
            <button className="btn btn-primary" onClick={() => router.push(`/offertes?edit=${offerte.id}`)}><Send size={14} />Bewerken</button>
          </div>
        </div>

        <div className="quote-grid">
          <div className="quote-main">
            <div className="quote-hero">
              <div className="quote-hero-top">
                <div>
                  <div className="eyebrow" style={{ marginBottom: 4 }}>Totaal</div>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 300, fontSize: 36, letterSpacing: '-.01em' }}>
                    {fmtEur(totals.totaal)} <span style={{ fontSize: 14, color: 'var(--muted)', fontWeight: 400 }}>incl. btw</span>
                  </div>
                </div>
                <div className="hstack" style={{ gap: 8 }}>
                  <button className="btn btn-ghost btn-sm"><Copy size={14} />Dupliceer</button>
                  <button className="btn btn-ghost btn-sm"><GitBranch size={14} />Nieuwe versie</button>
                </div>
              </div>
              <div className="quote-hero-stats">
                <div className="qhs"><div className="l">Gasten</div><div className="v">{totals.guests}</div></div>
                <div className="qhs"><div className="l">Per hoofd</div><div className="v">{totals.guests > 0 ? '€ ' + (totals.subtotaal / totals.guests).toFixed(2).replace('.', ',') : '—'}</div></div>
                <div className="qhs">
                  <div className="l">Brutomarge</div>
                  <div className={`v ${totals.margin != null ? 'gold' : ''}`} style={totals.margin == null ? { color: 'var(--muted)' } : undefined}>
                    {totals.margin != null ? fmtEur(totals.subtotaal - totals.totalCost) : '—'}
                  </div>
                  {totals.margin != null && <div className="delta"><TrendingUp size={11} />{totals.margin.toFixed(1)}%</div>}
                </div>
                <div className="qhs">
                  <div className="l">COGS ratio</div>
                  <div className="v" style={totals.margin == null ? { color: 'var(--muted)' } : undefined}>
                    {totals.margin != null && totals.subtotaal > 0 ? (totals.totalCost / totals.subtotaal * 100).toFixed(1) + '%' : '—'}
                  </div>
                </div>
              </div>
            </div>

            {!costBreakdown.available && items.length > 0 && (
              <div style={{
                padding: '10px 14px', borderRadius: 9, marginBottom: 14,
                background: 'rgba(245,158,11,.06)', border: '1px solid rgba(245,158,11,.25)',
                display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 12, color: 'var(--amber)',
              }}>
                <AlertTriangle size={14} style={{ marginTop: 1, flexShrink: 0 }} />
                <div style={{ lineHeight: 1.5, color: 'var(--text)' }}>
                  <strong>Marge kan niet berekend worden.</strong> {costBreakdown.reason}
                </div>
              </div>
            )}

            {/* Collapse grouping if only one group */}
            {(() => {
              const hasItemLevelCosts = costBreakdown.available && costBreakdown.itemCosts.size > 0;
              const renderLine = (it: any, key: number, originalIdx: number) => {
                const name = it.omschrijving || it.desc || it.naam || it.name || 'Regel zonder omschrijving';
                const cost = hasItemLevelCosts ? (costBreakdown.itemCosts.get(originalIdx) ?? null) : null;
                return (
                  <QLine
                    key={key}
                    qty={Number(it.qty) || 0}
                    name={name}
                    sub={it.sub || undefined}
                    unit_price={Number(it.prijs) || 0}
                    cost={cost}
                  />
                );
              };
              if (grouped.length <= 1) {
                return (
                  <div className="qline-group">
                    <div className="qline-group-head">
                      <div className="icon"><Flame size={15} /></div>
                      <div>
                        <div className="title">Regels</div>
                        <div className="count">{items.length} regel{items.length === 1 ? '' : 's'}</div>
                      </div>
                      <div className="sum">{fmtEur(items.reduce((s, it: any) => s + (Number(it.qty) || 0) * (Number(it.prijs) || 0), 0))}</div>
                    </div>
                    {items.map((it, i) => renderLine(it, i, i))}
                  </div>
                );
              }
              return grouped.map((g, gi) => {
                const Ic = g.Ic;
                const sum = g.items.reduce((s: number, it: any) => s + (Number(it.qty) || 0) * (Number(it.prijs) || 0), 0);
                return (
                  <div key={gi} className="qline-group">
                    <div className="qline-group-head">
                      <div className="icon"><Ic size={15} /></div>
                      <div>
                        <div className="title">{g.title}</div>
                        <div className="count">{g.items.length} regel{g.items.length === 1 ? '' : 's'}</div>
                      </div>
                      <div className="sum">{fmtEur(sum)}</div>
                    </div>
                    {g.items.map((it: any, i: number) => renderLine(it, i, items.indexOf(it)))}
                  </div>
                );
              });
            })()}

            {items.length === 0 && (
              <div className="metal" style={{ padding: 24, textAlign: 'center', color: 'var(--muted)' }}>
                Geen regels in deze offerte. <button className="btn btn-ghost btn-sm" style={{ marginLeft: 8 }} onClick={() => router.push(`/offertes?edit=${offerte.id}`)}><Plus size={14} />Regels toevoegen</button>
              </div>
            )}

            <div className="quote-footer">
              <div className="totals">
                <span className="sub">Subtotaal {fmtEur(totals.subtotaal)} · btw {fmtEur(totals.btw)}</span>
                <div className="big">{fmtEur(totals.totaal)} <span className="brand">incl.</span></div>
              </div>
              <div className="actions">
                <button className="btn btn-ghost"><Save size={14} />Opslaan</button>
                <button className="btn btn-primary"><Send size={14} />Verstuur</button>
              </div>
            </div>
          </div>

          <div className="quote-rail">
            {totals.margin != null ? (
              <InteractiveMarginDoctor value={totals.margin} total={totals.subtotaal} totalCost={totals.totalCost} />
            ) : (
              <InteractiveMarginDoctorEmpty total={totals.subtotaal} reason={costBreakdown.reason || 'Geen cost-data beschikbaar.'} />
            )}

            <div className="suggest-card">
              <div className="sc-head">
                <Sparkles size={14} color="var(--brand-gold)" />
                <span className="title">Pitmaster suggesties</span>
                <span className="count">auto</span>
              </div>
              {totals.margin == null ? (
                <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.55, padding: '4px 0' }}>
                  Suggesties verschijnen zodra er cost-data beschikbaar is. Voeg per regel een <code style={{ color: 'var(--brand-gold)' }}>cost</code>-bedrag toe of koppel een menu_selectie met ingredient-kosten.
                </div>
              ) : (() => {
                const m = totals.margin;
                const lineMargins = items.map((it: any, i: number) => {
                  const prijs = Number(it.prijs) || 0;
                  const cost = costBreakdown.itemCosts.get(i) ?? null;
                  const marge = cost != null && prijs > 0 ? ((prijs - cost) / prijs) * 100 : null;
                  const name = it.omschrijving || it.desc || it.naam || it.name || `Regel ${i + 1}`;
                  return { name, marge, prijs, cost };
                });
                const weakLine = lineMargins.filter(l => l.marge != null && l.marge < 45).sort((a, b) => (a.marge || 0) - (b.marge || 0))[0];
                const guests = offerte.aantal_gasten || items[0]?.qty || 0;

                if (m > 65) {
                  return (
                    <div style={{ fontSize: 12, lineHeight: 1.55, padding: '4px 0' }}>
                      <div style={{ marginBottom: 8 }}>Marge <strong style={{ color: 'var(--green)' }}>{m.toFixed(1)}%</strong> zit ruim boven target. Ruimte voor:</div>
                      <ul style={{ paddingLeft: 18, margin: 0, color: 'var(--muted)' }}>
                        <li>Premium upsell (dessert, saus-pakket) voor extra omzet</li>
                        <li>Vroegboek-korting richting klant als onderhandel-ruimte</li>
                        <li>Hogere kwaliteit-inkoop (bv. dry-aged) zonder prijsimpact</li>
                      </ul>
                    </div>
                  );
                }
                if (m >= 55 && m <= 65) {
                  return (
                    <div style={{ fontSize: 12, lineHeight: 1.55, padding: '4px 0', color: 'var(--muted)' }}>
                      Marge <strong style={{ color: 'var(--brand-gold)' }}>{m.toFixed(1)}%</strong> zit op target.
                      {weakLine && <> Zwakste regel: <strong style={{ color: 'var(--text)' }}>{weakLine.name}</strong> op {(weakLine.marge as number).toFixed(0)}%. Overweeg prijs +€{((weakLine.prijs * 0.05) || 1).toFixed(2)} of alternatieve inkoop.</>}
                    </div>
                  );
                }
                if (m >= 45) {
                  const upliftPerGuest = guests > 0 ? ((totals.subtotaal - totals.totalCost) * 0.15 / guests) : 0;
                  return (
                    <div style={{ fontSize: 12, lineHeight: 1.55, padding: '4px 0' }}>
                      <div style={{ marginBottom: 8, color: 'var(--muted)' }}>Marge <strong style={{ color: 'var(--amber)' }}>{m.toFixed(1)}%</strong> ligt onder target. Concrete hefbomen:</div>
                      <ul style={{ paddingLeft: 18, margin: 0, color: 'var(--muted)' }}>
                        {weakLine && <li>Zwakste regel <strong style={{ color: 'var(--text)' }}>{weakLine.name}</strong> ({(weakLine.marge as number).toFixed(0)}%) — verhogen met €{Math.ceil(weakLine.prijs * 0.1)}</li>}
                        <li>Prijs p/p +€{Math.ceil(upliftPerGuest)} over {guests} gasten = +€{(upliftPerGuest * guests).toFixed(0)}</li>
                        <li>Schrap laagste-marge regel, maak optioneel</li>
                      </ul>
                    </div>
                  );
                }
                return (
                  <div style={{ fontSize: 12, lineHeight: 1.55, padding: '4px 0' }}>
                    <div style={{ marginBottom: 8, color: 'var(--red)' }}>⚠ Marge <strong>{m.toFixed(1)}%</strong> is kritisch laag. Prioriteer:</div>
                    <ul style={{ paddingLeft: 18, margin: 0, color: 'var(--muted)' }}>
                      <li>Controleer crew-uren — vaak de grootste kostenpost die wegvalt</li>
                      {weakLine && weakLine.cost != null && <li><strong style={{ color: 'var(--text)' }}>{weakLine.name}</strong> verliest geld (cost €{weakLine.cost.toFixed(2)} vs prijs €{weakLine.prijs.toFixed(2)})</li>}
                      <li>Minimaal {Math.ceil((60 - m))}% omzetverhoging nodig voor target (60%)</li>
                    </ul>
                  </div>
                );
              })()}
            </div>

            <div className="client-card">
              <div className="cc-row">
                <div className="cc-avatar">{(offerte.client_naam || '').split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()}</div>
                <div className="cc-meta">
                  <div className="n">{offerte.client_naam || 'Geen klant'}</div>
                  <div className="s">{klant?.email || klant?.telefoon || 'Geen contactgegevens'} · {clientStats.count} eerdere opdracht{clientStats.count === 1 ? '' : 'en'}</div>
                </div>
                <button className="icon-btn"><MessageCircle size={14} /></button>
              </div>
              <div className="cc-stats">
                <div><div className="k">Eerdere omzet</div><div className="v">{fmtEur0(clientStats.revenue)}</div></div>
                <div><div className="k">Deze offerte</div><div className="v" style={{ color: 'var(--brand-gold)' }}>{fmtEur0(totals.subtotaal)}</div></div>
              </div>
            </div>

            {previousQuotes.length > 0 && (
              <div className="metal">
                <div className="metal-head" style={{ padding: '12px 16px' }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>Eerdere offertes</span>
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>{previousQuotes.length}</span>
                </div>
                <div style={{ padding: 0 }}>
                  {previousQuotes.slice(0, 4).map(q => (
                    <div key={q.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderTop: '1px solid rgba(130,130,130,.08)', cursor: 'pointer' }} onClick={() => router.push(`/offertes/${q.id}/view`)}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12, fontWeight: 600 }}>{q.nummer}</div>
                        <div style={{ fontSize: 10.5, color: 'var(--muted)' }}>{q.datum} · {q.status}</div>
                      </div>
                      <ChevronRight size={13} color="var(--muted)" />
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
