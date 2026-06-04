/**
 * buildMenuData — de canonieke brug tussen de menu-keuze en de opgemaakte menukaart.
 *
 * Zet de offerte/event `menu_selectie` ({ gang_slug: [gerecht-namen] }) om naar
 * de `MenuData`-shape die alle 10 menukaart-templates (PreviewFor) verwachten.
 * Dit is de kern van de "automatische menukaart": kies gerechten → menukaart
 * vult zichzelf met beschrijving + allergenen uit de interne gerechten-bibliotheek.
 *
 * Eén bron, één pipeline: offerte-canva, styling-editor, PDF én portaal lezen
 * allemaal via deze helper, zodat de menukaart overal identiek is.
 *
 * Hard rule (BBQ Architect): allergenen NOOIT AI-gegenereerd — ze komen
 * 1-op-1 uit `gerechten.allergenen` (EU 1169/2011 codes) en worden hier alleen
 * gefilterd op geldige codes, niet afgeleid.
 */

import type { MenuData, MenuGang, MenuDish } from './menu-data';
import { ALLERGEN_MAP } from './menu-data';

/** Structurele input-shapes — bewust losjes zodat zowel `Gerecht` als een
 *  lichte select-projectie passen zonder harde type-koppeling. */
export interface GerechtForMenu {
    naam?: string | null;
    beschrijving?: string | null;
    gang_slug?: string | null;
    categorie?: string | null;
    allergenen?: unknown;
}

export interface GangForMenu {
    slug?: string | null;
    naam?: string | null;
    volgorde?: number | null;
}

export interface BuildMenuDataOpts {
    logoUrl?: string | null;
    logoUrlDonker?: string | null;
    /** Allergenen op de kaart? Default false (Sam: "geen allergenen tenzij ik
     *  dat wens"). Wanneer false strippen we alle allergenen — dan vallen zowel
     *  de inline-codes als de legenda overal weg, in elke template. Codes komen
     *  altijd uit gerechten.allergenen, nooit AI-afgeleid (hard rule). */
    showAllergens?: boolean;
}

/** Normaliseer een ruwe allergenen-waarde naar geldige EU-codes (G, E, L, ...).
 *  Accepteert codes ('G') én volledige namen ('Gluten') en mapt namen terug
 *  naar hun code. Onbekende waarden worden weggelaten (nooit gokken). */
function normalizeAllergens(raw: unknown): string[] {
    if (!Array.isArray(raw)) return [];
    const nameToCode = new Map<string, string>();
    for (const [code, name] of Object.entries(ALLERGEN_MAP)) {
        nameToCode.set(name.toLowerCase(), code);
    }
    const out: string[] = [];
    const seen = new Set<string>();
    for (const item of raw) {
        if (typeof item !== 'string') continue;
        const trimmed = item.trim();
        if (!trimmed) continue;
        let code: string | undefined;
        if (ALLERGEN_MAP[trimmed]) code = trimmed;                       // al een code
        else code = nameToCode.get(trimmed.toLowerCase());               // naam → code
        if (code && !seen.has(code)) { seen.add(code); out.push(code); }
    }
    return out;
}

