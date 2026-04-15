'use client';

import { useDroppable } from '@dnd-kit/core';
import { useRef, useCallback } from 'react';
import RndBlock from './RndBlock';
import { gridBackground } from './useSnapGrid';
import type { TemplateBlock, PageSettings, PdfTemplate } from '@/types/template.types';

interface Props {
  blocks: TemplateBlock[];
  pageSettings: PageSettings;
  selectedBlockId: string | null;
  hiddenBlockIds: Set<string>;
  onSelectBlock: (id: string | null) => void;
  onBlockPositionChange: (blockId: string, x: number, y: number) => void;
  onBlockSizeChange: (blockId: string, width: number, height: number) => void;
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
  onBlockPositionChange, onBlockSizeChange, documentType, zoom,
  snapEnabled, showGuides,
}: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: 'canvas-drop' });

  // Use refs for drag state — NO useState, NO re-renders during drag
  const guideSvgRef = useRef<SVGSVGElement>(null);

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
                return <line key={'v' + i} x1={x * mmToPx} y1={0} x2={x * mmToPx} y2={canvasHeight} stroke="#f43f5e" strokeWidth={0.5} strokeDasharray="3,3" opacity={0.6} />;
              })}
              {uniqueH.map(function (y, i) {
                return <line key={'h' + i} x1={0} y1={y * mmToPx} x2={canvasWidth} y2={y * mmToPx} stroke="#3b82f6" strokeWidth={0.5} strokeDasharray="3,3" opacity={0.6} />;
              })}
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
                documentType={documentType}
                snapToGrid={snapGrid}
              />
            );
          })}
        </div>
      </div>

      {/* Hover ring style — pure CSS */}
      <style>{`
        .rnd-hover-ring { transition: border-color 0.1s; }
        [data-canvas] > div:hover .rnd-hover-ring { border-color: rgba(59,130,246,0.35) !important; }
      `}</style>
    </div>
  );
}
