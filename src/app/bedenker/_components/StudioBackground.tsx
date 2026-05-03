'use client';

/**
 * Animated background voor /bedenker — geeft de pagina een "studio"-feel
 * vs de statische bibliotheek-feel van /gerechten.
 *
 * Pure CSS, geen JS-animation-loop. Gebruikt 3 bewegende radial-gradients
 * (mesh) + 14 floating particles (sparkles).
 *
 * Vast achter alle content via position: fixed + z-index: -1, pointer-events
 * none zodat clicks gewoon doorgaan naar de UI.
 */

export default function StudioBackground() {
  const particles = [
    { x: 8, y: 12, size: 3, delay: 0, dur: 14 },
    { x: 92, y: 22, size: 2, delay: 2, dur: 16 },
    { x: 78, y: 8, size: 4, delay: 1, dur: 13 },
    { x: 18, y: 78, size: 2, delay: 3, dur: 17 },
    { x: 65, y: 88, size: 3, delay: 4, dur: 15 },
    { x: 42, y: 6, size: 2, delay: 5, dur: 14 },
    { x: 88, y: 62, size: 3, delay: 1.5, dur: 16 },
    { x: 12, y: 45, size: 2, delay: 2.5, dur: 13 },
    { x: 55, y: 38, size: 3, delay: 3.5, dur: 15 },
    { x: 30, y: 92, size: 2, delay: 0.5, dur: 17 },
    { x: 72, y: 50, size: 4, delay: 4.5, dur: 14 },
    { x: 95, y: 78, size: 2, delay: 6, dur: 16 },
    { x: 5, y: 60, size: 3, delay: 2.8, dur: 13 },
    { x: 48, y: 70, size: 2, delay: 5.5, dur: 15 },
  ];

  return (
    <div
      aria-hidden
      className="bedenker-studio-bg"
      style={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 0,
        overflow: 'hidden',
      }}
    >
      {/* 3 bewegende mesh-blobs */}
      <div className="bedenker-mesh-blob blob-1" />
      <div className="bedenker-mesh-blob blob-2" />
      <div className="bedenker-mesh-blob blob-3" />

      {/* Drifting particles */}
      {particles.map((p, i) => (
        <span
          key={i}
          style={{
            position: 'absolute',
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: p.size,
            height: p.size,
            borderRadius: '50%',
            background: i % 3 === 0 ? '#a78bfa' : i % 3 === 1 ? '#FFBF00' : '#fde68a',
            boxShadow: `0 0 ${p.size * 4}px ${i % 3 === 0 ? '#a78bfa' : '#FFBF00'}`,
            animation: `studio-drift ${p.dur}s ease-in-out ${p.delay}s infinite`,
            opacity: 0.55,
          }}
        />
      ))}

      <style jsx>{`
        :global(.bedenker-mesh-blob) {
          position: absolute;
          border-radius: 50%;
          filter: blur(80px);
          opacity: 0.4;
          will-change: transform;
        }
        :global(.bedenker-mesh-blob.blob-1) {
          top: -10%;
          left: -10%;
          width: 600px;
          height: 600px;
          background: radial-gradient(circle, rgba(167, 139, 250, 0.5), transparent 60%);
          animation: studio-blob-1 22s ease-in-out infinite;
        }
        :global(.bedenker-mesh-blob.blob-2) {
          top: 30%;
          right: -10%;
          width: 500px;
          height: 500px;
          background: radial-gradient(circle, rgba(255, 191, 0, 0.35), transparent 60%);
          animation: studio-blob-2 26s ease-in-out infinite;
        }
        :global(.bedenker-mesh-blob.blob-3) {
          bottom: -15%;
          left: 25%;
          width: 700px;
          height: 700px;
          background: radial-gradient(circle, rgba(196, 163, 90, 0.3), transparent 60%);
          animation: studio-blob-3 30s ease-in-out infinite;
        }
        @keyframes studio-blob-1 {
          0%,
          100% {
            transform: translate(0, 0) scale(1);
          }
          33% {
            transform: translate(30px, 50px) scale(1.1);
          }
          66% {
            transform: translate(-20px, 80px) scale(0.95);
          }
        }
        @keyframes studio-blob-2 {
          0%,
          100% {
            transform: translate(0, 0) scale(1);
          }
          50% {
            transform: translate(-80px, 40px) scale(1.15);
          }
        }
        @keyframes studio-blob-3 {
          0%,
          100% {
            transform: translate(0, 0) scale(1);
          }
          40% {
            transform: translate(60px, -40px) scale(0.9);
          }
          75% {
            transform: translate(-30px, 30px) scale(1.05);
          }
        }
        @keyframes studio-drift {
          0%,
          100% {
            transform: translate(0, 0) scale(1);
            opacity: 0.3;
          }
          25% {
            transform: translate(12px, -15px) scale(1.3);
            opacity: 0.85;
          }
          50% {
            transform: translate(-8px, -25px) scale(0.85);
            opacity: 0.5;
          }
          75% {
            transform: translate(6px, -12px) scale(1.15);
            opacity: 0.75;
          }
        }
      `}</style>
    </div>
  );
}
