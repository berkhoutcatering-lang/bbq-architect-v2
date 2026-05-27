'use client';

import { Check, Mail } from 'lucide-react';

export function MagicLinkSentCard({ email }: { email: string }) {
  return (
    <div className="flex flex-col items-center gap-4 text-center" role="status" aria-live="polite">
      <div
        className="w-14 h-14 rounded-full flex items-center justify-center"
        style={{
          background: 'rgba(34,197,94,.12)',
          border: '1px solid rgba(34,197,94,.35)',
        }}
      >
        <Check className="w-6 h-6" style={{ color: '#86efac' }} />
      </div>

      <div>
        <h2 className="text-[18px] font-bold text-[var(--text)] mb-1">Check je mail</h2>
        <p className="text-[13px] text-[var(--muted)] leading-relaxed">
          We hebben een magic-link gestuurd naar
        </p>
        <p
          className="mt-1 inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-[13px] font-bold text-[var(--text)]"
          style={{ background: 'var(--color-bg-deep)', border: '1px solid var(--card-solid)' }}
        >
          <Mail className="w-3.5 h-3.5" style={{ color: 'var(--color-accent-gold)' }} />
          {email}
        </p>
      </div>

      <div
        className="rounded-lg p-4 text-left w-full"
        style={{ background: 'var(--color-bg-deep)', border: '1px solid var(--card-solid)' }}
      >
        <p className="text-[12px] text-[var(--muted)] leading-relaxed">
          Klik de link binnen <span className="text-[var(--text)] font-medium">15 minuten</span> om
          je account te bevestigen. Daarna landt je direct in de onboarding-flow.
        </p>
      </div>

      <p className="text-[11px] text-[var(--muted)]">
        Geen mail ontvangen? Check je spam-folder of{' '}
        <a href="/signup" className="text-[var(--color-accent-gold)] hover:underline">
          probeer opnieuw
        </a>
        .
      </p>
    </div>
  );
}
