'use client';
import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Flame, Snowflake, ThermometerSun, IceCream2,
  Star, ChefHat, TrendingUp, AlertTriangle,
  Filter, Search, ArrowUpDown, Check, X,
  Zap, Clock, Package
} from 'lucide-react';

// ── Mock Data ──────────────────────────────
const MOCK_ITEMS = [
  { id: '1', name: 'Pulled Pork Brioche', description: 'Langzaam gegaard met bourbon BBQ glaze', temperature: 'warm', logistics: 'freeze-stable', difficulty: 2, food_cost: 4.20, labor_cost: 3.75, total_cost: 7.95, profit_margin: 79.35, profit_score: 82, status: 'draft', allergens: ['gluten', 'melk', 'selderij', 'mosterd'] },
  { id: '2', name: 'Pulled Pork Taco Bowl', description: 'Met mango salsa, rode kool en chipotle crema', temperature: 'warm', logistics: 'vers-only', difficulty: 3, food_cost: 5.80, labor_cost: 5.00, total_cost: 10.80, profit_margin: 71.95, profit_score: 64, status: 'draft', allergens: ['melk', 'gluten'] },
  { id: '3', name: 'Smoked Pork Croquetten', description: 'Krokant gepaneerd met pulled pork ragout', temperature: 'warm', logistics: 'freeze-stable', difficulty: 4, food_cost: 3.90, labor_cost: 7.50, total_cost: 11.40, profit_margin: 70.39, profit_score: 52, status: 'selected', allergens: ['gluten', 'melk', 'ei'] },
  { id: '4', name: 'Asian Pulled Pork Bao', description: 'Gestoomde bao buns met hoisin en pickled daikon', temperature: 'warm', logistics: 'freeze-stable', difficulty: 4, food_cost: 5.10, labor_cost: 7.50, total_cost: 12.60, profit_margin: 67.27, profit_score: 48, status: 'draft', allergens: ['gluten', 'soja', 'sesam'] },
  { id: '5', name: 'Pulled Pork Caesar Wrap', description: 'Tortilla met romaine, parmezaan en ancho dressing', temperature: 'koud', logistics: 'vers-only', difficulty: 1, food_cost: 3.50, labor_cost: 2.50, total_cost: 6.00, profit_margin: 84.42, profit_score: 90, status: 'draft', allergens: ['gluten', 'melk', 'ei', 'vis'] },
  { id: '6', name: 'Pork Belly Burnt Ends', description: 'Geglaceerd met esdoorn en bourbon', temperature: 'warm', logistics: 'freeze-stable', difficulty: 5, food_cost: 6.50, labor_cost: 10.00, total_cost: 16.50, profit_margin: 57.14, profit_score: 32, status: 'draft', allergens: ['sulfiet'] },
  { id: '7', name: 'Thai Larb Pulled Pork', description: 'Frisse salade met munt, koriander en nam jim', temperature: 'koud', logistics: 'vers-only', difficulty: 2, food_cost: 4.00, labor_cost: 3.75, total_cost: 7.75, profit_margin: 79.87, profit_score: 80, status: 'draft', allergens: ['vis', 'pinda'] },
  { id: '8', name: 'Loaded Pork Fries', description: 'Friet met pulled pork, cheddar en jalapeño', temperature: 'warm', logistics: 'vers-only', difficulty: 1, food_cost: 3.20, labor_cost: 2.50, total_cost: 5.70, profit_margin: 85.19, profit_score: 92, status: 'selected', allergens: ['melk', 'gluten'] },
];

const MENU_PRICE = 38.50;

// ── Helpers ─────────────────────────────────
function getScoreColor(score) {
  if (score >= 80) return 'text-emerald-400';
  if (score >= 60) return 'text-amber-400';
  if (score >= 40) return 'text-orange-400';
  return 'text-red-400';
}

function getScoreBg(score) {
  if (score >= 80) return 'bg-emerald-500/20 border-emerald-500/30';
  if (score >= 60) return 'bg-amber-500/20 border-amber-500/30';
  if (score >= 40) return 'bg-orange-500/20 border-orange-500/30';
  return 'bg-red-500/20 border-red-500/30';
}

function getMarginBarColor(margin) {
  if (margin >= 75) return 'bg-emerald-500';
  if (margin >= 60) return 'bg-amber-500';
  return 'bg-red-500';
}

