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
              <label className="block text-sm font-medium text-[var(--muted)] mb-1.5">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={function (e) { setEmail(e.target.value); }}
                required
                autoFocus
                className="w-full px-3 py-2.5 rounded-lg bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] placeholder-[var(--muted)] focus:border-[var(--brand)] focus:outline-none transition-colors"
                placeholder="jouw@email.nl"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--muted)] mb-1.5">
                Wachtwoord
              </label>
              <input
                type="password"
                value={password}
                onChange={function (e) { setPassword(e.target.value); }}
                required
                className="w-full px-3 py-2.5 rounded-lg bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] placeholder-[var(--muted)] focus:border-[var(--brand)] focus:outline-none transition-colors"
                placeholder="Je wachtwoord"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-lg font-semibold text-[var(--bg)] transition-all"
              style={{
                background: loading ? 'var(--muted)' : 'var(--brand)',
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? 'Inloggen...' : 'Inloggen'}
            </button>
          </div>
        </form>

        <p className="text-center text-sm text-[var(--muted)] mt-6">
          Nog geen account?{' '}
          <a href="/signup" className="text-[var(--brand)] hover:underline font-medium">
            Registreren
          </a>
        </p>

        {/* Dev quick login buttons — only in development, mount-gated tegen hydration-mismatch */}
        {mounted && process.env.NODE_ENV === 'development' && (
          <div style={{ marginTop: 24, padding: 16, borderRadius: 12, background: 'var(--card)', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
              Dev Quick Login
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <button
                type="button"
                onClick={function () { setEmail('berkhout.catering@gmail.com'); setPassword('Hop&Bites'); }}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8, background: 'rgba(59,130,246,.08)', border: '1px solid rgba(59,130,246,.2)', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: 'var(--blue)', textAlign: 'left' }}
              >
                🔥 Hop &amp; Bites (Catering)
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
