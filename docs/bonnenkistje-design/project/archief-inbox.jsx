/* ═══════════════════════════════════════════════════════════════════
   Archief — Inbox Toggle (Screen 9)
   Inbox view: org_email_inbox rows with "Verwerk → archief" actions
   ═══════════════════════════════════════════════════════════════════ */

const ArInboxView = () => {
  const [items, setItems] = React.useState(window.ARCHIEF_INBOX);

  const markProcessed = (id) => {
    setItems(prev => prev.map(item =>
      item.id === id ? { ...item, status: 'verwerkt' } : item
    ));
  };

  const nieuw = items.filter(i => i.status === 'nieuw');
  const verwerkt = items.filter(i => i.status === 'verwerkt');

  const orgEmail = 'bonnen@hopbites.bbqarchitect.nl';

  return (
    <div>
      {/* Org inbox address card */}
      <div style={{
        display: 'flex', gap: 14, alignItems: 'center', padding: '16px 20px',
        marginBottom: 20, borderRadius: 12,
        background: 'linear-gradient(135deg, rgba(255,191,0,.04), rgba(196,163,90,.02))',
        border: '1px solid rgba(196,163,90,.2)',
      }}>
        <div style={{
          width: 42, height: 42, borderRadius: 10,
          background: 'rgba(196,163,90,.12)', border: '1px solid rgba(196,163,90,.25)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <ArIcon name="mail" size={18} color="var(--brand-gold)" />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 9, letterSpacing: '.15em', textTransform: 'uppercase', color: 'var(--brand-gold)', fontWeight: 700, marginBottom: 4 }}>
            Organisatie inbox
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--text)', fontWeight: 500 }}>
              {orgEmail}
            </span>
            <ArButton size="sm" icon="copy" variant="ghost" onClick={() => navigator.clipboard?.writeText(orgEmail)}>Kopieer</ArButton>
          </div>
        </div>
        <div style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'right' }}>
          <div>{nieuw.length} nieuw</div>
          <div>{verwerkt.length} verwerkt</div>
        </div>
      </div>

      {/* Nieuwe items */}
      {nieuw.length > 0 && (
        <>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '14px 0 8px',
            fontSize: 10, letterSpacing: '.2em', textTransform: 'uppercase',
            color: 'var(--muted-light)', fontWeight: 700,
          }}>
            <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            NIEUW ({nieuw.length})
            <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 16 }}>
            {nieuw.map(item => (
              <InboxRow key={item.id} item={item} onProcess={() => markProcessed(item.id)} />
            ))}
          </div>
        </>
      )}

      {/* Verwerkte items */}
      {verwerkt.length > 0 && (
        <>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '14px 0 8px',
            fontSize: 10, letterSpacing: '.2em', textTransform: 'uppercase',
            color: 'var(--muted-light)', fontWeight: 700,
          }}>
            <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            VERWERKT ({verwerkt.length})
            <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {verwerkt.map(item => (
              <InboxRow key={item.id} item={item} processed />
            ))}
          </div>
        </>
      )}
    </div>
  );
};

const InboxRow = ({ item, onProcess, processed }) => (
  <div style={{
    display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px',
    borderRadius: 12, border: '1px solid transparent',
    transition: 'background .15s, border-color .15s',
    opacity: processed ? .6 : 1,
  }} className="ar-inbox-row">
    <div style={{
      width: 36, height: 36, borderRadius: 8,
      background: processed ? 'rgba(34,197,94,.08)' : 'rgba(255,191,0,.08)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    }}>
      <ArIcon name={processed ? 'check-circle-2' : 'mail'} size={16} color={processed ? 'var(--green)' : 'var(--brand)'} />
    </div>

    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
        <span style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.subject}</span>
      </div>
      <div style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
        <span>{item.from}</span>
        <span>·</span>
        <span>{fmtDate(item.date)}</span>
        <span>·</span>
        <span>{item.size}</span>
      </div>
    </div>

    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{
        fontSize: 9, padding: '2px 7px', borderRadius: 4, textTransform: 'uppercase',
        background: 'rgba(59,130,246,.12)', color: 'var(--blue)', fontWeight: 700, letterSpacing: '.05em',
      }}>{item.type}</span>
      {!processed && (
        <ArButton size="sm" variant="primary" icon="archive" onClick={onProcess} style={{ color: '#000' }}>
          Verwerk → archief
        </ArButton>
      )}
      {processed && (
        <span style={{ fontSize: 11, color: 'var(--green)', display: 'flex', alignItems: 'center', gap: 4 }}>
          <ArIcon name="check" size={12} />In archief
        </span>
      )}
    </div>
  </div>
);

Object.assign(window, { ArInboxView });
