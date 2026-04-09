export default function Loading() {
  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <div style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--card)', animation: 'pulse 1.5s infinite' }} />
        <div>
          <div style={{ height: 22, width: 160, background: 'var(--card)', borderRadius: 6, marginBottom: 6, animation: 'pulse 1.5s infinite' }} />
          <div style={{ height: 12, width: 120, background: 'var(--card)', borderRadius: 4, animation: 'pulse 1.5s infinite' }} />
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 24 }}>
        {[1, 2, 3, 4].map((i) => (
          <div key={i} style={{ height: 80, background: 'var(--card)', borderRadius: 12, animation: 'pulse 1.5s infinite' }} />
        ))}
      </div>
      <div style={{ background: 'var(--card)', borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border)' }}>
        {[1, 2, 3].map((i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px', borderBottom: '1px solid var(--border)', animation: 'pulse 1.5s infinite' }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--bg)' }} />
            <div style={{ flex: 1 }}>
              <div style={{ height: 14, width: '40%', background: 'var(--bg)', borderRadius: 4, marginBottom: 6 }} />
              <div style={{ height: 10, width: '25%', background: 'var(--bg)', borderRadius: 4 }} />
            </div>
          </div>
        ))}
      </div>
      <style>{`@keyframes pulse { 0%, 100% { opacity: 1 } 50% { opacity: 0.4 } }`}</style>
    </div>
  );
}
