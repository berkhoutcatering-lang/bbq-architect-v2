'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import { Maximize2, Eraser, Check } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetClose,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/mobile';

interface SignaturePadProps {
  onSignature: (dataUrl: string | null) => void;
  width?: number;
  height?: number;
  /** Hide the "Volledig scherm" button (e.g. when this IS the fullscreen instance). */
  fullscreenAvailable?: boolean;
}

/** Bare canvas component — used both inline and inside the fullscreen Sheet. */
function SignatureCanvas({
  width,
  height,
  onSignature,
  onHasSignatureChange,
  resetKey,
}: {
  width: number;
  height: number;
  onSignature: (dataUrl: string | null) => void;
  onHasSignatureChange: (has: boolean) => void;
  resetKey: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  // Set up canvas + retina scaling when size changes (or when resetKey bumps to clear).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    ctx.scale(dpr, dpr);

    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, [width, height, resetKey]);

  const getPos = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    if ('touches' in e) {
      return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    }
    return {
      x: (e as React.MouseEvent).clientX - rect.left,
      y: (e as React.MouseEvent).clientY - rect.top,
    };
  }, []);

  function startDraw(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault();
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    setIsDrawing(true);
  }

  function draw(e: React.MouseEvent | React.TouchEvent) {
    if (!isDrawing) return;
    e.preventDefault();
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const pos = getPos(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  }

  function endDraw() {
    if (!isDrawing) return;
    setIsDrawing(false);
    onHasSignatureChange(true);
    const canvas = canvasRef.current;
    if (canvas) onSignature(canvas.toDataURL('image/png'));
  }

  return (
    <canvas
      ref={canvasRef}
      onMouseDown={startDraw}
      onMouseMove={draw}
      onMouseUp={endDraw}
      onMouseLeave={endDraw}
      onTouchStart={startDraw}
      onTouchMove={draw}
      onTouchEnd={endDraw}
      style={{ display: 'block', cursor: 'crosshair', touchAction: 'none' }}
    />
  );
}

