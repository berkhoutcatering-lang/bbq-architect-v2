/**
 * GET /api/menukaart/pdf/[offerId]
 *
 * Genereert server-side een menukaart-PDF voor de gegeven offerte met de
 * gekozen template + brand/custom cascade-overrides. Output: application/pdf.
 *
 * Multi-tenant: RLS doet automatisch tenant-isolatie via auth.uid().
 * Een gebruiker die niet bij de offerte hoort krijgt 404 (RLS filtert hem weg).
 *
 * Voorbeelden:
 *   /api/menukaart/pdf/123              → download voor offerte 123
 *   /api/menukaart/pdf/123?inline=1     → preview in browser (Content-Disposition: inline)
 *
 * Hard rule (BBQ Architect):
 *   - geen AI-derived allergenen (alleen uit menu_data.dishes.allergens)
 *   - geen AI-derived BTW (PDF toont geen prijzen, dus N/A)
 *   - re-auth via createServerSupabase + getUser()
 */

import { NextResponse, type NextRequest } from 'next/server';
import { renderToBuffer, type DocumentProps, Font } from '@react-pdf/renderer';
import { createServerSupabase } from '@/lib/supabase-server';
import { getTemplate, DEFAULT_TEMPLATE_ID, type Overrides } from '@/lib/menukaart/registry';
import { resolveCascade, flatten } from '@/lib/menukaart/cascade';
import { PdfFor } from '@/lib/menukaart/pdf';
import { DEMO_MENU, type MenuData, type MenuGang } from '@/lib/menukaart/menu-data';
import { createElement, type ReactElement } from 'react';
import path from 'path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* ── Font registratie ────────────────────────────────────────────────
   Runs once per cold-start. TTF-bronnen zijn variable-fonts uit het
   google/fonts repo, gedownload naar `public/fonts/menukaart/`.
   Disable hyphenation zodat lange brand-namen niet afgebroken worden. */
const FONTS_DIR = path.join(process.cwd(), 'public', 'fonts', 'menukaart');

let _fontsRegistered = false;
function ensureFontsRegistered() {
    if (_fontsRegistered) return;
    _fontsRegistered = true;

    Font.registerHyphenationCallback((word: string) => [word]);

    const families: Array<{ family: string; file: string }> = [
        { family: 'Cormorant Garamond', file: 'cormorant-garamond.ttf' },
        { family: 'Oswald', file: 'oswald.ttf' },
        { family: 'Space Grotesk', file: 'space-grotesk.ttf' },
        { family: 'IBM Plex Mono', file: 'ibm-plex-mono.ttf' },
        { family: 'Bebas Neue', file: 'bebas-neue.ttf' },
        { family: 'Caveat', file: 'caveat.ttf' },
        { family: 'Playfair Display', file: 'playfair-display.ttf' },
        { family: 'Rubik', file: 'rubik.ttf' },
        { family: 'Inter', file: 'inter.ttf' },
        { family: 'Lora', file: 'lora.ttf' },
    ];

    for (const { family, file } of families) {
        try {
            const src = path.join(FONTS_DIR, file);
            // Variable fonts: register zowel normal als italic style om resolve-errors
            // te vermijden in templates die fontStyle:'italic' gebruiken (zelfde TTF —
            // niet alle families hebben échte italic glyphs, maar geen render-error).
            // Voor exacte italic-fidelity: download italic TTF en wijs hier toe.
            Font.register({
                family,
                fonts: [
                    { src, fontWeight: 'normal', fontStyle: 'normal' },
                    { src, fontWeight: 'medium', fontStyle: 'normal' },
                    { src, fontWeight: 'semibold', fontStyle: 'normal' },
                    { src, fontWeight: 'bold', fontStyle: 'normal' },
                    { src, fontWeight: 'normal', fontStyle: 'italic' },
                    { src, fontWeight: 'medium', fontStyle: 'italic' },
                    { src, fontWeight: 'bold', fontStyle: 'italic' },
                ],
            });
        } catch (err) {
            // eslint-disable-next-line no-console
            console.warn(`[menukaart/pdf] Font registration failed for ${family}:`, err);
        }
    }
}

type Gerecht = {
    id: number | string;
    naam: string;
    beschrijving?: string | null;
    categorie?: string | null;
    gang_slug?: string | null;
    allergenen?: string[] | string | null;
};

function normaliseAllergens(raw: unknown): string[] {
    if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
    if (typeof raw === 'string') {
        return raw
            .split(/[\s,]+/)
            .map(s => s.trim())
            .filter(Boolean);
    }
    return [];
}

