'use client';

// Sprint 2-deel-2 — sticky preview-pane met 4 tabs.
// Custom Tabs (geen Radix dep) — keyboard nav (Left/Right/Home/End),
// ARIA role=tablist/tab/tabpanel.

import { useCallback, useState, type KeyboardEvent } from 'react';
import type { ThemePreset } from '@/lib/branding';
import { PreviewApp } from './preview/PreviewApp';
import { PreviewPortal } from './preview/PreviewPortal';
import { PreviewPDF } from './preview/PreviewPDF';
import { PreviewMobile } from './preview/PreviewMobile';

interface Props {
  preset: ThemePreset;
}

const TABS = [
  { id: 'app', label: 'App', Component: PreviewApp },
  { id: 'portal', label: 'Klantportaal', Component: PreviewPortal },
  { id: 'pdf', label: 'PDF', Component: PreviewPDF },
  { id: 'mobile', label: 'Mobile', Component: PreviewMobile },
] as const;

type TabId = typeof TABS[number]['id'];

export function ThemePreviewTabs({ preset }: Props) {
  const [activeTab, setActiveTab] = useState<TabId>('app');

  const onKeyDown = useCallback((e: KeyboardEvent<HTMLDivElement>) => {
    const idx = TABS.findIndex(t => t.id === activeTab);
    let next = idx;
    switch (e.key) {
      case 'ArrowRight': next = (idx + 1) % TABS.length; break;
      case 'ArrowLeft': next = (idx - 1 + TABS.length) % TABS.length; break;
      case 'Home': next = 0; break;
      case 'End': next = TABS.length - 1; break;
      default: return;
    }
    e.preventDefault();
    setActiveTab(TABS[next].id);
  }, [activeTab]);

  const ActiveComponent = TABS.find(t => t.id === activeTab)!.Component;

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {/* Tablist */}
      <div
        role="tablist"
        aria-label="Theme preview-modi"
        onKeyDown={onKeyDown}
        style={{
          display: 'flex',
          gap: 2,
          padding: 4,
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: 10,
        }}
      >
        {TABS.map(tab => {
          const isActive = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              role="tab"
              type="button"
              aria-selected={isActive}
              aria-controls={`tabpanel-${tab.id}`}
              id={`tab-${tab.id}`}
              tabIndex={isActive ? 0 : -1}
              onClick={() => setActiveTab(tab.id)}
              style={{
                flex: 1,
                padding: '8px 12px',
                borderRadius: 7,
                border: 'none',
                background: isActive ? 'var(--bg)' : 'transparent',
                color: isActive ? 'var(--text)' : 'var(--muted)',
                fontWeight: isActive ? 700 : 500,
                fontSize: 12,
                cursor: 'pointer',
                transition: 'background .1s, color .1s',
                boxShadow: isActive ? '0 1px 2px rgba(0,0,0,.06)' : 'none',
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Active panel */}
      <div
        id={`tabpanel-${activeTab}`}
        role="tabpanel"
        aria-labelledby={`tab-${activeTab}`}
      >
        <ActiveComponent preset={preset} />
      </div>
    </div>
  );
}
