/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';
import React, { useMemo } from 'react';
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Cell, ZAxis } from 'recharts';
import MetallicCard from '@/components/MetallicCard';
import { safeJsonParse } from '@/lib/utils';
import { getGang } from './GerechtKaart';

export type Quadrant = 'star' | 'puzzle' | 'plowhorse' | 'dog';

export interface DishAnalysis {
  id: number;
  naam: string;
  gang_slug: string;
  popularity: number;
  foodcostPP: number;
  margePct: number;
  revenue: number;
  quadrant: Quadrant;
}

export const QUADRANT_CONFIG: Record<Quadrant, { label: string; icon: string; color: string; bg: string; border: string; advies: string }> = {
  star:      { label: 'Stars',      icon: '\u2B50', color: '#4ade80', bg: 'rgba(74,222,128,.08)',  border: 'rgba(74,222,128,.25)',  advies: 'Behoud en promoot' },
  puzzle:    { label: 'Puzzles',    icon: '\uD83E\uDDE9', color: '#60a5fa', bg: 'rgba(96,165,250,.08)',  border: 'rgba(96,165,250,.25)',  advies: 'Verhoog zichtbaarheid \u2014 overweeg promotie' },
  plowhorse: { label: 'Plowhorses', icon: '\uD83D\uDC0E', color: '#fbbf24', bg: 'rgba(251,191,36,.08)',  border: 'rgba(251,191,36,.25)',  advies: 'Verhoog prijs of verlaag kosten' },
  dog:       { label: 'Dogs',       icon: '\uD83D\uDC15', color: '#f87171', bg: 'rgba(248,113,113,.08)', border: 'rgba(248,113,113,.25)', advies: 'Overweeg verwijdering of herontwerp' },
};

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload || payload.length === 0) return null;
  const d: DishAnalysis = payload[0].payload;
  return (
    <div style={{
      background: 'var(--sidebar-bg-hover)', border: '1px solid var(--color-border-hover)', borderRadius: 10,
      padding: '12px 16px', boxShadow: '0 8px 24px rgba(0,0,0,.5)', maxWidth: 240
    }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>{d.naam}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: 'rgba(255,255,255,.5)' }}>Populariteit</span>
          <span style={{ color: 'var(--text)', fontWeight: 600 }}>{d.popularity}x ingezet</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: 'rgba(255,255,255,.5)' }}>Marge</span>
          <span style={{ color: QUADRANT_CONFIG[d.quadrant].color, fontWeight: 600 }}>{d.margePct.toFixed(1)}%</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: 'rgba(255,255,255,.5)' }}>Foodcost p.p.</span>
          <span style={{ color: 'var(--text)', fontWeight: 600 }}>{'\u20ac'}{d.foodcostPP.toFixed(2)}</span>
        </div>
      </div>
      <div style={{
        marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,.08)',
        fontSize: 12, color: QUADRANT_CONFIG[d.quadrant].color, fontWeight: 700,
        display: 'flex', alignItems: 'center', gap: 4
      }}>
        {QUADRANT_CONFIG[d.quadrant].icon} {QUADRANT_CONFIG[d.quadrant].label}
      </div>
    </div>
  );
}

