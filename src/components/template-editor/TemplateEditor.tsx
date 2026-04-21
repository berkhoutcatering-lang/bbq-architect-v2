'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { DndContext, DragOverlay, closestCenter, type DragEndEvent, type DragStartEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { nanoid } from 'nanoid';
import {
  Save, Eye, Loader2, Undo2, Redo2, Trash2, Copy,
  AlignLeft, AlignCenter, AlignRight, ZoomIn, ZoomOut, Maximize2,
  ChevronLeft, Settings, Database, Pen, Grid3X3, Crosshair,
  LayoutTemplate, X
} from 'lucide-react';
import EditorCanvas from './EditorCanvas';
import BlockPalette from './BlockPalette';
import BlockPropertiesPanel from './BlockPropertiesPanel';
import LayersPanel from './LayersPanel';
import BlockRenderer from './BlockRenderer';
import { migrateToAbsoluteLayout, needsMigration } from '@/lib/templateMigration';
import type { TemplateBlock, PageSettings, PdfTemplate } from '@/types/template.types';
import { BLOCK_PALETTE, STARTER_TEMPLATES, type StarterTemplate } from '@/lib/templateDefaults';
import { renderFromTemplate } from '@/lib/templateRenderer';
import { buildPreviewContext } from '@/lib/templateContext';
import { useToast } from '@/components/Toast';
import { useSettings } from '@/lib/useSupabase';

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
        if (target.closest('[data-canvas]')) return false;
        return true;
      },
    },
  ];
}

const MAX_HISTORY = 50;
const DOC_LABELS: Record<string, string> = { factuur: 'Factuur', offerte: 'Offerte', menukaart: 'Menukaart', haccp: 'HACCP', bon: 'Bon' };
const HEX_RE = /^#([0-9a-fA-F]{6})$/;

const RIGHT_PANEL_KEY = 'templateEditor.rightPanelWidth';
const DRAFT_KEY_PREFIX = 'templateEditor.draft.';
const DRAFT_VERSION = 1;
type DraftPayload = { v: number; ts: number; blocks: TemplateBlock[]; pageSettings: PageSettings; name: string };

function draftKeyFor(template: PdfTemplate | null, documentType: string): string {
  // Per-template key; for new (no id) templates, namespace by document type
  return DRAFT_KEY_PREFIX + (template?.id || ('new.' + documentType));
}
const RIGHT_PANEL_MIN = 220;
const RIGHT_PANEL_MAX = 420;
const RIGHT_PANEL_DEFAULT = 280;

// ── Module-scoped styles (P2.3) ────────────────────────────────────────────
const rootStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', height: '100dvh',
  background: 'var(--bg)',
};

const topBarStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', background: 'var(--surface)',
  borderBottom: '1px solid var(--border)', flexShrink: 0, height: 44,
};

const toolbarRowStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 2, padding: '4px 12px', height: 36,
  background: 'var(--surface)', borderBottom: '1px solid var(--border)', flexShrink: 0,
};

const tabBtnBase: React.CSSProperties = {
  position: 'relative',
  display: 'flex', alignItems: 'center', gap: 5, padding: '0 16px',
  fontSize: 12, fontWeight: 500, border: 'none', cursor: 'pointer',
  background: 'transparent', height: '100%',
};

const saveBtnBase: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 5, padding: '6px 16px', borderRadius: 4,
  border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
};

const previewBtnStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 4,
  border: '1px solid var(--border-strong)', cursor: 'pointer', fontSize: 12, fontWeight: 500,
  background: 'transparent', color: 'var(--text)',
};

const dialogScrim: React.CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 99999,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'rgba(0,0,0,0.5)',
};

const dialogStyle: React.CSSProperties = {
  background: 'var(--surface)', borderRadius: 8, padding: '20px 24px', maxWidth: 360,
  boxShadow: '0 8px 32px rgba(0,0,0,.45)',
  border: '1px solid var(--border-strong)',
};

const dialogCancelBtn: React.CSSProperties = {
  padding: '6px 14px', borderRadius: 4, border: '1px solid var(--border-strong)',
  background: 'transparent', cursor: 'pointer', fontSize: 12, color: 'var(--text)',
};

const dialogConfirmBtn: React.CSSProperties = {
  padding: '6px 14px', borderRadius: 4, border: 'none',
  background: 'var(--danger)', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600,
};

const numberStyle: React.CSSProperties = {
  fontVariantNumeric: 'tabular-nums',
};

const settingsCardStyle: React.CSSProperties = {
  maxWidth: 600, margin: '0 auto', background: 'var(--surface)',
  borderRadius: 8, border: '1px solid var(--border)', padding: 24,
};

const settingsLabelStyle: React.CSSProperties = {
  display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--muted)', marginBottom: 4,
};

const settingsInputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 12px', borderRadius: 6,
  border: '1px solid var(--border-strong)', background: 'var(--bg)', color: 'var(--text)',
  fontSize: 13,
};

function initBlocks(template: PdfTemplate | null): TemplateBlock[] {
  const raw = template?.blocks || [];
  if (raw.length === 0) return raw;
  const ps = template?.page_settings || { format: 'a4' as const, orientation: 'portrait' as const, margins: { top: 15, right: 15, bottom: 20, left: 15 }, backgroundColor: '#ffffff' };
  if (needsMigration(raw)) return migrateToAbsoluteLayout(raw, ps);
  return raw;
}

