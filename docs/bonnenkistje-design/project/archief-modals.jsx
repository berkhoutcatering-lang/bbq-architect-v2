/* ═══════════════════════════════════════════════════════════════════
   Archief — Modals: Empty State (5), Bulk Export (7), Deellink (8)
   ═══════════════════════════════════════════════════════════════════ */

/* ── Empty State — Bonnenkistje SVG (Screen 5) ─────────────── */
const ArEmptyState = () => (
  <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'60vh' }}>
    <div style={{ maxWidth:460, textAlign:'center', animation:'fadeInUp .5s ease both' }}>
      {/* Wooden kistje SVG — gold line drawing on dark */}
      <svg width="200" height="160" viewBox="0 0 200 160" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ margin:'0 auto 28px', display:'block' }}>
        {/* Box body */}
        <rect x="30" y="60" width="140" height="80" rx="6" stroke="#C4A35A" strokeWidth="2" fill="none" />
        {/* Wood grain lines */}
        <line x1="40" y1="82" x2="160" y2="82" stroke="#C4A35A" strokeWidth=".5" opacity=".4" />
        <line x1="40" y1="102" x2="160" y2="102" stroke="#C4A35A" strokeWidth=".5" opacity=".4" />
        <line x1="40" y1="122" x2="160" y2="122" stroke="#C4A35A" strokeWidth=".5" opacity=".4" />
        {/* Front panel accent */}
        <rect x="75" y="88" width="50" height="24" rx="3" stroke="#C4A35A" strokeWidth="1.5" fill="none" opacity=".5" />
        <circle cx="100" cy="100" r="4" stroke="#C4A35A" strokeWidth="1.5" fill="none" opacity=".6" />
        {/* Lid (open, angled) */}
        <path d="M28 62 L28 42 Q28 36 34 36 L166 36 Q172 36 172 42 L172 62" stroke="#C4A35A" strokeWidth="2" fill="none" />
        <line x1="38" y1="48" x2="162" y2="48" stroke="#C4A35A" strokeWidth=".5" opacity=".35" />
        {/* Hinge */}
        <circle cx="50" cy="62" r="3" stroke="#C4A35A" strokeWidth="1.5" fill="none" />
        <circle cx="150" cy="62" r="3" stroke="#C4A35A" strokeWidth="1.5" fill="none" />
        {/* Receipts sticking out */}
        <rect x="60" y="22" width="30" height="42" rx="2" stroke="#C4A35A" strokeWidth="1" fill="none" opacity=".6" transform="rotate(-8 75 43)" />
        <line x1="64" y1="32" x2="84" y2="30" stroke="#C4A35A" strokeWidth=".5" opacity=".3" transform="rotate(-8 75 43)" />
        <line x1="64" y1="38" x2="84" y2="36" stroke="#C4A35A" strokeWidth=".5" opacity=".3" transform="rotate(-8 75 43)" />
        <line x1="64" y1="44" x2="78" y2="42.5" stroke="#C4A35A" strokeWidth=".5" opacity=".3" transform="rotate(-8 75 43)" />
        <rect x="105" y="18" width="28" height="46" rx="2" stroke="#C4A35A" strokeWidth="1" fill="none" opacity=".5" transform="rotate(6 119 41)" />
        <line x1="109" y1="28" x2="127" y2="29" stroke="#C4A35A" strokeWidth=".5" opacity=".3" transform="rotate(6 119 41)" />
        <line x1="109" y1="34" x2="127" y2="35" stroke="#C4A35A" strokeWidth=".5" opacity=".3" transform="rotate(6 119 41)" />
        {/* Small sparkle */}
        <g transform="translate(156,28)" opacity=".7">
          <line x1="0" y1="-6" x2="0" y2="6" stroke="#C4A35A" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="-6" y1="0" x2="6" y2="0" stroke="#C4A35A" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="-4" y1="-4" x2="4" y2="4" stroke="#C4A35A" strokeWidth="1" strokeLinecap="round" />
          <line x1="4" y1="-4" x2="-4" y2="4" stroke="#C4A35A" strokeWidth="1" strokeLinecap="round" />
        </g>
      </svg>

      <div style={{ fontFamily:'var(--font-display)', fontSize:22, fontWeight:200, letterSpacing:'-.01em', marginBottom:10, color:'var(--text)' }}>
        Het bonnenkistje is nog leeg
      </div>
      <div style={{ fontSize:13, color:'var(--muted)', lineHeight:1.7, marginBottom:28 }}>
        Hier komen je gescande bonnen, facturen en pdf's terecht — automatisch doorzoekbaar tot op het woord.
      </div>

      <div style={{ display:'flex', gap:10, justifyContent:'center', marginBottom:20 }}>
        <ArButton variant="primary" icon="scan" style={{ color:'#000' }}>Open scanner</ArButton>
        <ArButton variant="ghost" icon="mail">Mail bonnen direct</ArButton>
      </div>

      <div style={{
        padding:'12px 16px', borderRadius:10, background:'rgba(196,163,90,.06)',
        border:'1px solid rgba(196,163,90,.15)', fontSize:12, color:'var(--muted)', lineHeight:1.6,
        display:'flex', alignItems:'flex-start', gap:10, textAlign:'left',
      }}>
        <ArIcon name="lightbulb" size={16} color="var(--brand-gold)" style={{ flexShrink:0, marginTop:2 }} />
        <span>
          <strong style={{ color:'var(--brand-gold)' }}>Tip:</strong> typ later '<em>baktotaal</em>' en je vindt elke bon waar dat ooit op stond.
        </span>
      </div>
    </div>
  </div>
);