export function BCGMatrix({ dishes, medianPop, medianMargin }: { dishes: DishAnalysis[]; medianPop: number; medianMargin: number }) {
  if (dishes.length === 0) {
    return (
      <MetallicCard className="p-6" hover={false}>
        <div style={{ textAlign: 'center', padding: '40px 20px', color: 'rgba(255,255,255,.35)' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>📊</div>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Onvoldoende data voor matrix</div>
          <div style={{ fontSize: 12 }}>Voeg ingredient_costs toe aan gerechten en koppel ze aan events of offertes</div>
        </div>
      </MetallicCard>
    );
  }

  const maxPop = Math.max(...dishes.map(function (d) { return d.popularity; }), 1);
  const maxMargin = Math.max(...dishes.map(function (d) { return d.margePct; }), 1);

  return (
    <MetallicCard className="p-4 md:p-6" hover={false}>
      <div style={{ marginBottom: 16 }}>
        <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)', marginBottom: 4 }}>Menu Engineering Matrix</h3>
        <p style={{ fontSize: 12, color: 'rgba(255,255,255,.4)' }}>
          BCG-analyse: {dishes.length} gerechten op populariteit vs. winstgevendheid
        </p>
      </div>

      <div style={{ position: 'relative' }}>
        <ResponsiveContainer width="100%" height={420} minWidth={100} minHeight={100}>
          <ScatterChart margin={{ top: 30, right: 30, bottom: 20, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.06)" />
            <XAxis
              type="number"
              dataKey="popularity"
              name="Populariteit"
              domain={[0, Math.ceil(maxPop * 1.15)]}
              tick={{ fill: 'rgba(255,255,255,.4)', fontSize: 11 }}
              axisLine={{ stroke: 'rgba(255,255,255,.1)' }}
              tickLine={{ stroke: 'rgba(255,255,255,.1)' }}
              label={{ value: 'Populariteit (aantal keer ingezet)', position: 'insideBottom', offset: -10, style: { fill: 'rgba(255,255,255,.35)', fontSize: 11 } }}
            />
            <YAxis
              type="number"
              dataKey="margePct"
              name="Marge %"
              domain={[0, Math.ceil(maxMargin * 1.15)]}
              tick={{ fill: 'rgba(255,255,255,.4)', fontSize: 11 }}
              axisLine={{ stroke: 'rgba(255,255,255,.1)' }}
              tickLine={{ stroke: 'rgba(255,255,255,.1)' }}
              label={{ value: 'Marge %', angle: -90, position: 'insideLeft', offset: 4, style: { fill: 'rgba(255,255,255,.35)', fontSize: 11 } }}
            />
            <ZAxis type="number" dataKey="revenue" range={[40, 400]} name="Omzet" />
            <ReferenceLine
              x={medianPop}
              stroke="rgba(255,255,255,.15)"
              strokeDasharray="6 4"
              label={{ value: 'Mediaan pop.', position: 'insideTopRight', style: { fill: 'rgba(255,255,255,.2)', fontSize: 10 } }}
            />
            <ReferenceLine
              y={medianMargin}
              stroke="rgba(255,255,255,.15)"
              strokeDasharray="6 4"
              label={{ value: 'Mediaan marge', position: 'insideTopRight', style: { fill: 'rgba(255,255,255,.2)', fontSize: 10 } }}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ strokeDasharray: '3 3', stroke: 'rgba(255,255,255,.1)' }} />
            <Scatter data={dishes} isAnimationActive={true}>
              {dishes.map(function (d, i) {
                return <Cell key={i} fill={QUADRANT_CONFIG[d.quadrant].color} fillOpacity={0.8} stroke={QUADRANT_CONFIG[d.quadrant].color} strokeWidth={1} />;
              })}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>

        <div style={{ position: 'absolute', top: 8, left: 50, fontSize: 12, color: 'rgba(96,165,250,.5)', fontWeight: 700 }}>🧩 Puzzles</div>
        <div style={{ position: 'absolute', top: 8, right: 30, fontSize: 12, color: 'rgba(74,222,128,.5)', fontWeight: 700 }}>{'\u2B50'} Stars</div>
        <div style={{ position: 'absolute', bottom: 28, left: 50, fontSize: 12, color: 'rgba(248,113,113,.5)', fontWeight: 700 }}>🐕 Dogs</div>
        <div style={{ position: 'absolute', bottom: 28, right: 30, fontSize: 12, color: 'rgba(251,191,36,.5)', fontWeight: 700 }}>🐎 Plowhorses</div>
      </div>

      <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 8, flexWrap: 'wrap' }}>
        {(['star', 'puzzle', 'plowhorse', 'dog'] as Quadrant[]).map(function (q) {
          const cfg = QUADRANT_CONFIG[q];
          const count = dishes.filter(function (d) { return d.quadrant === q; }).length;
          return (
            <div key={q} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: cfg.color }} />
              <span style={{ color: 'rgba(255,255,255,.5)' }}>{cfg.icon} {cfg.label}</span>
              <span style={{ color: cfg.color, fontWeight: 700 }}>({count})</span>
            </div>
          );
        })}
      </div>
    </MetallicCard>
  );
}

