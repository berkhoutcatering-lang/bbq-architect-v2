'use client';

import { memo, useCallback, useRef, useState } from 'react';
import { Rnd, type RndDragCallback, type RndResizeCallback } from 'react-rnd';
import { Lock } from 'lucide-react';
import BlockRenderer from './BlockRenderer';
import type { TemplateBlock, PdfTemplate } from '@/types/template.types';

interface Props {
  block: TemplateBlock;
  isSelected: boolean;
  isHidden: boolean;
  mmToPx: number;
  zoom: number;
  onSelect: () => void;
  onPositionChange: (x: number, y: number) => void;
  onSizeChange: (width: number, height: number) => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  /** Live alignment-snap during drag — receives raw mm coords, returns snapped mm coords + which guide axes triggered. */
  onDragMove?: (mmX: number, mmY: number, w: number, h: number) => { x: number; y: number; snappedX: boolean; snappedY: boolean };
  /** Alt+click handler — cycles to the next block under the click point (z-stack pick). */
  onAltSelect?: (mmX: number, mmY: number, currentId: string) => void;
  /** Right-click handler — opens the block context menu at viewport coords. */
  onContextMenu?: (clientX: number, clientY: number, blockId: string) => void;
  documentType: PdfTemplate['document_type'];
  snapToGrid?: number;
}

function snapValue(value: number, grid: number): number {
  if (!grid) return value;
  return Math.round(value / grid) * grid;
}

