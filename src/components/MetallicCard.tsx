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
        bg-gradient-to-br from-[#111113] to-[#0c0c0e]
        border border-[#1e1e22]
        ${hover ? 'hover:border-[#2a2a30] hover:shadow-lg hover:shadow-black/20 transition-all duration-500 cursor-pointer' : ''}
        ${className}
      `}
    >
      <div
        className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent to-transparent"
        style={{ '--tw-gradient-via': accent || '#333338' } as React.CSSProperties}
      />
      {!accent && <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#333338] to-transparent" />}
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
