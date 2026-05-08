import { NextResponse } from 'next/server';
import { createServiceSupabase } from '@/lib/supabase-server';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  if (!token) {
    return NextResponse.json({ error: 'Geen publieke token' }, { status: 400 });
  }

  const supabase = createServiceSupabase();
  const { data: offer, error } = await supabase
    .from('offertes')
    .select('*')
    .eq('public_token', token)
    .single();

  if (error || !offer) {
    return NextResponse.json({ error: 'Offerte niet gevonden of verlopen.' }, { status: 404 });
  }

  let settings = null;
  if (offer.organization_id) {
    const { data } = await supabase
      .from('settings')
      .select('bedrijfsnaam, ondertitel, email, telefoon, adres, website, betaalvoorwaarden, logo_url, brand_primary')
      .eq('organization_id', offer.organization_id)
      .single();
    settings = data ?? null;
  }

  return NextResponse.json({ offer, settings });
}
