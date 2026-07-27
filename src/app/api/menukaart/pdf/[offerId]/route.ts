/**
 * GET/POST /api/menukaart/pdf/[offerId]
 *
 * Genereert server-side een menukaart-PDF voor de gegeven offerte met de
 * gekozen template + brand/custom cascade-overrides. Output: application/pdf.
 *
 * GET  → leest álles uit de DB (share-link, e-mail-attachment, print-preview).
 * POST → accepteert een live preview-body zodat de Menu-&-menukaart-canva de
 *        actuele selectie + styling kan downloaden zonder eerst te saven.
 *        Zonder dit pad rendert de PDF stale DB-state (Sam, 2026-06-04:
 *        dessert "Bavarois" ipv "Aardbeien dessert" in de canva).
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
import { emptyMenu, type MenuData, type MenuGang } from '@/lib/menukaart/menu-data';
import { buildMenuData as buildMenuDataFromSelectie, countDishes } from '@/lib/menukaart/build-menu-data';
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

    /* `italic` is optioneel: alleen 3 serifs hebben een aparte italic TTF
       gedownload uit Google Fonts (Cormorant Garamond, Playfair Display, Lora).
       Voor de overige families wijzen we het normale TTF toe aan italic-style om
       resolve-errors te vermijden — er is geen echte italic-rendering, maar
       templates die fontStyle:'italic' gebruiken crashen niet. */
    const families: Array<{ family: string; file: string; italic?: string }> = [
        { family: 'Cormorant Garamond', file: 'cormorant-garamond.ttf', italic: 'cormorant-garamond-italic.ttf' },
        { family: 'Oswald', file: 'oswald.ttf' },
        { family: 'Space Grotesk', file: 'space-grotesk.ttf' },
        { family: 'IBM Plex Mono', file: 'ibm-plex-mono.ttf' },
        { family: 'Bebas Neue', file: 'bebas-neue.ttf' },
        { family: 'Caveat', file: 'caveat.ttf' },
        { family: 'Playfair Display', file: 'playfair-display.ttf', italic: 'playfair-display-italic.ttf' },
        { family: 'Rubik', file: 'rubik.ttf' },
        { family: 'Inter', file: 'inter.ttf' },
        { family: 'Lora', file: 'lora.ttf', italic: 'lora-italic.ttf' },
    ];

    for (const { family, file, italic } of families) {
        try {
            const src = path.join(FONTS_DIR, file);
            const italicSrc = italic ? path.join(FONTS_DIR, italic) : src;
            Font.register({
                family,
                fonts: [
                    { src, fontWeight: 'normal', fontStyle: 'normal' },
                    { src, fontWeight: 'medium', fontStyle: 'normal' },
                    { src, fontWeight: 'semibold', fontStyle: 'normal' },
                    { src, fontWeight: 'bold', fontStyle: 'normal' },
                    { src: italicSrc, fontWeight: 'normal', fontStyle: 'italic' },
                    { src: italicSrc, fontWeight: 'medium', fontStyle: 'italic' },
                    { src: italicSrc, fontWeight: 'bold', fontStyle: 'italic' },
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

function buildMenuData(menuIds: number[], gerechten: Gerecht[], recepten: Gerecht[], logoUrl: string | null, logoUrlDonker: string | null): MenuData {
    if (menuIds.length === 0) return emptyMenu(logoUrl, logoUrlDonker);

    const findById = (id: number): Gerecht | null => {
        const r = recepten.find(x => Number(x.id) === id);
        if (r) return r;
        const g = gerechten.find(x => Number(x.id) === id);
        return g ?? null;
    };

    const resolved = menuIds.map(findById).filter(Boolean) as Gerecht[];
    if (resolved.length === 0) return emptyMenu(logoUrl, logoUrlDonker);

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
    return { gangen: Object.values(groupsByCat), logoUrl, logoUrlDonker };
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

/* Body-shape voor live-preview overrides — alle velden optioneel; ontbrekende
 * velden vallen door naar de DB-state. Normalisatie is paranoïde: alleen
 * { [gangSlug:string]: string[] } wordt geaccepteerd voor menuSelectie. */
type LiveOverrides = {
    menuSelectie?: Record<string, string[]>;
    templateId?: string;
    customOverrides?: Overrides;
};

function normaliseLiveBody(raw: unknown): LiveOverrides {
    if (!raw || typeof raw !== 'object') return {};
    const r = raw as Record<string, unknown>;
    const out: LiveOverrides = {};
    if (r.menuSelectie && typeof r.menuSelectie === 'object' && !Array.isArray(r.menuSelectie)) {
        const sel: Record<string, string[]> = {};
        for (const [k, v] of Object.entries(r.menuSelectie as Record<string, unknown>)) {
            if (Array.isArray(v)) {
                const names = v.filter((n): n is string => typeof n === 'string');
                if (names.length > 0) sel[k] = names;
            }
        }
        out.menuSelectie = sel;
    }
    if (typeof r.templateId === 'string' && r.templateId.length > 0 && r.templateId.length < 64) {
        out.templateId = r.templateId;
    }
    if (r.customOverrides && typeof r.customOverrides === 'object' && !Array.isArray(r.customOverrides)) {
        out.customOverrides = r.customOverrides as Overrides;
    }
    return out;
}

async function renderMenukaartPdf(
    req: NextRequest,
    offerId: string,
    live: LiveOverrides,
): Promise<NextResponse> {
    try {
        ensureFontsRegistered();
        const supabase = await createServerSupabase();

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

        // Tenant-isolation gebeurt via RLS — een offerte van een andere tenant
        // wordt simpelweg niet teruggegeven (404 ipv 403, om existence-leaks te vermijden).
        const { data: offer, error: offerErr } = await supabase
            .from('offertes')
            .select('id, nummer, client_naam, datum, menukaart_template_id, menukaart_overrides, event_id, menu_selectie')
            .eq('id', offerId)
            .maybeSingle();

        if (offerErr) return NextResponse.json({ error: offerErr.message }, { status: 500 });
        if (!offer) return NextResponse.json({ error: 'Offerte niet gevonden' }, { status: 404 });

        // Settings (tenant brand-overrides + logo + dark-logo voor menukaart op donker bg)
        const { data: settings } = await supabase
            .from('settings')
            .select('logo_url, logo_dark_url, menukaart_template_id, menukaart_overrides')
            .limit(1)
            .maybeSingle();

        // Live preview-overrides (POST) winnen van de DB-state — zo komt de
        // Download-PDF-knop in de canva altijd overeen met de live preview,
        // ook als de cateraar nog niet "Opslaan" heeft geklikt.
        const templateId =
            live.templateId ||
            (offer.menukaart_template_id as string | null) ||
            (settings?.menukaart_template_id as string | null) ||
            DEFAULT_TEMPLATE_ID;

        const template = getTemplate(templateId);
        const brand = (settings?.menukaart_overrides as Overrides) ?? {};
        const custom = live.customOverrides ?? (offer.menukaart_overrides as Overrides) ?? {};
        const resolved = resolveCascade(template, brand, custom);
        const flat = flatten(resolved) as Overrides;

        const logoUrl = settings?.logo_url ?? null;
        const logoUrlDonker = settings?.logo_dark_url ?? null;
        // Allergenen-keuze volgt dezelfde cascade als de canva (default uit).
        const showAllergens = flat.showAllergens ?? false;

        // Menu data — PRIMAIR uit offer.menu_selectie (wat de "Menu & menukaart"-
        // canva schrijft). Zelfde gestructureerde pipeline als de live-preview op
        // het scherm, zodat de PDF identiek is aan wat de cateraar zag.
        // Fallback: gekoppeld event (legacy menu-ids). Default = empty-state
        // (NOOIT DEMO_MENU naar productie — klant zou Hop & Bites-demo zien).
        let menuData: MenuData = emptyMenu(logoUrl, logoUrlDonker);
        const offerSelectie = live.menuSelectie ?? (offer.menu_selectie as Record<string, string[]> | null);
        if (offerSelectie && countDishes(offerSelectie) > 0) {
            const [{ data: ger }, { data: gangen }] = await Promise.all([
                supabase.from('gerechten').select('naam, beschrijving, gang_slug, allergenen'),
                supabase.from('gangen').select('slug, naam, volgorde').order('volgorde'),
            ]);
            menuData = buildMenuDataFromSelectie(offerSelectie, ger ?? [], gangen ?? [], { logoUrl, logoUrlDonker, showAllergens });
        } else if (offer.event_id) {
            const { data: event } = await supabase
                .from('events')
                .select('menu')
                .eq('id', offer.event_id)
                .maybeSingle();

            const menuIds = parseMenuField(event?.menu);
            if (menuIds.length > 0) {
                const { data: ger } = await supabase.from('gerechten').select('id, naam, beschrijving, gang_slug, allergenen');
                menuData = buildMenuData(menuIds, (ger as Gerecht[]) ?? [], [], logoUrl, logoUrlDonker);
            }
        }

        // Sluitstuk: respecteer de allergenen-toggle op álle paden (ook de legacy
        // event-fallback) — geen allergenen op de kaart tenzij bewust aangezet.
        if (!showAllergens) {
            menuData = {
                ...menuData,
                gangen: menuData.gangen.map((g) => ({ ...g, dishes: g.dishes.map((d) => ({ ...d, allergens: undefined })) })),
            };
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

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ offerId: string }> },
) {
    const { offerId } = await params;
    return renderMenukaartPdf(req, offerId, {});
}

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ offerId: string }> },
) {
    const { offerId } = await params;
    let body: unknown = {};
    try { body = await req.json(); } catch { /* lege of ongeldige body — fallback op DB */ }
    return renderMenukaartPdf(req, offerId, normaliseLiveBody(body));
}
