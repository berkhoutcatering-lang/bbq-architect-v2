'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Map as MapIcon,
  Receipt,
  Landmark,
  History,
  Route as RouteIcon,
  Calculator,
  Paperclip,
  CheckCircle2,
  Edit3,
  Copy,
  Navigation,
  Trash2,
  Truck,
  PartyPopper,
  Info,
  CircleDot,
  Flag,
  Milestone,
} from 'lucide-react';
import Button from '@/components/Button';
import { useSupabase } from '@/lib/useSupabase';
import { useToast } from '@/components/Toast';
import type { Rit, Voertuig, DbEvent } from '@/types';
import { fmtKm, fmtEur, fmtDateR, categoriseerRit, CAT_BY_ID } from '@/lib/ritten-aggregaties';
import { tariefVoorJaar, bedragAftrekbaar } from '@/lib/ritten-tarieven';
import RealRouteMap from '../_components/RealRouteMap';

type Tab = 'route' | 'kosten' | 'fiscaal' | 'log';

interface Props {
  id: number;
}

const ICON_MAP = {
  'circle-dot': CircleDot,
  flag: Flag,
  milestone: Milestone,
} as const;

function addMinutesToTime(hhmmss: string, minutes: number): string {
  const [h, m] = hhmmss.split(':').map(Number);
  const total = h * 60 + m + minutes;
  const newH = Math.floor(total / 60) % 24;
  const newM = total % 60;
  return `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}:00`;
}

