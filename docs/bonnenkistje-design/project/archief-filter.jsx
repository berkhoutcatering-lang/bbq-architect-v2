/* ═══════════════════════════════════════════════════════════════════
   Archief — Filter Sidebar (Screen 3, 240px)
   Datum, leverancier, status, type, tags, RGS, bedrag-range
   ═══════════════════════════════════════════════════════════════════ */

const ArFilterSidebar = ({ filters, setFilters, onClose, isMobile }) => {
  const [rgsOpen, setRgsOpen] = React.useState(false);
  const [leverancierSearch, setLeverancierSearch] = React.useState('');

  const toggle = (key, val) => {
    setFilters(prev => {
      const current = prev[key] || [];
      return { ...prev, [key]: current.includes(val) ? current.filter(v => v !== val) : [...current, val] };
    });
  };

  const setVal = (key, val) => setFilters(prev => ({ ...prev, [key]: val }));

  const filteredLev = window.ARCHIEF_LEVERANCIERS.filter(l =>
    l.name.toLowerCase().includes(leverancierSearch.toLowerCase())
  );

  const sectionStyle = { padding: '14px 0', borderBottom: '1px solid var(--border)' };
  const sectionTitle = { fontSize: 10, fontWeight: 700, letterSpacing: '.15em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 10 };
  const chipStyle = (active) => ({
    padding: '5px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer',
    background: active ? 'rgba(255,191,0,.1)' : 'rgba(130,130,130,.06)',
    color: active ? 'var(--brand)' : 'var(--muted)',
    border: `1px solid ${active ? 'rgba(255,191,0,.3)' : 'var(--border)'}`,
    transition: '.15s',
  });

  const wrapperStyle = isMobile ? {
    padding: '20px 18px', background: 'var(--bg-elevated)', height: '100%', overflowY: 'auto',
  } : {
    width: 240, flexShrink: 0, padding: '0 16px', borderRight: '1px solid var(--border)',
    height: 'calc(100vh - 56px)', overflowY: 'auto', position: 'sticky', top: 56,
  };

  return (
    <div style={wrapperStyle}>
      {isMobile && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <span style={{ fontSize: 16, fontWeight: 600 }}>Filters</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}><ArIcon name="x" size={20} /></button>
        </div>
      )}

      {/* Datum */}
      <div style={sectionStyle}>
        <div style={sectionTitle}>Datum</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {[
            { id: 'month', label: 'Deze maand' },
            { id: 'quarter', label: 'Vorig kwartaal' },
            { id: '2025', label: '2025' },
            { id: 'all', label: 'Alles' },
          ].map(d => (
            <span key={d.id} style={chipStyle(filters.datum === d.id)} onClick={() => setVal('datum', filters.datum === d.id ? null : d.id)}>
              {d.label}
            </span>
          ))}
        </div>
        <div style={{ marginTop: 10, display: 'flex', gap: 6, alignItems: 'center' }}>
          <input type="date" value={filters.dateFrom || ''} onChange={e => setVal('dateFrom', e.target.value)} className="input" style={{ flex: 1, fontSize: 11, padding: '5px 8px' }} />
          <span style={{ color: 'var(--muted)', fontSize: 11 }}>—</span>
          <input type="date" value={filters.dateTo || ''} onChange={e => setVal('dateTo', e.target.value)} className="input" style={{ flex: 1, fontSize: 11, padding: '5px 8px' }} />
        </div>
      </div>

      {/* Leverancier */}
      <div style={sectionStyle}>
        <div style={sectionTitle}>Leverancier</div>
        <input className="input" placeholder="Zoek leverancier…" value={leverancierSearch} onChange={e => setLeverancierSearch(e.target.value)} style={{ marginBottom: 8, fontSize: 12, padding: '6px 10px' }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 160, overflowY: 'auto' }}>
          {filteredLev.map(l => {
            const active = (filters.leverancier || []).includes(l.name);
            return (
              <label key={l.name} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 6px', borderRadius: 6, cursor: 'pointer', fontSize: 12, color: active ? 'var(--text)' : 'var(--muted)', background: active ? 'rgba(255,191,0,.04)' : 'transparent', transition: '.12s' }}>
                <input type="checkbox" checked={active} onChange={() => toggle('leverancier', l.name)} style={{ accentColor: 'var(--brand)' }} />
                <span style={{ flex: 1 }}>{l.name}</span>
                <span style={{ fontSize: 10, color: 'var(--muted-light)', fontVariantNumeric: 'tabular-nums' }}>{l.count}</span>
              </label>
            );
          })}
        </div>
      </div>

      {/* Status */}
      <div style={sectionStyle}>
        <div style={sectionTitle}>Status</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {Object.entries(window.STATUS_MAP).map(([key, s]) => {
            const active = (filters.status || []).includes(key);
            return (
              <ArPill key={key} variant={active ? s.variant : 'draft'} icon={s.icon} onClick={() => toggle('status', key)} style={{ cursor: 'pointer' }}>
                {s.label}
              </ArPill>
            );
          })}
        </div>
      </div>

      {/* Type */}
      <div style={sectionStyle}>
        <div style={sectionTitle}>Type</div>
        <div style={{ display: 'flex', gap: 6 }}>
          {['pdf', 'image', 'email'].map(t => {
            const active = (filters.type || []).includes(t);
            const labels = { pdf: 'PDF', image: 'Foto', email: 'E-mail' };
            const icons = { pdf: 'file-text', image: 'image', email: 'mail' };
            return (
              <span key={t} style={chipStyle(active)} onClick={() => toggle('type', t)}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <ArIcon name={icons[t]} size={11} />{labels[t]}
                </span>
              </span>
            );
          })}
        </div>
      </div>

      {/* Tags */}
      <div style={sectionStyle}>
        <div style={sectionTitle}>Tags</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {window.ARCHIEF_TAGS.slice(0, 10).map(tag => {
            const active = (filters.tags || []).includes(tag);
            return (
              <span key={tag} style={{ ...chipStyle(active), fontSize: 10, padding: '3px 8px' }} onClick={() => toggle('tags', tag)}>
                {tag}
              </span>
            );
          })}
        </div>
      </div>

      {/* RGS Categorie */}
      <div style={sectionStyle}>
        <div style={{ ...sectionTitle, display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', marginBottom: rgsOpen ? 10 : 0 }} onClick={() => setRgsOpen(!rgsOpen)}>
          <span>RGS-categorie</span>
          <ArIcon name={rgsOpen ? 'chevron-up' : 'chevron-down'} size={12} />
        </div>
        {rgsOpen && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {window.ARCHIEF_RGS.map(r => {
              const active = (filters.rgs || []).includes(r.code);
              return (
                <label key={r.code} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 6px', borderRadius: 6, cursor: 'pointer', fontSize: 11, color: active ? 'var(--text)' : 'var(--muted)' }}>
                  <input type="checkbox" checked={active} onChange={() => toggle('rgs', r.code)} style={{ accentColor: 'var(--brand)' }} />
                  <span style={{ flex: 1 }}>{r.label}</span>
                  <span style={{ fontSize: 10, color: 'var(--muted-light)', fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}>{r.count}</span>
                </label>
              );
            })}
          </div>
        )}
      </div>

      {/* Bedrag range */}
      <div style={sectionStyle}>
        <div style={sectionTitle}>Bedrag</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {[
            { id: 'lt50', label: '< €50' },
            { id: '50-500', label: '€50 – €500' },
            { id: 'gt500', label: '> €500' },
          ].map(b => (
            <span key={b.id} style={chipStyle(filters.bedrag === b.id)} onClick={() => setVal('bedrag', filters.bedrag === b.id ? null : b.id)}>
              {b.label}
            </span>
          ))}
        </div>
        <div style={{ marginTop: 8, display: 'flex', gap: 6, alignItems: 'center' }}>
          <input type="number" placeholder="Min" className="input" value={filters.bedragMin || ''} onChange={e => setVal('bedragMin', e.target.value)} style={{ flex: 1, fontSize: 11, padding: '5px 8px' }} />
          <span style={{ color: 'var(--muted)', fontSize: 11 }}>—</span>
          <input type="number" placeholder="Max" className="input" value={filters.bedragMax || ''} onChange={e => setVal('bedragMax', e.target.value)} style={{ flex: 1, fontSize: 11, padding: '5px 8px' }} />
        </div>
      </div>

      {/* Bewaarplicht footer */}
      <div style={{ padding: '16px 0 8px', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <ArIcon name="shield-check" size={14} color="var(--brand-gold)" style={{ marginTop: 2, flexShrink: 0 }} />
        <div style={{ fontSize: 10, color: 'var(--muted-light)', lineHeight: 1.5 }}>
          Bewaard tot <strong style={{ color: 'var(--muted)' }}>mei 2033</strong><br />
          7-jaar bewaarplicht (Art. 52 AWR)
        </div>
      </div>
    </div>
  );
};

Object.assign(window, { ArFilterSidebar });
