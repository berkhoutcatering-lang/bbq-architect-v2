'use client';

import { useState, useCallback } from 'react';
import { DndContext, DragOverlay, closestCenter, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { nanoid } from 'nanoid';
import { Save, Eye, RotateCcw, Loader2 } from 'lucide-react';
import EditorCanvas from './EditorCanvas';
import BlockPalette from './BlockPalette';
import BlockPropertiesPanel from './BlockPropertiesPanel';
import BlockRenderer from './BlockRenderer';
import type { TemplateBlock, PageSettings, PdfTemplate } from '@/types/template.types';
import { BLOCK_PALETTE } from '@/lib/templateDefaults';

interface Props {
  template: PdfTemplate | null;
  documentType: PdfTemplate['document_type'];
  organizationId: string | null;
  onSave: (blocks: TemplateBlock[], pageSettings: PageSettings, name: string) => Promise<void>;
}

export default function TemplateEditor({ template, documentType, organizationId, onSave }: Props) {
  const [blocks, setBlocks] = useState<TemplateBlock[]>(template?.blocks || []);
  const [pageSettings, setPageSettings] = useState<PageSettings>(template?.page_settings || {
    format: 'a4', orientation: 'portrait',
    margins: { top: 15, right: 15, bottom: 20, left: 15 },
    backgroundColor: '#ffffff',
  });
  const [name, setName] = useState(template?.name || 'Nieuw template');
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const selectedBlock = blocks.find(function (b) { return b.id === selectedBlockId; });

  // Filter palette items by document type
  const paletteItems = BLOCK_PALETTE.filter(function (item) {
    return item.availableIn.includes(documentType);
  });

  const handleDragStart = useCallback(function (event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }, []);

  const handleDragEnd = useCallback(function (event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const activeIdStr = String(active.id);
    const overIdStr = String(over.id);

    // Dropping from palette (new block)
    if (activeIdStr.startsWith('palette-')) {
      const blockType = activeIdStr.replace('palette-', '');
      const paletteItem = BLOCK_PALETTE.find(function (p) { return p.type === blockType; });
      if (!paletteItem) return;

      const newBlock: TemplateBlock = {
        ...paletteItem.defaultBlock,
        id: nanoid(8),
        type: paletteItem.type,
      } as TemplateBlock;

      // Insert at the position of the over element, or at end
      const overIndex = blocks.findIndex(function (b) { return b.id === overIdStr; });
      if (overIndex >= 0) {
        const newBlocks = [...blocks];
        newBlocks.splice(overIndex + 1, 0, newBlock);
        setBlocks(newBlocks);
      } else {
        setBlocks(function (prev) { return [...prev, newBlock]; });
      }
      setSelectedBlockId(newBlock.id);
      return;
    }

    // Reordering existing blocks
    if (activeIdStr !== overIdStr) {
      setBlocks(function (prev) {
        const oldIndex = prev.findIndex(function (b) { return b.id === activeIdStr; });
        const newIndex = prev.findIndex(function (b) { return b.id === overIdStr; });
        if (oldIndex === -1 || newIndex === -1) return prev;
        return arrayMove(prev, oldIndex, newIndex);
      });
    }
  }, [blocks]);

  const handleUpdateBlock = useCallback(function (blockId: string, updates: Partial<TemplateBlock>) {
    setBlocks(function (prev) {
      return prev.map(function (b) {
        if (b.id !== blockId) return b;
        return { ...b, ...updates } as TemplateBlock;
      });
    });
    setSaved(false);
  }, []);

  const handleDeleteBlock = useCallback(function (blockId: string) {
    setBlocks(function (prev) { return prev.filter(function (b) { return b.id !== blockId; }); });
    if (selectedBlockId === blockId) setSelectedBlockId(null);
    setSaved(false);
  }, [selectedBlockId]);

  const handleDuplicateBlock = useCallback(function (blockId: string) {
    setBlocks(function (prev) {
      const idx = prev.findIndex(function (b) { return b.id === blockId; });
      if (idx === -1) return prev;
      const dup = { ...prev[idx], id: nanoid(8) } as TemplateBlock;
      const newBlocks = [...prev];
      newBlocks.splice(idx + 1, 0, dup);
      return newBlocks;
    });
    setSaved(false);
  }, []);

  async function handleSave() {
    setSaving(true);
    await onSave(blocks, pageSettings, name);
    setSaving(false);
    setSaved(true);
    setTimeout(function () { setSaved(false); }, 2000);
  }

  const dragOverlayBlock = activeId ? blocks.find(function (b) { return b.id === activeId; }) : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg)' }}>
      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px',
        borderBottom: '1px solid var(--border)', background: 'var(--card)', flexShrink: 0,
      }}>
        <a href="/instellingen" style={{ fontSize: 13, color: 'var(--muted)', textDecoration: 'none' }}>&larr; Terug</a>
        <div style={{ width: 1, height: 20, background: 'var(--border)' }} />
        <input
          value={name}
          onChange={function (e) { setName(e.target.value); }}
          style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', background: 'none', border: 'none', outline: 'none', flex: 1 }}
        />
        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: 'rgba(59,130,246,.1)', color: '#3b82f6', fontWeight: 600 }}>
          {documentType.toUpperCase()}
        </span>
        <button onClick={handleSave} disabled={saving}
          style={{
            display: 'flex', alignItems: 'center', gap: 4, padding: '6px 16px',
            borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
            background: saved ? 'rgba(34,197,94,.1)' : 'linear-gradient(135deg, #c4a35a, #8b6914)',
            color: saved ? '#22c55e' : '#fff',
          }}>
          {saving ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : saved ? <RotateCcw size={14} /> : <Save size={14} />}
          {saving ? 'Opslaan...' : saved ? 'Opgeslagen' : 'Opslaan'}
        </button>
      </div>

      {/* Editor Body */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <DndContext collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          {/* Left: Block Palette */}
          <BlockPalette items={paletteItems} />

          {/* Center: Canvas */}
          <div style={{ flex: 1, overflow: 'auto', padding: 24, display: 'flex', justifyContent: 'center' }}>
            <SortableContext items={blocks.map(function (b) { return b.id; })} strategy={verticalListSortingStrategy}>
              <EditorCanvas
                blocks={blocks}
                pageSettings={pageSettings}
                selectedBlockId={selectedBlockId}
                onSelectBlock={setSelectedBlockId}
                documentType={documentType}
              />
            </SortableContext>
          </div>

          {/* Drag overlay */}
          <DragOverlay>
            {dragOverlayBlock && (
              <div style={{ opacity: 0.8, background: 'var(--card)', borderRadius: 8, padding: 8, border: '2px solid var(--brand)', boxShadow: '0 8px 24px rgba(0,0,0,.2)' }}>
                <BlockRenderer block={dragOverlayBlock} documentType={documentType} />
              </div>
            )}
          </DragOverlay>
        </DndContext>

        {/* Right: Properties Panel */}
        <BlockPropertiesPanel
          block={selectedBlock || null}
          documentType={documentType}
          onUpdate={function (updates) { if (selectedBlockId) handleUpdateBlock(selectedBlockId, updates); }}
          onDelete={function () { if (selectedBlockId) handleDeleteBlock(selectedBlockId); }}
          onDuplicate={function () { if (selectedBlockId) handleDuplicateBlock(selectedBlockId); }}
          pageSettings={pageSettings}
          onPageSettingsChange={setPageSettings}
        />
      </div>
    </div>
  );
}
