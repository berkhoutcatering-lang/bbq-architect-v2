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
  onSelectBlock: (id: string | null) => void;
  documentType: PdfTemplate['document_type'];
}

function SortableBlock({ block, isSelected, onSelect, documentType }: {
  block: TemplateBlock;
  isSelected: boolean;
  onSelect: () => void;
  documentType: PdfTemplate['document_type'];
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    position: 'relative' as const,
    borderRadius: 6,
    border: isSelected ? '2px solid #3b82f6' : '2px solid transparent',
    cursor: 'pointer',
    marginBottom: 2,
  };

  return (
    <div ref={setNodeRef} style={style} onClick={onSelect}>
      {/* Drag handle */}
      <div
        {...attributes}
        {...listeners}
        style={{
          position: 'absolute', left: -24, top: '50%', transform: 'translateY(-50%)',
          cursor: 'grab', color: 'var(--muted)', opacity: isSelected ? 1 : 0,
          transition: 'opacity 0.15s',
        }}
        className="block-drag-handle"
      >
        <GripVertical size={14} />
      </div>
      <BlockRenderer block={block} documentType={documentType} />
    </div>
  );
}

export default function EditorCanvas({ blocks, pageSettings, selectedBlockId, onSelectBlock, documentType }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: 'canvas-drop' });

  // A4 ratio: 210mm x 297mm — scale to fit viewport
  const canvasWidth = 520;
  const canvasHeight = canvasWidth * (297 / 210);

  return (
    <div
      ref={setNodeRef}
      onClick={function (e) { if (e.target === e.currentTarget) onSelectBlock(null); }}
      style={{
        width: canvasWidth,
        minHeight: canvasHeight,
        background: pageSettings.backgroundColor || '#ffffff',
        borderRadius: 8,
        boxShadow: '0 4px 24px rgba(0,0,0,.15)',
        padding: pageSettings.margins.top * 2.5 + 'px ' + pageSettings.margins.right * 2.5 + 'px ' + pageSettings.margins.bottom * 2.5 + 'px ' + pageSettings.margins.left * 2.5 + 'px',
        position: 'relative',
        border: isOver ? '2px dashed var(--brand)' : '2px solid transparent',
        transition: 'border-color 0.2s',
        flexShrink: 0,
      }}
    >
      {blocks.length === 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          height: 200, color: '#999', fontSize: 14, fontStyle: 'italic',
          border: '2px dashed #ddd', borderRadius: 8,
        }}>
          Sleep blokken hierheen
        </div>
      )}

      {blocks.map(function (block) {
        return (
          <SortableBlock
            key={block.id}
            block={block}
            isSelected={selectedBlockId === block.id}
            onSelect={function () { onSelectBlock(block.id); }}
            documentType={documentType}
          />
        );
      })}

      <style>{`
        .block-drag-handle { opacity: 0 !important; }
        div:hover > .block-drag-handle { opacity: 0.5 !important; }
      `}</style>
    </div>
  );
}
