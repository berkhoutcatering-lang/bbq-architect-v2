// Sprint 2-deel-3 C9 — Resend test-mail endpoint.
// Stuurt een test-mail naar het ingelogde user-email (geen open-relay).

import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import { createServerSupabase } from '@/lib/supabase-server';

export async function POST() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !user.email) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !fromEmail) {
    return NextResponse.json({
      error: 'RESEND_API_KEY of RESEND_FROM_EMAIL ontbreekt in env-vars',
    }, { status: 503 });
  }

  try {
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({
      from: fromEmail,
      to: user.email,
      subject: 'BBQ Architect — testmail',
      html: `
        <div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
          <h2 style="color: #1a1a1a;">Testmail van BBQ Architect</h2>
          <p style="color: #444;">Je Resend-koppeling werkt — deze mail is verstuurd vanuit de Integraties-wizard.</p>
          <p style="color: #888; font-size: 12px; margin-top: 24px;">
            Vanaf nu krijg je hier offerte-PDF's, facturen en boekhouder-pakketten.
          </p>
        </div>
      `,
    });

    if (error) {
      return NextResponse.json({ error: error.message ?? 'Onbekende Resend fout' }, { status: 502 });
    }

    return NextResponse.json({
      message: `Testmail verstuurd naar ${user.email} (id ${data?.id ?? 'unknown'})`,
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