/* ── Bulk Export Modal (Screen 7) ──────────────────────────── */
const ArBulkExportModal = ({ open, onClose, selectedBonnen }) => {
  const [exporting, setExporting] = React.useState(false);
  if (!open) return null;

  const total = selectedBonnen.reduce((s, b) => s + b.amount, 0);
  const btw9 = selectedBonnen.reduce((s, b) => s + b.btw9, 0);
  const btw21 = selectedBonnen.reduce((s, b) => s + b.btw21, 0);

  return (
    <ArModal open={open} onClose={onClose} width={580}>
      <div style={{ padding:'20px 24px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:12 }}>
        <div style={{ width:36, height:36, borderRadius:10, background:'rgba(196,163,90,.12)', border:'1px solid rgba(196,163,90,.25)', display:'flex', alignItems:'center', justifyContent:'center' }}>
          <ArIcon name="file-archive" size={18} color="var(--brand-gold)" />
        </div>
        <div>
          <div style={{ fontSize:16, fontWeight:600 }}>Boekhouder-pakket samenstellen</div>
          <div style={{ fontSize:12, color:'var(--muted)' }}>Mei 2026 · {selectedBonnen.length} bonnen geselecteerd</div>
        </div>
        <button onClick={onClose} style={{ marginLeft:'auto', background:'none', border:'none', color:'var(--muted)', cursor:'pointer' }}>
          <ArIcon name="x" size={18} />
        </button>
      </div>

      {/* Selected bonnen list */}
      <div style={{ padding:'16px 24px', maxHeight:280, overflowY:'auto' }}>
        {selectedBonnen.map(bon => (
          <div key={bon.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'8px 0', borderBottom:'1px solid rgba(130,130,130,.06)' }}>
            <ArIcon name={bon.type === 'pdf' ? 'file-text' : 'image'} size={14} color="var(--muted)" />
            <span style={{ flex:1, fontSize:12 }}>{bon.supplier} · {fmtDateShort(bon.date)}</span>
            <span style={{ fontFamily:'var(--font-mono)', fontSize:12, fontVariantNumeric:'tabular-nums', color:'var(--muted)' }}>{fmtEur(bon.amount)}</span>
          </div>
        ))}
      </div>

      {/* Summary */}
      <div style={{ padding:'16px 24px', background:'rgba(130,130,130,.03)', borderTop:'1px solid var(--border)' }}>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:14 }}>
          <div>
            <div style={{ fontSize:10, letterSpacing:'.12em', textTransform:'uppercase', color:'var(--muted)', fontWeight:700, marginBottom:4 }}>Bonnen</div>
            <div style={{ fontFamily:'var(--font-display)', fontSize:22, fontWeight:600, fontVariantNumeric:'tabular-nums' }}>{selectedBonnen.length}</div>
          </div>
          <div>
            <div style={{ fontSize:10, letterSpacing:'.12em', textTransform:'uppercase', color:'var(--muted)', fontWeight:700, marginBottom:4 }}>Totaal</div>
            <div style={{ fontFamily:'var(--font-mono)', fontSize:18, fontWeight:600, fontVariantNumeric:'tabular-nums' }}>{fmtEur(total)}</div>
          </div>
          <div>
            <div style={{ fontSize:10, letterSpacing:'.12em', textTransform:'uppercase', color:'var(--muted)', fontWeight:700, marginBottom:4 }}>BTW split</div>
            <div style={{ fontFamily:'var(--font-mono)', fontSize:12, fontVariantNumeric:'tabular-nums', color:'var(--muted)' }}>
              <div>9%: {fmtEur(btw9)}</div>
              <div>21%: {fmtEur(btw21)}</div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ padding:'16px 24px', display:'flex', gap:8, justifyContent:'flex-end' }}>
        <ArButton variant="ghost" onClick={onClose}>Annuleren</ArButton>
        <ArButton variant="primary" icon="download" style={{ color:'#000' }} onClick={() => { setExporting(true); setTimeout(() => setExporting(false), 2000); }}>
          {exporting ? 'Exporteren…' : 'ZIP + index.csv exporteren'}
        </ArButton>
      </div>
    </ArModal>
  );
};

