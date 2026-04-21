/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';
import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useConfirm } from '@/components/ConfirmDialog';
import EmptyState from '@/components/EmptyState';
import PageHeader from '@/components/PageHeader';
import PageSection from '@/components/PageSection';
import PageHint from '@/components/PageHint';
import { CheckSquare, CheckCheck, Trash2, Loader2, Search, ArrowRight, Sparkles, Plus, X, BarChart3, LayoutGrid, Wand2, ChefHat, Users, Euro, Save, ShoppingCart, AlertTriangle, Check } from 'lucide-react';

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
  const [aiMenuOpen, setAiMenuOpen] = useState(false);
  const [bcgDrawerOpen, setBcgDrawerOpen] = useState(false);
  const [mapDrawerOpen, setMapDrawerOpen] = useState(false);
  const [composedMenu, setComposedMenu] = useState<any | null>(null);

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
      supabase.from('gerechten').select('id,naam,gang_slug,beschrijving,tags,allergenen,kostprijs_pp,actief,ingredienten,bereidingswijze').order('volgorde'),
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
    <div style={{ paddingBottom: 40 }}>

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

      {/* HEADER */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.2em', fontWeight: 700, marginBottom: 6 }}>De keuken</div>
          <h1 style={{ fontFamily: 'Outfit, sans-serif', fontSize: 32, fontWeight: 300, color: '#fff', margin: 0, letterSpacing: '-0.01em' }}>Menu Engineering</h1>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4, marginBottom: 0 }}>{stats.totaal} gerechten · AI componeert menu&apos;s in jouw stijl</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <a href="/gerechten"
            style={{ padding: '10px 16px', borderRadius: 10, border: '1px solid var(--card-solid)', background: 'var(--card)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none' }}>
            <Plus size={14} /> Nieuw gerecht
          </a>
          <button onClick={() => setAiMenuOpen(true)}
            style={{ padding: '10px 18px', borderRadius: 10, background: '#fff', color: '#000', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, border: 'none' }}>
            <Sparkles size={14} /> AI Menu Componeren
          </button>
        </div>
      </div>

      {/* HERO BANNER */}
      <div style={{ padding: 20, borderRadius: 16, background: 'linear-gradient(135deg, rgba(196,163,90,.12), rgba(255,255,255,.02))', border: '1px solid rgba(196,163,90,.25)', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
        <div style={{ width: 48, height: 48, borderRadius: 12, background: 'rgba(196,163,90,.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Wand2 size={22} style={{ color: GOLD }} />
        </div>
        <div style={{ flex: 1, minWidth: 240 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', marginBottom: 2 }}>Compleet menu met één vraag</div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>Vul gasten + thema + dieet in — Claude maakt een volledig menu met gangen, inkooplijst, kostprijs en adviesprijs. Jouw bestaande gerechten als stijl-basis.</div>
        </div>
        <button onClick={() => setAiMenuOpen(true)} style={{ padding: '8px 14px', borderRadius: 8, background: GOLD, color: '#000', border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Sparkles size={13} /> Componeer menu
        </button>
      </div>

      {gerechten.length === 0 && <EmptyState page="/menu-engineering" />}

      {/* STATS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 }}>
        {[
          { label: 'Totaal gerechten', value: stats.totaal, sub: `${stats.actief} actief` },
          { label: 'Met kostprijs', value: stats.metKostprijs, sub: 'berekend' },
          { label: 'Gem. marge', value: stats.gemMarge + '%', sub: 'op €45 menu' },
          { label: 'BCG-analyse', value: bcgStats?.stars || 0, sub: `${bcgStats?.stars || 0} stars · ${bcgStats?.dogs || 0} dogs` },
        ].map(function (s) {
          return (
            <div key={s.label} style={{ padding: 14, borderRadius: 10, background: 'var(--card)', border: '1px solid var(--card-solid)' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 4 }}>{s.label}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#fff', fontVariantNumeric: 'tabular-nums' }}>{s.value}</div>
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
            style={{ width: '100%', padding: '10px 14px 10px 36px', borderRadius: 10, border: '1px solid var(--card-solid)', background: 'var(--card)', color: '#fff', fontSize: 13, outline: 'none' }}
          />
        </div>
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          <button onClick={() => setGangFilter('alle')} style={{ padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', border: gangFilter === 'alle' ? '1px solid #fff' : '1px solid var(--card-solid)', background: gangFilter === 'alle' ? '#fff' : 'var(--card)', color: gangFilter === 'alle' ? '#000' : '#fff' }}>
            Alle
          </button>
          {GANGEN.map(function (g) {
            const active = gangFilter === g.slug;
            return (
              <button key={g.slug} onClick={() => setGangFilter(active ? 'alle' : g.slug)} style={{ padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', border: active ? '1px solid #fff' : '1px solid var(--card-solid)', background: active ? '#fff' : 'var(--card)', color: active ? '#000' : '#fff' }}>
                {g.icon} {g.label}
              </button>
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => setBcgDrawerOpen(true)} style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid var(--card-solid)', background: 'var(--card)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <BarChart3 size={14} /> Winnaars & Verliezers
          </button>
          <button onClick={() => setMapDrawerOpen(true)} style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid var(--card-solid)', background: 'var(--card)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <LayoutGrid size={14} /> Menukaart indelen
          </button>
          <button
            onClick={() => { setSelectionMode(!selectionMode); if (selectionMode) setSelectedIds([]); }}
            style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid var(--card-solid)', background: selectionMode ? '#fff' : 'var(--card)', color: selectionMode ? '#000' : '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {selectionMode ? <CheckCheck size={14} /> : <CheckSquare size={14} />}
            Selecteer
          </button>
        </div>
      </div>

      {/* Selection bar */}
      {selectionMode && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14, padding: 12, borderRadius: 10, border: '1px solid var(--card-solid)', background: 'var(--color-bg-deep)', alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.1em' }}>Selectie · {selectedIds.length} geselecteerd</span>
          <button onClick={selectVisible} style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid var(--card-solid)', background: 'var(--card)', color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Selecteer zichtbare</button>
          <button onClick={clearSelection} style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid var(--card-solid)', background: 'var(--card)', color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Deselecteer</button>
          {selectedIds.length > 0 && (
            <button onClick={deleteSelected} style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid rgba(239,68,68,.3)', background: 'rgba(239,68,68,.1)', color: '#fca5a5', fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
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

      {/* AI MENU COMPOSE MODAL */}
      {aiMenuOpen && (
        <AiMenuComposer
          onClose={() => setAiMenuOpen(false)}
          existingGerechten={gerechten}
          onComposed={(menu) => { setComposedMenu(menu); setAiMenuOpen(false); }}
        />
      )}

      {/* MENU PREVIEW DRAWER */}
      {composedMenu && (
        <MenuPreviewDrawer
          menu={composedMenu}
          onClose={() => setComposedMenu(null)}
          onSaveAsDishes={async (dishes) => {
            if (!supabase) return;
            const rows = dishes.map(d => ({
              naam: d.naam,
              gang_slug: (d.gang || 'hoofdgerecht').toLowerCase(),
              beschrijving: d.beschrijving,
              tags: d.tags,
              allergenen: d.allergenen,
              kostprijs_pp: d.geschatte_kostprijs_pp,
              ingredienten: d.ingredienten,
              bereidingswijze: Array.isArray(d.instructies) ? d.instructies.join('\n') : d.instructies,
              actief: true,
            }));
            const { error } = await supabase.from('gerechten').insert(rows);
            if (error) { showToast('❌ ' + error.message); return; }
            showToast(`✅ ${rows.length} gerechten toegevoegd`);
            // refetch
            const { data } = await supabase.from('gerechten').select('id,naam,gang_slug,beschrijving,tags,allergenen,kostprijs_pp,actief,ingredienten,bereidingswijze').order('volgorde');
            setGerechten(data || []);
            setComposedMenu(null);
          }}
        />
      )}

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
                <h2 style={{ fontFamily: 'Outfit, sans-serif', fontSize: 22, fontWeight: 400, color: '#fff', margin: 0 }}>Menukaart indelen</h2>
                <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0, marginTop: 2 }}>{alleMapGerechten} gerechten ingedeeld · {gerechten.length - alleMapGerechten} in pool</p>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={aiAutoSort} style={{ padding: '8px 14px', borderRadius: 8, background: GOLD, color: '#000', border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Sparkles size={13} /> AI auto-sort
                </button>
                <button onClick={() => { const m: Record<string, GerechtData[]> = {}; GANGEN.forEach(g => { m[g.slug] = []; }); setMapData(m); }} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--card-solid)', background: 'var(--card)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Reset</button>
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
                          <div style={{ fontSize: 12, fontWeight: 600, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.naam}</div>
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
      <GerechtDetailsModal
        gerecht={viewingGerecht}
        onSave={handleSaveDetails}
        onDelete={handleDeleteDetails}
        onClose={() => setViewingGerecht(null)}
        onError={(msg: string) => showToast('❌ ' + msg)}
        supabase={supabase}
      />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   AI MENU COMPOSER MODAL
   ═══════════════════════════════════════════════════════════════════ */

function AiMenuComposer({ onClose, existingGerechten, onComposed }: {
  onClose: () => void;
  existingGerechten: any[];
  onComposed: (menu: any) => void;
}) {
  const [prompt, setPrompt] = useState('');
  const [gasten, setGasten] = useState(20);
  const [gangen, setGangen] = useState('3');
  const [status, setStatus] = useState<'idle' | 'generating' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  const EXAMPLES = [
    'Zomers BBQ-menu voor familie, lichtgekruid',
    'Stoer BBQ-menu met flinke vleesgangen, borrelstijl',
    'Vega/vegan menu met BBQ-twist',
    'Aziatisch geïnspireerd BBQ-menu',
    'Klassiek Nederlands menu voor bruiloft',
  ];

  async function compose() {
    if (!prompt.trim()) return;
    setStatus('generating');
    setError(null);
    try {
      const existing = (existingGerechten || []).map((g: any) => ({
        naam: g.naam,
        gang: g.gang_slug,
        categorie: g.gang_slug,
        tags: g.tags,
      }));
      const res = await fetch('/api/recipe-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          mode: 'menu',
          existing,
          options: { gasten, gangen },
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error || 'AI fout');
        setStatus('error');
        return;
      }
      onComposed(body.data);
    } catch (e: any) {
      setError(e.message || 'Onbekende fout');
      setStatus('error');
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', paddingTop: 60 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 'min(720px, 92vw)', maxHeight: '82vh', background: 'var(--bg)', border: '1px solid var(--card-solid)', borderRadius: 16, overflow: 'auto' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--card-solid)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Sparkles size={16} style={{ color: '#c4a35a' }} />
              <h2 style={{ fontFamily: 'Outfit, sans-serif', fontSize: 20, fontWeight: 400, color: '#fff', margin: 0 }}>AI Menu componeren</h2>
            </div>
            <p style={{ fontSize: 11, color: 'var(--muted)', margin: 0, marginTop: 2 }}>Claude Sonnet 4.6 · gebruikt jouw {existingGerechten.length} gerechten als stijl-basis</p>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: 6 }}><X size={18} /></button>
        </div>

        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 8, display: 'block' }}>Wat voor menu wil je?</label>
            <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3}
              placeholder="bijv. zomers BBQ-menu voor 30 gasten, lichtgekruid, 1 vega hoofdgang"
              style={{ width: '100%', padding: 12, borderRadius: 10, border: '1px solid var(--card-solid)', background: 'var(--color-bg-deep)', color: '#fff', fontSize: 13, fontFamily: 'inherit', resize: 'vertical', outline: 'none' }} />
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {EXAMPLES.map((ex) => (
              <button key={ex} onClick={() => setPrompt(ex)}
                style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--card-solid)', background: 'var(--card)', color: 'var(--muted)', fontSize: 11, cursor: 'pointer' }}>
                {ex}
              </button>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 6, display: 'block' }}>Aantal gasten</label>
              <input type="number" min={1} max={500} value={gasten} onChange={(e) => setGasten(parseInt(e.target.value) || 20)}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--card-solid)', background: 'var(--color-bg-deep)', color: '#fff', fontSize: 13, outline: 'none' }} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 6, display: 'block' }}>Aantal gangen</label>
              <select value={gangen} onChange={(e) => setGangen(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--card-solid)', background: 'var(--color-bg-deep)', color: '#fff', fontSize: 13, outline: 'none' }}>
                <option value="2">2 (hoofd + dessert)</option>
                <option value="3">3 (voorgerecht + hoofd + dessert)</option>
                <option value="4">4 (voor + hoofd + bijgerecht + dessert)</option>
                <option value="5">5 (amuse + voor + hoofd + kaas + dessert)</option>
              </select>
            </div>
          </div>

          {status === 'error' && error && (
            <div style={{ padding: 12, borderRadius: 8, background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.3)', fontSize: 12, color: '#fca5a5', display: 'flex', gap: 8 }}>
              <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>{error}</span>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button onClick={onClose} style={{ padding: '10px 16px', borderRadius: 10, border: '1px solid var(--card-solid)', background: 'var(--card)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Annuleren</button>
            <button onClick={compose} disabled={!prompt.trim() || status === 'generating'}
              style={{ flex: 1, padding: '10px 16px', borderRadius: 10, background: prompt.trim() && status !== 'generating' ? '#fff' : 'rgba(255,255,255,.3)', color: '#000', fontSize: 12, fontWeight: 700, cursor: prompt.trim() && status !== 'generating' ? 'pointer' : 'not-allowed', border: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              {status === 'generating' ? <><Loader2 size={14} className="spin" /> Claude componeert... (kan 30-60s duren)</> : <><Sparkles size={14} /> Componeer menu</>}
            </button>
          </div>
          <style>{`.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   MENU PREVIEW DRAWER
   ═══════════════════════════════════════════════════════════════════ */

function MenuPreviewDrawer({ menu, onClose, onSaveAsDishes }: {
  menu: any;
  onClose: () => void;
  onSaveAsDishes: (dishes: any[]) => void | Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const gerechten = menu.gerechten || [];
  const inkooplijst = menu.samengevatte_inkooplijst || [];

  // Groepeer per gang
  const byGang = gerechten.reduce((acc: Record<string, any[]>, g: any) => {
    const key = g.gang || g.categorie || 'Anders';
    if (!acc[key]) acc[key] = [];
    acc[key].push(g);
    return acc;
  }, {});

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 1001, display: 'flex', justifyContent: 'flex-end' }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 'min(780px, 100vw)', background: 'var(--bg)', borderLeft: '1px solid var(--card-solid)', overflow: 'auto' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--card-solid)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'sticky', top: 0, background: 'var(--bg)', zIndex: 2 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.15em', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Sparkles size={12} style={{ color: '#c4a35a' }} /> AI Menu
            </div>
            <h2 style={{ fontFamily: 'Outfit, sans-serif', fontSize: 24, fontWeight: 600, color: '#fff', margin: 0 }}>{menu.menu_naam || 'Nieuw menu'}</h2>
            {menu.thema && <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0, marginTop: 4 }}>{menu.thema}</p>}
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: 6 }}><X size={18} /></button>
        </div>

        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* STATS */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
            <PreviewStat icon={Users} label="Gasten" value={`${menu.aantal_gasten || 20}`} />
            <PreviewStat icon={ChefHat} label="Gerechten" value={`${gerechten.length}`} />
            <PreviewStat icon={Euro} label="Kost/p" value={menu.totale_kostprijs_pp ? `€${Number(menu.totale_kostprijs_pp).toFixed(2)}` : '—'} />
            <PreviewStat icon={Euro} label="Advies/p" value={menu.adviesprijs_pp ? `€${Number(menu.adviesprijs_pp).toFixed(2)}` : '—'} highlight />
          </div>

          {/* GERECHTEN PER GANG */}
          {Object.entries(byGang).map(([gang, list]) => {
            const items = list as any[];
            return (
              <div key={gang}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.15em', marginBottom: 8 }}>{gang} · {items.length}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {items.map((g: any, i: number) => (
                    <div key={i} style={{ padding: 14, borderRadius: 10, border: '1px solid var(--card-solid)', background: 'var(--card)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{g.naam}</div>
                          {g.beschrijving && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{g.beschrijving}</div>}
                        </div>
                        {g.geschatte_kostprijs_pp && (
                          <span style={{ fontSize: 12, fontWeight: 700, color: '#c4a35a', fontVariantNumeric: 'tabular-nums' }}>€{Number(g.geschatte_kostprijs_pp).toFixed(2)}</span>
                        )}
                      </div>
                      {g.tags && g.tags.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                          {g.tags.slice(0, 4).map((t: string) => (
                            <span key={t} style={{ padding: '2px 6px', borderRadius: 3, background: 'rgba(196,163,90,.12)', color: '#c4a35a', fontSize: 9, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase' }}>{t}</span>
                          ))}
                        </div>
                      )}
                      {g.ingredienten && g.ingredienten.length > 0 && (
                        <div style={{ marginTop: 8, fontSize: 11, color: 'var(--muted)' }}>
                          <strong style={{ color: '#fff' }}>Ingr:</strong> {g.ingredienten.slice(0, 6).map((i: any) => `${i.hoeveelheid}${i.eenheid} ${i.naam}`).join(', ')}{g.ingredienten.length > 6 ? '...' : ''}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          {/* INKOOPLIJST */}
          {inkooplijst.length > 0 && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.15em', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <ShoppingCart size={12} /> Samengevatte inkooplijst · {inkooplijst.length} items
              </div>
              <div style={{ padding: 12, borderRadius: 10, background: 'var(--color-bg-deep)', border: '1px solid var(--card-solid)' }}>
                {inkooplijst.map((item: any, i: number) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto', gap: 10, padding: '6px 0', fontSize: 12, color: '#fff', borderBottom: i < inkooplijst.length - 1 ? '1px solid var(--card-solid)' : 'none', alignItems: 'center' }}>
                    <span>{item.product}</span>
                    <span style={{ color: 'var(--muted)', fontSize: 10, textTransform: 'uppercase' }}>{item.categorie}</span>
                    <span style={{ color: '#fff', fontWeight: 700, fontVariantNumeric: 'tabular-nums', minWidth: 48, textAlign: 'right' }}>{item.totale_hoeveelheid}</span>
                    <span style={{ color: '#c4a35a', fontWeight: 700, fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', minWidth: 36, textAlign: 'left' }}>{item.eenheid}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ACTIES */}
          <div style={{ display: 'flex', gap: 8, position: 'sticky', bottom: 0, background: 'var(--bg)', paddingTop: 12 }}>
            <button onClick={onClose} style={{ padding: '10px 16px', borderRadius: 10, border: '1px solid var(--card-solid)', background: 'var(--card)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Sluiten</button>
            <button onClick={async () => { setSaving(true); await onSaveAsDishes(gerechten); setSaving(false); }} disabled={saving || gerechten.length === 0}
              style={{ flex: 1, padding: '10px 16px', borderRadius: 10, background: '#c4a35a', color: '#000', border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              {saving ? <><Loader2 size={14} className="spin" /> Opslaan...</> : <><Save size={14} /> Voeg alle {gerechten.length} gerechten toe</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function PreviewStat({ icon: Icon, label, value, highlight }: { icon: any; label: string; value: string; highlight?: boolean }) {
  return (
    <div style={{ padding: 10, borderRadius: 8, background: 'var(--color-bg-deep)', border: '1px solid var(--card-solid)' }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
        <Icon size={10} /> {label}
      </div>
      <div style={{ fontSize: 16, fontWeight: 700, color: highlight ? '#c4a35a' : '#fff', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   BCG DRAWER
   ═══════════════════════════════════════════════════════════════════ */

function BCGDrawer({ onClose, bcgAnalysis, bcgStats }: { onClose: () => void; bcgAnalysis: any; bcgStats: any }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 999, overflow: 'auto', padding: 24 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ maxWidth: 1200, margin: '0 auto', background: 'var(--bg)', borderRadius: 16, padding: 24, border: '1px solid var(--card-solid)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <h2 style={{ fontFamily: 'Outfit, sans-serif', fontSize: 22, fontWeight: 400, color: '#fff', margin: 0 }}>Winnaars & Verliezers</h2>
            <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0, marginTop: 2 }}>Gerechten geclassificeerd op populariteit en marge</p>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: 6 }}><X size={18} /></button>
        </div>

        {bcgStats && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginBottom: 20 }}>
            {[
              { label: 'Geanalyseerd', value: bcgStats.totaal, color: '#fff' },
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
