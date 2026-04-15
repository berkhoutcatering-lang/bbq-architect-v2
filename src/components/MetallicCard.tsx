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
        border border-[var(--card-solid)]
        ${hover ? 'hover:border-[var(--color-border-hover)] hover:shadow-lg hover:shadow-black/20 transition-all duration-500 cursor-pointer' : ''}
        ${className}
      `}
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
