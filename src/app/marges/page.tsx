/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';
import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useConfirm } from '@/components/ConfirmDialog';
import EmptyState from '@/components/EmptyState';
import PageHeader from '@/components/PageHeader';
import KeukenTabs from '@/components/KeukenTabs';
import PageSection from '@/components/PageSection';
import PageHint from '@/components/PageHint';
import { CheckSquare, CheckCheck, Trash2, Loader2, Search, ArrowRight, Sparkles, Plus, X, BarChart3, LayoutGrid, Wand2, UtensilsCrossed } from 'lucide-react';
import { RequireTier } from '@/components/PaywallPrompt';

import GerechtKaart, { GANGEN, type GerechtData, type GangConfig, getGang } from './GerechtKaart';
import GerechtDetailsModal from './GerechtDetailsModal';
import { MapStation, GangPickerModal } from './MapStation';
import { BCGMatrix, QuadrantCards, type DishAnalysis, calcDishFoodcost, countDishPopularity, median } from './BCGMatrix';

export default function MenuEngineering() {
  const showConfirm = useConfirm();
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [gerechten, setGerechten] = useState<GerechtData[]>([]);
  const [gangen, setGangen] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [gangFilter, setGangFilter] = useState('alle');
  const [view, setView] = useState('kaarten');

  // BCG Matrix data
  const [eventsData, setEventsData] = useState<any[]>([]);
  const [offertesData, setOffertesData] = useState<any[]>([]);
  const [inventoryData, setInventoryData] = useState<any[]>([]);
  const [fullGerechten, setFullGerechten] = useState<any[]>([]);

  const [mapData, setMapData] = useState<Record<string, GerechtData[]>>({});

  const [picking, setPicking] = useState<GerechtData | null>(null);

  const [viewingGerecht, setViewingGerecht] = useState<GerechtData | null>(null);

  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [selectLimit, setSelectLimit] = useState(20);

  const [toast, setToast] = useState<string | null>(null);
  /* AiMenuComposer is verplaatst naar /gerechten?view=menus zodat alle menu-
     samenstelling op één plek leeft. Deze pagina is nu alleen analyse + BCG. */
  const [bcgDrawerOpen, setBcgDrawerOpen] = useState(false);
  const [mapDrawerOpen, setMapDrawerOpen] = useState(false);

  function toggleSelect(id: number) {
    setSelectedIds(function (prev) {
      if (prev.includes(id)) return prev.filter(function (x) { return x !== id; });
      if (prev.length >= selectLimit) return prev;
      return prev.concat([id]);
    });
  }

  function selectVisible() {
    setSelectedIds(function (prev) {
      const next = prev.slice();
      for (let i = 0; i < filtered.length; i++) {
        if (next.length >= selectLimit) break;
        if (!next.includes(filtered[i].id)) next.push(filtered[i].id);
      }
      return next;
    });
  }

  function clearSelection() {
    setSelectedIds([]);
  }

  function deleteSelected() {
    if (selectedIds.length === 0) return;
    showConfirm('Let op: weet je zeker dat je ' + selectedIds.length + ' geselecteerde gerechten permanent wilt verwijderen?', async function () {
      setLoading(true);
      const { error } = await supabase.from('gerechten').delete().in('id', selectedIds);
      setLoading(false);

      if (!error) {
        setGerechten(function (prev) { return prev.filter(function (g) { return !selectedIds.includes(g.id); }); });
        clearSelection();
        showToast('✅ ' + selectedIds.length + ' gerechten verwijderd!');
      } else {
        showToast('❌ Fout bij verwijderen: ' + error.message);
      }
    });
  }

  useEffect(function () {
    if (!supabase) { setLoading(false); return; }
    Promise.all([
      supabase.from('gangen').select('*').order('volgorde'),
      supabase.from('gerechten').select('id,naam,gang_slug,beschrijving,tags,allergenen,kostprijs_pp,actief,ingredienten,bereidingswijze,verkoopprijs,marge_pct,pijnpunten,toppunten,foto_prompt').order('volgorde'),
      supabase.from('events').select('id,menu'),
      supabase.from('offertes').select('id,menu_selectie,basis_prijs_pp,aantal_gasten'),
      supabase.from('inventory').select('id,naam,unit,purchase_price,yield_factor'),
      supabase.from('gerechten').select('id,naam,gang_slug,ingredient_costs,kostprijs_pp'),
    ]).then(function (results: any[]) {
      const gangenData = results[0].data || [];
      const gerechtenData = results[1].data || [];

      setGangen(gangenData);

      const initMap: Record<string, GerechtData[]> = {};
      GANGEN.forEach(function (g) { initMap[g.slug] = []; });
      setMapData(initMap);

      setGerechten(gerechtenData);

      // BCG Matrix data
      setEventsData(results[2].data || []);
      setOffertesData(results[3].data || []);
      setInventoryData(results[4].data || []);
      setFullGerechten(results[5].data || []);

      setLoading(false);
    });
    return function () {
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    };
  }, []);

  const filtered = useMemo(function () {
    const q = search.toLowerCase();
    return gerechten.filter(function (g) {
      if (gangFilter !== 'alle' && g.gang_slug !== gangFilter) return false;
      if (q && !g.naam.toLowerCase().includes(q) && !(g.beschrijving || '').toLowerCase().includes(q)) return false;
      return true;
    });
  }, [gerechten, gangFilter, search]);

  const inMap = useMemo(function () {
    const ids = new Set<number>();
    Object.values(mapData).forEach(function (lijst) {
      lijst.forEach(function (g) { ids.add(g.id); });
    });
    return ids;
  }, [mapData]);

  const ongemapt = useMemo(function () {
    return filtered.filter(function (g) { return !inMap.has(g.id); });
  }, [filtered, inMap]);

  function openGangPicker(gerecht: GerechtData) {
    setPicking(gerecht);
  }

  function placeInMap(gerecht: GerechtData, gangSlug: string) {
    setPicking(null);
    setMapData(function (prev) {
      const next = Object.assign({}, prev);
      Object.keys(next).forEach(function (slug) {
        next[slug] = next[slug].filter(function (g) { return g.id !== gerecht.id; });
      });
      if (!next[gangSlug]) next[gangSlug] = [];
      next[gangSlug] = next[gangSlug].concat([gerecht]);
      return next;
    });
  }

  function removeFromMap(gerechthId: number) {
    setMapData(function (prev) {
      const next = Object.assign({}, prev);
      Object.keys(next).forEach(function (slug) {
        next[slug] = next[slug].filter(function (g) { return g.id !== gerechthId; });
      });
      return next;
    });
  }

  function aiAutoSort() {
    const keywordMap = [
      { slug: 'dessert', words: ['dessert', 'panna cotta', 'mousse', 'ijs', 'sorbet', 'cake', 'tart', 'brownie', 'cheesecake', 'macaron', 'mille-feuille', 'sticky rice', 'crème brûlée', 'tiramisu', 'parfait', 'gelato', 'pudding', 'waffle', 'stroopwafel'] },
      { slug: 'borrelhap', words: ['borrelhap', 'borrel', 'amuse', 'nootje', 'chip', 'dip', 'spread', 'toast', 'crostini', 'bruschetta', 'blini'] },
      { slug: 'bite', words: ['bite', 'bites', 'gyoza', 'tataki', 'tartaar', 'tartare', 'carpaccio', 'skewer', 'sate', 'saté', 'lolly', 'slider', 'wrap', 'roll', 'rollup', 'spring roll', 'dumpling', 'bao', 'taco', 'pintxo', 'croqueta', 'kroket', 'bitterbal', 'fingerfood', 'finger food', 'mini ', 'hapje'] },
      { slug: 'voorgerecht', words: ['salade', 'soep', 'ceviche', 'gazpacho', 'bisque', 'carpaccio', 'voorgerecht', 'starter', 'amuse', 'poke', 'bowl'] },
      { slug: 'vegetarisch', words: ['vegan', 'vegetarisch', 'veggie', 'tofu', 'tempeh', 'halloumi', 'portobello', 'paddenstoel', 'bloemkool', 'aubergine', 'courgette', 'groenten', 'biet', 'linze', 'kikkererwt', 'falafel', 'gnocchi'] },
      { slug: 'bijgerecht', words: ['frites', 'friet', 'coleslaw', 'slaw', 'saus', 'relish', 'chutney', 'bread', 'brood', 'brioche', 'rice', 'rijst', 'pasta', 'noodle', 'aardappel', 'puree', 'tzatziki', 'guacamole', 'salsa', 'hummus', 'aioli', 'mayo'] },
      { slug: 'hoofdgerecht', words: ['brisket', 'ribeye', 'entrecote', 'bavette', 'striploin', 'tomahawk', 'côte de boeuf', 'cote de boeuf', 't-bone', 'picanha', 'pulled pork', 'spare rib', 'spareribs', 'rack', 'lam', 'lamskotelet', 'kip', 'kipfilet', 'kipdij', 'zalm', 'tonijn', 'zeebaars', 'ossenhaas', 'wagyu', 'burger', 'karbonnade', 'varkenshaas', 'eend', 'parelhoen'] },
    ];

    const next: Record<string, GerechtData[]> = {};
    GANGEN.forEach(function (g) { next[g.slug] = []; });

    gerechten.forEach(function (g) {
      const tekst = ((g.naam || '') + ' ' + (g.beschrijving || '')).toLowerCase();
      let bestSlug: string | null = null;

      for (let ki = 0; ki < keywordMap.length; ki++) {
        const entry = keywordMap[ki];
        for (let wi = 0; wi < entry.words.length; wi++) {
          if (tekst.includes(entry.words[wi])) {
            bestSlug = entry.slug;
            break;
          }
        }
        if (bestSlug) break;
      }

      if (!bestSlug) {
        bestSlug = next.hasOwnProperty(g.gang_slug) ? g.gang_slug : 'anders';
      }

      if (!next[bestSlug]) next[bestSlug] = [];
      next[bestSlug].push(g);
    });

    setMapData(next);
    showToast('✨ AI heeft ' + gerechten.length + ' gerechten gesorteerd op gang');
  }

  async function publishGang(gang: GangConfig, gerechtenLijst: GerechtData[]) {
    if (!supabase || gerechtenLijst.length === 0) return;
    const ids = gerechtenLijst.map(function (g) { return g.id; });

    const { error } = await supabase.from('gerechten').update({ gang_slug: gang.slug, actief: true }).in('id', ids);
    if (error) {
      showToast('❌ Fout bij publiceren: ' + error.message);
      return;
    }
    setGerechten(function (prev) {
      return prev.map(function (g) {
        if (ids.includes(g.id)) return Object.assign({}, g, { gang_slug: gang.slug, actief: true });
        return g;
      });
    });
    showToast('✅ ' + gerechtenLijst.length + ' gerechten gepubliceerd als ' + gang.label);
  }

  function handleSaveDetails(id: number, updateData: any) {
    setGerechten(function (prev) {
      return prev.map(function (g) {
        if (g.id === id) return Object.assign({}, g, updateData);
        return g;
      });
    });
    setViewingGerecht(null);
    showToast('✅ Gerecht succcesvol gewijzigd!');
  }

  function handleDeleteDetails(id: number) {
    setGerechten(function (prev) { return prev.filter(function (g) { return g.id !== id; }); });
    setViewingGerecht(null);
    showToast('❌ Gerecht verwijderd!');
  }

  function showToast(msg: string) {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToast(msg);
    toastTimeoutRef.current = setTimeout(function () { setToast(null); toastTimeoutRef.current = null; }, 3500);
  }

  const alleMapGerechten = useMemo(function () {
    let count = 0;
    Object.values(mapData).forEach(function (l) { count += l.length; });
    return count;
  }, [mapData]);

  const stats = useMemo(function () {
    const metKostprijs = gerechten.filter(function (g) { return g.kostprijs_pp && g.kostprijs_pp > 0; });
    const gemMarge = metKostprijs.length > 0
      ? metKostprijs.reduce(function (s, g) { return s + (1 - (g.kostprijs_pp || 0) / 45); }, 0) / metKostprijs.length * 100
      : 0;
    return {
      totaal: gerechten.length,
      actief: gerechten.filter(function (g) { return g.actief; }).length,
      gemMarge: gemMarge.toFixed(0),
      metKostprijs: metKostprijs.length,
    };
  }, [gerechten]);

  const gangOptions = useMemo(function () {
    const slugs = Array.from(new Set(gerechten.map(function (g) { return g.gang_slug; }).filter(Boolean)));
    const result = GANGEN.filter(function (g) { return slugs.includes(g.slug); });
    return result;
  }, [gerechten]);

  // ── BCG Matrix analysis ──
  const bcgAnalysis = useMemo(function () {
    if (fullGerechten.length === 0) return { dishes: [] as DishAnalysis[], medianPop: 0, medianMargin: 0 };

    // Average selling price across offertes (for margin calc)
    const prices = offertesData.filter(function (o: any) { return o.basis_prijs_pp && o.basis_prijs_pp > 0; }).map(function (o: any) { return o.basis_prijs_pp; });
    const avgSellingPrice = prices.length > 0 ? prices.reduce(function (s: number, p: number) { return s + p; }, 0) / prices.length : 45;

    const dishes: DishAnalysis[] = [];
    fullGerechten.forEach(function (g: any) {
      const foodcost = calcDishFoodcost(g, inventoryData);
      // Also fall back to kostprijs_pp if ingredient_costs not set
      const effectiveCost = foodcost > 0 ? foodcost : (g.kostprijs_pp || 0);
      if (effectiveCost <= 0) return; // skip dishes with no cost data

      const pop = countDishPopularity(g.naam, g.id, eventsData, offertesData);
      const marge = avgSellingPrice > 0 ? ((avgSellingPrice - effectiveCost) / avgSellingPrice) * 100 : 0;
      const revenue = pop * avgSellingPrice;

      dishes.push({
        id: g.id,
        naam: g.naam,
        gang_slug: g.gang_slug || 'anders',
        popularity: pop,
        foodcostPP: effectiveCost,
        margePct: Math.max(0, marge),
        revenue: revenue,
        quadrant: 'dog', // placeholder, set below
      });
    });

    if (dishes.length === 0) return { dishes: [], medianPop: 0, medianMargin: 0 };

    const medPop = median(dishes.map(function (d) { return d.popularity; }));
    const medMargin = median(dishes.map(function (d) { return d.margePct; }));

    // Classify into quadrants
    dishes.forEach(function (d) {
      const highPop = d.popularity >= medPop;
      const highMargin = d.margePct >= medMargin;
      if (highPop && highMargin) d.quadrant = 'star';
      else if (!highPop && highMargin) d.quadrant = 'puzzle';
      else if (highPop && !highMargin) d.quadrant = 'plowhorse';
      else d.quadrant = 'dog';
    });

    return { dishes, medianPop: medPop, medianMargin: medMargin };
  }, [fullGerechten, eventsData, offertesData, inventoryData]);

  // BCG summary stats
  const bcgStats = useMemo(function () {
    const d = bcgAnalysis.dishes;
    if (d.length === 0) return null;
    return {
      totaal: d.length,
      stars: d.filter(function (x) { return x.quadrant === 'star'; }).length,
      puzzles: d.filter(function (x) { return x.quadrant === 'puzzle'; }).length,
      plowhorses: d.filter(function (x) { return x.quadrant === 'plowhorse'; }).length,
      dogs: d.filter(function (x) { return x.quadrant === 'dog'; }).length,
      avgMargin: d.reduce(function (s, x) { return s + x.margePct; }, 0) / d.length,
    };
  }, [bcgAnalysis]);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: 'rgba(255,255,255,.4)', fontSize: 14 }}>
        <Loader2 size={16} className="animate-spin" style={{ marginRight: 8 }} /> Menu laden...
      </div>
    );
  }

  const GOLD = '#c4a35a';
  return (
    <RequireTier feature="menu_engineering">
    <div className="mobile-safe-bottom" style={{ paddingBottom: 40 }}>

      {toast && (
        <div style={{
          position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)',
          background: '#1a1a1a', border: '1px solid var(--border)', borderRadius: 10,
          padding: '10px 20px', fontSize: 13, fontWeight: 600, zIndex: 999,
          boxShadow: '0 8px 24px rgba(0,0,0,.5)', whiteSpace: 'nowrap'
        }}>
          {toast}
        </div>
      )}

      <KeukenTabs />

      {/* Header — eén primaire CTA: nieuw gerecht. Menu samenstellen verhuist
          naar inline-callout (subtiele deeplink) i.p.v. concurrerende goud-knop. */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontFamily: 'Outfit, sans-serif', fontSize: 32, fontWeight: 300, color: 'var(--text)', margin: 0, letterSpacing: '-0.01em' }}>Marges &amp; analyse</h1>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4, marginBottom: 0 }}>{stats.totaal} gerechten geanalyseerd op marge en populariteit</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <a href="/gerechten?view=menus"
            style={{ padding: '10px 16px', borderRadius: 10, border: '1px solid var(--card-solid)', background: 'var(--card)', color: 'var(--text)', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none' }}>
            <UtensilsCrossed size={14} /> Stel menu samen
          </a>
          <a href="/gerechten"
            style={{ padding: '10px 18px', borderRadius: 10, background: GOLD, color: 'var(--brand-background)', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none', border: 'none' }}>
            <Plus size={14} /> Nieuw gerecht
          </a>
        </div>
      </div>

      {gerechten.length === 0 && <EmptyState page="/marges" />}

      {/* STATS — responsive: 4 kolom desktop, 2 kolom mobile */}
      <div className="me-stats-grid">
        {[
          { label: 'Totaal gerechten', value: stats.totaal, sub: `${stats.actief} actief` },
          { label: 'Met kostprijs', value: stats.metKostprijs, sub: 'berekend' },
          { label: 'Gem. marge', value: stats.gemMarge + '%', sub: 'op €45 menu' },
          { label: 'BCG-analyse', value: bcgStats?.stars || 0, sub: `${bcgStats?.stars || 0} stars · ${bcgStats?.dogs || 0} dogs` },
        ].map(function (s) {
          return (
            <div key={s.label} style={{ padding: 14, borderRadius: 10, background: 'var(--card)', border: '1px solid var(--card-solid)' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 4 }}>{s.label}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{s.value}</div>
              <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>{s.sub}</div>
            </div>
          );
        })}
      </div>

      {/* TOOLBAR */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1 1 240px', minWidth: 200 }}>
          <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Zoek gerechten..."
            style={{ width: '100%', padding: '10px 14px 10px 36px', borderRadius: 10, border: '1px solid var(--card-solid)', background: 'var(--card)', color: 'var(--text)', fontSize: 13, outline: 'none' }}
          />
        </div>
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          <button onClick={() => setGangFilter('alle')} style={{ padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', border: gangFilter === 'alle' ? '1px solid #fff' : '1px solid var(--card-solid)', background: gangFilter === 'alle' ? '#fff' : 'var(--card)', color: gangFilter === 'alle' ? 'var(--brand-background)' : 'var(--text)' }}>
            Alle
          </button>
          {GANGEN.map(function (g) {
            const active = gangFilter === g.slug;
            return (
              <button key={g.slug} onClick={() => setGangFilter(active ? 'alle' : g.slug)} style={{ padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', border: active ? '1px solid #fff' : '1px solid var(--card-solid)', background: active ? '#fff' : 'var(--card)', color: active ? 'var(--brand-background)' : 'var(--text)' }}>
                {g.icon} {g.label}
              </button>
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => setBcgDrawerOpen(true)} style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid var(--card-solid)', background: 'var(--card)', color: 'var(--text)', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <BarChart3 size={14} /> Winnaars & Verliezers
          </button>
          <button onClick={() => setMapDrawerOpen(true)} style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid var(--card-solid)', background: 'var(--card)', color: 'var(--text)', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <LayoutGrid size={14} /> Menukaart indelen
          </button>
          <button
            onClick={() => { setSelectionMode(!selectionMode); if (selectionMode) setSelectedIds([]); }}
            style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid var(--card-solid)', background: selectionMode ? '#fff' : 'var(--card)', color: selectionMode ? 'var(--brand-background)' : 'var(--text)', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {selectionMode ? <CheckCheck size={14} /> : <CheckSquare size={14} />}
            Selecteer
          </button>
        </div>
      </div>

      {/* Selection bar */}
      {selectionMode && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14, padding: 12, borderRadius: 10, border: '1px solid var(--card-solid)', background: 'var(--color-bg-deep)', alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.1em' }}>Selectie · {selectedIds.length} geselecteerd</span>
          <button onClick={selectVisible} style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid var(--card-solid)', background: 'var(--card)', color: 'var(--text)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Selecteer zichtbare</button>
          <button onClick={clearSelection} style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid var(--card-solid)', background: 'var(--card)', color: 'var(--text)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Deselecteer</button>
          {selectedIds.length > 0 && (
            <button onClick={deleteSelected} style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid rgba(239,68,68,.3)', background: 'rgba(239,68,68,.1)', color: 'var(--red)', fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <Trash2 size={12} /> Verwijder ({selectedIds.length})
            </button>
          )}
        </div>
      )}

      {/* GRID */}
      <div>
        <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 12 }}>{filtered.length} gerechten</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
          {filtered.map(function (g) {
            return (
              <GerechtKaart
                key={g.id}
                gerecht={g}
                geselecteerd={inMap.has(g.id)}
                onMoveToMap={openGangPicker}
                onViewDetails={setViewingGerecht}
                selectionMode={selectionMode}
                isSelected={(id: number) => selectedIds.includes(id)}
                onToggleSelect={toggleSelect}
              />
            );
          })}
        </div>
        {filtered.length === 0 && gerechten.length > 0 && (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>Geen gerechten gevonden — pas je filters aan.</div>
        )}
      </div>

      {/* BCG DRAWER */}
      {bcgDrawerOpen && (
        <BCGDrawer
          onClose={() => setBcgDrawerOpen(false)}
          bcgAnalysis={bcgAnalysis}
          bcgStats={bcgStats}
        />
      )}

      {/* MAP STATION DRAWER */}
      {mapDrawerOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 999, overflow: 'auto', padding: 24 }} onClick={() => setMapDrawerOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} style={{ maxWidth: 1300, margin: '0 auto', background: 'var(--bg)', borderRadius: 16, padding: 24, border: '1px solid var(--card-solid)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <h2 style={{ fontFamily: 'Outfit, sans-serif', fontSize: 22, fontWeight: 400, color: 'var(--text)', margin: 0 }}>Menukaart indelen</h2>
                <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0, marginTop: 2 }}>{alleMapGerechten} gerechten ingedeeld · {gerechten.length - alleMapGerechten} in pool</p>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={aiAutoSort} style={{ padding: '8px 14px', borderRadius: 8, background: GOLD, color: 'var(--brand-background)', border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Sparkles size={13} /> AI auto-sort
                </button>
                <button onClick={() => { const m: Record<string, GerechtData[]> = {}; GANGEN.forEach(g => { m[g.slug] = []; }); setMapData(m); }} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--card-solid)', background: 'var(--card)', color: 'var(--text)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Reset</button>
                <button onClick={() => setMapDrawerOpen(false)} style={{ background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: 6 }}><X size={18} /></button>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 10 }}>Pool · {ongemapt.length}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 600, overflowY: 'auto', paddingRight: 4 }}>
                  {ongemapt.map(function (g) {
                    const gang = getGang(g.gang_slug);
                    return (
                      <div key={g.id} draggable onDragStart={(e) => e.dataTransfer.setData('gerecht_id', String(g.id))}
                        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'var(--card)', border: '1px solid var(--card-solid)', borderRadius: 8, cursor: 'grab' }}
                        onClick={() => openGangPicker(g)}>
                        <span style={{ fontSize: 14 }}>{gang.icon}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.naam}</div>
                          <div style={{ fontSize: 10, color: 'var(--muted)' }}>{gang.label}</div>
                        </div>
                        <ArrowRight size={12} style={{ color: 'var(--muted)' }} />
                      </div>
                    );
                  })}
                  {ongemapt.length === 0 && <div style={{ textAlign: 'center', padding: 24, fontSize: 11, color: 'var(--muted)', border: '1px dashed var(--card-solid)', borderRadius: 8 }}>Alles ingedeeld</div>}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {GANGEN.map(function (gang) {
                  const lijst = mapData[gang.slug] || [];
                  return (
                    <MapStation key={gang.slug} gang={gang} gerechten={lijst} onRemove={removeFromMap} onPublish={publishGang} onDrop={(gerechthId: string) => {
                      const g = gerechten.find(x => String(x.id) === String(gerechthId));
                      if (g) placeInMap(g, gang.slug);
                    }} />
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      <GangPickerModal gerecht={picking} onPick={placeInMap} onClose={() => setPicking(null)} />
      {/* Conditioneel renderen + key zorgt voor cleane mount/unmount per gerecht.
          Voorheen rendered het component altijd (ook met gerecht=null), wat gaf
          dat hooks bij eerste mount andere init-volgorde hadden dan na update — Rules of Hooks violation. */}
      {viewingGerecht && (
        <GerechtDetailsModal
          key={viewingGerecht.id}
          gerecht={viewingGerecht}
          onSave={handleSaveDetails}
          onDelete={handleDeleteDetails}
          onClose={() => setViewingGerecht(null)}
          onError={(msg: string) => showToast('❌ ' + msg)}
          supabase={supabase}
        />
      )}
    </div>
    </RequireTier>
  );
}

/* AiMenuComposer + MenuPreviewDrawer verplaatst — alle menu-samenstelling
   leeft nu op /gerechten?view=menus zodat er één plek is. Deze pagina is
   voortaan zuiver analyse: BCG, foodcost, marges. */


/* ═══════════════════════════════════════════════════════════════════
   BCG DRAWER
   ═══════════════════════════════════════════════════════════════════ */

function BCGDrawer({ onClose, bcgAnalysis, bcgStats }: { onClose: () => void; bcgAnalysis: any; bcgStats: any }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 999, overflow: 'auto', padding: 24 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ maxWidth: 1200, margin: '0 auto', background: 'var(--bg)', borderRadius: 16, padding: 24, border: '1px solid var(--card-solid)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <h2 style={{ fontFamily: 'Outfit, sans-serif', fontSize: 22, fontWeight: 400, color: 'var(--text)', margin: 0 }}>Winnaars & Verliezers</h2>
            <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0, marginTop: 2 }}>Gerechten geclassificeerd op populariteit en marge</p>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: 6 }}><X size={18} /></button>
        </div>

        {bcgStats && (
          <div className="responsive-grid-2" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginBottom: 20 }}>
            {[
              { label: 'Geanalyseerd', value: bcgStats.totaal, color: 'var(--text)' },
              { label: '⭐ Stars', value: bcgStats.stars, color: '#4ade80' },
              { label: '🧩 Puzzles', value: bcgStats.puzzles, color: '#60a5fa' },
              { label: '🐴 Plowhorses', value: bcgStats.plowhorses, color: '#fbbf24' },
              { label: '🐕 Dogs', value: bcgStats.dogs, color: '#f87171' },
            ].map((s) => (
              <div key={s.label} style={{ padding: 12, borderRadius: 10, background: 'var(--card)', border: '1px solid var(--card-solid)' }}>
                <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.1em', fontWeight: 700, marginBottom: 4 }}>{s.label}</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: s.color, fontVariantNumeric: 'tabular-nums' }}>{s.value}</div>
              </div>
            ))}
          </div>
        )}

        <BCGMatrix dishes={bcgAnalysis.dishes} medianPop={bcgAnalysis.medianPop} medianMargin={bcgAnalysis.medianMargin} />
        <QuadrantCards dishes={bcgAnalysis.dishes} />
      </div>
    </div>
  );
}
