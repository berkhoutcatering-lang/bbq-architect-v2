/* ═══════════════════════════════════════════════════════════════════
   Archief — Detail Slide-over (Screen 4, 720px)
   Preview / Details / Voorraad-impact / Activiteit tabs
   ═══════════════════════════════════════════════════════════════════ */

const ArDetailDrawer = ({ bon, onClose, query }) => {
  const [tab, setTab] = React.useState('preview');
  if (!bon) return null;

  const tabs = [
    { id: 'preview', label: 'Preview', icon: 'eye' },
    { id: 'details', label: 'Details', icon: 'file-text' },
    { id: 'voorraad', label: 'Voorraad-impact', icon: 'package' },
    { id: 'activiteit', label: 'Activiteit', icon: 'clock' },
  ];

  return (
    <ArDrawer open={true} onClose={onClose} width={720}>
      {/* Header */}
      <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 200, marginBottom: 4 }}>{bon.supplier}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--muted)' }}>
            <span>{fmtDate(bon.date)}</span>
            <span>·</span>
            <ArStatusPill status={bon.status} />
            {bon.locked && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, padding: '2px 8px', borderRadius: 6, background: 'rgba(59,130,246,.1)', color: 'var(--blue)', border: '1px solid rgba(59,130,246,.2)' }}>
                <ArIcon name="lock" size={10} />Vergrendeld
              </span>
            )}
          </div>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: 4 }}>
          <ArIcon name="x" size={20} />
        </button>
      </div>

      {/* Tab strip */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', padding: '0 24px' }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: '12px 16px', fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-sans)',
            background: 'none', border: 'none', borderBottom: `2px solid ${tab === t.id ? 'var(--brand)' : 'transparent'}`,
            color: tab === t.id ? 'var(--text)' : 'var(--muted)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 6, transition: '.15s',
          }}>
            <ArIcon name={t.icon} size={14} />{t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
        {tab === 'preview' && <PreviewTab bon={bon} query={query} />}
        {tab === 'details' && <DetailsTab bon={bon} />}
        {tab === 'voorraad' && <VoorraadTab bon={bon} />}
        {tab === 'activiteit' && <ActiviteitTab />}
      </div>

      {/* Bottom action bar */}
      <div style={{
        padding: '14px 24px', borderTop: '1px solid var(--border)',
        display: 'flex', gap: 8, flexWrap: 'wrap',
      }}>
        <ArButton icon="download" variant="ghost">Download PDF</ArButton>
        <ArButton icon="external-link" variant="ghost">Open in Geld</ArButton>
        <ArButton icon="tag" variant="ghost">Hertaggen</ArButton>
        <div style={{ flex: 1 }} />
        <ArButton icon="share-2" variant="primary" style={{ color: '#000' }}>Export naar boekhouder</ArButton>
      </div>
    </ArDrawer>
  );
};