/** Normaliseer een naam voor matching: lowercase, leestekens weg, spaties dicht. */
function normName(s: string): string {
    return s.toLowerCase().replace(/[.,;:!?'"]/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * Bouw een tolerante naam→gerecht resolver. Lost ook "drift" op tussen de
 * opgeslagen menu_selectie-naam en de huidige bibliotheek-naam:
 *   1. exacte (genormaliseerde) match
 *   2. unieke deel-match (bv. "Bavette" → "Gerookte bavette",
 *      "Sliders" → "Slider van de yoder Smoker", "Bavarois" → "Aardbeien bavaroise")
 * Alleen bij precies één kandidaat — nooit gokken bij meerdere treffers, zodat
 * we nooit de verkeerde beschrijving/allergenen koppelen (hard rule).
 */
function makeResolver(gerechten: GerechtForMenu[]): (raw: string) => GerechtForMenu | undefined {
    const exact = new Map<string, GerechtForMenu>();
    const all: { key: string; g: GerechtForMenu }[] = [];
    for (const g of gerechten) {
        const key = normName(g.naam ?? '');
        if (!key) continue;
        if (!exact.has(key)) exact.set(key, g);
        all.push({ key, g });
    }
    return (raw: string): GerechtForMenu | undefined => {
        const q = normName(raw);
        if (!q) return undefined;
        const direct = exact.get(q);
        if (direct) return direct;
        // Probeer query + ontdubbelde meervoud-variant ("sliders" → "slider").
        const variants = [q, q.replace(/s$/, '')].filter((v, i, a) => v.length >= 4 && a.indexOf(v) === i);
        for (const v of variants) {
            const hits: GerechtForMenu[] = [];
            for (const { key, g } of all) {
                if ((key.includes(v) || v.includes(key)) && !hits.includes(g)) hits.push(g);
            }
            if (hits.length === 1) return hits[0];
        }
        return undefined;
    };
}

/**
 * Zet menu_selectie + de gerechten-bibliotheek om naar MenuData.
 *
 * - Gangen worden gesorteerd op de gangen-tabel volgorde (bites → voor → hoofd → …).
 * - Per gerecht-naam wordt de beschrijving + allergenen opgezocht in `gerechten`.
 *   Niet-gevonden namen (bv. oude website-namen) verschijnen alsnog, zonder
 *   details — de menukaart breekt nooit, hij toont gewoon de naam.
 */
export function buildMenuData(
    menuSelectie: Record<string, string[]> | null | undefined,
    gerechten: GerechtForMenu[],
    gangen: GangForMenu[],
    opts: BuildMenuDataOpts = {},
): MenuData {
    const sel = menuSelectie ?? {};
    const resolve = makeResolver(gerechten);
    const showAllergens = opts.showAllergens ?? false;

    const gangMeta = new Map<string, { naam: string; volgorde: number }>();
    gangen.forEach((g, i) => {
        if (g.slug) gangMeta.set(g.slug, { naam: g.naam ?? g.slug, volgorde: g.volgorde ?? i });
    });

    const orderedEntries = Object.entries(sel)
        .filter(([, names]) => Array.isArray(names) && names.length > 0)
        .sort(([a], [b]) => {
            const oa = gangMeta.get(a)?.volgorde ?? 999;
            const ob = gangMeta.get(b)?.volgorde ?? 999;
            return oa - ob || a.localeCompare(b);
        });

    const gangenOut: MenuGang[] = orderedEntries.map(([slug, names], idx) => {
        const meta = gangMeta.get(slug);
        const dishes: MenuDish[] = names.map((name): MenuDish => {
            const g = resolve(name);
            const allergens = normalizeAllergens(g?.allergenen);
            return {
                name,
                description: g?.beschrijving?.trim() || undefined,
                // Allergenen alleen meegeven als de toggle aan staat — anders
                // overal weg (inline + legenda). Nooit een valse "geen allergenen".
                allergens: showAllergens && allergens.length > 0 ? allergens : undefined,
            };
        });
        return {
            eyebrow: `GANG ${String(idx + 1).padStart(2, '0')}`,
            name: meta?.naam ?? slug.replace(/_/g, ' '),
            dishes,
        };
    });

    return {
        gangen: gangenOut,
        logoUrl: opts.logoUrl ?? null,
        logoUrlDonker: opts.logoUrlDonker ?? null,
    };
}

/** Telt hoeveel gerechten een menu_selectie bevat (voor lege-state checks). */
export function countDishes(menuSelectie: Record<string, string[]> | null | undefined): number {
    if (!menuSelectie) return 0;
    return Object.values(menuSelectie).reduce(
        (sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0),
        0,
    );
}
