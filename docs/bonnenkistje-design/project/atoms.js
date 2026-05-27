/* ═══════════════════════════════════════════════════════════════════
   ATOMS & CHROME — shared primitives, sidebar, topbar
   ═══════════════════════════════════════════════════════════════════ */

const { useState, useEffect, useRef, useMemo, Fragment } = React;

/* ── Brand mark ─────────────────────────────────────────── */
const BrandMark = ({ size = 22 }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192" width={size} height={size}>
    <rect width="192" height="192" rx="24" fill="#121215" />
    <path d="M44 100 C44 60, 148 60, 148 100" fill="none" stroke="#c4a35a" strokeWidth="6" strokeLinecap="round" />
    <line x1="52" y1="100" x2="140" y2="100" stroke="#c4a35a" strokeWidth="4" strokeLinecap="round" />
    <line x1="60" y1="88" x2="60" y2="112" stroke="#c4a35a" strokeWidth="3" strokeLinecap="round" />
    <line x1="80" y1="82" x2="80" y2="112" stroke="#c4a35a" strokeWidth="3" strokeLinecap="round" />
    <line x1="96" y1="80" x2="96" y2="112" stroke="#c4a35a" strokeWidth="3" strokeLinecap="round" />
    <line x1="112" y1="82" x2="112" y2="112" stroke="#c4a35a" strokeWidth="3" strokeLinecap="round" />
    <line x1="132" y1="88" x2="132" y2="112" stroke="#c4a35a" strokeWidth="3" strokeLinecap="round" />
    <line x1="64" y1="112" x2="56" y2="144" stroke="#c4a35a" strokeWidth="5" strokeLinecap="round" />
    <line x1="128" y1="112" x2="136" y2="144" stroke="#c4a35a" strokeWidth="5" strokeLinecap="round" />
    <path d="M78 56 C78 48, 84 48, 84 40" fill="none" stroke="rgba(196,163,90,0.5)" strokeWidth="3" strokeLinecap="round" />
    <path d="M96 52 C96 44, 102 44, 102 36" fill="none" stroke="rgba(196,163,90,0.5)" strokeWidth="3" strokeLinecap="round" />
    <path d="M114 56 C114 48, 120 48, 120 40" fill="none" stroke="rgba(196,163,90,0.5)" strokeWidth="3" strokeLinecap="round" />
  </svg>
);

/* ── Icon (Lucide) ──────────────────────────── */
const toPascal = s => s.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join('');
const Icon = ({ name, size = 18, color, style, ...rest }) => {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current || !window.lucide) return;
    const pascalName = toPascal(name);
    // Lucide modern API: icons[Name] is [tag, attrs, children[]]
    let iconDef = window.lucide.icons?.[pascalName] || window.lucide[pascalName];
    if (!iconDef) iconDef = window.lucide.Circle;
    if (!iconDef) { ref.current.innerHTML = ''; return; }
    try {
      // Modern format: ['svg', baseAttrs, children]
      if (Array.isArray(iconDef)) {
        const children = iconDef[2] || iconDef;
        const inner = (Array.isArray(children) ? children : [children]).map(child => {
          if (!Array.isArray(child)) return '';
          const [tag, attrs] = child;
          const attrStr = Object.entries(attrs || {}).map(([k, v]) => `${k}="${v}"`).join(' ');
          return `<${tag} ${attrStr} />`;
        }).join('');
        ref.current.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color || 'currentColor'}" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
      } else if (iconDef.toSvg) {
        const attrs = { width: size, height: size, 'stroke-width': 1.75 };
        if (color) attrs.stroke = color;
        ref.current.innerHTML = iconDef.toSvg(attrs);
      }
    } catch (e) { ref.current.innerHTML = ''; }
  }, [name, size, color]);
  return <span ref={ref} style={{ display: 'inline-flex', lineHeight: 0, color: color || 'currentColor', ...style }} {...rest} />;
};

/* ── Atoms ──────────────────────────── */
const Pill = ({ variant = 'draft', children, icon, style, onClick }) => (
  <span className={`pill pill-${variant}`} style={style} onClick={onClick}>
    {icon && <Icon name={icon} size={11} />}
    {children}
  </span>
);
const Button = ({ variant = 'ghost', children, icon, iconRight, size, onClick, style, type }) => (
  <button type={type || 'button'} className={`btn btn-${variant} ${size === 'sm' ? 'btn-sm' : ''}`} onClick={onClick} style={style}>
    {icon && <Icon name={icon} size={14} />}
    {children}
    {iconRight && <Icon name={iconRight} size={14} />}
  </button>
);
const Eyebrow = ({ children, style }) => <div className="eyebrow" style={style}>{children}</div>;

const StatTile = ({ label, value, sub, tone, icon }) => (
  <div className="metal"><div className="metal-body">
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
      <Eyebrow>{label}</Eyebrow>
      {icon && <Icon name={icon} size={14} color="var(--muted-light)" />}
    </div>
    <div className="metric metric-lg" style={{ color: tone === 'ok' ? 'var(--green)' : tone === 'warn' ? 'var(--amber)' : tone === 'bad' ? 'var(--red)' : 'var(--text)' }}>{value}</div>
    {sub && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>{sub}</div>}
  </div></div>
);

