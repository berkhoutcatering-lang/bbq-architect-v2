/**
 * DELETE /api/extension-keys/[id] — revoke een key (soft, sets revoked_at)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';

export const runtime = 'nodejs';

export async function DELETE(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
    const { id } = await context.params;
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

    const { error } = await supabase
        .from('org_extension_api_keys')
        .update({ revoked_at: new Date().toISOString() })
        .eq('id', id)
        .eq('user_id', user.id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
}
