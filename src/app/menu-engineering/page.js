'use client';
import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Flame, Snowflake, ThermometerSun,
  Star, ChefHat, TrendingUp, AlertTriangle,
  Filter, Search, ArrowUpDown, Check, X,
  Zap, Clock, Package
} from 'lucide-react';

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

function getScoreColorStyle(score) {
  if (score >= 80) return { color: 'var(--green)' };
  if (score >= 60) return { color: 'var(--amber)' };
  if (score >= 40) return { color: 'var(--brand)' };
  return { color: 'var(--red)' };
}

function getMarginBarStyle(margin) {
  if (margin >= 75) return { backgroundColor: 'var(--green)' };
  if (margin >= 60) return { backgroundColor: 'var(--amber)' };
  return { backgroundColor: 'var(--red)' };
}

function StarRating({ rating }) {
  return (
    <div style={{ display: 'flex', gap: '2px' }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          size={14}
          color={i <= rating ? 'var(--amber)' : '#52525b'}
          fill={i <= rating ? 'var(--amber)' : 'none'}
        />
      ))}
    </div>
  );
}

function GerechtKaart({ item, onSelect, onReject }) {
  const isSelected = item.status === 'selected';
  const isRejected = item.status === 'rejected';

  const cardStyle = {
    position: 'relative',
    background: isRejected ? '#0a0a0a' : isSelected ? 'rgba(24, 24, 27, 0.9)' : 'var(--card)',
    backdropFilter: 'var(--glass-blur)',
    WebkitBackdropFilter: 'var(--glass-blur)',
    border: isSelected ? '1px solid var(--green)' : 'var(--glass-border)',
    borderRadius: '14px',
    overflow: 'hidden',
    opacity: isRejected ? 0.4 : 1,
    boxShadow: isSelected ? '0 0 0 1px rgba(34, 197, 94, 0.2)' : 'none',
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: isRejected ? 0.4 : 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9 }}
      whileHover={!isRejected ? { y: -2, boxShadow: 'var(--lift-shadow)' } : {}}
      style={cardStyle}
    >
      <div style={{ position: 'absolute', top: 12, right: 12, zIndex: 10 }}>
        <div style={{
          ...getScoreColorStyle(item.profit_score),
          fontSize: '12px',
          fontWeight: 'bold',
          padding: '2px 8px',
          borderRadius: '12px',
          border: '1px solid currentColor',
          background: 'rgba(255,255,255,0.05)'
        }}>
          {item.profit_score}
        </div>
      </div>

      {isSelected && (
        <div style={{ position: 'absolute', top: 12, left: 12, zIndex: 10 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '4px',
            background: 'rgba(34, 197, 94, 0.2)',
            border: '1px solid rgba(34, 197, 94, 0.3)',
            borderRadius: '12px',
            padding: '2px 8px',
            color: 'var(--green)',
            fontSize: '12px',
            fontWeight: '600'
          }}>
            <Check size={10} /> Selected
          </div>
        </div>
      )}

      <div style={{ padding: '20px 16px 16px' }}>
        <h3 style={{ fontSize: '15px', fontWeight: '600', marginBottom: '4px', paddingRight: '36px' }}>{item.name}</h3>
        <p style={{ fontSize: '12px', color: 'var(--muted)', lineHeight: '1.4' }}>{item.description}</p>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '12px' }}>
          <span className={`pill ${item.temperature === 'warm' ? 'pill-optie' : 'pill-blue'}`} style={{ display: 'flex', alignItems: 'center', gap: '4px', animation: 'none' }}>
            {item.temperature === 'warm' ? <Flame size={10} /> : <ThermometerSun size={10} />}
            {item.temperature === 'warm' ? 'Warm' : 'Koud'}
          </span>

          <span className={`pill ${item.logistics === 'freeze-stable' ? 'pill-cyan' : 'pill-red'}`} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            {item.logistics === 'freeze-stable' ? <Snowflake size={10} /> : <Clock size={10} />}
            {item.logistics === 'freeze-stable' ? 'Freeze' : 'Vers'}
          </span>

          <span className="pill" style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}>
            <ChefHat size={10} />
            {item.difficulty}★
          </span>
        </div>

        <div style={{ marginTop: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '8px' }}>
            <span style={{ color: 'var(--muted)' }}>Marge</span>
            <span style={{ fontWeight: '700', fontFamily: 'monospace' }}>{item.profit_margin.toFixed(1)}%</span>
          </div>
          <div style={{ height: '6px', background: 'var(--bg)', borderRadius: '4px', overflow: 'hidden' }}>
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(item.profit_margin, 100)}%` }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
              style={{ height: '100%', borderRadius: '4px', ...getMarginBarStyle(item.profit_margin) }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginTop: '12px', borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '11px', color: 'var(--muted)' }}>Food</div>
              <div style={{ fontSize: '13px', fontWeight: 'bold', fontFamily: 'monospace' }}>€{item.food_cost.toFixed(2)}</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '11px', color: 'var(--muted)' }}>Labor</div>
              <div style={{ fontSize: '13px', fontWeight: 'bold', fontFamily: 'monospace' }}>€{item.labor_cost.toFixed(2)}</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '11px', color: 'var(--muted)' }}>Winst</div>
              <div style={{ fontSize: '13px', fontWeight: 'bold', fontFamily: 'monospace', ...getScoreColorStyle(item.profit_score) }}>
                €{(MENU_PRICE - item.total_cost).toFixed(2)}
              </div>
            </div>
          </div>
        </div>

        {item.allergens.length > 0 && (
          <div style={{ display: 'flex', gap: '8px', marginTop: '12px', alignItems: 'flex-start' }}>
            <AlertTriangle size={12} color="var(--amber)" style={{ flexShrink: 0, marginTop: '2px' }} />
            <p style={{ fontSize: '11px', color: 'var(--muted)' }}>{item.allergens.join(', ')}</p>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '16px' }}>
          <StarRating rating={item.difficulty} />

          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              onClick={() => onReject(item.id)}
              style={{
                background: isRejected ? 'var(--red)' : 'transparent',
                color: isRejected ? '#fff' : 'var(--muted)',
                border: `1px solid ${isRejected ? 'var(--red)' : 'var(--border)'}`,
                padding: '6px', borderRadius: '8px', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}
            >
              <X size={14} />
            </button>
            <button
              onClick={() => onSelect(item.id)}
              style={{
                background: isSelected ? 'var(--green)' : 'transparent',
                color: isSelected ? '#fff' : 'var(--muted)',
                border: `1px solid ${isSelected ? 'var(--green)' : 'var(--border)'}`,
                padding: '6px', borderRadius: '8px', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}
            >
              <Check size={14} />
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function Chip({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: '6px',
        padding: '6px 12px', borderRadius: '10px', fontSize: '12px', fontWeight: '600',
        background: active ? 'var(--text)' : 'transparent',
        color: active ? 'var(--bg)' : 'var(--muted)',
        border: `1px solid ${active ? 'var(--text)' : 'var(--border)'}`,
        cursor: 'pointer',
        transition: 'all 0.15s'
      }}
    >
      {children}
    </button>
  );
}

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
    <div style={{ paddingBottom: '80px' }}>
      <div style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '4px' }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: '36px', height: '36px', borderRadius: '10px',
            background: 'linear-gradient(135deg, var(--brand), #d97706)',
            color: '#fff'
          }}>
            <ChefHat size={20} />
          </div>
          <h1 style={{ fontSize: '24px', fontWeight: 'bold' }}>Recipe Funnel</h1>
        </div>
        <p style={{ color: 'var(--muted)', fontSize: '14px', marginLeft: '48px' }}>Van brainstorm naar winstgevend menu</p>
      </div>

      <div className="stat-grid" style={{ marginBottom: '20px' }}>
        <div className="stat-card" style={{ textAlign: 'center', padding: '16px' }}>
          <Package size={20} color="var(--text)" style={{ margin: '0 auto 8px' }} />
          <div style={{ fontSize: '24px', fontWeight: 'bold', fontFamily: 'monospace' }}>{stats.total}</div>
          <div style={{ fontSize: '12px', color: 'var(--muted)' }}>Totaal</div>
        </div>
        <div className="stat-card" style={{ textAlign: 'center', padding: '16px' }}>
          <Check size={20} color="var(--green)" style={{ margin: '0 auto 8px' }} />
          <div style={{ fontSize: '24px', fontWeight: 'bold', fontFamily: 'monospace', color: 'var(--green)' }}>{stats.selected}</div>
          <div style={{ fontSize: '12px', color: 'var(--muted)' }}>Geselecteerd</div>
        </div>
        <div className="stat-card" style={{ textAlign: 'center', padding: '16px' }}>
          <X size={20} color="var(--red)" style={{ margin: '0 auto 8px' }} />
          <div style={{ fontSize: '24px', fontWeight: 'bold', fontFamily: 'monospace', color: 'var(--red)' }}>{stats.rejected}</div>
          <div style={{ fontSize: '12px', color: 'var(--muted)' }}>Afgewezen</div>
        </div>
        <div className="stat-card" style={{ textAlign: 'center', padding: '16px' }}>
          <TrendingUp size={20} color="var(--amber)" style={{ margin: '0 auto 8px' }} />
          <div style={{ fontSize: '24px', fontWeight: 'bold', fontFamily: 'monospace', color: 'var(--amber)' }}>{stats.avgMargin}%</div>
          <div style={{ fontSize: '12px', color: 'var(--muted)' }}>Gem. Marge</div>
        </div>
      </div>

      <div style={{ position: 'relative', marginBottom: '16px' }}>
        <Search size={16} color="var(--muted)" style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)' }} />
        <input
          type="text"
          placeholder="Zoek gerechten..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            width: '100%',
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            borderRadius: '12px',
            padding: '12px 16px 12px 42px',
            color: 'var(--text)',
            fontSize: '14px',
            outline: 'none',
          }}
        />
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px', alignItems: 'center' }}>
        <Filter size={16} color="var(--muted)" style={{ marginRight: '8px' }} />

        <Chip active={tempFilter === 'warm'} onClick={() => toggleTemp('warm')}>
          <Flame size={14} /> Warm
        </Chip>
        <Chip active={tempFilter === 'koud'} onClick={() => toggleTemp('koud')}>
          <ThermometerSun size={14} /> Koud
        </Chip>

        <div style={{ width: '1px', height: '24px', background: 'var(--border)', margin: '0 4px' }} />

        <Chip active={logFilter === 'freeze-stable'} onClick={() => toggleLog('freeze-stable')}>
          <Snowflake size={14} /> Freeze
        </Chip>
        <Chip active={logFilter === 'vers-only'} onClick={() => toggleLog('vers-only')}>
          <Clock size={14} /> Vers
        </Chip>

        <div style={{ width: '1px', height: '24px', background: 'var(--border)', margin: '0 4px' }} />

        {[1, 2, 3, 4, 5].map((d) => (
          <Chip key={d} active={diffFilter === d} onClick={() => toggleDiff(d)}>
            {d}★
          </Chip>
        ))}

        <div style={{ width: '1px', height: '24px', background: 'var(--border)', margin: '0 4px' }} />

        <Chip active={showSelected} onClick={() => setShowSelected(!showSelected)}>
          <Check size={14} /> Selectie
        </Chip>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
        <ArrowUpDown size={14} color="var(--muted)" />
        {['score', 'margin', 'cost', 'difficulty'].map((s) => (
          <button
            key={s}
            onClick={() => setSortBy(s)}
            style={{
              background: sortBy === s ? 'var(--border)' : 'transparent',
              color: sortBy === s ? 'var(--text)' : 'var(--muted)',
              border: 'none',
              padding: '4px 8px',
              borderRadius: '6px',
              fontSize: '12px',
              cursor: 'pointer'
            }}
          >
            {s === 'score' ? 'Score' : s === 'margin' ? 'Marge' : s === 'cost' ? 'Kosten' : 'Moeilijkheid'}
          </button>
        ))}
        <span style={{ fontSize: '12px', color: 'var(--muted)', marginLeft: 'auto' }}>
          {filtered.length} resultaten
        </span>
      </div>

      <motion.div layout className="grid-3">
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
        <div style={{ textAlign: 'center', padding: '60px 0' }}>
          <Search size={48} color="var(--border)" style={{ margin: '0 auto 16px' }} />
          <p style={{ color: 'var(--muted)' }}>Geen gerechten gevonden met deze filters</p>
        </div>
      )}

      {stats.selected > 0 && (
        <motion.div
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          style={{ position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)', zIndex: 50 }}
        >
          <button className="btn btn-green" style={{ padding: '12px 24px', fontSize: '15px', boxShadow: '0 10px 25px -5px rgba(34, 197, 94, 0.4)' }}>
            <Zap size={18} />
            Finalize {stats.selected} recepten
          </button>
        </motion.div>
      )}
    </div>
  );
}
