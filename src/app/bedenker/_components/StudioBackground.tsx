'use client';

/**
 * Subtiele studio-tinted background voor /bedenker. 3 statische mesh-blobs
 * voor een lichte paarse warmte, geen particles, geen animaties.
 */

export default function StudioBackground() {
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
      <div className="bedenker-mesh-blob blob-1" />
      <div className="bedenker-mesh-blob blob-2" />
      <div className="bedenker-mesh-blob blob-3" />

      <style jsx>{`
        :global(.bedenker-mesh-blob) {
          position: absolute;
          border-radius: 50%;
          filter: blur(100px);
          opacity: 0.07;
        }
        :global(.bedenker-mesh-blob.blob-1) {
          top: -10%;
          left: -10%;
          width: 600px;
          height: 600px;
          background: radial-gradient(circle, rgba(167, 139, 250, 0.5), transparent 60%);
        }
        :global(.bedenker-mesh-blob.blob-2) {
          top: 30%;
          right: -10%;
          width: 500px;
          height: 500px;
          background: radial-gradient(circle, rgba(196, 163, 90, 0.3), transparent 60%);
        }
        :global(.bedenker-mesh-blob.blob-3) {
          bottom: -15%;
          left: 25%;
          width: 700px;
          height: 700px;
          background: radial-gradient(circle, rgba(167, 139, 250, 0.35), transparent 60%);
        }
      `}</style>
    </div>
  );
}