/* ── Preview Tab ───────────────────────────────────────────── */
const PreviewTab = ({ bon, query }) => {
  const [zoom, setZoom] = React.useState(100);
  return (
    <div>
      {/* Zoom controls */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ArButton size="sm" icon="zoom-out" variant="ghost" onClick={() => setZoom(z => Math.max(50, z - 25))} />
          <span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--font-mono)', minWidth: 40, textAlign: 'center' }}>{zoom}%</span>
          <ArButton size="sm" icon="zoom-in" variant="ghost" onClick={() => setZoom(z => Math.min(200, z + 25))} />
        </div>
        {query && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--muted)' }}>
            <ArIcon name="search" size={12} color="var(--brand)" />
            <span>Zoekterm: <strong style={{ color: 'var(--brand)' }}>{query}</strong></span>
          </div>
        )}
      </div>

      {/* PDF preview mock */}
      <div style={{
        background: '#fff', borderRadius: 8, minHeight: 600, padding: 40,
        transform: `scale(${zoom / 100})`, transformOrigin: 'top left',
        boxShadow: '0 4px 20px rgba(0,0,0,.3)', color: '#1a1a1a', fontFamily: 'var(--font-mono)',
        fontSize: 11, lineHeight: 1.8,
      }}>
        {/* Mock PDF content */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '.15em' }}>{bon.supplier.toUpperCase()}</div>
          <div style={{ fontSize: 10, color: '#666' }}>Groothandel B.V. · KvK 12345678</div>
          <div style={{ fontSize: 10, color: '#666' }}>Factuur aan: Hop & Bites · Ambacht</div>
        </div>
        <div style={{ borderTop: '1px solid #ddd', borderBottom: '1px solid #ddd', padding: '8px 0', margin: '12px 0', display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#666' }}>
          <span>Factuurnr: F2026-{String(parseInt(bon.id.split('-')[1])).padStart(4,'0')}</span>
          <span>Datum: {bon.date}</span>
        </div>

        {/* Line items */}
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #ddd' }}>
              <th style={{ textAlign: 'left', padding: '4px 0', fontWeight: 600 }}>Omschrijving</th>
              <th style={{ textAlign: 'right', padding: '4px 0', fontWeight: 600 }}>Aantal</th>
              <th style={{ textAlign: 'right', padding: '4px 0', fontWeight: 600 }}>Prijs</th>
              <th style={{ textAlign: 'right', padding: '4px 0', fontWeight: 600 }}>Totaal</th>
            </tr>
          </thead>
          <tbody>
            {[
              ['Spareribs St. Louis 10kg', '1', '€89,50', '€89,50'],
              ['Pulled pork schouder 8kg', '1', '€72,40', '€72,40'],
              ['Rookhout hickory 25kg', '1', '€34,20', '€34,20'],
              ['Houtskool restaurant 15kg', '2', '€24,90', '€49,80'],
              ['Kippenvleugels heel 5kg', '1', '€28,50', '€28,50'],
            ].map((row, i) => (
              <tr key={i} style={{ borderBottom: '1px solid #eee' }}>
                {row.map((cell, j) => {
                  const isHighlight = query && cell.toLowerCase().includes(query.toLowerCase());
                  return (
                    <td key={j} style={{ padding: '6px 0', textAlign: j > 0 ? 'right' : 'left', position: 'relative' }}>
                      {isHighlight ? (
                        <span style={{ background: 'rgba(255,191,0,.35)', padding: '1px 2px', borderRadius: 2 }}>{cell}</span>
                      ) : cell}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <div style={{ marginTop: 16, borderTop: '2px solid #333', paddingTop: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#666' }}>
            <span>Subtotaal excl. BTW</span><span>€{(bon.amount - bon.btw9 - bon.btw21).toFixed(2)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#666' }}>
            <span>BTW 9%</span><span>€{bon.btw9.toFixed(2)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#666' }}>
            <span>BTW 21%</span><span>€{bon.btw21.toFixed(2)}</span>
          </div>
          {query && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#666' }}>
              <span style={{ background: query.toLowerCase() === 'baktotaal' ? 'rgba(255,191,0,.35)' : 'none', padding: '1px 2px', borderRadius: 2 }}>Baktotaal</span>
              <span>€{bon.amount.toFixed(2)}</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 700, marginTop: 4, paddingTop: 4, borderTop: '1px solid #333' }}>
            <span>TOTAAL</span><span>€{bon.amount.toFixed(2)}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ── Details Tab ───────────────────────────────────────────── */
const DetailsTab = ({ bon }) => {
  const kvStyle = { display: 'grid', gridTemplateColumns: '140px 1fr', gap: '0', fontSize: 13 };
  const kStyle = { padding: '10px 0', color: 'var(--muted)', borderBottom: '1px solid rgba(130,130,130,.06)' };
  const vStyle = { padding: '10px 0', borderBottom: '1px solid rgba(130,130,130,.06)', fontWeight: 500 };

  return (
    <div>
      <div style={kvStyle}>
        <div style={kStyle}>Datum</div>
        <div style={vStyle}>{fmtDate(bon.date)}</div>

        <div style={kStyle}>Leverancier</div>
        <div style={vStyle}>{bon.supplier}</div>

        <div style={kStyle}>Totaal</div>
        <div style={{ ...vStyle, fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}>{fmtEur(bon.amount)}</div>

        <div style={kStyle}>BTW 9%</div>
        <div style={{ ...vStyle, fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums', color: 'var(--muted)' }}>{fmtEur(bon.btw9)}</div>

        <div style={kStyle}>BTW 21%</div>
        <div style={{ ...vStyle, fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums', color: 'var(--muted)' }}>{fmtEur(bon.btw21)}</div>

        <div style={kStyle}>RGS-code</div>
        <div style={vStyle}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{bon.rgs}</span>
          <span style={{ color: 'var(--muted)', marginLeft: 8, fontSize: 12 }}>
            ({window.ARCHIEF_RGS.find(r => r.code === bon.rgs)?.label || '—'})
          </span>
        </div>

        <div style={kStyle}>Categorie</div>
        <div style={vStyle}>{bon.category}</div>

        <div style={kStyle}>Type</div>
        <div style={vStyle}>{bon.type === 'pdf' ? 'PDF document' : 'Afbeelding'}</div>

        <div style={kStyle}>Event-koppeling</div>
        <div style={vStyle}>
          {bon.hasEvent ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <ArIcon name="calendar" size={13} color="var(--brand-gold)" />
              {bon.hasEvent}
            </span>
          ) : <span style={{ color: 'var(--muted-light)' }}>Geen koppeling</span>}
        </div>

        <div style={kStyle}>Tags</div>
        <div style={{ ...vStyle, display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
          {bon.tags.map(t => (
            <span key={t} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: 'rgba(130,130,130,.08)', color: 'var(--muted)' }}>{t}</span>
          ))}
        </div>

        <div style={kStyle}>Aantal regels</div>
        <div style={vStyle}>{bon.items} items</div>

        <div style={kStyle}>Status</div>
        <div style={vStyle}><ArStatusPill status={bon.status} /></div>
      </div>
    </div>
  );
};

/* ── Voorraad Tab ──────────────────────────────────────────── */
const VoorraadTab = ({ bon }) => {
  const movements = bon.id === 'bon-001' ? window.ARCHIEF_STOCK_MOVEMENTS : [];

  if (movements.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--muted)' }}>
        <ArIcon name="package" size={28} color="var(--muted-light)" />
        <div style={{ marginTop: 12, fontSize: 13 }}>Geen voorraadmutaties gekoppeld aan deze bon</div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ fontSize: 10, letterSpacing: '.15em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 700, marginBottom: 12 }}>
        Voorraadmutaties
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {movements.map((m, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 14, padding: '12px 14px',
            borderRadius: 10, border: '1px solid var(--border)', background: 'rgba(130,130,130,.03)',
          }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(34,197,94,.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <ArIcon name="arrow-down-right" size={14} color="var(--green)" />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{m.item}</div>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>{m.warehouse} · {fmtDateShort(m.date)}</div>
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color: 'var(--green)' }}>
              {m.qty}
            </div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 14, fontSize: 11, color: 'var(--muted)' }}>
        <ArIcon name="arrow-right" size={11} style={{ marginRight: 4 }} />
        <span style={{ cursor: 'pointer', textDecoration: 'underline' }}>Bekijk in Voorraad &gt; Historie</span>
      </div>
    </div>
  );
};

/* ── Activiteit Tab ────────────────────────────────────────── */
const ActiviteitTab = () => (
  <div>
    <div style={{ fontSize: 10, letterSpacing: '.15em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 700, marginBottom: 12 }}>
      Audit log
    </div>
    <div style={{ position: 'relative', paddingLeft: 20 }}>
      {/* Timeline line */}
      <div style={{ position: 'absolute', left: 5, top: 6, bottom: 6, width: 1, background: 'var(--border)' }} />
      {window.ARCHIEF_AUDIT_LOG.map((entry, i) => (
        <div key={i} style={{ position: 'relative', paddingBottom: 18, animation: `fadeInUp .3s ease ${i * 80}ms both` }}>
          <div style={{
            position: 'absolute', left: -16, top: 4, width: 10, height: 10,
            borderRadius: '50%', border: '2px solid var(--border)',
            background: entry.user === 'AI' ? 'var(--brand)' : entry.user === 'Systeem' ? 'var(--blue)' : 'var(--bg-elevated)',
          }} />
          <div style={{ fontSize: 10, color: 'var(--muted-light)', fontFamily: 'var(--font-mono)', marginBottom: 2 }}>
            {entry.ts}
          </div>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 2 }}>
            <span style={{ color: entry.user === 'AI' ? 'var(--brand)' : 'var(--text)' }}>{entry.user}</span>
            <span style={{ color: 'var(--muted)', fontWeight: 400 }}> — {entry.action}</span>
          </div>
          {entry.detail && (
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>{entry.detail}</div>
          )}
        </div>
      ))}
    </div>
  </div>
);

Object.assign(window, { ArDetailDrawer });
