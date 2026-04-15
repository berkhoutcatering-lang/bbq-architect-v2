'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { DndContext, DragOverlay, closestCenter, type DragEndEvent, type DragStartEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { nanoid } from 'nanoid';
import {
  Save, Eye, Loader2, Undo2, Redo2, Trash2, Copy,
  AlignLeft, AlignCenter, AlignRight, ZoomIn, ZoomOut, Maximize2,
  ChevronLeft, Settings, Database, Pen, Grid3X3, Crosshair
} from 'lucide-react';
import EditorCanvas from './EditorCanvas';
import BlockPalette from './BlockPalette';
import BlockPropertiesPanel from './BlockPropertiesPanel';
import LayersPanel from './LayersPanel';
import BlockRenderer from './BlockRenderer';
import { migrateToAbsoluteLayout, needsMigration } from '@/lib/templateMigration';
import type { TemplateBlock, PageSettings, PdfTemplate } from '@/types/template.types';
import { BLOCK_PALETTE } from '@/lib/templateDefaults';
import { renderFromTemplate } from '@/lib/templateRenderer';
import { buildPreviewContext } from '@/lib/templateContext';

/* eslint-disable @typescript-eslint/no-explicit-any */

interface Props {
  template: PdfTemplate | null;
  documentType: PdfTemplate['document_type'];
  organizationId: string | null;
  onSave: (blocks: TemplateBlock[], pageSettings: PageSettings, name: string) => Promise<void>;
}

// Custom dnd-kit sensor: ignores pointer events inside the canvas
// so react-rnd can handle block dragging without dnd-kit interference
class PaletteSensor extends PointerSensor {
  static activators = [
    {
      eventName: 'onPointerDown' as const,
      handler: function ({ nativeEvent }: { nativeEvent: PointerEvent }) {
        const target = nativeEvent.target as HTMLElement;
        // Don't activate dnd-kit if click is inside the canvas
        if (target.closest('[data-canvas]')) return false;
        return true;
      },
    },
  ];
}

const MAX_HISTORY = 50;
const DOC_LABELS: Record<string, string> = { factuur: 'Factuur', offerte: 'Offerte', menukaart: 'Menukaart', haccp: 'HACCP', bon: 'Bon' };

function initBlocks(template: PdfTemplate | null): TemplateBlock[] {
  const raw = template?.blocks || [];
  if (raw.length === 0) return raw;
  const ps = template?.page_settings || { format: 'a4' as const, orientation: 'portrait' as const, margins: { top: 15, right: 15, bottom: 20, left: 15 }, backgroundColor: '#ffffff' };
  if (needsMigration(raw)) return migrateToAbsoluteLayout(raw, ps);
  return raw;
}

