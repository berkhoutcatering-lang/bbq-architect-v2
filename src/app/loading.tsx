export default function Loading() {
  return (
    <div style={{ padding: 24 }}>
      {/* Page title skeleton */}
      <div style={{ height: 28, width: 200, background: 'var(--card)', borderRadius: 8, marginBottom: 24, animation: 'pulse 1.5s infinite' }} />

      {/* KPI cards row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 32 }}>
        {[1, 2, 3].map((i) => (
          <div key={i} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, animation: 'pulse 1.5s infinite' }}>
            <div style={{ height: 12, width: 80, background: 'var(--bg)', borderRadius: 4, marginBottom: 12 }} />
            <div style={{ height: 32, width: 120, background: 'var(--bg)', borderRadius: 6, marginBottom: 8 }} />
            <div style={{ height: 10, width: 60, background: 'var(--bg)', borderRadius: 4 }} />
          </div>
        ))}
      </div>

      {/* Content area skeleton */}
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, animation: 'pulse 1.5s infinite' }}>
        <div style={{ height: 16, width: 160, background: 'var(--bg)', borderRadius: 4, marginBottom: 20 }} />
        {[1, 2, 3, 4].map((i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <div style={{ width: 40, height: 40, borderRadius: 8, background: 'var(--bg)', flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ height: 14, width: '60%', background: 'var(--bg)', borderRadius: 4, marginBottom: 6 }} />
              <div style={{ height: 10, width: '40%', background: 'var(--bg)', borderRadius: 4 }} />
            </div>
            <div style={{ height: 24, width: 60, background: 'var(--bg)', borderRadius: 12 }} />
          </div>
        ))}
      </div>

      <style>{`@keyframes pulse { 0%, 100% { opacity: 1 } 50% { opacity: 0.4 } }`}</style>
    </div>
  );
}
