/* ═══════════════════════════════════════════════════════════════════
   Archief — Kistje Masonry Grid (Screen 1) + Search Result Row (Screen 6)
   CSS-columns masonry, 3-col desktop. Wood texture bg.
   ═══════════════════════════════════════════════════════════════════ */

/* ── Search Bar (Notion-style monolithic) ──────────────────── */
const ArSearchBar = ({ query, setQuery, resultCount, totalAmount }) => (
  <div style={{ marginBottom: 16 }}>
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px',
      background: 'var(--card)', backdropFilter: 'var(--glass-blur)',
      border: '1px solid var(--border)', borderRadius: 14,
      transition: 'border-color .15s',
    }}>
      <ArIcon name="search" size={20} color={query ? 'var(--brand)' : 'var(--muted)'} />
      <input
        value={query} onChange={e => setQuery(e.target.value)}
        placeholder="Zoek in alle bonnen, facturen en documenten…"
        style={{
          flex: 1, background: 'none', border: 'none', outline: 'none',
          color: 'var(--text)', fontSize: 15, fontFamily: 'var(--font-sans)',
        }}
      />
      {query && (
        <button onClick={() => setQuery('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', display: 'flex' }}>
          <ArIcon name="x" size={16} />
        </button>
      )}
      <kbd style={{
        fontSize: 10, padding: '3px 8px', border: '1px solid var(--border)',
        borderRadius: 6, fontFamily: 'var(--font-mono)', color: 'var(--muted)',
        background: 'rgba(130,130,130,.06)',
      }}>⌘K</kbd>
    </div>
  </div>
);

/* ── Active Filters Bar ────────────────────────────────────── */
const ArActiveFilters = ({ filters, setFilters, filteredCount, filteredTotal }) => {
  const pills = [];
  if (filters.datum) pills.push({ key: 'datum', label: `Datum: ${filters.datum}`, clear: () => setFilters(p => ({ ...p, datum: null })) });
  (filters.leverancier || []).forEach(l => pills.push({ key: `lev-${l}`, label: `Leverancier: ${l}`, clear: () => setFilters(p => ({ ...p, leverancier: p.leverancier.filter(x => x !== l) })) }));
  (filters.status || []).forEach(s => pills.push({ key: `st-${s}`, label: `Status: ${s}`, clear: () => setFilters(p => ({ ...p, status: p.status.filter(x => x !== s) })) }));
  (filters.type || []).forEach(t => pills.push({ key: `ty-${t}`, label: `Type: ${t}`, clear: () => setFilters(p => ({ ...p, type: p.type.filter(x => x !== t) })) }));
  (filters.tags || []).forEach(t => pills.push({ key: `tg-${t}`, label: t, clear: () => setFilters(p => ({ ...p, tags: p.tags.filter(x => x !== t) })) }));
  if (filters.bedrag) pills.push({ key: 'bedrag', label: `Bedrag: ${filters.bedrag}`, clear: () => setFilters(p => ({ ...p, bedrag: null })) });

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, minHeight: 28, flexWrap: 'wrap', gap: 8 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, flex: 1 }}>
        {pills.map(p => (
          <ArPill key={p.key} variant="optie" onRemove={p.clear}>{p.label}</ArPill>
        ))}
        {pills.length > 1 && (
          <span onClick={() => setFilters({})} style={{ fontSize: 11, color: 'var(--muted)', cursor: 'pointer', padding: '3px 8px', textDecoration: 'underline' }}>
            Wis alles
          </span>
        )}
      </div>
      <div style={{ fontSize: 12, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', fontFamily: 'var(--font-mono)' }}>
        {filteredCount} bonnen · {fmtEur(filteredTotal)}
      </div>
    </div>
  );
};

/* ── Search Result Row with Snippet (Screen 6) ────────────── */
const ArSearchResultRow = ({ bon, query, onClick }) => {
  const highlightSnippet = (text, q) => {
    if (!q || !text) return text;
    const lower = text.toLowerCase();
    const qLower = q.toLowerCase();
    const idx = lower.indexOf(qLower);
    if (idx === -1) return text;
    return (
      <span>
        {text.slice(0, idx)}
        <mark style={{ background: 'rgba(255,191,0,.3)', color: 'var(--text)', borderRadius: 2, padding: '0 2px' }}>{text.slice(idx, idx + q.length)}</mark>
        {text.slice(idx + q.length)}
      </span>
    );
  };

  return (
    <div onClick={onClick} style={{
      display: 'flex', gap: 14, alignItems: 'flex-start', padding: '14px 16px',
      borderRadius: 12, border: '1px solid transparent', cursor: 'pointer',
      transition: 'background .15s, border-color .15s',
    }} className="ar-search-row">
      <div style={{ width: 54, height: 68, flexShrink: 0 }}>
        <ArReceiptThumb supplier={bon.supplier} type={bon.type} amount={bon.amount} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Breadcrumb */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, marginBottom: 4 }}>
          <span style={{ fontWeight: 600, color: 'var(--text)' }}>{bon.supplier}</span>
          <span style={{ color: 'var(--muted-light)' }}>·</span>
          <span style={{ color: 'var(--muted)' }}>{fmtDate(bon.date)}</span>
          <span style={{ color: 'var(--muted-light)' }}>·</span>
          <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text)', fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>{fmtEur(bon.amount)}</span>
        </div>
        {/* Snippet */}
        <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
          …{highlightSnippet(bon.snippet, query)}
        </div>
        {/* Tags */}
        <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
          {bon.tags.slice(0, 3).map(t => (
            <span key={t} style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, background: 'rgba(130,130,130,.08)', color: 'var(--muted)', fontWeight: 600 }}>{t}</span>
          ))}
          {bon.hasEvent && (
            <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, background: 'rgba(196,163,90,.1)', color: 'var(--brand-gold)', fontWeight: 600 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                <ArIcon name="calendar" size={9} />{bon.hasEvent}
              </span>
            </span>
          )}
        </div>
      </div>
      <ArIcon name="chevron-right" size={14} color="var(--muted-light)" style={{ marginTop: 4, flexShrink: 0 }} />
    </div>
  );
};

