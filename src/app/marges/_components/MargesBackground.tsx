'use client';

/**
 * Subtiele green-tinted background voor /marges. 3 statische mesh-blobs
 * voor warmte, geen particles, geen animaties. Cijfers moeten de show
 * stelen — de achtergrond mag alleen lichtjes ademen via opacity.
 */

export default function MargesBackground() {
  return (
    <div
      aria-hidden
      className="marges-analyse-bg"
      style={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 0,
        overflow: 'hidden',
      }}
    >
      <div className="marges-mesh-blob blob-1" />
      <div className="marges-mesh-blob blob-2" />
      <div className="marges-mesh-blob blob-3" />

      <style jsx>{`
        :global(.marges-mesh-blob) {
          position: absolute;
          border-radius: 50%;
          filter: blur(100px);
          opacity: 0.07;
        }
        :global(.marges-mesh-blob.blob-1) {
          top: -10%;
          left: -10%;
          width: 600px;
          height: 600px;
          background: radial-gradient(circle, rgba(34, 197, 94, 0.45), transparent 60%);
        }
        :global(.marges-mesh-blob.blob-2) {
          top: 30%;
          right: -10%;
          width: 500px;
          height: 500px;
          background: radial-gradient(circle, rgba(132, 204, 22, 0.28), transparent 60%);
        }
        :global(.marges-mesh-blob.blob-3) {
          bottom: -15%;
          left: 25%;
          width: 700px;
          height: 700px;
          background: radial-gradient(circle, rgba(34, 197, 94, 0.22), transparent 60%);
        }
      `}</style>
    </div>
  );
}
