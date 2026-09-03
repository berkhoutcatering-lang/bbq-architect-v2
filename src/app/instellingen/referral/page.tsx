'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Copy, Gift, Users, Check } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useOrg } from '@/lib/OrgContext';
import { useToast } from '@/components/Toast';

import { formatEurInt } from '@/lib/format';

import HubHeader from '@/components/chassis/HubHeader';
/**
 * Referral-programma UI (playbook §L)
 *
 * Toont één actieve referral-code voor de huidige org en
 * een overzicht van eerder gemaakte referrals + status.
 *
 * Maximaal 10 actieve referrals per org (wordt afgedwongen op DB-niveau in H2).
 */

type Referral = {
  id: string;
  referral_code: string;
  status: string;
  credit_amount_cents: number;
  created_at: string;
  signed_up_at: string | null;
  paid_at: string | null;
  expires_at: string | null;
};

const MAX_ACTIVE = 10;

export default function ReferralPage() {
  const { orgId } = useOrg();
  const showToast = useToast();
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(function () {
    if (!orgId || !supabase) return;
    supabase
      .from('referrals')
      .select('id, referral_code, status, credit_amount_cents, created_at, signed_up_at, paid_at, expires_at')
      .eq('referrer_org_id', orgId)
      .order('created_at', { ascending: false })
      .then(function (res) {
        if (res.data) setReferrals(res.data);
        setLoading(false);
      });
  }, [orgId]);

  async function generateCode() {
    if (!orgId || !supabase) return;
    setCreating(true);

    // Genereer code via DB-helper
    const { data: codeRes } = await supabase.rpc('generate_referral_code');
    const code = (codeRes as string) || `BBQ-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;

    const { data, error } = await supabase
      .from('referrals')
      .insert({
        referrer_org_id: orgId,
        referral_code: code,
        status: 'pending',
      })
      .select('id, referral_code, status, credit_amount_cents, created_at, signed_up_at, paid_at, expires_at')
      .single();

    setCreating(false);
    if (!error && data) {
      setReferrals(prev => [data as Referral, ...prev]);
    } else if (error) {
      showToast('Code aanmaken mislukt: ' + error.message, 'error');
    }
  }

  function copyLink(code: string, id: string) {
    const url = `${window.location.origin}/signup?ref=${code}`;
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  const activeCount = referrals.filter(r => r.status !== 'expired').length;

  return (
    <div className="max-w-[800px] mx-auto px-6 py-10">
      <Link href="/instellingen" className="inline-flex items-center gap-2 text-[12px] text-[var(--muted)] hover:text-[var(--text)] no-underline mb-6">
        <ArrowLeft className="w-3.5 h-3.5" />
        Terug naar Instellingen
      </Link>

      <HubHeader
        titel="Referral-programma"
        onderschrift={<>Verwijs een collega-cateraar en jullie krijgen beiden <strong style={{ color: 'var(--brand-gold)' }}>€ 50 tegoed</strong> op het abonnement zodra zij hun eerste betaling doen.</>}
      />

      {/* Hoe werkt het */}
      <section className="rounded-2xl border border-[var(--card-solid)] bg-[var(--card)] p-6 mb-6">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-[var(--color-accent-gold)]/10 border border-[var(--color-accent-gold)]/20 flex items-center justify-center shrink-0">
            <Gift className="w-4 h-4 text-[var(--color-accent-gold)]" />
          </div>
          <div className="text-[13px] text-white/85 leading-relaxed">
            <ol className="list-decimal pl-5 space-y-1">
              <li>Genereer een unieke referral-link hieronder</li>
              <li>Deel de link met collega-caterers (max {MAX_ACTIVE} actieve links per organisatie)</li>
              <li>Zij signupen via de link en starten hun trial</li>
              <li>Zodra ze hun eerste maand betalen, krijgen jullie beiden €50 tegoed</li>
            </ol>
          </div>
        </div>
        <button
          onClick={generateCode}
          disabled={creating || activeCount >= MAX_ACTIVE}
          className="w-full md:w-auto px-5 py-3 rounded-lg text-[13px] font-bold bg-[var(--color-accent-gold)] text-black hover:brightness-110 disabled:opacity-40"
        >
          {creating ? 'Genereren...' : activeCount >= MAX_ACTIVE ? `Max ${MAX_ACTIVE} bereikt` : '+ Nieuwe referral-link'}
        </button>
      </section>

      {/* Lijst */}
      <section className="rounded-2xl border border-[var(--card-solid)] bg-[var(--card)] overflow-hidden">
        <div className="px-5 py-3 border-b border-[var(--card-solid)] flex items-center gap-2">
          <Users className="w-4 h-4 text-[var(--color-accent-gold)]" />
          <h2 className="text-[14px] font-bold text-[var(--text)]">Mijn referrals ({referrals.length})</h2>
        </div>

        {loading ? (
          <div className="p-6 text-[13px] text-[var(--muted)]">Laden...</div>
        ) : referrals.length === 0 ? (
          <div className="p-6 text-[13px] text-[var(--muted)] italic">Nog geen referrals — genereer hierboven je eerste link.</div>
        ) : (
          <ul className="divide-y divide-[var(--card-solid)]/40">
            {referrals.map(r => (
              <li key={r.id} className="px-5 py-4 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <code className="text-[13px] font-mono font-bold text-[var(--text)]">{r.referral_code}</code>
                    <StatusBadge status={r.status} />
                  </div>
                  <div className="text-[11px] text-[var(--muted)]">
                    Aangemaakt {new Date(r.created_at).toLocaleDateString('nl-NL')} · Tegoed {formatEurInt((r.credit_amount_cents / 100))}
                    {r.paid_at && ` · Uitbetaald ${new Date(r.paid_at).toLocaleDateString('nl-NL')}`}
                  </div>
                </div>
                <button
                  onClick={() => copyLink(r.referral_code, r.id)}
                  className="inline-flex items-center gap-1 px-3 py-2 rounded-lg text-[11px] font-medium bg-[var(--color-bg-deep)] text-[var(--text)] border border-[var(--card-solid)] hover:border-[var(--color-accent-gold)]/50"
                  style={{ minHeight: 40 }}
                  aria-label="Kopieer referral-link"
                >
                  {copiedId === r.id ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedId === r.id ? 'Gekopieerd' : 'Kopieer link'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  /* Statussen mappen op semantische tokens i.p.v. hardcoded Tailwind-
     kleuren — werkt automatisch correct in white-label themes. */
  const map: Record<string, { label: string; cls: string }> = {
    pending:   { label: 'Wacht op signup', cls: 'bg-white/5 text-white/60' },
    signed_up: { label: 'Gesigned-up',     cls: 'bg-[color-mix(in_srgb,var(--info)_15%,transparent)] text-[var(--info)]' },
    activated: { label: 'Trial actief',    cls: 'bg-[color-mix(in_srgb,var(--warning)_15%,transparent)] text-[var(--warning)]' },
    paid:      { label: 'Uitbetaald',      cls: 'bg-[color-mix(in_srgb,var(--success)_15%,transparent)] text-[var(--success)]' },
    expired:   { label: 'Verlopen',        cls: 'bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] text-[var(--danger)]' },
  };
  const m = map[status] || { label: status, cls: 'bg-white/5 text-white/60' };
  return <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${m.cls}`}>{m.label}</span>;
}
