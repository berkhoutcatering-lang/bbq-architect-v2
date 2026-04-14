/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';
import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useConfirm } from '@/components/ConfirmDialog';
import EmptyState from '@/components/EmptyState';
import PageHeader from '@/components/PageHeader';
import PageSection from '@/components/PageSection';
import PageHint from '@/components/PageHint';
import { CheckSquare, CheckCheck, Trash2, Loader2, Search, ArrowRight } from 'lucide-react';

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

      <PageHeader
        title="Menu Engineering"
        description="Beoordeel, sorteer en publiceer je gerechten via het Map Station"
      />

      <PageHint id="menu-engineering" title="Menu Engineering" description="Analyseer je menu op populariteit en marge. Gebruik de BCG Matrix om Stars en Dogs te identificeren." />

      {gerechten.length === 0 && <EmptyState page="/menu-engineering" />}

      <PageSection title="Overzicht">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Totaal', value: stats.totaal, sub: 'gerechten' },
            { label: 'Actief', value: stats.actief, sub: 'gepubliceerd' },
            { label: 'Met kostprijs', value: stats.metKostprijs, sub: 'berekend' },
            { label: 'Gem. marge', value: stats.gemMarge + '%', sub: 'op €45 menu' },
          ].map(function (s) {
            return (
              <div key={s.label} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px' }}>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,.4)', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 }}>{s.label}</div>
                <div style={{ fontSize: 22, fontWeight: 800 }}>{s.value}</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,.3)', marginTop: 2 }}>{s.sub}</div>
              </div>
            );
          })}
        </div>
      </PageSection>

      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,.3)' }} />
          <input
            type="text"
            value={search}
            onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setSearch(e.target.value); }}
            placeholder="Zoek gerechten..."
            style={{
              width: '100%', paddingLeft: 34, padding: '9px 12px 9px 34px',
              background: 'var(--card)', border: '1px solid var(--border)',
              borderRadius: 8, color: 'var(--text)', fontSize: 13, outline: 'none'
            }}
          />
        </div>

        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          <button
            onClick={function () { setGangFilter('alle'); }}
            style={{ padding: '8px 14px', borderRadius: 7, fontSize: 13, fontWeight: 700, cursor: 'pointer', border: '1px solid var(--border)', background: gangFilter === 'alle' ? 'rgba(59,130,246,.15)' : 'transparent', color: gangFilter === 'alle' ? '#3b82f6' : 'rgba(255,255,255,.5)' }}
          >
            Alle
          </button>
          {GANGEN.map(function (g) {
            const active = gangFilter === g.slug;
            return (
              <button
                key={g.slug}
                onClick={function () { setGangFilter(active ? 'alle' : g.slug); }}
                style={{ padding: '8px 14px', borderRadius: 7, fontSize: 13, fontWeight: 700, cursor: 'pointer', border: '1px solid ' + (active ? '#3b82f6' : 'var(--border)'), background: active ? 'rgba(59,130,246,.15)' : 'transparent', color: active ? '#3b82f6' : 'rgba(255,255,255,.5)' }}
              >
                {g.icon} {g.label}
              </button>
            );
          })}
        </div>

        <div style={{ display: 'flex', background: 'rgba(255,255,255,.06)', borderRadius: 8, padding: 3, gap: 2 }}>
          {([['kaarten', '⊞ Kaarten'], ['matrix', '📈 BCG Matrix'], ['map', '🗂 Map Station']] as [string, string][]).map(function (pair) {
            const isActive = view === pair[0];
            return (
              <button
                key={pair[0]}
                onClick={function () { setView(pair[0]); }}
                style={{ padding: '6px 14px', borderRadius: 6, border: 'none', background: isActive ? 'rgba(255,255,255,.12)' : 'transparent', color: isActive ? '#fff' : 'rgba(255,255,255,.45)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
              >
                {pair[1]}
              </button>
            );
          })}
        </div>

        <button
          onClick={function () {
            setSelectionMode(!selectionMode);
            if (selectionMode) setSelectedIds([]);
          }}
          style={{
            padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer',
            border: '1px solid ' + (selectionMode ? '#3b82f6' : 'var(--border)'),
            background: selectionMode ? 'rgba(59,130,246,.15)' : 'transparent',
            color: selectionMode ? '#3b82f6' : 'rgba(255,255,255,.5)',
            display: 'flex', alignItems: 'center', gap: 6, transition: '0.2s'
          }}
        >
          {selectionMode ? <CheckCheck size={16} /> : <CheckSquare size={16} />}
          {selectionMode ? 'Selectie aan' : 'Selectiemodus'}
        </button>

        {selectionMode && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,.05)',
              border: '1px solid var(--border)', borderRadius: 8, padding: '0 10px', height: 32
            }}>
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,.4)', textTransform: 'uppercase', fontWeight: 700 }}>Max</span>
              <input
                type="number"
                min={1}
                max={200}
                value={selectLimit}
                onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setSelectLimit(Math.max(1, Math.min(200, Number(e.target.value) || 1))); }}
                style={{
                  width: 40, background: 'transparent', border: 'none', color: '#fff',
                  fontSize: 12, fontWeight: 700, outline: 'none', textAlign: 'center'
                }}
              />
            </div>

            <button
              onClick={selectVisible}
              style={{ padding: '0 14px', height: 36, borderRadius: 8, border: '1px solid var(--border)', background: 'rgba(255,255,255,.05)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
            >
              Selecteer {selectLimit}
            </button>

            <button
              onClick={clearSelection}
              style={{ padding: '0 14px', height: 36, borderRadius: 8, border: '1px solid var(--border)', background: 'rgba(255,255,255,.05)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
            >
              Deselecteer
            </button>

            {selectedIds.length > 0 && (
              <button
                onClick={deleteSelected}
                style={{ padding: '0 14px', height: 36, borderRadius: 8, border: 'none', background: 'rgba(239,68,68,.15)', color: '#ef4444', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <Trash2 size={16} />
                Verwijder ({selectedIds.length})
              </button>
            )}
          </div>
        )}
      </div>

      {view === 'kaarten' && (
        <div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,.35)', marginBottom: 14 }}>
            {filtered.length} gerechten
            {inMap.size > 0 && <span style={{ marginLeft: 8 }}>• <span style={{ color: '#a78bfa' }}>{inMap.size} in Map Station</span></span>}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 14 }}>
            {filtered.map(function (g) {
              return (
                <GerechtKaart
                  key={g.id}
                  gerecht={g}
                  geselecteerd={inMap.has(g.id)}
                  onMoveToMap={openGangPicker}
                  onViewDetails={setViewingGerecht}
                  selectionMode={selectionMode}
                  isSelected={function (id: number) { return selectedIds.includes(id); }}
                  onToggleSelect={toggleSelect}
                />
              );
            })}
          </div>
          {filtered.length === 0 && (
            <EmptyState page="/menu-engineering" />
          )}
        </div>
      )}

      {view === 'matrix' && (
        <div>
          {/* BCG Summary Stats */}
          {bcgStats && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3" style={{ marginBottom: 20 }}>
              {[
                { label: 'Geanalyseerd', value: bcgStats.totaal, color: '#c4a35a' },
                { label: 'Stars', value: bcgStats.stars, color: '#4ade80' },
                { label: 'Puzzles', value: bcgStats.puzzles, color: '#60a5fa' },
                { label: 'Plowhorses', value: bcgStats.plowhorses, color: '#fbbf24' },
                { label: 'Dogs', value: bcgStats.dogs, color: '#f87171' },
              ].map(function (s) {
                return (
                  <div key={s.label} style={{ background: '#1a1a1e', border: '1px solid #2a2a30', borderRadius: 10, padding: '12px 14px' }}>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,.4)', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4 }}>{s.label}</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.value}</div>
                  </div>
                );
              })}
            </div>
          )}

          {/* BCG Scatter Plot */}
          <BCGMatrix dishes={bcgAnalysis.dishes} medianPop={bcgAnalysis.medianPop} medianMargin={bcgAnalysis.medianMargin} />

          {/* Quadrant Classification Cards */}
          <QuadrantCards dishes={bcgAnalysis.dishes} />
        </div>
      )}

      {view === 'map' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>🗂 Map Station</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,.4)' }}>
                {alleMapGerechten} gerechten ingedeeld • {gerechten.length - alleMapGerechten} nog niet
              </div>
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
              <button
                onClick={aiAutoSort}
                style={{ background: 'rgba(167,139,250,.1)', border: '1px solid rgba(167,139,250,.2)', color: '#a78bfa', padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
              >
                ✨ AI auto-sort
              </button>
              <button
                onClick={function () { const m: Record<string, GerechtData[]> = {}; GANGEN.forEach(function (g) { m[g.slug] = []; }); setMapData(m); }}
                style={{ background: 'transparent', border: '1px solid var(--border)', color: 'rgba(255,255,255,.4)', padding: '8px 14px', borderRadius: 8, fontSize: 12, cursor: 'pointer' }}
              >
                Reset
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,.35)', textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 10 }}>
                Pool — {ongemapt.length} gerechten
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 600, overflowY: 'auto', paddingRight: 4 }}>
                {ongemapt.map(function (g) {
                  const gang = getGang(g.gang_slug);
                  return (
                    <div
                      key={g.id}
                      draggable
                      onDragStart={function (e: React.DragEvent) { e.dataTransfer.setData('gerecht_id', String(g.id)); }}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 9, cursor: 'grab', transition: 'border-color .15s' }}
                      onClick={function () { openGangPicker(g); }}
                    >
                      <span style={{ fontSize: 14 }}>{gang.icon}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.naam}</div>
                        <div style={{ fontSize: 12, color: gang.kleur, fontWeight: 600 }}>{gang.label}</div>
                      </div>
                      <ArrowRight size={14} style={{ color: 'rgba(255,255,255,.2)' }} />
                    </div>
                  );
                })}
                {ongemapt.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '24px', fontSize: 12, color: 'rgba(255,255,255,.2)', border: '1px dashed var(--border)', borderRadius: 9 }}>
                    ✅ Alle gerechten zijn ingedeeld!
                  </div>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {GANGEN.map(function (gang) {
                const lijst = mapData[gang.slug] || [];
                return (
                  <MapStation
                    key={gang.slug}
                    gang={gang}
                    gerechten={lijst}
                    onRemove={removeFromMap}
                    onPublish={publishGang}
                    onDrop={function (gerechthId: string) {
                      const g = gerechten.find(function (x) { return String(x.id) === String(gerechthId); });
                      if (g) placeInMap(g, gang.slug);
                    }}
                  />
                );
              })}
            </div>
          </div>
        </div>
      )}

      <GangPickerModal
        gerecht={picking}
        onPick={placeInMap}
        onClose={function () { setPicking(null); }}
      />

      <GerechtDetailsModal
        gerecht={viewingGerecht}
        onSave={handleSaveDetails}
        onDelete={handleDeleteDetails}
        onClose={function () { setViewingGerecht(null); }}
        onError={function (msg: string) { showToast('❌ ' + msg); }}
        supabase={supabase}
      />
    </div>
  );
}
