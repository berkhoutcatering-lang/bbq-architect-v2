'use client';

import Link from 'next/link';
import { BookmarkCheck, ArrowUpRight } from 'lucide-react';
import type { Concept } from './types';

interface Props {
  saved: Concept[];
  onClear: () => void;
}

export default function SavedTray({ saved, onClear }: Props) {
  if (!saved.length) return null;
  return (
    <div
      style={{
        position: 'fixed',
        bottom: 18,
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'rgba(20,20,24,.92)',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(196,163,90,.3)',
        borderRadius: 14,
        padding: '10px 14px',
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        boxShadow: '0 12px 40px rgba(0,0,0,.6)',
        zIndex: 100,
        animation: 'bedenker-fadeup .3s ease',
        maxWidth: 'calc(100vw - 32px)',
        flexWrap: 'wrap',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: 8,
            background: 'rgba(167,139,250,.18)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#c4b5fd',
          }}
        >
          <BookmarkCheck size={14} />
        </div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600 }}>
            {saved.length} concept{saved.length > 1 ? 'en' : ''} bewaard
          </div>
          <div style={{ fontSize: 10, color: 'var(--muted)' }}>klaar om te activeren in /gerechten</div>
        </div>
      </div>
      <div style={{ width: 1, height: 24, background: 'var(--border)' }} />
      <div style={{ display: 'flex', gap: 6 }}>
        {saved.slice(0, 6).map((c) => (
          <span key={c.id} title={c.name} style={{ fontSize: 18 }}>
            {c.glyph}
          </span>
        ))}
        {saved.length > 6 && (
          <span style={{ fontSize: 11, color: 'var(--muted)', alignSelf: 'center' }}>+{saved.length - 6}</span>
        )}
      </div>
      <div style={{ width: 1, height: 24, background: 'var(--border)' }} />
      <button
        onClick={onClear}
        style={{
          background: 'transparent',
          border: 'none',
          color: 'var(--muted)',
          fontSize: 11,
          cursor: 'pointer',
          padding: '4px 8px',
          fontFamily: 'inherit',
        }}
      >
        Wissen
      </button>
      <Link
        href="/gerechten?status=concept"
        className="btn btn-brand btn-sm"
        style={{
          textDecoration: 'none',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        Bekijk in /gerechten <ArrowUpRight size={12} />
      </Link>
      <style jsx>{`
        @keyframes bedenker-fadeup {
          from {
            opacity: 0;
            transform: translate(-50%, 8px);
          }
          to {
            opacity: 1;
            transform: translate(-50%, 0);
          }
        }
      `}</style>
    </div>
  );
}
