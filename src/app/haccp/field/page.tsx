'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Check, Minus, Plus, Thermometer } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useOrg } from '@/lib/OrgContext';

/**
 * SF-3 — HACCP Field Mode
 *
 * Tablet/handschoen-vriendelijke variant van de HACCP-pagina.
 * Doel: temperatuur loggen in ≤3 taps, alle targets ≥ 56px.
 *
 * Niet bedoeld als vervanging van /haccp (volledige module),
 * maar als snelle invoer-modus voor de keuken-tablet.
 */

const PRESETS = [
  { label: 'Kip', wat: 'Kip', defaultTemp: 4 },
  { label: 'Vis', wat: 'Vis', defaultTemp: 2 },
  { label: 'Rundvlees', wat: 'Rundvlees', defaultTemp: 4 },
  { label: 'Varkensvlees', wat: 'Varkensvlees', defaultTemp: 4 },
  { label: 'Salade', wat: 'Salade', defaultTemp: 5 },
  { label: 'Dessert', wat: 'Dessert', defaultTemp: 4 },
  { label: 'Anders', wat: '', defaultTemp: 4 },
];

const CHECK_TYPES = [
  { id: 'koeling', label: 'Koeling', range: [-2, 7] },
  { id: 'vriezer', label: 'Vriezer', range: [-30, -15] },
  { id: 'kerntemp', label: 'Kerntemp', range: [55, 80] },
  { id: 'serveer', label: 'Serveren', range: [55, 75] },
];

