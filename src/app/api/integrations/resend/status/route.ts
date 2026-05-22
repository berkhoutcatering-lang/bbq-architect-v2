// Sprint 2-deel-3 C9 — Resend status check.
// Returnt { configured: true } als RESEND_API_KEY is set.

import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';

export async function GET() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

  const configured = !!process.env.RESEND_API_KEY && !!process.env.RESEND_FROM_EMAIL;
  return NextResponse.json({ configured });
}
