'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useSearchParams } from 'next/navigation';

export default function InvitePage() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const [status, setStatus] = useState<'loading' | 'ready' | 'accepted' | 'error' | 'expired'>('loading');
  const [invite, setInvite] = useState<{ email: string; role: string; organization_name?: string } | null>(null);
  const [error, setError] = useState('');

  useEffect(function () {
    if (!token || !supabase) { setStatus('error'); return; }

    // Fetch invitation details
    supabase
      .from('invitations')
      .select('email, role, accepted_at, expires_at, organizations(name)')
      .eq('token', token)
      .single()
      .then(function (res) {
        if (res.error || !res.data) {
          setStatus('error');
          setError('Uitnodiging niet gevonden');
          return;
        }

        const data = res.data as Record<string, unknown>;
        if (data.accepted_at) {
          setStatus('accepted');
          return;
        }
        if (new Date(data.expires_at as string) < new Date()) {
          setStatus('expired');
          return;
        }

        const org = data.organizations as Record<string, unknown> | null;
        setInvite({
          email: data.email as string,
          role: data.role as string,
          organization_name: org?.name as string || 'Onbekend',
        });
        setStatus('ready');
      });
  }, [token]);

  async function handleAccept() {
    if (!token || !supabase) return;
    setStatus('loading');

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      // Redirect to signup with invite context
      window.location.href = '/signup?invite=' + token;
      return;
    }

    // Accept invite via API
    const res = await fetch('/api/org/accept-invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });

    if (res.ok) {
      window.location.href = '/';
    } else {
      const err = await res.json();
      setError(err.error || 'Fout bij accepteren');
      setStatus('error');
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg)] px-4">
      <div className="w-full max-w-md text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[var(--brand)] mb-4">
          <i className="fa-solid fa-fire text-2xl text-[var(--bg)]" />
        </div>

        {status === 'loading' && (
          <p className="text-[var(--muted)]">Laden...</p>
        )}

        {status === 'ready' && invite && (
          <div
            className="rounded-2xl p-6 mt-4"
            style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
          >
            <h2 className="text-xl font-bold text-[var(--text)] mb-2">Je bent uitgenodigd!</h2>
            <p className="text-[var(--muted)] mb-4">
              Word lid van <strong className="text-[var(--text)]">{invite.organization_name}</strong> als{' '}
              <strong className="text-[var(--brand)]">{invite.role}</strong>.
            </p>
            <button
              onClick={handleAccept}
              className="w-full py-2.5 rounded-lg font-semibold text-[var(--bg)]"
              style={{ background: 'var(--brand)' }}
            >
              Uitnodiging accepteren
            </button>
          </div>
        )}

        {status === 'accepted' && (
          <div>
            <h2 className="text-xl font-bold text-[var(--text)] mb-2">Al geaccepteerd</h2>
            <p className="text-[var(--muted)]">Deze uitnodiging is al gebruikt.</p>
            <a href="/login" className="text-[var(--brand)] hover:underline mt-4 inline-block">Ga naar inloggen</a>
          </div>
        )}

        {status === 'expired' && (
          <div>
            <h2 className="text-xl font-bold text-[var(--text)] mb-2">Verlopen</h2>
            <p className="text-[var(--muted)]">Deze uitnodiging is verlopen. Vraag een nieuwe aan je admin.</p>
          </div>
        )}

        {status === 'error' && (
          <div>
            <h2 className="text-xl font-bold text-red-400 mb-2">Fout</h2>
            <p className="text-[var(--muted)]">{error || 'Ongeldige uitnodiging'}</p>
          </div>
        )}
      </div>
    </div>
  );
}
