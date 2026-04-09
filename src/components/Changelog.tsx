'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, Sparkles, Wrench, Bug, AlertTriangle, Bell } from 'lucide-react';
import type { ChangelogEntry } from '@/types/database.types';

const CATEGORY_CONFIG: Record<string, { icon: typeof Sparkles; color: string; label: string }> = {
  feature: { icon: Sparkles, color: '#8b5cf6', label: 'Nieuw' },
  improvement: { icon: Wrench, color: '#3b82f6', label: 'Verbeterd' },
  fix: { icon: Bug, color: '#22c55e', label: 'Fix' },
  breaking: { icon: AlertTriangle, color: '#ef4444', label: 'Breaking' },
};

export default function Changelog() {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<ChangelogEntry[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [lastReadAt, setLastReadAt] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const fetchChangelog = useCallback(function () {
    fetch('/api/changelog')
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data.entries) {
          setEntries(data.entries);
          setUnreadCount(data.unreadCount || 0);
          setLastReadAt(data.lastReadAt || null);
        }
        setLoaded(true);
      })
      .catch(function () { setLoaded(true); });
  }, []);

  useEffect(function () { fetchChangelog(); }, [fetchChangelog]);

  function handleOpen() {
    setOpen(true);
    // Mark as read
    if (unreadCount > 0) {
      fetch('/api/changelog', { method: 'POST' })
        .then(function () {
          setUnreadCount(0);
          setLastReadAt(new Date().toISOString());
        });
    }
  }

  function formatDate(d: string) {
    return new Date(d).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  if (!loaded) return null;

  return (
    <>
      {/* Bell button */}
      <button
        onClick={handleOpen}
        style={{
          position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 32, height: 32, borderRadius: 8, background: 'none', border: 'none',
          cursor: 'pointer', color: 'var(--muted)',
        }}
        title="Wat is nieuw"
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute', top: 2, right: 2,
            width: 16, height: 16, borderRadius: '50%',
            background: '#ef4444', color: '#fff',
            fontSize: 9, fontWeight: 800,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '2px solid var(--card)',
          }}>
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Modal overlay */}
      {open && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          {/* Backdrop */}
          <div
            onClick={function () { setOpen(false); }}
            style={{
              position: 'absolute', inset: 0,
              background: 'rgba(0,0,0,.5)', backdropFilter: 'blur(4px)',
            }}
          />

          {/* Modal */}
          <div style={{
            position: 'relative', width: '100%', maxWidth: 520,
            maxHeight: '80vh', margin: 16,
            background: 'var(--card)', borderRadius: 16,
            border: '1px solid var(--border)',
            boxShadow: '0 20px 60px rgba(0,0,0,.3)',
            display: 'flex', flexDirection: 'column',
            overflow: 'hidden',
          }}>
            {/* Header */}
            <div style={{
              padding: '20px 24px 16px',
              borderBottom: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', lineHeight: 1.2 }}>
                  Wat is nieuw
                </h2>
                <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                  Laatste updates en verbeteringen
                </p>
              </div>
              <button
                onClick={function () { setOpen(false); }}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: 32, height: 32, borderRadius: 8,
                  background: 'var(--bg)', border: '1px solid var(--border)',
                  cursor: 'pointer', color: 'var(--muted)',
                }}
              >
                <X size={16} />
              </button>
            </div>

            {/* Entries */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px 24px' }}>
              {entries.length === 0 && (
                <div style={{ textAlign: 'center', padding: 32, color: 'var(--muted)', fontSize: 14 }}>
                  Geen updates gevonden
                </div>
              )}

              {entries.map(function (entry) {
                const config = CATEGORY_CONFIG[entry.category] || CATEGORY_CONFIG.feature;
                const Icon = config.icon;
                const isNew = lastReadAt ? new Date(entry.published_at) > new Date(lastReadAt) : true;

                return (
                  <div
                    key={entry.id}
                    style={{
                      padding: '14px 16px',
                      borderRadius: 12,
                      background: isNew ? 'rgba(139,92,246,.04)' : 'transparent',
                      border: '1px solid ' + (isNew ? 'rgba(139,92,246,.12)' : 'var(--border)'),
                      marginBottom: 10,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                      <div style={{
                        width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                        background: config.color + '18',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        marginTop: 1,
                      }}>
                        <Icon size={14} style={{ color: config.color }} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
                            {entry.title}
                          </span>
                          <span style={{
                            fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 4,
                            background: config.color + '18', color: config.color,
                            textTransform: 'uppercase', letterSpacing: '0.05em',
                          }}>
                            {config.label}
                          </span>
                        </div>
                        <p style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5, margin: 0 }}>
                          {entry.description}
                        </p>
                        <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 6, opacity: 0.7 }}>
                          v{entry.version} &middot; {formatDate(entry.published_at)}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
