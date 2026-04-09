export default function Loading() {
  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div style={{ height: 28, width: 180, background: 'var(--card)', borderRadius: 8, animation: 'pulse 1.5s infinite' }} />
      </div>
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        {[1, 2, 3, 4].map((i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 20px', borderBottom: '1px solid var(--border)', animation: 'pulse 1.5s infinite' }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--bg)', flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ height: 14, width: '40%', background: 'var(--bg)', borderRadius: 4, marginBottom: 6 }} />
              <div style={{ height: 10, width: '60%', background: 'var(--bg)', borderRadius: 4 }} />
            </div>
          </div>
        ))}
      </div>
      <style>{`@keyframes pulse { 0%, 100% { opacity: 1 } 50% { opacity: 0.4 } }`}</style>
    </div>
  );
}
