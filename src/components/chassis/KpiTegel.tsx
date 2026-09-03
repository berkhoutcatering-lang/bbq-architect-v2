'use client';

import type { ReactNode } from 'react';
import { TrendingUp, TrendingDown, CircleAlert } from 'lucide-react';

/**
 * KpiTegel — één tegel in de KPI-rij, met de staten die de app tot nu toe miste.
 *
 * De regel uit het ontwerp: een tegel toont nooit een getal als de onderliggende
 * data incompleet is. Dat is precies waar de app de mist in ging — "Marge 97% ·
 * Sterk" terwijl zes van de acht gerechten geen kostprijs hadden, en "€ 0" waar
 * "nog geen data" bedoeld werd. Een gestippelde rand betekent: hier staat met
 * opzet geen cijfer, en de ondertitel zegt wat er mist.
 *
 * Kleur draagt betekenis: groen en rood alleen als het echt goed of slecht
 * nieuws is. Goud is versiering (de haarlijn) en zegt niets.
 */

export type KpiStaat =
  | { soort: 'waarde'; waarde: string; onder?: ReactNode; trend?: { richting: 'op' | 'neer'; tekst: string; goed: boolean }; alarm?: boolean }
  | { soort: 'onbepaald'; reden: string; actieLabel?: string; onActie?: () => void }
  | { soort: 'leeg'; wanneer: string }
  | { soort: 'laden' }
  | { soort: 'fout'; onOpnieuw?: () => void };

interface Props {
  label: string;
  staat: KpiStaat;
}

const BASIS: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  padding: '16px 18px',
  borderRadius: 14,
  background: 'var(--card)',
  minHeight: 104,
  position: 'relative',
  overflow: 'hidden',
};

/* Gouden haarlijn bovenaan — puur chrome, reageert nergens op. */
function Haarlijn() {
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute', inset: '0 0 auto 0', height: 1,
        background: 'linear-gradient(90deg,transparent,rgba(196,163,90,.4),transparent)',
      }}
    />
  );
}

function Label({ children }: { children: ReactNode }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.12em', color: 'var(--muted)' }}>
      {children}
    </div>
  );
}

export default function KpiTegel({ label, staat }: Props) {
  if (staat.soort === 'laden') {
    return (
      <div style={{ ...BASIS, border: '1px solid var(--border)', gap: 8 }} aria-busy="true" aria-label={label + ' laden'}>
        <div style={{ height: 10, width: '60%', borderRadius: 4, background: 'rgba(255,255,255,.06)' }} />
        <div style={{ height: 26, width: '45%', borderRadius: 6, background: 'rgba(255,255,255,.08)', marginTop: 2 }} />
        <div style={{ height: 10, width: '75%', borderRadius: 4, background: 'rgba(255,255,255,.05)', marginTop: 'auto' }} />
      </div>
    );
  }

  if (staat.soort === 'fout') {
    return (
      <div style={{ ...BASIS, border: '1px solid var(--border)' }}>
        <Label>{label}</Label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 600, color: 'var(--status-danger-text)' }}>
          <CircleAlert size={14} />Niet geladen
        </div>
        {staat.onOpnieuw && (
          <button
            type="button"
            onClick={staat.onOpnieuw}
            style={{
              alignSelf: 'flex-start', marginTop: 'auto', background: 'none', border: 'none',
              color: 'var(--brand)', font: '600 11px var(--font-sans)', cursor: 'pointer', padding: 0, minHeight: 24,
            }}
          >
            Opnieuw proberen
          </button>
        )}
      </div>
    );
  }

  /* Onbepaald en leeg krijgen allebei een gestippelde rand: het oog ziet meteen
     dat hier met opzet geen cijfer staat. */
  if (staat.soort === 'onbepaald' || staat.soort === 'leeg') {
    const kop = staat.soort === 'onbepaald' ? 'Nog niet te berekenen' : 'Nog geen data';
    const onder = staat.soort === 'onbepaald' ? staat.reden : staat.wanneer;
    return (
      <div style={{ ...BASIS, border: '1px dashed var(--border-strong)' }}>
        <Label>{label}</Label>
        <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.3, color: 'var(--muted-light)', marginTop: 2 }}>
          {kop}
        </div>
        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 'auto', lineHeight: 1.4 }}>{onder}</div>
        {staat.soort === 'onbepaald' && staat.actieLabel && (
          <button
            type="button"
            onClick={staat.onActie}
            style={{
              alignSelf: 'flex-start', background: 'none', border: 'none', color: 'var(--brand)',
              font: '600 11px var(--font-sans)', cursor: 'pointer', padding: 0, minHeight: 24,
            }}
          >
            {staat.actieLabel} →
          </button>
        )}
      </div>
    );
  }

  const Trend = staat.trend?.richting === 'neer' ? TrendingDown : TrendingUp;
  return (
    <div
      style={{
        ...BASIS,
        border: staat.alarm ? '1px solid var(--status-danger-border)' : '1px solid var(--border)',
      }}
    >
      <Haarlijn />
      <Label>{label}</Label>
      <div
        style={{
          fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 700, lineHeight: 1.1,
          fontVariantNumeric: 'tabular-nums',
          color: staat.alarm ? 'var(--status-danger-text)' : undefined,
        }}
      >
        {staat.waarde}
      </div>
      {staat.trend ? (
        <div
          style={{
            fontSize: 11, marginTop: 'auto', display: 'flex', alignItems: 'center', gap: 4,
            color: staat.trend.goed ? 'var(--status-success-text)' : 'var(--status-danger-text)',
          }}
        >
          <Trend size={11} />{staat.trend.tekst}
        </div>
      ) : (
        staat.onder && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 'auto' }}>{staat.onder}</div>
      )}
    </div>
  );
}

/** Rij van 2 tot 6 tegels. Wikkelt netjes op smalle schermen. */
export function KpiRij({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
        gap: 12,
      }}
    >
      {children}
    </div>
  );
}
