'use client';

import { useRef, useState, useEffect, useCallback } from 'react';

interface SignaturePadProps {
  onSignature: (dataUrl: string | null) => void;
  width?: number;
  height?: number;
}

export default function SignaturePad({ onSignature, width = 400, height = 160 }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);

  // Responsive canvas sizing
  const [canvasSize, setCanvasSize] = useState({ w: width, h: height });

  useEffect(function () {
    function resize() {
      const w = Math.min(width, window.innerWidth - 80);
      setCanvasSize({ w, h: Math.round(w * (height / width)) });
    }
    resize();
    window.addEventListener('resize', resize);
    return function () { window.removeEventListener('resize', resize); };
  }, [width, height]);

  // Set up canvas context
  useEffect(function () {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Scale for retina displays
    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvasSize.w * dpr;
    canvas.height = canvasSize.h * dpr;
    canvas.style.width = canvasSize.w + 'px';
    canvas.style.height = canvasSize.h + 'px';
    ctx.scale(dpr, dpr);

    // Drawing style
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, [canvasSize]);

  const getPos = useCallback(function (e: React.MouseEvent | React.TouchEvent) {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();

    if ('touches' in e) {
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top,
      };
    }
    return {
      x: (e as React.MouseEvent).clientX - rect.left,
      y: (e as React.MouseEvent).clientY - rect.top,
    };
  }, []);

  function startDraw(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx) return;

    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    setIsDrawing(true);
  }

  function draw(e: React.MouseEvent | React.TouchEvent) {
    if (!isDrawing) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx) return;

    const pos = getPos(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  }

  function endDraw() {
    if (!isDrawing) return;
    setIsDrawing(false);
    setHasSignature(true);

    const canvas = canvasRef.current;
    if (canvas) {
      onSignature(canvas.toDataURL('image/png'));
    }
  }

  function clear() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx || !canvas) return;

    const dpr = window.devicePixelRatio || 1;
    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
    setHasSignature(false);
    onSignature(null);
  }

  return (
    <div>
      <div style={{
        position: 'relative',
        borderRadius: 12,
        border: '1px solid rgba(255,255,255,0.1)',
        background: 'rgba(0,0,0,0.3)',
        overflow: 'hidden',
      }}>
        <canvas
          ref={canvasRef}
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={endDraw}
          onMouseLeave={endDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={endDraw}
          style={{
            display: 'block',
            cursor: 'crosshair',
            touchAction: 'none',
          }}
        />

        {/* Signature line */}
        <div style={{
          position: 'absolute', bottom: 30, left: 20, right: 20,
          borderBottom: '1px dashed rgba(255,255,255,0.15)',
        }} />

        {/* Placeholder text */}
        {!hasSignature && (
          <div style={{
            position: 'absolute', top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            color: 'rgba(255,255,255,0.15)', fontSize: 14,
            pointerEvents: 'none', userSelect: 'none',
            whiteSpace: 'nowrap',
          }}>
            Teken hier uw handtekening
          </div>
        )}
      </div>

      {hasSignature && (
        <button
          onClick={clear}
          type="button"
          style={{
            marginTop: 8, padding: '4px 12px', borderRadius: 6,
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
            color: '#a3a3a3', fontSize: 12, cursor: 'pointer',
          }}
        >
          Opnieuw tekenen
        </button>
      )}
    </div>
  );
}
