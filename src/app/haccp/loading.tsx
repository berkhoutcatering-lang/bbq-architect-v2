export default function Loading() {
  return (
    <div style={{ padding: 24 }}>
      {/* Page title skeleton */}
      <div style={{ height: 28, width: 220, background: 'var(--card)', borderRadius: 8, marginBottom: 24, animation: 'pulse 1.5s infinite' }} />

      {/* Tab bar skeleton */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        {[1, 2, 3].map((i) => (
          <div key={i} style={{ height: 36, width: 100, background: 'var(--card)', borderRadius: 8, animation: 'pulse 1.5s infinite' }} />
        ))}
      </div>

      {/* Filter skeleton */}
      <div style={{ height: 40, width: '100%', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, marginBottom: 16, animation: 'pulse 1.5s infinite' }} />

      {/* HACCP record rows skeleton */}
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 20px', borderBottom: '1px solid var(--border)', animation: 'pulse 1.5s infinite' }}>
            <div style={{ width: 44, height: 44, borderRadius: 8, background: 'var(--bg)', flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ height: 14, width: '40%', background: 'var(--bg)', borderRadius: 4, marginBottom: 6 }} />
              <div style={{ height: 10, width: '55%', background: 'var(--bg)', borderRadius: 4 }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ height: 22, width: 60, background: 'var(--bg)', borderRadius: 12 }} />
              <div style={{ height: 20, width: 20, background: 'var(--bg)', borderRadius: 4 }} />
            </div>
          </div>
        ))}
      </div>

      <style>{`@keyframes pulse { 0%, 100% { opacity: 1 } 50% { opacity: 0.4 } }`}</style>
    </div>
  );
}
