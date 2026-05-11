import type { ReactNode } from 'react';
import VoorraadHeader from '@/components/voorraad/VoorraadHeader';

export default function InkoopLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <VoorraadHeader />
      {children}
    </>
  );
}
