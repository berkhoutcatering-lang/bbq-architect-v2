'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Sparkles, RefreshCw, ChevronDown, ChevronUp, MessageSquareText } from 'lucide-react';
import type { BriefingCandidate } from '@/lib/today-briefing-rules';

export interface AiBriefingBullet {
  id: string;
  text: string;
  priority: 'critical' | 'today' | 'opportunity';
  href: string;
}

interface Props {
  candidates: BriefingCandidate[];
  firstName?: string;
  onOpenAssistant?: (bullets: AiBriefingBullet[]) => void;
}

const CACHE_KEY = 'bbq.today-briefing.v1';
const COLLAPSE_KEY = 'bbq.today-briefing.collapsed.v1';
const CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4 uur

function loadCache(): { bullets: AiBriefingBullet[]; generatedAt: string; hash: string } | null {
  try {
    const raw = typeof window !== 'undefined' ? window.localStorage.getItem(CACHE_KEY) : null;
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.bullets || !parsed?.generatedAt) return null;
    if (Date.now() - new Date(parsed.generatedAt).getTime() > CACHE_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveCache(bullets: AiBriefingBullet[], hash: string) {
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify({
      bullets,
      generatedAt: new Date().toISOString(),
      hash,
    }));
  } catch { /* ignore quota errors */ }
}

