'use client';

import Link from 'next/link';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Layers, Trash2, Search, Plus, Check } from 'lucide-react';
import { compatibleUnits } from '@/lib/unitPrice';

interface GerechtComponentRow {
  gerecht_id: string;
  component_id: number;
  quantity_used: number;
  unit: string;
  cost_at_use_cents: number;
  components: {
    id: number;
    name: string;
    type: 'prepared' | 'bought_in';
    base_quantity: number;
    base_unit: string;
    base_cost_cents: number;
  } | null;
}

interface ComponentOption {
  id: number;
  name: string;
  type: 'prepared' | 'bought_in';
  base_unit: string;
  base_cost_cents: number;
  base_quantity: number;
}

interface GerechtenBouwEditorProps {
  gerechtId: string;
  readOnly?: boolean;
  onCostChange?: (totalCents: number) => void;
}

/* Welke eenheden je mag kiezen hangt af van de BASIS-eenheid van de gekozen
   component: een component per 100 g kun je in g of kg gebruiken, maar niet in
   stuks — dan is er geen omrekening en werd er stil een factor-1000-fout
   gemaakt. compatibleUnits() is de gedeelde bron (lib/unitPrice.ts). */
const UNITS = ['g', 'kg', 'ml', 'liter', 'stuk', 'portie'] as const;

function fmtEuroFromCents(cents: number): string {
  return new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format((cents || 0) / 100);
}

/* "1,5" is hoe een Nederlander een hoeveelheid schrijft; Number() maakt daar
   NaN van. Bewust streng: een half getypte "1," wordt via Number() gewoon 1, en
   dan zou er 1 gram opgeslagen worden waar 1,5 bedoeld was. */
function parseHoeveelheid(raw: string): number | null {
  const genormaliseerd = String(raw ?? '').trim().replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(genormaliseerd)) return null;
  const n = Number(genormaliseerd);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

/* De eenheid die er NU staat hoort altijd in de keuzelijst, ook als hij niet
   bij de basis-eenheid past. Anders zou de lijst een oude waarde stilzwijgend
   vervangen door de eerste optie en verandert er een bedrag zonder dat iemand
   iets gekozen heeft. */
function eenheidsOpties(baseUnit: string | undefined, huidige: string): string[] {
  const opties = baseUnit ? compatibleUnits(baseUnit) : [];
  const lijst = opties.length ? opties : [huidige || 'stuk'];
  return lijst.includes(huidige) || !huidige ? lijst : [...lijst, huidige];
}

function typeLabel(type: 'prepared' | 'bought_in' | undefined): string {
  if (type === 'prepared') return 'Eigen';
  if (type === 'bought_in') return 'Ingekocht';
  return 'Onbekend';
}

