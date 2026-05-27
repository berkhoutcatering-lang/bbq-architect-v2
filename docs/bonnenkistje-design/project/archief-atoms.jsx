/* ═══════════════════════════════════════════════════════════════════
   Archief Bonnenkistje — Atoms & Chrome
   Shared components: sidebar (with archief nav), search bar,
   receipt thumbnail, status pills, etc.
   ═══════════════════════════════════════════════════════════════════ */

/* ── Icon (Lucide) ─────────────────────────────────────────── */
const _arToPascal = s => s.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join('');
const ArIcon = ({ name, size = 18, color, style, className, ...rest }) => {
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (!ref.current || !window.lucide) return;
    const k = _arToPascal(name);
    let iconDef = window.lucide.icons?.[k] || window.lucide[k] || window.lucide.icons?.Circle;
    if (!iconDef) { ref.current.innerHTML = ''; return; }
    try {
      if (Array.isArray(iconDef)) {
        const ch = iconDef[2] || iconDef;
        const inner = (Array.isArray(ch) ? ch : [ch]).map(c => {
          if (!Array.isArray(c)) return '';
          const [tag, attrs] = c;
          return `<${tag} ${Object.entries(attrs||{}).map(([a,v])=>`${a}="${v}"`).join(' ')} />`;
        }).join('');
        ref.current.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color||'currentColor'}" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
      } else if (iconDef.toSvg) {
        ref.current.innerHTML = iconDef.toSvg({ width: size, height: size, 'stroke-width': 1.75, ...(color ? { stroke: color } : {}) });
      }
    } catch(e) { ref.current.innerHTML = ''; }
  }, [name, size, color]);
  return <span ref={ref} className={className} style={{ display:'inline-flex', lineHeight:0, color: color||'currentColor', ...style }} {...rest} />;
};

/* ── Brand mark ───────────────────────────────────────────── */
const ArBrandMark = ({ size = 22 }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192" width={size} height={size}>
    <rect width="192" height="192" rx="24" fill="#121215" />
    <path d="M44 100 C44 60, 148 60, 148 100" fill="none" stroke="#c4a35a" strokeWidth="6" strokeLinecap="round" />
    <line x1="52" y1="100" x2="140" y2="100" stroke="#c4a35a" strokeWidth="4" strokeLinecap="round" />
    {[60,80,96,112,132].map(x => <line key={x} x1={x} y1={x===60||x===132?88:x===96?80:82} x2={x} y2="112" stroke="#c4a35a" strokeWidth="3" strokeLinecap="round" />)}
    <line x1="64" y1="112" x2="56" y2="144" stroke="#c4a35a" strokeWidth="5" strokeLinecap="round" />
    <line x1="128" y1="112" x2="136" y2="144" stroke="#c4a35a" strokeWidth="5" strokeLinecap="round" />
    {[78,96,114].map((x,i) => <path key={x} d={`M${x} ${56-i*2} C${x} ${48-i*2},${x+6} ${48-i*2},${x+6} ${40-i*2}`} fill="none" stroke="rgba(196,163,90,0.5)" strokeWidth="3" strokeLinecap="round" />)}
  </svg>
);

/* ── Atoms ──────────────────────────────────────────────────── */
const ArPill = ({ variant = 'draft', children, icon, style: s, onClick, onRemove }) => (
  <span className={`pill pill-${variant}`} style={{ cursor: onClick ? 'pointer' : 'default', ...s }} onClick={onClick}>
    {icon && <ArIcon name={icon} size={11} />}
    {children}
    {onRemove && <span onClick={e => { e.stopPropagation(); onRemove(); }} style={{ marginLeft: 4, cursor: 'pointer', opacity: .6 }}>×</span>}
  </span>
);

const ArButton = ({ variant = 'ghost', children, icon, iconRight, size, onClick, style, disabled }) => (
  <button className={`btn btn-${variant} ${size === 'sm' ? 'btn-sm' : ''}`} onClick={onClick} style={{ opacity: disabled ? .5 : 1, pointerEvents: disabled ? 'none' : 'auto', ...style }} disabled={disabled}>
    {icon && <ArIcon name={icon} size={14} />}
    {children}
    {iconRight && <ArIcon name={iconRight} size={14} />}
  </button>
);

const ArEyebrow = ({ children, style }) => <div className="eyebrow" style={style}>{children}</div>;

/* ── Status mapping ────────────────────────────────────────── */
const STATUS_MAP = {
  pending:     { label: 'Pending', variant: 'draft', icon: 'clock' },
  bevestigd:   { label: 'Bevestigd', variant: 'ok', icon: 'check-circle-2' },
  twijfel:     { label: 'Twijfel', variant: 'optie', icon: 'alert-triangle' },
  vergrendeld: { label: 'Vergrendeld', variant: 'send', icon: 'lock' },
};

