'use client';

import { useEffect, useState } from 'react';
import { Save, Trash2, X } from 'lucide-react';
import type { Personeel, PersoneelContract, PersoneelFunctie } from '@/types';

const FUNCTIES: PersoneelFunctie[] = ['Pitmaster', 'Sous-chef', 'Grill', 'Service', 'Bar', 'Crew'];
const CONTRACTEN: { value: PersoneelContract; label: string }[] = [
  { value: 'vast', label: 'Vast contract' },
  { value: 'oproep', label: 'Oproepkracht' },
  { value: 'freelance', label: 'Freelance / ZZP' },
  { value: 'stagiair', label: 'Stagiair' },
];

type Mode = 'closed' | 'new' | 'edit';

interface Props {
  mode: Mode;
  initial: Personeel | null;
  onClose: () => void;
  onSave: (data: Partial<Personeel>) => Promise<void>;
  onDelete?: () => Promise<void>;
}

export default function PersoneelDrawer({ mode, initial, onClose, onSave, onDelete }: Props) {
  const isOpen = mode !== 'closed';
  const [form, setForm] = useState<Partial<Personeel>>({});
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(function () {
    if (mode === 'new') {
      setForm({
        naam: '',
        email: '',
        telefoon: '',
        functie: 'Crew',
        uurtarief: 24,
        contract_type: 'oproep',
        actief: true,
        notitie: '',
      });
    } else if (mode === 'edit' && initial) {
      setForm({ ...initial });
    }
    setErrors({});
  }, [mode, initial]);

  if (!isOpen) return null;

  function setField<K extends keyof Personeel>(key: K, val: Personeel[K]) {
    setForm(function (f) { return { ...f, [key]: val }; });
    if (errors[key as string]) {
      setErrors(function (e) { const n = { ...e }; delete n[key as string]; return n; });
    }
  }

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!form.naam || !form.naam.trim()) e.naam = 'Vul een naam in';
    if (form.uurtarief === undefined || form.uurtarief < 0) e.uurtarief = 'Tarief moet ≥ 0';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleSave() {
    if (!validate()) return;
    setSaving(true);
    onSave(form).then(function () { setSaving(false); }).catch(function () { setSaving(false); });
  }

  return (
    <>
      {/* scrim */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,.6)',
          backdropFilter: 'blur(4px)',
          zIndex: 9000,
          animation: 'fadeIn .2s ease',
        }}
      />
      {/* drawer */}
      <aside
        role="dialog"
        aria-label={mode === 'new' ? 'Nieuw crew-lid' : 'Crew-lid bewerken'}
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: 'min(440px, 100vw)',
          background: 'var(--panel)',
          borderLeft: '1px solid var(--border)',
          zIndex: 9001,
          display: 'flex',
          flexDirection: 'column',
          animation: 'slideInRight .25s cubic-bezier(.16,1,.3,1)',
        }}
      >
        {/* header */}
        <header style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.2em', marginBottom: 2 }}>
              {mode === 'new' ? 'Nieuw' : 'Bewerken'}
            </div>
            <h2 style={{ margin: 0, fontSize: 18, fontFamily: 'var(--font-display)', fontWeight: 400 }}>
              {mode === 'new' ? 'Crew-lid toevoegen' : (initial?.naam || 'Crew-lid')}
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Sluiten"
            style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: 8, borderRadius: 8, minWidth: 44, minHeight: 44 }}
          >
            <X size={18} />
          </button>
        </header>

        {/* body */}
        <div style={{ padding: 20, overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Field label="Naam" required error={errors.naam}>
            <input
              className="input"
              type="text"
              value={form.naam ?? ''}
              onChange={function (e) { setField('naam', e.target.value); }}
              placeholder="Bijv. Lars de Boer"
              autoFocus
            />
          </Field>

          <Field label="Functie">
            <select
              className="input"
              value={form.functie ?? 'Crew'}
              onChange={function (e) { setField('functie', e.target.value as PersoneelFunctie); }}
            >
              {FUNCTIES.map(function (f) { return <option key={f} value={f}>{f}</option>; })}
            </select>
          </Field>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Uurtarief (€)" error={errors.uurtarief}>
              <input
                className="input"
                type="number"
                step="0.50"
                min="0"
                value={form.uurtarief ?? 0}
                onChange={function (e) { setField('uurtarief', parseFloat(e.target.value) || 0); }}
              />
            </Field>

            <Field label="Contract">
              <select
                className="input"
                value={form.contract_type ?? 'oproep'}
                onChange={function (e) { setField('contract_type', e.target.value as PersoneelContract); }}
              >
                {CONTRACTEN.map(function (c) { return <option key={c.value} value={c.value}>{c.label}</option>; })}
              </select>
            </Field>
          </div>

          <Field label="Email">
            <input
              className="input"
              type="email"
              value={form.email ?? ''}
              onChange={function (e) { setField('email', e.target.value); }}
              placeholder="naam@voorbeeld.nl"
            />
          </Field>

          <Field label="Telefoon">
            <input
              className="input"
              type="tel"
              value={form.telefoon ?? ''}
              onChange={function (e) { setField('telefoon', e.target.value); }}
              placeholder="06 12345678"
            />
          </Field>

          <Field label="Notitie">
            <textarea
              className="input"
              rows={3}
              value={form.notitie ?? ''}
              onChange={function (e) { setField('notitie', e.target.value); }}
              placeholder="Allergieën, beschikbaarheid, voorkeur…"
              style={{ resize: 'vertical', fontFamily: 'inherit' }}
            />
          </Field>

          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '8px 0' }}>
            <input
              type="checkbox"
              checked={form.actief ?? true}
              onChange={function (e) { setField('actief', e.target.checked); }}
              style={{ width: 18, height: 18, accentColor: 'var(--brand)' }}
            />
            <span style={{ fontSize: 14 }}>Actief — verschijnt in CrewBlock</span>
          </label>
        </div>

        {/* footer */}
        <footer style={{ padding: 16, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          {mode === 'edit' && onDelete ? (
            <button
              type="button"
              onClick={onDelete}
              className="btn btn-ghost"
              style={{ color: 'var(--red)', minHeight: 44 }}
            >
              <Trash2 size={14} /> Verwijderen
            </button>
          ) : <span />}
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={onClose} className="btn btn-ghost" style={{ minHeight: 44 }}>
              Annuleren
            </button>
            <button type="button" onClick={handleSave} disabled={saving} className="btn btn-brand" style={{ minHeight: 44 }}>
              <Save size={14} /> {saving ? 'Opslaan…' : 'Opslaan'}
            </button>
          </div>
        </footer>
      </aside>
    </>
  );
}

function Field({ label, required, error, children }: { label: string; required?: boolean; error?: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.15em', fontWeight: 600 }}>
        {label}{required && <span style={{ color: 'var(--red)' }}> *</span>}
      </span>
      {children}
      {error && <span style={{ fontSize: 12, color: 'var(--red)' }}>{error}</span>}
    </label>
  );
}
