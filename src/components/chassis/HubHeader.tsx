'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { ChevronLeft, MoreHorizontal } from 'lucide-react';

/**
 * HubHeader — kruimelpad, titel, ondertitel, en rechtsboven precies één
 * primaire actie plus een overloopmenu.
 *
 * Vervangt de stapel die op de event-hub stond: kruimelpad, hub-tabs, een knop
 * "Terug naar events", een eyebrow met het eventnummer én de eigen tabrij —
 * vijf rijen voordat er inhoud kwam. En het lost het probleem op dat acht
 * knoppen in drie verschillende stijlen naast elkaar stonden: er is er één
 * primair, de rest zit in het menu.
 *
 * Op de telefoon: alleen de ouder in het kruimelpad, en de actie als volle knop
 * onder de titel in plaats van ernaast.
 */

export interface Kruimel {
  label: string;
  href?: string;
}

interface Props {
  kruimels?: Kruimel[];
  titel: string;
  /** Eén regel: datum, plaats, gasten. Of één zin wat deze pagina is. */
  onderschrift?: ReactNode;
  /** De enige primaire knop. Alles wat minder vaak gebeurt hoort in `meer`. */
  actie?: ReactNode;
  /** Overloopmenu-items. Krijgen automatisch een knop met drie puntjes. */
  meer?: { label: string; onClick: () => void; gevaarlijk?: boolean }[];
  /**
   * Het kruimelpad op desktop tonen. Standaard uit: binnen de app-shell staat er
   * al een kruimelbalk bovenaan, en een tweede eronder is precies de stapeling
   * die dit component moet opruimen. `kruimels` blijft wél nuttig zonder deze
   * vlag: op de telefoon verschijnt de ouder als terug-link, want daar toont de
   * shell geen pad.
   */
  toonKruimelpad?: boolean;
}

export default function HubHeader({ kruimels, titel, onderschrift, actie, meer, toonKruimelpad = false }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function buitenaf(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    function opEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuOpen(false);
    }
    document.addEventListener('mousedown', buitenaf);
    document.addEventListener('keydown', opEscape);
    return () => {
      document.removeEventListener('mousedown', buitenaf);
      document.removeEventListener('keydown', opEscape);
    };
  }, [menuOpen]);

  const ouder = kruimels && kruimels.length > 0 ? kruimels[kruimels.length - 1] : null;

  return (
    <div className="chassis-hubheader">
      {/* Kruimelpad — desktop: hele pad. Telefoon: alleen terug naar de ouder. */}
      {kruimels && kruimels.length > 0 && (
        <>
          {toonKruimelpad && (
          <nav aria-label="Kruimelpad" className="chassis-kruimels">
            {kruimels.map((k, i) => (
              <span key={k.label + i} style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                {i > 0 && <span aria-hidden="true" style={{ opacity: 0.5 }}>›</span>}
                {k.href ? (
                  <Link href={k.href} style={{ color: 'var(--muted)', textDecoration: 'none' }}>{k.label}</Link>
                ) : (
                  <span style={{ color: 'var(--muted)' }}>{k.label}</span>
                )}
              </span>
            ))}
            <span aria-hidden="true" style={{ opacity: 0.5 }}>›</span>
            <span style={{ color: 'var(--text)' }}>{titel}</span>
          </nav>
          )}

          {ouder?.href && (
            <Link href={ouder.href} className="chassis-terug">
              <ChevronLeft size={14} />{ouder.label}
            </Link>
          )}
        </>
      )}

      <div className="chassis-hubheader-rij">
        <div style={{ minWidth: 0 }}>
          <h1 className="chassis-titel">{titel}</h1>
          {onderschrift && <div className="chassis-onderschrift">{onderschrift}</div>}
        </div>

        {(actie || (meer && meer.length > 0)) && (
          <div className="chassis-acties" ref={wrapRef}>
            {actie}
            {meer && meer.length > 0 && (
              <div style={{ position: 'relative' }}>
                <button
                  type="button"
                  className="btn btn-ghost"
                  aria-label="Meer acties"
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                  onClick={() => setMenuOpen((v) => !v)}
                  style={{ minWidth: 44, minHeight: 44, justifyContent: 'center' }}
                >
                  <MoreHorizontal size={16} />
                </button>
                {menuOpen && (
                  <div
                    role="menu"
                    style={{
                      position: 'absolute', right: 0, top: 'calc(100% + 6px)', zIndex: 40,
                      minWidth: 200, background: 'var(--card-solid, var(--card))',
                      border: '1px solid var(--border)', borderRadius: 12,
                      boxShadow: 'var(--shadow-card)', overflow: 'hidden', padding: 4,
                    }}
                  >
                    {meer.map((m) => (
                      <button
                        key={m.label}
                        role="menuitem"
                        type="button"
                        onClick={() => { setMenuOpen(false); m.onClick(); }}
                        style={{
                          display: 'block', width: '100%', textAlign: 'left',
                          padding: '10px 12px', minHeight: 40, borderRadius: 8,
                          background: 'none', border: 'none', cursor: 'pointer',
                          font: '500 13px var(--font-sans)',
                          color: m.gevaarlijk ? 'var(--status-danger-text)' : 'var(--text)',
                        }}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
