/* GET /api/leveranciers/list — voor dropdown bij import-flow.
   RLS doet org-filter. */

import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';

export async function GET() {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

    const { data, error } = await supabase
        .from('leveranciers')
        .select('id, naam')
        .order('naam');

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ leveranciers: data ?? [] });
}