/* ── Boekhouder Deellink Modal (Screen 8) ──────────────────── */
const ArDeellinkModal = ({ open, onClose }) => {
  const [ttl, setTtl] = React.useState(30);
  const [name, setName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [created, setCreated] = React.useState(false);
  const mockUrl = 'https://app.bbqarchitect.nl/share/bk-mei2026-x8f2k';

  return (
    <ArModal open={open} onClose={onClose} width={520}>
      <div style={{ padding:'20px 24px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:12 }}>
        <div style={{ width:36, height:36, borderRadius:10, background:'rgba(59,130,246,.12)', border:'1px solid rgba(59,130,246,.25)', display:'flex', alignItems:'center', justifyContent:'center' }}>
          <ArIcon name="link" size={18} color="var(--blue)" />
        </div>
        <div>
          <div style={{ fontSize:16, fontWeight:600 }}>Read-only deellink voor boekhouder</div>
          <div style={{ fontSize:12, color:'var(--muted)' }}>Veilig delen zonder account</div>
        </div>
        <button onClick={onClose} style={{ marginLeft:'auto', background:'none', border:'none', color:'var(--muted)', cursor:'pointer' }}>
          <ArIcon name="x" size={18} />
        </button>
      </div>

      <div style={{ padding:'20px 24px', display:'flex', flexDirection:'column', gap:16 }}>
        {!created ? (
          <>
            {/* TTL picker */}
            <div>
              <label style={{ fontSize:12, fontWeight:600, marginBottom:6, display:'block' }}>Geldigheid</label>
              <div style={{ display:'flex', gap:6 }}>
                {[7, 30, 90].map(d => (
                  <span key={d} onClick={() => setTtl(d)} style={{
                    padding:'7px 14px', borderRadius:8, fontSize:12, fontWeight:600, cursor:'pointer',
                    background: ttl === d ? 'rgba(255,191,0,.1)' : 'rgba(130,130,130,.06)',
                    color: ttl === d ? 'var(--brand)' : 'var(--muted)',
                    border: `1px solid ${ttl === d ? 'rgba(255,191,0,.3)' : 'var(--border)'}`,
                  }}>{d} dagen</span>
                ))}
              </div>
            </div>

            {/* Name */}
            <div>
              <label style={{ fontSize:12, fontWeight:600, marginBottom:6, display:'block' }}>Naam boekhouder</label>
              <input className="input" placeholder="Jan de Boer" value={name} onChange={e => setName(e.target.value)} />
            </div>

            {/* Email */}
            <div>
              <label style={{ fontSize:12, fontWeight:600, marginBottom:6, display:'block' }}>E-mail boekhouder</label>
              <input className="input" type="email" placeholder="jan@boekhouder.nl" value={email} onChange={e => setEmail(e.target.value)} />
            </div>
          </>
        ) : (
          <div style={{ textAlign:'center', padding:'12px 0' }}>
            <div style={{ width:48, height:48, borderRadius:'50%', background:'rgba(34,197,94,.12)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 16px' }}>
              <ArIcon name="check" size={24} color="var(--green)" />
            </div>
            <div style={{ fontSize:14, fontWeight:600, marginBottom:8 }}>Link aangemaakt!</div>

            {/* Copyable URL */}
            <div style={{
              display:'flex', alignItems:'center', gap:8, padding:'10px 14px',
              borderRadius:10, background:'var(--bg-subtle)', border:'1px solid var(--border)',
              marginBottom:16,
            }}>
              <span style={{ flex:1, fontSize:12, fontFamily:'var(--font-mono)', color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                {mockUrl}
              </span>
              <ArButton size="sm" icon="copy" variant="ghost" onClick={() => navigator.clipboard?.writeText(mockUrl)}>Kopieer</ArButton>
            </div>

            {/* QR placeholder */}
            <div style={{
              width:120, height:120, margin:'0 auto', borderRadius:10,
              background:'#fff', display:'flex', alignItems:'center', justifyContent:'center',
              padding:8,
            }}>
              <div style={{ width:'100%', height:'100%', display:'grid', gridTemplateColumns:'repeat(8,1fr)', gridTemplateRows:'repeat(8,1fr)', gap:1 }}>
                {Array.from({length:64}).map((_,i) => (
                  <div key={i} style={{ background: Math.random() > .45 ? '#1a1a1a' : '#fff', borderRadius:1 }} />
                ))}
              </div>
            </div>
            <div style={{ fontSize:11, color:'var(--muted)', marginTop:8 }}>
              Geldig tot {new Date(Date.now() + ttl * 86400000).toLocaleDateString('nl-NL')} · {ttl} dagen
            </div>
          </div>
        )}
      </div>

      <div style={{ padding:'16px 24px', borderTop:'1px solid var(--border)', display:'flex', gap:8, justifyContent:'flex-end' }}>
        {!created ? (
          <>
            <ArButton variant="ghost" onClick={onClose}>Annuleren</ArButton>
            <ArButton variant="primary" icon="link" style={{ color:'#000' }} onClick={() => setCreated(true)}>
              Maak link + Auto-mail
            </ArButton>
          </>
        ) : (
          <ArButton variant="ghost" onClick={onClose}>Sluiten</ArButton>
        )}
      </div>
    </ArModal>
  );
};

Object.assign(window, { ArEmptyState, ArBulkExportModal, ArDeellinkModal });
