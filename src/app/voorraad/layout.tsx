import type { ReactNode } from 'react';
import VoorraadHeader from '@/components/voorraad/VoorraadHeader';

export default function VoorraadLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <VoorraadHeader />
      {children}
    </>
  );
}
