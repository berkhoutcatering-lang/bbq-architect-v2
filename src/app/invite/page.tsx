'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useSearchParams } from 'next/navigation';
import { Flame } from 'lucide-react';

export default function InvitePage() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const [status, setStatus] = useState<'loading' | 'ready' | 'accepted' | 'error' | 'expired'>('loading');
  const [invite, setInvite] = useState<{ email: string; role: string; organization_name?: string } | null>(null);
  const [error, setError] = useState('');

  useEffect(function () {
    if (!token) { setStatus('error'); return; }

    /* Server-side lookup via rate-limited endpoint — voorheen direct
       Supabase-query vanaf Client, wat token-brute-force toeliet via
       Realtime/REST. Endpoint heeft per-IP rate-limit + constant-time
       response zodat existence-via-timing onmogelijk wordt. */
    fetch('/api/invite/lookup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, status: r.status, data: d }; }); })
      .then(function (res) {
        if (res.status === 429) {
          setStatus('error');
          setError(res.data?.error || 'Te veel pogingen — probeer later opnieuw.');
          return;
        }
        if (!res.ok || !res.data?.status) {
          setStatus('error');
          setError(res.data?.error || 'Uitnodiging niet gevonden');
          return;
        }
        if (res.data.status === 'accepted') { setStatus('accepted'); return; }
        if (res.data.status === 'expired') { setStatus('expired'); return; }
        if (res.data.status === 'ready' && res.data.invite) {
          setInvite(res.data.invite);
          setStatus('ready');
          return;
        }
        setStatus('error');
        setError('Onbekende fout');
      })
      .catch(function (err) {
        console.error('[invite] lookup failed:', err);
        setStatus('error');
        setError('Verbinding mislukt — probeer opnieuw.');
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
          <Flame size={24} className="text-[var(--bg)]" />
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
