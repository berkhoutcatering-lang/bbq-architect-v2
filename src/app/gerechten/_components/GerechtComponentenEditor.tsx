'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, Plus, Search, ChevronDown, ChevronUp, Check } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { compatibleUnits } from '@/lib/unitPrice';
import { formatEur } from '@/lib/format';

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

/* Sam typt "1,5" — dat is hoe een Nederlander een hoeveelheid schrijft.
   Number("1,5") is NaN, dus zonder deze vertaling verdween zijn invoer stil of
   werd het een onbedoeld getal.

   Bewust streng: alleen cijfers met hooguit één scheidingsteken tellen mee. Een
   half getypte "1," levert via Number() namelijk gewoon 1 op — en dan staat er
   1 gram in de kostprijs terwijl er 1,5 bedoeld was, zonder één waarschuwing. */
export function parseHoeveelheid(raw: string): number | null {
  const genormaliseerd = String(raw ?? '').trim().replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(genormaliseerd)) return null;
  const n = Number(genormaliseerd);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

/* Welke eenheden mag je op deze regel kiezen? compatibleUnits() geeft alleen
   wat bij de basis-eenheid van de bouwsteen past (per 100 g → g of kg), want
   een andere familie kan de app niet omrekenen en levert stil een verkeerd
   bedrag op. De eenheid die er NU staat zetten we er altijd bij: staat er iets
   ouds in dat er niet tussen hoort, dan mag de keuzelijst dat niet stilzwijgend
   veranderen — dan moet je het zelf zien staan en zelf corrigeren. */
export function eenheidsOpties(baseUnit: string | undefined, huidige: string): string[] {
  const opties = baseUnit ? compatibleUnits(baseUnit) : [];
  const lijst = opties.length ? opties : [huidige || 'stuk'];
  return lijst.includes(huidige) || !huidige ? lijst : [...lijst, huidige];
}

