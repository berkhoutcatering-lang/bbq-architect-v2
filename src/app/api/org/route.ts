import { NextResponse, type NextRequest } from 'next/server';
import { createServiceSupabase } from '@/lib/supabase-server';

// POST /api/org — Create organization + link user as Admin
export async function POST(request: NextRequest) {
  try {
    const { name, userId } = await request.json();

    if (!name || !userId) {
      return NextResponse.json({ error: 'name en userId zijn verplicht' }, { status: 400 });
    }

    const sb = createServiceSupabase();

    // Generate slug from name
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      + '-' + Math.random().toString(36).slice(2, 6);

    // Create organization
    const { data: org, error: orgErr } = await sb
      .from('organizations')
      .insert({ name, slug })
      .select()
      .single();

    if (orgErr) {
      return NextResponse.json({ error: orgErr.message }, { status: 500 });
    }

    // Link user as Admin
    const { error: memberErr } = await sb
      .from('organization_members')
      .insert({
        organization_id: org.id,
        user_id: userId,
        role: 'Admin',
        status: 'active',
      });

    if (memberErr) {
      return NextResponse.json({ error: memberErr.message }, { status: 500 });
    }

    // Create default settings for this org
    const { error: settingsErr } = await sb
      .from('settings')
      .insert({
        organization_id: org.id,
        bedrijfsnaam: name,
        ondertitel: '',
        email: '',
        telefoon: '',
        adres: '',
        kvk: '',
        btw: '',
        iban: '',
        factuur_prefix: 'F',
        offerte_prefix: 'O',
        default_btw: 21,
        betaaltermijn: 14,
        offerte_geldig: 30,
      });

    if (settingsErr) {
      console.warn('Settings creation warning:', settingsErr.message);
    }

    // Update profile with organization_id
    await sb
      .from('profiles')
      .update({ organization_id: org.id })
      .eq('user_id', userId);

    return NextResponse.json({ organization: org });
  } catch (err) {
    console.error('Org creation error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