export default function TemplateEditor({ template, documentType, organizationId, onSave }: Props) {
  const initialPageSettings = template?.page_settings || {
    format: 'a4' as const, orientation: 'portrait' as const,
    margins: { top: 15, right: 15, bottom: 20, left: 15 },
    backgroundColor: '#ffffff',
  };

  const [blocks, setBlocks] = useState<TemplateBlock[]>(function () { return initBlocks(template); });
  const [pageSettings, setPageSettings] = useState<PageSettings>(initialPageSettings);
  const [name, setName] = useState(template?.name || 'Nieuw template');
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [hiddenBlockIds, setHiddenBlockIds] = useState<Set<string>>(new Set());
  const [topTab, setTopTab] = useState<'designer' | 'preview' | 'data' | 'settings'>('designer');
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [showGuides, setShowGuides] = useState(true);
  const [isDirty, setIsDirty] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null); // blockId pending delete
  const [previewData, setPreviewData] = useState<Record<string, string>>(function () { return buildPreviewContext(documentType).variables; });

  // Warn before leaving with unsaved changes
  useEffect(function () {
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      if (isDirty) { e.preventDefault(); }
    }
    window.addEventListener('beforeunload', handleBeforeUnload);
    return function () { window.removeEventListener('beforeunload', handleBeforeUnload); };
  }, [isDirty]);

  // Undo/Redo
  const [history, setHistory] = useState<TemplateBlock[][]>(function () { return [initBlocks(template)]; });
  const [historyIndex, setHistoryIndex] = useState(0);
  const skipHistoryRef = useRef(false);

  const selectedBlock = blocks.find(function (b) { return b.id === selectedBlockId; });
  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const paletteItems = BLOCK_PALETTE.filter(function (item) {
    return item.availableIn.includes(documentType);
  });

  function pushHistory(newBlocks: TemplateBlock[]) {
    if (skipHistoryRef.current) { skipHistoryRef.current = false; return; }
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(newBlocks);
    if (newHistory.length > MAX_HISTORY) newHistory.shift();
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  }

  function updateBlocks(newBlocks: TemplateBlock[]) {
    setBlocks(newBlocks);
    pushHistory(newBlocks);
    setSaved(false);
    setIsDirty(true);
  }

  function updatePageSettings(ps: PageSettings) {
    setPageSettings(ps);
    setSaved(false);
    setIsDirty(true);
  }

  function undo() {
    if (!canUndo) return;
    const newIndex = historyIndex - 1;
    skipHistoryRef.current = true;
    setBlocks(history[newIndex]);
    setHistoryIndex(newIndex);
  }

  function redo() {
    if (!canRedo) return;
    const newIndex = historyIndex + 1;
    skipHistoryRef.current = true;
    setBlocks(history[newIndex]);
    setHistoryIndex(newIndex);
  }

  // Keyboard shortcuts
  useEffect(function () {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return;
      const isCtrl = e.ctrlKey || e.metaKey;
      if (isCtrl && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      else if (isCtrl && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); redo(); }
      else if (e.key === 'Delete' && selectedBlockId) { e.preventDefault(); handleDeleteBlock(selectedBlockId); }
      else if (isCtrl && e.key === 'd' && selectedBlockId) { e.preventDefault(); handleDuplicateBlock(selectedBlockId); }
      else if (e.key === 'Escape') { setSelectedBlockId(null); }
      // Arrow key nudging
      else if (selectedBlockId && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
        const nudge = e.shiftKey ? 5 : 1; // mm
        const block = blocks.find(function (b) { return b.id === selectedBlockId; });
        if (!block) return;
        const x = block.x || 0;
        const y = block.y || 0;
        if (e.key === 'ArrowUp') handleBlockPositionChange(selectedBlockId, x, y - nudge);
        else if (e.key === 'ArrowDown') handleBlockPositionChange(selectedBlockId, x, y + nudge);
        else if (e.key === 'ArrowLeft') handleBlockPositionChange(selectedBlockId, x - nudge, y);
        else if (e.key === 'ArrowRight') handleBlockPositionChange(selectedBlockId, x + nudge, y);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return function () { window.removeEventListener('keydown', handleKeyDown); };
  });

  // Palette drop: dnd-kit handles drag from palette onto canvas (not canvas blocks)
  const handleDragStart = useCallback(function (event: DragStartEvent) {
    const id = String(event.active.id);
    // Only track palette and datafield drags — canvas blocks use react-rnd
    if (id.startsWith('palette-') || id.startsWith('datafield-')) {
      setActiveId(id);
    }
  }, []);

  // Get drop position in mm from pointer position on canvas
  function getDropPosition(event: DragEndEvent): { x: number; y: number } | null {
    const canvasEl = document.querySelector('[data-canvas]');
    if (!canvasEl) return null;
    const rect = canvasEl.getBoundingClientRect();
    const scale = zoom / 100;
    const mmToPx = 2.5;
    const startEvent = event.activatorEvent as PointerEvent;
    const pointerX = startEvent.clientX + event.delta.x;
    const pointerY = startEvent.clientY + event.delta.y;
    // Convert screen px to canvas mm
    const mmX = (pointerX - rect.left) / scale / mmToPx;
    const mmY = (pointerY - rect.top) / scale / mmToPx;
    return {
      x: Math.max(0, Math.round(mmX * 10) / 10),
      y: Math.max(0, Math.round(mmY * 10) / 10),
    };
  }

  const handleDragEnd = useCallback(function (event: DragEndEvent) {
    const { active } = event;
    setActiveId(null);
    const activeIdStr = String(active.id);
    const pageW = pageSettings.format === 'a4' ? 210 : 216;
    const contentW = pageW - pageSettings.margins.left - pageSettings.margins.right;
    const drop = getDropPosition(event);
    const dropX = drop ? drop.x : pageSettings.margins.left;
    const dropY = drop ? drop.y : getNextYPosition(blocks, pageSettings);

    // Data field drop
    if (activeIdStr.startsWith('datafield-')) {
      const varKey = activeIdStr.replace('datafield-', '');
      const newBlock: TemplateBlock = {
        id: nanoid(8), type: 'text',
        content: '{{' + varKey + '}}', fontSize: 10, fontWeight: 'normal', fontStyle: 'normal',
        color: '#333333', alignment: 'left', lineHeight: 1.4,
        x: dropX, y: dropY, width: Math.min(contentW, pageW - dropX), height: 8,
        zIndex: blocks.length,
      } as TemplateBlock;
      updateBlocks([...blocks, newBlock]);
      setSelectedBlockId(newBlock.id);
      return;
    }

    // Palette drop — place at exact drop position
    if (activeIdStr.startsWith('palette-')) {
      const blockType = activeIdStr.replace('palette-', '');
      const paletteItem = BLOCK_PALETTE.find(function (p) { return p.type === blockType; });
      if (!paletteItem) return;
      const defaultHeight = getDefaultBlockHeight(blockType, paletteItem);
      const newBlock: TemplateBlock = {
        ...paletteItem.defaultBlock,
        id: nanoid(8), type: paletteItem.type,
        x: dropX, y: dropY, width: Math.min(contentW, pageW - dropX), height: defaultHeight,
        zIndex: blocks.length,
      } as TemplateBlock;
      updateBlocks([...blocks, newBlock]);
      setSelectedBlockId(newBlock.id);
      return;
    }
  }, [blocks, pageSettings, zoom, history, historyIndex]);

  const handleBlockPositionChange = useCallback(function (blockId: string, rawX: number, rawY: number) {
    const block = blocks.find(function (b) { return b.id === blockId; });
    if (!block) return;
    const snapped = snapToAlignments(rawX, rawY, block.width || 0, block.height || 0, blockId, blocks, pageSettings);
    const newBlocks = blocks.map(function (b) { return b.id !== blockId ? b : { ...b, x: snapped.x, y: snapped.y } as TemplateBlock; });
    updateBlocks(newBlocks);
  }, [blocks, pageSettings, history, historyIndex]);

  const handleBlockSizeChange = useCallback(function (blockId: string, width: number, height: number) {
    const newBlocks = blocks.map(function (b) { return b.id !== blockId ? b : { ...b, width, height } as TemplateBlock; });
    updateBlocks(newBlocks);
  }, [blocks, history, historyIndex]);

  const handleUpdateBlock = useCallback(function (blockId: string, updates: Partial<TemplateBlock>) {
    const newBlocks = blocks.map(function (b) { return b.id !== blockId ? b : { ...b, ...updates } as TemplateBlock; });
    // Debounce history for text content changes (avoid 1 undo per keystroke)
    const isTextChange = 'content' in updates;
    if (isTextChange) {
      setBlocks(newBlocks);
      setSaved(false);
      setIsDirty(true);
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = setTimeout(function () { pushHistory(newBlocks); }, 500);
    } else {
      updateBlocks(newBlocks);
    }
  }, [blocks, history, historyIndex]);

  const handleDeleteBlock = useCallback(function (blockId: string) {
    setDeleteConfirm(blockId);
  }, []);

  const confirmDelete = useCallback(function () {
    if (!deleteConfirm) return;
    updateBlocks(blocks.filter(function (b) { return b.id !== deleteConfirm; }));
    if (selectedBlockId === deleteConfirm) setSelectedBlockId(null);
    setDeleteConfirm(null);
  }, [deleteConfirm, blocks, selectedBlockId, history, historyIndex]);

  const handleDuplicateBlock = useCallback(function (blockId: string) {
    const original = blocks.find(function (b) { return b.id === blockId; });
    if (!original) return;
    const dup = {
      ...original, id: nanoid(8),
      x: (original.x || 0) + 5,
      y: (original.y || 0) + 5,
      zIndex: blocks.length,
    } as TemplateBlock;
    updateBlocks([...blocks, dup]);
    setSelectedBlockId(dup.id);
  }, [blocks, history, historyIndex]);

  const handleZIndexChange = useCallback(function (blockId: string, direction: 'up' | 'down') {
    const block = blocks.find(function (b) { return b.id === blockId; });
    if (!block) return;
    const currentZ = block.zIndex || 0;
    const newZ = direction === 'up' ? currentZ + 1 : Math.max(0, currentZ - 1);
    handleUpdateBlock(blockId, { zIndex: newZ } as any);
  }, [blocks, history, historyIndex, handleUpdateBlock]);

  function handleToggleVisibility(blockId: string) {
    setHiddenBlockIds(function (prev) { const next = new Set(prev); if (next.has(blockId)) next.delete(blockId); else next.add(blockId); return next; });
  }

  function setAlignment(align: 'left' | 'center' | 'right') {
    if (!selectedBlockId) return;
    const block = blocks.find(function (b) { return b.id === selectedBlockId; });
    if (block && 'alignment' in block) handleUpdateBlock(selectedBlockId, { alignment: align } as any);
  }

  function zoomIn() { setZoom(function (z) { return Math.min(z + 15, 200); }); }
  function zoomOut() { setZoom(function (z) { return Math.max(z - 15, 40); }); }
  function zoomFit() { setZoom(100); }

  async function handleSave() {
    setSaving(true);
    try {
      await onSave(blocks, pageSettings, name);
      setSaving(false); setSaved(true); setIsDirty(false);
      setTimeout(function () { setSaved(false); }, 2000);
    } catch (err) {
      setSaving(false);
      alert('Opslaan mislukt: ' + (err instanceof Error ? err.message : 'Onbekende fout'));
    }
  }

  async function handlePreview() {
    setPreviewing(true);
    try {
      if (typeof window !== 'undefined' && !(window as any).jspdf) {
        await new Promise<void>(function (resolve) {
          const s1 = document.createElement('script');
          s1.src = 'https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js';
          s1.onload = function () { const s2 = document.createElement('script'); s2.src = 'https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.4/dist/jspdf.plugin.autotable.min.js'; s2.onload = function () { resolve(); }; document.head.appendChild(s2); };
          document.head.appendChild(s1);
        });
      }
      const jsPDFLib = (window as any).jspdf;
      const previewTemplate: PdfTemplate = { id: 'preview', organization_id: organizationId, document_type: documentType, name, description: '', blocks, page_settings: pageSettings, layout_mode: 'absolute', is_default: false, is_active: true, version: 1, created_by: null, created_at: '', updated_at: '' };
      const ctx = buildPreviewContext(documentType);
      ctx.variables = { ...ctx.variables, ...previewData };
      const doc = await renderFromTemplate(previewTemplate, ctx, jsPDFLib);
      window.open(doc.output('bloburl'), '_blank');
    } catch (err) { console.error('Preview error:', err); alert('Preview fout: ' + (err as Error).message); }
    setPreviewing(false);
  }

  // Custom sensor: completely ignore pointer events inside the canvas
  // so react-rnd can handle block dragging without interference
  const sensors = useSensors(
    useSensor(PaletteSensor, {
      activationConstraint: { distance: 5 },
    })
  );

  const dragOverlayBlock = activeId && activeId.startsWith('palette-') ? null : (activeId ? blocks.find(function (b) { return b.id === activeId; }) : null);
  const hasAlignment = selectedBlock && 'alignment' in selectedBlock;
  const currentAlignment = hasAlignment ? (selectedBlock as any).alignment : null;

  // Toolbar icon button
  function TB({ onClick, disabled, title, active, children }: { onClick: () => void; disabled?: boolean; title: string; active?: boolean; children: React.ReactNode }) {
    return (
      <button onClick={onClick} disabled={disabled} title={title} style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 28, height: 28, borderRadius: 4, border: 'none', cursor: disabled ? 'default' : 'pointer',
        background: active ? '#e8f0fe' : 'transparent',
        color: disabled ? '#d0d0d0' : active ? '#4251f4' : '#5f6368',
        transition: 'all 0.1s',
      }}>{children}</button>
    );
  }

  function Sep() { return <div style={{ width: 1, height: 20, background: '#e0e0e0', margin: '0 2px', flexShrink: 0 }} />; }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#f8f9fa', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>

      {/* ═══ Top Bar ═══ */}
      <div style={{ display: 'flex', alignItems: 'center', background: '#fff', borderBottom: '1px solid #e0e0e0', flexShrink: 0, height: 44 }}>
        <a href="/instellingen" style={{ display: 'flex', alignItems: 'center', padding: '0 8px 0 12px', color: '#5f6368', textDecoration: 'none' }}>
          <ChevronLeft size={18} />
        </a>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px', borderRight: '1px solid #e0e0e0', height: '100%' }}>
          <input value={name} onChange={function (e) { setName(e.target.value); }}
            style={{ fontSize: 13, fontWeight: 600, color: '#202124', background: 'none', border: 'none', outline: 'none', width: 160 }} />
          <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 3, background: '#e8f0fe', color: '#4251f4', fontWeight: 700, letterSpacing: '0.03em' }}>
            {DOC_LABELS[documentType] || documentType}
          </span>
        </div>

        <div style={{ display: 'flex', height: '100%' }}>
          {[
            { id: 'designer' as const, label: 'Designer', icon: Pen },
            { id: 'preview' as const, label: 'Preview', icon: Eye },
            { id: 'data' as const, label: 'Data', icon: Database },
            { id: 'settings' as const, label: 'Settings', icon: Settings },
          ].map(function (tab) {
            const isActive = topTab === tab.id;
            const Icon = tab.icon;
            return (
              <button key={tab.id} disabled={tab.id === 'preview' && previewing} onClick={function () {
                if (tab.id === 'preview') { handlePreview(); return; }
                setTopTab(tab.id);
              }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5, padding: '0 16px', fontSize: 12, fontWeight: 500,
                  border: 'none', cursor: 'pointer', background: 'transparent',
                  color: isActive ? '#4251f4' : '#5f6368',
                  borderBottom: isActive ? '2px solid #4251f4' : '2px solid transparent',
                  transition: 'all 0.15s',
                }}>
                {tab.id === 'preview' && previewing ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Icon size={14} />}
                {tab.id === 'preview' && previewing ? 'Laden...' : tab.label}
              </button>
            );
          })}
        </div>

        <div style={{ flex: 1 }} />

        <div style={{ padding: '0 12px', display: 'flex', gap: 6 }}>
          <button onClick={handleSave} disabled={saving} style={{
            display: 'flex', alignItems: 'center', gap: 5, padding: '6px 16px', borderRadius: 4,
            border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
            background: saved ? '#e6f4ea' : '#4251f4', color: saved ? '#137333' : '#fff',
          }}>
            {saving ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={13} />}
            {saving ? 'Opslaan...' : saved ? 'Opgeslagen!' : 'Opslaan'}
            {isDirty && !saved && !saving && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#f59e0b', flexShrink: 0 }} />}
          </button>
        </div>
      </div>

      {/* ═══ Toolbar Row ═══ */}
      {topTab === 'designer' && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 2, padding: '4px 12px', height: 36,
          background: '#fff', borderBottom: '1px solid #e0e0e0', flexShrink: 0,
        }}>
          <TB onClick={undo} disabled={!canUndo} title="Ongedaan maken (Ctrl+Z)"><Undo2 size={15} /></TB>
          <TB onClick={redo} disabled={!canRedo} title="Opnieuw (Ctrl+Y)"><Redo2 size={15} /></TB>
          <Sep />
          <TB onClick={function () { if (selectedBlockId) handleDeleteBlock(selectedBlockId); }} disabled={!selectedBlockId} title="Verwijder (Delete)"><Trash2 size={15} /></TB>
          <TB onClick={function () { if (selectedBlockId) handleDuplicateBlock(selectedBlockId); }} disabled={!selectedBlockId} title="Dupliceer (Ctrl+D)"><Copy size={15} /></TB>
          <Sep />
          <TB onClick={function () { setAlignment('left'); }} disabled={!hasAlignment} active={currentAlignment === 'left'} title="Links uitlijnen"><AlignLeft size={15} /></TB>
          <TB onClick={function () { setAlignment('center'); }} disabled={!hasAlignment} active={currentAlignment === 'center'} title="Centreren"><AlignCenter size={15} /></TB>
          <TB onClick={function () { setAlignment('right'); }} disabled={!hasAlignment} active={currentAlignment === 'right'} title="Rechts uitlijnen"><AlignRight size={15} /></TB>
          <Sep />
          <TB onClick={zoomOut} title="Uitzoomen"><ZoomOut size={15} /></TB>
          <span style={{ fontSize: 11, fontWeight: 500, color: '#5f6368', minWidth: 36, textAlign: 'center', userSelect: 'none' }}>{zoom}%</span>
          <TB onClick={zoomIn} title="Inzoomen"><ZoomIn size={15} /></TB>
          <TB onClick={zoomFit} title="Passend maken"><Maximize2 size={14} /></TB>
          <Sep />
          <TB onClick={function () { setSnapEnabled(!snapEnabled); }} active={snapEnabled} title="Snap naar grid"><Grid3X3 size={15} /></TB>
          <TB onClick={function () { setShowGuides(!showGuides); }} active={showGuides} title="Uitlijnhulplijnen"><Crosshair size={15} /></TB>
        </div>
      )}

      {/* ═══ Editor Body ═══ */}
      {topTab === 'designer' && (
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
            <BlockPalette items={paletteItems} documentType={documentType} />

            <div style={{ flex: 1, overflow: 'auto', padding: 20, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', background: '#e8eaed' }}>
              <EditorCanvas
                blocks={blocks}
                pageSettings={pageSettings}
                selectedBlockId={selectedBlockId}
                hiddenBlockIds={hiddenBlockIds}
                onSelectBlock={setSelectedBlockId}
                onBlockPositionChange={handleBlockPositionChange}
                onBlockSizeChange={handleBlockSizeChange}
                documentType={documentType}
                zoom={zoom}
                snapEnabled={snapEnabled}
                showGuides={showGuides}
              />
            </div>

            <DragOverlay>
              {dragOverlayBlock && (
                <div style={{ opacity: 0.85, background: '#fff', borderRadius: 4, padding: 6, border: '2px solid #4251f4', boxShadow: '0 8px 24px rgba(0,0,0,.15)', maxWidth: 400 }}>
                  <BlockRenderer block={dragOverlayBlock} documentType={documentType} />
                </div>
              )}
            </DragOverlay>
          </DndContext>

          {/* Right: Layers + Properties */}
          <div className="editor-right-panel" style={{ width: 280, minWidth: 220, flexShrink: 0, borderLeft: '1px solid #e0e0e0', background: '#fff', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <LayersPanel blocks={blocks} selectedBlockId={selectedBlockId} hiddenBlockIds={hiddenBlockIds}
              onSelectBlock={setSelectedBlockId} onToggleVisibility={handleToggleVisibility}
              onDuplicate={handleDuplicateBlock} onDelete={handleDeleteBlock}
              onZIndexChange={handleZIndexChange} />
            <div style={{ flex: 1, overflowY: 'auto' }}>
              <BlockPropertiesPanel block={selectedBlock || null} documentType={documentType}
                onUpdate={function (updates) { if (selectedBlockId) handleUpdateBlock(selectedBlockId, updates); }}
                onDelete={function () { if (selectedBlockId) handleDeleteBlock(selectedBlockId); }}
                onDuplicate={function () { if (selectedBlockId) handleDuplicateBlock(selectedBlockId); }}
                pageSettings={pageSettings} onPageSettingsChange={updatePageSettings} />
            </div>
          </div>
        </div>
      )}

      {/* ═══ Settings Tab ═══ */}
      {topTab === 'settings' && (
        <div style={{ flex: 1, overflow: 'auto', padding: 32, background: '#f8f9fa' }}>
          <div style={{ maxWidth: 600, margin: '0 auto', background: '#fff', borderRadius: 8, border: '1px solid #e0e0e0', padding: 24 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: '#202124', marginBottom: 16 }}>Template Instellingen</h3>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#5f6368', marginBottom: 4 }}>Template naam</label>
              <input value={name} onChange={function (e) { setName(e.target.value); }} style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #dadce0', fontSize: 13 }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#5f6368', marginBottom: 4 }}>Papierformaat</label>
                <select value={pageSettings.format} onChange={function (e) { updatePageSettings({ ...pageSettings, format: e.target.value as 'a4' | 'letter' }); }}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #dadce0', fontSize: 13 }}>
                  <option value="a4">A4</option><option value="letter">Letter</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#5f6368', marginBottom: 4 }}>Orientatie</label>
                <select value={pageSettings.orientation} onChange={function (e) { updatePageSettings({ ...pageSettings, orientation: e.target.value as 'portrait' | 'landscape' }); }}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #dadce0', fontSize: 13 }}>
                  <option value="portrait">Staand</option><option value="landscape">Liggend</option>
                </select>
              </div>
            </div>
            <div style={{ marginTop: 16 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#5f6368', marginBottom: 4 }}>Achtergrondkleur</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="color" value={pageSettings.backgroundColor} onChange={function (e) { updatePageSettings({ ...pageSettings, backgroundColor: e.target.value }); }}
                  style={{ width: 36, height: 36, border: '1px solid #dadce0', borderRadius: 6, cursor: 'pointer', padding: 2 }} />
                <input value={pageSettings.backgroundColor} onChange={function (e) { updatePageSettings({ ...pageSettings, backgroundColor: e.target.value }); }}
                  style={{ flex: 1, padding: '8px 12px', borderRadius: 6, border: '1px solid #dadce0', fontSize: 13 }} />
              </div>
            </div>
            <h4 style={{ fontSize: 13, fontWeight: 600, color: '#202124', marginTop: 20, marginBottom: 8 }}>Marges (mm)</h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8 }}>
              {(['top', 'right', 'bottom', 'left'] as const).map(function (side) {
                const labels: Record<string, string> = { top: 'Boven', right: 'Rechts', bottom: 'Onder', left: 'Links' };
                return (
                  <div key={side}>
                    <label style={{ display: 'block', fontSize: 10, color: '#5f6368', marginBottom: 2 }}>{labels[side]}</label>
                    <input type="number" value={pageSettings.margins[side]} min={0} max={50}
                      onChange={function (e) { updatePageSettings({ ...pageSettings, margins: { ...pageSettings.margins, [side]: Number(e.target.value) } }); }}
                      style={{ width: '100%', padding: '6px 8px', borderRadius: 4, border: '1px solid #dadce0', fontSize: 12 }} />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ═══ Data Tab ═══ */}
      {topTab === 'data' && <DataTab documentType={documentType} previewData={previewData} onUpdatePreviewData={setPreviewData} />}

      {/* ═══ Delete Confirmation Dialog ═══ */}
      {deleteConfirm && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 99999,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.3)',
        }} onClick={function () { setDeleteConfirm(null); }}>
          <div onClick={function (e) { e.stopPropagation(); }} style={{
            background: '#fff', borderRadius: 8, padding: '20px 24px', maxWidth: 340,
            boxShadow: '0 8px 32px rgba(0,0,0,.18)',
          }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: '#202124', marginBottom: 12 }}>
              Blok verwijderen?
            </p>
            <p style={{ fontSize: 12, color: '#5f6368', marginBottom: 16 }}>
              Dit kan ongedaan worden gemaakt met Ctrl+Z.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={function () { setDeleteConfirm(null); }} style={{
                padding: '6px 14px', borderRadius: 4, border: '1px solid #dadce0',
                background: '#fff', cursor: 'pointer', fontSize: 12, color: '#5f6368',
              }}>Annuleren</button>
              <button onClick={confirmDelete} style={{
                padding: '6px 14px', borderRadius: 4, border: 'none',
                background: '#dc2626', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600,
              }}>Verwijderen</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Data Tab Component ──
const VAR_GROUPS: Record<string, { label: string; icon: string; keys: string[] }> = {
  bedrijf: { label: 'Bedrijfsgegevens', icon: 'building', keys: ['bedrijfsnaam', 'ondertitel', 'bedrijf_email', 'bedrijf_telefoon', 'bedrijf_adres', 'website', 'kvk', 'btw_nr', 'iban'] },
  klant: { label: 'Klantgegevens', icon: 'user', keys: ['client_naam', 'client_adres'] },
  document: { label: 'Document', icon: 'file', keys: ['nummer', 'datum', 'vervaldatum', 'geldig_tot', 'document_type', 'notitie'] },
  financieel: { label: 'Financieel', icon: 'euro', keys: ['subtotaal', 'btw_bedrag', 'totaal', 'betaalvoorwaarden'] },
  event: { label: 'Event & Gasten', icon: 'calendar', keys: ['event_naam', 'event_datum', 'aantal_gasten', 'haccp_datum', 'winkel', 'bon_totaal'] },
};

const VAR_LABELS: Record<string, string> = {
  bedrijfsnaam: 'Bedrijfsnaam', ondertitel: 'Ondertitel', bedrijf_email: 'E-mail', bedrijf_telefoon: 'Telefoon',
  bedrijf_adres: 'Adres', website: 'Website', kvk: 'KvK-nummer', btw_nr: 'BTW-nummer', iban: 'IBAN',
  client_naam: 'Naam klant', client_adres: 'Adres klant',
  nummer: 'Documentnummer', datum: 'Datum', vervaldatum: 'Vervaldatum', geldig_tot: 'Geldig tot',
  document_type: 'Type', notitie: 'Notitie',
  subtotaal: 'Subtotaal', btw_bedrag: 'BTW', totaal: 'Totaal', betaalvoorwaarden: 'Betaalvoorwaarden',
  event_naam: 'Evenement', event_datum: 'Eventdatum', aantal_gasten: 'Aantal gasten',
  haccp_datum: 'HACCP datum', winkel: 'Winkel', bon_totaal: 'Bon totaal',
};

function DataTab({ documentType, previewData, onUpdatePreviewData }: { documentType: string; previewData: Record<string, string>; onUpdatePreviewData: (data: Record<string, string>) => void }) {
  const ctx = buildPreviewContext(documentType);

  const inputStyle: React.CSSProperties = { width: '100%', padding: '4px 8px', borderRadius: 4, border: '1px solid #dadce0', fontSize: 12, color: '#202124', background: '#fff' };
  const headStyle: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: '#4251f4', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.03em' };
  const codeStyle: React.CSSProperties = { fontSize: 9, color: '#9e781c', background: '#fef9ee', padding: '1px 5px', borderRadius: 3, fontFamily: 'monospace', whiteSpace: 'nowrap' };

  function handleChange(key: string, value: string) {
    onUpdatePreviewData({ ...previewData, [key]: value });
  }

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: 32, background: '#f8f9fa' }}>
      <div style={{ maxWidth: 700, margin: '0 auto' }}>
        <div style={{ background: '#fff', borderRadius: 8, border: '1px solid #e0e0e0', padding: 24, marginBottom: 16 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: '#202124', marginBottom: 4 }}>Voorbeeld Data</h3>
          <p style={{ fontSize: 12, color: '#5f6368', marginBottom: 20 }}>
            Pas deze waarden aan om je template te testen met andere data. Ze worden gebruikt bij <code style={{ background: '#f0f0f0', padding: '1px 4px', borderRadius: 3 }}>{'{{variabele}}'}</code> velden en in de PDF preview.
          </p>

          {Object.entries(VAR_GROUPS).map(function ([key, group]) {
            const visibleKeys = group.keys.filter(function (k) { return previewData[k] !== undefined; });
            if (visibleKeys.length === 0) return null;
            return (
              <div key={key} style={{ marginBottom: 20 }}>
                <div style={headStyle}>{group.label}</div>
                {visibleKeys.map(function (varKey) {
                  const isLong = (previewData[varKey] || '').length > 60;
                  return (
                    <div key={varKey} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
                      <div style={{ width: 130, flexShrink: 0, paddingTop: 5 }}>
                        <div style={{ fontSize: 11, fontWeight: 500, color: '#5f6368' }}>{VAR_LABELS[varKey] || varKey}</div>
                        <code style={codeStyle}>{'{{' + varKey + '}}'}</code>
                      </div>
                      <div style={{ flex: 1 }}>
                        {isLong ? (
                          <textarea value={previewData[varKey] || ''} rows={2}
                            onChange={function (e) { handleChange(varKey, e.target.value); }}
                            style={{ ...inputStyle, resize: 'vertical' }} />
                        ) : (
                          <input value={previewData[varKey] || ''}
                            onChange={function (e) { handleChange(varKey, e.target.value); }}
                            style={inputStyle} />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}

          <button onClick={function () { onUpdatePreviewData(buildPreviewContext(documentType).variables); }}
            style={{ padding: '6px 14px', borderRadius: 4, border: '1px solid #dadce0', background: '#f8f9fa', cursor: 'pointer', fontSize: 11, color: '#5f6368' }}>
            Standaardwaarden herstellen
          </button>
        </div>

        {/* Items table (read-only for now) */}
        {ctx.data.items && ctx.data.items.length > 0 && (
          <div style={{ background: '#fff', borderRadius: 8, border: '1px solid #e0e0e0', padding: 24, marginBottom: 16 }}>
            <div style={headStyle}>Regelitems</div>
            <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e0e0e0', textAlign: 'left' }}>
                  <th style={{ padding: '6px 8px', color: '#5f6368', fontWeight: 600 }}>Omschrijving</th>
                  <th style={{ padding: '6px 8px', color: '#5f6368', fontWeight: 600, textAlign: 'center' }}>Aantal</th>
                  <th style={{ padding: '6px 8px', color: '#5f6368', fontWeight: 600, textAlign: 'right' }}>Prijs</th>
                  <th style={{ padding: '6px 8px', color: '#5f6368', fontWeight: 600, textAlign: 'center' }}>BTW%</th>
                </tr>
              </thead>
              <tbody>
                {ctx.data.items.map(function (item, i) {
                  return (
                    <tr key={i} style={{ borderBottom: '1px solid #f0f0f0' }}>
                      <td style={{ padding: '6px 8px', color: '#202124' }}>{item.omschrijving}</td>
                      <td style={{ padding: '6px 8px', color: '#202124', textAlign: 'center' }}>{item.qty}</td>
                      <td style={{ padding: '6px 8px', color: '#202124', textAlign: 'right' }}>{'\u20ac ' + item.prijs.toFixed(2)}</td>
                      <td style={{ padding: '6px 8px', color: '#202124', textAlign: 'center' }}>{item.btw}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Menu */}
        {ctx.data.menuSelectie && (
          <div style={{ background: '#fff', borderRadius: 8, border: '1px solid #e0e0e0', padding: 24, marginBottom: 16 }}>
            <div style={headStyle}>Menu</div>
            {Object.entries(ctx.data.menuSelectie).map(function ([gang, dishes]) {
              return (
                <div key={gang} style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#202124', marginBottom: 4 }}>{gang}</div>
                  {dishes.map(function (dish, i) {
                    return <div key={i} style={{ fontSize: 12, color: '#5f6368', paddingLeft: 12 }}>{dish}</div>;
                  })}
                </div>
              );
            })}
          </div>
        )}

        {/* HACCP records */}
        {ctx.data.haccpRecords && ctx.data.haccpRecords.length > 0 && (
          <div style={{ background: '#fff', borderRadius: 8, border: '1px solid #e0e0e0', padding: 24, marginBottom: 16 }}>
            <div style={headStyle}>HACCP Metingen</div>
            <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e0e0e0', textAlign: 'left' }}>
                  <th style={{ padding: '6px 8px', color: '#5f6368', fontWeight: 600 }}>Tijd</th>
                  <th style={{ padding: '6px 8px', color: '#5f6368', fontWeight: 600 }}>Product</th>
                  <th style={{ padding: '6px 8px', color: '#5f6368', fontWeight: 600 }}>Type</th>
                  <th style={{ padding: '6px 8px', color: '#5f6368', fontWeight: 600, textAlign: 'right' }}>Temp</th>
                  <th style={{ padding: '6px 8px', color: '#5f6368', fontWeight: 600 }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {ctx.data.haccpRecords.map(function (r, i) {
                  return (
                    <tr key={i} style={{ borderBottom: '1px solid #f0f0f0' }}>
                      <td style={{ padding: '6px 8px', color: '#202124' }}>{r.tijd}</td>
                      <td style={{ padding: '6px 8px', color: '#202124' }}>{r.wat}</td>
                      <td style={{ padding: '6px 8px', color: '#202124' }}>{r.type}</td>
                      <td style={{ padding: '6px 8px', color: '#202124', textAlign: 'right' }}>{r.temp}°C</td>
                      <td style={{ padding: '6px 8px' }}>
                        <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 3, fontWeight: 600, background: r.status === 'ok' ? '#dcfce7' : '#fef3cd', color: r.status === 'ok' ? '#166534' : '#856404' }}>
                          {r.status.toUpperCase()}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// Helper: Snap block position to align with other blocks' edges/centers (like Word/PowerPoint)
function snapToAlignments(
  rawX: number, rawY: number, w: number, h: number,
  blockId: string, allBlocks: TemplateBlock[], ps: PageSettings,
): { x: number; y: number } {
  const THRESHOLD = 3; // mm — snap distance

  const left = rawX;
  const right = rawX + w;
  const centerX = rawX + w / 2;
  const top = rawY;
  const bottom = rawY + h;
  const centerY = rawY + h / 2;

  const pageW = ps.format === 'a4' ? 210 : 216;
  const pageH = ps.format === 'a4' ? 297 : 279;

  // Collect vertical snap targets (X values)
  const vTargets: number[] = [ps.margins.left, pageW - ps.margins.right, pageW / 2];
  // Collect horizontal snap targets (Y values)
  const hTargets: number[] = [ps.margins.top, pageH - ps.margins.bottom, pageH / 2];

  for (const b of allBlocks) {
    if (b.id === blockId || b.x === undefined || b.y === undefined) continue;
    const bL = b.x || 0;
    const bT = b.y || 0;
    const bW = b.width || 0;
    const bH = b.height || 0;
    vTargets.push(bL, bL + bW, bL + bW / 2);
    hTargets.push(bT, bT + bH, bT + bH / 2);
  }

  // Find best vertical snap (adjusts X)
  let snapX = rawX;
  let bestDx = THRESHOLD + 1;
  for (const vt of vTargets) {
    // Left edge aligns
    const dL = Math.abs(left - vt);
    if (dL < bestDx) { bestDx = dL; snapX = vt; }
    // Right edge aligns
    const dR = Math.abs(right - vt);
    if (dR < bestDx) { bestDx = dR; snapX = vt - w; }
    // Center aligns
    const dC = Math.abs(centerX - vt);
    if (dC < bestDx) { bestDx = dC; snapX = vt - w / 2; }
  }

  // Find best horizontal snap (adjusts Y)
  let snapY = rawY;
  let bestDy = THRESHOLD + 1;
  for (const ht of hTargets) {
    const dT = Math.abs(top - ht);
    if (dT < bestDy) { bestDy = dT; snapY = ht; }
    const dB = Math.abs(bottom - ht);
    if (dB < bestDy) { bestDy = dB; snapY = ht - h; }
    const dC = Math.abs(centerY - ht);
    if (dC < bestDy) { bestDy = dC; snapY = ht - h / 2; }
  }

  return {
    x: Math.round(snapX * 100) / 100,
    y: Math.round(snapY * 100) / 100,
  };
}

// Helper: Type-appropriate default heights (mm) matching what the PDF renderer produces
function getDefaultBlockHeight(type: string, _item: any): number {
  switch (type) {
    case 'logo': return 25;
    case 'text': return 8;
    case 'client_info': return 30;
    case 'document_badge': return 14;
    case 'items_table': return 35;
    case 'menu': return 50;
    case 'totals': return 18;
    case 'payment_details': return 25;
    case 'divider': return 3;
    case 'spacer': return 10;
    case 'image': return 30;
    case 'footer': return 10;
    case 'haccp_table': return 35;
    default: return 20;
  }
}

// Helper: Find the Y position for the next dropped block (below all existing blocks)
function getNextYPosition(blocks: TemplateBlock[], pageSettings: PageSettings): number {
  if (blocks.length === 0) return pageSettings.margins.top;
  let maxBottom = pageSettings.margins.top;
  for (const b of blocks) {
    const bottom = (b.y || 0) + (b.height || 20);
    if (bottom > maxBottom) maxBottom = bottom;
  }
  return maxBottom + 2; // 2mm gap
}
