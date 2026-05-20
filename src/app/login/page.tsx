'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useSearchParams } from 'next/navigation';
import { Flame } from 'lucide-react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const searchParams = useSearchParams();
  const redirect = searchParams.get('redirect') || '/';

  // Mount-gated: voorkomt hydration-mismatch op de dev-only quick-login knop
  // (server rendert hem niet, client wel — pas tonen na hydration).
  useEffect(function () { setMounted(true); }, []);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setError('');
    setLoading(true);

    const { error: err } = await supabase.auth.signInWithPassword({ email, password });

    if (err) {
      setError(err.message === 'Invalid login credentials'
        ? 'Onjuiste email of wachtwoord'
        : err.message);
      setLoading(false);
      return;
    }

    window.location.href = redirect;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg)] px-4">
      <div className="w-full max-w-md">
        {/* Logo & Branding */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[var(--brand)] mb-4">
            <Flame size={24} className="text-[var(--bg)]" />
          </div>
          <h1 className="text-2xl font-bold text-[var(--text)]">BBQ Architect</h1>
          <p className="text-[var(--muted)] mt-1">Log in bij je account</p>
        </div>

        {/* Login Form */}
        <form onSubmit={handleLogin} className="space-y-4">
          <div
            className="rounded-2xl p-6 space-y-4"
            style={{
              background: 'var(--card)',
              border: '1px solid var(--border)',
              backdropFilter: 'blur(20px)',
            }}
          >
            {error && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="login-email" className="block text-sm font-medium text-[var(--muted)] mb-1.5">
                Email
              </label>
              <input
                id="login-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                value={email}
                onChange={function (e) { setEmail(e.target.value); }}
                required
                autoFocus
                className="w-full px-3 rounded-lg bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] placeholder-[var(--muted)] focus:border-[var(--brand)] focus:outline-none transition-colors"
                style={{ minHeight: 44, fontSize: 16 }}
                placeholder="jouw@email.nl"
              />
            </div>

            <div>
              <label htmlFor="login-password" className="block text-sm font-medium text-[var(--muted)] mb-1.5">
                Wachtwoord
              </label>
              <input
                id="login-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={function (e) { setPassword(e.target.value); }}
                required
                className="w-full px-3 rounded-lg bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] placeholder-[var(--muted)] focus:border-[var(--brand)] focus:outline-none transition-colors"
                style={{ minHeight: 44, fontSize: 16 }}
                placeholder="Je wachtwoord"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg font-semibold text-[var(--bg)] transition-all touch-manipulation"
              style={{
                background: loading ? 'var(--muted)' : 'var(--brand)',
                opacity: loading ? 0.7 : 1,
                minHeight: 48,
                padding: '12px 16px',
              }}
            >
              {loading ? 'Inloggen...' : 'Inloggen'}
            </button>
          </div>
        </form>

        <p className="text-center text-sm text-[var(--muted)] mt-6">
          Nog geen account?{' '}
          <a href="/pricing" className="text-[var(--brand)] hover:underline font-medium">
            Bekijk wat we bieden →
          </a>
        </p>

        {/* Dev quick login button — alleen zichtbaar als BOTH env-vars zijn gezet
            in .env.local (gitignored). Voorheen waren credentials hardcoded in
            de source — risico bij git-history dump of open-sourcen. Nu staat
            de email + password in lokale .env.local, NIET in de repo.

            Voor Sam: zet in .env.local:
              NEXT_PUBLIC_DEV_QUICK_EMAIL=jouw-test@email.nl
              NEXT_PUBLIC_DEV_QUICK_PASSWORD=jouw-test-wachtwoord
         */}
        {mounted
          && process.env.NODE_ENV === 'development'
          && process.env.NEXT_PUBLIC_DEV_QUICK_EMAIL
          && process.env.NEXT_PUBLIC_DEV_QUICK_PASSWORD && (
          <div style={{ marginTop: 24, padding: 16, borderRadius: 12, background: 'var(--card)', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
              Dev Quick Login
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <button
                type="button"
                onClick={function () {
                  setEmail(process.env.NEXT_PUBLIC_DEV_QUICK_EMAIL || '');
                  setPassword(process.env.NEXT_PUBLIC_DEV_QUICK_PASSWORD || '');
                }}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8, background: 'rgba(59,130,246,.08)', border: '1px solid rgba(59,130,246,.2)', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: 'var(--blue)', textAlign: 'left' }}
              >
                🔥 Dev quick-login
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