// ── Star Rating ─────────────────────────────
function StarRating({ rating, size = 14 }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          size={size}
          className={i <= rating ? 'text-amber-400 fill-amber-400' : 'text-zinc-600'}
        />
      ))}
    </div>
  );
}

// ── Gerecht Kaart ───────────────────────────
function GerechtKaart({ item, onSelect, onReject }) {
  const isSelected = item.status === 'selected';
  const isRejected = item.status === 'rejected';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: isRejected ? 0.4 : 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9 }}
      whileHover={{ y: -2 }}
      className={`relative rounded-2xl border overflow-hidden transition-colors ${
        isSelected
          ? 'border-emerald-500/50 bg-zinc-900/80 ring-1 ring-emerald-500/20'
          : isRejected
          ? 'border-zinc-800 bg-zinc-950'
          : 'border-zinc-800 bg-zinc-900/60 hover:border-zinc-700'
      }`}
    >
      {/* Score Badge */}
      <div className="absolute top-3 right-3 z-10">
        <div className={`rounded-full border px-2.5 py-1 text-xs font-bold ${getScoreBg(item.profit_score)}`}>
          <span className={getScoreColor(item.profit_score)}>{item.profit_score}</span>
        </div>
      </div>

      {/* Status Badge */}
      {isSelected && (
        <div className="absolute top-3 left-3 z-10">
          <div className="flex items-center gap-1 rounded-full bg-emerald-500/20 border border-emerald-500/30 px-2 py-0.5">
            <Check size={10} className="text-emerald-400" />
            <span className="text-xs font-medium text-emerald-400">Selected</span>
          </div>
        </div>
      )}

      <div className="p-4 pt-5">
        {/* Header */}
        <h3 className="text-sm font-semibold text-zinc-100 pr-12 leading-tight">{item.name}</h3>
        <p className="text-xs text-zinc-500 mt-1 leading-relaxed">{item.description}</p>

        {/* Tags Row */}
        <div className="flex flex-wrap items-center gap-1.5 mt-3">
          {/* Temperatuur */}
          <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium border ${
            item.temperature === 'warm'
              ? 'bg-orange-500/10 text-orange-400 border-orange-500/20'
              : 'bg-sky-500/10 text-sky-400 border-sky-500/20'
          }`}>
            {item.temperature === 'warm' ? <Flame size={10} /> : <ThermometerSun size={10} />}
            {item.temperature === 'warm' ? 'Warm' : 'Koud'}
          </span>

          {/* Logistiek */}
          <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium border ${
            item.logistics === 'freeze-stable'
              ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20'
              : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
          }`}>
            {item.logistics === 'freeze-stable' ? <Snowflake size={10} /> : <Clock size={10} />}
            {item.logistics === 'freeze-stable' ? 'Freeze' : 'Vers'}
          </span>

          {/* Difficulty */}
          <span className="inline-flex items-center gap-1 rounded-md bg-zinc-800 border border-zinc-700 px-2 py-0.5 text-xs text-zinc-300">
            <ChefHat size={10} />
            {item.difficulty}★
          </span>
        </div>

        {/* Financials */}
        <div className="mt-4 space-y-2">
          {/* Margin Bar */}
          <div className="flex items-center justify-between text-xs">
            <span className="text-zinc-500">Marge</span>
            <span className="font-mono font-bold text-zinc-200">{item.profit_margin.toFixed(1)}%</span>
          </div>
          <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(item.profit_margin, 100)}%` }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
              className={`h-full rounded-full ${getMarginBarColor(item.profit_margin)}`}
            />
          </div>

          {/* Cost Breakdown */}
          <div className="grid grid-cols-3 gap-2 mt-2">
            <div className="text-center">
              <div className="text-xs text-zinc-600">Food</div>
              <div className="text-xs font-mono font-semibold text-zinc-300">€{item.food_cost.toFixed(2)}</div>
            </div>
            <div className="text-center">
              <div className="text-xs text-zinc-600">Labor</div>
              <div className="text-xs font-mono font-semibold text-zinc-300">€{item.labor_cost.toFixed(2)}</div>
            </div>
            <div className="text-center">
              <div className="text-xs text-zinc-600">Winst</div>
              <div className={`text-xs font-mono font-bold ${getScoreColor(item.profit_score)}`}>
                €{(MENU_PRICE - item.total_cost).toFixed(2)}
              </div>
            </div>
          </div>
        </div>

        {/* Allergens */}
        {item.allergens.length > 0 && (
          <div className="mt-3 flex items-start gap-1.5">
            <AlertTriangle size={10} className="text-amber-500 mt-0.5 shrink-0" />
            <p className="text-xs text-zinc-600 leading-relaxed">
              {item.allergens.join(', ')}
            </p>
          </div>
        )}

        {/* Difficulty Stars */}
        <div className="mt-3 flex items-center justify-between">
          <StarRating rating={item.difficulty} />

          {/* Actions */}
          <div className="flex gap-1">
            <button
              onClick={() => onReject(item.id)}
              className={`rounded-lg p-1.5 transition-colors ${
                isRejected
                  ? 'bg-red-500/20 text-red-400'
                  : 'bg-zinc-800 text-zinc-500 hover:bg-red-500/20 hover:text-red-400'
              }`}
            >
              <X size={14} />
            </button>
            <button
              onClick={() => onSelect(item.id)}
              className={`rounded-lg p-1.5 transition-colors ${
                isSelected
                  ? 'bg-emerald-500/20 text-emerald-400'
                  : 'bg-zinc-800 text-zinc-500 hover:bg-emerald-500/20 hover:text-emerald-400'
              }`}
            >
              <Check size={14} />
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ── Filter Chip ─────────────────────────────
function Chip({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all border ${
        active
          ? 'bg-zinc-100 text-zinc-900 border-zinc-100'
          : 'bg-zinc-900 text-zinc-400 border-zinc-700 hover:border-zinc-600'
      }`}
    >
      {children}
    </button>
  );
}

