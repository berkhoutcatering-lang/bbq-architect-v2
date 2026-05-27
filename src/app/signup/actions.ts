'use server';

import { z } from 'zod';
import { headers } from 'next/headers';
import { createServerSupabase } from '@/lib/supabase-server';

/**
 * Self-serve signup via magic-link.
 *
 * Pillar #1 (Time-to-AI-offerte ≤10 min): geen wachtwoord-flow, geen
 * confirmation-redirect — gewoon e-mail invoeren, magic-link openen,
 * direct in /onboarding landen.
 *
 * shouldCreateUser: true → Supabase Auth maakt de user aan als die nog
 * niet bestaat. user_metadata krijgt bedrijfsnaam + tier mee zodat de
 * post-signup trigger straks een organisatie kan aanmaken.
 */

const SignupSchema = z.object({
  email: z.string().email('Geldig e-mailadres vereist'),
  bedrijfsnaam: z.string().min(2, 'Bedrijfsnaam te kort').max(120, 'Bedrijfsnaam te lang'),
  tier: z.enum(['starter', 'pro', 'enterprise']).default('starter'),
});

export type SignupState =
  | { status: 'idle' }
  | { status: 'sent'; email: string }
  | { status: 'error'; error: string };

export async function startSignup(
  _prev: SignupState,
  formData: FormData,
): Promise<SignupState> {
  const parsed = SignupSchema.safeParse({
    email: String(formData.get('email') ?? '').trim().toLowerCase(),
    bedrijfsnaam: String(formData.get('bedrijfsnaam') ?? '').trim(),
    tier: formData.get('tier') ?? 'starter',
  });

  if (!parsed.success) {
    return {
      status: 'error',
      error: parsed.error.issues[0]?.message ?? 'Ongeldige invoer',
    };
  }

  const sb = await createServerSupabase();
  const hdrs = await headers();
  const origin = hdrs.get('origin') ?? 'https://app.bbqarchitect.nl';

  const { error } = await sb.auth.signInWithOtp({
    email: parsed.data.email,
    options: {
      // Auth-callback ondersteunt ?next=, redirect naar onboarding na bevestiging
      emailRedirectTo: `${origin}/auth/callback?next=/onboarding`,
      data: {
        bedrijfsnaam: parsed.data.bedrijfsnaam,
        intended_tier: parsed.data.tier,
      },
      shouldCreateUser: true,
    },
  });

  if (error) {
    // Vertaal de meest voorkomende Supabase-foutmeldingen naar NL
    const msg = error.message.toLowerCase();
    if (msg.includes('rate limit') || msg.includes('too many')) {
      return { status: 'error', error: 'Even rustig — probeer over een paar minuten nog eens.' };
    }
    if (msg.includes('already registered') || msg.includes('exists')) {
      return { status: 'error', error: 'Dit e-mailadres heeft al een account. Probeer in te loggen.' };
    }
    return { status: 'error', error: error.message };
  }

  return { status: 'sent', email: parsed.data.email };
}
