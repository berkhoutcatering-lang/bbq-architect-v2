'use client';

import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
}

export default function PageHeader({ title, description, actions }: PageHeaderProps) {
  /* Zelfde klassen als HubHeader, zodat de zeventien pagina's die dit
     component al gebruikten in één keer dezelfde kop kregen als de rest.
     De oude .page-header zette 22px/700 waar het chassis 28px/200 zet. */
  return (
    <div className="page-header chassis-hubheader">
      <div className="chassis-hubheader-rij">
        <div style={{ minWidth: 0 }}>
          <h1 className="chassis-titel">{title}</h1>
          {description && <p className="page-desc chassis-onderschrift">{description}</p>}
        </div>
        {actions && <div className="page-actions chassis-acties">{actions}</div>}
      </div>
    </div>
  );
}
