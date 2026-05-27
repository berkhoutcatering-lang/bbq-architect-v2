/* ═══════════════════════════════════════════════════════════════════
   Archief — Tabel-mode (Screen 2)
   Dense TanStack-style table: sortable, sticky, bulk-select
   ═══════════════════════════════════════════════════════════════════ */

const ArTabelView = ({ bonnen, query, onBonClick, selectedIds, onSelect, onSelectAll, density, setDensity }) => {
  const [sortCol, setSortCol] = React.useState('date');
  const [sortDir, setSortDir] = React.useState('desc');

  const handleSort = (col) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('desc'); }
  };

  const sorted = React.useMemo(() => {
    const arr = [...bonnen];
    arr.sort((a, b) => {
      let va, vb;
      switch (sortCol) {
        case 'date': va = a.date; vb = b.date; break;
        case 'supplier': va = a.supplier; vb = b.supplier; break;
        case 'amount': va = a.amount; vb = b.amount; break;
        case 'btw': va = a.btw9 + a.btw21; vb = b.btw9 + b.btw21; break;
        case 'category': va = a.category; vb = b.category; break;
        case 'status': va = a.status; vb = b.status; break;
        default: va = a.date; vb = b.date;
      }
      if (typeof va === 'string') return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
      return sortDir === 'asc' ? va - vb : vb - va;
    });
    return arr;
  }, [bonnen, sortCol, sortDir]);

  const allSelected = bonnen.length > 0 && bonnen.every(b => selectedIds.includes(b.id));
  const pad = density === 'compact' ? '8px 12px' : '12px 14px';
  const fs = density === 'compact' ? 11 : 12;

  const SortHeader = ({ col, children, align }) => (
    <th onClick={() => handleSort(col)} style={{
      padding: pad, fontSize: 10, fontWeight: 700, letterSpacing: '.12em',
      textTransform: 'uppercase', color: sortCol === col ? 'var(--text)' : 'var(--muted)',
      cursor: 'pointer', userSelect: 'none', textAlign: align || 'left',
      position: 'sticky', top: 0, background: 'var(--bg-elevated)', zIndex: 2,
      borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap',
    }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        {children}
        {sortCol === col && <ArIcon name={sortDir === 'asc' ? 'chevron-up' : 'chevron-down'} size={10} />}
      </span>
    </th>
  );

  return (
    <div>
      {/* Density toggle */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8, gap: 4 }}>
        {['compact', 'comfortable'].map(d => (
          <span key={d} onClick={() => setDensity(d)} style={{
            padding: '4px 10px', borderRadius: 6, fontSize: 10, fontWeight: 600,
            cursor: 'pointer', textTransform: 'capitalize',
            background: density === d ? 'rgba(255,191,0,.1)' : 'transparent',
            color: density === d ? 'var(--brand)' : 'var(--muted)',
            border: `1px solid ${density === d ? 'rgba(255,191,0,.25)' : 'transparent'}`,
          }}>{d}</span>
        ))}
      </div>

      {/* Table */}
      <div style={{
        borderRadius: 14, overflow: 'hidden', border: '1px solid var(--border)',
        background: 'var(--card)', backdropFilter: 'var(--glass-blur)',
        position: 'relative',
      }}>
        {/* Gold hairline */}
        <div style={{ position:'absolute', top:0, left:'10%', right:'10%', height:1, background:'linear-gradient(90deg,transparent,rgba(196,163,90,.3),transparent)', zIndex:3 }} />

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: fs }}>
            <thead>
              <tr>
                <th style={{
                  width: 36, padding: pad, position: 'sticky', top: 0,
                  background: 'var(--bg-elevated)', zIndex: 2, borderBottom: '1px solid var(--border)',
                }}>
                  <input type="checkbox" checked={allSelected} onChange={() => onSelectAll()} style={{ accentColor: 'var(--brand)' }} />
                </th>
                <SortHeader col="date">Datum</SortHeader>
                <SortHeader col="supplier">Leverancier</SortHeader>
                <SortHeader col="amount" align="right">Bedrag</SortHeader>
                <SortHeader col="btw" align="right">BTW</SortHeader>
                <SortHeader col="category">Categorie (RGS)</SortHeader>
                <SortHeader col="status">Status</SortHeader>
                <th style={{
                  padding: pad, fontSize: 10, fontWeight: 700, letterSpacing: '.12em',
                  textTransform: 'uppercase', color: 'var(--muted)',
                  position: 'sticky', top: 0, background: 'var(--bg-elevated)', zIndex: 2,
                  borderBottom: '1px solid var(--border)',
                }}>Tags</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(bon => {
                const sel = selectedIds.includes(bon.id);
                return (
                  <tr key={bon.id}
                    onClick={() => onBonClick(bon)}
                    style={{
                      cursor: 'pointer', transition: 'background .1s',
                      background: sel ? 'rgba(255,191,0,.04)' : 'transparent',
                    }}
                    className="ar-table-row"
                  >
                    <td style={{ padding: pad, borderBottom: '1px solid rgba(130,130,130,.06)' }}>
                      <input type="checkbox" checked={sel} onChange={e => { e.stopPropagation(); onSelect(bon.id); }} style={{ accentColor: 'var(--brand)' }} />
                    </td>
                    <td style={{ padding: pad, borderBottom: '1px solid rgba(130,130,130,.06)', whiteSpace: 'nowrap', color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>
                      {fmtDateShort(bon.date)}
                    </td>
                    <td style={{ padding: pad, borderBottom: '1px solid rgba(130,130,130,.06)', fontWeight: 600 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {bon.supplier}
                        {bon.locked && <ArIcon name="lock" size={10} color="var(--blue)" />}
                      </div>
                    </td>
                    <td style={{ padding: pad, borderBottom: '1px solid rgba(130,130,130,.06)', textAlign: 'right', fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>
                      {fmtEur(bon.amount)}
                    </td>
                    <td style={{ padding: pad, borderBottom: '1px solid rgba(130,130,130,.06)', textAlign: 'right', fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums', fontSize: fs - 1, color: 'var(--muted)' }}>
                      <div>9%: {fmtEur(bon.btw9)}</div>
                      <div>21%: {fmtEur(bon.btw21)}</div>
                    </td>
                    <td style={{ padding: pad, borderBottom: '1px solid rgba(130,130,130,.06)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 10, color: 'var(--muted)' }}>{bon.category}</span>
                        <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--muted-light)' }}>{bon.rgs}</span>
                      </div>
                    </td>
                    <td style={{ padding: pad, borderBottom: '1px solid rgba(130,130,130,.06)' }}>
                      <ArStatusPill status={bon.status} />
                    </td>
                    <td style={{ padding: pad, borderBottom: '1px solid rgba(130,130,130,.06)' }}>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {bon.tags.slice(0, 2).map(t => (
                          <span key={t} style={{ fontSize: 9, padding: '1px 6px', borderRadius: 4, background: 'rgba(130,130,130,.08)', color: 'var(--muted)' }}>{t}</span>
                        ))}
                        {bon.tags.length > 2 && <span style={{ fontSize: 9, color: 'var(--muted-light)' }}>+{bon.tags.length - 2}</span>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bulk Action Bar */}
      {selectedIds.length > 0 && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px',
          background: 'var(--bg-elevated)', border: '1px solid var(--border)',
          borderRadius: 14, boxShadow: '0 12px 40px rgba(0,0,0,.5)',
          backdropFilter: 'var(--glass-blur)', zIndex: 100,
          animation: 'fadeInUp .25s ease both',
        }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>{selectedIds.length} geselecteerd</span>
          <div style={{ width: 1, height: 20, background: 'var(--border)' }} />
          <ArButton size="sm" icon="tag" variant="ghost">Tag</ArButton>
          <ArButton size="sm" icon="download" variant="ghost">Export</ArButton>
          <ArButton size="sm" icon="sparkles" variant="ghost">AI-categorize</ArButton>
        </div>
      )}
    </div>
  );
};

Object.assign(window, { ArTabelView });
