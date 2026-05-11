import type { ReactNode } from 'react';
import VoorraadHeader from '@/components/voorraad/VoorraadHeader';

export default function LeveranciersLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <VoorraadHeader />
      {children}
    </>
  );
}