const ArStatusPill = ({ status }) => {
  const s = STATUS_MAP[status] || STATUS_MAP.pending;
  return <ArPill variant={s.variant} icon={s.icon}>{s.label}</ArPill>;
};

/* ── Receipt Thumbnail ─────────────────────────────────────── */
const ArReceiptThumb = ({ supplier, type, amount, style: s }) => {
  const isPdf = type === 'pdf';
  return (
    <div style={{ width: '100%', height: '100%', background: 'linear-gradient(180deg,#0a0a0c,#151518)', borderRadius: 8, border: '1px solid var(--border)', overflow: 'hidden', position: 'relative', ...s }}>
      {isPdf ? (
        <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div style={{
            width:'68%', height:'82%', background:'#f4f1e8', borderRadius:3,
            transform:'rotate(-3deg)', boxShadow:'0 8px 24px rgba(0,0,0,.5)',
            padding:'8px 10px', fontFamily:'var(--font-mono)', fontSize:7, color:'#333', lineHeight:1.4, overflow:'hidden',
          }}>
            <div style={{ textAlign:'center', fontWeight:700, fontSize:9, letterSpacing:'.1em' }}>{supplier.toUpperCase()}</div>
            <div style={{ textAlign:'center', fontSize:6, color:'#666', marginBottom:2 }}>FACTUUR</div>
            <hr style={{ border:0, borderTop:'1px dashed #aaa', margin:'4px 0' }} />
            {Array.from({length:5}).map((_,i) => (
              <div key={i} style={{ display:'flex', justifyContent:'space-between', opacity:.5+Math.random()*.3, marginBottom:1 }}>
                <span>{'· '.repeat(4+Math.floor(Math.random()*3))}</span>
                <span style={{ fontVariantNumeric:'tabular-nums' }}>€··,··</span>
              </div>
            ))}
            <hr style={{ border:0, borderTop:'1px dashed #aaa', margin:'4px 0' }} />
            <div style={{ display:'flex', justifyContent:'space-between', fontWeight:700, fontSize:8 }}>
              <span>TOTAAL</span><span>€{amount.toFixed(2)}</span>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center' }}>
          <div style={{
            width:'60%', height:'78%', background:'#f4f1e8', borderRadius:2,
            transform:'rotate(-2deg)', boxShadow:'0 8px 20px rgba(0,0,0,.5)',
            display:'flex', alignItems:'center', justifyContent:'center',
          }}>
            <ArIcon name="camera" size={18} color="#999" />
          </div>
        </div>
      )}
      <div style={{ position:'absolute', top:6, right:6, padding:'2px 6px', borderRadius:4, background: isPdf ? 'rgba(59,130,246,.2)' : 'rgba(249,115,22,.2)', fontSize:8, fontWeight:700, color: isPdf ? 'var(--blue)' : 'var(--orange)', textTransform:'uppercase', letterSpacing:'.05em' }}>
        {isPdf ? 'PDF' : 'IMG'}
      </div>
    </div>
  );
};

/* ── Sidebar (with Archief active) ─────────────────────────── */
const AR_NAV = [
  { section: 'Overzicht', items: [
    { id: 'dashboard', label: 'Dashboard', icon: 'layout-dashboard' },
    { id: 'agenda', label: 'Agenda', icon: 'calendar-days' },
  ]},
  { section: 'Events & Sales', items: [
    { id: 'events', label: 'Events', icon: 'party-popper' },
    { id: 'quotes', label: 'Offertes', icon: 'file-text' },
    { id: 'invoices', label: 'Facturen', icon: 'receipt' },
  ]},
  { section: 'Keuken & Operatie', items: [
    { id: 'menus', label: 'Menu & Recepten', icon: 'chef-hat' },
    { id: 'stock', label: 'Voorraad', icon: 'package' },
    { id: 'haccp', label: 'HACCP', icon: 'shield-check' },
  ]},
  { section: 'Financieel', items: [
    { id: 'inkoop', label: 'Inkoop & COGS', icon: 'euro' },
    { id: 'archief', label: 'Bonnenkistje', icon: 'archive', active: true },
    { id: 'reports', label: 'Rapportage', icon: 'bar-chart-3' },
  ]},
  { section: 'Systeem', items: [
    { id: 'team', label: 'Team', icon: 'users' },
    { id: 'settings', label: 'Instellingen', icon: 'settings' },
  ]},
];

