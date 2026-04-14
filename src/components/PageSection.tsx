'use client';

import type { ReactNode } from 'react';

interface PageSectionProps {
  title?: string;
  children: ReactNode;
  className?: string;
}

export default function PageSection({ title, children, className }: PageSectionProps) {
  return (
    <section className={`page-section${className ? ` ${className}` : ''}`}>
      {title && <h2 className="page-section-title">{title}</h2>}
      {children}
    </section>
  );
}
