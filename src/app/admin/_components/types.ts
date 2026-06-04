export interface OrgData {
  id: string;
  name: string;
  slug: string;
  created_at: string;
  members: { active: number; invited: number };
  invitations: { email: string; role: string; token: string; expires_at: string; created_at: string }[];
  data: Record<string, number>;
}

export interface HealthData {
  orgId: string;
  orgName: string;
  overall: number;
  activity: number;
  dataRichness: number;
  adoption: number;
  teamSize: number;
  lastActivity: string | null;
  daysInactive: number;
  status: 'healthy' | 'at-risk' | 'critical' | 'churned';
  memberCount: number;
  dataCount: number;
}

export interface AnalyticsData {
  chartData: { date: string; label: string; total: number }[];
  orgTotals: { orgId: string; orgName: string; totalActions: number }[];
  topPages: { page: string; count: number }[];
  totalActions: number;
  activeOrgs: number;
}

export interface RetentionData {
  dau: number;
  wau: number;
  mau: number;
  total: number;
  stickiness: number;
  dauPct: number;
  wauPct: number;
  mauPct: number;
  errorCount: number;
  openTickets: number;
  totalTickets: number;
  helpfulPct: number;
  totalFeedback: number;
}

export interface ImpersonateUser {
  userId: string;
  naam: string;
  email: string;
  role: string;
  orgId: string;
  orgName: string;
}

export type HealthStatus = 'healthy' | 'at-risk' | 'critical' | 'churned';

export const STATUS_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
  healthy: { color: 'var(--green)', bg: 'color-mix(in srgb, var(--green) 10%, transparent)', label: 'Gezond' },
  'at-risk': { color: 'var(--amber)', bg: 'color-mix(in srgb, var(--amber) 10%, transparent)', label: 'Risico' },
  critical: { color: 'var(--red)', bg: 'color-mix(in srgb, var(--red) 10%, transparent)', label: 'Kritiek' },
  churned: { color: 'var(--zinc)', bg: 'color-mix(in srgb, var(--zinc) 10%, transparent)', label: 'Inactief' },
};

export const FLAG_DEFS = [
  { key: 'ai_assistant', label: 'AI Assistent', desc: 'Pitmaster Studio' },
  { key: 'price_intelligence', label: 'Prijsintelligentie', desc: 'Marktinzichten' },
  { key: 'csv_import', label: 'CSV Import', desc: 'Data import' },
  { key: 'website_builder', label: 'Website Builder', desc: 'Publieke site' },
  { key: 'advanced_analytics', label: 'Analytics Pro', desc: 'Financiele rapportages' },
  { key: 'api_access', label: 'API Toegang', desc: 'REST API' },
  { key: 'multi_location', label: 'Multi-locatie', desc: 'Vestigingen' },
  { key: 'white_label', label: 'White Label', desc: 'Eigen branding' },
];