// ── Main Funnel View ────────────────────────
export default function RecipeFunnel() {
  const [items, setItems] = useState(MOCK_ITEMS);
  const [search, setSearch] = useState('');
  const [tempFilter, setTempFilter] = useState(null);
  const [logFilter, setLogFilter] = useState(null);
  const [diffFilter, setDiffFilter] = useState(null);
  const [sortBy, setSortBy] = useState('score');
  const [showSelected, setShowSelected] = useState(false);

  const toggleTemp = (v) => setTempFilter(tempFilter === v ? null : v);
  const toggleLog = (v) => setLogFilter(logFilter === v ? null : v);
  const toggleDiff = (v) => setDiffFilter(diffFilter === v ? null : v);

  const handleSelect = (id) => {
    setItems((prev) =>
      prev.map((i) =>
        i.id === id
          ? { ...i, status: i.status === 'selected' ? 'draft' : 'selected' }
          : i
      )
    );
  };

  const handleReject = (id) => {
    setItems((prev) =>
      prev.map((i) =>
        i.id === id
          ? { ...i, status: i.status === 'rejected' ? 'draft' : 'rejected' }
          : i
      )
    );
  };

  const filtered = useMemo(() => {
    let result = [...items];

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (i) => i.name.toLowerCase().includes(q) || i.description.toLowerCase().includes(q)
      );
    }
    if (tempFilter) result = result.filter((i) => i.temperature === tempFilter);
    if (logFilter) result = result.filter((i) => i.logistics === logFilter);
    if (diffFilter) result = result.filter((i) => i.difficulty === diffFilter);
    if (showSelected) result = result.filter((i) => i.status === 'selected');

    result.sort((a, b) => {
      if (sortBy === 'score') return b.profit_score - a.profit_score;
      if (sortBy === 'margin') return b.profit_margin - a.profit_margin;
      if (sortBy === 'cost') return a.total_cost - b.total_cost;
      if (sortBy === 'difficulty') return a.difficulty - b.difficulty;
      return 0;
    });

    return result;
  }, [items, search, tempFilter, logFilter, diffFilter, sortBy, showSelected]);

  const stats = useMemo(() => ({
    total: items.length,
    selected: items.filter((i) => i.status === 'selected').length,
    rejected: items.filter((i) => i.status === 'rejected').length,
    avgMargin: items.length > 0
      ? (items.reduce((s, i) => s + i.profit_margin, 0) / items.length).toFixed(1)
      : '0',
  }), [items]);

  return (
    <div className="min-h-screen bg-black text-zinc-100 p-4 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600">
            <ChefHat size={16} className="text-white" />
          </div>
          <h1 className="text-xl font-bold tracking-tight">Recipe Funnel</h1>
        </div>
        <p className="text-zinc-500 text-sm ml-11">Van brainstorm naar winstgevend menu</p>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-4 gap-2 mb-5">
        {[
          { label: 'Totaal', value: stats.total, icon: Package, color: 'text-zinc-300' },
          { label: 'Geselecteerd', value: stats.selected, icon: Check, color: 'text-emerald-400' },
          { label: 'Afgewezen', value: stats.rejected, icon: X, color: 'text-red-400' },
          { label: 'Gem. Marge', value: `${stats.avgMargin}%`, icon: TrendingUp, color: 'text-amber-400' },
        ].map((s) => (
          <div key={s.label} className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-3 text-center">
            <s.icon size={14} className={`mx-auto mb-1 ${s.color}`} />
            <div className={`text-lg font-bold font-mono ${s.color}`}>{s.value}</div>
            <div className="text-xs text-zinc-600">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" />
        <input
          type="text"
          placeholder="Zoek gerechten..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-9 pr-4 py-2.5 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-600 transition-colors"
        />
      </div>

      {/* Filter Chips */}
      <div className="flex flex-wrap gap-2 mb-4">
        <div className="flex items-center gap-1 mr-2">
          <Filter size={12} className="text-zinc-600" />
        </div>

        <Chip active={tempFilter === 'warm'} onClick={() => toggleTemp('warm')}>
          <Flame size={11} /> Warm
        </Chip>
        <Chip active={tempFilter === 'koud'} onClick={() => toggleTemp('koud')}>
          <ThermometerSun size={11} /> Koud
        </Chip>

        <div className="w-px h-6 bg-zinc-800 self-center" />

        <Chip active={logFilter === 'freeze-stable'} onClick={() => toggleLog('freeze-stable')}>
          <Snowflake size={11} /> Freeze
        </Chip>
        <Chip active={logFilter === 'vers-only'} onClick={() => toggleLog('vers-only')}>
          <Clock size={11} /> Vers
        </Chip>

        <div className="w-px h-6 bg-zinc-800 self-center" />

        {[1, 2, 3, 4, 5].map((d) => (
          <Chip key={d} active={diffFilter === d} onClick={() => toggleDiff(d)}>
            {d}★
          </Chip>
        ))}

        <div className="w-px h-6 bg-zinc-800 self-center" />

        <Chip active={showSelected} onClick={() => setShowSelected(!showSelected)}>
          <Check size={11} /> Selectie
        </Chip>
      </div>

      {/* Sort */}
      <div className="flex items-center gap-2 mb-5">
        <ArrowUpDown size={12} className="text-zinc-600" />
        {['score', 'margin', 'cost', 'difficulty'].map((s) => (
          <button
            key={s}
            onClick={() => setSortBy(s)}
            className={`text-xs px-2 py-1 rounded-md transition-colors ${
              sortBy === s
                ? 'bg-zinc-800 text-zinc-200'
                : 'text-zinc-600 hover:text-zinc-400'
            }`}
          >
            {s === 'score' ? 'Score' : s === 'margin' ? 'Marge' : s === 'cost' ? 'Kosten' : 'Moeilijkheid'}
          </button>
        ))}
        <span className="text-xs text-zinc-700 ml-auto">{filtered.length} resultaten</span>
      </div>

      {/* Grid */}
      <motion.div layout className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        <AnimatePresence mode="popLayout">
          {filtered.map((item) => (
            <GerechtKaart
              key={item.id}
              item={item}
              onSelect={handleSelect}
              onReject={handleReject}
            />
          ))}
        </AnimatePresence>
      </motion.div>

      {filtered.length === 0 && (
        <div className="text-center py-16">
          <Search size={32} className="mx-auto text-zinc-800 mb-3" />
          <p className="text-zinc-600 text-sm">Geen gerechten gevonden met deze filters</p>
        </div>
      )}

      {/* Floating Action */}
      {stats.selected > 0 && (
        <motion.div
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50"
        >
          <button className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm px-6 py-3 rounded-2xl shadow-lg shadow-emerald-900/50 transition-colors">
            <Zap size={16} />
            Finalize {stats.selected} recepten
          </button>
        </motion.div>
      )}
    </div>
  );
}