export default function GerechtComponentenEditor({ gerechtId }: Props) {
  const [linked, setLinked] = useState<LinkedComponent[]>([]);
  const [available, setAvailable] = useState<AvailableComponent[]>([]);
  const [zoek, setZoek] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<number | null>(null);
  const [saving, setSaving] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  /* De gekozen bouwsteen wacht op een hoeveelheid vóór hij gekoppeld wordt.
     Eerder ging klikken meteen door naar de database met de basis-hoeveelheid
     van de bouwsteen als dosering — een getal dat toevallig in de bibliotheek
     stond en niets met dít gerecht te maken had. */
  const [gekozen, setGekozen] = useState<AvailableComponent | null>(null);
  const [nieuweQty, setNieuweQty] = useState('');
  const [nieuweUnit, setNieuweUnit] = useState('');

  /* Per gekoppelde bouwsteen wat er in de velden staat zolang je typt. Pas bij
     "Bewaar" gaat het naar de database, zodat een halve invoer ("1," ) nooit
     als hoeveelheid wordt opgeslagen. */
  const [concept, setConcept] = useState<Record<number, { qty: string; unit: string }>>({});

  const loadLinked = useCallback(async () => {
    const res = await fetch(`/api/gerechten/${gerechtId}/components`);
    if (!res.ok) return;
    const json = await res.json() as { items: LinkedComponent[] };
    setLinked(json.items ?? []);
    setConcept({});
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

  function kiesComponent(comp: AvailableComponent) {
    setError(null);
    setGekozen(comp);
    /* De basis-hoeveelheid is een vóórstel in het invoerveld, geen stilzwijgend
       feit in de database: je ziet 'm staan en kunt 'm overschrijven vóórdat
       er iets vastligt. */
    setNieuweQty(String(comp.base_quantity ?? ''));
    const opties = eenheidsOpties(comp.base_unit, comp.base_unit);
    setNieuweUnit(opties.includes(comp.base_unit) ? comp.base_unit : opties[0]);
  }

  async function addComponent() {
    if (!gekozen) return;
    const qty = parseHoeveelheid(nieuweQty);
    if (qty === null) {
      setError('Vul een hoeveelheid groter dan 0 in.');
      return;
    }
    setAdding(true);
    setError(null);
    try {
      const res = await fetch(`/api/gerechten/${gerechtId}/components`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          component_id: gekozen.id,
          quantity_used: qty,
          unit: nieuweUnit,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({})) as { error?: string };
        setError(j.error ?? 'Toevoegen mislukt.');
        return;
      }
      await loadLinked();
      setGekozen(null);
      setNieuweQty('');
      setNieuweUnit('');
      setZoek('');
      setPickerOpen(false);
    } finally {
      setAdding(false);
    }
  }

  /* Corrigeren gaat via PATCH, niet via verwijderen-en-opnieuw-toevoegen. Die
     omweg was de enige die er was en kostte bij elke dosering-correctie de hele
     koppeling; ging het toevoegen daarna mis, dan was de regel gewoon weg. */
  async function saveRegel(item: LinkedComponent) {
    const c = concept[item.component_id];
    if (!c) return;
    const qty = parseHoeveelheid(c.qty);
    if (qty === null) {
      setError('Vul een hoeveelheid groter dan 0 in.');
      return;
    }
    setSaving(item.component_id);
    setError(null);
    try {
      const res = await fetch(`/api/gerechten/${gerechtId}/components/${item.component_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantity_used: qty, unit: c.unit }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({})) as { error?: string };
        setError(j.error ?? 'Opslaan mislukt.');
        return;
      }
      /* Opnieuw ophalen in plaats van het lokale getal bijwerken: de kostprijs
         wordt in de database berekend, niet hier. Zelf een bedrag invullen zou
         een gok zijn die er als waarheid uitziet. */
      await loadLinked();
    } finally {
      setSaving(null);
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
        <p style={{ fontSize: 13, color: 'var(--muted)' }}>Laden...</p>
      </section>
    );
  }

  const veldStijl: React.CSSProperties = {
    border: '1px solid var(--border)',
    borderRadius: 8,
    background: 'var(--card-solid, var(--card))',
    color: 'var(--text)',
    padding: '6px 8px',
    fontSize: 13,
  };

  return (
    <section style={{ marginTop: 32 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700 }}>MEP-componenten</h2>
        <button
          type="button"
          onClick={() => { setPickerOpen(v => !v); setZoek(''); setGekozen(null); }}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)',
            background: 'var(--card)', color: 'var(--text)',
            fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}
        >
          <Plus size={14} />
          Component toevoegen
          {pickerOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>

      {error && (
        <p style={{ fontSize: 13, color: 'var(--red, #ef4444)', marginBottom: 8 }}>{error}</p>
      )}

      {/* Picker */}
      {pickerOpen && (
        <div style={{
          marginBottom: 16, border: '1px solid var(--border)',
          borderRadius: 10, background: 'var(--card)', overflow: 'hidden',
        }}>
          {gekozen ? (
            <div style={{ padding: '12px 14px', display: 'grid', gap: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                {gekozen.name}
                <span style={{ fontWeight: 400, color: 'var(--muted)', marginLeft: 8 }}>
                  staat per {gekozen.base_quantity} {gekozen.base_unit}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <label style={{ fontSize: 12, color: 'var(--muted)' }} htmlFor="nieuwe-hoeveelheid">
                  Hoeveelheid in dit gerecht
                </label>
                <input
                  id="nieuwe-hoeveelheid"
                  type="text"
                  inputMode="decimal"
                  value={nieuweQty}
                  onChange={e => setNieuweQty(e.target.value)}
                  autoFocus
                  style={{ ...veldStijl, width: 90 }}
                />
                <select
                  value={nieuweUnit}
                  onChange={e => setNieuweUnit(e.target.value)}
                  aria-label="Eenheid"
                  style={{ ...veldStijl, width: 90 }}
                >
                  {eenheidsOpties(gekozen.base_unit, nieuweUnit).map(u => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => void addComponent()}
                  disabled={adding}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '7px 12px', borderRadius: 8, border: 'none',
                    background: 'var(--brand)', color: '#111', fontSize: 13, fontWeight: 600,
                    cursor: 'pointer', opacity: adding ? 0.5 : 1,
                  }}
                >
                  <Plus size={14} /> Toevoegen
                </button>
                <button
                  type="button"
                  onClick={() => setGekozen(null)}
                  style={{
                    padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border)',
                    background: 'transparent', color: 'var(--muted)', fontSize: 13, cursor: 'pointer',
                  }}
                >
                  Andere kiezen
                </button>
              </div>
            </div>
          ) : (
            <>
              <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Search size={14} style={{ color: 'var(--muted)', flexShrink: 0 }} />
                <input
                  type="search"
                  placeholder="Zoek component..."
                  value={zoek}
                  onChange={e => setZoek(e.target.value)}
                  autoFocus
                  style={{
                    flex: 1, background: 'transparent', border: 'none', outline: 'none',
                    fontSize: 13, color: 'var(--text)',
                  }}
                />
              </div>
              <ul style={{ maxHeight: 280, overflowY: 'auto', margin: 0, padding: 0, listStyle: 'none' }}>
                {gefilterd.length === 0 && (
                  <li style={{ padding: '12px 14px', fontSize: 13, color: 'var(--muted)' }}>
                    {zoek ? 'Geen resultaten.' : 'Alle componenten zijn al gekoppeld.'}
                  </li>
                )}
                {gefilterd.map(comp => (
                  <li key={comp.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <button
                      type="button"
                      onClick={() => kiesComponent(comp)}
                      style={{
                        width: '100%', textAlign: 'left', padding: '10px 14px',
                        background: 'transparent', border: 'none', cursor: 'pointer',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      }}
                    >
                      <span style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500 }}>
                        {comp.name}
                      </span>
                      <span style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 8 }}>
                        {comp.base_quantity} {comp.base_unit} · {comp.type === 'bought_in' ? 'Ingekocht' : 'Bereid'}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {/* Gekoppelde componenten */}
      {linked.length === 0 ? (
        <div style={{
          padding: '20px 16px', border: '1px dashed var(--border)',
          borderRadius: 10, textAlign: 'center',
        }}>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 4 }}>
            Nog geen componenten gekoppeld.
          </p>
          <p style={{ fontSize: 12, color: 'var(--muted)' }}>
            Voeg componenten toe zodat ze als MEP-kaarten verschijnen op het kookbord.
          </p>
        </div>
      ) : (
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {linked.map(item => {
            const comp = item.components;
            const c = concept[item.component_id] ?? { qty: String(item.quantity_used), unit: item.unit };
            const gewijzigd = c.qty !== String(item.quantity_used) || c.unit !== item.unit;
            const bezig = saving === item.component_id;
            return (
              <li
                key={item.component_id}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  gap: 10, padding: '10px 14px', borderRadius: 8,
                  background: 'var(--card)',
                  border: '1px solid var(--border)',
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', margin: 0 }}>
                    {comp?.name ?? `Component ${item.component_id}`}
                  </p>
                  <p style={{ fontSize: 12, color: 'var(--muted)', margin: '2px 0 0' }}>
                    {comp?.type === 'bought_in' ? 'Ingekocht' : 'Bereid'}
                    {comp ? ` · staat per ${comp.base_quantity} ${comp.base_unit}` : ''}
                  </p>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={c.qty}
                    aria-label={`Hoeveelheid ${comp?.name ?? ''}`}
                    onChange={e => setConcept(prev => ({
                      ...prev,
                      [item.component_id]: { qty: e.target.value, unit: c.unit },
                    }))}
                    disabled={bezig}
                    style={{ ...veldStijl, width: 78, textAlign: 'right' }}
                  />
                  <select
                    value={c.unit}
                    aria-label={`Eenheid ${comp?.name ?? ''}`}
                    onChange={e => setConcept(prev => ({
                      ...prev,
                      [item.component_id]: { qty: c.qty, unit: e.target.value },
                    }))}
                    disabled={bezig}
                    style={{ ...veldStijl, width: 82 }}
                  >
                    {eenheidsOpties(comp?.base_unit, c.unit).map(u => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>

                  {/* Het bedrag komt uit de database, niet uit dit scherm. Zolang
                      je nog niet bewaard hebt, hoort het oude bedrag bij de oude
                      hoeveelheid — daarom staat het dan grijs met een hint. */}
                  <span
                    title={gewijzigd ? 'Nog niet bewaard — dit bedrag hoort bij de vorige hoeveelheid' : undefined}
                    style={{
                      fontSize: 13, fontWeight: 600, minWidth: 74, textAlign: 'right',
                      fontVariantNumeric: 'tabular-nums',
                      color: gewijzigd ? 'var(--muted)' : 'var(--text)',
                    }}
                  >
                    {formatEur((item.cost_at_use_cents ?? 0) / 100)}
                  </span>

                  {gewijzigd && (
                    <button
                      type="button"
                      onClick={() => void saveRegel(item)}
                      disabled={bezig}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                        padding: '6px 10px', borderRadius: 6, border: 'none',
                        background: 'var(--brand)', color: '#111',
                        fontSize: 12, fontWeight: 600, cursor: 'pointer',
                        opacity: bezig ? 0.5 : 1,
                      }}
                    >
                      <Check size={13} /> Bewaar
                    </button>
                  )}

                  <button
                    type="button"
                    disabled={removing === item.component_id}
                    onClick={() => void removeComponent(item.component_id)}
                    aria-label={`Verwijder ${comp?.name ?? 'component'}`}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      width: 32, height: 32, borderRadius: 6, border: 'none',
                      background: 'transparent', cursor: 'pointer',
                      color: 'var(--muted)', opacity: removing === item.component_id ? 0.4 : 1,
                    }}
                  >
                    <X size={15} />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
