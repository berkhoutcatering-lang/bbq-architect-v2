/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useOrg } from '@/lib/OrgContext';

const STORE_KEY = 'bbq_brand_logo_v1';

export type BrandLogo = {
    logoUrl: string | null;
    logoDarkUrl: string | null;
    bedrijfsnaam: string | null;
};

function readCache(): BrandLogo | null {
    if (typeof window === 'undefined') return null;
    try {
        const raw = localStorage.getItem(STORE_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch { return null; }
}

function writeCache(b: BrandLogo) {
    if (typeof window === 'undefined') return;
    try { localStorage.setItem(STORE_KEY, JSON.stringify(b)); } catch { /* noop */ }
}

/**
 * Shared hook om het bedrijfslogo op te halen uit settings.
 * Gebruikt localStorage cache voor instant load; ververst via supabase.
 */
export function useBrandLogo(): BrandLogo {
    const { orgId } = useOrg();
    const [brand, setBrand] = useState<BrandLogo>(() =>
        readCache() || { logoUrl: null, logoDarkUrl: null, bedrijfsnaam: null }
    );

    useEffect(() => {
        if (!orgId) return;
        let cancelled = false;
        (async () => {
            const { data } = await supabase
                .from('settings')
                .select('logo_url, logo_dark_url, bedrijfsnaam')
                .eq('organization_id', orgId)
                .maybeSingle();
            if (cancelled || !data) return;
            const next: BrandLogo = {
                logoUrl: (data as any).logo_url || null,
                logoDarkUrl: (data as any).logo_dark_url || null,
                bedrijfsnaam: (data as any).bedrijfsnaam || null,
            };
            setBrand(next);
            writeCache(next);
        })();
        return () => { cancelled = true; };
    }, [orgId]);

    return brand;
}
