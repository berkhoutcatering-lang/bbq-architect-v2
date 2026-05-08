'use client';

import { useEffect, useState } from 'react';
import { X, Calendar, Clock, Trash2 } from 'lucide-react';
import type { AgendaPersonal } from '@/types/database.types';
import type { InsertArgs } from './useAgendaPersonal';

const COLOR_OPTIONS = [
  { value: '#888888', label: 'Grijs' },
  { value: '#a78bfa', label: 'Paars' },
  { value: '#10b981', label: 'Groen' },
  { value: '#60a5fa', label: 'Blauw' },
  { value: '#ef6c4d', label: 'Oranje' },
  { value: '#FFBF00', label: 'Goud' },
];

interface Props {
  open: boolean;
  initialDate?: string;
  /** Bij edit: bestaande row wordt voorgevuld; bij create: undefined. */
  editing?: AgendaPersonal | null;
  onClose: () => void;
  onSave: (args: InsertArgs) => Promise<void>;
  onDelete?: () => Promise<void>;
}

export default function PersonalEventModal({ open, initialDate, editing, onClose, onSave, onDelete }: Props) {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('');
  const [notes, setNotes] = useState('');
  const [color, setColor] = useState('#888888');
  const [busy, setBusy] = useState(false);

  /* Voorvullen bij open. Gebruik editing-row indien meegegeven, anders initialDate
     (klik op lege dag-cel) of vandaag als laatste fallback. */
  useEffect(() => {
    if (!open) return;
    if (editing) {
      setTitle(editing.title || '');
      setDate(editing.date);
      setStartTime((editing.start_time || '09:00').slice(0, 5));
      setEndTime(editing.end_time ? editing.end_time.slice(0, 5) : '');
      setNotes(editing.notes || '');
      setColor(editing.color || '#888888');
    } else {
      setTitle('');
      setDate(initialDate || new Date().toISOString().slice(0, 10));
      setStartTime('09:00');
      setEndTime('');
      setNotes('');
      setColor('#888888');
    }
  }, [open, editing, initialDate]);

  if (!open) return null;

  async function handleSave() {
    if (!title.trim() || !date) return;
    setBusy(true);
    await onSave({
      title: title.trim(),
      date,
      start_time: startTime,
      end_time: endTime || null,
      notes: notes.trim() || null,
      color,
    });
    setBusy(false);
    onClose();
  }

  async function handleDelete() {
    if (!onDelete) return;
    if (!confirm('Deze afspraak verwijderen?')) return;
    setBusy(true);
    await onDelete();
    setBusy(false);
    onClose();
  }

  return (
    <>
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(4px)', zIndex: 9998,
      }} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        width: 'min(440px, calc(100vw - 32px))', maxHeight: '90dvh', overflowY: 'auto',
        background: 'var(--color-bg-elevated)', border: '1px solid var(--border)',
        borderRadius: 16, zIndex: 9999, padding: 24, boxShadow: '0 30px 60px rgba(0,0,0,.5)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 10, letterSpacing: '.18em', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>
              {editing ? 'Afspraak bewerken' : 'Nieuwe afspraak'}
            </div>
            <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 22, fontWeight: 300, color: 'var(--text)' }}>
              Persoonlijk
            </div>
          </div>
          <button onClick={onClose} aria-label="Sluiten" style={{
            width: 32, height: 32, borderRadius: 8, background: 'transparent', border: '1px solid var(--border)',
            color: 'var(--muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <X size={16} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Field label="Titel">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Bv. Voetbal Tygo, Bioscoop, Tandarts..."
              autoFocus
              style={inputStyle}
            />
          </Field>

          <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr 1fr', gap: 10 }}>
            <Field label="Datum" Icon={Calendar}>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inputStyle} />
            </Field>
            <Field label="Vanaf" Icon={Clock}>
              <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} style={inputStyle} />
            </Field>
            <Field label="Tot">
              <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} placeholder="—" style={inputStyle} />
            </Field>
          </div>

          <Field label="Kleur">
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {COLOR_OPTIONS.map(c => (
                <button
                  key={c.value}
                  onClick={() => setColor(c.value)}
                  title={c.label}
                  style={{
                    width: 28, height: 28, borderRadius: 8, background: c.value,
                    border: color === c.value ? '2px solid var(--text)' : '2px solid transparent',
                    cursor: 'pointer', boxShadow: color === c.value ? `0 0 0 2px ${c.value}55` : 'none',
                  }}
                />
              ))}
            </div>
          </Field>

          <Field label="Notitie (optioneel)">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Locatie, bijzonderheden..."
              style={{ ...inputStyle, resize: 'vertical', minHeight: 70, fontFamily: 'inherit' }}
            />
          </Field>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 22, justifyContent: 'space-between', alignItems: 'center' }}>
          {editing && onDelete ? (
            <button
              onClick={handleDelete}
              disabled={busy}
              className="btn btn-ghost"
              style={{ color: 'var(--red)', display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <Trash2 size={14} /> Verwijderen
            </button>
          ) : <span />}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onClose} disabled={busy} className="btn btn-ghost">Annuleer</button>
            <button onClick={handleSave} disabled={busy || !title.trim()} className="btn btn-brand">
              {busy ? 'Opslaan…' : editing ? 'Opslaan' : 'Toevoegen'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function Field({ label, Icon, children }: { label: string; Icon?: React.ComponentType<{ size?: number; style?: React.CSSProperties }>; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontSize: 10, letterSpacing: '.15em', color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6 }}>
        {Icon && <Icon size={11} />}
        {label}
      </span>
      {children}
    </label>
  );
}

const inputStyle: React.CSSProperties = {
  background: 'rgba(0,0,0,.3)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  padding: '9px 12px',
  color: 'var(--text)',
  fontSize: 13,
  width: '100%',
  outline: 'none',
};
