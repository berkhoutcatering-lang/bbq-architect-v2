'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { DndContext, DragOverlay, closestCenter, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { nanoid } from 'nanoid';
import {
  Save, Eye, Loader2, Undo2, Redo2, Trash2, Copy,
  AlignLeft, AlignCenter, AlignRight, ZoomIn, ZoomOut, Maximize2,
  ChevronLeft, Settings, Database, Pen
} from 'lucide-react';
import EditorCanvas from './EditorCanvas';
import BlockPalette from './BlockPalette';
import BlockPropertiesPanel from './BlockPropertiesPanel';
import LayersPanel from './LayersPanel';
import BlockRenderer from './BlockRenderer';
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

const MAX_HISTORY = 50;
const DOC_LABELS: Record<string, string> = { factuur: 'Factuur', offerte: 'Offerte', menukaart: 'Menukaart', haccp: 'HACCP', bon: 'Bon' };

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
  const [previewing, setPreviewing] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [hiddenBlockIds, setHiddenBlockIds] = useState<Set<string>>(new Set());
  const [topTab, setTopTab] = useState<'designer' | 'preview' | 'data' | 'settings'>('designer');

  // Undo/Redo
  const [history, setHistory] = useState<TemplateBlock[][]>([template?.blocks || []]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const skipHistoryRef = useRef(false);

  const selectedBlock = blocks.find(function (b) { return b.id === selectedBlockId; });
  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

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

  useEffect(function () {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return;
      const isCtrl = e.ctrlKey || e.metaKey;
      if (isCtrl && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      else if (isCtrl && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); redo(); }
      else if (e.key === 'Delete' && selectedBlockId) { e.preventDefault(); handleDeleteBlock(selectedBlockId); }
      else if (isCtrl && e.key === 'd' && selectedBlockId) { e.preventDefault(); handleDuplicateBlock(selectedBlockId); }
    }
    window.addEventListener('keydown', handleKeyDown);
    return function () { window.removeEventListener('keydown', handleKeyDown); };
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

    if (activeIdStr.startsWith('datafield-')) {
      const varKey = activeIdStr.replace('datafield-', '');
      const newBlock: TemplateBlock = { id: nanoid(8), type: 'text', content: '{{' + varKey + '}}', fontSize: 10, fontWeight: 'normal', fontStyle: 'normal', color: '#333333', alignment: 'left', lineHeight: 1.4 } as TemplateBlock;
      const overIndex = blocks.findIndex(function (b) { return b.id === overIdStr; });
      if (overIndex >= 0) { const nb = [...blocks]; nb.splice(overIndex + 1, 0, newBlock); updateBlocks(nb); }
      else { updateBlocks([...blocks, newBlock]); }
      setSelectedBlockId(newBlock.id);
      return;
    }

    if (activeIdStr.startsWith('palette-')) {
      const blockType = activeIdStr.replace('palette-', '');
      const paletteItem = BLOCK_PALETTE.find(function (p) { return p.type === blockType; });
      if (!paletteItem) return;
      const newBlock: TemplateBlock = { ...paletteItem.defaultBlock, id: nanoid(8), type: paletteItem.type } as TemplateBlock;
      const overIndex = blocks.findIndex(function (b) { return b.id === overIdStr; });
      if (overIndex >= 0) { const nb = [...blocks]; nb.splice(overIndex + 1, 0, newBlock); updateBlocks(nb); }
      else { updateBlocks([...blocks, newBlock]); }
      setSelectedBlockId(newBlock.id);
      return;
    }

    if (activeIdStr !== overIdStr) {
      const oldIndex = blocks.findIndex(function (b) { return b.id === activeIdStr; });
      const newIndex = blocks.findIndex(function (b) { return b.id === overIdStr; });
      if (oldIndex === -1 || newIndex === -1) return;
      updateBlocks(arrayMove(blocks, oldIndex, newIndex));
    }
  }, [blocks, history, historyIndex]);

  const handleUpdateBlock = useCallback(function (blockId: string, updates: Partial<TemplateBlock>) {
    const newBlocks = blocks.map(function (b) { return b.id !== blockId ? b : { ...b, ...updates } as TemplateBlock; });
    updateBlocks(newBlocks);
  }, [blocks, history, historyIndex]);

  const handleDeleteBlock = useCallback(function (blockId: string) {
    updateBlocks(blocks.filter(function (b) { return b.id !== blockId; }));
    if (selectedBlockId === blockId) setSelectedBlockId(null);
  }, [blocks, selectedBlockId, history, historyIndex]);

  const handleDuplicateBlock = useCallback(function (blockId: string) {
    const idx = blocks.findIndex(function (b) { return b.id === blockId; });
    if (idx === -1) return;
    const dup = { ...blocks[idx], id: nanoid(8) } as TemplateBlock;
    const nb = [...blocks]; nb.splice(idx + 1, 0, dup);
    updateBlocks(nb);
    setSelectedBlockId(dup.id);
  }, [blocks, history, historyIndex]);

  const handleMoveBlock = useCallback(function (blockId: string, direction: 'up' | 'down') {
    const idx = blocks.findIndex(function (b) { return b.id === blockId; });
    if (idx === -1) return;
    const newIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (newIdx < 0 || newIdx >= blocks.length) return;
    updateBlocks(arrayMove(blocks, idx, newIdx));
  }, [blocks, history, historyIndex]);

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
    await onSave(blocks, pageSettings, name);
    setSaving(false); setSaved(true);
    setTimeout(function () { setSaved(false); }, 2000);
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
      const previewTemplate: PdfTemplate = { id: 'preview', organization_id: organizationId, document_type: documentType, name, description: '', blocks, page_settings: pageSettings, is_default: false, is_active: true, version: 1, created_by: null, created_at: '', updated_at: '' };
      const ctx = buildPreviewContext(documentType);
      const doc = await renderFromTemplate(previewTemplate, ctx, jsPDFLib);
      window.open(doc.output('bloburl'), '_blank');
    } catch (err) { console.error('Preview error:', err); alert('Preview fout: ' + (err as Error).message); }
    setPreviewing(false);
  }

  const dragOverlayBlock = activeId ? blocks.find(function (b) { return b.id === activeId; }) : null;
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

      {/* ═══ Top Bar: Logo + Tabs + Actions ═══ */}
      <div style={{ display: 'flex', alignItems: 'center', background: '#fff', borderBottom: '1px solid #e0e0e0', flexShrink: 0, height: 44 }}>
        {/* Back + template name */}
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

        {/* Top tabs like CraftMyPDF */}
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
              <button key={tab.id} onClick={function () {
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
                <Icon size={14} />
                {tab.label}
              </button>
            );
          })}
        </div>

        <div style={{ flex: 1 }} />

        {/* Save button */}
        <div style={{ padding: '0 12px', display: 'flex', gap: 6 }}>
          <button onClick={handleSave} disabled={saving} style={{
            display: 'flex', alignItems: 'center', gap: 5, padding: '6px 16px', borderRadius: 4,
            border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
            background: saved ? '#e6f4ea' : '#4251f4', color: saved ? '#137333' : '#fff',
          }}>
            {saving ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={13} />}
            {saving ? 'Opslaan...' : saved ? 'Opgeslagen!' : 'Opslaan'}
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
        </div>
      )}

      {/* ═══ Editor Body ═══ */}
      {topTab === 'designer' && (
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          <DndContext collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
            <BlockPalette items={paletteItems} documentType={documentType} />

            <div style={{ flex: 1, overflow: 'auto', padding: 20, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', background: '#e8eaed' }}>
              <SortableContext items={blocks.map(function (b) { return b.id; })} strategy={verticalListSortingStrategy}>
                <EditorCanvas blocks={blocks} pageSettings={pageSettings} selectedBlockId={selectedBlockId} hiddenBlockIds={hiddenBlockIds} onSelectBlock={setSelectedBlockId} documentType={documentType} zoom={zoom} />
              </SortableContext>
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
          <div style={{ width: 280, flexShrink: 0, borderLeft: '1px solid #e0e0e0', background: '#fff', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <LayersPanel blocks={blocks} selectedBlockId={selectedBlockId} hiddenBlockIds={hiddenBlockIds}
              onSelectBlock={setSelectedBlockId} onToggleVisibility={handleToggleVisibility}
              onDuplicate={handleDuplicateBlock} onDelete={handleDeleteBlock} onMoveBlock={handleMoveBlock} />
            <div style={{ flex: 1, overflowY: 'auto' }}>
              <BlockPropertiesPanel block={selectedBlock || null} documentType={documentType}
                onUpdate={function (updates) { if (selectedBlockId) handleUpdateBlock(selectedBlockId, updates); }}
                onDelete={function () { if (selectedBlockId) handleDeleteBlock(selectedBlockId); }}
                onDuplicate={function () { if (selectedBlockId) handleDuplicateBlock(selectedBlockId); }}
                pageSettings={pageSettings} onPageSettingsChange={setPageSettings} />
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
                <select value={pageSettings.format} onChange={function (e) { setPageSettings({ ...pageSettings, format: e.target.value as 'a4' | 'letter' }); }}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #dadce0', fontSize: 13 }}>
                  <option value="a4">A4</option><option value="letter">Letter</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#5f6368', marginBottom: 4 }}>Orientatie</label>
                <select value={pageSettings.orientation} onChange={function (e) { setPageSettings({ ...pageSettings, orientation: e.target.value as 'portrait' | 'landscape' }); }}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #dadce0', fontSize: 13 }}>
                  <option value="portrait">Staand</option><option value="landscape">Liggend</option>
                </select>
              </div>
            </div>
            <div style={{ marginTop: 16 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#5f6368', marginBottom: 4 }}>Achtergrondkleur</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="color" value={pageSettings.backgroundColor} onChange={function (e) { setPageSettings({ ...pageSettings, backgroundColor: e.target.value }); }}
                  style={{ width: 36, height: 36, border: '1px solid #dadce0', borderRadius: 6, cursor: 'pointer', padding: 2 }} />
                <input value={pageSettings.backgroundColor} onChange={function (e) { setPageSettings({ ...pageSettings, backgroundColor: e.target.value }); }}
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
                      onChange={function (e) { setPageSettings({ ...pageSettings, margins: { ...pageSettings.margins, [side]: Number(e.target.value) } }); }}
                      style={{ width: '100%', padding: '6px 8px', borderRadius: 4, border: '1px solid #dadce0', fontSize: 12 }} />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ═══ Data Tab ═══ */}
      {topTab === 'data' && (
        <div style={{ flex: 1, overflow: 'auto', padding: 32, background: '#f8f9fa' }}>
          <div style={{ maxWidth: 700, margin: '0 auto', background: '#fff', borderRadius: 8, border: '1px solid #e0e0e0', padding: 24 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: '#202124', marginBottom: 8 }}>Voorbeeld Data (JSON)</h3>
            <p style={{ fontSize: 12, color: '#5f6368', marginBottom: 16 }}>
              Deze data wordt gebruikt bij de PDF preview. Pas de waarden aan om te testen.
            </p>
            <pre style={{ background: '#f8f9fa', border: '1px solid #e0e0e0', borderRadius: 6, padding: 16, fontSize: 11, lineHeight: 1.6, overflow: 'auto', maxHeight: 500, color: '#202124' }}>
{JSON.stringify(buildPreviewContext(documentType).variables, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
