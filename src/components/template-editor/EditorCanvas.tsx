'use client';

import { useDroppable } from '@dnd-kit/core';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import BlockRenderer from './BlockRenderer';
import type { TemplateBlock, PageSettings, PdfTemplate } from '@/types/template.types';

interface Props {
  blocks: TemplateBlock[];
  pageSettings: PageSettings;
  selectedBlockId: string | null;
  hiddenBlockIds: Set<string>;
  onSelectBlock: (id: string | null) => void;
  documentType: PdfTemplate['document_type'];
  zoom: number;
}

function SortableBlock({ block, isSelected, isHidden, onSelect, documentType }: {
  block: TemplateBlock;
  isSelected: boolean;
  isHidden: boolean;
  onSelect: () => void;
  documentType: PdfTemplate['document_type'];
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : isHidden ? 0.2 : 1,
    position: 'relative' as const,
    borderRadius: 4,
    border: isSelected ? '2px solid var(--blue)' : '2px solid transparent',
    cursor: 'pointer',
    marginBottom: 1,
  };

  return (
    <div ref={setNodeRef} style={style} onClick={onSelect} className="canvas-block">
      <div
        {...attributes}
        {...listeners}
        className="block-drag-handle"
        style={{
          position: 'absolute', left: -22, top: '50%', transform: 'translateY(-50%)',
          cursor: 'grab', color: isSelected ? 'var(--blue)' : 'var(--muted)',
          opacity: 0, transition: 'opacity 0.15s',
        }}
      >
        <GripVertical size={12} />
      </div>
      <BlockRenderer block={block} documentType={documentType} />
    </div>
  );
}

// Ruler component
function Ruler({ orientation, length, zoom }: { orientation: 'horizontal' | 'vertical'; length: number; zoom: number }) {
  const scale = zoom / 100;
  const mmToPx = 2.5 * scale;
  const isH = orientation === 'horizontal';
  const ticks: React.ReactNode[] = [];

  // Generate ticks for every cm (10mm), with sub-ticks every 5mm
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

export default function EditorCanvas({ blocks, pageSettings, selectedBlockId, hiddenBlockIds, onSelectBlock, documentType, zoom }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: 'canvas-drop' });

  const scale = zoom / 100;
  // A4: 210mm x 297mm
  const pageW = pageSettings.format === 'a4' ? 210 : 216; // letter = 216mm
  const pageH = pageSettings.format === 'a4' ? 297 : 279;
  const canvasWidth = pageW * 2.5;
  const canvasHeight = pageH * 2.5;

  const visibleBlocks = blocks.filter(function (b) { return !hiddenBlockIds.has(b.id); });

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
          onClick={function (e) { if (e.target === e.currentTarget) onSelectBlock(null); }}
          style={{
            width: canvasWidth * scale,
            minHeight: canvasHeight * scale,
            background: pageSettings.backgroundColor || '#ffffff',
            borderRadius: 4,
            boxShadow: '0 2px 16px rgba(0,0,0,.12)',
            padding:
              (pageSettings.margins.top * 2.5 * scale) + 'px ' +
              (pageSettings.margins.right * 2.5 * scale) + 'px ' +
              (pageSettings.margins.bottom * 2.5 * scale) + 'px ' +
              (pageSettings.margins.left * 2.5 * scale) + 'px',
            position: 'relative',
            border: isOver ? '2px dashed var(--brand)' : '1px solid rgba(0,0,0,.08)',
            transition: 'border-color 0.2s, width 0.2s, min-height 0.2s',
            flexShrink: 0,
            transformOrigin: 'top left',
            transform: 'scale(' + scale + ')',
            // Compensate for transform scaling so container size matches
            marginRight: canvasWidth * (scale - 1) + 'px',
            marginBottom: canvasHeight * (scale - 1) + 'px',
          }}
        >
          {blocks.length === 0 && (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              height: 200, color: '#bbb', fontSize: 13, fontStyle: 'italic',
              border: '2px dashed #e0e0e0', borderRadius: 6,
            }}>
              Sleep blokken hierheen
            </div>
          )}

          {blocks.map(function (block) {
            const isHidden = hiddenBlockIds.has(block.id);
            return (
              <SortableBlock
                key={block.id}
                block={block}
                isSelected={selectedBlockId === block.id}
                isHidden={isHidden}
                onSelect={function () { onSelectBlock(block.id); }}
                documentType={documentType}
              />
            );
          })}
        </div>
      </div>

      <style>{`
        .canvas-block:hover > .block-drag-handle { opacity: 0.6 !important; }
        .canvas-block:hover { background: rgba(59,130,246,.02); }
      `}</style>
    </div>
  );
}
