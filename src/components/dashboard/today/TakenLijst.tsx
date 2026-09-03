'use client';

import Link from 'next/link';
import { CircleCheck } from 'lucide-react';
import { URGENTIE_KLEUR, BRON_LABEL, type Taak } from '@/lib/today/taken-samenvoegen';

/**
 * Vandaag te doen — één lijst in plaats van drie briefings.
 *
 * Per regel: urgentiestip, tijdsindicatie, titel met detail en de bron als klein
 * label, en één actie. De bron blijft zichtbaar zodat je ziet waar iets vandaan
 * komt, maar hij bepaalt niet langer waar het staat — dat doet de urgentie.
 */

interface Props {
  taken: Taak[];
  /** Hoeveel regels standaard zichtbaar zijn. De rest achter "toon alles". */
  zichtbaar?: number;
  onMeer?: () => void;
  allesTonen?: boolean;
}

export default function TakenLijst({ taken, zichtbaar = 6, onMeer, allesTonen = false }: Props) {
  if (taken.length === 0) {
    return (
      <div className="panel" style={{ padding: '32px 24px', textAlign: 'center' }}>
        <div
          aria-hidden="true"
          style={{
            width: 40, height: 40, borderRadius: 12, background: 'var(--brand-tint)',
            color: 'var(--brand)', display: 'inline-flex', alignItems: 'center',
            justifyContent: 'center', marginBottom: 10,
          }}
        >
          <CircleCheck size={20} />
        </div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 500 }}>
          Niets open voor vandaag
        </div>
        <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
          Alles is afgetekend, gestuurd of geteld. Morgen staat er weer wat.
        </div>
      </div>
    );
  }

  const getoond = allesTonen ? taken : taken.slice(0, zichtbaar);
  const rest = taken.length - getoond.length;

  return (
    <div className="panel" style={{ overflow: 'hidden' }}>
      <div className="panel-head">
        <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 15, margin: 0 }}>
          Vandaag te doen
        </h3>
        <span
          style={{
            fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 20,
            background: 'var(--brand-tint)', color: 'var(--brand)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {taken.length}
        </span>
      </div>

      <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {getoond.map((t) => (
          <li key={t.id} className="taak-rij">
            <span
              aria-label={t.urgentie}
              style={{
                width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                background: URGENTIE_KLEUR[t.urgentie],
                boxShadow: t.urgentie === 'nu' ? '0 0 0 3px rgba(239,68,68,.15)' : 'none',
              }}
            />
            <span
              style={{
                fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--muted)',
                whiteSpace: 'nowrap', minWidth: 46,
              }}
            >
              {t.tijd || '—'}
            </span>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 13, fontWeight: 600, lineHeight: 1.35 }}>
                {t.titel}
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3, flexWrap: 'wrap' }}>
                {t.detail && (
                  <span style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.4 }}>{t.detail}</span>
                )}
                <span
                  style={{
                    fontSize: 9, fontWeight: 700, letterSpacing: '.12em',
                    textTransform: 'uppercase', color: 'var(--brand-gold)', whiteSpace: 'nowrap',
                  }}
                >
                  {BRON_LABEL[t.bron]}
                </span>
              </span>
            </span>
            <Link href={t.href} className="btn btn-ghost btn-sm" style={{ whiteSpace: 'nowrap', minHeight: 40 }}>
              {t.actie}
            </Link>
          </li>
        ))}
      </ol>

      {rest > 0 && (
        <button
          type="button"
          onClick={onMeer}
          style={{
            display: 'block', width: '100%', padding: '12px 20px', minHeight: 44,
            background: 'none', border: 'none', borderTop: '1px solid rgba(130,130,130,.08)',
            color: 'var(--brand)', font: '600 12px var(--font-sans)', cursor: 'pointer',
          }}
        >
          Nog {rest} {rest === 1 ? 'taak' : 'taken'} tonen
        </button>
      )}
    </div>
  );
}
