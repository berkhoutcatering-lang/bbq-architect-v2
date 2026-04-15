'use client';

import { memo, useCallback, useRef } from 'react';
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
  documentType: PdfTemplate['document_type'];
  snapToGrid?: number;
}

function snapValue(value: number, grid: number): number {
  if (!grid) return value;
  return Math.round(value / grid) * grid;
}

function RndBlockInner({
  block, isSelected, isHidden, mmToPx, zoom, onSelect, onPositionChange, onSizeChange,
  onDragStart, onDragEnd, documentType, snapToGrid = 0,
}: Props) {
  // Use refs instead of state to avoid re-renders during drag
  const didDragRef = useRef(false);

  const pixelX = (block.x || 0) * mmToPx;
  const pixelY = (block.y || 0) * mmToPx;
  const pixelW = (block.width || 180) * mmToPx;
  const pixelH = (block.height || 20) * mmToPx;

  const handleDragStart: RndDragCallback = useCallback(function () {
    didDragRef.current = true;
    // NO setState here — that would re-render and kill the drag
    if (onDragStart) onDragStart();
  }, [onDragStart]);

  const handleDragStop: RndDragCallback = useCallback(function (_e, data) {
    const movedX = Math.abs(data.x - pixelX) > 1;
    const movedY = Math.abs(data.y - pixelY) > 1;
    if (movedX || movedY) {
      let mmX = data.x / mmToPx;
      let mmY = data.y / mmToPx;
      if (snapToGrid) {
        mmX = snapValue(mmX, snapToGrid);
        mmY = snapValue(mmY, snapToGrid);
      }
      onPositionChange(Math.round(mmX * 100) / 100, Math.round(mmY * 100) / 100);
    }
    if (onDragEnd) onDragEnd();
    // Reset drag flag after a tick so click handler sees it
    requestAnimationFrame(function () { didDragRef.current = false; });
  }, [mmToPx, snapToGrid, onPositionChange, onDragEnd, pixelX, pixelY]);

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

  // Select on click (mouseup), NOT mousedown — mousedown triggers drag
  const handleClick = useCallback(function (e: React.MouseEvent) {
    e.stopPropagation();
    if (!didDragRef.current) onSelect();
  }, [onSelect]);

  const scale = zoom / 100;

  return (
    <Rnd
      position={{ x: pixelX, y: pixelY }}
      size={{ width: pixelW, height: pixelH }}
      scale={scale}
      bounds="parent"
      disableDragging={block.locked || false}
      enableResizing={isSelected && !block.locked ? {
        top: true, right: true, bottom: true, left: true,
        topRight: true, topLeft: true, bottomRight: true, bottomLeft: true,
      } : false}
      onDragStart={handleDragStart}
      onDragStop={handleDragStop}
      onResizeStop={handleResizeStop}
      minWidth={20 * mmToPx}
      minHeight={5 * mmToPx}
      style={{
        zIndex: isSelected ? 9998 : (block.zIndex || 0),
        opacity: isHidden ? 0.15 : 1,
        cursor: block.locked ? 'default' : 'grab',
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
        style={{
          width: '100%',
          height: '100%',
          outline: isSelected ? '2px solid #3b82f6' : '1px solid transparent',
          outlineOffset: -1,
          borderRadius: 2,
          overflow: 'hidden',
          position: 'relative',
          boxShadow: isSelected ? '0 0 0 1px rgba(59,130,246,0.2)' : 'none',
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
    width: isHorizontal ? '100%' : 8,
    height: isHorizontal ? 8 : '100%',
    background: 'transparent',
    cursor: isHorizontal ? 'ns-resize' : 'ew-resize',
  };
}

function cornerStyle(visible: boolean): React.CSSProperties {
  return {
    display: visible ? 'block' : 'none',
    width: 10,
    height: 10,
    background: '#3b82f6',
    border: '2px solid #fff',
    borderRadius: 2,
    boxShadow: '0 1px 3px rgba(0,0,0,.2)',
    zIndex: 10,
  };
}
