'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Download, ArrowLeft, ShieldCheck, Database, Trash2 } from 'lucide-react';
import { useOrg } from '@/lib/OrgContext';
import { removeDemoData } from '@/lib/demoData';

/**
 * SF-11 — Data-export & -verwijdering voor AVG-compliance.
 *
 * Twee acties:
 * 1. Volledige data-export downloaden (artikel 20 GDPR)
 * 2. Demo-data verwijderen (handig na onboarding)
 */
export default function DataExportPage() {
  const { orgId, organization } = useOrg();
  const [downloading, setDownloading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [removedMessage, setRemovedMessage] = useState<string | null>(null);

  async function handleDownload() {
    if (!orgId) return;
    setDownloading(true);
    try {
      const res = await fetch(`/api/data-export?orgId=${orgId}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        alert(`Export mislukt: ${body.error || res.statusText}`);
        return;
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const cd = res.headers.get('content-disposition') || '';
      const m = /filename="([^"]+)"/.exec(cd);
      a.download = m?.[1] || `bbq-architect-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  }

  async function handleRemoveDemo() {
    if (!orgId) return;
    if (!confirm('Weet je zeker dat je alle demo-data wilt verwijderen?\n\nAlleen rijen met "[DEMO]"-prefix worden verwijderd. Echte data blijft staan.')) {
      return;
    }
    setRemoving(true);
    setRemovedMessage(null);
    const { ok, error } = await removeDemoData(orgId);
    setRemoving(false);
    if (ok) {
      setRemovedMessage('Demo-data verwijderd.');
    } else {
      setRemovedMessage(`Fout: ${error}`);
    }
  }

  return (
    <div className="max-w-[800px] mx-auto px-6 py-10">
      <Link href="/instellingen" className="inline-flex items-center gap-2 text-[12px] text-[var(--muted)] hover:text-[var(--text)] no-underline mb-6">
        <ArrowLeft className="w-3.5 h-3.5" />
        Terug naar Instellingen
      </Link>

      <h1 className="text-2xl font-extralight text-[var(--text)] mb-2">Data &amp; privacy</h1>
      <p className="text-[13px] text-[var(--muted)] mb-8">
        Exporteer of verwijder data voor de organisatie <strong className="text-[var(--text)]">{organization?.name || '...'}</strong>.
      </p>

      {/* ───── Data export ───── */}
      <section className="rounded-2xl border border-[var(--card-solid)] bg-[var(--card)] p-6 mb-6">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-[var(--color-accent-gold)]/10 border border-[var(--color-accent-gold)]/20 flex items-center justify-center shrink-0">
            <Download className="w-4 h-4 text-[var(--color-accent-gold)]" />
          </div>
          <div>
            <h2 className="text-[15px] font-bold text-[var(--text)] mb-1">Volledige data-export</h2>
            <p className="text-[12.5px] text-[var(--muted)] leading-relaxed">
              Download al je data — klanten, gerechten, offertes, events, HACCP-logs en meer — als één JSON-bestand.
              Dit is je AVG artikel-20-recht (dataportabiliteit). Het bestand kun je bewaren of importeren in een andere tool.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 mt-5">
          <button
            onClick={handleDownload}
            disabled={!orgId || downloading}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-[13px] font-bold bg-[var(--color-accent-gold)] text-black hover:brightness-110 disabled:opacity-40"
          >
            <Download className="w-4 h-4" />
            {downloading ? 'Bezig met exporteren...' : 'Download data-export (.json)'}
          </button>
          <span className="text-[11px] text-[var(--muted)]">Kan 30–60 sec duren bij grote datasets.</span>
        </div>

        <div className="mt-5 pt-5 border-t border-[var(--card-solid)] flex items-start gap-2">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
          <p className="text-[11px] text-[var(--muted)] leading-relaxed">
            Alleen data van jouw organisatie wordt geëxporteerd. We checken eerst of je echt member bent voordat we de data ophalen.
            De export bevat geen wachtwoorden of betalingsinfo (die slaan we niet op).
          </p>
        </div>
      </section>

      {/* ───── Demo data verwijderen ───── */}
      <section className="rounded-2xl border border-[var(--card-solid)] bg-[var(--card)] p-6">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
            <Database className="w-4 h-4 text-amber-400" />
          </div>
          <div>
            <h2 className="text-[15px] font-bold text-[var(--text)] mb-1">Demo-data verwijderen</h2>
            <p className="text-[12.5px] text-[var(--muted)] leading-relaxed">
              Tijdens onboarding is er optioneel demo-data geladen (3 klanten, 5 gerechten met &ldquo;[DEMO]&rdquo;-prefix).
              Deze knop verwijdert alleen die rijen — je echte data blijft staan.
            </p>
          </div>
        </div>

        <button
          onClick={handleRemoveDemo}
          disabled={!orgId || removing}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-[13px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30 hover:bg-amber-500/25 disabled:opacity-40"
        >
          <Trash2 className="w-4 h-4" />
          {removing ? 'Bezig met verwijderen...' : 'Demo-data verwijderen'}
        </button>

        {removedMessage && (
          <div className="mt-3 text-[12px] text-emerald-300">
            {removedMessage}
          </div>
        )}
      </section>
    </div>
  );
}
