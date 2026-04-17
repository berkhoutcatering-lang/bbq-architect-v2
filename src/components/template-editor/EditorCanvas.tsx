'use client';

import { useDroppable } from '@dnd-kit/core';
import { useRef, useState, useCallback, useEffect } from 'react';
import { RotateCcw, RotateCw, ChevronsUp, ChevronsDown, Copy, Trash2, Lock, Unlock, ArrowUpToLine, ArrowDownToLine, Eraser } from 'lucide-react';
import RndBlock from './RndBlock';
import { gridBackground } from './useSnapGrid';
import type { TemplateBlock, PageSettings, PdfTemplate } from '@/types/template.types';

const SNAP_THRESHOLD_MM = 10; // wider zone — block grabs onto guide lines noticeably earlier

interface Props {
  blocks: TemplateBlock[];
  pageSettings: PageSettings;
  selectedBlockId: string | null;
  hiddenBlockIds: Set<string>;
  onSelectBlock: (id: string | null) => void;
  onBlockPositionChange: (blockId: string, x: number, y: number) => void;
  onBlockSizeChange: (blockId: string, width: number, height: number) => void;
  /** Patch arbitrary fields on a block — used by the floating toolbar (rotation, etc.). */
  onUpdateBlock?: (blockId: string, updates: Partial<TemplateBlock>) => void;
  onZIndexChange?: (blockId: string, direction: 'up' | 'down') => void;
  onDuplicate?: (blockId: string) => void;
  onDelete?: (blockId: string) => void;
  documentType: PdfTemplate['document_type'];
  zoom: number;
  snapEnabled: boolean;
  showGuides: boolean;
}

// Ruler component
function Ruler({ orientation, length, zoom }: { orientation: 'horizontal' | 'vertical'; length: number; zoom: number }) {
  const scale = zoom / 100;
  const mmToPx = 2.5 * scale;
  const isH = orientation === 'horizontal';
  const ticks: React.ReactNode[] = [];

  for (let mm = 0; mm <= length; mm += 5) {
    const pos = mm * mmToPx;
    const isCm = mm % 10 === 0;
    const tickLen = isCm ? 10 : 5;

    if (isH) {
      ticks.push(
        <line key={mm} x1={pos} y1={isCm ? 0 : 5} x2={pos} y2={tickLen} stroke="var(--muted)" strokeWidth={0.5} opacity={isCm ? 0.6 : 0.3} />
      );
      if (isCm && mm > 0) {
        ticks.push(
          <text key={'t' + mm} x={pos} y={18} fill="var(--muted)" fontSize={8} textAnchor="middle" opacity={0.5}>{mm / 10}</text>
        );
      }
    } else {
      ticks.push(
        <line key={mm} x1={isCm ? 0 : 5} y1={pos} x2={tickLen} y2={pos} stroke="var(--muted)" strokeWidth={0.5} opacity={isCm ? 0.6 : 0.3} />
      );
      if (isCm && mm > 0) {
        ticks.push(
          <text key={'t' + mm} x={18} y={pos + 3} fill="var(--muted)" fontSize={8} textAnchor="middle" opacity={0.5}>{mm / 10}</text>
        );
      }
    }
  }

  if (isH) {
    return (
      <svg width={length * mmToPx + 20} height={22} style={{ display: 'block', flexShrink: 0 }}>
        {ticks}
      </svg>
    );
  }

  return (
    <svg width={22} height={length * mmToPx + 20} style={{ display: 'block', flexShrink: 0 }}>
      {ticks}
    </svg>
  );
}