export default function SignaturePad({
  onSignature,
  width = 400,
  height = 160,
  fullscreenAvailable = true,
}: SignaturePadProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hasSignature, setHasSignature] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const [fullOpen, setFullOpen] = useState(false);

  // Responsive sizing via ResizeObserver — measures the actual container width
  // instead of guessing with window.innerWidth - padding.
  const [canvasSize, setCanvasSize] = useState({ w: width, h: height });
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const aspect = height / width;
    const compute = () => {
      const w = Math.min(width, el.clientWidth - 2); // -2 for border
      setCanvasSize({ w, h: Math.round(w * aspect) });
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [width, height]);

  function clear() {
    setResetKey((k) => k + 1);
    setHasSignature(false);
    onSignature(null);
  }

  // Fullscreen-Sheet inner state (independent canvas)
  const [fsHasSignature, setFsHasSignature] = useState(false);
  const [fsResetKey, setFsResetKey] = useState(0);
  const [fsLandscape, setFsLandscape] = useState(false);

  // Effect: only the orientation-listener side-effect, no state-resets here.
  useEffect(() => {
    if (!fullOpen || typeof window === 'undefined') return;
    const onResize = () => setFsLandscape(window.innerWidth > window.innerHeight);
    onResize();
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, [fullOpen]);

  function openFullscreen() {
    // Reset canvas state before opening so the user always starts with a blank pad.
    setFsHasSignature(false);
    setFsResetKey((k) => k + 1);
    setFullOpen(true);
  }

  return (
    <div>
      <div
        ref={containerRef}
        style={{
          position: 'relative',
          borderRadius: 12,
          border: '1px solid rgba(255,255,255,0.1)',
          background: 'rgba(0,0,0,0.3)',
          overflow: 'hidden',
        }}
      >
        <SignatureCanvas
          width={canvasSize.w}
          height={canvasSize.h}
          onSignature={onSignature}
          onHasSignatureChange={setHasSignature}
          resetKey={resetKey}
        />

        <div
          style={{
            position: 'absolute',
            bottom: 30,
            left: 20,
            right: 20,
            borderBottom: '1px dashed rgba(255,255,255,0.15)',
            pointerEvents: 'none',
          }}
        />

        {!hasSignature && (
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              color: 'rgba(255,255,255,0.15)',
              fontSize: 14,
              pointerEvents: 'none',
              userSelect: 'none',
              maxWidth: '90%',
              textAlign: 'center',
            }}
          >
            Teken hier uw handtekening
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
        {hasSignature && (
          <button
            onClick={clear}
            type="button"
            style={{
              minHeight: 36,
              padding: '6px 14px',
              borderRadius: 8,
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: '#a3a3a3',
              fontSize: 12,
              cursor: 'pointer',
              touchAction: 'manipulation',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <Eraser size={14} />
            Opnieuw tekenen
          </button>
        )}
        {fullscreenAvailable && (
          <button
            onClick={openFullscreen}
            type="button"
            style={{
              minHeight: 36,
              padding: '6px 14px',
              borderRadius: 8,
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: '#a3a3a3',
              fontSize: 12,
              cursor: 'pointer',
              touchAction: 'manipulation',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              marginLeft: hasSignature ? 0 : 'auto',
            }}
            aria-label="Open handtekening-pad in volledig scherm"
          >
            <Maximize2 size={14} />
            Volledig scherm
          </button>
        )}
      </div>

      {fullscreenAvailable && (
        <Sheet open={fullOpen} onOpenChange={setFullOpen} variant="full">
          <SheetContent showHandle={false}>
            <SheetHeader>
              <SheetTitle>Handtekening</SheetTitle>
              <SheetDescription>
                {fsLandscape
                  ? 'Teken in het kader hieronder.'
                  : 'Tip: draai uw telefoon naar liggend voor meer ruimte.'}
              </SheetDescription>
            </SheetHeader>

            <FullscreenSignatureBody
              landscape={fsLandscape}
              resetKey={fsResetKey}
              hasSignature={fsHasSignature}
              onSignature={(d) => {
                onSignature(d);
              }}
              onHasSignatureChange={setFsHasSignature}
              onClear={() => {
                setFsResetKey((k) => k + 1);
                setFsHasSignature(false);
                onSignature(null);
              }}
            />

            <div
              style={{
                display: 'flex',
                gap: 10,
                padding: '12px var(--space-mobile-edge)',
                paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))',
                borderTop: '1px solid var(--border, #2a2a30)',
                background: 'var(--card, #16161a)',
              }}
            >
              <SheetClose asChild>
                <button
                  type="button"
                  style={{
                    minHeight: 48,
                    padding: '12px 20px',
                    borderRadius: 10,
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    color: 'var(--muted)',
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: 'pointer',
                    touchAction: 'manipulation',
                  }}
                >
                  Annuleren
                </button>
              </SheetClose>
              <SheetClose asChild>
                <button
                  type="button"
                  disabled={!fsHasSignature}
                  style={{
                    flex: 1,
                    minHeight: 48,
                    padding: '12px 20px',
                    borderRadius: 10,
                    background: fsHasSignature ? 'var(--amber, #c4a35a)' : 'rgba(196,163,90,.3)',
                    color: fsHasSignature ? '#000' : 'rgba(0,0,0,.5)',
                    border: 'none',
                    fontSize: 15,
                    fontWeight: 800,
                    cursor: fsHasSignature ? 'pointer' : 'not-allowed',
                    touchAction: 'manipulation',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                  }}
                  onClick={() => {
                    setHasSignature(true);
                  }}
                >
                  <Check size={18} />
                  Klaar — gebruik handtekening
                </button>
              </SheetClose>
            </div>
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}

function FullscreenSignatureBody({
  landscape,
  resetKey,
  hasSignature,
  onSignature,
  onHasSignatureChange,
  onClear,
}: {
  landscape: boolean;
  resetKey: number;
  hasSignature: boolean;
  onSignature: (d: string | null) => void;
  onHasSignatureChange: (h: boolean) => void;
  onClear: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 600, h: 300 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const compute = () => {
      const w = el.clientWidth - 24;
      const h = Math.min(el.clientHeight - 24, landscape ? Math.round(w * 0.45) : Math.round(w * 0.7));
      setSize({ w, h });
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [landscape]);

  return (
    <div
      ref={containerRef}
      style={{
        flex: 1,
        padding: 12,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'relative',
          width: size.w,
          height: size.h,
          borderRadius: 12,
          border: '1px solid rgba(255,255,255,0.12)',
          background: 'rgba(0,0,0,0.35)',
          overflow: 'hidden',
        }}
      >
        <SignatureCanvas
          width={size.w}
          height={size.h}
          onSignature={onSignature}
          onHasSignatureChange={onHasSignatureChange}
          resetKey={resetKey}
        />
        <div
          style={{
            position: 'absolute',
            bottom: 36,
            left: 28,
            right: 28,
            borderBottom: '1px dashed rgba(255,255,255,0.18)',
            pointerEvents: 'none',
          }}
        />
        {!hasSignature && (
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              color: 'rgba(255,255,255,0.18)',
              fontSize: 16,
              pointerEvents: 'none',
              userSelect: 'none',
            }}
          >
            Teken hier uw handtekening
          </div>
        )}
      </div>

      {hasSignature && (
        <button
          type="button"
          onClick={onClear}
          style={{
            minHeight: 40,
            padding: '8px 16px',
            borderRadius: 8,
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.1)',
            color: '#a3a3a3',
            fontSize: 12,
            cursor: 'pointer',
            touchAction: 'manipulation',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <Eraser size={14} />
          Wissen
        </button>
      )}
    </div>
  );
}
