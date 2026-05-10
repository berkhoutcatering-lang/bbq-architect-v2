/* GET /api/gerechten/list — gerechten voor /inspiratie/gerechten
   Returnt minimal-set: id, naam, beschrijving, prijs, total_cost_cents, is_in_wizard.
   RLS doet org-filter. Aparte route omdat browser-supabase-singleton race-conditions
   gaf bij first-render — server-side is deterministisch. */

import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';

export async function GET() {
    const supabase = await createServerSupabase();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
        return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });
    }

    const { data, error } = await supabase
        .from('gerechten')
        .select('id, naam, beschrijving, verkoopprijs, total_cost_cents, is_in_wizard')
        .order('naam');

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ gerechten: data ?? [] });
}
