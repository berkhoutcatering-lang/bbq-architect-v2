'use client';

import { Flame, Mail, ArrowRight } from 'lucide-react';

export default function SignupPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg)] px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[var(--brand)] mb-4">
            <Flame size={24} className="text-[var(--bg)]" />
          </div>
          <h1 className="text-2xl font-bold text-[var(--text)]">BBQ Architect</h1>
          <p className="text-[var(--muted)] mt-1">Aanmelden op uitnodiging</p>
        </div>

        <div
          className="rounded-2xl p-6 space-y-5"
          style={{
            background: 'var(--card)',
            border: '1px solid var(--border)',
            backdropFilter: 'blur(20px)',
          }}
        >
          <p className="text-[14px] text-[var(--text)] leading-relaxed">
            Accounts worden momenteel persoonlijk aangemaakt. Zo kunnen we je bedrijf goed inrichten
            en je een demo van 20 minuten geven.
          </p>
          <p className="text-[13px] text-[var(--muted)] leading-relaxed">
            Stuur een mailtje en we plannen meteen een kennismaking in.
          </p>

          <a
            href="mailto:berkhout.catering@gmail.com?subject=Demo BBQ Architect"
            className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg font-semibold text-[var(--bg)]"
            style={{ background: 'var(--brand)' }}
          >
            <Mail size={16} />
            Plan een demo
            <ArrowRight size={16} />
          </a>

          <a
            href="/pricing"
            className="block text-center text-[12px] text-[var(--muted)] hover:text-[var(--text)]"
          >
            Bekijk eerst wat we bieden →
          </a>
        </div>

        <p className="text-center text-sm text-[var(--muted)] mt-6">
          Al een account?{' '}
          <a href="/login" className="text-[var(--brand)] hover:underline font-medium">
            Inloggen
          </a>
        </p>
      </div>
    </div>
  );
}
