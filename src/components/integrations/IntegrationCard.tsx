'use client';

// Sprint 2-deel-3 C7 — kaart in de integraties-marketplace grid.
// Toont status-pill (Aangesloten / Beschikbaar / Pro vereist / Binnenkort)
// en opent SetupWizard bij klik.

import { Building2, Calendar, CreditCard, Mail, Receipt, Webhook, type LucideIcon } from 'lucide-react';
import type { IntegrationManifest, IntegrationIconKey, IntegrationTier } from '@/lib/integrations';
import { TIER_LABELS } from '@/lib/integrations';

const ICON_MAP: Record<IntegrationIconKey, LucideIcon> = {
  receipt: Receipt,
  'credit-card': CreditCard,
  building: Building2,
  mail: Mail,
  calendar: Calendar,
  webhook: Webhook,
};

type StatusPill =
  | { kind: 'connected' }
  | { kind: 'available' }
  | { kind: 'tier'; tier: 'pro' | 'enterprise' }
  | { kind: 'soon' };

interface Props {
  integration: IntegrationManifest;
  configured: boolean;
  onConnect: () => void;
}

export function IntegrationCard({ integration, configured, onConnect }: Props) {
  const Icon = ICON_MAP[integration.iconKey as IntegrationIconKey] ?? Receipt;
  const pill = computeStatus(configured, integration.tier);

  return (
    <div style={{
      background: 'var(--card)',
      border: '1px solid var(--border)',
      borderRadius: 14,
      padding: 18,
      display: 'flex',
      flexDirection: 'column',
      gap: 14,
      transition: 'transform .15s ease, border-color .15s ease, box-shadow .15s ease',
      cursor: 'pointer',
    }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-2px)';
        e.currentTarget.style.borderColor = integration.accentColor;
        e.currentTarget.style.boxShadow = `0 4px 24px color-mix(in oklch, ${integration.accentColor}, transparent 85%)`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.borderColor = 'var(--border)';
        e.currentTarget.style.boxShadow = 'none';
      }}
      onClick={onConnect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onConnect(); } }}
    >
      {/* Header — icon + status-pill */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
        <div style={{
          width: 40, height: 40, borderRadius: 10,
          background: `color-mix(in oklch, ${integration.accentColor}, transparent 88%)`,
          color: integration.accentColor,
          display: 'grid', placeItems: 'center',
          border: `1px solid color-mix(in oklch, ${integration.accentColor}, transparent 75%)`,
        }}>
          <Icon size={20} />
        </div>
        <StatusPillView pill={pill} />
      </div>

      {/* Name + description */}
      <div style={{ display: 'grid', gap: 6, flex: 1 }}>
        <h3 style={{
          margin: 0,
          fontSize: 15,
          fontWeight: 700,
          color: 'var(--text)',
          lineHeight: 1.2,
        }}>{integration.name}</h3>
        <p style={{
          margin: 0,
          fontSize: 12,
          color: 'var(--muted)',
          lineHeight: 1.45,
        }}>{integration.shortDescription}</p>
      </div>

      {/* CTA */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onConnect(); }}
        style={{
          padding: '8px 12px',
          borderRadius: 8,
          background: configured ? 'transparent' : integration.accentColor,
          color: configured ? integration.accentColor : '#fff',
          border: `1px solid ${integration.accentColor}`,
          fontWeight: 700,
          fontSize: 12,
          cursor: 'pointer',
          textAlign: 'center',
        }}
      >
        {configured ? 'Instellingen' : 'Verbind'}
      </button>
    </div>
  );
}

function computeStatus(configured: boolean, tier: IntegrationTier): StatusPill {
  if (tier === 'binnenkort') return { kind: 'soon' };
  if (configured) return { kind: 'connected' };
  if (tier === 'pro' || tier === 'enterprise') return { kind: 'tier', tier };
  return { kind: 'available' };
}

function StatusPillView({ pill }: { pill: StatusPill }) {
  const styles = pillStyles(pill);
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      padding: '3px 8px',
      borderRadius: 12,
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: '.04em',
      background: styles.bg,
      color: styles.fg,
      border: `1px solid ${styles.border}`,
      whiteSpace: 'nowrap',
    }}>
      <span style={{
        width: 6, height: 6, borderRadius: 999, background: styles.dot,
      }} />
      {styles.label}
    </span>
  );
}

function pillStyles(pill: StatusPill) {
  switch (pill.kind) {
    case 'connected':
      return {
        label: 'Aangesloten',
        bg: 'color-mix(in oklch, #10b981, transparent 85%)',
        fg: '#10b981',
        border: 'color-mix(in oklch, #10b981, transparent 65%)',
        dot: '#10b981',
      };
    case 'available':
      return {
        label: 'Beschikbaar',
        bg: 'color-mix(in oklch, var(--muted), transparent 88%)',
        fg: 'var(--text)',
        border: 'var(--border)',
        dot: 'var(--muted)',
      };
    case 'tier':
      return {
        label: TIER_LABELS[pill.tier],
        bg: 'color-mix(in oklch, #f59e0b, transparent 85%)',
        fg: '#f59e0b',
        border: 'color-mix(in oklch, #f59e0b, transparent 65%)',
        dot: '#f59e0b',
      };
    case 'soon':
      return {
        label: 'Binnenkort',
        bg: 'color-mix(in oklch, #6b7280, transparent 85%)',
        fg: '#6b7280',
        border: 'color-mix(in oklch, #6b7280, transparent 65%)',
        dot: '#6b7280',
      };
  }
}