export default function RitDetailClient({ id }: Props) {
  const router = useRouter();
  const showToast = useToast();
  const { data: ritten, loading, update, insert, remove } = useSupabase<Rit>('ritten', []);
  const { data: voertuigen } = useSupabase<Voertuig>('voertuigen', []);
  const { data: events } = useSupabase<DbEvent>('events', []);

  const [tab, setTab] = useState<Tab>('route');
  const [actieBezig, setActieBezig] = useState<'goedkeur' | 'kopieer' | 'verwijder' | null>(null);

  const sortedRitten = useMemo(
    () => [...ritten].sort((a, b) => (a.datum < b.datum ? 1 : a.datum > b.datum ? -1 : a.id - b.id)),
    [ritten],
  );
  const ritIdx = useMemo(() => sortedRitten.findIndex((r) => r.id === id), [sortedRitten, id]);
  const rit = ritIdx >= 0 ? sortedRitten[ritIdx] : null;
  const prev = ritIdx > 0 ? sortedRitten[ritIdx - 1] : null;
  const next = ritIdx >= 0 && ritIdx < sortedRitten.length - 1 ? sortedRitten[ritIdx + 1] : null;

  const voertuig = useMemo(() => voertuigen.find((v) => v.id === rit?.voertuig_id), [voertuigen, rit]);
  const event = useMemo(() => events.find((e) => e.id === rit?.event_id), [events, rit]);

  if (loading) {
    return (
      <div className="main-content" style={{ padding: 32 }}>
        <div style={{ color: 'var(--muted)' }}>Rit laden…</div>
      </div>
    );
  }

  if (!rit) {
    return (
      <div className="main-content" style={{ padding: 32 }}>
        <Link href="/geld/rittenregistratie" style={{ color: 'var(--brand)', textDecoration: 'none' }}>
          ← Terug naar rittenoverzicht
        </Link>
        <div style={{ marginTop: 24, fontSize: 16, fontWeight: 600 }}>Rit niet gevonden</div>
        <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
          De gevraagde rit bestaat niet (meer) of je hebt geen toegang.
        </div>
      </div>
    );
  }

  const cat = CAT_BY_ID[categoriseerRit(rit)];
  const km = rit.kilometers ?? rit.km_eind - rit.km_begin;
  const tarief = tariefVoorJaar(new Date(rit.datum).getFullYear());
  const aftrekEur = bedragAftrekbaar({
    kilometers: km,
    zakelijk: rit.zakelijk,
    priveOmleidingKm: rit.prive_omleiding_km,
    datum: rit.datum,
  });

  const stops = [
    { type: 'start', label: rit.vertrek_adres, time: null, icon: 'circle-dot' as const, color: 'var(--brand-gold)' },
    ...(km > 30 ? [{ type: 'waypoint', label: 'Doorgaande route', time: null, icon: 'milestone' as const, color: 'var(--muted)' }] : []),
    { type: 'end', label: rit.aankomst_adres, time: null, icon: 'flag' as const, color: '#FFBF00' },
  ];

  const datum = new Date(rit.datum);
  const dagNaam = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag'][datum.getDay()];

  return (
    <div className="main-content" style={{ maxWidth: 1500 }}>
      {/* Back + nav header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 18,
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <Link
          href="/geld/rittenregistratie"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 14px',
            borderRadius: 999,
            background: 'transparent',
            border: '1px solid var(--border)',
            color: 'var(--muted)',
            cursor: 'pointer',
            fontSize: 12,
            fontWeight: 600,
            textDecoration: 'none',
          }}
        >
          <ArrowLeft size={13} />
          Alle ritten
        </Link>

        <div style={{ display: 'flex', gap: 6 }}>
          <button
            disabled={!prev}
            onClick={() => prev && router.push(`/geld/rittenregistratie/${prev.id}`)}
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid var(--border)',
              color: prev ? 'var(--text)' : 'var(--muted-light)',
              cursor: prev ? 'pointer' : 'not-allowed',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            aria-label="Vorige rit"
          >
            <ChevronLeft size={15} />
          </button>
          <div
            style={{
              padding: '0 14px',
              height: 36,
              display: 'flex',
              alignItems: 'center',
              fontSize: 11,
              color: 'var(--muted)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {ritIdx + 1} / {sortedRitten.length}
          </div>
          <button
            disabled={!next}
            onClick={() => next && router.push(`/geld/rittenregistratie/${next.id}`)}
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid var(--border)',
              color: next ? 'var(--text)' : 'var(--muted-light)',
              cursor: next ? 'pointer' : 'not-allowed',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            aria-label="Volgende rit"
          >
            <ChevronRight size={15} />
          </button>
        </div>
      </div>

      {/* Hero — rit summary */}
      <div className="metal" style={{ marginBottom: 16, overflow: 'hidden' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr auto',
            gap: 24,
            padding: '20px 24px',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '3px 10px',
                  borderRadius: 999,
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: '0.05em',
                  background: `color-mix(in oklab, ${cat.color} 14%, transparent)`,
                  color: cat.color,
                  border: `1px solid color-mix(in oklab, ${cat.color} 30%, transparent)`,
                }}
              >
                {cat.label.toUpperCase()}
              </span>
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>#r-{String(rit.id).padStart(3, '0')}</span>
              <span
                style={{
                  fontSize: 10,
                  padding: '2px 8px',
                  borderRadius: 999,
                  background: rit.status === 'goedgekeurd' ? 'rgba(34,197,94,0.12)' : 'rgba(255,191,0,0.12)',
                  color: rit.status === 'goedgekeurd' ? 'var(--green)' : 'var(--brand)',
                  border: '1px solid currentColor',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                }}
              >
                {rit.status === 'goedgekeurd' ? '✓ Geboekt' : '○ Open'}
              </span>
              {!rit.zakelijk && (
                <span
                  style={{
                    fontSize: 10,
                    padding: '2px 8px',
                    borderRadius: 999,
                    background: 'rgba(130,130,130,0.12)',
                    color: 'var(--muted)',
                    border: '1px solid var(--border-strong)',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                  }}
                >
                  Privé
                </span>
              )}
            </div>
            <h1
              style={{
                fontWeight: 300,
                fontSize: 32,
                margin: 0,
                lineHeight: 1.1,
                letterSpacing: '-0.02em',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                flexWrap: 'wrap',
              }}
            >
              <span>{rit.vertrek_adres.split(',')[0]}</span>
              <ArrowRight size={20} color="var(--brand-gold)" />
              <span style={{ color: 'var(--brand)' }}>{rit.aankomst_adres.split(',')[0]}</span>
            </h1>
            {rit.doel && (
              <div style={{ marginTop: 10, fontSize: 13, color: 'var(--muted)', fontStyle: 'italic' }}>
                &ldquo;{rit.doel}&rdquo;
              </div>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
            <div style={{ fontSize: 11, color: 'var(--muted)', letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600 }}>
              {dagNaam} {fmtDateR(datum)}
            </div>
            <div style={{ fontSize: 26, fontWeight: 600, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
              {rit.vertrek_tijd ? rit.vertrek_tijd.slice(0, 5) : km.toLocaleString('nl-NL', { maximumFractionDigits: 1 }) + ' km'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted-light)' }}>
              {rit.duur_minuten ? `${rit.duur_minuten} min reistijd` : voertuig?.kenteken || 'Geen voertuig'}
            </div>
          </div>
        </div>

        {/* Big stats */}
        <div className="hero-stats">
          {[
            { label: 'Afstand', value: fmtKm(km), sub: 'gemeten heen', color: 'var(--text)' },
            {
              label: 'Aftrekbaar',
              value: rit.zakelijk ? fmtEur(aftrekEur) : 'Niet aftrekbaar',
              sub: rit.zakelijk ? `× €${tarief.toFixed(2)}/km` : '—',
              color: rit.zakelijk ? 'var(--green)' : 'var(--muted)',
            },
            (() => {
              const brandstofEur = km * 0.18;
              const btw = brandstofEur * 0.21 / 1.21;
              return {
                label: 'Brandstof',
                value: fmtEur(brandstofEur),
                sub: `BTW ${fmtEur(btw)}`,
                color: 'var(--text)',
              };
            })(),
            {
              label: 'Voertuig',
              value: voertuig?.kenteken || '—',
              sub: voertuig?.merk ? `${voertuig.merk}${voertuig.type ? ` ${voertuig.type}` : ''}` : '—',
              color: 'var(--brand-gold)',
            },
          ].map((t, i) => (
            <div
              key={i}
              style={{
                padding: '18px 22px',
                borderRight: i < 3 ? '1px solid var(--border)' : 'none',
              }}
            >
              <div className="eyebrow" style={{ marginBottom: 6 }}>
                {t.label}
              </div>
              <div
                style={{
                  fontWeight: 500,
                  fontSize: 22,
                  color: t.color,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {t.value}
              </div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>{t.sub}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        {([
          { id: 'route', label: 'Route & Kaart', Icon: MapIcon },
          { id: 'kosten', label: 'Kosten & Bonnen', Icon: Receipt },
          { id: 'fiscaal', label: 'Fiscaal', Icon: Landmark },
          { id: 'log', label: 'Activiteit', Icon: History },
        ] as const).map((t) => {
          const isActive = tab === t.id;
          const Icon = t.Icon;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                padding: '9px 14px',
                borderRadius: 8,
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 600,
                border: '1px solid ' + (isActive ? 'rgba(255,191,0,0.3)' : 'transparent'),
                color: isActive ? 'var(--brand)' : 'var(--muted)',
                background: isActive ? 'rgba(255,191,0,0.08)' : 'transparent',
                fontFamily: 'inherit',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
              role="tab"
              aria-selected={isActive}
            >
              <Icon size={12} />
              {t.label}
            </button>
          );
        })}
      </div>

      <div className="rd-grid">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {tab === 'route' && (
            <>
              <RealRouteMap
                vertrekAdres={rit.vertrek_adres}
                aankomstAdres={rit.aankomst_adres}
                routeColor={cat.color}
                height={460}
              />
              <div className="metal">
                <div className="metal-head">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <RouteIcon size={14} color="var(--brand-gold)" />
                    <div style={{ fontSize: 13, fontWeight: 600 }}>Route stappen</div>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                    {stops.length} punten · {fmtKm(km)}
                  </div>
                </div>
                <div>
                  {stops.map((s, i) => {
                    const Icon = ICON_MAP[s.icon];
                    return (
                      <div
                        key={i}
                        style={{
                          position: 'relative',
                          display: 'flex',
                          gap: 14,
                          padding: '14px 16px',
                          borderBottom: i < stops.length - 1 ? '1px solid var(--border)' : 'none',
                        }}
                      >
                        {i < stops.length - 1 && (
                          <div
                            style={{
                              position: 'absolute',
                              left: 25,
                              top: 36,
                              bottom: -14,
                              width: 1,
                              background:
                                'linear-gradient(180deg, rgba(196,163,90,0.6), rgba(196,163,90,0.1))',
                            }}
                          />
                        )}
                        <div
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: '50%',
                            background: 'rgba(255,255,255,0.03)',
                            border: `2px solid ${s.color}`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                            position: 'relative',
                            zIndex: 1,
                          }}
                        >
                          <Icon size={13} color={s.color} />
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                            {s.label}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              {rit.route_omleiding && (
                <div
                  style={{
                    padding: 14,
                    borderRadius: 10,
                    background: 'rgba(255,191,0,0.04)',
                    border: '1px dashed rgba(255,191,0,0.2)',
                    fontSize: 12,
                    color: 'var(--muted)',
                  }}
                >
                  <strong style={{ color: 'var(--text)' }}>Route-omleiding:</strong> {rit.route_omleiding}
                </div>
              )}
            </>
          )}

          {tab === 'kosten' && (
            <div className="metal">
              <div className="metal-head">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Calculator size={14} color="var(--brand-gold)" />
                  <div style={{ fontSize: 13, fontWeight: 600 }}>Kostenopbouw (indicatief)</div>
                </div>
              </div>
              <div style={{ padding: '4px 0' }}>
                {[
                  { label: 'Brandstof (geschat)', sub: `${fmtKm(km)} × €0,18/km`, value: fmtEur(km * 0.18) },
                  { label: 'Tol / parkeerkosten', sub: 'geen', value: '€ 0,00' },
                  { label: 'Slijtage / onderhoud', sub: `${fmtKm(km)} × €0,06/km`, value: fmtEur(km * 0.06) },
                ].map((row, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '12px 18px',
                      borderTop: i ? '1px solid var(--border)' : 'none',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 13, color: 'var(--text)' }}>{row.label}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{row.sub}</div>
                    </div>
                    <div style={{ fontVariantNumeric: 'tabular-nums', fontSize: 14, color: 'var(--text)' }}>
                      {row.value}
                    </div>
                  </div>
                ))}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '14px 18px',
                    borderTop: '1px solid var(--border)',
                    background: 'rgba(255,191,0,0.04)',
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Totaal werkelijke kosten</div>
                  <div
                    style={{
                      fontWeight: 700,
                      fontSize: 18,
                      color: 'var(--brand)',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {fmtEur(km * 0.24)}
                  </div>
                </div>
              </div>

              <div className="metal-head" style={{ borderTop: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Paperclip size={14} color="var(--brand-gold)" />
                  <div style={{ fontSize: 13, fontWeight: 600 }}>Bonnen & bewijsstukken</div>
                </div>
              </div>
              <div style={{ padding: 18, fontSize: 12, color: 'var(--muted)', textAlign: 'center' }}>
                Bonnen koppelen — koppeling met /administratie/financien volgt.
              </div>
            </div>
          )}

          {tab === 'fiscaal' && (
            <div className="metal">
              <div className="metal-head">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Landmark size={14} color="var(--brand-gold)" />
                  <div style={{ fontSize: 13, fontWeight: 600 }}>Fiscale verwerking</div>
                </div>
                <span
                  style={{
                    fontSize: 10,
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    padding: '3px 8px',
                    borderRadius: 4,
                    fontWeight: 700,
                    background: 'rgba(34,197,94,0.12)',
                    color: 'var(--green)',
                    border: '1px solid rgba(34,197,94,0.3)',
                  }}
                >
                  Belastingdienst-conform
                </span>
              </div>
              <div style={{ padding: 22 }}>
                <div className="fiscaal-grid">
                  <div
                    style={{
                      padding: '14px 16px',
                      borderRadius: 10,
                      background: rit.zakelijk ? 'rgba(34,197,94,0.06)' : 'rgba(130,130,130,0.04)',
                      border: '1px solid ' + (rit.zakelijk ? 'rgba(34,197,94,0.25)' : 'var(--border)'),
                    }}
                  >
                    <div className="eyebrow">Status</div>
                    <div
                      style={{
                        fontSize: 16,
                        fontWeight: 700,
                        color: rit.zakelijk ? 'var(--green)' : 'var(--muted)',
                        marginTop: 6,
                      }}
                    >
                      {rit.zakelijk ? '✓ Aftrekbaar' : '✗ Niet aftrekbaar'}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                      {rit.zakelijk
                        ? `Zakelijke rit · €${tarief.toFixed(2)}/km vergoeding`
                        : 'Privé-rit valt buiten zakelijk gebruik'}
                    </div>
                  </div>
                  <div
                    style={{
                      padding: '14px 16px',
                      borderRadius: 10,
                      background: 'rgba(255,255,255,0.02)',
                      border: '1px solid var(--border)',
                    }}
                  >
                    <div className="eyebrow">Vergoeding</div>
                    <div
                      style={{
                        fontWeight: 600,
                        fontSize: 22,
                        color: 'var(--brand)',
                        marginTop: 6,
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {fmtEur(aftrekEur)}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                      {fmtKm(Math.max(0, km - rit.prive_omleiding_km))} × €{tarief.toFixed(2)}
                    </div>
                  </div>
                </div>

                <div className="eyebrow" style={{ marginTop: 18, marginBottom: 10 }}>
                  Boekingsregel
                </div>
                <div
                  style={{
                    padding: '12px 14px',
                    borderRadius: 8,
                    background: '#0a0a0c',
                    border: '1px solid var(--border)',
                    fontFamily: 'ui-monospace, monospace',
                    fontSize: 12,
                    color: '#86efac',
                    lineHeight: 1.7,
                  }}
                >
                  <div>
                    <span style={{ color: 'var(--muted)' }}>{`// ${fmtDateR(datum)} · r-${rit.id}`}</span>
                  </div>
                  <div>
                    4720 Reiskosten ........... <span style={{ color: '#fbbf24' }}>{fmtEur(aftrekEur)}</span>
                  </div>
                  <div>
                    1300 Tussenrekening kas ... <span style={{ color: '#fbbf24' }}>−{fmtEur(aftrekEur)}</span>
                  </div>
                  <div style={{ color: 'var(--muted)', marginTop: 4 }}>
                    {`// ${rit.vertrek_adres.split(',')[0]} → ${rit.aankomst_adres.split(',')[0]}, ${fmtKm(km)}`}
                  </div>
                </div>

                <div
                  style={{
                    marginTop: 18,
                    fontSize: 11,
                    color: 'var(--muted)',
                    lineHeight: 1.6,
                    padding: 12,
                    borderRadius: 8,
                    background: 'rgba(255,191,0,0.03)',
                    border: '1px dashed rgba(255,191,0,0.15)',
                  }}
                >
                  <Info size={11} style={{ verticalAlign: 'middle', marginRight: 6, color: 'var(--brand)' }} />
                  Volgens de regeling {new Date(rit.datum).getFullYear()} mag je €{tarief.toFixed(2)} per zakelijke kilometer
                  onbelast vergoeden of aftrekken. Houd rittenadministratie 7 jaar bewaren.
                </div>
              </div>
            </div>
          )}

          {tab === 'log' && (
            <div className="metal">
              <div className="metal-head">
                <div style={{ fontSize: 13, fontWeight: 600 }}>Activiteit</div>
              </div>
              <div style={{ padding: 18, fontSize: 12, color: 'var(--muted)' }}>
                <div style={{ marginBottom: 8 }}>
                  <strong style={{ color: 'var(--text)' }}>Aangemaakt:</strong>{' '}
                  {new Date(rit.created_at).toLocaleString('nl-NL')}
                </div>
                <div>
                  <strong style={{ color: 'var(--text)' }}>Laatst gewijzigd:</strong>{' '}
                  {new Date(rit.updated_at).toLocaleString('nl-NL')}
                </div>
                <div style={{ marginTop: 12, fontSize: 11, color: 'var(--muted-light)' }}>
                  Audit-trail per veld komt beschikbaar zodra audit_log infrastructuur live is.
                </div>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT — sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }} className="rd-sidebar">
          <div className="metal">
            <div className="metal-head">
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--brand-gold)' }}>
                Acties
              </div>
            </div>
            <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {rit.status === 'open' ? (
                <Button
                  variant="brand"
                  icon={<CheckCircle2 size={14} />}
                  style={{ width: '100%', justifyContent: 'center' }}
                  loading={actieBezig === 'goedkeur'}
                  onClick={async () => {
                    setActieBezig('goedkeur');
                    try {
                      const ok = await update(rit.id, { status: 'goedgekeurd' });
                      if (!ok) throw new Error('Update mislukt');
                      showToast({ type: 'success', message: 'Rit goedgekeurd & geboekt' });
                    } catch (e) {
                      showToast({ type: 'error', title: 'Fout', message: (e as Error).message });
                    } finally {
                      setActieBezig(null);
                    }
                  }}
                >
                  Goedkeuren & boeken
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  icon={<CheckCircle2 size={14} />}
                  style={{ width: '100%', justifyContent: 'center', color: 'var(--green)' }}
                  loading={actieBezig === 'goedkeur'}
                  onClick={async () => {
                    if (!confirm('Rit terug naar status "open" zetten?')) return;
                    setActieBezig('goedkeur');
                    try {
                      await update(rit.id, { status: 'open' });
                      showToast({ type: 'success', message: 'Rit teruggezet naar open' });
                    } catch (e) {
                      showToast({ type: 'error', title: 'Fout', message: (e as Error).message });
                    } finally {
                      setActieBezig(null);
                    }
                  }}
                >
                  ✓ Geboekt — terugzetten
                </Button>
              )}
              <Button
                variant="ghost"
                icon={<Edit3 size={14} />}
                style={{ width: '100%', justifyContent: 'center' }}
                onClick={() => router.push(`/geld/rittenregistratie/${rit.id}/bewerken`)}
              >
                Bewerk rit
              </Button>
              <Button
                variant="ghost"
                icon={<Copy size={14} />}
                style={{ width: '100%', justifyContent: 'center' }}
                loading={actieBezig === 'kopieer'}
                onClick={async () => {
                  setActieBezig('kopieer');
                  try {
                    const retourKm = rit.km_eind - rit.km_begin;
                    const created = await insert({
                      voertuig_id: rit.voertuig_id,
                      datum: rit.datum,
                      vertrek_tijd: rit.vertrek_tijd
                        ? addMinutesToTime(rit.vertrek_tijd, (rit.duur_minuten ?? 30) + 60)
                        : null,
                      duur_minuten: rit.duur_minuten,
                      vertrek_adres: rit.aankomst_adres,
                      aankomst_adres: rit.vertrek_adres,
                      km_begin: rit.km_eind,
                      km_eind: rit.km_eind + retourKm,
                      zakelijk: rit.zakelijk,
                      prive_omleiding_km: 0,
                      doel: 'Retour ' + (rit.doel || ''),
                      event_id: rit.event_id,
                      status: 'open',
                    });
                    if (!created) throw new Error('Aanmaken mislukt');
                    showToast({ type: 'success', message: 'Retour-rit aangemaakt' });
                    router.push(`/geld/rittenregistratie/${created.id}`);
                  } catch (e) {
                    showToast({ type: 'error', title: 'Fout', message: (e as Error).message });
                  } finally {
                    setActieBezig(null);
                  }
                }}
              >
                Kopieer als retour
              </Button>
              <a
                href={`https://www.google.com/maps/dir/${encodeURIComponent(rit.vertrek_adres)}/${encodeURIComponent(rit.aankomst_adres)}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ textDecoration: 'none' }}
              >
                <Button variant="ghost" icon={<Navigation size={14} />} style={{ width: '100%', justifyContent: 'center' }}>
                  Open in Google Maps
                </Button>
              </a>
              <div style={{ height: 1, background: 'var(--border)', margin: '6px 0' }} />
              <Button
                variant="red"
                icon={<Trash2 size={14} />}
                style={{ width: '100%', justifyContent: 'center' }}
                loading={actieBezig === 'verwijder'}
                onClick={async () => {
                  if (!confirm(`Rit r-${String(rit.id).padStart(3, '0')} verwijderen? Dit kan niet ongedaan gemaakt worden.`)) return;
                  setActieBezig('verwijder');
                  try {
                    await remove(rit.id);
                    showToast({ type: 'success', message: 'Rit verwijderd' });
                    router.push('/geld/rittenregistratie');
                  } catch (e) {
                    showToast({ type: 'error', title: 'Fout', message: (e as Error).message });
                    setActieBezig(null);
                  }
                }}
              >
                Verwijder
              </Button>
            </div>
          </div>

          {event && (
            <div className="metal">
              <div className="metal-head">
                <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--brand-gold)' }}>
                  Gekoppeld event
                </div>
              </div>
              <div style={{ padding: 14 }}>
                <Link
                  href={`/events/${event.id}`}
                  style={{
                    padding: 12,
                    borderRadius: 10,
                    background: 'rgba(255,191,0,0.05)',
                    border: '1px solid rgba(255,191,0,0.25)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    cursor: 'pointer',
                    textDecoration: 'none',
                  }}
                >
                  <PartyPopper size={18} color="var(--brand)" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>
                      Event #{event.id}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>Bekijk in agenda →</div>
                  </div>
                </Link>
              </div>
            </div>
          )}

          {voertuig && (
            <div className="metal">
              <div className="metal-head">
                <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--brand-gold)' }}>
                  Voertuig
                </div>
              </div>
              <div style={{ padding: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 10,
                      flexShrink: 0,
                      background: 'rgba(255,191,0,0.16)',
                      border: '1px solid rgba(255,191,0,0.36)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Truck size={16} color="#FFBF00" />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                      {voertuig.merk || 'Voertuig'} {voertuig.type ? `· ${voertuig.type}` : ''}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>{voertuig.kenteken}</div>
                  </div>
                </div>
                <div
                  style={{
                    marginTop: 12,
                    padding: '10px 12px',
                    background: 'rgba(255,255,255,0.03)',
                    borderRadius: 8,
                    fontSize: 11,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--muted)' }}>
                    <span>KM-stand voor rit</span>
                    <span style={{ color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
                      {rit.km_begin.toLocaleString('nl-NL')}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--muted)', marginTop: 4 }}>
                    <span>KM-stand na rit</span>
                    <span style={{ color: 'var(--brand)', fontVariantNumeric: 'tabular-nums' }}>
                      {rit.km_eind.toLocaleString('nl-NL')}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div style={{ height: 60 }} />

      <style jsx>{`
        .rd-grid {
          display: grid;
          grid-template-columns: 1fr 380px;
          gap: 18px;
          align-items: start;
        }
        .hero-stats {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
        }
        .fiscaal-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px;
        }
        @media (max-width: 1100px) {
          .rd-grid {
            grid-template-columns: 1fr;
          }
        }
        @media (max-width: 800px) {
          .hero-stats,
          .fiscaal-grid {
            grid-template-columns: 1fr 1fr;
          }
        }
      `}</style>
    </div>
  );
}
