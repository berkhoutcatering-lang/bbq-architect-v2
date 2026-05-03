'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Route, Plus, Download } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import Button from '@/components/Button';
import { useSupabase } from '@/lib/useSupabase';
import type { Rit, Voertuig } from '@/types';
import { filterPeriode, type Periode, categoriseerRit, CAT_BY_ID, adresNaarCoord } from '@/lib/ritten-aggregaties';
import RittenMap, { type MapRoute, type MapMarker, type LatLng } from './_components/RittenMap';
import TotalenStrip from './_components/TotalenStrip';
import FilterChips, { type FilterValue } from './_components/FilterChips';
import RittenTabel from './_components/RittenTabel';

const HQ_COORD: LatLng = [52.917, 6.799]; // Borger fallback

export default function RittenregistratieClient() {
  const { data: ritten, loading } = useSupabase<Rit>('ritten', []);
  const { data: voertuigen } = useSupabase<Voertuig>('voertuigen', []);

  const [periode, setPeriode] = useState<Periode>('Maand');
  const [filter, setFilter] = useState<FilterValue>('all');
  const [activeId, setActiveId] = useState<number | null>(null);

  const inPeriode = useMemo(() => filterPeriode(ritten, periode), [ritten, periode]);
  const filtered = useMemo(() => {
    if (filter === 'all') return inPeriode;
    return inPeriode.filter((r) => categoriseerRit(r) === filter);
  }, [inPeriode, filter]);

  const routes: MapRoute[] = useMemo(() => {
    const out: MapRoute[] = [];
    filtered.forEach((r, i) => {
      const from = adresNaarCoord(r.vertrek_adres);
      const to = adresNaarCoord(r.aankomst_adres);
      if (!from || !to) return;
      const cat = CAT_BY_ID[categoriseerRit(r)];
      out.push({
        id: String(r.id),
        from: [from.lat, from.lng] as LatLng,
        to: [to.lat, to.lng] as LatLng,
        color: cat.color,
        curvature: 0.12 + (i % 3) * 0.05,
      });
    });
    return out;
  }, [filtered]);

  const markers: MapMarker[] = useMemo(() => {
    const out: MapMarker[] = [{ coord: HQ_COORD, kind: 'home', color: '#FFBF00', label: 'HQ Borger' }];
    const seen = new Set<string>([HQ_COORD.join(',')]);
    filtered.slice(0, 12).forEach((r) => {
      const c = adresNaarCoord(r.aankomst_adres);
      if (!c) return;
      const key = [c.lat, c.lng].join(',');
      if (seen.has(key)) return;
      seen.add(key);
      out.push({
        coord: [c.lat, c.lng] as LatLng,
        kind: 'stop',
        color: CAT_BY_ID[categoriseerRit(r)].color,
      });
    });
    return out;
  }, [filtered]);

  const isEmpty = !loading && ritten.length === 0;

  return (
    <div className="main-content">
      <PageHeader
        title="Rittenregistratie"
        description="Sluitende kilometeradministratie voor de Belastingdienst — €0,23 per zakelijke kilometer 2026."
        actions={
          <>
            <Button variant="ghost" size="sm" icon={<Download size={14} />}>
              Export
            </Button>
            <Link
              href="/administratie/rittenregistratie/nieuw"
              style={{ textDecoration: 'none' }}
            >
              <Button variant="brand" size="sm" icon={<Plus size={14} />}>
                Nieuwe rit
              </Button>
            </Link>
          </>
        }
      />

      <TotalenStrip ritten={inPeriode} periode={periode} onPeriode={setPeriode} />

      <FilterChips active={filter} onChange={setFilter} ritten={inPeriode} />

      {isEmpty ? (
        <div className="metal" style={{ padding: 48, textAlign: 'center' }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 16,
              background: 'rgba(255,191,0,0.10)',
              border: '1px solid rgba(255,191,0,0.25)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 16,
            }}
          >
            <Route size={24} color="var(--brand)" />
          </div>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>Nog geen ritten</div>
          <div style={{ fontSize: 13, color: 'var(--muted)', maxWidth: 460, margin: '0 auto 18px' }}>
            Begin met je eerste rit. Tip: je kunt ook automatisch een heen+retour rit toevoegen vanaf een event op de agenda.
          </div>
          <Link href="/administratie/rittenregistratie/nieuw" style={{ textDecoration: 'none' }}>
            <Button variant="brand" icon={<Plus size={14} />}>
              Eerste rit toevoegen
            </Button>
          </Link>
        </div>
      ) : (
        <div className="ritten-layout">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
            <RittenMap routes={routes} markers={markers} activeRouteId={activeId !== null ? String(activeId) : null} height={460} onRouteClick={(id) => setActiveId(Number(id))} />
            <RittenTabel ritten={filtered} voertuigen={voertuigen} activeId={activeId} />
          </div>
          <RittenSidebar ritten={inPeriode} voertuigen={voertuigen} />
        </div>
      )}

      <style jsx>{`
        .ritten-layout {
          display: grid;
          grid-template-columns: 1fr 380px;
          gap: 16px;
          align-items: start;
        }
        @media (max-width: 1100px) {
          .ritten-layout {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}

function RittenSidebar({ ritten, voertuigen }: { ritten: Rit[]; voertuigen: Voertuig[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, position: 'sticky', top: 72 }}>
      <div className="metal">
        <div className="metal-head">
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--brand-gold)' }}>
            Voertuigen
          </div>
        </div>
        <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {voertuigen.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>
              Nog geen voertuig geregistreerd. Voeg er een toe bij je eerste rit.
            </div>
          ) : (
            voertuigen.map((v) => {
              const ritKm = ritten
                .filter((r) => r.voertuig_id === v.id)
                .reduce((a, r) => a + (r.kilometers ?? r.km_eind - r.km_begin), 0);
              return (
                <div
                  key={v.id}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 10,
                    background: 'rgba(255,191,0,0.03)',
                    border: '1px solid var(--border)',
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 600 }}>
                    {v.merk || 'Voertuig'} {v.type ? `· ${v.type}` : ''}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                    {v.kenteken} · {ritKm.toLocaleString('nl-NL', { maximumFractionDigits: 1 })} km deze periode
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="metal">
        <div className="metal-head">
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--brand-gold)' }}>
            Tips
          </div>
        </div>
        <div style={{ padding: 14, fontSize: 12, color: 'var(--muted)', lineHeight: 1.6 }}>
          <div style={{ marginBottom: 8 }}>
            • <strong style={{ color: 'var(--text)' }}>Vanuit een event</strong> — voeg automatisch een heen + retour rit toe vanaf{' '}
            <Link href="/agenda" style={{ color: 'var(--brand)' }}>de agenda</Link>.
          </div>
          <div style={{ marginBottom: 8 }}>
            • <strong style={{ color: 'var(--text)' }}>Foto van km-stand</strong> — gebruik &quot;Scan km-foto&quot; in de rit-details voor automatische km-uitlezing.
          </div>
          <div>
            • <strong style={{ color: 'var(--text)' }}>Bewaarplicht 7 jaar</strong> — alle ritten worden permanent bewaard voor de Belastingdienst.
          </div>
        </div>
      </div>
    </div>
  );
}
