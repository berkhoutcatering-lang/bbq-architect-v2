'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { ArrowRight, MapPin, FileQuestion } from 'lucide-react';
import type { Rit, Voertuig } from '@/types';
import { fmtKm, fmtEur, fmtDateR, sameDay, categoriseerRit, CAT_BY_ID } from '@/lib/ritten-aggregaties';
import { tariefVoorJaar } from '@/lib/ritten-tarieven';

interface Props {
  ritten: Rit[];
  voertuigen: Voertuig[];
  activeId?: number | null;
}

interface DayGroup {
  date: Date;
  ritten: Rit[];
  totaal: number;
}

export default function RittenTabel({ ritten, voertuigen, activeId }: Props) {
  const groups = useMemo<DayGroup[]>(() => {
    const sorted = [...ritten].sort((a, b) => (a.datum < b.datum ? 1 : -1));
    const out: DayGroup[] = [];
    for (const r of sorted) {
      const d = new Date(r.datum);
      const km = r.kilometers ?? r.km_eind - r.km_begin;
      const last = out[out.length - 1];
      if (last && sameDay(last.date, d)) {
        last.ritten.push(r);
        last.totaal += km;
      } else {
        out.push({ date: d, ritten: [r], totaal: km });
      }
    }
    return out;
  }, [ritten]);

  const voertuigById = useMemo(() => Object.fromEntries(voertuigen.map((v) => [v.id, v])), [voertuigen]);

  if (!ritten.length) {
    return (
      <div className="metal" style={{ padding: 32, textAlign: 'center' }}>
        <FileQuestion size={28} color="var(--muted-light)" />
        <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 12, fontWeight: 500 }}>
          Nog geen ritten in deze periode.
        </div>
        <div style={{ fontSize: 11, color: 'var(--muted-light)', marginTop: 4 }}>
          Voeg een rit toe via &quot;Nieuwe rit&quot; om te beginnen.
        </div>
      </div>
    );
  }

  return (
    <div className="metal" style={{ overflow: 'hidden' }}>
      <div className="metal-head">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <MapPin size={14} color="var(--brand-gold)" />
          <div style={{ fontSize: 13, fontWeight: 600 }}>Ritten</div>
        </div>
        <div style={{ fontSize: 11, color: 'var(--muted)' }}>
          {ritten.length} ritten · {groups.length} dagen
        </div>
      </div>

      <div role="table" aria-label="Rittenlijst">
        {groups.map((g) => (
          <div key={g.date.toISOString()}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '10px 16px',
                background: 'rgba(255,191,0,0.03)',
                borderTop: '1px solid var(--border)',
                borderBottom: '1px solid var(--border)',
                fontSize: 11,
                color: 'var(--muted)',
                fontWeight: 600,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
              }}
            >
              <span>{['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'][g.date.getDay()]} {fmtDateR(g.date)}</span>
              <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtKm(g.totaal)}</span>
            </div>
            {g.ritten.map((r) => {
              const cat = CAT_BY_ID[categoriseerRit(r)];
              const km = r.kilometers ?? r.km_eind - r.km_begin;
              const tarief = tariefVoorJaar(new Date(r.datum).getFullYear());
              const aftrek = r.zakelijk ? Math.max(0, km - r.prive_omleiding_km) * tarief : 0;
              const v = voertuigById[r.voertuig_id];
              const isActive = activeId === r.id;
              return (
                <Link
                  key={r.id}
                  href={`/administratie/rittenregistratie/${r.id}`}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '32px 1fr 110px 110px 28px',
                    alignItems: 'center',
                    gap: 12,
                    padding: '12px 16px',
                    borderTop: '1px solid var(--border)',
                    background: isActive ? 'rgba(255,191,0,0.06)' : 'transparent',
                    color: 'var(--text)',
                    textDecoration: 'none',
                    cursor: 'pointer',
                    transition: 'background .15s',
                  }}
                  className="ritten-row"
                >
                  <span
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: '50%',
                      background: `color-mix(in oklab, ${cat.color} 16%, transparent)`,
                      border: `1px solid color-mix(in oklab, ${cat.color} 40%, transparent)`,
                      display: 'inline-block',
                    }}
                    title={cat.label}
                  />
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 500,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {r.vertrek_adres.split(',')[0]} → {r.aankomst_adres.split(',')[0]}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                      {cat.label} · {v?.kenteken || '?'} {r.doel ? `· ${r.doel}` : ''}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', fontSize: 13, fontVariantNumeric: 'tabular-nums', color: 'var(--text)' }}>
                    {fmtKm(km)}
                  </div>
                  <div
                    style={{
                      textAlign: 'right',
                      fontSize: 13,
                      fontVariantNumeric: 'tabular-nums',
                      color: r.zakelijk ? 'var(--green)' : 'var(--muted)',
                    }}
                  >
                    {r.zakelijk ? fmtEur(aftrek) : '—'}
                  </div>
                  <ArrowRight size={14} color="var(--muted-light)" />
                </Link>
              );
            })}
          </div>
        ))}
      </div>
      <style jsx>{`
        :global(.ritten-row:hover) {
          background: rgba(255, 191, 0, 0.04) !important;
        }
      `}</style>
    </div>
  );
}
