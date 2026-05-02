'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { ChevronRight, Check } from 'lucide-react';
import type { BriefingCandidate } from '@/lib/today-briefing-rules';

export interface CompactBullet {
  id: string;
  label: 'Nu' | 'Vandaag' | 'Risico' | 'Morgen' | 'Daarna';
  text: string;
  priority: 'critical' | 'today' | 'opportunity';
  href: string;
}

interface Props {
  candidates: BriefingCandidate[];
  firstName?: string;
  visibleCount?: number;
}

const CACHE_KEY = 'bbq.today-briefing.v1';
const CACHE_TTL_MS = 4 * 60 * 60 * 1000;

function loadCache(): { bullets: CompactBullet[]; generatedAt: string; hash: string } | null {
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

function saveCache(bullets: CompactBullet[], hash: string) {
  try {
    window.localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ bullets, generatedAt: new Date().toISOString(), hash }),
    );
  } catch { /* ignore */ }
}

function hashCandidates(c: BriefingCandidate[]): string {
  return c.map((x) => `${x.id}:${x.score}:${JSON.stringify(x.context)}`).join('|');
}

const PRIORITY_DOT: Record<CompactBullet['priority'], { color: string; glow: string }> = {
  critical: { color: 'var(--red)', glow: 'rgba(239,68,68,.55)' },
  today: { color: '#f59e0b', glow: 'rgba(245,158,11,.45)' },
  opportunity: { color: '#22c55e', glow: 'rgba(34,197,94,.45)' },
};

export default function CompactDagbriefing({
  candidates,
  firstName,
  visibleCount = 4,
}: Props): React.ReactElement | null {
  const [bullets, setBullets] = useState<CompactBullet[]>([]);
  const [loading, setLoading] = useState(false);
  const currentHash = hashCandidates(candidates);

  const fetchBriefing = useCallback(
    async (force: boolean) => {
      if (candidates.length === 0) {
        setBullets([]);
        return;
      }
      if (!force) {
        const cached = loadCache();
        if (cached && cached.hash === currentHash) {
          setBullets(cached.bullets);
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
          saveCache(data.bullets, currentHash);
        }
      } catch {
        const fb: CompactBullet[] = candidates.slice(0, 5).map((c) => ({
          id: c.id,
          label: c.defaultLabel,
          text: c.fallbackText,
          priority: c.priority,
          href: c.href,
        }));
        setBullets(fb);
      } finally {
        setLoading(false);
      }
    },
    [candidates, currentHash, firstName],
  );

  useEffect(() => { fetchBriefing(false); }, [fetchBriefing]);

  const allClear = candidates.length === 0 && bullets.length === 0;

  const sorted = [...bullets].sort((a, b) => {
    const order = { critical: 0, today: 1, opportunity: 2 };
    return order[a.priority] - order[b.priority];
  });
  const visible = sorted.slice(0, visibleCount);
  const overflow = sorted.length - visible.length;
  const updateTime = new Date().toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });

  return (
    <div
      className="smoke-card"
      style={{
        padding: '16px 18px',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span
          style={{
            width: 5,
            height: 5,
            borderRadius: 3,
            background: '#22c55e',
            boxShadow: '0 0 6px rgba(34,197,94,.7)',
          }}
        />
        <span
          style={{
            fontSize: 10,
            letterSpacing: '.2em',
            textTransform: 'uppercase',
            fontWeight: 700,
            color: 'var(--brand)',
          }}
        >
          AI DAGBRIEFING
        </span>
        <span
          style={{
            fontSize: 10,
            color: 'var(--muted)',
            marginLeft: 'auto',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {loading ? 'denkt…' : updateTime}
        </span>
      </div>

      {loading && bullets.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10,
                padding: '8px 4px',
                borderTop: '1px solid var(--border)',
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 3,
                  background: 'rgba(255,255,255,.08)',
                  marginTop: 7,
                  flexShrink: 0,
                }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    width: 50,
                    height: 9,
                    borderRadius: 3,
                    background: 'rgba(255,255,255,.05)',
                    marginBottom: 6,
                  }}
                />
                <div
                  style={{
                    width: `${85 - i * 8}%`,
                    height: 11,
                    borderRadius: 3,
                    background: 'rgba(255,255,255,.07)',
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      ) : allClear ? (
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px 0',
            gap: 10,
          }}
        >
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              background: 'rgba(34,197,94,.1)',
              border: '1px solid rgba(34,197,94,.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#86efac',
            }}
          >
            <Check size={20} />
          </div>
          <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 600 }}>Alles op koers</div>
          <div style={{ fontSize: 11, color: 'var(--muted)' }}>Geen risico&apos;s of wachtende acties.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
          {visible.map((item) => {
            const sev = PRIORITY_DOT[item.priority];
            return (
              <Link
                key={item.id}
                href={item.href}
                style={{ textDecoration: 'none', color: 'inherit' }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 10,
                    padding: '8px 4px',
                    cursor: 'pointer',
                    borderTop: '1px solid var(--border)',
                    transition: 'background .15s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(255,255,255,.02)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: 3,
                      background: sev.color,
                      boxShadow: `0 0 6px ${sev.glow}`,
                      marginTop: 7,
                      flexShrink: 0,
                    }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        letterSpacing: '.12em',
                        textTransform: 'uppercase',
                        color: sev.color,
                        marginBottom: 2,
                        lineHeight: 1,
                      }}
                    >
                      {item.label}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 500,
                        color: 'var(--text)',
                        lineHeight: 1.35,
                      }}
                    >
                      {item.text}
                    </div>
                  </div>
                  <ChevronRight size={12} color="var(--muted-light)" style={{ flexShrink: 0 }} />
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {overflow > 0 && (
        <div
          style={{
            marginTop: 10,
            paddingTop: 10,
            borderTop: '1px solid var(--border)',
            fontSize: 10,
            color: 'var(--muted)',
            textAlign: 'center',
            letterSpacing: '.1em',
            textTransform: 'uppercase',
            fontWeight: 600,
          }}
        >
          +{overflow} meer in shift-briefing onder
        </div>
      )}
    </div>
  );
}