/* ── Masonry Card ──────────────────────────────────────────── */
const ArMasonryCard = ({ bon, query, onClick, selected, onSelect }) => {
  const [hovered, setHovered] = React.useState(false);

  const catColors = {
    'Vlees & vis': 'var(--red)',
    'Kruiden & sauzen': 'var(--purple)',
    'Houtskool & rookhout': 'var(--orange)',
    'Zuivel & bakkerij': 'var(--blue)',
    'Dranken': 'var(--cyan)',
    'Disposables': 'var(--muted)',
    'Groenten & fruit': 'var(--green)',
    'Brandstof': 'var(--amber)',
  };
  const catColor = catColors[bon.category] || 'var(--muted)';

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        breakInside: 'avoid', marginBottom: 12, borderRadius: 14, overflow: 'hidden',
        background: 'var(--card)', backdropFilter: 'var(--glass-blur)',
        border: `1px solid ${selected ? 'rgba(255,191,0,.4)' : 'rgba(130,130,130,.12)'}`,
        cursor: 'pointer', transition: 'transform .2s ease, box-shadow .2s ease, border-color .15s',
        transform: hovered ? 'translateY(-2px)' : 'none',
        boxShadow: hovered ? 'var(--lift-shadow)' : 'none',
        position: 'relative',
      }}
    >
      {/* Gold hairline */}
      <div style={{ position:'absolute', top:0, left:'15%', right:'15%', height:1, background:'linear-gradient(90deg,transparent,rgba(196,163,90,.35),transparent)', zIndex:1 }} />

      {/* Select checkbox */}
      <div onClick={e => { e.stopPropagation(); onSelect && onSelect(bon.id); }} style={{
        position: 'absolute', top: 10, left: 10, zIndex: 2, width: 20, height: 20,
        borderRadius: 5, border: `1.5px solid ${selected ? 'var(--brand)' : 'rgba(130,130,130,.3)'}`,
        background: selected ? 'var(--brand)' : 'rgba(0,0,0,.4)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: '.15s', opacity: selected || hovered ? 1 : 0,
      }}>
        {selected && <ArIcon name="check" size={12} color="#000" />}
      </div>

      {/* Thumbnail */}
      <div style={{ height: 180, padding: 10, paddingBottom: 0 }}>
        <ArReceiptThumb supplier={bon.supplier} type={bon.type} amount={bon.amount} />
      </div>

      {/* Content */}
      <div style={{ padding: '12px 14px 14px' }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 300, marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {bon.supplier}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>{fmtDateShort(bon.date)}</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{fmtEur(bon.amount)}</span>
        </div>

        {/* Snippet on hover */}
        {hovered && query && bon.snippet && (
          <div style={{
            fontSize: 10, color: 'var(--muted)', lineHeight: 1.5, marginBottom: 8,
            padding: '6px 8px', borderRadius: 6, background: 'rgba(255,191,0,.04)',
            border: '1px solid rgba(255,191,0,.1)', overflow: 'hidden',
            textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          }}>
            …{bon.snippet}
          </div>
        )}

        {/* Bottom row: category + tags */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 4, background: `color-mix(in srgb, ${catColor} 12%, transparent)`, color: catColor, fontWeight: 600 }}>
            {bon.category}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {bon.locked && <ArIcon name="lock" size={10} color="var(--blue)" />}
            <ArStatusPill status={bon.status} />
          </div>
        </div>
      </div>
    </div>
  );
};

/* ── Kistje Grid View ──────────────────────────────────────── */
const ArKistjeGrid = ({ bonnen, query, onBonClick, selectedIds, onSelect }) => {
  if (bonnen.length === 0) return null;

  return (
    <div style={{ position: 'relative' }}>
      {/* Subtle wood texture overlay */}
      <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', opacity: .035, zIndex: 0 }} xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="wood" width="120" height="120" patternUnits="userSpaceOnUse">
            <line x1="0" y1="20" x2="120" y2="22" stroke="#c4a35a" strokeWidth=".5" />
            <line x1="0" y1="48" x2="120" y2="46" stroke="#c4a35a" strokeWidth=".3" />
            <line x1="0" y1="72" x2="120" y2="74" stroke="#c4a35a" strokeWidth=".4" />
            <line x1="0" y1="98" x2="120" y2="96" stroke="#c4a35a" strokeWidth=".3" />
            <circle cx="60" cy="60" r="8" fill="none" stroke="#c4a35a" strokeWidth=".2" opacity=".5" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#wood)" />
      </svg>

      {/* Masonry grid */}
      <div style={{ columns: 3, columnGap: 12, position: 'relative', zIndex: 1 }} className="ar-masonry">
        {bonnen.map(bon => (
          <ArMasonryCard
            key={bon.id} bon={bon} query={query}
            onClick={() => onBonClick(bon)}
            selected={selectedIds.includes(bon.id)}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  );
};

Object.assign(window, { ArSearchBar, ArActiveFilters, ArSearchResultRow, ArMasonryCard, ArKistjeGrid });