function buildMenuData(menuIds: number[], gerechten: Gerecht[], recepten: Gerecht[], logoUrl: string | null): MenuData {
    if (menuIds.length === 0) return { ...DEMO_MENU, logoUrl };

    const findById = (id: number): Gerecht | null => {
        const r = recepten.find(x => Number(x.id) === id);
        if (r) return r;
        const g = gerechten.find(x => Number(x.id) === id);
        return g ?? null;
    };

    const resolved = menuIds.map(findById).filter(Boolean) as Gerecht[];
    if (resolved.length === 0) return { ...DEMO_MENU, logoUrl };

    const groupsByCat: Record<string, MenuGang> = {};
    for (const r of resolved) {
        const cat = r.gang_slug || r.categorie || 'Hoofdgerechten';
        if (!groupsByCat[cat]) groupsByCat[cat] = { name: cat, dishes: [] };
        groupsByCat[cat].dishes.push({
            name: r.naam || '—',
            description: r.beschrijving ?? undefined,
            allergens: normaliseAllergens(r.allergenen),
        });
    }
    return { gangen: Object.values(groupsByCat), logoUrl };
}

function parseMenuField(raw: unknown): number[] {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw.map(x => Number(x)).filter(Boolean);
    if (typeof raw === 'string') {
        try {
            const p = JSON.parse(raw);
            return Array.isArray(p) ? p.map((x: unknown) => Number(x)).filter(Boolean) : [];
        } catch {
            return [];
        }
    }
    return [];
}

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ offerId: string }> },
) {
    try {
        ensureFontsRegistered();
        const { offerId } = await params;
        const supabase = await createServerSupabase();

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

        // Tenant-isolation gebeurt via RLS — een offerte van een andere tenant
        // wordt simpelweg niet teruggegeven (404 ipv 403, om existence-leaks te vermijden).
        const { data: offer, error: offerErr } = await supabase
            .from('offertes')
            .select('id, nummer, client_naam, datum, menukaart_template_id, menukaart_overrides, event_id')
            .eq('id', offerId)
            .maybeSingle();

        if (offerErr) return NextResponse.json({ error: offerErr.message }, { status: 500 });
        if (!offer) return NextResponse.json({ error: 'Offerte niet gevonden' }, { status: 404 });

        // Settings (tenant brand-overrides + logo)
        const { data: settings } = await supabase
            .from('settings')
            .select('logo_url, menukaart_template_id, menukaart_overrides')
            .limit(1)
            .maybeSingle();

        const templateId =
            (offer.menukaart_template_id as string | null) ||
            (settings?.menukaart_template_id as string | null) ||
            DEFAULT_TEMPLATE_ID;

        const template = getTemplate(templateId);
        const brand = (settings?.menukaart_overrides as Overrides) ?? {};
        const custom = (offer.menukaart_overrides as Overrides) ?? {};
        const resolved = resolveCascade(template, brand, custom);
        const flat = flatten(resolved) as Overrides;

        // Menu data — uit het gekoppelde event (de menu-ids), met gerechten/recepten lookup
        let menuData: MenuData = { ...DEMO_MENU, logoUrl: settings?.logo_url ?? null };
        if (offer.event_id) {
            const { data: event } = await supabase
                .from('events')
                .select('menu')
                .eq('id', offer.event_id)
                .maybeSingle();

            const menuIds = parseMenuField(event?.menu);
            if (menuIds.length > 0) {
                const { data: ger } = await supabase.from('gerechten').select('id, naam, beschrijving, categorie, gang_slug, allergenen');
                menuData = buildMenuData(menuIds, (ger as Gerecht[]) ?? [], [], settings?.logo_url ?? null);
            }
        }

        const PdfComponent = PdfFor(template.id);
        // createElement gebruikt om JSX-loose syntax buiten .tsx te ondersteunen.
        // De PdfComponent retourneert een <Document>; cast naar DocumentProps zodat
        // @react-pdf/renderer's renderToBuffer signatuur matched.
        const element = createElement(PdfComponent, { overrides: flat, data: menuData }) as unknown as ReactElement<DocumentProps>;
        const buffer = await renderToBuffer(element);

        const inline = req.nextUrl.searchParams.get('inline') === '1';
        const filename = `menukaart-${offer.nummer || offer.client_naam || offer.id}-${template.id}.pdf`
            .replace(/[^a-zA-Z0-9-_.]/g, '_');

        return new NextResponse(new Uint8Array(buffer), {
            status: 200,
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Length': String(buffer.length),
                'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${filename}"`,
                'Cache-Control': 'private, max-age=60',
            },
        });
    } catch (err) {
        const msg = err instanceof Error ? err.message : 'Onbekende fout';
        // eslint-disable-next-line no-console
        console.error('[/api/menukaart/pdf] failed:', msg);
        return NextResponse.json({ error: 'PDF maken mislukt: ' + msg }, { status: 500 });
    }
}
