'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function SignupPage() {
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [orgName, setOrgName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setError('');
    setLoading(true);

    if (step === 1) {
      if (password.length < 6) {
        setError('Wachtwoord moet minimaal 6 tekens zijn');
        setLoading(false);
        return;
      }
      setStep(2);
      setLoading(false);
      return;
    }

    // Step 2: Create account + organization
    const { data: authData, error: signupErr } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name },
      },
    });

    if (signupErr) {
      setError(signupErr.message);
      setLoading(false);
      return;
    }

    if (!authData.user) {
      setError('Onverwachte fout bij registratie');
      setLoading(false);
      return;
    }

    // Create organization via API (uses service role to bypass RLS)
    const res = await fetch('/api/org', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: orgName,
        userId: authData.user.id,
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      setError(err.error || 'Fout bij aanmaken organisatie');
      setLoading(false);
      return;
    }

    // Success — redirect to app
    window.location.href = '/';
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg)] px-4">
      <div className="w-full max-w-md">
        {/* Logo & Branding */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[var(--brand)] mb-4">
            <i className="fa-solid fa-fire text-2xl text-[var(--bg)]" />
          </div>
          <h1 className="text-2xl font-bold text-[var(--text)]">BBQ Architect</h1>
          <p className="text-[var(--muted)] mt-1">
            {step === 1 ? 'Maak je account aan' : 'Stel je organisatie in'}
          </p>
        </div>

        {/* Progress */}
        <div className="flex items-center justify-center gap-2 mb-6">
          <div className="w-8 h-1 rounded-full" style={{ background: 'var(--brand)' }} />
          <div className="w-8 h-1 rounded-full" style={{ background: step >= 2 ? 'var(--brand)' : 'var(--border)' }} />
        </div>

        {/* Signup Form */}
        <form onSubmit={handleSignup} className="space-y-4">
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

            {step === 1 ? (
              <>
                <div>
                  <label className="block text-sm font-medium text-[var(--muted)] mb-1.5">Naam</label>
                  <input
                    type="text"
                    value={name}
                    onChange={function (e) { setName(e.target.value); }}
                    required
                    autoFocus
                    className="w-full px-3 py-2.5 rounded-lg bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] placeholder-[var(--muted)] focus:border-[var(--brand)] focus:outline-none transition-colors"
                    placeholder="Je volledige naam"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--muted)] mb-1.5">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={function (e) { setEmail(e.target.value); }}
                    required
                    className="w-full px-3 py-2.5 rounded-lg bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] placeholder-[var(--muted)] focus:border-[var(--brand)] focus:outline-none transition-colors"
                    placeholder="jouw@email.nl"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--muted)] mb-1.5">Wachtwoord</label>
                  <input
                    type="password"
                    value={password}
                    onChange={function (e) { setPassword(e.target.value); }}
                    required
                    minLength={6}
                    className="w-full px-3 py-2.5 rounded-lg bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] placeholder-[var(--muted)] focus:border-[var(--brand)] focus:outline-none transition-colors"
                    placeholder="Minimaal 6 tekens"
                  />
                </div>
              </>
            ) : (
              <div>
                <label className="block text-sm font-medium text-[var(--muted)] mb-1.5">
                  Bedrijfsnaam
                </label>
                <input
                  type="text"
                  value={orgName}
                  onChange={function (e) { setOrgName(e.target.value); }}
                  required
                  autoFocus
                  className="w-full px-3 py-2.5 rounded-lg bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] placeholder-[var(--muted)] focus:border-[var(--brand)] focus:outline-none transition-colors"
                  placeholder="Bijv. Hop & Bites BBQ"
                />
                <p className="text-xs text-[var(--muted)] mt-2">
                  Dit is de naam van je catering bedrijf. Je kunt dit later wijzigen in instellingen.
                </p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-lg font-semibold text-[var(--bg)] transition-all"
              style={{
                background: loading ? 'var(--muted)' : 'var(--brand)',
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? 'Even geduld...' : step === 1 ? 'Volgende' : 'Account aanmaken'}
            </button>

            {step === 2 && (
              <button
                type="button"
                onClick={function () { setStep(1); setError(''); }}
                className="w-full py-2 text-sm text-[var(--muted)] hover:text-[var(--text)] transition-colors"
              >
                Terug
              </button>
            )}
          </div>
        </form>

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