export default function TemplateEditor({ template, documentType, organizationId, onSave }: Props) {
  const showToast = useToast();
  // Pull the organisation's huisstijl colours so the Settings tab shows the *real* defaults
  // (not the hardcoded #9e781c/#8b6914) — these are what the renderer uses when no per-template override is set.
  const { settings: orgSettings } = useSettings();
  const orgPrimary = (orgSettings as any)?.brand_primary || '#9e781c';
  const orgAccent = (orgSettings as any)?.brand_accent || '#8b6914';
  const initialPageSettings = template?.page_settings || {
    format: 'a4' as const, orientation: 'portrait' as const,
    margins: { top: 15, right: 15, bottom: 20, left: 15 },
    backgroundColor: '#ffffff',
  };

  // Try to restore an unsaved draft from localStorage. The draft wins when it is
  // newer than the server-side updated_at — that way "go to preview, click away,
  // come back" hands the user back exactly what they left.
  const draftRestoreRef = useRef<{ restored: boolean }>({ restored: false });
  function readInitial(): { blocks: TemplateBlock[]; pageSettings: PageSettings; name: string } {
    const fallback = {
      blocks: initBlocks(template),
      pageSettings: initialPageSettings,
      name: template?.name || 'Nieuw template',
    };
    if (typeof window === 'undefined') return fallback;
    try {
      const raw = localStorage.getItem(draftKeyFor(template, documentType));
      if (!raw) return fallback;
      const draft = JSON.parse(raw) as DraftPayload;
      if (!draft || draft.v !== DRAFT_VERSION) return fallback;
      const serverTs = template?.updated_at ? new Date(template.updated_at).getTime() : 0;
      // Use draft only if it was saved AFTER the server version we just loaded
      if (draft.ts > serverTs) {
        draftRestoreRef.current.restored = true;
        return { blocks: draft.blocks, pageSettings: draft.pageSettings, name: draft.name };
      }
    } catch { /* corrupt draft — ignore */ }
    return fallback;
  }
  const initialState = readInitial();

  const [blocks, setBlocks] = useState<TemplateBlock[]>(initialState.blocks);
  const [pageSettings, setPageSettings] = useState<PageSettings>(initialState.pageSettings);
  const [name, setName] = useState(initialState.name);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [hiddenBlockIds, setHiddenBlockIds] = useState<Set<string>>(new Set());
  const [topTab, setTopTab] = useState<'designer' | 'data' | 'settings'>('designer');
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [showGuides, setShowGuides] = useState(true);
  const [isDirty, setIsDirty] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [starterPicker, setStarterPicker] = useState(false);
  const [pendingStarter, setPendingStarter] = useState<StarterTemplate | null>(null);
  const [previewData, setPreviewData] = useState<Record<string, string>>(function () { return buildPreviewContext(documentType).variables; });

  // Right panel width persistence (P3.6)
  const [rightPanelWidth, setRightPanelWidth] = useState<number>(RIGHT_PANEL_DEFAULT);
  useEffect(function () {
    try {
      const stored = localStorage.getItem(RIGHT_PANEL_KEY);
      if (stored) {
        const n = Number(stored);
        if (!Number.isNaN(n) && n >= RIGHT_PANEL_MIN && n <= RIGHT_PANEL_MAX) {
          setRightPanelWidth(n);
        }
      }
    } catch { /* localStorage unavailable */ }
  }, []);

  // Warn before leaving with unsaved changes (P0.4)
  useEffect(function () {
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      if (isDirty) { e.preventDefault(); e.returnValue = ''; }
    }
    window.addEventListener('beforeunload', handleBeforeUnload);
    return function () { window.removeEventListener('beforeunload', handleBeforeUnload); };
  }, [isDirty]);

  // Undo/Redo state — entries are { blocks, pageSettings, name }
  type Snapshot = { blocks: TemplateBlock[]; pageSettings: PageSettings; name: string };
  const [history, setHistory] = useState<Snapshot[]>(function () {
    return [{ blocks: initialState.blocks, pageSettings: initialState.pageSettings, name: initialState.name }];
  });
  const [historyIndex, setHistoryIndex] = useState(0);
  const skipHistoryRef = useRef(false);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragHistoryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nameDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const canvasScrollRef = useRef<HTMLDivElement | null>(null);

  // Wheel handling — must use a non-passive native listener so preventDefault works.
  // React's synthetic onWheel is registered passive by Chrome, which means ctrl+wheel
  // would still trigger browser page-zoom even when we call e.preventDefault().
  useEffect(function () {
    const el = canvasScrollRef.current;
    if (!el) return;
    function onWheel(e: WheelEvent) {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        setZoom(function (z) {
          const step = 10;
          const next = e.deltaY < 0 ? z + step : z - step;
          return Math.max(40, Math.min(200, next));
        });
        return;
      }
      if (e.altKey && e.deltaY !== 0) {
        e.preventDefault();
        if (canvasScrollRef.current) canvasScrollRef.current.scrollLeft += e.deltaY;
        return;
      }
      // No modifier → let the browser scroll vertically as normal
    }
    el.addEventListener('wheel', onWheel, { passive: false });
    return function () { el.removeEventListener('wheel', onWheel); };
  }, []);

  // Notify the user when a draft was restored from a previous unsaved session
  const draftToastShownRef = useRef(false);
  useEffect(function () {
    if (draftRestoreRef.current.restored && !draftToastShownRef.current) {
      draftToastShownRef.current = true;
      setIsDirty(true);
      showToast({
        type: 'info',
        title: 'Concept hersteld',
        message: 'Je niet-opgeslagen wijzigingen zijn teruggezet.',
        action: { label: 'Verwerp concept', onClick: function () {
          try { localStorage.removeItem(draftKeyFor(template, documentType)); } catch { /* noop */ }
          window.location.reload();
        }},
      });
    }
  }, [showToast, template, documentType]);

  // Keep current state available to key handler ref without re-binding
  const stateRef = useRef({ blocks, pageSettings, name, selectedBlockId, history, historyIndex });
  useEffect(function () {
    stateRef.current = { blocks, pageSettings, name, selectedBlockId, history, historyIndex };
  });

  // Autosave draft to localStorage whenever the editable state changes (debounced).
  // The draft is restored on the next mount if it's newer than the server template.
  useEffect(function () {
    if (!isDirty) return; // nothing to save until the user has changed something
    if (draftSaveTimerRef.current) clearTimeout(draftSaveTimerRef.current);
    draftSaveTimerRef.current = setTimeout(function () {
      try {
        const payload: DraftPayload = { v: DRAFT_VERSION, ts: Date.now(), blocks, pageSettings, name };
        localStorage.setItem(draftKeyFor(template, documentType), JSON.stringify(payload));
      } catch { /* quota / unavailable — ignore */ }
    }, 400);
    return function () {
      if (draftSaveTimerRef.current) { clearTimeout(draftSaveTimerRef.current); draftSaveTimerRef.current = null; }
    };
  }, [blocks, pageSettings, name, isDirty, template, documentType]);

  const selectedBlock = blocks.find(function (b) { return b.id === selectedBlockId; });
  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  const paletteItems = BLOCK_PALETTE.filter(function (item) {
    return item.availableIn.includes(documentType);
  });

  function pushHistorySnapshot(snap: Snapshot) {
    if (skipHistoryRef.current) { skipHistoryRef.current = false; return; }
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(snap);
    if (newHistory.length > MAX_HISTORY) newHistory.shift();
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  }

  function commitChange(next: Partial<Snapshot>, opts?: { debounceMs?: number; ref?: React.MutableRefObject<ReturnType<typeof setTimeout> | null> }) {
    const newBlocks = next.blocks ?? stateRef.current.blocks;
    const newPs = next.pageSettings ?? stateRef.current.pageSettings;
    const newName = next.name ?? stateRef.current.name;
    if (next.blocks) setBlocks(newBlocks);
    if (next.pageSettings) setPageSettings(newPs);
    if (next.name !== undefined) setName(newName);
    setSaved(false);
    setIsDirty(true);

    const snap: Snapshot = { blocks: newBlocks, pageSettings: newPs, name: newName };
    if (opts?.debounceMs && opts.ref) {
      if (opts.ref.current) clearTimeout(opts.ref.current);
      opts.ref.current = setTimeout(function () { pushHistorySnapshot(snap); }, opts.debounceMs);
    } else {
      pushHistorySnapshot(snap);
    }
  }

  function updateBlocks(newBlocks: TemplateBlock[]) {
    commitChange({ blocks: newBlocks });
  }

  function updatePageSettings(ps: PageSettings) {
    commitChange({ pageSettings: ps });
  }

  function updateName(newName: string) {
    setName(newName);
    setSaved(false);
    setIsDirty(true);
    if (nameDebounceRef.current) clearTimeout(nameDebounceRef.current);
    nameDebounceRef.current = setTimeout(function () {
      pushHistorySnapshot({
        blocks: stateRef.current.blocks,
        pageSettings: stateRef.current.pageSettings,
        name: newName,
      });
    }, 300);
  }

  function applySnapshot(snap: Snapshot) {
    skipHistoryRef.current = true;
    setBlocks(snap.blocks);
    setPageSettings(snap.pageSettings);
    setName(snap.name);
    setIsDirty(true);
    setSaved(false);
  }

  function undo() {
    if (!canUndo) return;
    const newIndex = historyIndex - 1;
    applySnapshot(history[newIndex]);
    setHistoryIndex(newIndex);
  }

  function redo() {
    if (!canRedo) return;
    const newIndex = historyIndex + 1;
    applySnapshot(history[newIndex]);
    setHistoryIndex(newIndex);
  }

  // Keyboard shortcuts (P0.1) — single bind, refs for current state
  const undoRef = useRef(undo);
  const redoRef = useRef(redo);
  const handleDeleteRef = useRef<(id: string) => void>(function () {});
  const handleDuplicateRef = useRef<(id: string) => void>(function () {});
  const handlePosRef = useRef<(id: string, x: number, y: number) => void>(function () {});
  const deleteConfirmRef = useRef(deleteConfirm);
  useEffect(function () { deleteConfirmRef.current = deleteConfirm; }, [deleteConfirm]);

  useEffect(function () {
    function handleKeyDown(e: KeyboardEvent) {
      // Suppress when modal dialog is open (P1.3)
      if (deleteConfirmRef.current) return;
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;

      const isCtrl = e.ctrlKey || e.metaKey;
      const { selectedBlockId: sel, blocks: blks } = stateRef.current;

      if (isCtrl && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undoRef.current(); }
      else if (isCtrl && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); redoRef.current(); }
      else if (e.key === 'Delete' && sel) { e.preventDefault(); handleDeleteRef.current(sel); }
      else if (isCtrl && e.key === 'd' && sel) { e.preventDefault(); handleDuplicateRef.current(sel); }
      else if (e.key === 'Escape') { setSelectedBlockId(null); }
      else if (sel && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
        const nudge = e.shiftKey ? 5 : 1;
        const block = blks.find(function (b) { return b.id === sel; });
        if (!block) return;
        const x = block.x || 0;
        const y = block.y || 0;
        if (e.key === 'ArrowUp') handlePosRef.current(sel, x, y - nudge);
        else if (e.key === 'ArrowDown') handlePosRef.current(sel, x, y + nudge);
        else if (e.key === 'ArrowLeft') handlePosRef.current(sel, x - nudge, y);
        else if (e.key === 'ArrowRight') handlePosRef.current(sel, x + nudge, y);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return function () { window.removeEventListener('keydown', handleKeyDown); };
  }, []);

  // Palette drop: dnd-kit handles drag from palette onto canvas (not canvas blocks)
  const handleDragStart = useCallback(function (event: DragStartEvent) {
    const id = String(event.active.id);
    if (id.startsWith('palette-') || id.startsWith('datafield-')) {
      setActiveId(id);
    }
  }, []);

  // Use the DragOverlay's actual on-screen rectangle (translated source rect) as the
  // drop position. The cursor sits inside the overlay but not necessarily at its
  // top-left, so reading active.rect.current.translated.{top,left} gives the same
  // top-left the user visually saw under their cursor.
  function getDropPosition(event: DragEndEvent): { x: number; y: number } | null {
    const canvasEl = document.querySelector('[data-canvas]');
    if (!canvasEl) return null;
    const canvasRect = canvasEl.getBoundingClientRect();
    const scale = zoom / 100;
    const mmToPx = 2.5;

    const translated = event.active.rect.current?.translated;
    let pointerX: number;
    let pointerY: number;
    if (translated) {
      pointerX = translated.left;
      pointerY = translated.top;
    } else {
      const startEvent = event.activatorEvent as PointerEvent;
      pointerX = startEvent.clientX + event.delta.x;
      pointerY = startEvent.clientY + event.delta.y;
    }
    const mmX = (pointerX - canvasRect.left) / scale / mmToPx;
    const mmY = (pointerY - canvasRect.top) / scale / mmToPx;
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

    // Compute a width per block type. `null` = full content width (clamped to remaining
    // page width from drop X), otherwise use the type's natural size — clamped so the
    // block never sticks out past the right margin.
    function widthFor(type: string, item: any): number {
      const def = getDefaultBlockWidth(type, item);
      const maxAllowed = pageW - dropX;
      if (def === null) return Math.min(contentW, maxAllowed);
      return Math.min(def, maxAllowed);
    }

    if (activeIdStr.startsWith('datafield-')) {
      const varKey = activeIdStr.replace('datafield-', '');
      const newBlock: TemplateBlock = {
        id: nanoid(8), type: 'text',
        content: '{{' + varKey + '}}', fontSize: 10, fontWeight: 'normal', fontStyle: 'normal',
        color: '#333333', alignment: 'left', lineHeight: 1.4,
        x: dropX, y: dropY, width: widthFor('text', null), height: 8,
        zIndex: blocks.length,
      } as TemplateBlock;
      updateBlocks([...blocks, newBlock]);
      setSelectedBlockId(newBlock.id);
      return;
    }

    if (activeIdStr.startsWith('palette-')) {
      const blockType = activeIdStr.replace('palette-', '');
      const paletteItem = BLOCK_PALETTE.find(function (p) { return p.type === blockType; });
      if (!paletteItem) return;
      const defaultHeight = getDefaultBlockHeight(blockType, paletteItem);
      const newBlock: TemplateBlock = {
        ...paletteItem.defaultBlock,
        id: nanoid(8), type: paletteItem.type,
        x: dropX, y: dropY, width: widthFor(blockType, paletteItem), height: defaultHeight,
        zIndex: blocks.length,
      } as TemplateBlock;
      updateBlocks([...blocks, newBlock]);
      setSelectedBlockId(newBlock.id);
      return;
    }
  }, [blocks, pageSettings, zoom, history, historyIndex]);

  // Drag/resize updates: state immediately, history only after 500ms idle (P0.2)
  const handleBlockPositionChange = useCallback(function (blockId: string, rawX: number, rawY: number) {
    const block = stateRef.current.blocks.find(function (b) { return b.id === blockId; });
    if (!block) return;
    const snapped = snapToAlignments(rawX, rawY, block.width || 0, block.height || 0, blockId, stateRef.current.blocks, stateRef.current.pageSettings);
    const newBlocks = stateRef.current.blocks.map(function (b) { return b.id !== blockId ? b : { ...b, x: snapped.x, y: snapped.y } as TemplateBlock; });
    setBlocks(newBlocks);
    setSaved(false);
    setIsDirty(true);
    if (dragHistoryTimerRef.current) clearTimeout(dragHistoryTimerRef.current);
    dragHistoryTimerRef.current = setTimeout(function () {
      pushHistorySnapshot({ blocks: newBlocks, pageSettings: stateRef.current.pageSettings, name: stateRef.current.name });
    }, 500);
  }, [history, historyIndex]);

  const handleBlockSizeChange = useCallback(function (blockId: string, width: number, height: number) {
    const newBlocks = stateRef.current.blocks.map(function (b) { return b.id !== blockId ? b : { ...b, width, height } as TemplateBlock; });
    setBlocks(newBlocks);
    setSaved(false);
    setIsDirty(true);
    if (dragHistoryTimerRef.current) clearTimeout(dragHistoryTimerRef.current);
    dragHistoryTimerRef.current = setTimeout(function () {
      pushHistorySnapshot({ blocks: newBlocks, pageSettings: stateRef.current.pageSettings, name: stateRef.current.name });
    }, 500);
  }, [history, historyIndex]);

  const handleUpdateBlock = useCallback(function (blockId: string, updates: Partial<TemplateBlock>) {
    const newBlocks = stateRef.current.blocks.map(function (b) { return b.id !== blockId ? b : { ...b, ...updates } as TemplateBlock; });
    const isTextChange = 'content' in updates;
    if (isTextChange) {
      setBlocks(newBlocks);
      setSaved(false);
      setIsDirty(true);
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = setTimeout(function () {
        pushHistorySnapshot({ blocks: newBlocks, pageSettings: stateRef.current.pageSettings, name: stateRef.current.name });
      }, 500);
    } else {
      updateBlocks(newBlocks);
    }
  }, [history, historyIndex]);

  const handleDeleteBlock = useCallback(function (blockId: string) {
    setDeleteConfirm(blockId);
  }, []);

  const confirmDelete = useCallback(function () {
    const id = deleteConfirmRef.current;
    if (!id) return;
    updateBlocks(stateRef.current.blocks.filter(function (b) { return b.id !== id; }));
    if (stateRef.current.selectedBlockId === id) setSelectedBlockId(null);
    setDeleteConfirm(null);
  }, [history, historyIndex]);

  const handleDuplicateBlock = useCallback(function (blockId: string) {
    const original = stateRef.current.blocks.find(function (b) { return b.id === blockId; });
    if (!original) return;
    const dup = {
      ...original, id: nanoid(8),
      x: (original.x || 0) + 5,
      y: (original.y || 0) + 5,
      zIndex: stateRef.current.blocks.length,
    } as TemplateBlock;
    updateBlocks([...stateRef.current.blocks, dup]);
    setSelectedBlockId(dup.id);
  }, [history, historyIndex]);

  const handleZIndexChange = useCallback(function (blockId: string, direction: 'up' | 'down') {
    const block = stateRef.current.blocks.find(function (b) { return b.id === blockId; });
    if (!block) return;
    const currentZ = block.zIndex || 0;
    const newZ = direction === 'up' ? currentZ + 1 : Math.max(0, currentZ - 1);
    handleUpdateBlock(blockId, { zIndex: newZ } as any);
  }, [handleUpdateBlock]);

  // Update refs after handlers exist (P0.1)
  useEffect(function () { undoRef.current = undo; redoRef.current = redo; });
  useEffect(function () {
    handleDeleteRef.current = handleDeleteBlock;
    handleDuplicateRef.current = handleDuplicateBlock;
    handlePosRef.current = handleBlockPositionChange;
  }, [handleDeleteBlock, handleDuplicateBlock, handleBlockPositionChange]);

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
      // Saved successfully — clear the local draft, server is now the source of truth
      try { localStorage.removeItem(draftKeyFor(template, documentType)); } catch { /* noop */ }
      setTimeout(function () { setSaved(false); }, 2000);
    } catch (err) {
      setSaving(false);
      const msg = err instanceof Error ? err.message : 'Onbekende fout';
      showToast({
        type: 'error',
        title: 'Opslaan mislukt',
        message: msg,
        action: { label: 'Opnieuw proberen', onClick: handleSave },
      });
    }
  }

  function applyStarter(starter: StarterTemplate) {
    // Regenerate IDs + migrate flow → absolute layout
    const freshBlocks = starter.blocks.map(function (b) { return { ...b, id: nanoid(8) } as TemplateBlock; });
    const migrated = needsMigration(freshBlocks) ? migrateToAbsoluteLayout(freshBlocks, starter.pageSettings) : freshBlocks;
    setBlocks(migrated);
    setPageSettings(starter.pageSettings);
    setName(starter.name);
    setSelectedBlockId(null);
    pushHistorySnapshot({ blocks: migrated, pageSettings: starter.pageSettings, name: starter.name });
    setSaved(false);
    setIsDirty(true);
    setStarterPicker(false);
    setPendingStarter(null);
  }

  async function handlePreview() {
    setPreviewing(true);
    try {
      // P0.5 — bundled jsPDF via dynamic import
      const jspdfMod: any = await import('jspdf');
      const autoTableMod: any = await import('jspdf-autotable');
      const jsPDF = jspdfMod.jsPDF || jspdfMod.default;
      // jspdf-autotable v5+ requires explicit applyPlugin to attach doc.autoTable()
      const applyPlugin = autoTableMod.applyPlugin || autoTableMod.default?.applyPlugin;
      if (applyPlugin && !(jsPDF.API as any).autoTable) applyPlugin(jsPDF);
      const jsPDFLib = { jsPDF };
      const previewTemplate: PdfTemplate = { id: 'preview', organization_id: organizationId, document_type: documentType, name, description: '', blocks, page_settings: pageSettings, layout_mode: 'absolute', is_default: false, is_active: true, version: 1, created_by: null, created_at: '', updated_at: '' };
      const ctx = buildPreviewContext(documentType);
      ctx.variables = { ...ctx.variables, ...previewData };
      const doc = await renderFromTemplate(previewTemplate, ctx, jsPDFLib);
      window.open(doc.output('bloburl'), '_blank');
    } catch (err) {
      console.error('Preview error:', err);
      showToast({
        type: 'error',
        title: 'Preview fout',
        message: (err as Error).message,
      });
    }
    setPreviewing(false);
  }

  const sensors = useSensors(
    useSensor(PaletteSensor, {
      activationConstraint: { distance: 5 },
    })
  );

  // Build a preview block for whatever is being dragged: a palette item, a data field,
  // or an existing canvas block. This is what shows in the DragOverlay so the user sees
  // the actual block visual under the cursor instead of dragging into the void.
  const dragOverlayBlock: TemplateBlock | null = (function () {
    if (!activeId) return null;
    if (activeId.startsWith('palette-')) {
      const blockType = activeId.replace('palette-', '');
      const paletteItem = BLOCK_PALETTE.find(function (p) { return p.type === blockType; });
      if (!paletteItem) return null;
      // Match the size that the dropped block will get — default content width when type is full-width.
      const previewW = getDefaultBlockWidth(paletteItem.type, paletteItem)
        ?? (pageSettings.format === 'a4' ? 210 : 216) - pageSettings.margins.left - pageSettings.margins.right;
      return {
        ...paletteItem.defaultBlock,
        id: 'preview',
        type: paletteItem.type,
        width: previewW,
        height: getDefaultBlockHeight(paletteItem.type, paletteItem),
      } as TemplateBlock;
    }
    if (activeId.startsWith('datafield-')) {
      const varKey = activeId.replace('datafield-', '');
      return {
        id: 'preview', type: 'text',
        content: '{{' + varKey + '}}',
        fontSize: 10, fontWeight: 'normal', fontStyle: 'normal',
        color: '#333333', alignment: 'left', lineHeight: 1.4,
        width: getDefaultBlockWidth('text', null) ?? 80, height: 8,
      } as TemplateBlock;
    }
    return blocks.find(function (b) { return b.id === activeId; }) || null;
  })();
  const hasAlignment = selectedBlock && 'alignment' in selectedBlock;
  const currentAlignment = hasAlignment ? (selectedBlock as any).alignment : null;

  // Toolbar icon button with hover/active/pressed states (P3.4) and aria-label (P1.1)
  function TB({ onClick, disabled, title, ariaLabel, active, children }: { onClick: () => void; disabled?: boolean; title: string; ariaLabel?: string; active?: boolean; children: React.ReactNode }) {
    const [hover, setHover] = useState(false);
    const [pressed, setPressed] = useState(false);
    const bg = disabled
      ? 'transparent'
      : pressed ? 'var(--hover-strong)'
      : hover ? 'var(--hover)'
      : active ? 'var(--brand-tint)'
      : 'transparent';
    return (
      <button
        onClick={onClick} disabled={disabled} title={title}
        aria-label={ariaLabel || title}
        aria-pressed={active ? true : undefined}
        onMouseEnter={function () { setHover(true); }}
        onMouseLeave={function () { setHover(false); setPressed(false); }}
        onMouseDown={function () { setPressed(true); }}
        onMouseUp={function () { setPressed(false); }}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 28, height: 28, borderRadius: 4, border: 'none',
          cursor: disabled ? 'default' : 'pointer',
          background: bg,
          color: disabled ? 'var(--muted-weak)' : active ? 'var(--brand)' : 'var(--muted)',
          transition: 'background 0.1s, color 0.1s',
        }}>{children}</button>
    );
  }

  function Sep() { return <div style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 2px', flexShrink: 0 }} />; }

  // Tab definitions (P3.1 — Preview removed)
  const tabs: { id: 'designer' | 'data' | 'settings'; label: string; icon: typeof Pen }[] = [
    { id: 'designer', label: 'Ontwerp', icon: Pen },
    { id: 'data', label: 'Data', icon: Database },
    { id: 'settings', label: 'Instellingen', icon: Settings },
  ];

  // Template name input width (P3.3): grows with content, clamped
  const nameInputWidth = Math.min(Math.max(name.length + 2, 14), 36);

  return (
    <div style={rootStyle}>

      {/* ═══ Top Bar ═══ */}
      <div style={topBarStyle}>
        <Link
          href="/instellingen"
          aria-label="Terug naar instellingen"
          style={{ display: 'flex', alignItems: 'center', padding: '0 8px 0 12px', color: 'var(--muted)', textDecoration: 'none' }}
        >
          <ChevronLeft size={18} />
        </Link>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px', borderRight: '1px solid var(--border)', height: '100%' }}>
          <label className="sr-only" htmlFor="template-name-input">Templatenaam</label>
          <input
            id="template-name-input"
            value={name}
            title={name}
            onChange={function (e) { updateName(e.target.value); }}
            style={{
              fontSize: 13, fontWeight: 600, color: 'var(--text)', background: 'transparent',
              border: 'none', outline: 'none',
              minWidth: '160px', maxWidth: '360px',
              width: `${nameInputWidth}ch`,
              textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap',
            }}
          />
          <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 3, background: 'var(--brand-tint)', color: 'var(--brand)', fontWeight: 700, letterSpacing: '0.03em' }}>
            {DOC_LABELS[documentType] || documentType}
          </span>
        </div>

        <div style={{ display: 'flex', height: '100%' }}>
          {tabs.map(function (tab) {
            const isActive = topTab === tab.id;
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={function () { setTopTab(tab.id); }}
                aria-current={isActive ? 'page' : undefined}
                aria-label={tab.label}
                style={{
                  ...tabBtnBase,
                  color: isActive ? 'var(--brand)' : 'var(--muted)',
                  transition: 'color 0.15s',
                }}
              >
                <Icon size={14} />
                {tab.label}
                {isActive && (
                  <motion.div
                    layoutId="tab-underline"
                    style={{
                      position: 'absolute',
                      bottom: 0, left: 0, right: 0,
                      height: 2, background: 'var(--brand)',
                    }}
                    transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                  />
                )}
              </button>
            );
          })}
        </div>

        <div style={{ flex: 1 }} />

        {/* Save success live region (P1.7) */}
        <div role="status" aria-live="polite" className="sr-only">
          {saved ? 'Opgeslagen' : ''}
        </div>

        <div style={{ padding: '0 12px', display: 'flex', gap: 8, alignItems: 'center' }}>
          {/* Starter-picker trigger */}
          <button
            onClick={function () { setStarterPicker(true); }}
            title="Begin met een sjabloon"
            aria-label="Sjablonen openen"
            style={{
              display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 4,
              border: '1px solid #dadce0', cursor: 'pointer', fontSize: 12, fontWeight: 500,
              background: '#fff', color: '#5f6368',
            }}
          >
            <LayoutTemplate size={13} aria-hidden="true" />
            Sjablonen
          </button>

          {/* Preview button (P3.1) */}
          <button
            onClick={handlePreview}
            disabled={previewing}
            aria-label="Voorbeeld openen"
            style={{
              ...previewBtnStyle,
              opacity: previewing ? 0.6 : 1,
              cursor: previewing ? 'default' : 'pointer',
            }}
          >
            {previewing
              ? <Loader2 size={13} aria-hidden="true" style={{ animation: 'spin 1s linear infinite' }} />
              : <Eye size={13} aria-hidden="true" />}
            {previewing ? 'Laden…' : 'Voorbeeld'}
          </button>

          {/* Save button */}
          <button
            onClick={handleSave}
            disabled={saving}
            aria-label={`Opslaan${isDirty && !saved && !saving ? ' — niet opgeslagen' : ''}`}
            style={{
              ...saveBtnBase,
              background: saved ? 'var(--success-tint)' : 'var(--brand)',
              color: saved ? 'var(--success)' : '#1a1a1a',
            }}
          >
            {saving
              ? <Loader2 size={13} aria-hidden="true" style={{ animation: 'spin 1s linear infinite' }} />
              : <Save size={13} aria-hidden="true" />}
            {saving ? 'Opslaan…' : saved ? 'Opgeslagen!' : 'Opslaan'}
            {isDirty && !saved && !saving && (
              <>
                <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--warning)', flexShrink: 0 }} />
                <span className="sr-only">(niet opgeslagen)</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* ═══ Toolbar Row ═══ */}
      {topTab === 'designer' && (
        <div style={toolbarRowStyle}>
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
          <span style={{ ...numberStyle, fontSize: 11, fontWeight: 500, color: 'var(--muted)', minWidth: 36, textAlign: 'center', userSelect: 'none' }}>{zoom}%</span>
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

            <div
              ref={canvasScrollRef}
              style={{
                flex: 1, overflow: 'auto', padding: 20,
                display: 'flex',
                // safe center → browser falls back to start-alignment when content overflows,
                // so the scrollbar can actually reach the clipped sides instead of staying empty.
                justifyContent: 'safe center',
                alignItems: 'flex-start',
                background: 'var(--bg-subtle)',
              }}
            >
              <EditorCanvas
                blocks={blocks}
                pageSettings={pageSettings}
                selectedBlockId={selectedBlockId}
                hiddenBlockIds={hiddenBlockIds}
                onSelectBlock={setSelectedBlockId}
                onBlockPositionChange={handleBlockPositionChange}
                onBlockSizeChange={handleBlockSizeChange}
                onUpdateBlock={handleUpdateBlock}
                onZIndexChange={handleZIndexChange}
                onDuplicate={handleDuplicateBlock}
                onDelete={handleDeleteBlock}
                documentType={documentType}
                zoom={zoom}
                snapEnabled={snapEnabled}
                showGuides={showGuides}
              />
            </div>

            {/*
              dropAnimation={null} → no "snap back to source" animation when releasing
              over a non-droppable area; the overlay just disappears.
              The wrapper renders the block at its real canvas dimensions so the preview
              looks identical to where it'll land — no padding/card chrome.
            */}
            <DragOverlay dropAnimation={null}>
              {dragOverlayBlock && (
                <div style={{
                  width: ((dragOverlayBlock.width || 60) * 2.5 * (zoom / 100)) + 'px',
                  height: ((dragOverlayBlock.height || 8) * 2.5 * (zoom / 100)) + 'px',
                  outline: '2px solid var(--brand)',
                  outlineOffset: -1,
                  borderRadius: 2,
                  overflow: 'hidden',
                  background: 'transparent',
                  pointerEvents: 'none',
                  transformOrigin: 'top left',
                }}>
                  <BlockRenderer block={dragOverlayBlock} documentType={documentType} />
                </div>
              )}
            </DragOverlay>
          </DndContext>

          {/* Right: Resize handle + Layers + Properties (P3.6) */}
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Rechterpaneel verkleinen of vergroten"
            tabIndex={0}
            onMouseDown={function (e) {
              e.preventDefault();
              const startX = e.clientX;
              const startW = rightPanelWidth;
              function move(ev: MouseEvent) {
                const next = Math.min(RIGHT_PANEL_MAX, Math.max(RIGHT_PANEL_MIN, startW + (startX - ev.clientX)));
                setRightPanelWidth(next);
              }
              function up() {
                window.removeEventListener('mousemove', move);
                window.removeEventListener('mouseup', up);
                try { localStorage.setItem(RIGHT_PANEL_KEY, String(stateRefWidth.current)); } catch { /* noop */ }
              }
              window.addEventListener('mousemove', move);
              window.addEventListener('mouseup', up);
            }}
            onKeyDown={function (e) {
              if (e.key === 'ArrowLeft') { setRightPanelWidth(function (w) { return Math.min(RIGHT_PANEL_MAX, w + 10); }); }
              else if (e.key === 'ArrowRight') { setRightPanelWidth(function (w) { return Math.max(RIGHT_PANEL_MIN, w - 10); }); }
            }}
            style={{
              width: 4, cursor: 'col-resize', background: 'transparent',
              borderLeft: '1px solid var(--border)', flexShrink: 0,
            }}
          />
          <div className="editor-right-panel" style={{ width: rightPanelWidth, flexShrink: 0, background: 'var(--surface)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
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
          <RightPanelWidthRef width={rightPanelWidth} />
        </div>
      )}

      {/* ═══ Settings Tab ═══ */}
      {topTab === 'settings' && (
        <section role="region" aria-labelledby="settings-tab-title" style={{ flex: 1, overflow: 'auto', padding: 32, background: 'var(--bg)' }}>
          <div style={settingsCardStyle}>
            <h2 id="settings-tab-title" style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 16 }}>Template Instellingen</h2>
            <div style={{ marginBottom: 16 }}>
              <label htmlFor="settings-name" style={settingsLabelStyle}>Templatenaam</label>
              <input id="settings-name" value={name} onChange={function (e) { updateName(e.target.value); }} style={settingsInputStyle} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label htmlFor="settings-format" style={settingsLabelStyle}>Papierformaat</label>
                <select id="settings-format" value={pageSettings.format} onChange={function (e) { updatePageSettings({ ...pageSettings, format: e.target.value as 'a4' | 'letter' }); }}
                  style={settingsInputStyle}>
                  <option value="a4">A4</option><option value="letter">Letter</option>
                </select>
              </div>
              <div>
                <label htmlFor="settings-orientation" style={settingsLabelStyle}>Oriëntatie</label>
                <select id="settings-orientation" value={pageSettings.orientation} onChange={function (e) { updatePageSettings({ ...pageSettings, orientation: e.target.value as 'portrait' | 'landscape' }); }}
                  style={settingsInputStyle}>
                  <option value="portrait">Staand</option><option value="landscape">Liggend</option>
                </select>
              </div>
            </div>
            <BackgroundColorField pageSettings={pageSettings} onChange={updatePageSettings} />
            <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginTop: 20, marginBottom: 8 }}>Marges (mm)</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8 }}>
              {(['top', 'right', 'bottom', 'left'] as const).map(function (side) {
                const labels: Record<string, string> = { top: 'Boven', right: 'Rechts', bottom: 'Onder', left: 'Links' };
                return (
                  <div key={side}>
                    <label htmlFor={`margin-${side}`} style={{ display: 'block', fontSize: 10, color: 'var(--muted)', marginBottom: 2 }}>{labels[side]}</label>
                    <input id={`margin-${side}`} type="number" value={pageSettings.margins[side]} min={0} max={50}
                      onChange={function (e) { updatePageSettings({ ...pageSettings, margins: { ...pageSettings.margins, [side]: Number(e.target.value) } }); }}
                      style={{ ...settingsInputStyle, ...numberStyle, padding: '6px 8px', borderRadius: 4, fontSize: 12 }} />
                  </div>
                );
              })}
            </div>
            <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginTop: 20, marginBottom: 4 }}>Huisstijlkleuren</h3>
            <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>
              Elk veld dat aan <strong>Primair</strong> of <strong>Accent</strong> is gebonden gebruikt deze kleuren in de PDF. Leeg laten = kleur uit organisatie-instellingen.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <BrandColorField
                label="Primair"
                idSuffix="primary"
                value={pageSettings.brandColors?.primary || ''}
                fallback={orgPrimary}
                onChange={function (v) {
                  const bc = { ...(pageSettings.brandColors || {}) };
                  if (v) bc.primary = v; else delete bc.primary;
                  updatePageSettings({ ...pageSettings, brandColors: bc });
                }}
              />
              <BrandColorField
                label="Accent"
                idSuffix="accent"
                value={pageSettings.brandColors?.accent || ''}
                fallback={orgAccent}
                onChange={function (v) {
                  const bc = { ...(pageSettings.brandColors || {}) };
                  if (v) bc.accent = v; else delete bc.accent;
                  updatePageSettings({ ...pageSettings, brandColors: bc });
                }}
              />
            </div>
          </div>
        </section>
      )}

      {/* ═══ Data Tab ═══ */}
      {topTab === 'data' && <DataTab documentType={documentType} previewData={previewData} onUpdatePreviewData={setPreviewData} />}

      {/* ═══ Starter Template Picker ═══ */}
      {starterPicker && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 99998,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.45)', padding: 20,
        }} onClick={function () { setStarterPicker(false); setPendingStarter(null); }}>
          <div onClick={function (e) { e.stopPropagation(); }} style={{
            background: '#fff', borderRadius: 10, maxWidth: 960, width: '100%', maxHeight: '90vh',
            boxShadow: '0 20px 60px rgba(0,0,0,.25)', display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #e0e0e0' }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#202124' }}>Sjabloon kiezen</div>
                <div style={{ fontSize: 11, color: '#5f6368', marginTop: 2 }}>Begin met een kant-en-klare lay-out — je past hem daarna volledig aan.</div>
              </div>
              <button onClick={function () { setStarterPicker(false); setPendingStarter(null); }}
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 6, color: '#5f6368' }}>
                <X size={16} />
              </button>
            </div>

            <div style={{ padding: 20, overflowY: 'auto', flex: 1, background: '#f8f9fa' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
                {(STARTER_TEMPLATES[documentType] || []).map(function (starter) {
                  const isPending = pendingStarter?.id === starter.id;
                  return (
                    <div key={starter.id}
                      onClick={function () { setPendingStarter(starter); }}
                      style={{
                        background: '#fff', borderRadius: 8,
                        border: isPending ? '2px solid #4251f4' : '1px solid #e0e0e0',
                        padding: 14, cursor: 'pointer', transition: 'all 0.15s',
                        boxShadow: isPending ? '0 4px 12px rgba(66,81,244,.15)' : '0 1px 3px rgba(0,0,0,.04)',
                      }}>
                      <StarterThumbnail starter={starter} documentType={documentType} />
                      <div style={{ marginTop: 10, fontSize: 13, fontWeight: 700, color: '#202124' }}>{starter.name}</div>
                      <div style={{ marginTop: 4, fontSize: 11, color: '#5f6368', lineHeight: 1.5 }}>{starter.description}</div>
                      <div style={{ marginTop: 8, fontSize: 10, color: '#9aa0a6' }}>{starter.blocks.length} blokken</div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '14px 20px', borderTop: '1px solid #e0e0e0', background: '#fff' }}>
              <button onClick={function () { setStarterPicker(false); setPendingStarter(null); }}
                style={{ padding: '8px 16px', borderRadius: 4, border: '1px solid #dadce0', background: '#fff', cursor: 'pointer', fontSize: 12, color: '#5f6368' }}>
                Annuleren
              </button>
              <button onClick={function () { if (pendingStarter) applyStarter(pendingStarter); }}
                disabled={!pendingStarter}
                style={{
                  padding: '8px 18px', borderRadius: 4, border: 'none', cursor: pendingStarter ? 'pointer' : 'default',
                  background: pendingStarter ? '#4251f4' : '#dadce0',
                  color: '#fff', fontSize: 12, fontWeight: 600,
                }}>
                Sjabloon toepassen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Delete Confirmation Dialog ═══ */}
      <AnimatePresence>
        {deleteConfirm && (
          <DeleteDialog
            onCancel={function () { setDeleteConfirm(null); }}
            onConfirm={confirmDelete}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// Helper component to keep latest panel width in a ref for the mouseup handler
const stateRefWidth = { current: RIGHT_PANEL_DEFAULT };
function RightPanelWidthRef({ width }: { width: number }) {
  useEffect(function () { stateRefWidth.current = width; }, [width]);
  return null;
}

// ── Background Color Field with debounced text validation (P3.5) ────────────
function BackgroundColorField({ pageSettings, onChange }: { pageSettings: PageSettings; onChange: (ps: PageSettings) => void }) {
  const [draft, setDraft] = useState(pageSettings.backgroundColor || '#ffffff');
  const [error, setError] = useState<string | null>(null);
  // Sync draft when external value changes (e.g. from undo) — React-recommended derived-state pattern
  const [prevValue, setPrevValue] = useState(pageSettings.backgroundColor);
  if (pageSettings.backgroundColor !== prevValue) {
    setPrevValue(pageSettings.backgroundColor);
    setDraft(pageSettings.backgroundColor || '#ffffff');
    setError(null);
  }

  function commit(value: string) {
    if (HEX_RE.test(value)) {
      setError(null);
      onChange({ ...pageSettings, backgroundColor: value });
    } else {
      setError('Voer een geldige hex-kleur in (bijv. #ffffff)');
    }
  }

  return (
    <div style={{ marginTop: 16 }}>
      <label htmlFor="settings-bg" style={settingsLabelStyle}>Achtergrondkleur</label>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          type="color"
          value={pageSettings.backgroundColor}
          onChange={function (e) { onChange({ ...pageSettings, backgroundColor: e.target.value }); }}
          style={{ width: 36, height: 36, border: '1px solid var(--border-strong)', borderRadius: 6, cursor: 'pointer', padding: 2, background: 'transparent' }}
          aria-label="Achtergrondkleur kiezen"
        />
        <input
          id="settings-bg"
          value={draft}
          onChange={function (e) { setDraft(e.target.value); if (error) setError(null); }}
          onBlur={function () { commit(draft); }}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'settings-bg-error' : undefined}
          style={{ ...settingsInputStyle, flex: 1 }}
        />
      </div>
      {error && (
        <p id="settings-bg-error" style={{ fontSize: 11, color: 'var(--danger)', marginTop: 4 }}>{error}</p>
      )}
    </div>
  );
}

// ── Brand Color Field (Primair / Accent override) ──────────────────────────
function BrandColorField({ label, idSuffix, value, fallback, onChange }: { label: string; idSuffix: string; value: string; fallback: string; onChange: (v: string) => void }) {
  const id = 'settings-brand-' + idSuffix;
  const effective = value || fallback;
  const isOverride = !!value;
  return (
    <div>
      <label htmlFor={id} style={settingsLabelStyle}>
        {label}
        {!isOverride && <span style={{ marginLeft: 6, fontSize: 9, color: 'var(--muted)', fontWeight: 400 }}>(standaard)</span>}
      </label>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <input
          type="color"
          value={effective}
          onChange={function (e) { onChange(e.target.value); }}
          aria-label={label + ' kleur kiezen'}
          style={{ width: 36, height: 36, border: '1px solid var(--border-strong)', borderRadius: 6, cursor: 'pointer', padding: 2, background: 'transparent' }}
        />
        <input
          id={id}
          value={effective}
          onChange={function (e) { if (HEX_RE.test(e.target.value) || e.target.value === '') onChange(e.target.value); }}
          spellCheck={false}
          style={{ ...settingsInputStyle, flex: 1, fontFamily: 'monospace', fontSize: 12 }}
        />
        {isOverride && (
          <button
            type="button"
            onClick={function () { onChange(''); }}
            title="Terug naar standaard organisatiekleur"
            style={{
              padding: '6px 10px', borderRadius: 4, border: '1px solid var(--border-strong)',
              background: 'transparent', color: 'var(--muted)', cursor: 'pointer', fontSize: 11,
            }}
          >
            Reset
          </button>
        )}
      </div>
    </div>
  );
}

// ── Delete Dialog (P1.3, P4.2) ──────────────────────────────────────────────
function DeleteDialog({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const confirmRef = useRef<HTMLButtonElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(function () {
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();
    return function () {
      try { previousFocusRef.current?.focus(); } catch { /* noop */ }
    };
  }, []);

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { e.preventDefault(); onCancel(); return; }
    if (e.key === 'Enter' && document.activeElement === confirmRef.current) {
      e.preventDefault(); onConfirm(); return;
    }
    if (e.key === 'Tab') {
      const focusables = [cancelRef.current, confirmRef.current].filter(Boolean) as HTMLElement[];
      if (focusables.length === 0) return;
      const idx = focusables.indexOf(document.activeElement as HTMLElement);
      e.preventDefault();
      if (e.shiftKey) {
        const next = idx <= 0 ? focusables[focusables.length - 1] : focusables[idx - 1];
        next?.focus();
      } else {
        const next = idx === -1 || idx >= focusables.length - 1 ? focusables[0] : focusables[idx + 1];
        next?.focus();
      }
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.12 }}
      style={dialogScrim}
      onClick={onCancel}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-dialog-title"
        aria-describedby="delete-dialog-desc"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
        onClick={function (e) { e.stopPropagation(); }}
        onKeyDown={handleKey}
        style={dialogStyle}
      >
        <h2 id="delete-dialog-title" style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 12 }}>
          Blok verwijderen?
        </h2>
        <p id="delete-dialog-desc" style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 16 }}>
          Dit kan ongedaan worden gemaakt met Ctrl+Z.
        </p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button ref={cancelRef} onClick={onCancel} style={dialogCancelBtn}>Annuleren</button>
          <button ref={confirmRef} onClick={onConfirm} style={dialogConfirmBtn}>Verwijderen</button>
        </div>
      </motion.div>
    </motion.div>
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

  const inputStyle: React.CSSProperties = { width: '100%', padding: '4px 8px', borderRadius: 4, border: '1px solid var(--border-strong)', fontSize: 12, color: 'var(--text)', background: 'var(--bg)' };
  const headStyle: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: 'var(--brand)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.03em' };
  const codeStyle: React.CSSProperties = { fontSize: 9, color: 'var(--brand)', background: 'var(--brand-tint)', padding: '1px 5px', borderRadius: 3, fontFamily: 'monospace', whiteSpace: 'nowrap' };

  function handleChange(key: string, value: string) {
    onUpdatePreviewData({ ...previewData, [key]: value });
  }

  return (
    <section role="region" aria-labelledby="data-tab-title" style={{ flex: 1, overflow: 'auto', padding: 32, background: 'var(--bg)' }}>
      <div style={{ maxWidth: 700, margin: '0 auto' }}>
        <div style={{ background: 'var(--surface)', borderRadius: 8, border: '1px solid var(--border)', padding: 24, marginBottom: 16 }}>
          <h2 id="data-tab-title" style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>Voorbeeld Data</h2>
          <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 20 }}>
            Pas deze waarden aan om je template te testen met andere data. Ze worden gebruikt bij <code style={{ background: 'var(--hover)', padding: '1px 4px', borderRadius: 3, color: 'var(--text)' }}>{'{{variabele}}'}</code> velden en in de PDF preview.
          </p>

          {Object.entries(VAR_GROUPS).map(function ([key, group]) {
            const visibleKeys = group.keys.filter(function (k) { return previewData[k] !== undefined; });
            if (visibleKeys.length === 0) return null;
            return (
              <div key={key} style={{ marginBottom: 20 }}>
                <div style={headStyle}>{group.label}</div>
                {visibleKeys.map(function (varKey) {
                  const isLong = (previewData[varKey] || '').length > 60;
                  const fieldId = `data-${varKey}`;
                  return (
                    <div key={varKey} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
                      <div style={{ width: 130, flexShrink: 0, paddingTop: 5 }}>
                        <label htmlFor={fieldId} style={{ fontSize: 11, fontWeight: 500, color: 'var(--muted)', display: 'block' }}>{VAR_LABELS[varKey] || varKey}</label>
                        <code style={codeStyle}>{'{{' + varKey + '}}'}</code>
                      </div>
                      <div style={{ flex: 1 }}>
                        {isLong ? (
                          <textarea id={fieldId} value={previewData[varKey] || ''} rows={2}
                            onChange={function (e) { handleChange(varKey, e.target.value); }}
                            style={{ ...inputStyle, resize: 'vertical' }} />
                        ) : (
                          <input id={fieldId} value={previewData[varKey] || ''}
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
            style={{ padding: '6px 14px', borderRadius: 4, border: '1px solid var(--border-strong)', background: 'transparent', cursor: 'pointer', fontSize: 11, color: 'var(--muted)' }}>
            Standaardwaarden herstellen
          </button>
        </div>

        {ctx.data.items && ctx.data.items.length > 0 && (
          <div style={{ background: 'var(--surface)', borderRadius: 8, border: '1px solid var(--border)', padding: 24, marginBottom: 16 }}>
            <div style={headStyle}>Regelitems</div>
            <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
                  <th style={{ padding: '6px 8px', color: 'var(--muted)', fontWeight: 600 }}>Omschrijving</th>
                  <th style={{ padding: '6px 8px', color: 'var(--muted)', fontWeight: 600, textAlign: 'center' }}>Aantal</th>
                  <th style={{ padding: '6px 8px', color: 'var(--muted)', fontWeight: 600, textAlign: 'right' }}>Prijs</th>
                  <th style={{ padding: '6px 8px', color: 'var(--muted)', fontWeight: 600, textAlign: 'center' }}>BTW%</th>
                </tr>
              </thead>
              <tbody>
                {ctx.data.items.map(function (item, i) {
                  return (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '6px 8px', color: 'var(--text)' }}>{item.omschrijving}</td>
                      <td style={{ padding: '6px 8px', color: 'var(--text)', textAlign: 'center', ...numberStyle }}>{item.qty}</td>
                      <td style={{ padding: '6px 8px', color: 'var(--text)', textAlign: 'right', ...numberStyle }}>{'\u20ac ' + item.prijs.toFixed(2)}</td>
                      <td style={{ padding: '6px 8px', color: 'var(--text)', textAlign: 'center', ...numberStyle }}>{item.btw}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {ctx.data.menuSelectie && (
          <div style={{ background: 'var(--surface)', borderRadius: 8, border: '1px solid var(--border)', padding: 24, marginBottom: 16 }}>
            <div style={headStyle}>Menu</div>
            {Object.entries(ctx.data.menuSelectie).map(function ([gang, dishes]) {
              return (
                <div key={gang} style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>{gang}</div>
                  {dishes.map(function (dish, i) {
                    return <div key={i} style={{ fontSize: 12, color: 'var(--muted)', paddingLeft: 12 }}>{dish}</div>;
                  })}
                </div>
              );
            })}
          </div>
        )}

        {ctx.data.haccpRecords && ctx.data.haccpRecords.length > 0 && (
          <div style={{ background: 'var(--surface)', borderRadius: 8, border: '1px solid var(--border)', padding: 24, marginBottom: 16 }}>
            <div style={headStyle}>HACCP Metingen</div>
            <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
                  <th style={{ padding: '6px 8px', color: 'var(--muted)', fontWeight: 600 }}>Tijd</th>
                  <th style={{ padding: '6px 8px', color: 'var(--muted)', fontWeight: 600 }}>Product</th>
                  <th style={{ padding: '6px 8px', color: 'var(--muted)', fontWeight: 600 }}>Type</th>
                  <th style={{ padding: '6px 8px', color: 'var(--muted)', fontWeight: 600, textAlign: 'right' }}>Temp</th>
                  <th style={{ padding: '6px 8px', color: 'var(--muted)', fontWeight: 600 }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {ctx.data.haccpRecords.map(function (r, i) {
                  return (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '6px 8px', color: 'var(--text)', ...numberStyle }}>{r.tijd}</td>
                      <td style={{ padding: '6px 8px', color: 'var(--text)' }}>{r.wat}</td>
                      <td style={{ padding: '6px 8px', color: 'var(--text)' }}>{r.type}</td>
                      <td style={{ padding: '6px 8px', color: 'var(--text)', textAlign: 'right', ...numberStyle }}>{r.temp}°C</td>
                      <td style={{ padding: '6px 8px' }}>
                        <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 3, fontWeight: 600, background: r.status === 'ok' ? 'var(--success-tint)' : 'rgba(245,158,11,.15)', color: r.status === 'ok' ? 'var(--success)' : 'var(--warning)' }}>
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
    </section>
  );
}

// Helper: Snap block position to align with other blocks' edges/centers
function snapToAlignments(
  rawX: number, rawY: number, w: number, h: number,
  blockId: string, allBlocks: TemplateBlock[], ps: PageSettings,
): { x: number; y: number } {
  const THRESHOLD = 3;

  const left = rawX;
  const right = rawX + w;
  const centerX = rawX + w / 2;
  const top = rawY;
  const bottom = rawY + h;
  const centerY = rawY + h / 2;

  const pageW = ps.format === 'a4' ? 210 : 216;
  const pageH = ps.format === 'a4' ? 297 : 279;

  const vTargets: number[] = [ps.margins.left, pageW - ps.margins.right, pageW / 2];
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

  let snapX = rawX;
  let bestDx = THRESHOLD + 1;
  for (const vt of vTargets) {
    const dL = Math.abs(left - vt);
    if (dL < bestDx) { bestDx = dL; snapX = vt; }
    const dR = Math.abs(right - vt);
    if (dR < bestDx) { bestDx = dR; snapX = vt - w; }
    const dC = Math.abs(centerX - vt);
    if (dC < bestDx) { bestDx = dC; snapX = vt - w / 2; }
  }

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

// Default width per block type (mm). Compact blocks (logo, text, badge, image, totals)
// get a content-sized box; full-width-ish blocks (table, menu, divider, footer, etc.)
// fall back to the page's content width via the `null` sentinel.
function getDefaultBlockWidth(type: string, item: any): number | null {
  switch (type) {
    case 'logo': return (item?.defaultBlock?.maxWidth as number) || 60;
    case 'text': return 80;
    case 'document_badge': return 70;
    case 'image': return (item?.defaultBlock?.maxWidth as number) || 100;
    case 'totals': return 60;
    case 'spacer': return 60;
    case 'client_info': return 100;
    // Full content width by default
    case 'items_table':
    case 'menu':
    case 'payment_details':
    case 'divider':
    case 'footer':
    case 'haccp_table':
      return null;
    default: return 80;
  }
}


// Mini visual thumbnail for the starter picker — renders a rough A4 preview
function StarterThumbnail({ starter, documentType }: { starter: StarterTemplate; documentType: PdfTemplate['document_type'] }) {
  const bg = starter.pageSettings.backgroundColor;
  const frameBlock = starter.blocks.find(function (b) { return b.type === 'border_frame'; }) as any;
  const accent = documentType === 'haccp' ? '#c83232' : '#c4a35a';
  const frameColor = frameBlock ? (frameBlock.color === 'brand_primary' ? accent : frameBlock.color) : null;

  function frameOverlay() {
    if (!frameBlock || !frameColor) return null;
    const style = frameBlock.style;
    if (style === 'single' || style === 'dashed' || style === 'dotted' || style === 'rounded') {
      return <div style={{
        position: 'absolute', inset: '4%', pointerEvents: 'none',
        border: '1px ' + (style === 'rounded' ? 'solid' : style) + ' ' + frameColor,
        borderRadius: style === 'rounded' ? 3 : 0,
      }} />;
    }
    if (style === 'double') {
      return <div style={{ position: 'absolute', inset: '4%', border: '1px solid ' + frameColor, pointerEvents: 'none' }}>
        <div style={{ position: 'absolute', inset: 2, border: '1px solid ' + frameColor }} />
      </div>;
    }
    if (style === 'corners') {
      const sz = 10;
      return (
        <div style={{ position: 'absolute', inset: '4%', pointerEvents: 'none' }}>
          {[{ t: 0, l: 0 }, { t: 0, r: 0 }, { b: 0, l: 0 }, { b: 0, r: 0 }].map(function (p, i) {
            const style: React.CSSProperties = { position: 'absolute', ...p };
            return (
              <div key={i}>
                <div style={{ ...style, width: sz, height: 1, background: frameColor }} />
                <div style={{ ...style, width: 1, height: sz, background: frameColor }} />
              </div>
            );
          })}
        </div>
      );
    }
    if (style === 'ornament') {
      return <div style={{ position: 'absolute', inset: '4%', border: '1px solid ' + frameColor, pointerEvents: 'none' }}>
        {[{ t: 0, l: 0 }, { t: 0, r: 0 }, { b: 0, l: 0 }, { b: 0, r: 0 }].map(function (p, i) {
          return <div key={i} style={{ position: 'absolute', ...p, width: 5, height: 5, background: frameColor, clipPath: 'polygon(0 0, 100% 0, 0 100%)', transform: 'rotate(' + (i * 90) + 'deg)' }} />;
        })}
      </div>;
    }
    return null;
  }

  return (
    <div style={{
      width: '100%', aspectRatio: '210 / 297', background: bg,
      border: '1px solid #e0e0e0', borderRadius: 4, overflow: 'hidden', position: 'relative',
      boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.02)',
    }}>
      <div style={{ position: 'absolute', inset: 0, padding: '8%', display: 'flex', flexDirection: 'column', gap: 3 }}>
        {starter.blocks.slice(0, 9).map(function (b, i) {
          return <MiniBlock key={i} block={b} docType={documentType} />;
        })}
      </div>
      {frameOverlay()}
    </div>
  );
}

function MiniBlock({ block, docType }: { block: TemplateBlock; docType: PdfTemplate['document_type'] }) {
  const accent = docType === 'haccp' ? '#c83232' : docType === 'menukaart' ? '#c4a35a' : '#c4a35a';
  const muted = docType === 'menukaart' ? 'rgba(255,255,255,.4)' : '#d0d0d0';

  switch (block.type) {
    case 'logo':
      return <div style={{ height: 12, width: '35%', alignSelf: block.alignment === 'center' ? 'center' : block.alignment === 'right' ? 'flex-end' : 'flex-start', background: 'rgba(0,0,0,.06)', borderRadius: 2 }} />;
    case 'document_badge':
      return <div style={{ height: 8, width: '40%', alignSelf: 'center', background: (block as any).backgroundColor === 'brand_primary' ? accent : (block as any).backgroundColor, borderRadius: 1 }} />;
    case 'divider':
      return <div style={{ height: 1, width: '100%', background: accent }} />;
    case 'text':
      return <div style={{ height: 3, width: (block as any).alignment === 'center' ? '60%' : '80%', alignSelf: (block as any).alignment === 'center' ? 'center' : 'flex-start', background: muted, borderRadius: 1 }} />;
    case 'client_info':
      return (
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div style={{ height: 3, width: '80%', background: muted }} />
            <div style={{ height: 2, width: '60%', background: muted, opacity: 0.6 }} />
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div style={{ height: 2, width: '100%', background: muted, opacity: 0.6 }} />
            <div style={{ height: 2, width: '90%', background: muted, opacity: 0.6 }} />
          </div>
        </div>
      );
    case 'items_table':
      return (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ height: 4, width: '100%', background: accent }} />
          <div style={{ height: 2, width: '100%', background: muted, opacity: 0.4, marginTop: 1 }} />
          <div style={{ height: 2, width: '100%', background: muted, opacity: 0.4, marginTop: 1 }} />
        </div>
      );
    case 'menu':
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <div style={{ height: 3, width: '50%', alignSelf: 'center', background: accent }} />
          <div style={{ height: 2, width: '80%', alignSelf: 'center', background: muted, opacity: 0.6 }} />
          <div style={{ height: 2, width: '70%', alignSelf: 'center', background: muted, opacity: 0.6 }} />
        </div>
      );
    case 'totals':
      return <div style={{ height: 4, width: '40%', alignSelf: 'flex-end', background: accent, borderRadius: 1 }} />;
    case 'payment_details':
      return <div style={{ height: 14, width: '100%', background: 'rgba(0,0,0,.04)', border: '1px solid ' + accent, borderRadius: 2 }} />;
    case 'footer':
      return <div style={{ height: 2, width: '60%', alignSelf: 'center', background: muted, opacity: 0.5, marginTop: 'auto' }} />;
    case 'haccp_table':
      return (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ height: 4, width: '100%', background: accent }} />
          <div style={{ height: 2, width: '100%', background: muted, opacity: 0.4, marginTop: 1 }} />
          <div style={{ height: 2, width: '100%', background: muted, opacity: 0.4, marginTop: 1 }} />
        </div>
      );
    case 'image':
      return <div style={{ height: 24, width: '100%', background: 'rgba(0,0,0,.05)', border: '1px dashed ' + muted, borderRadius: 2 }} />;
    case 'spacer':
      return <div style={{ height: Math.min((block as any).height / 3, 8) }} />;
    case 'shape':
      return <div style={{ height: 6, width: '100%', background: (block as any).fillColor === 'brand_primary' ? accent : (block as any).fillColor, borderRadius: 1 }} />;
    case 'icon':
      return <div style={{ height: 5, width: 5, borderRadius: '50%', alignSelf: 'center', background: accent }} />;
    case 'stamp':
      return <div style={{ height: 14, width: 14, borderRadius: '50%', alignSelf: 'center', border: '1.5px solid ' + ((block as any).color || accent), margin: '2px 0' }} />;
    case 'border_frame':
      return null; // rendered as overlay below
    default:
      return <div style={{ height: 3, width: '50%', background: muted, opacity: 0.4 }} />;
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
  return maxBottom + 2;
}