const ArSidebar = () => (
  <aside className="sidebar" style={{ display: 'flex', flexDirection: 'column' }}>
    <div className="sidebar-brand">
      <div className="sidebar-brand-icon"><ArBrandMark size={22} /></div>
      <div>
        <div className="sidebar-brand-word">BBQ ARCHITECT</div>
        <div className="sidebar-brand-sub">Hop &amp; Bites · Ambacht</div>
      </div>
    </div>
    {AR_NAV.map(group => (
      <div key={group.section}>
        <div className="nav-section-label">{group.section}</div>
        {group.items.map(item => (
          <div key={item.id} className={`nav-item ${item.active ? 'active' : ''}`}>
            <ArIcon name={item.icon} size={16} />
            <span>{item.label}</span>
            {item.id === 'archief' && (
              <span style={{ marginLeft:'auto', fontSize:9, padding:'2px 6px', borderRadius:4, background:'rgba(196,163,90,.12)', color:'var(--brand-gold)', border:'1px solid rgba(196,163,90,.3)', fontWeight:700, letterSpacing:'.05em' }}>
                NIEUW
              </span>
            )}
          </div>
        ))}
      </div>
    ))}
    <div style={{ marginTop:'auto', padding:'12px 14px', borderTop:'1px solid var(--sidebar-border)' }}>
      <div style={{ fontSize:10, color:'var(--muted-light)', lineHeight:1.6 }}>
        Art. 52 AWR · 7-jaar bewaarplicht
      </div>
    </div>
  </aside>
);

/* ── TopBar ─────────────────────────────────────────────────── */
const ArTopBar = ({ crumbs = ['Financieel','Bonnenkistje'] }) => {
  const [t, setT] = React.useState(new Date());
  React.useEffect(() => { const i = setInterval(() => setT(new Date()), 30000); return () => clearInterval(i); }, []);
  const hhmm = t.toLocaleTimeString('nl-NL', { hour:'2-digit', minute:'2-digit' });
  return (
    <header className="topbar">
      <div className="breadcrumb">
        {crumbs.map((c, i) => (
          <span key={i} style={{ display:'contents' }}>
            {i > 0 && <ArIcon name="chevron-right" size={12} />}
            {i === crumbs.length - 1 ? <strong>{c}</strong> : <span>{c}</span>}
          </span>
        ))}
      </div>
      <div className="topbar-right">
        <button className="icon-btn"><ArIcon name="bell" size={16} /></button>
        <div style={{ fontSize:12, color:'var(--muted)', fontVariantNumeric:'tabular-nums' }}>{hhmm}</div>
        <div style={{ width:32, height:32, borderRadius:'50%', background:'linear-gradient(135deg,#c4a35a,#9e781c)', color:'#0a0a0c', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, fontSize:12 }}>MB</div>
      </div>
    </header>
  );
};

/* ── Drawer shell ──────────────────────────────────────────── */
const ArDrawer = ({ open, onClose, children, width = 720 }) => {
  if (!open) return null;
  return (
    <div style={{ display:'contents' }}>
      <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.55)', backdropFilter:'blur(4px)', zIndex:9998 }} />
      <aside className="ai-drawer" style={{ width, animation:'slideInRight .35s cubic-bezier(.16,1,.3,1)' }}>
        {children}
      </aside>
    </div>
  );
};

/* ── Modal shell ───────────────────────────────────────────── */
const ArModal = ({ open, onClose, children, width = 560 }) => {
  if (!open) return null;
  return (
    <div style={{ display:'contents' }}>
      <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.6)', backdropFilter:'blur(6px)', zIndex:9998, display:'flex', alignItems:'center', justifyContent:'center' }}>
        <div onClick={e => e.stopPropagation()} style={{ width, maxWidth:'90vw', maxHeight:'85vh', overflow:'auto', background:'var(--bg-elevated)', border:'1px solid var(--border)', borderRadius:16, animation:'fadeInUp .3s ease both', boxShadow:'0 24px 60px rgba(0,0,0,.5)' }}>
          {children}
        </div>
      </div>
    </div>
  );
};

/* ── Format helpers ────────────────────────────────────────── */
const fmtEur = (n) => new Intl.NumberFormat('nl-NL', { style:'currency', currency:'EUR' }).format(n);
const fmtDate = (d) => {
  const dt = new Date(d);
  return dt.toLocaleDateString('nl-NL', { day:'numeric', month:'short', year:'numeric' });
};
const fmtDateShort = (d) => {
  const dt = new Date(d);
  return dt.toLocaleDateString('nl-NL', { day:'numeric', month:'short' });
};

/* ── Export ─────────────────────────────────────────────────── */
Object.assign(window, {
  ArIcon, ArBrandMark, ArPill, ArButton, ArEyebrow, ArStatusPill,
  ArReceiptThumb, ArSidebar, ArTopBar, ArDrawer, ArModal,
  STATUS_MAP, fmtEur, fmtDate, fmtDateShort,
});