export function QuadrantCards({ dishes }: { dishes: DishAnalysis[] }) {
  const grouped = useMemo(function () {
    const result: Record<Quadrant, DishAnalysis[]> = { star: [], puzzle: [], plowhorse: [], dog: [] };
    dishes.forEach(function (d) { result[d.quadrant].push(d); });
    result.star.sort(function (a, b) { return b.margePct - a.margePct; });
    result.puzzle.sort(function (a, b) { return b.margePct - a.margePct; });
    result.plowhorse.sort(function (a, b) { return b.popularity - a.popularity; });
    result.dog.sort(function (a, b) { return b.popularity - a.popularity; });
    return result;
  }, [dishes]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4" style={{ marginTop: 20 }}>
      {(['star', 'puzzle', 'plowhorse', 'dog'] as Quadrant[]).map(function (q) {
        const cfg = QUADRANT_CONFIG[q];
        const items = grouped[q];
        return (
          <MetallicCard key={q} hover={false} accent={cfg.color}>
            <div style={{ padding: '16px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 20 }}>{cfg.icon}</span>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: cfg.color }}>{cfg.label}</div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,.4)' }}>{items.length} gerechten</div>
                </div>
              </div>
              <div style={{
                fontSize: 12, color: cfg.color, background: cfg.bg,
                border: '1px solid ' + cfg.border, borderRadius: 6,
                padding: '6px 10px', marginBottom: 12, fontWeight: 600
              }}>
                💡 {cfg.advies}
              </div>

              {items.length === 0 ? (
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,.2)', textAlign: 'center', padding: '12px 0' }}>
                  Geen gerechten in dit kwadrant
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 260, overflowY: 'auto' }}>
                  {items.map(function (d) {
                    const gang = getGang(d.gang_slug);
                    return (
                      <div key={d.id} style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '8px 10px', background: 'rgba(255,255,255,.03)',
                        borderRadius: 8, border: '1px solid rgba(255,255,255,.05)'
                      }}>
                        <span style={{ fontSize: 12 }}>{gang.icon}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {d.naam}
                          </div>
                          <div style={{ fontSize: 12, color: 'rgba(255,255,255,.35)' }}>
                            {gang.label}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: cfg.color }}>
                            {d.margePct.toFixed(0)}% marge
                          </div>
                          <div style={{ fontSize: 12, color: 'rgba(255,255,255,.35)' }}>
                            {d.popularity}x {'\u00b7'} {'\u20ac'}{d.foodcostPP.toFixed(2)}/pp
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </MetallicCard>
        );
      })}
    </div>
  );
}

export function calcDishFoodcost(gerecht: any, inventoryData: any[]): number {
  const costs = gerecht.ingredient_costs;
  if (!costs || !Array.isArray(costs) || costs.length === 0) return 0;
  return costs.reduce(function (sum: number, it: any) {
    const inv = inventoryData.find(function (i: any) { return i.naam && it.naam && i.naam.toLowerCase() === it.naam.toLowerCase(); });
    const p = inv ? (inv.purchase_price || 0) : 0;
    const y = it.yield || (inv ? inv.yield_factor : 1.0) || 1.0;
    let f = 1;
    if (it.unit === 'g' && inv && inv.unit === 'kg') f = 0.001;
    if (it.unit === 'ml' && inv && inv.unit === 'L') f = 0.001;
    return sum + ((it.qty_pp || 0) * f / y) * p;
  }, 0);
}

export function countDishPopularity(dishName: string, dishId: number, eventsData: any[], offertesData: any[]): number {
  let count = 0;
  eventsData.forEach(function (ev: any) {
    const menu = typeof ev.menu === 'string' ? safeJsonParse(ev.menu, []) : (ev.menu || []);
    if (Array.isArray(menu)) {
      if (menu.includes(dishId) || menu.includes(String(dishId))) count++;
    }
  });
  offertesData.forEach(function (off: any) {
    const parsed = typeof off.menu_selectie === 'string' ? safeJsonParse(off.menu_selectie, {}) : (off.menu_selectie || {});
    let items: any[] = [];
    if (Array.isArray(parsed)) {
      items = parsed;
    } else if (parsed && typeof parsed === 'object') {
      Object.values(parsed).forEach(function (arr: any) {
        if (Array.isArray(arr)) {
          arr.forEach(function (item: any) {
            items.push(typeof item === 'string' ? { naam: item } : item);
          });
        }
      });
    }
    const found = items.some(function (it: any) {
      const name = it.gerecht_naam || it.naam || '';
      return name === dishName;
    });
    if (found) count++;
  });
  return count;
}

export function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = arr.slice().sort(function (a, b) { return a - b; });
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
