import type { ReactNode } from 'react';
import VoorraadHeader from '@/components/voorraad/VoorraadHeader';
import EmailInboxBanner from '@/components/email-inbox/EmailInboxBanner';

/* Email-inbox-banner verschijnt alleen als er mails wachten op verwerking
   (status=received|parsing van de laatste 7 dagen). Bij 0 → null = geen noise. */
export default function InkoopLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <VoorraadHeader />
      <div style={{ padding: '0 var(--space-mobile-edge)', maxWidth: 1600, margin: '0 auto' }}>
        <EmailInboxBanner />
      </div>
      {children}
    </>
  );
}
