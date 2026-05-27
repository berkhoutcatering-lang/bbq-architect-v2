'use client';

import { useState } from 'react';
import { Flame, Mail, ArrowRight } from 'lucide-react';
import { SignupForm } from './_components/SignupForm';

type Tab = 'self-serve' | 'demo';

export default function SignupPage() {
  const [tab, setTab] = useState<Tab>('self-serve');

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg)] px-4 py-8">
      <div className="w-full max-w-md">
        {/* Logo + titel */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[var(--brand)] mb-4">
            <Flame size={24} className="text-[var(--bg)]" />
          </div>
          <h1 className="text-2xl font-bold text-[var(--text)]">BBQ Architect</h1>
          <p className="text-[var(--muted)] mt-1">Start je catering-SaaS</p>
        </div>

        {/* Tabs */}
        <div
          role="tablist"
          aria-label="Aanmeld-methode"
          className="grid grid-cols-2 gap-1 mb-4 rounded-lg p-1"
          style={{ background: 'var(--color-bg-deep)', border: '1px solid var(--card-solid)' }}
        >
          <TabButton active={tab === 'self-serve'} onClick={() => setTab('self-serve')}>
            Start direct
          </TabButton>
          <TabButton active={tab === 'demo'} onClick={() => setTab('demo')}>
            Plan een demo
          </TabButton>
        </div>

        {/* Card */}
        <div
          className="rounded-2xl p-6"
          style={{
            background: 'var(--card)',
            border: '1px solid var(--border)',
            backdropFilter: 'blur(20px)',
          }}
        >
          {tab === 'self-serve' ? <SignupForm /> : <DemoCard />}
        </div>

        {/* Footer */}
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

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className="px-3 py-2 rounded-md text-[12px] font-bold transition-colors"
      style={{
        background: active ? 'var(--card)' : 'transparent',
        color: active ? 'var(--text)' : 'var(--muted)',
        border: active ? '1px solid var(--card-solid)' : '1px solid transparent',
      }}
    >
      {children}
    </button>
  );
}

function DemoCard() {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-[14px] text-[var(--text)] leading-relaxed">
        Liever eerst rondgeleid worden? In 20 minuten richten we het samen in voor jouw bedrijf.
      </p>
      <p className="text-[13px] text-[var(--muted)] leading-relaxed">
        Stuur een mailtje en we plannen meteen een kennismaking in.
      </p>

      <a
        href="mailto:berkhout.catering@gmail.com?subject=Demo BBQ Architect"
        className="flex items-center justify-center gap-2 w-full rounded-lg font-semibold text-[var(--bg)] touch-manipulation"
        style={{ background: 'var(--brand)', minHeight: 48, padding: '12px 16px' }}
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
  );
}