function RndBlockInner({
  block, isSelected, isHidden, mmToPx, zoom, onSelect, onPositionChange, onSizeChange,
  onDragStart, onDragEnd, onDragMove, onAltSelect, onContextMenu, documentType, snapToGrid = 0,
}: Props) {
  // Use refs instead of state to avoid re-renders during drag (where possible)
  const didDragRef = useRef(false);
  const rndRef = useRef<Rnd | null>(null);

  const pixelX = (block.x || 0) * mmToPx;
  const pixelY = (block.y || 0) * mmToPx;
  const pixelW = (block.width || 180) * mmToPx;
  const pixelH = (block.height || 20) * mmToPx;

  // Controlled position during drag — required to make alignment-snap "stick" visually.
  // didDragRef is only set in handleDrag (real movement), NOT handleDragStart — react-rnd
  // calls onDragStart on every mousedown, even bare clicks, so flipping it there would
  // make every click look like a drag and cancel the click handler.
  const [livePos, setLivePos] = useState<{ x: number; y: number } | null>(null);

  const handleDragStart: RndDragCallback = useCallback(function () {
    if (onDragStart) onDragStart();
  }, [onDragStart]);

  const handleDrag: RndDragCallback = useCallback(function (_e, data) {
    didDragRef.current = true; // mark as real drag — first onDrag fires only after movement
    if (!onDragMove) {
      setLivePos({ x: data.x, y: data.y });
      return;
    }
    const mmX = data.x / mmToPx;
    const mmY = data.y / mmToPx;
    const w = (block.width || 180);
    const h = (block.height || 20);
    const snapped = onDragMove(mmX, mmY, w, h);
    setLivePos({
      x: (snapped.snappedX ? snapped.x : mmX) * mmToPx,
      y: (snapped.snappedY ? snapped.y : mmY) * mmToPx,
    });
  }, [onDragMove, mmToPx, block.width, block.height]);

  const handleDragStop: RndDragCallback = useCallback(function (_e, data) {
    const dragged = didDragRef.current;
    if (dragged) {
      const finalPx = livePos || { x: data.x, y: data.y };
      const movedX = Math.abs(finalPx.x - pixelX) > 1;
      const movedY = Math.abs(finalPx.y - pixelY) > 1;
      if (movedX || movedY) {
        let mmX = finalPx.x / mmToPx;
        let mmY = finalPx.y / mmToPx;
        if (snapToGrid) {
          mmX = snapValue(mmX, snapToGrid);
          mmY = snapValue(mmY, snapToGrid);
        }
        onPositionChange(Math.round(mmX * 100) / 100, Math.round(mmY * 100) / 100);
      }
      setLivePos(null);
    }
    if (onDragEnd) onDragEnd();
    // Reset on next frame so the click handler (fires after dragStop) sees the right state
    requestAnimationFrame(function () { didDragRef.current = false; });
  }, [livePos, mmToPx, snapToGrid, onPositionChange, onDragEnd, pixelX, pixelY]);

  const handleResizeStop: RndResizeCallback = useCallback(function (_e, _dir, ref, _delta, position) {
    let mmW = parseFloat(ref.style.width) / mmToPx;
    let mmH = parseFloat(ref.style.height) / mmToPx;
    let mmX = position.x / mmToPx;
    let mmY = position.y / mmToPx;
    if (snapToGrid) {
      mmW = snapValue(mmW, snapToGrid);
      mmH = snapValue(mmH, snapToGrid);
      mmX = snapValue(mmX, snapToGrid);
      mmY = snapValue(mmY, snapToGrid);
    }
    onPositionChange(Math.round(mmX * 100) / 100, Math.round(mmY * 100) / 100);
    onSizeChange(Math.round(mmW * 100) / 100, Math.round(mmH * 100) / 100);
  }, [mmToPx, snapToGrid, onPositionChange, onSizeChange]);

  // Select on click (mouseup), NOT mousedown — mousedown triggers drag.
  // Left-click also opens the same context menu the right-click opens — the user wants
  // a single, consistent menu regardless of mouse button.
  const handleClick = useCallback(function (e: React.MouseEvent) {
    e.stopPropagation();
    if (didDragRef.current) return;
    // Alt+click → cycle to next block in the z-stack at this point (so blocks behind larger ones are reachable)
    if (e.altKey && onAltSelect) {
      const canvasEl = (e.currentTarget as HTMLElement).closest('[data-canvas]') as HTMLElement | null;
      const rect = canvasEl?.getBoundingClientRect();
      if (rect) {
        const sc = zoom / 100;
        const mmX = (e.clientX - rect.left) / sc / mmToPx;
        const mmY = (e.clientY - rect.top) / sc / mmToPx;
        onAltSelect(mmX, mmY, block.id);
        return;
      }
    }
    onSelect();
    if (onContextMenu) onContextMenu(e.clientX, e.clientY, block.id);
  }, [onSelect, onAltSelect, onContextMenu, block.id, zoom, mmToPx]);

  const scale = zoom / 100;
  const rotation = block.rotation || 0;

  return (
    <Rnd
      ref={rndRef}
      position={livePos ? livePos : { x: pixelX, y: pixelY }}
      size={{ width: pixelW, height: pixelH }}
      scale={scale}
      bounds="parent"
      disableDragging={block.locked || false}
      enableResizing={isSelected && !block.locked ? {
        top: true, right: true, bottom: true, left: true,
        topRight: true, topLeft: true, bottomRight: true, bottomLeft: true,
      } : false}
      onDragStart={handleDragStart}
      onDrag={handleDrag}
      onDragStop={handleDragStop}
      onResizeStop={handleResizeStop}
      minWidth={20 * mmToPx}
      minHeight={5 * mmToPx}
      style={{
        zIndex: isSelected ? 9998 : (block.zIndex || 0),
        opacity: isHidden ? 0.15 : 1,
        cursor: block.locked ? 'default' : (isSelected ? 'move' : 'pointer'),
      }}
      resizeHandleStyles={{
        top: edgeStyle('top', isSelected),
        right: edgeStyle('right', isSelected),
        bottom: edgeStyle('bottom', isSelected),
        left: edgeStyle('left', isSelected),
        topRight: cornerStyle(isSelected),
        topLeft: cornerStyle(isSelected),
        bottomRight: cornerStyle(isSelected),
        bottomLeft: cornerStyle(isSelected),
      }}
    >
      <div
        onClick={handleClick}
        onContextMenu={function (e) {
          if (!onContextMenu) return;
          e.preventDefault();
          e.stopPropagation();
          onSelect();
          onContextMenu(e.clientX, e.clientY, block.id);
        }}
        style={{
          width: '100%',
          height: '100%',
          outline: isSelected ? '2px solid var(--brand)' : '1px solid transparent',
          outlineOffset: -1,
          borderRadius: 2,
          overflow: 'hidden',
          position: 'relative',
          boxShadow: isSelected ? '0 0 0 1px rgba(255,191,0,0.25)' : 'none',
          transform: rotation ? `rotate(${rotation}deg)` : undefined,
          transformOrigin: 'center center',
          transition: 'transform 0.12s ease',
        }}
      >
        <BlockRenderer block={block} documentType={documentType} />
        {block.locked && (
          <div style={{ position: 'absolute', top: 2, right: 2, background: 'rgba(0,0,0,0.5)', borderRadius: 3, padding: '2px 3px', display: 'flex', alignItems: 'center', pointerEvents: 'none' }}>
            <Lock size={9} color="#fff" />
          </div>
        )}
        <div className="rnd-hover-ring" style={{
          position: 'absolute', inset: 0, borderRadius: 2, pointerEvents: 'none',
          border: isSelected ? 'none' : '1px solid transparent',
          transition: 'border-color 0.1s',
        }} />
      </div>
    </Rnd>
  );
}

const RndBlock = memo(RndBlockInner, function (prev, next) {
  if (prev.block !== next.block) return false;
  if (prev.isSelected !== next.isSelected) return false;
  if (prev.isHidden !== next.isHidden) return false;
  if (prev.zoom !== next.zoom) return false;
  if (prev.snapToGrid !== next.snapToGrid) return false;
  if (prev.mmToPx !== next.mmToPx) return false;
  return true;
});

export default RndBlock;

function edgeStyle(side: string, visible: boolean): React.CSSProperties {
  const isHorizontal = side === 'top' || side === 'bottom';
  return {
    display: visible ? 'block' : 'none',
    width: isHorizontal ? '100%' : 10,
    height: isHorizontal ? 10 : '100%',
    background: 'transparent',
    cursor: isHorizontal ? 'ns-resize' : 'ew-resize',
  };
}

function cornerStyle(visible: boolean): React.CSSProperties {
  return {
    display: visible ? 'block' : 'none',
    width: 14,
    height: 14,
    background: 'var(--brand)',
    border: '2px solid #1a1a1a',
    borderRadius: 3,
    boxShadow: '0 1px 4px rgba(0,0,0,.5)',
    zIndex: 10,
  };
}
