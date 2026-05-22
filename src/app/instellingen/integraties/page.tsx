'use client';

// Sprint 2-deel-3 C7 — Integraties marketplace (rewrite van accordion-pagina).
// Card-grid (4-3-2 responsive) + categorie-filter pills + modal-wizard 3 stappen.
// Linear Integrations / Slack Apps patroon.

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, RefreshCw, Shield, Zap } from 'lucide-react';
import { Settings as SettingsIcon } from 'lucide-react';
import PageGuideNote from '@/components/PageGuideNote';
import MetallicCard from '@/components/MetallicCard';
import { IntegrationCard } from '@/components/integrations/IntegrationCard';
import { CategoryFilter, type FilterValue } from '@/components/integrations/CategoryFilter';
import { IntegrationSetupWizard } from '@/components/integrations/IntegrationSetupWizard';
import {
  INTEGRATIONS_MANIFEST,
  type IntegrationCategory,
} from '@/lib/integrations';

export default function IntegratiesPage() {
  const [statuses, setStatuses] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterValue>('all');
  const [wizardOpenId, setWizardOpenId] = useState<string | null>(null);

  // Initial status check
  useEffect(() => { refreshStatuses(); }, []);

  async function refreshStatuses() {
    setLoading(true);
    const next: Record<string, boolean> = {};
    await Promise.allSettled(
      INTEGRATIONS_MANIFEST.map(async (i) => {
        if (!i.setup.statusEndpoint) {
          next[i.id] = false;
          return;
        }
        try {
          const res = await fetch(i.setup.statusEndpoint, { method: 'GET' });
          const data = await res.json().catch(() => ({}));
          next[i.id] = res.ok && data.configured === true;
        } catch {
          next[i.id] = false;
        }
      })
    );
    setStatuses(next);
    setLoading(false);
  }

  // Counts per category for filter pills
  const counts = useMemo<Record<FilterValue, number>>(() => {
    const c: Partial<Record<FilterValue, number>> = { all: INTEGRATIONS_MANIFEST.length };
    for (const i of INTEGRATIONS_MANIFEST) {
      c[i.category] = (c[i.category] ?? 0) + 1;
    }
    return c as Record<FilterValue, number>;
  }, []);

  // Apply filter
  const visible = useMemo(() => {
    if (filter === 'all') return INTEGRATIONS_MANIFEST;
    return INTEGRATIONS_MANIFEST.filter(i => i.category === (filter as IntegrationCategory));
  }, [filter]);

  const connectedCount = Object.values(statuses).filter(Boolean).length;
  const totalCount = INTEGRATIONS_MANIFEST.length;

  const wizardIntegration = wizardOpenId
    ? INTEGRATIONS_MANIFEST.find(i => i.id === wizardOpenId)
    : null;

  return (
    <>
      <PageGuideNote
        id="integraties"
        accent="#6366f1"
        icon={SettingsIcon}
        intro="Koppel BBQ Architect aan de tools die je toch al gebruikt — eenmalig autoriseren, daarna loopt het op de achtergrond."
        actions={[
          { lead: 'Filter per categorie', text: 'om snel te zien wat er beschikbaar is voor boekhouding, betalingen, communicatie of data-sync.' },
          { lead: 'Klik een card', text: 'om de 3-stappen wizard te openen — wat het doet, hoe je verbindt, en een test-call.' },
          { lead: 'Pro-features zoals Exact', text: 'zijn alleen op het Pro-tier beschikbaar — Mollie en Moneybird werken op alle tiers.' },
        ]}
      />

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link href="/instellingen" className="p-2 rounded-lg hover:bg-[var(--card)] transition-colors">
            <ArrowLeft size={18} className="text-[var(--muted)]" />
          </Link>
          <div>
            <h2 className="text-lg font-semibold text-[var(--text)]">Integraties</h2>
            <p className="text-[12px] text-[var(--muted)]">
              Marketplace van koppelingen met externe diensten
            </p>
          </div>
        </div>
        <button
          onClick={refreshStatuses}
          className="flex items-center gap-2 px-3 py-1.5 text-[12px] text-[var(--muted)] hover:text-[var(--text)] bg-[var(--card)] border border-[var(--border)] rounded-lg transition-colors"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          Vernieuwen
        </button>
      </div>

      {/* Overview card */}
      <MetallicCard className="p-5 mb-6" hover={false} accent="var(--brand)">
        <div className="flex items-center gap-4">
          <div
            className="p-3 rounded-xl"
            style={{
              background: 'linear-gradient(135deg, color-mix(in oklch, var(--brand), transparent 80%), color-mix(in oklch, var(--brand), transparent 92%))',
              border: '1px solid color-mix(in oklch, var(--brand), transparent 75%)',
            }}
          >
            <Zap size={22} className="text-[var(--brand)]" />
          </div>
          <div className="flex-1">
            <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--muted)] mb-1">
              Integratie status
            </p>
            <p className="text-xl font-light text-[var(--text)]">
              {loading ? '...' : `${connectedCount} / ${totalCount}`}
            </p>
            <p className="text-[11px] text-[var(--muted)] mt-0.5">
              {loading ? 'Status controleren...' : connectedCount === 0 ? 'Nog geen integraties actief' : `${connectedCount} integratie${connectedCount === 1 ? '' : 's'} verbonden`}
            </p>
          </div>
          <div className="hidden md:flex items-center gap-2">
            <Shield size={14} className="text-[var(--muted)]" />
            <span className="text-[11px] text-[var(--muted)]">
              Credentials via Vercel env-vars
            </span>
          </div>
        </div>
      </MetallicCard>

      {/* Category filter */}
      <CategoryFilter value={filter} onChange={setFilter} counts={counts} />

      {/* Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
        gap: 16,
      }}>
        {visible.map(integration => (
          <IntegrationCard
            key={integration.id}
            integration={integration}
            configured={statuses[integration.id] ?? false}
            onConnect={() => setWizardOpenId(integration.id)}
          />
        ))}
      </div>

      {visible.length === 0 && (
        <div style={{
          padding: 24,
          textAlign: 'center',
          color: 'var(--muted)',
          fontSize: 13,
          background: 'var(--card)',
          borderRadius: 12,
          border: '1px solid var(--border)',
        }}>
          Geen integraties in deze categorie. Vraag &apos;m aan via Support.
        </div>
      )}

      {/* Wizard modal */}
      {wizardIntegration && (
        <IntegrationSetupWizard
          integration={wizardIntegration}
          configured={statuses[wizardIntegration.id] ?? false}
          onClose={() => {
            setWizardOpenId(null);
            // Refresh status na sluiten — env-vars kunnen sindsdien gezet zijn
            refreshStatuses();
          }}
        />
      )}
    </>
  );
}
