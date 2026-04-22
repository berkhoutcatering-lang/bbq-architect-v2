/* eslint-disable @next/next/no-img-element */
/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useOrg } from '@/lib/OrgContext';

/*
 * BrandPlaque — bedrijfslogo vast linksboven op elke pagina.
 * Groot en goed zichtbaar (geen watermark), als een badge met
 * olijfgoud-ring. Altijd op dezelfde positie, elke pagina.
 */

const SUPPRESSED_PATHS = [
    '/login',
    '/signup',
    '/invite',
    '/q/',            // publieke offerte-view — eigen branding
];

const STORE_KEY = 'bbq_brand_plaque_v1';

type BrandSettings = {
    logoUrl: string | null;
    logoDarkUrl: string | null;
    bedrijfsnaam: string | null;
};

function readCache(): BrandSettings | null {
    if (typeof window === 'undefined') return null;
    try {
        const raw = localStorage.getItem(STORE_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch { return null; }
}

function writeCache(s: BrandSettings) {
    if (typeof window === 'undefined') return;
    try { localStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch { /* noop */ }
}

export default function BrandWatermark() {
    const pathname = usePathname() || '';
    const { orgId } = useOrg();
    const [brand, setBrand] = useState<BrandSettings | null>(() => readCache());

    const suppressed = SUPPRESSED_PATHS.some(p => pathname.startsWith(p));

    useEffect(() => {
        if (!orgId || suppressed) return;
        let cancelled = false;
        (async () => {
            const { data } = await supabase
                .from('settings')
                .select('logo_url, logo_dark_url, bedrijfsnaam')
                .eq('organization_id', orgId)
                .maybeSingle();
            if (cancelled || !data) return;
            const s: BrandSettings = {
                logoUrl: (data as any).logo_url || null,
                logoDarkUrl: (data as any).logo_dark_url || null,
                bedrijfsnaam: (data as any).bedrijfsnaam || null,
            };
            setBrand(s);
            writeCache(s);
        })();
        return () => { cancelled = true; };
    }, [orgId, suppressed]);

    if (suppressed) return null;

    const logo = brand?.logoDarkUrl || brand?.logoUrl;
    if (!logo) return null;

    return (
        <div className="brand-plaque" aria-hidden="true">
            <div className="bp-ring" />
            <div className="bp-inner">
                <img src={logo} alt="" className="bp-logo" />
            </div>
        </div>
    );
}
