'use client';

interface GangPill {
  slug: string;
  label: string;
  icon: string;
  count: number;
}

interface Props {
  gangen: GangPill[];
  active: string | null;
  onSelect: (slug: string | null) => void;
}

export default function GangFilterPills({ gangen, active, onSelect }: Props) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
      {gangen.map((g) => {
        const isActive = active === g.slug;
        return (
          <button
            key={g.slug}
            onClick={() => onSelect(isActive ? null : g.slug)}
            className="gang-pill"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7,
              padding: '7px 13px',
              borderRadius: 999,
              border: '1px solid ' + (isActive ? 'var(--brand)' : 'var(--border)'),
              background: isActive
                ? 'color-mix(in oklab, var(--brand) 14%, transparent)'
                : 'rgba(255,255,255,.02)',
              color: isActive ? 'var(--brand)' : 'var(--text)',
              fontSize: 12,
              fontWeight: 500,
              cursor: 'pointer',
              fontFamily: 'inherit',
              transition: 'all .12s',
            }}
            aria-pressed={isActive}
          >
            <span style={{ fontSize: 14 }}>{g.icon}</span>
            {g.label}
            <span
              style={{
                fontSize: 11,
                color: isActive ? 'var(--brand)' : 'var(--muted)',
                fontVariantNumeric: 'tabular-nums',
                background: isActive ? 'rgba(0,0,0,.25)' : 'rgba(255,255,255,.04)',
                padding: '1px 7px',
                borderRadius: 999,
                fontWeight: 600,
              }}
            >
              {g.count}
            </span>
          </button>
        );
      })}
      <style jsx>{`
        :global(.gang-pill:hover) {
          border-color: var(--brand) !important;
          background: rgba(255, 191, 0, 0.06) !important;
        }
      `}</style>
    </div>
  );
}