export default function HaccpFieldPage() {
  const { orgId } = useOrg();
  const [presetIdx, setPresetIdx] = useState<number | null>(null);
  const [customWat, setCustomWat] = useState('');
  const [temp, setTemp] = useState<number>(4);
  const [checkType, setCheckType] = useState<string>('koeling');
  const [chef, setChef] = useState('');
  const [notitie, setNotitie] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [recent, setRecent] = useState<{ id: number; wat: string; temp: number; tijd: string }[]>([]);

  // Load recent logs (last 5)
  useEffect(function () {
    if (!orgId || !supabase) return;
    supabase
      .from('haccp_records')
      .select('id,wat,temp,tijd,datum')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false })
      .limit(5)
      .then(function (res) {
        if (res.data) setRecent(res.data);
      });
  }, [orgId, savedAt]);

  function selectPreset(i: number) {
    setPresetIdx(i);
    const p = PRESETS[i];
    if (p.wat) setCustomWat('');
    setTemp(p.defaultTemp);
  }

  function adjustTemp(delta: number) {
    setTemp(function (t) {
      const next = +(t + delta).toFixed(1);
      return Math.max(-30, Math.min(99, next));
    });
  }

  async function handleSave() {
    if (!orgId || !supabase) return;
    const watFinal = (presetIdx !== null && PRESETS[presetIdx].wat) || customWat.trim();
    if (!watFinal) {
      alert('Kies een preset of vul een productnaam in');
      return;
    }

    const sel = CHECK_TYPES.find(function (c) { return c.id === checkType; });
    const inRange = sel ? temp >= sel.range[0] && temp <= sel.range[1] : true;

    setSaving(true);
    const now = new Date();
    const { error } = await supabase.from('haccp_records').insert({
      organization_id: orgId,
      datum: now.toISOString().slice(0, 10),
      tijd: now.toTimeString().slice(0, 5),
      wat: watFinal,
      temp,
      type: 'temperatuur',
      check_type: checkType,
      chef: chef || null,
      notitie: notitie || null,
      status: inRange ? 'ok' : 'afwijking',
      auto_logged: false,
    });
    setSaving(false);
    if (error) {
      alert('Opslaan mislukt: ' + error.message);
      return;
    }
    setSavedAt(now.toISOString());
    // reset minimal velden — chef en preset blijven om snel volgend log te doen
    setNotitie('');
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg-primary)] text-[var(--text)] p-4 md:p-8">
      {/* Header */}
      <div className="max-w-[900px] mx-auto flex items-center justify-between mb-6">
        <Link href="/haccp" className="inline-flex items-center gap-2 px-4 py-3 rounded-lg text-[14px] text-[var(--muted)] hover:text-[var(--text)] no-underline" style={{ minHeight: 56 }}>
          <ArrowLeft className="w-5 h-5" />
          Terug
        </Link>
        <div className="text-right">
          <div className="text-[18px] font-bold">HACCP — Veldmodus</div>
          <div className="text-[12px] text-[var(--muted)]">Snelle temperatuur-logging</div>
        </div>
      </div>

      <div className="max-w-[900px] mx-auto grid md:grid-cols-[1fr_320px] gap-6">
        {/* Hoofd-formulier */}
        <div className="rounded-2xl border border-[var(--card-solid)] bg-[var(--card)] p-5 md:p-7">
          {/* Stap 1: chef */}
          <label className="block text-[12px] uppercase tracking-[0.15em] text-[var(--muted)] mb-2">Chef (optioneel)</label>
          <input
            type="text"
            value={chef}
            onChange={function (e) { setChef(e.target.value); }}
            placeholder="Bv. Bas"
            className="w-full px-4 mb-6 rounded-lg bg-[var(--color-bg-deep)] border border-[var(--card-solid)] text-[var(--text)] text-[16px]"
            style={{ minHeight: 56 }}
          />

          {/* Stap 2: preset */}
          <label className="block text-[12px] uppercase tracking-[0.15em] text-[var(--muted)] mb-3">Wat meet je?</label>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
            {PRESETS.map(function (p, i) {
              const active = presetIdx === i;
              return (
                <button
                  key={p.label}
                  onClick={function () { selectPreset(i); }}
                  className={`rounded-xl text-[15px] font-bold transition-all ${active ? 'bg-[var(--color-accent-gold)] text-black border-2 border-[var(--color-accent-gold)]' : 'bg-[var(--color-bg-deep)] text-[var(--text)] border-2 border-[var(--card-solid)] hover:border-[var(--color-accent-gold)]/50'}`}
                  style={{ minHeight: 64 }}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
          {presetIdx !== null && !PRESETS[presetIdx].wat && (
            <input
              type="text"
              value={customWat}
              onChange={function (e) { setCustomWat(e.target.value); }}
              placeholder="Naam product..."
              className="w-full px-4 mb-6 rounded-lg bg-[var(--color-bg-deep)] border border-[var(--card-solid)] text-[var(--text)] text-[16px]"
              style={{ minHeight: 56 }}
              autoFocus
            />
          )}

          {/* Stap 3: check type */}
          <label className="block mt-6 text-[12px] uppercase tracking-[0.15em] text-[var(--muted)] mb-3">Type meting</label>
          <div className="grid grid-cols-2 gap-2 mb-6">
            {CHECK_TYPES.map(function (c) {
              const active = checkType === c.id;
              return (
                <button
                  key={c.id}
                  onClick={function () { setCheckType(c.id); }}
                  className={`rounded-lg text-[13px] font-medium transition-all ${active ? 'bg-[var(--color-accent-gold)]/15 text-[var(--color-accent-gold)] border-2 border-[var(--color-accent-gold)]' : 'bg-[var(--color-bg-deep)] text-[var(--text)] border-2 border-[var(--card-solid)]'}`}
                  style={{ minHeight: 56 }}
                >
                  <div className="font-bold">{c.label}</div>
                  <div className="text-[10px] opacity-70">{c.range[0]}°C – {c.range[1]}°C</div>
                </button>
              );
            })}
          </div>

          {/* Stap 4: temperatuur */}
          <label className="block text-[12px] uppercase tracking-[0.15em] text-[var(--muted)] mb-3">Temperatuur</label>
          <div className="flex items-center justify-center gap-3 mb-6">
            <button
              onClick={function () { adjustTemp(-5); }}
              className="rounded-xl bg-[var(--color-bg-deep)] border-2 border-[var(--card-solid)] text-[var(--text)] text-[18px] font-bold hover:border-red-500/50"
              style={{ minWidth: 72, minHeight: 72 }}
            >
              -5
            </button>
            <button
              onClick={function () { adjustTemp(-1); }}
              className="rounded-xl bg-[var(--color-bg-deep)] border-2 border-[var(--card-solid)] text-[var(--text)] hover:border-red-500/50"
              style={{ minWidth: 72, minHeight: 72 }}
            >
              <Minus className="w-6 h-6 mx-auto" />
            </button>
            <div className="flex-1 text-center px-4 py-5 rounded-xl bg-[var(--color-accent-gold)]/8 border-2 border-[var(--color-accent-gold)]/40">
              <div className="text-[44px] font-extralight text-[var(--text)] tabular-nums leading-none">
                {temp.toFixed(1)}<span className="text-[24px] text-[var(--muted)]">°C</span>
              </div>
            </div>
            <button
              onClick={function () { adjustTemp(1); }}
              className="rounded-xl bg-[var(--color-bg-deep)] border-2 border-[var(--card-solid)] text-[var(--text)] hover:border-emerald-500/50"
              style={{ minWidth: 72, minHeight: 72 }}
            >
              <Plus className="w-6 h-6 mx-auto" />
            </button>
            <button
              onClick={function () { adjustTemp(5); }}
              className="rounded-xl bg-[var(--color-bg-deep)] border-2 border-[var(--card-solid)] text-[var(--text)] text-[18px] font-bold hover:border-emerald-500/50"
              style={{ minWidth: 72, minHeight: 72 }}
            >
              +5
            </button>
          </div>

          {/* Notitie (optioneel) */}
          <label className="block text-[12px] uppercase tracking-[0.15em] text-[var(--muted)] mb-2">Notitie (optioneel)</label>
          <textarea
            value={notitie}
            onChange={function (e) { setNotitie(e.target.value); }}
            placeholder="Bv. afwijking opgemerkt, container vervangen..."
            className="w-full px-4 py-3 mb-6 rounded-lg bg-[var(--color-bg-deep)] border border-[var(--card-solid)] text-[var(--text)] text-[14px]"
            rows={2}
          />

          {/* Save button */}
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full rounded-xl bg-[var(--color-accent-gold)] text-black font-bold text-[16px] flex items-center justify-center gap-2 disabled:opacity-40"
            style={{ minHeight: 72 }}
          >
            <Thermometer className="w-5 h-5" />
            {saving ? 'Opslaan...' : 'LOG TEMPERATUUR'}
          </button>

          {savedAt && (
            <div className="mt-4 flex items-center gap-2 text-[13px] text-emerald-400">
              <Check className="w-4 h-4" />
              Opgeslagen om {new Date(savedAt).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}
            </div>
          )}
        </div>

        {/* Recent logs sidebar */}
        <div className="rounded-2xl border border-[var(--card-solid)] bg-[var(--card)] p-5 h-fit">
          <div className="text-[12px] uppercase tracking-[0.15em] font-bold text-[var(--muted)] mb-4">Laatste 5 logs</div>
          {recent.length === 0 ? (
            <div className="text-[12px] text-[var(--muted)] italic">Nog geen logs vandaag.</div>
          ) : (
            <div className="flex flex-col gap-3">
              {recent.map(function (r) {
                return (
                  <div key={r.id} className="rounded-lg bg-[var(--color-bg-deep)] p-3">
                    <div className="text-[14px] font-bold text-[var(--text)]">{r.wat}</div>
                    <div className="text-[18px] text-[var(--color-accent-gold)] font-light tabular-nums">{r.temp}°C</div>
                    <div className="text-[11px] text-[var(--muted)]">{r.tijd}</div>
                  </div>
                );
              })}
            </div>
          )}
          <Link
            href="/haccp"
            className="mt-4 block text-center text-[12px] text-[var(--color-accent-gold)] hover:brightness-110 no-underline"
          >
            Volledige HACCP-module →
          </Link>
        </div>
      </div>
    </div>
  );
}
