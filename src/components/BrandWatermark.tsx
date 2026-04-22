/* eslint-disable @next/next/no-img-element */
/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useOrg } from '@/lib/OrgContext';
import { Flame } from 'lucide-react';

/*
 * BrandWatermark — subtiel maar groot bedrijfslogo (~320px, 7% opacity)
 * rechtsonder vast gepositioneerd + "Powered by BBQ Architect" micro-footer.
 * Negeert pagina's waar het zou storen (service mode, editors, modals).
 */

const SUPPRESSED_PATHS = [
    '/service',           // kitchen display — geen watermark
    '/offerte-editor',    // editor heeft eigen preview
    '/template-editor',   // template editor
    '/q/',                // publieke offerte-view
    '/login',
    '/signup',
    '/invite',
];

const STORE_KEY = 'bbq_brand_watermark_settings_v1';

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

    /* Suppress op pagina's waar het stoort */
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
    const companyName = brand?.bedrijfsnaam || 'Jouw bedrijf';

    return (
        <>
            {/* RECHTS-ONDER: subtiel bedrijfslogo watermark */}
            {logo && (
                <div className="brand-watermark" aria-hidden="true">
                    <div className="bw-glow" />
                    <img src={logo} alt="" className="bw-logo" />
                </div>
            )}

            {/* LINKS-ONDER: Powered-by chip met BBQ Architect flame */}
            <div className="brand-poweredby" aria-hidden="true">
                <Flame size={11} strokeWidth={2.5} className="bw-flame" />
                <span className="bw-powered-lbl">Powered by</span>
                <span className="bw-powered-brand">BBQ Architect</span>
                {companyName && <span className="bw-powered-sep">·</span>}
                {companyName && <span className="bw-powered-org">{companyName}</span>}
            </div>
        </>
    );
}
