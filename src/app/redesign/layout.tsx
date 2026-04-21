import type { ReactNode } from 'react';
import './redesign.css';

export const metadata = {
  title: 'BBQ Architect — UX Redesign',
};

export default function RedesignLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Outfit:wght@200;300;400;500;600;700&family=Playfair+Display:ital,wght@0,400;0,600;0,700;1,400&display=swap"
      />
      <div className="redesign-root">{children}</div>
    </>
  );
}