/* ── Sidebar ──────────────────────────── */
const NAV = [
  { section: 'Overzicht', items: [
    { id: 'dashboard', label: 'Dashboard', icon: 'layout-dashboard' },
    { id: 'agenda', label: 'Agenda', icon: 'calendar-days', badge: 'AI' },
  ]},
  { section: 'Events & Sales', items: [
    { id: 'events', label: 'Events', icon: 'party-popper' },
    { id: 'quotes', label: 'Offertes', icon: 'file-text' },
    { id: 'invoices', label: 'Facturen', icon: 'receipt' },
    { id: 'customers', label: 'Klanten', icon: 'heart-handshake' },
  ]},
  { section: 'Keuken & Operatie', items: [
    { id: 'menus', label: 'Menu & Recepten', icon: 'chef-hat' },
    { id: 'prep', label: 'Prep Schema', icon: 'clipboard-list' },
    { id: 'stock', label: 'Voorraad', icon: 'package' },
    { id: 'haccp', label: 'HACCP', icon: 'shield-check' },
  ]},
  { section: 'Financieel', items: [
    { id: 'price-intel', label: 'Price Intelligence', icon: 'trending-up', badge: 'AI' },
    { id: 'cogs', label: 'Inkoop & COGS', icon: 'euro' },
    { id: 'reports', label: 'Rapportage', icon: 'bar-chart-3' },
  ]},
  { section: 'Systeem', items: [
    { id: 'team', label: 'Team', icon: 'users' },
    { id: 'settings', label: 'Instellingen', icon: 'settings' },
  ]},
];

const Sidebar = ({ active, onNav }) => (
  <aside className="sidebar">
    <div className="sidebar-brand">
      <div className="sidebar-brand-icon"><BrandMark size={22} /></div>
      <div>
        <div className="sidebar-brand-word">BBQ ARCHITECT</div>
        <div className="sidebar-brand-sub">Hop &amp; Bites · Ambacht</div>
      </div>
    </div>
    {NAV.map(group => (
      <div key={group.section}>
        <div className="nav-section-label">{group.section}</div>
        {group.items.map(item => (
          <div key={item.id} className={`nav-item ${active === item.id ? 'active' : ''}`} onClick={() => onNav && onNav(item.id)}>
            <Icon name={item.icon} size={16} />
            <span>{item.label}</span>
            {item.badge && (
              <span style={{ marginLeft: 'auto', fontSize: 9, letterSpacing: '.1em', padding: '2px 6px', borderRadius: 4, background: 'rgba(255,191,0,.12)', color: 'var(--brand)', border: '1px solid rgba(255,191,0,.3)', fontWeight: 700 }}>
                {item.badge}
              </span>
            )}
          </div>
        ))}
      </div>
    ))}
  </aside>
);

const TopBar = ({ crumbs = ['Dashboard'] }) => {
  const [t, setT] = useState(new Date());
  useEffect(() => { const i = setInterval(() => setT(new Date()), 30000); return () => clearInterval(i); }, []);
  const hhmm = t.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
  return (
    <header className="topbar">
      <div className="breadcrumb">
        {crumbs.map((c, i) => (
          <span key={i} style={{ display: 'contents' }}>
            {i > 0 && <Icon name="chevron-right" size={12} />}
            {i === crumbs.length - 1 ? <strong>{c}</strong> : <span>{c}</span>}
          </span>
        ))}
      </div>
      <div className="topbar-right">
        <div className="hstack" style={{ gap: 8, padding: '6px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, color: 'var(--muted)' }}>
          <Icon name="search" size={14} /> <span>Zoek factuur, bon, product…</span>
          <kbd style={{ marginLeft: 24, fontSize: 10, padding: '2px 6px', border: '1px solid var(--border)', borderRadius: 4, fontFamily: 'var(--font-mono)' }}>⌘K</kbd>
        </div>
        <button className="icon-btn"><Icon name="bell" size={16} /></button>
        <div style={{ fontSize: 12, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>{hhmm}</div>
        <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg, #c4a35a, #9e781c)', color: '#0a0a0c', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 12 }}>MB</div>
      </div>
    </header>
  );
};

/* ── Folder tabs — THE key change for Price Intelligence ───────── */
const FolderTabs = ({ active, onChange }) => {
  const tabs = [
    { id: 'invoices', label: 'AI Factuur Lezen', icon: 'file-scan', hint: 'Scan & extract' },
    { id: 'receipts', label: 'Bonnen', icon: 'receipt', hint: 'Kassabonnen · foto' },
    { id: 'books', label: 'Boekhouding', icon: 'pie-chart', hint: 'Inzichten & AI' },
  ];
  return (
    <div className="folder-tabs">
      {tabs.map(t => (
        <button key={t.id} className={`folder-tab ${active === t.id ? 'active' : ''}`} onClick={() => onChange(t.id)}>
          <div className={`folder-tab-ico ${active === t.id ? 'active' : ''}`}>
            <Icon name={t.icon} size={18} />
          </div>
          <div style={{ textAlign: 'left', minWidth: 0 }}>
            <div className="folder-tab-label">{t.label}</div>
            <div className="folder-tab-hint">{t.hint}</div>
          </div>
          {active === t.id && <div className="folder-tab-rail" />}
        </button>
      ))}
    </div>
  );
};

/* ── Drawer shell (right-side) ──────────── */
const Drawer = ({ open, onClose, children, width = 680 }) => {
  if (!open) return null;
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', backdropFilter: 'blur(4px)', zIndex: 9998 }} />
      <aside className="ai-drawer" style={{ width, animation: 'slideInRight .35s cubic-bezier(.16,1,.3,1)' }}>
        {children}
      </aside>
    </>
  );
};

Object.assign(window, {
  useState, useEffect, useRef, useMemo, Fragment,
  BrandMark, Icon, Pill, Button, Eyebrow, StatTile,
  Sidebar, TopBar, FolderTabs, Drawer,
});
