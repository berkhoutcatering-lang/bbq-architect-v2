'use client';

import React from 'react';
import Link from 'next/link';
import {
  AlertTriangle, MailWarning, Receipt, FileText, Flame, ClipboardList, ShoppingCart,
  MailCheck, ShieldCheck, CalendarCheck, ChefHat, Filter, BarChart3, ArrowRight, Clock,
  type LucideIcon,
} from 'lucide-react';
import {
  groupTimelineItems,
  type BriefingTimelineItem,
  type BriefingTimelineWhen,
  type BriefingTimelineTone,
} from '@/lib/today/timeline-items';

const ICON_MAP: Record<string, LucideIcon> = {
  'alert-triangle': AlertTriangle,
  'mail-warning': MailWarning,
  receipt: Receipt,
  'file-text': FileText,
  flame: Flame,
  'clipboard-list': ClipboardList,
  'shopping-cart': ShoppingCart,
  'mail-check': MailCheck,
  'shield-check': ShieldCheck,
  'calendar-check': CalendarCheck,
  'chef-hat': ChefHat,
  'bar-chart-3': BarChart3,
};

const TONE: Record<BriefingTimelineTone, { bg: string; border: string; text: string; accent: string }> = {
  amber: { bg: 'rgba(217, 119, 6, 0.08)', border: 'rgba(217, 119, 6, 0.3)', text: 'var(--brand)', accent: '#fbbf24' },
  red: { bg: 'rgba(239, 68, 68, 0.08)', border: 'rgba(239, 68, 68, 0.3)', text: 'var(--red)', accent: 'var(--red)' },
  green: { bg: 'rgba(34, 197, 94, 0.08)', border: 'rgba(34, 197, 94, 0.3)', text: '#86efac', accent: '#22c55e' },
  blue: { bg: 'rgba(59, 130, 246, 0.08)', border: 'rgba(59, 130, 246, 0.3)', text: '#93c5fd', accent: '#3b82f6' },
  gray: { bg: 'rgba(255,255,255,.03)', border: 'var(--border)', text: 'var(--text)', accent: 'var(--muted)' },
};

const COLUMN_DOT_COLOR: Record<BriefingTimelineWhen, string> = {
  Vandaag: 'var(--red)',
  Morgen: '#f59e0b',
  'Deze week': '#3b82f6',
  'Komende maand': '#94a3b8',
};

const COLUMN_ORDER: BriefingTimelineWhen[] = ['Vandaag', 'Morgen', 'Deze week', 'Komende maand'];

interface Props {
  items: BriefingTimelineItem[];
}

export default function BriefingTimeline({ items }: Props): React.ReactElement | null {
  if (items.length === 0) return null;
  const grouped = groupTimelineItems(items);

  return (
    <div
      className="smoke-card"
      style={{
        padding: '20px 24px 24px',
        marginBottom: 18,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 16,
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 10,
              letterSpacing: '.2em',
              textTransform: 'uppercase',
              color: 'var(--muted)',
              fontWeight: 700,
              marginBottom: 4,
            }}
          >
            SHIFT-BRIEFING
          </div>
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 22,
              fontWeight: 300,
              letterSpacing: '-.01em',
            }}
          >
            Wat moet er gebeuren?
          </div>
        </div>
        <div
          style={{
            display: 'flex',
            gap: 8,
            alignItems: 'center',
            fontSize: 11,
            color: 'var(--muted)',
            flexShrink: 0,
            whiteSpace: 'nowrap',
          }}
        >
          <Filter size={12} />
          <span>Sorteer op urgentie</span>
        </div>
      </div>

      <div className="briefing-timeline-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
        {COLUMN_ORDER.map((col) => {
          const colItems = grouped[col];
          return (
            <div
              key={col}
              style={{
                background: 'rgba(255,255,255,.015)',
                border: '1px solid var(--border)',
                borderRadius: 12,
                padding: 14,
                minHeight: 200,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 12,
                  paddingBottom: 10,
                  borderBottom: '1px solid var(--border)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: 3,
                      background: COLUMN_DOT_COLOR[col],
                      boxShadow: col === 'Vandaag' ? `0 0 8px ${COLUMN_DOT_COLOR[col]}` : 'none',
                    }}
                  />
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>{col}</div>
                </div>
                <div
                  style={{
                    fontSize: 10,
                    color: 'var(--muted)',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {colItems.length}
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {colItems.length === 0 ? (
                  <div
                    style={{
                      fontSize: 11,
                      color: 'var(--muted-light)',
                      fontStyle: 'italic',
                      textAlign: 'center',
                      padding: '20px 0',
                    }}
                  >
                    Geen taken
                  </div>
                ) : (
                  colItems.map((item) => {
                    const tone = TONE[item.tone];
                    const Icon = ICON_MAP[item.icon] || Clock;
                    return (
                      <Link
                        key={item.id}
                        href={item.href}
                        style={{ textDecoration: 'none', color: 'inherit' }}
                      >
                        <div
                          style={{
                            background: tone.bg,
                            border: `1px solid ${tone.border}`,
                            borderRadius: 10,
                            padding: '10px 12px',
                            cursor: 'pointer',
                            transition: 'transform .15s, border-color .15s',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.transform = 'translateY(-1px)';
                            e.currentTarget.style.borderColor = tone.accent;
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.transform = '';
                            e.currentTarget.style.borderColor = tone.border;
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                            <div
                              style={{
                                width: 26,
                                height: 26,
                                borderRadius: 8,
                                background: 'rgba(0,0,0,.3)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0,
                                color: tone.accent,
                              }}
                            >
                              <Icon size={13} />
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              {item.aiTag ? (
                                <div style={{ marginBottom: 4 }}>
                                  <span
                                    style={{
                                      fontSize: 8,
                                      letterSpacing: '.1em',
                                      padding: '2px 5px',
                                      borderRadius: 4,
                                      background: 'rgba(255,191,0,.15)',
                                      color: 'var(--brand)',
                                      fontWeight: 700,
                                    }}
                                  >
                                    AI
                                  </span>
                                </div>
                              ) : null}
                              <div
                                style={{
                                  fontSize: 12,
                                  fontWeight: 600,
                                  color: 'var(--text)',
                                  lineHeight: 1.3,
                                  marginBottom: 4,
                                  overflowWrap: 'anywhere',
                                }}
                              >
                                {item.title}
                              </div>
                              <div
                                style={{
                                  fontSize: 11,
                                  color: 'var(--muted)',
                                  lineHeight: 1.4,
                                  marginBottom: 8,
                                  overflowWrap: 'anywhere',
                                }}
                              >
                                {item.body}
                              </div>
                              <div
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  fontSize: 10,
                                  color: 'var(--muted-light)',
                                  gap: 6,
                                  flexWrap: 'wrap',
                                }}
                              >
                                <span
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 4,
                                    flexShrink: 0,
                                  }}
                                >
                                  <Clock size={10} /> {item.duration}
                                </span>
                                <span
                                  style={{
                                    color: tone.text,
                                    fontWeight: 600,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 3,
                                    flexShrink: 0,
                                  }}
                                >
                                  {item.action} <ArrowRight size={10} />
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </Link>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>

      <style>{`
        @media (max-width: 1024px) {
          .briefing-timeline-grid { grid-template-columns: repeat(2, 1fr) !important; }
        }
        @media (max-width: 600px) {
          .briefing-timeline-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
