/* ═══════════════════════════════════════════════════════════════════
   Archief Bonnenkistje — Main App
   Orchestrates all screens with screen-nav + responsive layout
   ═══════════════════════════════════════════════════════════════════ */

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "viewMode": "kistje",
  "showEmpty": false,
  "density": "comfortable",
  "woodTexture": true
}/*EDITMODE-END*/;

const ArchiefApp = () => {
  /* ── Screen navigator (for demo) ────────────────────────── */
  const screens = [
    { id: 'kistje', label: 'Kistje-mode' },
    { id: 'tabel', label: 'Tabel-mode' },
    { id: 'search', label: 'Zoekresultaten' },
    { id: 'inbox', label: 'Inbox' },
    { id: 'empty', label: 'Empty state' },
    { id: 'export', label: 'Bulk-export' },
    { id: 'deellink', label: 'Deellink' },
  ];
  const [screen, setScreen] = React.useState('kistje');

  /* ── State ──────────────────────────────────────────────── */
  const [query, setQuery] = React.useState('');
  const [filters, setFilters] = React.useState({});
  const [selectedIds, setSelectedIds] = React.useState([]);
  const [detailBon, setDetailBon] = React.useState(null);
  const [sidebarVisible, setSidebarVisible] = React.useState(true);
  const [mobileFilterOpen, setMobileFilterOpen] = React.useState(false);
  const [exportOpen, setExportOpen] = React.useState(false);
  const [deellinkOpen, setDeellinkOpen] = React.useState(false);
  const [density, setDensity] = React.useState(TWEAK_DEFAULTS.density);

  /* ── Tweaks ─────────────────────────────────────────────── */
  const { useTweaks, TweaksPanel, TweakSection, TweakRadio, TweakToggle } = window.__tweaks || {};
  let tweaks, setTweak;
  if (useTweaks) {
    [tweaks, setTweak] = useTweaks(TWEAK_DEFAULTS);
  } else {
    tweaks = TWEAK_DEFAULTS;
    setTweak = () => {};
  }

  /* ── Tab toggle (Archief ↔ Inbox, Screen 9) ────────────── */
  const isInbox = screen === 'inbox';

  /* ── Filter logic ───────────────────────────────────────── */
  const filtered = React.useMemo(() => {
    let list = [...window.ARCHIEF_BONNEN];
    if (query) {
      const q = query.toLowerCase();
      list = list.filter(b =>
        b.supplier.toLowerCase().includes(q) ||
        b.snippet.toLowerCase().includes(q) ||
        b.category.toLowerCase().includes(q) ||
        b.tags.some(t => t.toLowerCase().includes(q))
      );
    }
    if (filters.leverancier?.length) list = list.filter(b => filters.leverancier.includes(b.supplier));
    if (filters.status?.length) list = list.filter(b => filters.status.includes(b.status));
    if (filters.type?.length) list = list.filter(b => filters.type.includes(b.type));
    if (filters.tags?.length) list = list.filter(b => b.tags.some(t => filters.tags.includes(t)));
    if (filters.rgs?.length) list = list.filter(b => filters.rgs.includes(b.rgs));
    if (filters.bedrag === 'lt50') list = list.filter(b => b.amount < 50);
    if (filters.bedrag === '50-500') list = list.filter(b => b.amount >= 50 && b.amount <= 500);
    if (filters.bedrag === 'gt500') list = list.filter(b => b.amount > 500);
    return list;
  }, [query, filters]);

  const filteredTotal = filtered.reduce((s, b) => s + b.amount, 0);

  const toggleSelect = (id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };
  const selectAll = () => {
    if (filtered.every(b => selectedIds.includes(b.id))) setSelectedIds([]);
    else setSelectedIds(filtered.map(b => b.id));
  };

  const selectedBonnen = window.ARCHIEF_BONNEN.filter(b => selectedIds.includes(b.id));

  /* ── Mobile detect ──────────────────────────────────────── */
  const [isMobile, setIsMobile] = React.useState(window.innerWidth < 768);
  React.useEffect(() => {
    const h = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);

  /* Open export/deellink if navigated to those screens */
  React.useEffect(() => {
    if (screen === 'export') {
      if (selectedIds.length === 0) setSelectedIds(window.ARCHIEF_BONNEN.slice(0, 5).map(b => b.id));
      setExportOpen(true);
    } else setExportOpen(false);
    if (screen === 'deellink') setDeellinkOpen(true); else setDeellinkOpen(false);
    if (screen === 'search' && !query) setQuery('baktotaal');
  }, [screen]);

  return (
    <div style={{ display: 'contents' }}>
      {/* ── Screen Navigator ──────────────────────────────── */}
      <div className="screen-nav">
        <span className="screen-nav-label">Bonnenkistje</span>
        {screens.map((s, i) => (
          <button key={s.id} className={`screen-tab ${screen === s.id ? 'active' : ''}`} onClick={() => setScreen(s.id)}>
            <span className="screen-tab-num">{i + 1}</span>
            {s.label}
          </button>
        ))}
      </div>

      {/* ── App Shell ─────────────────────────────────────── */}
      <div className="screen-content">
        <div className="app-shell" style={isMobile ? { gridTemplateColumns: '1fr' } : {}}>
          {!isMobile && <ArSidebar />}

          <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
            <ArTopBar crumbs={isInbox ? ['Financieel', 'Inbox'] : ['Financieel', 'Bonnenkistje']} />

            <div style={{ display: 'flex', flex: 1 }}>
              {/* Filter sidebar (desktop, not inbox/empty) */}
              {!isMobile && !isInbox && screen !== 'empty' && sidebarVisible && (
                <ArFilterSidebar filters={filters} setFilters={setFilters} />
              )}

              {/* Main content */}
              <div className="content" style={{ flex: 1, minWidth: 0 }}>
                {/* Page header */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 12 }}>
                  <div>
                    <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <ArIcon name="archive" size={28} color="var(--brand-gold)" />
                      Bonnenkistje
                    </h1>
                    <p className="page-subtitle">Digitaal boekhoudarchief · doorzoekbaar tot op het woord</p>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {/* Archief ↔ Inbox toggle (Screen 9) */}
                    <div style={{
                      display: 'flex', borderRadius: 10, border: '1px solid var(--border)',
                      overflow: 'hidden', background: 'var(--bg-subtle)',
                    }}>
                      {['kistje', 'inbox'].map(m => (
                        <button key={m} onClick={() => setScreen(m === 'inbox' ? 'inbox' : 'kistje')} style={{
                          padding: '7px 14px', fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-sans)',
                          background: (m === 'inbox' ? isInbox : !isInbox) ? 'rgba(255,191,0,.08)' : 'transparent',
                          color: (m === 'inbox' ? isInbox : !isInbox) ? 'var(--text)' : 'var(--muted)',
                          border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                        }}>
                          <ArIcon name={m === 'inbox' ? 'inbox' : 'archive'} size={14} />
                          {m === 'inbox' ? 'Inbox' : 'Archief'}
                          {m === 'inbox' && <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 4, background: 'rgba(255,191,0,.2)', color: 'var(--brand)', fontWeight: 700 }}>
                            {window.ARCHIEF_INBOX.filter(i => i.status === 'nieuw').length}
                          </span>}
                        </button>
                      ))}
                    </div>

                    {!isInbox && screen !== 'empty' && (
                      <>
                        {/* View toggle: kistje ↔ tabel */}
                        <div style={{ display: 'flex', borderRadius: 8, border: '1px solid var(--border)', overflow: 'hidden' }}>
                          {[
                            { id: 'kistje', icon: 'layout-grid' },
                            { id: 'tabel', icon: 'list' },
                          ].map(v => (
                            <button key={v.id} onClick={() => setScreen(v.id)} style={{
                              padding: '6px 10px', background: (screen === v.id || (screen === 'search' && v.id === 'kistje')) ? 'rgba(255,191,0,.08)' : 'transparent',
                              border: 'none', cursor: 'pointer', color: (screen === v.id || (screen === 'search' && v.id === 'kistje')) ? 'var(--text)' : 'var(--muted)',
                              display: 'flex',
                            }}>
                              <ArIcon name={v.icon} size={16} />
                            </button>
                          ))}
                        </div>

                        <ArButton icon="share-2" variant="ghost" size="sm" onClick={() => setDeellinkOpen(true)}>Deel</ArButton>
                        <ArButton icon="file-archive" variant="ghost" size="sm" onClick={() => { if (selectedIds.length === 0) setSelectedIds(filtered.slice(0,5).map(b=>b.id)); setExportOpen(true); }}>Export</ArButton>

                        {/* Filter toggle (mobile) */}
                        {isMobile && (
                          <ArButton icon="sliders-horizontal" variant="ghost" size="sm" onClick={() => setMobileFilterOpen(true)}>Filter</ArButton>
                        )}
                        {/* Filter toggle (desktop) */}
                        {!isMobile && (
                          <button onClick={() => setSidebarVisible(!sidebarVisible)} className="icon-btn" title="Toggle filters">
                            <ArIcon name="panel-left-close" size={16} />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* Search Bar */}
                {!isInbox && screen !== 'empty' && (
                  <ArSearchBar query={query} setQuery={setQuery} />
                )}

                {/* Active filters row */}
                {!isInbox && screen !== 'empty' && (
                  <ArActiveFilters filters={filters} setFilters={setFilters} filteredCount={filtered.length} filteredTotal={filteredTotal} />
                )}

                {/* ── Screen content ──────────────────────── */}
                {screen === 'empty' && <ArEmptyState />}

                {screen === 'inbox' && <ArInboxView />}

                {screen === 'search' && query && (
                  <div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <ArIcon name="search" size={13} />
                      <span>{filtered.length} resultaten voor "<strong style={{ color: 'var(--brand)' }}>{query}</strong>"</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      {filtered.map(bon => (
                        <ArSearchResultRow key={bon.id} bon={bon} query={query} onClick={() => setDetailBon(bon)} />
                      ))}
                    </div>
                  </div>
                )}

                {screen === 'kistje' && (
                  <ArKistjeGrid
                    bonnen={filtered} query={query}
                    onBonClick={b => setDetailBon(b)}
                    selectedIds={selectedIds} onSelect={toggleSelect}
                  />
                )}

                {screen === 'tabel' && (
                  <ArTabelView
                    bonnen={filtered} query={query}
                    onBonClick={b => setDetailBon(b)}
                    selectedIds={selectedIds} onSelect={toggleSelect}
                    onSelectAll={selectAll} density={density} setDensity={setDensity}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Detail Drawer (Screen 4) ──────────────────────── */}
      {detailBon && <ArDetailDrawer bon={detailBon} onClose={() => setDetailBon(null)} query={query} />}

      {/* ── Modals (Screens 7 & 8) ────────────────────────── */}
      <ArBulkExportModal open={exportOpen} onClose={() => { setExportOpen(false); if(screen==='export') setScreen('kistje'); }} selectedBonnen={selectedBonnen} />
      <ArDeellinkModal open={deellinkOpen} onClose={() => { setDeellinkOpen(false); if(screen==='deellink') setScreen('kistje'); }} />

      {/* ── Mobile filter bottom sheet ────────────────────── */}
      {isMobile && mobileFilterOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9997, display: 'flex', flexDirection: 'column' }}>
          <div onClick={() => setMobileFilterOpen(false)} style={{ flex: 1, background: 'rgba(0,0,0,.5)' }} />
          <div style={{ background: 'var(--bg-elevated)', borderRadius: '16px 16px 0 0', maxHeight: '75vh', overflowY: 'auto', animation: 'fadeInUp .3s ease both' }}>
            <ArFilterSidebar filters={filters} setFilters={setFilters} onClose={() => setMobileFilterOpen(false)} isMobile={true} />
          </div>
        </div>
      )}

      {/* ── AI Fab ────────────────────────────────────────── */}
      <button style={{
        position: 'fixed', bottom: 24, right: 24, width: 54, height: 54,
        borderRadius: '50%', background: 'var(--brand)', border: 'none',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', boxShadow: '0 4px 20px rgba(255,191,0,.35), inset 0 1px 0 rgba(255,255,255,.2)',
        zIndex: 9000, transition: '.2s',
      }}>
        <ArIcon name="sparkles" size={22} color="#000" />
      </button>

      {/* ── Tweaks Panel ──────────────────────────────────── */}
      {TweaksPanel && (
        <TweaksPanel>
          <TweakSection title="Weergave">
            <TweakRadio label="Standaard view" value={tweaks.viewMode} onChange={v => { setTweak('viewMode', v); setScreen(v); }} options={['kistje', 'tabel']} />
            <TweakToggle label="Lege staat tonen" value={tweaks.showEmpty} onChange={v => { setTweak('showEmpty', v); if(v) setScreen('empty'); else setScreen('kistje'); }} />
          </TweakSection>
        </TweaksPanel>
      )}
    </div>
  );
};

Object.assign(window, { ArchiefApp });