export default function EditorCanvas({
  blocks, pageSettings, selectedBlockId, hiddenBlockIds, onSelectBlock,
  onBlockPositionChange, onBlockSizeChange,
  onUpdateBlock, onZIndexChange, onDuplicate, onDelete,
  documentType, zoom,
  snapEnabled, showGuides,
}: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: 'canvas-drop' });

  // Use refs for drag state — NO useState, NO re-renders during drag
  const guideSvgRef = useRef<SVGSVGElement>(null);
  const activeVRef = useRef<SVGLineElement | null>(null);
  const activeHRef = useRef<SVGLineElement | null>(null);

  const scale = zoom / 100;
  const mmToPx = 2.5;
  const pageW = pageSettings.format === 'a4' ? 210 : 216;
  const pageH = pageSettings.format === 'a4' ? 297 : 279;
  const canvasWidth = pageW * mmToPx;
  const canvasHeight = pageH * mmToPx;
  const snapGrid = snapEnabled ? 2.5 : 0;

  const gridBg = snapEnabled ? gridBackground(snapGrid, mmToPx) : undefined;

  // Show/hide alignment guides via direct DOM manipulation — zero re-renders
  const handleDragStart = useCallback(function () {
    if (guideSvgRef.current) guideSvgRef.current.style.display = 'block';
  }, []);

  const handleDragEnd = useCallback(function () {
    if (guideSvgRef.current) guideSvgRef.current.style.display = 'none';
    if (activeVRef.current) activeVRef.current.style.display = 'none';
    if (activeHRef.current) activeHRef.current.style.display = 'none';
  }, []);

  // Build snap targets once (used by guide lines)
  const marginLeft = pageSettings.margins.left;
  const marginTop = pageSettings.margins.top;
  const marginRight = pageSettings.margins.right;
  const marginBottom = pageSettings.margins.bottom;

  // Pre-compute guide line positions from all blocks + margins
  const vLines: number[] = [marginLeft, pageW - marginRight, pageW / 2];
  const hLines: number[] = [marginTop, pageH - marginBottom, pageH / 2];
  for (const b of blocks) {
    if (b.x !== undefined) {
      const bL = b.x || 0;
      const bW = b.width || 0;
      vLines.push(bL, bL + bW, bL + bW / 2);
    }
    if (b.y !== undefined) {
      const bT = b.y || 0;
      const bH = b.height || 0;
      hLines.push(bT, bT + bH, bT + bH / 2);
    }
  }

  // Deduplicate lines (round to 0.5mm)
  const uniqueV = [...new Set(vLines.map(function (v) { return Math.round(v * 2) / 2; }))];
  const uniqueH = [...new Set(hLines.map(function (v) { return Math.round(v * 2) / 2; }))];

  // Live snap during drag — pulls block to alignment with neighbours/margins
  const handleDragMove = useCallback(function (
    blockId: string, mmX: number, mmY: number, w: number, h: number,
  ): { x: number; y: number; snappedX: boolean; snappedY: boolean } {
    const T = SNAP_THRESHOLD_MM;
    const left = mmX, right = mmX + w, cx = mmX + w / 2;
    const top = mmY, bottom = mmY + h, cy = mmY + h / 2;

    // Build live targets (excluding the dragged block itself)
    const vT: number[] = [marginLeft, pageW - marginRight, pageW / 2];
    const hT: number[] = [marginTop, pageH - marginBottom, pageH / 2];
    for (const b of blocks) {
      if (b.id === blockId || b.x === undefined || b.y === undefined) continue;
      const bL = b.x || 0, bW = b.width || 0, bT2 = b.y || 0, bH = b.height || 0;
      vT.push(bL, bL + bW, bL + bW / 2);
      hT.push(bT2, bT2 + bH, bT2 + bH / 2);
    }

    let snapX = mmX, bestDx = T + 1, activeV = -1;
    for (const vt of vT) {
      const dL = Math.abs(left - vt);   if (dL < bestDx) { bestDx = dL; snapX = vt;       activeV = vt; }
      const dR = Math.abs(right - vt);  if (dR < bestDx) { bestDx = dR; snapX = vt - w;   activeV = vt; }
      const dC = Math.abs(cx - vt);     if (dC < bestDx) { bestDx = dC; snapX = vt - w/2; activeV = vt; }
    }
    let snapY = mmY, bestDy = T + 1, activeH = -1;
    for (const ht of hT) {
      const dT2 = Math.abs(top - ht);    if (dT2 < bestDy) { bestDy = dT2; snapY = ht;       activeH = ht; }
      const dB  = Math.abs(bottom - ht); if (dB  < bestDy) { bestDy = dB;  snapY = ht - h;   activeH = ht; }
      const dC  = Math.abs(cy - ht);     if (dC  < bestDy) { bestDy = dC;  snapY = ht - h/2; activeH = ht; }
    }

    const snappedX = bestDx <= T;
    const snappedY = bestDy <= T;

    // Highlight the active snap line(s) via direct DOM (no re-render)
    if (activeVRef.current) {
      if (snappedX && activeV >= 0) {
        const px = activeV * mmToPx;
        activeVRef.current.setAttribute('x1', String(px));
        activeVRef.current.setAttribute('x2', String(px));
        activeVRef.current.style.display = 'block';
      } else {
        activeVRef.current.style.display = 'none';
      }
    }
    if (activeHRef.current) {
      if (snappedY && activeH >= 0) {
        const py = activeH * mmToPx;
        activeHRef.current.setAttribute('y1', String(py));
        activeHRef.current.setAttribute('y2', String(py));
        activeHRef.current.style.display = 'block';
      } else {
        activeHRef.current.style.display = 'none';
      }
    }

    return {
      x: Math.round(snapX * 100) / 100,
      y: Math.round(snapY * 100) / 100,
      snappedX, snappedY,
    };
  }, [blocks, marginLeft, marginRight, marginTop, marginBottom, pageW, pageH, mmToPx]);

  // Alt+click handler — cycle through blocks under the cursor by descending z-index
  const handleAltSelect = useCallback(function (mmX: number, mmY: number, currentId: string) {
    const stack = blocks.filter(function (b) {
      const x = b.x || 0, y = b.y || 0, w = b.width || 0, h = b.height || 0;
      return mmX >= x && mmX <= x + w && mmY >= y && mmY <= y + h;
    }).sort(function (a, b) { return (b.zIndex || 0) - (a.zIndex || 0); });
    if (stack.length === 0) return;
    const idx = stack.findIndex(function (b) { return b.id === currentId; });
    const next = stack[(idx + 1) % stack.length];
    if (next) onSelectBlock(next.id);
  }, [blocks, onSelectBlock]);

  // Right-click + left-click context menu state (single menu, both triggers)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; blockId: string } | null>(null);
  function handleContextMenu(clientX: number, clientY: number, blockId: string) {
    setContextMenu({ x: clientX, y: clientY, blockId });
  }
  // Dismiss on any outside click / scroll / Escape
  useEffect(function () {
    if (!contextMenu) return;
    function close() { setContextMenu(null); }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') close(); }
    window.addEventListener('mousedown', close);
    window.addEventListener('scroll', close, true);
    window.addEventListener('keydown', onKey);
    return function () {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [contextMenu]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
      {/* Horizontal Ruler */}
      <div style={{ marginLeft: 22, overflow: 'hidden' }}>
        <Ruler orientation="horizontal" length={pageW} zoom={zoom} />
      </div>

      <div style={{ display: 'flex' }}>
        {/* Vertical Ruler */}
        <div style={{ overflow: 'hidden' }}>
          <Ruler orientation="vertical" length={pageH} zoom={zoom} />
        </div>

        {/* Canvas */}
        <div
          ref={setNodeRef}
          data-canvas="true"
          onClick={function (e) { if (e.target === e.currentTarget) onSelectBlock(null); }}
          style={{
            width: canvasWidth,
            height: canvasHeight,
            position: 'relative',
            backgroundColor: pageSettings.backgroundColor || '#ffffff',
            borderRadius: 4,
            boxShadow: '0 2px 16px rgba(0,0,0,.12)',
            border: isOver ? '2px dashed var(--brand)' : '1px solid rgba(0,0,0,.08)',
            transition: 'border-color 0.2s',
            flexShrink: 0,
            transformOrigin: 'top left',
            transform: 'scale(' + scale + ')',
            marginRight: canvasWidth * (scale - 1) + 'px',
            marginBottom: canvasHeight * (scale - 1) + 'px',
            ...gridBg,
          }}
        >
          {/* Margin guides */}
          <svg style={{ position: 'absolute', top: 0, left: 0, width: canvasWidth, height: canvasHeight, pointerEvents: 'none', zIndex: 1 }}>
            <rect
              x={marginLeft * mmToPx}
              y={marginTop * mmToPx}
              width={(pageW - marginLeft - marginRight) * mmToPx}
              height={(pageH - marginTop - marginBottom) * mmToPx}
              fill="none" stroke="rgba(0,0,0,0.06)" strokeWidth={0.5} strokeDasharray="4,4"
            />
          </svg>

          {/* Alignment guide lines — hidden by default, shown during drag via ref */}
          {showGuides && (
            <svg
              ref={guideSvgRef}
              style={{ position: 'absolute', top: 0, left: 0, width: canvasWidth, height: canvasHeight, pointerEvents: 'none', zIndex: 9999, display: 'none' }}
            >
              {uniqueV.map(function (x, i) {
                return <line key={'v' + i} x1={x * mmToPx} y1={0} x2={x * mmToPx} y2={canvasHeight} stroke="var(--muted)" strokeWidth={0.5} strokeDasharray="3,3" opacity={0.4} />;
              })}
              {uniqueH.map(function (y, i) {
                return <line key={'h' + i} x1={0} y1={y * mmToPx} x2={canvasWidth} y2={y * mmToPx} stroke="var(--muted)" strokeWidth={0.5} strokeDasharray="3,3" opacity={0.4} />;
              })}
              {/* Active snap lines — solid brand colour, shown only when snapped */}
              <line ref={activeVRef} x1={0} y1={0} x2={0} y2={canvasHeight} stroke="var(--brand)" strokeWidth={1.5} opacity={0.9} style={{ display: 'none' }} />
              <line ref={activeHRef} x1={0} y1={0} x2={canvasWidth} y2={0} stroke="var(--brand)" strokeWidth={1.5} opacity={0.9} style={{ display: 'none' }} />
            </svg>
          )}

          {/* Empty state */}
          {blocks.length === 0 && (
            <div style={{
              position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
              color: '#bbb', fontSize: 13, fontStyle: 'italic',
              border: '2px dashed #e0e0e0', borderRadius: 6, padding: '40px 60px',
              textAlign: 'center',
            }}>
              Sleep blokken hierheen
            </div>
          )}

          {/* Blocks — NO state changes during drag */}
          {blocks.map(function (block) {
            return (
              <RndBlock
                key={block.id}
                block={block}
                isSelected={selectedBlockId === block.id}
                isHidden={hiddenBlockIds.has(block.id)}
                mmToPx={mmToPx}
                zoom={zoom}
                onSelect={function () { onSelectBlock(block.id); }}
                onPositionChange={function (x, y) { onBlockPositionChange(block.id, x, y); }}
                onSizeChange={function (w, h) { onBlockSizeChange(block.id, w, h); }}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onDragMove={snapEnabled ? function (x, y, w, h) { return handleDragMove(block.id, x, y, w, h); } : undefined}
                onAltSelect={handleAltSelect}
                onContextMenu={handleContextMenu}
                documentType={documentType}
                snapToGrid={snapGrid}
              />
            );
          })}

          {/* Floating icon toolbar removed — left-click now opens the same vertical
              context menu as right-click (see BlockContextMenu render below). */}
        </div>
      </div>

      {/* Hover ring style — pure CSS, brand colour for clearer "clickable" affordance */}
      <style>{`
        .rnd-hover-ring { transition: border-color 0.1s; }
        [data-canvas] > div:hover > div > .rnd-hover-ring { border-color: rgba(255,191,0,0.5) !important; }
      `}</style>

      {/* Right-click context menu (rendered at document level to escape canvas transform) */}
      {contextMenu && (() => {
        const cmBlock = blocks.find(function (b) { return b.id === contextMenu.blockId; });
        if (!cmBlock) return null;
        return (
          <BlockContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            block={cmBlock}
            onClose={function () { setContextMenu(null); }}
            onUpdate={onUpdateBlock}
            onZIndexChange={onZIndexChange}
            onDuplicate={onDuplicate}
            onDelete={onDelete}
          />
        );
      })()}
    </div>
  );
}

// ── Context-menu primitives (hoisted so React's static-components rule is happy)
function MenuItem({ icon, label, shortcut, onClick, danger }: { icon: React.ReactNode; label: string; shortcut?: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={function (e) { e.stopPropagation(); onClick(); }}
      onMouseEnter={function (e) { (e.currentTarget as HTMLElement).style.background = 'var(--hover, rgba(255,255,255,.05))'; }}
      onMouseLeave={function (e) { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
      style={{
        display: 'flex', alignItems: 'center', gap: 8, width: '100%',
        padding: '6px 12px', border: 'none', background: 'transparent',
        color: danger ? 'var(--danger, #ef4444)' : 'var(--text)',
        cursor: 'pointer', fontSize: 12, textAlign: 'left',
      }}
    >
      <span style={{ display: 'inline-flex', width: 14, justifyContent: 'center', color: 'var(--muted)' }}>{icon}</span>
      <span style={{ flex: 1 }}>{label}</span>
      {shortcut && <span style={{ fontSize: 10, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>{shortcut}</span>}
    </button>
  );
}

function MenuSeparator() {
  return <div style={{ height: 1, background: 'var(--border, rgba(130,130,130,.15))', margin: '4px 0' }} />;
}

// ── Right-click context menu (rich set of actions for the clicked block) ───
function BlockContextMenu({
  x, y, block, onClose,
  onUpdate, onZIndexChange, onDuplicate, onDelete,
}: {
  x: number; y: number;
  block: TemplateBlock;
  onClose: () => void;
  onUpdate?: (id: string, updates: Partial<TemplateBlock>) => void;
  onZIndexChange?: (id: string, dir: 'up' | 'down') => void;
  onDuplicate?: (id: string) => void;
  onDelete?: (id: string) => void;
}) {
  // Clamp to viewport using conservative menu-size estimates — avoids a layout-effect
  // measure (and the React 19 set-state-in-effect warning) without causing flicker.
  const MENU_W_EST = 220;
  const MENU_H_EST = 320;
  const pos = {
    x: Math.min(x, (typeof window !== 'undefined' ? window.innerWidth : 1024) - MENU_W_EST - 8),
    y: Math.min(y, (typeof window !== 'undefined' ? window.innerHeight : 768) - MENU_H_EST - 8),
  };

  function patch(u: Partial<TemplateBlock>) { onUpdate && onUpdate(block.id, u); onClose(); }
  function rotate(delta: number) {
    const r = (((block.rotation || 0) + delta) % 360 + 360) % 360;
    patch({ rotation: r === 0 ? undefined : r } as Partial<TemplateBlock>);
  }

  return (
    <div
      role="menu"
      aria-label="Blok-acties"
      onClick={function (e) { e.stopPropagation(); }}
      onMouseDown={function (e) { e.stopPropagation(); }}
      onContextMenu={function (e) { e.preventDefault(); e.stopPropagation(); }}
      style={{
        position: 'fixed',
        top: pos.y, left: pos.x,
        zIndex: 99998,
        minWidth: 200,
        padding: '4px 0',
        background: 'var(--surface, #1e1e22)',
        border: '1px solid var(--border-strong, rgba(130,130,130,.3))',
        borderRadius: 6,
        boxShadow: '0 12px 28px rgba(0,0,0,.5)',
      }}
    >
      <MenuItem icon={<RotateCcw size={13} />} label="Draai 90° links" onClick={function () { rotate(-90); }} />
      <MenuItem icon={<RotateCw size={13} />} label="Draai 90° rechts" onClick={function () { rotate(90); }} />
      {(block.rotation || 0) !== 0 && (
        <MenuItem icon={<Eraser size={13} />} label="Reset rotatie" onClick={function () { patch({ rotation: undefined } as Partial<TemplateBlock>); }} />
      )}
      <MenuSeparator />
      <MenuItem icon={<ArrowUpToLine size={13} />} label="Naar voorgrond" onClick={function () { onZIndexChange && onZIndexChange(block.id, 'up'); onClose(); }} />
      <MenuItem icon={<ChevronsUp size={13} />} label="Eén naar voren" onClick={function () { onZIndexChange && onZIndexChange(block.id, 'up'); onClose(); }} />
      <MenuItem icon={<ChevronsDown size={13} />} label="Eén naar achteren" onClick={function () { onZIndexChange && onZIndexChange(block.id, 'down'); onClose(); }} />
      <MenuItem icon={<ArrowDownToLine size={13} />} label="Naar achtergrond" onClick={function () { onZIndexChange && onZIndexChange(block.id, 'down'); onClose(); }} />
      <MenuSeparator />
      <MenuItem icon={<Copy size={13} />} label="Dupliceer" shortcut="Ctrl+D" onClick={function () { onDuplicate && onDuplicate(block.id); onClose(); }} />
      <MenuItem
        icon={block.locked ? <Unlock size={13} /> : <Lock size={13} />}
        label={block.locked ? 'Ontgrendel' : 'Vergrendel'}
        onClick={function () { patch({ locked: !block.locked } as Partial<TemplateBlock>); }}
      />
      <MenuSeparator />
      <MenuItem icon={<Trash2 size={13} />} label="Verwijder" shortcut="Del" danger onClick={function () { onDelete && onDelete(block.id); onClose(); }} />
    </div>
  );
}
