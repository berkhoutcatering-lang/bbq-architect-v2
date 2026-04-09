/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase-server';

async function getPlatformAdmin() {
  const authSb = await createServerSupabase();
  const { data: { user } } = await authSb.auth.getUser();
  if (!user) return null;
  const adminEmails = (process.env.PLATFORM_ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
  if (!adminEmails.includes((user.email || '').toLowerCase())) return null;
  return user;
}

// GET — Retention metrics: DAU, WAU, MAU + org-level retention
export async function GET(request: NextRequest) {
  void request;
  const user = await getPlatformAdmin();
  if (!user) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 });

  const sb = createServiceSupabase();
  const now = new Date();

  // DAU: unique orgs active today
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const { data: dauRows } = await sb.from('activity_log').select('organization_id').gte('created_at', todayStart);
  const dau = new Set((dauRows || []).map((r: any) => r.organization_id)).size;

  // WAU: unique orgs active in last 7 days
  const weekAgo = new Date(now.getTime() - 7 * 86400000).toISOString();
  const { data: wauRows } = await sb.from('activity_log').select('organization_id').gte('created_at', weekAgo);
  const wau = new Set((wauRows || []).map((r: any) => r.organization_id)).size;

  // MAU: unique orgs active in last 30 days
  const monthAgo = new Date(now.getTime() - 30 * 86400000).toISOString();
  const { data: mauRows } = await sb.from('activity_log').select('organization_id').gte('created_at', monthAgo);
  const mau = new Set((mauRows || []).map((r: any) => r.organization_id)).size;

  // Total active orgs
  const { data: totalOrgs } = await sb.from('organizations').select('id').not('name', 'like', '[INACTIEF]%');
  const total = (totalOrgs || []).length;

  // Stickiness ratio (DAU/MAU)
  const stickiness = mau > 0 ? Math.round((dau / mau) * 100) : 0;

  // Error count (last 7 days)
  const { data: errorRows } = await sb.from('error_logs').select('id').gte('created_at', weekAgo);
  const errorCount = (errorRows || []).length;

  // Support ticket stats
  const { data: ticketRows } = await sb.from('support_tickets').select('status');
  const openTickets = (ticketRows || []).filter((t: any) => t.status === 'open').length;
  const totalTickets = (ticketRows || []).length;

  // Help article feedback stats
  const { data: feedbackRows } = await sb.from('help_article_feedback').select('helpful');
  const helpfulCount = (feedbackRows || []).filter((f: any) => f.helpful).length;
  const totalFeedback = (feedbackRows || []).length;
  const helpfulPct = totalFeedback > 0 ? Math.round((helpfulCount / totalFeedback) * 100) : 0;

  return NextResponse.json({
    dau,
    wau,
    mau,
    total,
    stickiness,
    dauPct: total > 0 ? Math.round((dau / total) * 100) : 0,
    wauPct: total > 0 ? Math.round((wau / total) * 100) : 0,
    mauPct: total > 0 ? Math.round((mau / total) * 100) : 0,
    errorCount,
    openTickets,
    totalTickets,
    helpfulPct,
    totalFeedback,
  });
}
