/**
 * De catalogus naar buiten: wat live staat, en één concept via een
 * voorbeeldlink. Plus het sein naar de website als er iets verandert.
 * Plan: docs/OPDRACHT-BBQ-ARCHITECT-CATALOGUS.md (blokken C2 en C8).
 *
 * De website (hopbites.nl) haalt GET /api/public-winkel/{slug}/catalogus op,
 * cachet hem onder de tag 'catalogus' en ververst zodra wij seinen
 * (POST {site_url}/api/catalogus/ververs). Mislukt het sein, dan pakt de site
 * het binnen vijf minuten alsnog op.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServiceSupabase } from '@/lib/supabase-server';
import {
    CATALOGUS_ARTIKEL_KOLOMMEN,
    CATALOGUS_PRODUCT_KOLOMMEN,
    naarCatalogus,
    type ArtikelRij,
    type Catalogus,
    type CatalogusProduct,
    type ProductRij,
} from './productsoorten';

/* ── De voorbeeldlink ─────────────────────────────────────────────────────── */

const VOORBEELD_GELDIG_MS = 24 * 60 * 60 * 1000;

function geheim(): string | null {
    return process.env.CATALOGUS_VOORBEELD_GEHEIM || null;
}

function b64(s: string): string {
    return Buffer.from(s).toString('base64url');
}

function handtekening(inhoud: string, sleutel: string): string {
    return createHmac('sha256', sleutel).update(inhoud).digest('base64url');
}

/** Een token dat één concept-product 24 uur laat zien. null zonder geheim. */
export function maakVoorbeeldToken(orgId: string, productId: string, nu = Date.now(), sleutel = geheim()): string | null {
    if (!sleutel) return null;
    const inhoud = b64(JSON.stringify({ o: orgId, p: productId, t: nu + VOORBEELD_GELDIG_MS }));
    return `${inhoud}.${handtekening(inhoud, sleutel)}`;
}

/** Het product-id uit een geldig token voor deze organisatie, anders null. */
export function leesVoorbeeldToken(token: string, orgId: string, nu = Date.now(), sleutel = geheim()): string | null {
    if (!sleutel || typeof token !== 'string' || token.length > 600) return null;
    const [inhoud, hand] = token.split('.');
    if (!inhoud || !hand) return null;
    const verwacht = Buffer.from(handtekening(inhoud, sleutel));
    const gekregen = Buffer.from(hand);
    if (verwacht.length !== gekregen.length || !timingSafeEqual(verwacht, gekregen)) return null;
    try {
        const d = JSON.parse(Buffer.from(inhoud, 'base64url').toString('utf8')) as { o?: string; p?: string; t?: number };
        if (d.o !== orgId || typeof d.p !== 'string' || typeof d.t !== 'number' || d.t < nu) return null;
        return d.p;
    } catch {
        return null;
    }
}

/* ── Ophalen ──────────────────────────────────────────────────────────────── */

export type CatalogusUitkomst = { status: 200; body: Catalogus } | { status: 404; body: { fout: string } };

/**
 * De catalogus van een organisatie: alles wat live staat en actief is, met
 * de prijs van het artikel met dezelfde slug. Met een geldig voorbeeldtoken
 * komt dat ene concept-product erbij (concept: true).
 */
export async function haalCatalogus(orgSlug: string, voorbeeld: string | null, client?: SupabaseClient): Promise<CatalogusUitkomst> {
    const sb = client ?? createServiceSupabase();
    const { data: org } = await sb.from('organizations').select('id').eq('slug', orgSlug).maybeSingle();
    if (!org) return { status: 404, body: { fout: 'onbekend' } };

    const voorbeeldId = voorbeeld ? leesVoorbeeldToken(voorbeeld, org.id) : null;

    const [{ data: live }, { data: concept }, { data: artikelen }] = await Promise.all([
        sb.from('winkel_producten').select(CATALOGUS_PRODUCT_KOLOMMEN).eq('organization_id', org.id).eq('pagina_status', 'live').eq('actief', true),
        voorbeeldId
            ? sb.from('winkel_producten').select(CATALOGUS_PRODUCT_KOLOMMEN).eq('organization_id', org.id).eq('id', voorbeeldId).maybeSingle()
            : Promise.resolve({ data: null }),
        sb.from('winkel_artikelen').select(CATALOGUS_ARTIKEL_KOLOMMEN).eq('organization_id', org.id),
    ]);

    const opSlug = new Map(((artikelen ?? []) as ArtikelRij[]).map((a) => [a.slug, a]));
    const rijen = [...((live ?? []) as ProductRij[])];
    if (concept && !rijen.some((r) => r.id === (concept as ProductRij).id)) rijen.push(concept as ProductRij);

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const producten = rijen
        .map((r) => naarCatalogus(r, r.slug ? opSlug.get(r.slug) ?? null : null, url))
        .filter((p): p is CatalogusProduct => p !== null)
        .sort((a, b) => a.soort.localeCompare(b.soort) || a.volgorde - b.volgorde || a.naam.localeCompare(b.naam, 'nl'));

    return { status: 200, body: { versie: 1, producten } };
}

/* ── Het sein naar de website ─────────────────────────────────────────────── */

export type SeinUitkomst = 'verstuurd' | 'geen-site' | 'geen-geheim' | 'mislukt';

/**
 * Laat de website de catalogus opnieuw ophalen. Twee pogingen; mislukt het,
 * dan is de site binnen vijf minuten alsnog bij (revalidate 300).
 */
export async function seinWebsite(orgId: string, client?: SupabaseClient, fetcher: typeof fetch = fetch): Promise<SeinUitkomst> {
    const sleutel = process.env.HB_VERVERS_GEHEIM;
    if (!sleutel) return 'geen-geheim';
    const sb = client ?? createServiceSupabase();
    const { data } = await sb.from('winkel_instellingen').select('site_url').eq('organization_id', orgId).maybeSingle();
    const site = (data?.site_url as string | null)?.replace(/\/$/, '');
    if (!site) return 'geen-site';
    for (let poging = 0; poging < 2; poging++) {
        try {
            const r = await fetcher(`${site}/api/catalogus/ververs`, {
                method: 'POST',
                headers: { 'x-hb-ververs': sleutel },
                signal: AbortSignal.timeout(5000),
            });
            if (r.ok) return 'verstuurd';
        } catch {
            /* volgende poging */
        }
    }
    return 'mislukt';
}
