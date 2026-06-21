'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, Plus, Search, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface LinkedComponent {
  component_id: number;
  quantity_used: number;
  unit: string;
  cost_at_use_cents: number | null;
  components: {
    id: number;
    name: string;
    type: string;
    base_quantity: number;
    base_unit: string;
  } | null;
}

interface AvailableComponent {
  id: number;
  name: string;
  type: 'prepared' | 'bought_in';
  base_quantity: number;
  base_unit: string;
}

interface Props {
  gerechtId: string;
}

export default function GerechtComponentenEditor({ gerechtId }: Props) {
  const [linked, setLinked] = useState<LinkedComponent[]>([]);
  const [available, setAvailable] = useState<AvailableComponent[]>([]);
  const [zoek, setZoek] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState<number | null>(null);
  const [removing, setRemoving] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadLinked = useCallback(async () => {
    const res = await fetch(`/api/gerechten/${gerechtId}/components`);
    if (!res.ok) return;
    const json = await res.json() as { items: LinkedComponent[] };
    setLinked(json.items ?? []);
  }, [gerechtId]);

  const loadAvailable = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase
      .from('components')
      .select('id,name,type,base_quantity,base_unit')
      .order('name');
    setAvailable((data ?? []) as AvailableComponent[]);
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([loadLinked(), loadAvailable()]).finally(() => setLoading(false));
  }, [loadLinked, loadAvailable]);

  const linkedIds = new Set(linked.map(l => l.component_id));

  const gefilterd = available.filter(c => {
    if (linkedIds.has(c.id)) return false;
    if (!zoek.trim()) return true;
    return c.name.toLowerCase().includes(zoek.toLowerCase());
  });

  async function addComponent(comp: AvailableComponent) {
    setAdding(comp.id);
    setError(null);
    try {
      const res = await fetch(`/api/gerechten/${gerechtId}/components`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          component_id: comp.id,
          quantity_used: comp.base_quantity,
          unit: comp.base_unit,
        }),
      });
      if (!res.ok) {
        const j = await res.json() as { error?: string };
        setError(j.error ?? 'Toevoegen mislukt.');
        return;
      }
      await loadLinked();
    } finally {
      setAdding(null);
    }
  }

  async function removeComponent(componentId: number) {
    setRemoving(componentId);
    setError(null);
    try {
      const res = await fetch(`/api/gerechten/${gerechtId}/components/${componentId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        setError('Verwijderen mislukt.');
        return;
      }
      setLinked(prev => prev.filter(l => l.component_id !== componentId));
    } finally {
      setRemoving(null);
    }
  }

  if (loading) {
    return (
      <section style={{ marginTop: 32 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>MEP-componenten</h2>
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Laden...</p>
      </section>
    );
  }

  return (
    <section style={{ marginTop: 32 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700 }}>MEP-componenten</h2>
        <button
          type="button"
          onClick={() => { setPickerOpen(v => !v); setZoek(''); }}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '8px 14px', borderRadius: 8, border: '1px solid var(--color-border, #334155)',
            background: 'var(--color-surface, #1e293b)', color: 'var(--color-text, #f1f5f9)',
            fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}
        >
          <Plus size={14} />
          Component toevoegen
          {pickerOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>

      {error && (
        <p style={{ fontSize: 13, color: '#f87171', marginBottom: 8 }}>{error}</p>
      )}

      {/* Picker */}
      {pickerOpen && (
        <div style={{
          marginBottom: 16, border: '1px solid var(--color-border, #334155)',
          borderRadius: 10, background: 'var(--color-surface, #1e293b)', overflow: 'hidden',
        }}>
          <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--color-border, #334155)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Search size={14} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
            <input
              type="search"
              placeholder="Zoek component..."
              value={zoek}
              onChange={e => setZoek(e.target.value)}
              autoFocus
              style={{
                flex: 1, background: 'transparent', border: 'none', outline: 'none',
                fontSize: 13, color: 'var(--color-text, #f1f5f9)',
              }}
            />
          </div>
          <ul style={{ maxHeight: 280, overflowY: 'auto', margin: 0, padding: 0, listStyle: 'none' }}>
            {gefilterd.length === 0 && (
              <li style={{ padding: '12px 14px', fontSize: 13, color: 'var(--color-text-muted)' }}>
                {zoek ? 'Geen resultaten.' : 'Alle componenten zijn al gekoppeld.'}
              </li>
            )}
            {gefilterd.map(comp => (
              <li key={comp.id} style={{ borderBottom: '1px solid var(--color-border, #1e2d3f)' }}>
                <button
                  type="button"
                  disabled={adding === comp.id}
                  onClick={() => void addComponent(comp)}
                  style={{
                    width: '100%', textAlign: 'left', padding: '10px 14px',
                    background: 'transparent', border: 'none', cursor: 'pointer',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    opacity: adding === comp.id ? 0.5 : 1,
                  }}
                >
                  <span style={{ fontSize: 13, color: 'var(--color-text, #f1f5f9)', fontWeight: 500 }}>
                    {comp.name}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--color-text-muted)', marginLeft: 8 }}>
                    {comp.base_quantity} {comp.base_unit} · {comp.type === 'bought_in' ? 'Ingekocht' : 'Bereid'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Gekoppelde componenten */}
      {linked.length === 0 ? (
        <div style={{
          padding: '20px 16px', border: '1px dashed var(--color-border, #334155)',
          borderRadius: 10, textAlign: 'center',
        }}>
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 4 }}>
            Nog geen componenten gekoppeld.
          </p>
          <p style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
            Voeg componenten toe zodat ze als MEP-kaarten verschijnen op het kookbord.
          </p>
        </div>
      ) : (
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {linked.map(item => {
            const comp = item.components;
            return (
              <li
                key={item.component_id}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '10px 14px', borderRadius: 8,
                  background: 'var(--color-surface, #1e293b)',
                  border: '1px solid var(--color-border, #334155)',
                }}
              >
                <div>
                  <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text, #f1f5f9)', margin: 0 }}>
                    {comp?.name ?? `Component ${item.component_id}`}
                  </p>
                  <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: '2px 0 0' }}>
                    {item.quantity_used} {item.unit} · {comp?.type === 'bought_in' ? 'Ingekocht' : 'Bereid'}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={removing === item.component_id}
                  onClick={() => void removeComponent(item.component_id)}
                  aria-label="Verwijder component"
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    width: 32, height: 32, borderRadius: 6, border: 'none',
                    background: 'transparent', cursor: 'pointer',
                    color: 'var(--color-text-muted)', opacity: removing === item.component_id ? 0.4 : 1,
                  }}
                >
                  <X size={15} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
