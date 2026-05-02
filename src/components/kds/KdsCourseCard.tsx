'use client';

import { useState } from 'react';
import type { CourseStatus } from '@/lib/serviceState';

interface AllergyTable {
  table_id: string;
  allergen_flags: string[];
}

interface Props {
  number: number;                 // gang-nummer (1-based)
  title: string;
  status: CourseStatus;
  guests: number;
  countdownLabel?: string;        // bv "Klaar over 8 min"
  prepTimeMin?: number;
  tableExceptions?: AllergyTable[];
  size?: 'now' | 'next';          // 'now' = grote variant, 'next' = compact
  onAdvance: (next: CourseStatus, allergyConfirmed?: boolean) => void;
  onRecall?: () => void;
  onLongPress?: () => void;
}

const STATUS_LABELS: Record<CourseStatus, string> = {
  queued: 'Wachten',
  active: 'In prep',
  ready: 'Klaar',
  served: 'Geserveerd',
  recalled: 'Teruggehaald',
};

const STATUS_COLORS: Record<CourseStatus, string> = {
  queued: 'var(--muted)',
  active: 'var(--amber)',
  ready: 'var(--green)',
  served: 'var(--blue)',
  recalled: 'var(--red)',
};

const NEXT_STATUS: Record<CourseStatus, CourseStatus | null> = {
  queued: 'active',
  active: 'ready',
  ready: 'served',
  served: null,
  recalled: 'active',
};

const ADVANCE_LABEL: Record<CourseStatus, string> = {
  queued: 'Start prep',
  active: 'Markeer klaar',
  ready: 'Markeer geserveerd',
  served: '✓ Geserveerd',
  recalled: 'Hervat',
};

export default function KdsCourseCard({
  number, title, status, guests, countdownLabel, tableExceptions = [],
  size = 'now', onAdvance, onRecall, onLongPress,
}: Props) {
  const [confirmAllergy, setConfirmAllergy] = useState(false);
  const hasAllergyTables = tableExceptions.length > 0;
  const next = NEXT_STATUS[status];
  const color = STATUS_COLORS[status];

  function handleAdvance() {
    if (!next) return;
    // Bij overgang naar 'served' MET allergeen-tafels: confirm-modal forceren
    if (next === 'served' && hasAllergyTables) {
      setConfirmAllergy(true);
      return;
    }
    onAdvance(next);
  }

  return (
    <>
      <div
        className={`kds-course-card kds-course-card--${size} kds-course-card--${status}`}
        style={{ borderColor: color }}
        onContextMenu={(e) => { e.preventDefault(); onLongPress?.(); }}
      >
        <div className="kds-course-card__header">
          <span className="kds-course-card__number">Gang {number}</span>
          <span className="kds-course-card__status" style={{ color }}>
            <span className="kds-status-dot" style={{ background: color }} />
            {STATUS_LABELS[status]}
          </span>
        </div>

        <h2 className="kds-course-card__title">{title}</h2>

        <div className="kds-course-card__meta">
          <span>{guests} gasten</span>
          {countdownLabel && <span className="kds-course-card__countdown">{countdownLabel}</span>}
        </div>

        {hasAllergyTables && (
          <div className="kds-course-card__tables">
            {tableExceptions.map((t) => (
              <span key={t.table_id} className="kds-course-card__table-chip" title={t.allergen_flags.join(', ')}>
                ⚠ Tafel {t.table_id}
              </span>
            ))}
          </div>
        )}

        {next && size === 'now' && (
          <button
            onClick={handleAdvance}
            className="kds-course-card__cta"
            style={{ background: color, color: '#0a0a0c' }}
          >
            {ADVANCE_LABEL[status]}
          </button>
        )}
        {next && size === 'next' && (
          <button onClick={handleAdvance} className="kds-course-card__cta kds-course-card__cta--small">
            {ADVANCE_LABEL[status]}
          </button>
        )}
        {status === 'served' && onRecall && (
          <button onClick={onRecall} className="kds-course-card__recall">
            Recall (60s)
          </button>
        )}
      </div>

      {confirmAllergy && (
        <div className="kds-modal-bg" onClick={() => setConfirmAllergy(false)}>
          <div className="kds-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Allergie-bevestiging</h3>
            <p>Dit gerecht gaat naar tafels met een allergeen-aanpassing. Bevestig dat de juiste versie is bereid voor:</p>
            <ul>
              {tableExceptions.map((t) => (
                <li key={t.table_id}>
                  <strong>Tafel {t.table_id}</strong> — {t.allergen_flags.join(', ')}
                </li>
              ))}
            </ul>
            <div className="kds-modal__actions">
              <button onClick={() => setConfirmAllergy(false)} className="kds-modal__cancel">
                Annuleren
              </button>
              <button
                onClick={() => {
                  setConfirmAllergy(false);
                  onAdvance('served', true);
                }}
                className="kds-modal__confirm"
              >
                ✓ Bevestigd, vervangen
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
