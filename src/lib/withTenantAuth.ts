/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';
import type { SupabaseClient } from '@supabase/supabase-js';

/* withTenantAuth — centrale wrapper voor API-routes die tenant-data lezen of
   schrijven. Vervangt de pattern waar elke route z'n eigen auth-check doet
   (43+ files), zodat één plek garandeert:
   - 401 als geen ingelogde user
   - 403 als user geen actief org-lid is
   - handler krijgt typed { orgId, userId, supabase } zodat je niet per
     ongeluk een verkeerde org-id uit de body kan trusten

   Pillar #4 / OWASP A01: voorkomt accidentele cross-tenant lekkage.

   Twee modi:
   - `withTenantAuth(handler)` — vereist auth + actieve org membership
   - `withOptionalTenantAuth(handler)` — auth optioneel, handler krijgt
     orgId=null als anon. Voor publieke endpoints zoals /api/q/[id]. */

export interface TenantAuthCtx {
    /** Supabase client met user-session — RLS werkt automatisch. */
    supabase: SupabaseClient;
    /** UUID van de actieve organization. Nooit null in `withTenantAuth`. */
    orgId: string;
    /** UUID van de ingelogde user. Nooit null in `withTenantAuth`. */
    userId: string;
}

export interface OptionalTenantAuthCtx {
    supabase: SupabaseClient;
    orgId: string | null;
    userId: string | null;
}

type AnyHandler<T> = (req: NextRequest, ctx: T, params?: any) => Promise<Response> | Response;

/* Strict variant — vereist ingelogd én actief org-lid. Gebruik dit voor 99%
   van de API-routes (alle CRUD op tenant-data). */
export function withTenantAuth(handler: AnyHandler<TenantAuthCtx>) {
    return async (req: NextRequest, params?: any): Promise<Response> => {
        let supabase: SupabaseClient;
        try {
            supabase = await createServerSupabase();
        } catch (e: any) {
            return NextResponse.json({ error: 'Server misconfiguratie: ' + (e.message || 'supabase init') }, { status: 500 });
        }

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });
        }

        const { data: mem } = await supabase
            .from('organization_members')
            .select('organization_id')
            .eq('user_id', user.id)
            .eq('status', 'active')
            .limit(1)
            .maybeSingle();

        const orgId = mem?.organization_id;
        if (!orgId) {
            return NextResponse.json({ error: 'Geen actieve organisatie gekoppeld' }, { status: 403 });
        }

        return handler(req, { supabase, orgId, userId: user.id }, params);
    };
}

/* Optional variant — handler draait ook anoniem maar krijgt orgId=null.
   Voor publieke routes (quote-portal, public lead-form). Logging mag dan
   geen org-koppeling forceren. */
export function withOptionalTenantAuth(handler: AnyHandler<OptionalTenantAuthCtx>) {
    return async (req: NextRequest, params?: any): Promise<Response> => {
        let supabase: SupabaseClient;
        try {
            supabase = await createServerSupabase();
        } catch (e: any) {
            return NextResponse.json({ error: 'Server misconfiguratie: ' + (e.message || 'supabase init') }, { status: 500 });
        }

        const { data: { user } } = await supabase.auth.getUser();
        let orgId: string | null = null;
        let userId: string | null = null;
        if (user) {
            userId = user.id;
            const { data: mem } = await supabase
                .from('organization_members')
                .select('organization_id')
                .eq('user_id', user.id)
                .eq('status', 'active')
                .limit(1)
                .maybeSingle();
            orgId = mem?.organization_id ?? null;
        }

        return handler(req, { supabase, orgId, userId }, params);
    };
}
