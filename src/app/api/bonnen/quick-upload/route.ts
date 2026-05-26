/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';

export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * POST /api/bonnen/quick-upload
 * ─────────────────────────────
 * Pillar #3 — 10-seconde foto-bon flow. Cateraar in koelwagen:
 *   1. tap FAB
 *   2. neem foto
 *   3. upload (deze endpoint)
 *   4. redirect naar /inkoop?bon=<id> waar AI-parse loopt en hij bevestigt
 *
 * Slaat alleen het beeld op + een leeg bon record. AI-parsing gebeurt later
 * vanuit /inkoop (hergebruik bestaande /api/chat-flow).
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

    const body = await req.json() as { image_data_url?: string };
    const dataUrl = body.image_data_url || '';
    if (!dataUrl.startsWith('data:image/')) {
      return NextResponse.json({ error: 'Ongeldige foto' }, { status: 400 });
    }
    // Max ~10MB base64 ≈ 13MB string → guard
    if (dataUrl.length > 14_000_000) {
      return NextResponse.json({ error: 'Foto te groot (>10MB)' }, { status: 413 });
    }

    const { data: memberships } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .limit(1);
    const orgId = memberships?.[0]?.organization_id;
    if (!orgId) return NextResponse.json({ error: 'Geen organisatie' }, { status: 403 });

    const { data: bon, error } = await supabase
      .from('bonnen')
      .insert({
        organization_id: orgId,
        image_url: dataUrl,        // data URL — bon-process pakt dit op
        datum: new Date().toISOString().slice(0, 10),
        status: 'pending',
        source: 'scan',            // P0.1 — onderscheid camera-scan van email/upload
        notities: 'Quick-scan via FAB',
        // P0.1 — placeholder zodat search_vec niet leeg blijft tot bon-process draait.
        // De echte extracted_text wordt later geupdate door extractPdfText() in bon-process.
        extracted_text: `Quick-scan ${new Date().toLocaleDateString('nl-NL')}`,
      })
      .select('id')
      .single();
    if (error) {
      console.error('[bonnen/quick-upload insert]', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ bon_id: bon.id, status: 'pending' });
  } catch (err: any) {
    console.error('[bonnen/quick-upload]', err);
    return NextResponse.json({ error: err?.message || 'Onbekende fout' }, { status: 500 });
  }
}