export default function GerechtenBouwEditor({
  gerechtId,
  readOnly = false,
  onCostChange,
}: GerechtenBouwEditorProps) {
  const [rows, setRows] = useState<GerechtComponentRow[]>([]);
  const [rowsLoading, setRowsLoading] = useState(false);
  const [rowsError, setRowsError] = useState<string>('');
  /* Pas een bedrag naar buiten melden als er écht geladen is. Anders meldt dit
     blok €0 vóór de fetch (en na een laadfout), en neemt de ouder die 0 over
     als waarheid — waardoor een gerecht mét componenten kortstondig €0 toont. */
  const [loaded, setLoaded] = useState(false);

  const [options, setOptions] = useState<ComponentOption[]>([]);
  const [optionsLoading, setOptionsLoading] = useState(false);

  const [query, setQuery] = useState('');
  const [openResults, setOpenResults] = useState(false);
  const [selected, setSelected] = useState<ComponentOption | null>(null);

  const [quantityUsed, setQuantityUsed] = useState<string>('1');
  const [unit, setUnit] = useState<string>('stuk');

  const [formError, setFormError] = useState<string>('');
  const [formSuccess, setFormSuccess] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  /* Wat er in de velden van een al gekoppelde regel staat zolang je typt. Pas
     bij "Bewaar" gaat het naar de database — een halve invoer ("1,") mag nooit
     als dosering opgeslagen worden. */
  const [concept, setConcept] = useState<Record<number, { qty: string; unit: string }>>({});
  const [savingId, setSavingId] = useState<number | null>(null);

  const totalCents = useMemo(
    () => rows.reduce((sum, row) => sum + (row.cost_at_use_cents || 0), 0),
    [rows]
  );

  useEffect(() => {
    if (loaded && onCostChange) onCostChange(totalCents);
  }, [loaded, totalCents, onCostChange]);

  const loadRows = useCallback(async () => {
    if (!gerechtId) {
      setRows([]);
      setLoaded(false);
      return;
    }
    setRowsLoading(true);
    setRowsError('');
    try {
      const res = await fetch(`/api/gerechten/${gerechtId}/components`, { method: 'GET' });
      if (!res.ok) throw new Error(`Kon componenten niet laden (${res.status})`);
      const data = (await res.json()) as { items?: GerechtComponentRow[] };
      setRows(Array.isArray(data.items) ? data.items : []);
      setConcept({});
      setLoaded(true);
    } catch (err) {
      setRowsError(err instanceof Error ? err.message : 'Onbekende fout bij laden');
      /* rows NIET wissen en loaded niet op true: een mislukte refetch mag een
         eerder geladen totaal niet naar €0 trekken. De foutmelding informeert. */
    } finally {
      setRowsLoading(false);
    }
  }, [gerechtId]);

  const loadOptions = useCallback(async () => {
    if (readOnly) return;
    setOptionsLoading(true);
    try {
      const res = await fetch('/api/components', { method: 'GET' });
      if (!res.ok) throw new Error(`Kon componentenlijst niet laden (${res.status})`);
      const data = (await res.json()) as { components?: ComponentOption[] };
      setOptions(Array.isArray(data.components) ? data.components : []);
    } catch {
      setOptions([]);
    } finally {
      setOptionsLoading(false);
    }
  }, [readOnly]);

  useEffect(() => {
    loadRows();
  }, [loadRows]);

  useEffect(() => {
    if (!readOnly) loadOptions();
  }, [loadOptions, readOnly]);

  const filteredOptions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options.slice(0, 20);
    return options
      .filter((o) => {
        const t = o.type === 'prepared' ? 'eigen' : 'ingekocht';
        return o.name.toLowerCase().includes(q) || t.includes(q);
      })
      .slice(0, 20);
  }, [options, query]);

  async function handleAdd() {
    setFormError('');
    setFormSuccess('');

    if (!gerechtId) {
      setFormError('Sla het gerecht eerst op voordat je componenten koppelt.');
      return;
    }
    if (!selected) {
      setFormError('Selecteer eerst een component.');
      return;
    }
    const qty = Number(quantityUsed);
    if (!Number.isFinite(qty) || qty <= 0) {
      setFormError('Vul een geldige hoeveelheid in.');
      return;
    }
    if (!unit) {
      setFormError('Kies een eenheid.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/gerechten/${gerechtId}/components`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          component_id: selected.id,
          quantity_used: qty,
          unit,
        }),
      });

      if (res.status === 409) {
        setFormError('Zit al in dit gerecht.');
        return;
      }
      if (!res.ok) {
        throw new Error(`Toevoegen mislukt (${res.status})`);
      }

      await loadRows();
      setFormSuccess('Component toegevoegd.');
      setQuery('');
      setSelected(null);
      setQuantityUsed('1');
      setUnit('stuk');
      setOpenResults(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Toevoegen mislukt');
    } finally {
      setSubmitting(false);
    }
  }

  /* Een dosering corrigeren ging vroeger alleen door de koppeling weg te gooien
     en 'm opnieuw toe te voegen (een tweede POST botst op de sleutel
     gerecht_id+component_id en geeft 409). Dat is dataverlies bij elke correctie,
     en zolang niemand die omweg nam stond er een hoeveelheid in de kostprijs die
     nooit bewust gekozen was. Vandaar deze PATCH. */
  async function handleSaveRow(row: GerechtComponentRow) {
    const c = concept[row.component_id];
    if (!c) return;
    setFormError('');
    setFormSuccess('');
    const qty = parseHoeveelheid(c.qty);
    if (qty === null) {
      setFormError('Vul een hoeveelheid groter dan 0 in.');
      return;
    }
    setSavingId(row.component_id);
    try {
      const res = await fetch(`/api/gerechten/${gerechtId}/components/${row.component_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantity_used: qty, unit: c.unit }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || `Opslaan mislukt (${res.status})`);
      }
      /* Opnieuw ophalen: de kostprijs wordt in de database berekend. Hier zelf
         een bedrag uitrekenen zou een tweede waarheid maken die kan afwijken. */
      await loadRows();
      setFormSuccess('Hoeveelheid aangepast.');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Opslaan mislukt');
    } finally {
      setSavingId(null);
    }
  }

  async function handleDelete(componentId: number) {
    setFormError('');
    setFormSuccess('');
    setDeletingId(componentId);
    try {
      const res = await fetch(`/api/gerechten/${gerechtId}/components/${componentId}`, {
        method: 'DELETE',
      });
      if (!res.ok && res.status !== 204) {
        throw new Error(`Verwijderen mislukt (${res.status})`);
      }
      await loadRows();
      setFormSuccess('Component verwijderd.');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Verwijderen mislukt');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div
      style={{
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: 12,
      }}
    >
      <div style={{ display: 'grid', gap: 10 }}>
        {rowsLoading ? (
          <div
            style={{
              padding: 24,
              textAlign: 'center',
              color: 'var(--muted)',
              fontSize: 13,
              border: '1px dashed var(--border)',
              borderRadius: 10,
            }}
          >
            Componenten laden...
          </div>
        ) : rows.length === 0 ? (
          <div
            style={{
              padding: 24,
              textAlign: 'center',
              color: 'var(--muted)',
              fontSize: 13,
              border: '1px dashed var(--border)',
              borderRadius: 10,
            }}
          >
            Nog geen componenten gekoppeld.
          </div>
        ) : (
          rows.map((row) => {
            const c = concept[row.component_id] ?? { qty: String(row.quantity_used), unit: row.unit };
            const gewijzigd = c.qty !== String(row.quantity_used) || c.unit !== row.unit;
            const bezig = savingId === row.component_id;
            const veldStijl: React.CSSProperties = {
              border: '1px solid var(--border)',
              borderRadius: 8,
              background: 'var(--card)',
              color: 'var(--text)',
              padding: '5px 8px',
              fontSize: 13,
            };
            return (
            <div
              key={`${row.gerecht_id}-${row.component_id}`}
              style={{
                padding: '10px 14px',
                background: 'var(--bg-subtle)',
                border: '1px solid var(--border)',
                borderRadius: 10,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                <Layers size={14} color="var(--brand-gold, #c4a35a)" />
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <strong style={{ color: 'var(--text)' }}>{row.components?.name ?? 'Onbekende component'}</strong>
                    <span
                      style={{
                        fontSize: 11,
                        color: 'var(--muted)',
                        border: '1px solid var(--border)',
                        borderRadius: 999,
                        padding: '2px 8px',
                      }}
                    >
                      {typeLabel(row.components?.type)}
                    </span>
                  </div>
                  {readOnly ? (
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                      {row.quantity_used} {row.unit}
                    </div>
                  ) : (
                    /* Invulvelden in plaats van een vaste regel: de hoeveelheid
                       was hier alleen te lezen, dus corrigeren betekende de hele
                       koppeling weggooien en opnieuw aanmaken. */
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={c.qty}
                        aria-label={`Hoeveelheid ${row.components?.name ?? ''}`}
                        onChange={(e) =>
                          setConcept((prev) => ({ ...prev, [row.component_id]: { qty: e.target.value, unit: c.unit } }))
                        }
                        disabled={bezig}
                        style={{ ...veldStijl, width: 74, textAlign: 'right' }}
                      />
                      <select
                        value={c.unit}
                        aria-label={`Eenheid ${row.components?.name ?? ''}`}
                        onChange={(e) =>
                          setConcept((prev) => ({ ...prev, [row.component_id]: { qty: c.qty, unit: e.target.value } }))
                        }
                        disabled={bezig}
                        style={{ ...veldStijl, width: 80 }}
                      >
                        {eenheidsOpties(row.components?.base_unit, c.unit).map((u) => (
                          <option key={u} value={u}>
                            {u}
                          </option>
                        ))}
                      </select>
                      {gewijzigd && (
                        <button
                          type="button"
                          className="btn btn-brand btn-sm"
                          onClick={() => handleSaveRow(row)}
                          disabled={bezig}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
                        >
                          <Check size={13} /> Bewaar
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                {/* Het bedrag komt uit de database. Zolang je nog niet bewaard
                    hebt hoort het bij de vórige hoeveelheid — dat mag niet als
                    het nieuwe bedrag ogen. */}
                <div
                  title={gewijzigd ? 'Nog niet bewaard — dit bedrag hoort bij de vorige hoeveelheid' : undefined}
                  style={{ fontWeight: 600, color: gewijzigd ? 'var(--muted)' : 'var(--text)' }}
                >
                  {fmtEuroFromCents(row.cost_at_use_cents)}
                </div>
                {!readOnly && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => handleDelete(row.component_id)}
                    disabled={deletingId === row.component_id}
                    aria-label="Verwijder component"
                    title="Verwijder component"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>
            );
          })
        )}

        {rowsError ? <div style={{ color: 'var(--red, #ef4444)', fontSize: 12 }}>{rowsError}</div> : null}

        {!readOnly && (
          <div
            style={{
              marginTop: 2,
              padding: '10px 14px',
              background: 'var(--bg-subtle)',
              border: '1px solid var(--border)',
              borderRadius: 10,
              display: 'grid',
              gap: 10,
            }}
          >
            <div style={{ position: 'relative' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  background: 'var(--card)',
                  padding: '8px 10px',
                }}
              >
                <Search size={14} color="var(--muted)" />
                <input
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setSelected(null);
                    setOpenResults(true);
                  }}
                  onFocus={() => setOpenResults(true)}
                  onBlur={() => {
                    window.setTimeout(() => setOpenResults(false), 120);
                  }}
                  placeholder={optionsLoading ? 'Componenten laden...' : 'Zoek component op naam of type...'}
                  style={{
                    width: '100%',
                    border: 'none',
                    outline: 'none',
                    background: 'transparent',
                    color: 'var(--text)',
                    fontSize: 14,
                  }}
                  disabled={optionsLoading || submitting}
                />
              </div>

              {openResults && (filteredOptions.length > 0 || query.trim().length > 1) && (
                <div
                  style={{
                    position: 'absolute',
                    zIndex: 20,
                    top: 'calc(100% + 6px)',
                    left: 0,
                    right: 0,
                    background: 'var(--card)',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    maxHeight: 260,
                    overflowY: 'auto',
                  }}
                >
                  {filteredOptions.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setSelected(opt);
                        setQuery(opt.name);
                        setUnit(UNITS.includes(opt.base_unit as (typeof UNITS)[number]) ? opt.base_unit : 'stuk');
                        setOpenResults(false);
                      }}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        padding: '10px 12px',
                        background: selected?.id === opt.id ? 'var(--bg-subtle)' : 'var(--card)',
                        border: 'none',
                        borderBottom: '1px solid var(--border)',
                        color: 'var(--text)',
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                        <span style={{ fontWeight: 600, minWidth: 0 }}>{opt.name}</span>
                        {/* De prijs stond hier niet, dus je koos blind een
                            bouwsteen en zag de kostprijs pas ná het koppelen. */}
                        <span style={{ fontSize: 12, color: 'var(--muted)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                          {opt.base_cost_cents > 0 ? fmtEuroFromCents(opt.base_cost_cents) : 'geen prijs'}
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                        {typeLabel(opt.type)} · basis {opt.base_quantity} {opt.base_unit}
                      </div>
                    </button>
                  ))}

                  {/* Deze picker doorzoekt je eigen bouwstenen. De duizenden
                      producten uit je prijslijsten zitten op
                      /gerechten/uit-catalogus, en dat pad was vanuit dit scherm
                      nergens zichtbaar — terwijl inkoop juist bij de groothandel
                      begint. */}
                  {query.trim().length > 1 && filteredOptions.length < 3 && (
                    <Link
                      href="/gerechten/uit-catalogus"
                      style={{
                        display: 'block', padding: '10px 12px', fontSize: 12,
                        color: 'var(--muted)', textDecoration: 'none',
                        background: 'var(--bg-subtle)',
                      }}
                    >
                      {filteredOptions.length === 0 && `Geen bouwsteen "${query.trim()}" gevonden. `}
                      <span style={{ color: 'var(--brand)', fontWeight: 600 }}>
                        Zoek in je prijslijsten →
                      </span>
                    </Link>
                  )}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input
                type="number"
                min="0"
                step="0.01"
                value={quantityUsed}
                onChange={(e) => setQuantityUsed(e.target.value)}
                placeholder="Hoeveelheid"
                style={{
                  minWidth: 120,
                  flex: '1 1 120px',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  background: 'var(--card)',
                  color: 'var(--text)',
                  padding: '8px 10px',
                }}
                disabled={submitting}
              />
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                title={selected ? `Deze component staat per ${selected.base_quantity} ${selected.base_unit}` : undefined}
                style={{
                  minWidth: 120,
                  flex: '1 1 120px',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  background: 'var(--card)',
                  color: 'var(--text)',
                  padding: '8px 10px',
                }}
                disabled={submitting}
              >
                {/* Zonder gekozen component: alles. Daarna alleen wat bij de
                    basis-eenheid past — een component per 100 g in "stuks"
                    rekenen kán niet en gaf stil een factor-1000-fout. */}
                {(selected ? compatibleUnits(selected.base_unit) : [...UNITS]).map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn btn-brand btn-sm"
                onClick={handleAdd}
                disabled={submitting || !selected}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <Plus size={14} />
                Toevoegen
              </button>
            </div>

            {formError ? <div style={{ color: 'var(--red, #ef4444)', fontSize: 12 }}>{formError}</div> : null}
            {formSuccess ? <div style={{ color: 'var(--green, #22c55e)', fontSize: 12 }}>{formSuccess}</div> : null}
          </div>
        )}

        <div
          style={{
            marginTop: 2,
            padding: '10px 14px',
            background: 'var(--bg-subtle)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: 14,
          }}
        >
          <span style={{ color: 'var(--muted)' }}>Totaal</span>
          <strong style={{ color: 'var(--text)' }}>{fmtEuroFromCents(totalCents)} kostprijs</strong>
        </div>
      </div>
    </div>
  );
}
