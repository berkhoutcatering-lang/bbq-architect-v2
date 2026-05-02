'use client';
import { useMemo, useState } from 'react';
import {
  Car,
  Plus,
  FileDown,
  Send,
  Briefcase,
  User,
  Sparkles,
} from 'lucide-react';
import { useSupabase } from '@/lib/useSupabase';
import { bedragAftrekbaar, kwartaalRange, huidigKwartaal } from '@/lib/ritten-tarieven';
import { VoertuigDialog } from './VoertuigDialog';
import { RitDialog } from './RitDialog';
import { RecapDialog } from './RecapDialog';
import type { DbVoertuig, DbRit } from '@/types/database.types';

type Periode = 'Q1' | 'Q2' | 'Q3' | 'Q4' | 'YTD';

function fmtNum(n: number): string {
  return n.toLocaleString('nl-NL');
}
function fmtEUR(n: number): string {
  return n.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function ReizenTab() {
  const { data: voertuigen, loading: voertuigenLoading } = useSupabase<DbVoertuig>('voertuigen', []);
  const { data: ritten, loading: rittenLoading } = useSupabase<DbRit>('ritten', []);

  const [voertuigDialogOpen, setVoertuigDialogOpen] = useState(false);
  const [ritDialogOpen, setRitDialogOpen] = useState(false);
  const [recapDialogOpen, setRecapDialogOpen] = useState(false);
  const [editVoertuig, setEditVoertuig] = useState<DbVoertuig | null>(null);
  const [editRit, setEditRit] = useState<DbRit | null>(null);
  const [periode, setPeriode] = useState<Periode>(`Q${huidigKwartaal()}` as Periode);
  const [voertuigFilter, setVoertuigFilter] = useState<number | 'alle'>('alle');
  const [typeFilter, setTypeFilter] = useState<'alle' | 'zakelijk' | 'prive'>('alle');
  const [pushBusy, setPushBusy] = useState(false);
  const [pushHint, setPushHint] = useState<string | null>(null);

  const huidigJaar = new Date().getFullYear();

  const periodeRange = useMemo(() => {
    if (periode === 'YTD') {
      return { start: `${huidigJaar}-01-01`, eind: `${huidigJaar}-12-31` };
    }
    const q = parseInt(periode.slice(1), 10) as 1 | 2 | 3 | 4;
    return kwartaalRange(huidigJaar, q);
  }, [periode, huidigJaar]);

  const filteredRitten = useMemo(() => {
    return ritten.filter((r) => {
      if (r.datum < periodeRange.start || r.datum > periodeRange.eind) return false;
      if (voertuigFilter !== 'alle' && r.voertuig_id !== voertuigFilter) return false;
      if (typeFilter === 'zakelijk' && !r.zakelijk) return false;
      if (typeFilter === 'prive' && r.zakelijk) return false;
      return true;
    });
  }, [ritten, periodeRange, voertuigFilter, typeFilter]);

  const stats = useMemo(() => {
    const zakelijk = filteredRitten.filter((r) => r.zakelijk);
    const prive = filteredRitten.filter((r) => !r.zakelijk);
    const zakelijkKm = zakelijk.reduce(
      (sum, r) => sum + r.kilometers - (r.prive_omleiding_km ?? 0),
      0,
    );
    const priveKm =
      prive.reduce((sum, r) => sum + r.kilometers, 0) +
      zakelijk.reduce((sum, r) => sum + (r.prive_omleiding_km ?? 0), 0);
    const aftrekbaar = zakelijk.reduce(
      (sum, r) =>
        sum +
        bedragAftrekbaar({
          kilometers: r.kilometers,
          zakelijk: r.zakelijk,
          priveOmleidingKm: r.prive_omleiding_km,
          datum: r.datum,
        }),
      0,
    );
    const ytdAftrekbaar = ritten
      .filter((r) => r.datum.startsWith(String(huidigJaar)) && r.zakelijk)
      .reduce(
        (sum, r) =>
          sum +
          bedragAftrekbaar({
            kilometers: r.kilometers,
            zakelijk: r.zakelijk,
            priveOmleidingKm: r.prive_omleiding_km,
            datum: r.datum,
          }),
        0,
      );
    return { zakelijkKm, priveKm, aftrekbaar, ytdAftrekbaar };
  }, [filteredRitten, ritten, huidigJaar]);

  async function pushNaarMoneybird() {
    if (periode === 'YTD') return;
    const kwartaal = parseInt(periode.slice(1), 10) as 1 | 2 | 3 | 4;
    if (!confirm(
      `Push Q${kwartaal} ${huidigJaar} naar Moneybird?\n\n` +
        `Dit maakt een purchase-invoice "Reiskosten Q${kwartaal} ${huidigJaar}" aan voor € ${fmtEUR(stats.aftrekbaar)} (${stats.zakelijkKm} zakelijke km).\n\n` +
        `Eenmalig per kwartaal — kan niet ongedaan worden zonder eerst in Moneybird te verwijderen.`,
    ))
      return;
    setPushBusy(true);
    setPushHint(null);
    try {
      const res = await fetch('/api/ritten/moneybird-push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jaar: huidigJaar, kwartaal }),
      });
      const body = await res.json();
      if (!res.ok) {
        setPushHint(body.error ?? 'Onbekende fout');
        return;
      }
      setPushHint(
        `✓ Gepusht: Moneybird invoice ${body.moneybird_invoice_id} · ${body.totaal_km} km · € ${body.totaal_bedrag}`,
      );
    } finally {
      setPushBusy(false);
    }
  }

  if (voertuigenLoading || rittenLoading) {
    return (
      <div className="space-y-3">
        <div className="h-32 rounded-lg animate-pulse" style={{ background: 'var(--bg-soft, #eee)' }} />
        <div className="h-12 rounded-lg animate-pulse" style={{ background: 'var(--bg-soft, #eee)' }} />
        <div className="h-96 rounded-lg animate-pulse" style={{ background: 'var(--bg-soft, #eee)' }} />
      </div>
    );
  }

  if (voertuigen.length === 0) {
    return (
      <div
        className="p-8 md:p-12 rounded-lg border text-center"
        style={{ background: 'var(--card, #fff)', borderColor: 'var(--border, #e5e5e5)' }}
      >
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
          style={{
            background: 'color-mix(in srgb, var(--color-accent-gold) 15%, transparent)',
          }}
        >
          <Car className="h-8 w-8" style={{ color: 'var(--color-accent-gold, #b59456)' }} />
        </div>
        <h3 className="text-lg font-semibold mb-2">Voeg je eerste voertuig toe</h3>
        <p className="text-sm mb-6 max-w-md mx-auto" style={{ color: 'var(--muted, #888)' }}>
          Om ritten bij te houden voor de Belastingdienst heeft elke rit een voertuig nodig:
          kenteken, merk en ingangsdatum.
        </p>
        <button
          onClick={() => {
            setEditVoertuig(null);
            setVoertuigDialogOpen(true);
          }}
          className="px-4 py-2 rounded-md text-sm font-medium"
          style={{ background: 'var(--brand, #111)', color: 'var(--brand-foreground, #fff)' }}
        >
          <Plus className="inline h-4 w-4 mr-1" />
          Voertuig toevoegen
        </button>
        {voertuigDialogOpen && (
          <VoertuigDialog voertuig={null} onClose={() => setVoertuigDialogOpen(false)} />
        )}
      </div>
    );
  }

  const cardClass = 'rounded-lg border p-4';
  const cardStyle = { background: 'var(--card, #fff)', borderColor: 'var(--border, #e5e5e5)' };

  return (
    <div className="space-y-6">
      {/* Filter-bar */}
      <div className="flex flex-wrap gap-3 items-center">
        <select
          value={periode}
          onChange={(e) => setPeriode(e.target.value as Periode)}
          className="rounded-md border px-3 py-1.5 text-sm"
          style={{ background: 'var(--bg, #fff)' }}
        >
          <option value="Q1">Q1 {huidigJaar}</option>
          <option value="Q2">Q2 {huidigJaar}</option>
          <option value="Q3">Q3 {huidigJaar}</option>
          <option value="Q4">Q4 {huidigJaar}</option>
          <option value="YTD">Heel {huidigJaar}</option>
        </select>
        <select
          value={voertuigFilter}
          onChange={(e) =>
            setVoertuigFilter(e.target.value === 'alle' ? 'alle' : Number(e.target.value))
          }
          className="rounded-md border px-3 py-1.5 text-sm"
          style={{ background: 'var(--bg, #fff)' }}
        >
          <option value="alle">Alle voertuigen</option>
          {voertuigen.map((v) => (
            <option key={v.id} value={v.id}>
              {v.kenteken} · {v.merk}
            </option>
          ))}
        </select>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)}
          className="rounded-md border px-3 py-1.5 text-sm"
          style={{ background: 'var(--bg, #fff)' }}
        >
          <option value="alle">Zakelijk + privé</option>
          <option value="zakelijk">Alleen zakelijk</option>
          <option value="prive">Alleen privé</option>
        </select>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className={cardClass} style={cardStyle}>
          <div className="text-xs uppercase tracking-wide" style={{ color: 'var(--muted, #888)' }}>
            Zakelijk km
          </div>
          <div className="text-2xl font-semibold tabular-nums mt-1">{fmtNum(stats.zakelijkKm)}</div>
        </div>
        <div className={cardClass} style={cardStyle}>
          <div className="text-xs uppercase tracking-wide" style={{ color: 'var(--muted, #888)' }}>
            Privé km
          </div>
          <div className="text-2xl font-semibold tabular-nums mt-1">{fmtNum(stats.priveKm)}</div>
        </div>
        <div
          className={cardClass}
          style={{
            ...cardStyle,
            borderColor: 'color-mix(in srgb, var(--color-accent-gold) 30%, transparent)',
          }}
        >
          <div className="text-xs uppercase tracking-wide" style={{ color: 'var(--muted, #888)' }}>
            Aftrekbaar dit kwartaal
          </div>
          <div className="text-2xl font-semibold tabular-nums mt-1">€ {fmtEUR(stats.aftrekbaar)}</div>
        </div>
        <div className={cardClass} style={cardStyle}>
          <div className="text-xs uppercase tracking-wide" style={{ color: 'var(--muted, #888)' }}>
            YTD {huidigJaar}
          </div>
          <div className="text-2xl font-semibold tabular-nums mt-1">€ {fmtEUR(stats.ytdAftrekbaar)}</div>
        </div>
      </div>

      {/* Voertuigen-strip */}
      <div className="flex flex-wrap gap-2 items-center">
        {voertuigen
          .filter((v) => v.actief)
          .map((v) => (
            <button
              key={v.id}
              onClick={() => setVoertuigFilter(voertuigFilter === v.id ? 'alle' : v.id)}
              className="px-3 py-1.5 rounded-full text-sm border transition-colors"
              style={{
                background:
                  voertuigFilter === v.id ? 'var(--brand, #111)' : 'var(--card, #fff)',
                color:
                  voertuigFilter === v.id ? 'var(--brand-foreground, #fff)' : 'var(--text, #333)',
                borderColor: 'var(--border, #e5e5e5)',
              }}
            >
              <span className="font-mono">{v.kenteken}</span> · {v.merk ?? '—'}
            </button>
          ))}
        <button
          onClick={() => {
            setEditVoertuig(null);
            setVoertuigDialogOpen(true);
          }}
          className="px-3 py-1.5 rounded-full text-sm border border-dashed hover:bg-muted"
          style={{ borderColor: 'var(--border, #e5e5e5)' }}
        >
          <Plus className="inline h-3 w-3 mr-1" /> Voertuig
        </button>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap gap-2 justify-between items-center">
        <button
          onClick={() => {
            setEditRit(null);
            setRitDialogOpen(true);
          }}
          className="px-4 py-2 rounded-md text-sm font-medium"
          style={{ background: 'var(--brand, #111)', color: 'var(--brand-foreground, #fff)' }}
        >
          <Plus className="inline h-4 w-4 mr-1" /> Rit toevoegen
        </button>
        <div className="flex flex-wrap gap-2">
          <a
            href={`/api/ritten/export?start=${periodeRange.start}&eind=${periodeRange.eind}`}
            className="px-3 py-2 rounded-md border text-sm hover:bg-muted"
          >
            <FileDown className="inline h-4 w-4 mr-1" /> Exporteer CSV
          </a>
          <button
            onClick={() => setRecapDialogOpen(true)}
            disabled={periode === 'YTD'}
            className="px-3 py-2 rounded-md border text-sm hover:bg-muted disabled:opacity-50"
          >
            <Sparkles className="inline h-4 w-4 mr-1" /> AI-recap
          </button>
          {periode !== 'YTD' && (
            <button
              onClick={pushNaarMoneybird}
              disabled={pushBusy || stats.zakelijkKm === 0}
              className="px-3 py-2 rounded-md border text-sm hover:bg-muted disabled:opacity-50"
            >
              <Send className="inline h-4 w-4 mr-1" />
              {pushBusy ? 'Pushen…' : `Push ${periode} → Moneybird`}
            </button>
          )}
        </div>
      </div>
      {pushHint && (
        <p
          className="text-sm"
          style={{
            color: pushHint.startsWith('✓')
              ? 'var(--success, #2a8a30)'
              : 'var(--danger, #c00)',
          }}
        >
          {pushHint}
        </p>
      )}

      {/* Tabel */}
      {filteredRitten.length === 0 ? (
        <div
          className="p-6 rounded-lg border text-center"
          style={cardStyle}
        >
          <p className="text-sm" style={{ color: 'var(--muted, #888)' }}>
            Geen ritten in deze periode. Maak handmatig een rit aan, of ga naar Plannen om een rit
            uit een geconfirmd event te genereren.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden" style={cardStyle}>
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead style={{ background: 'var(--bg-soft, #f5f5f5)' }}>
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Datum</th>
                  <th className="px-3 py-2 text-left font-medium">Voertuig</th>
                  <th className="px-3 py-2 text-left font-medium">Van → Naar</th>
                  <th className="px-3 py-2 text-right font-medium">Km</th>
                  <th className="px-3 py-2 text-left font-medium">Doel</th>
                  <th className="px-3 py-2 text-right font-medium">Aftrekbaar</th>
                  <th className="px-3 py-2 text-center font-medium">Type</th>
                </tr>
              </thead>
              <tbody>
                {filteredRitten
                  .slice()
                  .sort((a, b) => b.datum.localeCompare(a.datum))
                  .map((r) => {
                    const v = voertuigen.find((vt) => vt.id === r.voertuig_id);
                    const aftrek = bedragAftrekbaar({
                      kilometers: r.kilometers,
                      zakelijk: r.zakelijk,
                      priveOmleidingKm: r.prive_omleiding_km,
                      datum: r.datum,
                    });
                    return (
                      <tr
                        key={r.id}
                        onClick={() => {
                          setEditRit(r);
                          setRitDialogOpen(true);
                        }}
                        className="border-t cursor-pointer"
                        style={{ borderColor: 'var(--border, #eee)' }}
                      >
                        <td className="px-3 py-2 whitespace-nowrap">{r.datum}</td>
                        <td className="px-3 py-2 font-mono text-xs">{v?.kenteken ?? '—'}</td>
                        <td className="px-3 py-2">
                          <div>{r.vertrek_adres}</div>
                          <div style={{ color: 'var(--muted, #888)' }}>→ {r.aankomst_adres}</div>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{r.kilometers}</td>
                        <td className="px-3 py-2" style={{ color: 'var(--muted, #888)' }}>
                          {r.doel ?? '—'}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {aftrek > 0 ? `€ ${fmtEUR(aftrek)}` : '—'}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {r.zakelijk ? (
                            <Briefcase
                              className="inline h-4 w-4"
                              aria-label="Zakelijk"
                              style={{ color: 'var(--brand, #111)' }}
                            />
                          ) : (
                            <User
                              className="inline h-4 w-4"
                              aria-label="Privé"
                              style={{ color: 'var(--muted, #888)' }}
                            />
                          )}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="text-xs mt-4" style={{ color: 'var(--muted, #888)' }}>
        BBQ Architect biedt sluitende rittenregistratie zonder KRRS-keurmerk. De Belastingdienst
        kan je administratie als bewijs accepteren wanneer alle 7 verplichte velden zijn ingevuld.
        Twijfel? Vraag je boekhouder.
      </p>

      {voertuigDialogOpen && (
        <VoertuigDialog voertuig={editVoertuig} onClose={() => setVoertuigDialogOpen(false)} />
      )}
      {ritDialogOpen && (
        <RitDialog
          rit={editRit}
          voertuigen={voertuigen}
          onClose={() => setRitDialogOpen(false)}
        />
      )}
      {recapDialogOpen && periode !== 'YTD' && (
        <RecapDialog
          jaar={huidigJaar}
          kwartaal={parseInt(periode.slice(1), 10) as 1 | 2 | 3 | 4}
          onClose={() => setRecapDialogOpen(false)}
        />
      )}
    </div>
  );
}