function hashCandidates(c: BriefingCandidate[]): string {
  /* Simpele content-hash — als data verandert, hash verandert, cache-miss. */
  return c.map(x => `${x.id}:${x.score}:${JSON.stringify(x.context)}`).join('|');
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diffMs / 60000);
  if (m < 1) return 'net bijgewerkt';
  if (m < 60) return `${m} min geleden`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} uur geleden`;
  return new Date(iso).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
}

function priorityColor(p: AiBriefingBullet['priority']): string {
  if (p === 'critical') return 'var(--red)';
  if (p === 'today') return 'var(--amber)';
  return 'var(--green)';
}

export default function AiBriefing({ candidates, firstName, onOpenAssistant }: Props) {
  const [bullets, setBullets] = useState<AiBriefingBullet[]>([]);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(COLLAPSE_KEY) === '1';
  });

  const currentHash = hashCandidates(candidates);

  const fetchBriefing = useCallback(async (force: boolean) => {
    if (candidates.length === 0) return;

    if (!force) {
      const cached = loadCache();
      if (cached && cached.hash === currentHash) {
        setBullets(cached.bullets);
        setGeneratedAt(cached.generatedAt);
        return;
      }
    }

    setLoading(true);
    try {
      const time = new Date().toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
      const r = await fetch('/api/today-briefing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidates, firstName, time }),
        cache: 'no-store',
      });
      const data = await r.json();
      if (Array.isArray(data?.bullets)) {
        setBullets(data.bullets);
        setGeneratedAt(data.generatedAt || new Date().toISOString());
        saveCache(data.bullets, currentHash);
      }
    } catch (e) {
      console.error('[AiBriefing] fetch failed', e);
      /* Fallback: gebruik candidate-fallbackText direct in de client. */
      const fb: AiBriefingBullet[] = candidates.slice(0, 5).map(c => ({
        id: c.id,
        text: c.fallbackText,
        priority: c.priority,
        href: c.href,
      }));
      setBullets(fb);
      setGeneratedAt(new Date().toISOString());
    } finally {
      setLoading(false);
    }
  }, [candidates, currentHash, firstName]);

  useEffect(() => {
    fetchBriefing(false);
  }, [fetchBriefing]);

  const toggleCollapse = () => {
    setCollapsed(prev => {
      const next = !prev;
      try {
        window.localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0');
      } catch { /* ignore */ }
      return next;
    });
  };

  if (candidates.length === 0 && bullets.length === 0) return null;

  const criticalCount = bullets.filter(b => b.priority === 'critical').length;

  return (
    <div
      style={{
        position: 'relative',
        marginBottom: 'var(--space-6)',
        padding: collapsed ? '10px 18px' : 'var(--space-5) var(--space-6)',
        borderRadius: 'var(--radius-xl)',
        background: 'linear-gradient(180deg, color-mix(in srgb, var(--brand) 5%, var(--card-solid)) 0%, var(--card-solid) 100%)',
        border: '1px solid var(--border)',
        borderTop: '1px solid var(--brand-tint-border)',
        transition: 'padding .2s ease',
      }}
    >
      {/* Header-rij */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            style={{
              width: 22,
              height: 22,
              borderRadius: '50%',
              background: 'var(--brand-tint)',
              border: '1px solid var(--brand-tint-border)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Sparkles size={11} style={{ color: 'var(--brand)' }} />
          </span>
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--text)',
              letterSpacing: '-.005em',
            }}
          >
            Architect-update
          </span>
          {collapsed && bullets.length > 0 ? (
            <span style={{ fontSize: 11, color: 'var(--muted)', letterSpacing: '.04em' }}>
              · {bullets.length} {bullets.length === 1 ? 'punt' : 'punten'}
              {criticalCount > 0 ? (
                <span style={{ color: 'var(--red)', marginLeft: 6 }}>· {criticalCount} urgent</span>
              ) : null}
            </span>
          ) : (
            <span style={{ fontSize: 11, color: 'var(--muted)', letterSpacing: '.04em' }}>
              · {loading ? 'denken…' : (generatedAt ? timeAgo(generatedAt) : 'klaar')}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button
            onClick={() => fetchBriefing(true)}
            disabled={loading}
            title="Vernieuw briefing"
            style={iconBtnStyle}
            aria-label="Vernieuwen"
          >
            <RefreshCw size={13} className={loading ? 'briefing-spin' : undefined} />
          </button>
          <button
            onClick={toggleCollapse}
            title={collapsed ? 'Uitklappen' : 'Inklappen'}
            style={iconBtnStyle}
            aria-label={collapsed ? 'Uitklappen' : 'Inklappen'}
          >
            {collapsed ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
          </button>
        </div>
      </div>

      {/* Bullets */}
      {!collapsed ? (
        <>
          {loading && bullets.length === 0 ? (
            <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <SkeletonRow w={70} />
              <SkeletonRow w={85} />
              <SkeletonRow w={60} />
            </div>
          ) : (
            <ul
              style={{
                margin: '14px 0 0 0',
                padding: 0,
                listStyle: 'none',
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}
            >
              {bullets.map((b) => (
                <BriefingRow key={b.id} bullet={b} />
              ))}
            </ul>
          )}

          {bullets.length > 0 && onOpenAssistant ? (
            <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => onOpenAssistant(bullets)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 12,
                  color: 'var(--brand)',
                  background: 'transparent',
                  border: 'none',
                  padding: '4px 6px',
                  cursor: 'pointer',
                  letterSpacing: '.02em',
                }}
              >
                <MessageSquareText size={12} /> Open assistent
              </button>
            </div>
          ) : null}
        </>
      ) : null}

      <style>{`
        @keyframes briefing-spin-anim { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .briefing-spin { animation: briefing-spin-anim .8s linear infinite; }
        @keyframes briefing-skel { 0% { background-position: 100% 0; } 100% { background-position: -100% 0; } }
        .briefing-skel {
          height: 12px;
          border-radius: var(--radius-sm);
          background: linear-gradient(90deg, var(--border) 0%, color-mix(in srgb, var(--border) 60%, var(--text)) 50%, var(--border) 100%);
          background-size: 200% 100%;
          animation: briefing-skel 1.4s ease-in-out infinite;
        }
        .briefing-row:hover { background: rgba(255,255,255,.04); }
      `}</style>
    </div>
  );
}

function BriefingRow({ bullet }: { bullet: AiBriefingBullet }) {
  const dotColor = priorityColor(bullet.priority);
  const inner = (
    <li
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        padding: '6px 8px',
        borderRadius: 'var(--radius-sm)',
        cursor: 'pointer',
        transition: 'background .12s',
      }}
      className="briefing-row"
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: dotColor,
          flexShrink: 0,
          marginTop: 7,
          boxShadow: `0 0 0 2px color-mix(in srgb, ${dotColor} 25%, transparent)`,
        }}
        aria-hidden="true"
      />
      <span
        style={{
          fontSize: 13.5,
          color: 'var(--text)',
          lineHeight: 1.4,
          flex: 1,
        }}
      >
        {bullet.text}
      </span>
    </li>
  );

  return (
    <Link
      href={bullet.href}
      style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}
    >
      {inner}
    </Link>
  );
}

function SkeletonRow({ w }: { w: number }) {
  return <div className="briefing-skel" style={{ width: `${w}%` }} />;
}

const iconBtnStyle: React.CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: 'var(--radius-md)',
  background: 'transparent',
  border: 'none',
  color: 'var(--muted)',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  transition: 'color .12s, background .12s',
};
