'use client';
import { useEffect, useState } from 'react';
import { Sparkles, AlertTriangle, X } from 'lucide-react';

interface Opmerking {
  type: 'ontbrekend_doel' | 'lange_rit' | 'ontbrekend_event_link' | 'duplicaat_verdacht' | 'anders';
  rit_id: number;
  uitleg: string;
}

interface Recap {
  samenvatting: string;
  opmerkelijkheden: Opmerking[];
  advies_boekhouder: string;
}

interface Props {
  jaar: number;
  kwartaal: 1 | 2 | 3 | 4;
  onClose: () => void;
}

const TYPE_LABEL: Record<Opmerking['type'], string> = {
  ontbrekend_doel: 'Doel ontbreekt',
  lange_rit: 'Lange rit',
  ontbrekend_event_link: 'Geen event-koppeling',
  duplicaat_verdacht: 'Mogelijk duplicaat',
  anders: 'Overig',
};

function fmtEUR(n: number): string {
  return n.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function RecapDialog({ jaar, kwartaal, onClose }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recap, setRecap] = useState<Recap | null>(null);
  const [totalen, setTotalen] = useState<{ totaal_km: number; totaal_aftrek: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/ritten/recap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jaar, kwartaal }),
    })
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body.error ?? 'Onbekende fout');
        return body;
      })
      .then((body) => {
        if (cancelled) return;
        setRecap(body.recap);
        setTotalen(body.totalen_server);
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e.message);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [jaar, kwartaal]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="rounded-lg shadow-xl p-6 max-w-2xl w-full max-h-[90vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
        style={{ background: 'var(--card, #fff)' }}
      >
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" style={{ color: 'var(--color-accent-gold, #b59456)' }} />
            <h2 className="text-lg font-semibold">
              Recap Q{kwartaal} {jaar}
            </h2>
          </div>
          <button onClick={onClose} aria-label="Sluiten" className="p-1 rounded hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>

        {loading && (
          <div className="space-y-3">
            <div className="h-8 rounded animate-pulse" style={{ background: 'var(--bg-soft, #eee)' }} />
            <div className="h-20 rounded animate-pulse" style={{ background: 'var(--bg-soft, #eee)' }} />
            <div className="h-32 rounded animate-pulse" style={{ background: 'var(--bg-soft, #eee)' }} />
          </div>
        )}

        {error && (
          <p className="text-sm" style={{ color: 'var(--danger, #c00)' }}>
            {error}
          </p>
        )}

        {!loading && !error && recap && totalen && (
          <>
            <div
              className="grid grid-cols-2 gap-3 p-4 rounded-md mb-4"
              style={{ background: 'var(--bg-soft, #f5f5f5)' }}
            >
              <div>
                <div className="text-xs uppercase tracking-wide" style={{ color: 'var(--muted, #888)' }}>
                  Zakelijke km
                </div>
                <div className="text-2xl font-semibold tabular-nums">{totalen.totaal_km}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide" style={{ color: 'var(--muted, #888)' }}>
                  Aftrekbaar
                </div>
                <div className="text-2xl font-semibold tabular-nums">€ {fmtEUR(totalen.totaal_aftrek)}</div>
              </div>
            </div>

            <p className="text-sm mb-4">{recap.samenvatting}</p>

            {recap.opmerkelijkheden.length > 0 && (
              <div className="mb-4">
                <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                  <AlertTriangle className="h-4 w-4" style={{ color: 'var(--warning, #c87800)' }} />
                  Opmerkelijkheden ({recap.opmerkelijkheden.length})
                </h3>
                <ul className="space-y-2">
                  {recap.opmerkelijkheden.map((o, i) => (
                    <li
                      key={i}
                      className="text-sm p-2 rounded border"
                      style={{ borderColor: 'var(--border, #e5e5e5)' }}
                    >
                      <span
                        className="inline-block px-2 py-0.5 rounded text-xs font-medium mr-2"
                        style={{
                          background: 'var(--bg-soft, #f5f5f5)',
                          color: 'var(--text, #333)',
                        }}
                      >
                        {TYPE_LABEL[o.type] ?? 'Overig'}
                      </span>
                      <span className="text-xs" style={{ color: 'var(--muted, #888)' }}>
                        rit #{o.rit_id}
                      </span>
                      <div className="mt-1">{o.uitleg}</div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div
              className="p-3 rounded-md text-sm"
              style={{ background: 'var(--bg-soft, #f5f5f5)', color: 'var(--text, #333)' }}
            >
              <strong>Voor de boekhouder:</strong> {recap.advies_boekhouder}
            </div>

            <p className="text-xs mt-4" style={{ color: 'var(--muted, #888)' }}>
              AI-gegenereerd door Haiku 4.5. Bedragen + km zijn servergerekend, niet door AI.
            </p>
          </>
        )}

        <div className="mt-6 flex justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded-md border text-sm hover:bg-muted">
            Sluiten
          </button>
        </div>
      </div>
    </div>
  );
}
