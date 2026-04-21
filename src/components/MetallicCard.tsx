'use client';
import React from 'react';

interface MetallicCardProps {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
  onClick?: () => void;
  accent?: string;
}

export default function MetallicCard({ children, className = '', hover = true, onClick, accent }: MetallicCardProps) {
  return (
    <div
      onClick={onClick}
      className={`
        relative rounded-2xl overflow-hidden
        bg-gradient-to-br from-[var(--color-bg-card)] to-[var(--color-bg-darker)]
        ${hover ? 'hover:shadow-xl transition-all duration-300 cursor-pointer' : ''}
        ${className}
      `}
      style={{
        border: '1px solid color-mix(in srgb, var(--brand-primary) 22%, transparent)',
        boxShadow: '0 2px 8px rgba(0,0,0,.25), 0 0 0 1px color-mix(in srgb, var(--brand-primary) 5%, transparent)',
      }}
    >
      <div
        className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent to-transparent"
        style={{ '--tw-gradient-via': accent || 'var(--color-text-ghost)' } as React.CSSProperties}
      />
      {!accent && <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[var(--color-text-ghost)] to-transparent" />}
      {accent && (
        <div
          className="absolute inset-x-0 top-0 h-px"
          style={{ background: `linear-gradient(to right, transparent, ${accent}, transparent)` }}
        />
      )}
      {children}
    </div>
  );
}
