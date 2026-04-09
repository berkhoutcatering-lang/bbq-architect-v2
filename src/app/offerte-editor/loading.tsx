export default function Loading() {
  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div style={{ height: 28, width: 200, background: 'var(--card)', borderRadius: 8, animation: 'pulse 1.5s infinite' }} />
        <div style={{ height: 36, width: 120, background: 'var(--card)', borderRadius: 8, animation: 'pulse 1.5s infinite' }} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
        {[1, 2, 3, 4].map((i) => (
          <div key={i} style={{ height: 60, background: 'var(--card)', borderRadius: 10, animation: 'pulse 1.5s infinite' }} />
        ))}
      </div>
      <div style={{ height: 300, background: 'var(--card)', borderRadius: 12, animation: 'pulse 1.5s infinite' }} />
      <style>{`@keyframes pulse { 0%, 100% { opacity: 1 } 50% { opacity: 0.4 } }`}</style>
    </div>
  );
}
