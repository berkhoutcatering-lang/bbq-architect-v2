/**
 * Menukaart-templates registry — 10 templates, Canva-niveau override-set.
 *
 * Elke template heeft:
 *   - `defaults`: het visuele DNA, 1-op-1 gematcht met de zip-CSS-vars
 *   - `allowList`: welke keys overrideable zijn, met range/enum-bounds.
 *     Server Actions valideren tegen deze allow-list zodat de client geen
 *     onmogelijke waardes terug kan posten.
 *
 * Override-strategie:
 *   - Kleuren (accent/bg/text) — altijd overridable
 *   - Tenant-tekst (brandName/subtitle/addressLine/email/website/footer)
 *     — altijd overridable
 *   - Per-event personalisatie (eventTitle/eventMessage/position) — altijd
 *     overridable, persistent op offerte-laag
 *   - Fonts/sizes/decoraties — overridable binnen de gekozen template-stijl
 *     (fonts gelimiteerd tot wat past bij de template-DNA)
 *
 * Hard rule: tenant-laag (settings.menukaart_overrides) propageert naar alle
 * offertes; offerte-laag (offertes.menukaart_overrides) overschrijft per
 * offerte. Cascade: default → brand → custom.
 */

export type LogoPosition = 'top-left' | 'top-center' | 'top-right';
export type EventMessagePosition = 'top' | 'bottom';

export type Overrides = {
    /* Kleuren */
    accent?: string;
    bg?: string;
    text?: string;

    /* Typografie */
    headingFont?: string;
    bodyFont?: string;
    headingSize?: number;
    bodySize?: number;
    headingWeight?: number;

    /* Logo */
    logoPosition?: LogoPosition;
    logoSize?: number;

    /* Tenant-tekst (default uit settings, overridable per offerte) */
    brandName?: string;
    subtitle?: string;
    addressLine?: string;
    email?: string;
    website?: string;
    footer?: string;

    /* Per-event personalisatie (per offerte) */
    eventTitle?: string;
    eventMessage?: string;
    eventMessagePosition?: EventMessagePosition;

    /* Decoraties — per template betekenis */
    showOrnament?: boolean;
    showDividers?: boolean;
    showGhostNumbers?: boolean;
    showFootnoteAllergens?: boolean;
};

export type OverrideKey = keyof Overrides;

export type AllowList = {
    accent?: { type: 'color' };
    bg?: { type: 'color' };
    text?: { type: 'color' };
    headingFont?: { type: 'font'; options: string[] };
    bodyFont?: { type: 'font'; options: string[] };
    headingSize?: { type: 'size'; min: number; max: number };
    bodySize?: { type: 'size'; min: number; max: number };
    headingWeight?: { type: 'weight'; options: number[] };
    logoPosition?: { type: 'enum'; options: LogoPosition[] };
    logoSize?: { type: 'size'; min: number; max: number };
    brandName?: { type: 'text'; max: number };
    subtitle?: { type: 'text'; max: number };
    addressLine?: { type: 'text'; max: number };
    email?: { type: 'email'; max: number };
    website?: { type: 'url'; max: number };
    footer?: { type: 'text'; max: number };
    eventTitle?: { type: 'text'; max: number };
    eventMessage?: { type: 'text'; max: number };
    eventMessagePosition?: { type: 'enum'; options: EventMessagePosition[] };
    showOrnament?: { type: 'toggle' };
    showDividers?: { type: 'toggle' };
    showGhostNumbers?: { type: 'toggle' };
    showFootnoteAllergens?: { type: 'toggle' };
};

export type Template = {
    id: string;
    name: string;
    description: string;
    enabled: boolean;
    paper: 'a4' | 'square';
    defaults: Required<
        Pick<
            Overrides,
            | 'accent'
            | 'bg'
            | 'text'
            | 'headingFont'
            | 'bodyFont'
            | 'headingSize'
            | 'bodySize'
            | 'headingWeight'
            | 'logoPosition'
            | 'logoSize'
        >
    > &
        Overrides;
    allowList: AllowList;
};

/* ── Shared allow-list builders ────────────────────────────────────────── */

/** Kleuren + logo + alle tekst-velden zijn altijd overridable. */
const COMMON_TEXT: Pick<
    AllowList,
    | 'brandName'
    | 'subtitle'
    | 'addressLine'
    | 'email'
    | 'website'
    | 'footer'
    | 'eventTitle'
    | 'eventMessage'
    | 'eventMessagePosition'
> = {
    brandName: { type: 'text', max: 40 },
    subtitle: { type: 'text', max: 60 },
    addressLine: { type: 'text', max: 120 },
    email: { type: 'email', max: 80 },
    website: { type: 'url', max: 80 },
    footer: { type: 'text', max: 160 },
    eventTitle: { type: 'text', max: 80 },
    eventMessage: { type: 'text', max: 300 },
    eventMessagePosition: { type: 'enum', options: ['top', 'bottom'] },
};

const COMMON_COLORS: Pick<AllowList, 'accent' | 'bg' | 'text'> = {
    accent: { type: 'color' },
    bg: { type: 'color' },
    text: { type: 'color' },
};

/* COMMON_LOGO_FULL = logoPosition + logoSize. Alleen gebruiken in templates
   die `overrides.logoPosition` daadwerkelijk gebruiken in Preview + Pdf.
   COMMON_LOGO_SIZE = alleen logoSize. Voor templates met vaste positie.

   Range 24-200: vroege range 24-80 was te beperkt voor visuele impact —
   logo van 80px op een A4 (480px breed in preview) is amper zichtbaar
   verschil van default 48-56. Sam: "groter maken werkt niet". 200 is ruim
   genoeg voor hero-logos en bewust laag genoeg om text van een gewone
   header niet weg te drukken. */
const COMMON_LOGO_FULL: Pick<AllowList, 'logoPosition' | 'logoSize'> = {
    logoPosition: { type: 'enum', options: ['top-left', 'top-center', 'top-right'] },
    logoSize: { type: 'size', min: 24, max: 200 },
};
const COMMON_LOGO_SIZE: Pick<AllowList, 'logoSize'> = {
    logoSize: { type: 'size', min: 24, max: 200 },
};
/* Back-compat: oude templates spreaden COMMON_LOGO. Hou de export beschikbaar
   maar elk template kiest expliciet welke variant past bij de Preview. */
const COMMON_LOGO = COMMON_LOGO_FULL;
void COMMON_LOGO;

const COMMON_SIZE: Pick<AllowList, 'headingSize' | 'bodySize' | 'headingWeight'> = {
    headingSize: { type: 'size', min: 10, max: 72 },
    bodySize: { type: 'size', min: 7, max: 20 },
    headingWeight: { type: 'weight', options: [100, 200, 300, 400, 500, 600, 700, 800, 900] },
};

/* ── Templates ─────────────────────────────────────────────────────────── */

export const TEMPLATES: Template[] = [
    /* 1 — Restaurant — klassiek serif, gold ornamenten, centered */
    {
        id: 'restaurant-01',
        name: 'Restaurant',
        description: 'Klassiek-restaurant — serif italic, gold ornamenten, centered layout',
        enabled: true,
        paper: 'a4',
        defaults: {
            accent: '#9e781c',
            bg: '#FAF6EF',
            text: '#2A2520',
            headingFont: 'Cormorant Garamond',
            bodyFont: 'Inter',
            headingSize: 22,
            bodySize: 10,
            headingWeight: 500,
            logoPosition: 'top-center',
            logoSize: 56,
            showOrnament: true,
            showDividers: true,
            showFootnoteAllergens: false,
        },
        allowList: {
            ...COMMON_COLORS,
            ...COMMON_LOGO_FULL,
            ...COMMON_SIZE,
            ...COMMON_TEXT,
            headingFont: {
                type: 'font',
                options: ['Cormorant Garamond', 'Playfair Display', 'Lora', 'EB Garamond'],
            },
            bodyFont: {
                type: 'font',
                options: ['Inter', 'DM Sans', 'IBM Plex Sans', 'Work Sans'],
            },
            showOrnament: { type: 'toggle' },
            showDividers: { type: 'toggle' },
            showFootnoteAllergens: { type: 'toggle' },
        },
    },

    /* 2 — Smokehouse — charcoal bg, Oswald, dashed dividers, brand-stripe links */
    {
        id: 'smokehouse-01',
        name: 'Smokehouse',
        description: 'BBQ rauw — charcoal bg, krijtbord-stijl, dashed dividers, brand-stripe',
        enabled: true,
        paper: 'a4',
        defaults: {
            accent: '#D4592A',
            bg: '#141210',
            text: '#E8E0D0',
            headingFont: 'Oswald',
            bodyFont: 'Courier Prime',
            headingSize: 18,
            bodySize: 10,
            headingWeight: 500,
            logoPosition: 'top-left',
            logoSize: 52,
            showDividers: true,
            showGhostNumbers: true,
            showFootnoteAllergens: false,
        },
        allowList: {
            ...COMMON_COLORS,
            ...COMMON_LOGO_FULL,
            ...COMMON_SIZE,
            ...COMMON_TEXT,
            headingFont: { type: 'font', options: ['Oswald', 'Bebas Neue', 'Antonio'] },
            bodyFont: { type: 'font', options: ['Courier Prime', 'JetBrains Mono', 'IBM Plex Mono'] },
            showDividers: { type: 'toggle' },
            showGhostNumbers: { type: 'toggle' },
            showFootnoteAllergens: { type: 'toggle' },
        },
    },

    /* 3 — Modern — Editorial sidebar layout, Space Grotesk, gradient rules */
    {
        id: 'modern-01',
        name: 'Modern',
        description: 'Modern editorial — brand-sidebar met gang-index, gradient rules',
        enabled: true,
        paper: 'a4',
        defaults: {
            accent: '#1A1A1A',
            bg: '#FFFFFF',
            text: '#1A1A1A',
            headingFont: 'Space Grotesk',
            bodyFont: 'Space Grotesk',
            headingSize: 44,
            bodySize: 11,
            headingWeight: 300,
            logoPosition: 'top-left',
            logoSize: 48,
            showDividers: true,
            showFootnoteAllergens: true,
        },
        allowList: {
            ...COMMON_COLORS,
            ...COMMON_LOGO_SIZE,
            ...COMMON_SIZE,
            ...COMMON_TEXT,
            headingFont: { type: 'font', options: ['Space Grotesk', 'Inter', 'DM Sans', 'Work Sans'] },
            bodyFont: { type: 'font', options: ['Space Grotesk', 'Inter', 'DM Sans', 'Work Sans'] },
            showDividers: { type: 'toggle' },
            showFootnoteAllergens: { type: 'toggle' },
        },
    },

    /* 4 — Minimal — IBM Plex Mono, ghost-nummers, dish-id (01.1) */
    {
        id: 'minimal-01',
        name: 'Minimal',
        description: 'Strikt minimaal — mono-typografie, ghost-cijfers, hairlines',
        enabled: true,
        paper: 'a4',
        defaults: {
            accent: '#0A0A0A',
            bg: '#FFFFFF',
            text: '#0A0A0A',
            headingFont: 'IBM Plex Mono',
            bodyFont: 'IBM Plex Mono',
            headingSize: 64,
            bodySize: 11,
            headingWeight: 500,
            logoPosition: 'top-left',
            logoSize: 44,
            showGhostNumbers: true,
            showFootnoteAllergens: false,
        },
        allowList: {
            ...COMMON_COLORS,
            ...COMMON_LOGO_SIZE,
            ...COMMON_SIZE,
            ...COMMON_TEXT,
            headingFont: { type: 'font', options: ['IBM Plex Mono', 'JetBrains Mono', 'Space Mono'] },
            bodyFont: { type: 'font', options: ['IBM Plex Mono', 'JetBrains Mono', 'Space Mono'] },
            showGhostNumbers: { type: 'toggle' },
            showFootnoteAllergens: { type: 'toggle' },
        },
    },

    /* 5 — Rustic — kraft papier, Caveat script, wax-seal logo */
    {
        id: 'rustic-01',
        name: 'Rustic',
        description: 'Bistro warm — kraft-papier, Caveat script-titels, wax-seal logo',
        enabled: true,
        paper: 'a4',
        defaults: {
            accent: '#7C5234',
            bg: '#E8DCBE',
            text: '#3D2E1E',
            headingFont: 'Caveat',
            bodyFont: 'Lora',
            headingSize: 36,
            bodySize: 11,
            headingWeight: 600,
            logoPosition: 'top-center',
            logoSize: 64,
            showOrnament: true,
            showDividers: true,
            showFootnoteAllergens: false,
        },
        allowList: {
            ...COMMON_COLORS,
            ...COMMON_LOGO_SIZE,
            ...COMMON_SIZE,
            ...COMMON_TEXT,
            headingFont: { type: 'font', options: ['Caveat', 'Dancing Script', 'Sacramento'] },
            bodyFont: { type: 'font', options: ['Lora', 'EB Garamond', 'Crimson Pro'] },
            showOrnament: { type: 'toggle' },
            showDividers: { type: 'toggle' },
            showFootnoteAllergens: { type: 'toggle' },
        },
    },

    /* 6 — Duotone — knal grafisch, Bebas Neue, ghost-letter "M" */
    {
        id: 'duotone-01',
        name: 'Duotone',
        description: 'Knal grafisch — mat zwart + brand-primary, hero-ghost, bottom bar',
        enabled: true,
        paper: 'a4',
        defaults: {
            accent: '#FF4500',
            bg: '#141210',
            text: '#F4F0E8',
            headingFont: 'Bebas Neue',
            bodyFont: 'DM Sans',
            headingSize: 34,
            bodySize: 11,
            headingWeight: 400,
            logoPosition: 'top-left',
            logoSize: 48,
            showGhostNumbers: true,
            showDividers: true,
            showFootnoteAllergens: false,
        },
        allowList: {
            ...COMMON_COLORS,
            ...COMMON_LOGO_SIZE,
            ...COMMON_SIZE,
            ...COMMON_TEXT,
            headingFont: { type: 'font', options: ['Bebas Neue', 'Oswald', 'Antonio'] },
            bodyFont: { type: 'font', options: ['DM Sans', 'Inter', 'Work Sans'] },
            showGhostNumbers: { type: 'toggle' },
            showDividers: { type: 'toggle' },
            showFootnoteAllergens: { type: 'toggle' },
        },
    },

    /* 7 — Editorial — magazine spread, drop-cap, brand header band */
    {
        id: 'editorial-01',
        name: 'Editorial',
        description: 'Magazine spread — drop-cap narratief, brand header band',
        enabled: true,
        paper: 'a4',
        defaults: {
            accent: '#8B0000',
            bg: '#F4F0E6',
            text: '#2C2820',
            headingFont: 'Cormorant',
            bodyFont: 'DM Sans',
            headingSize: 24,
            bodySize: 11,
            headingWeight: 400,
            logoPosition: 'top-left',
            logoSize: 48,
            showDividers: true,
            showFootnoteAllergens: true,
        },
        allowList: {
            ...COMMON_COLORS,
            ...COMMON_LOGO_SIZE,
            ...COMMON_SIZE,
            ...COMMON_TEXT,
            headingFont: { type: 'font', options: ['Cormorant', 'Crimson Pro', 'EB Garamond'] },
            bodyFont: { type: 'font', options: ['DM Sans', 'Inter', 'Work Sans'] },
            showDividers: { type: 'toggle' },
            showFootnoteAllergens: { type: 'toggle' },
        },
    },

    /* 8 — Tasting — verticale timeline, diamond-nodes, fine-dining */
    {
        id: 'tasting-01',
        name: 'Tasting',
        description: 'Fine-dining tasting — verticale timeline, diamond-nodes',
        enabled: true,
        paper: 'a4',
        defaults: {
            accent: '#9e781c',
            bg: '#F6F2E8',
            text: '#1A1814',
            headingFont: 'Cormorant',
            bodyFont: 'Inter',
            headingSize: 44,
            bodySize: 10,
            headingWeight: 300,
            logoPosition: 'top-center',
            logoSize: 52,
            showDividers: true,
            showFootnoteAllergens: true,
        },
        allowList: {
            ...COMMON_COLORS,
            ...COMMON_LOGO_SIZE,
            ...COMMON_SIZE,
            ...COMMON_TEXT,
            headingFont: { type: 'font', options: ['Cormorant', 'Cormorant Garamond', 'Playfair Display'] },
            bodyFont: { type: 'font', options: ['Inter', 'DM Sans', 'Work Sans'] },
            showDividers: { type: 'toggle' },
            showFootnoteAllergens: { type: 'toggle' },
        },
    },

    /* 9 — Square (Foodtruck) — 21×21cm, diagonale brand-balk, 2-koloms grid */
    {
        id: 'square-01',
        name: 'Foodtruck (21×21)',
        description: 'Casual truck — diagonale brand-balk, 2-koloms grid, sticker-badges',
        enabled: true,
        paper: 'square',
        defaults: {
            accent: '#E63946',
            bg: '#FFFBF4',
            text: '#1A1614',
            headingFont: 'Rubik',
            bodyFont: 'Inter',
            headingSize: 28,
            bodySize: 11,
            headingWeight: 800,
            logoPosition: 'top-left',
            logoSize: 32,
            showFootnoteAllergens: false,
        },
        allowList: {
            ...COMMON_COLORS,
            ...COMMON_LOGO_SIZE,
            ...COMMON_SIZE,
            ...COMMON_TEXT,
            headingFont: { type: 'font', options: ['Rubik', 'DM Sans', 'Inter'] },
            bodyFont: { type: 'font', options: ['Inter', 'DM Sans', 'Work Sans'] },
            showFootnoteAllergens: { type: 'toggle' },
        },
    },

    /* 10 — Invite — 21×21cm, SVG corner-ornamenten, monogram, trouwkaart */
    {
        id: 'invite-01',
        name: 'Uitnodiging (21×21)',
        description: 'Trouwkaart-feel — SVG corner-ornamenten, monogram, sierlijk',
        enabled: true,
        paper: 'square',
        defaults: {
            accent: '#7C5234',
            bg: '#F9F5EC',
            text: '#2A2520',
            headingFont: 'Playfair Display',
            bodyFont: 'Cormorant',
            headingSize: 22,
            bodySize: 11,
            headingWeight: 400,
            logoPosition: 'top-center',
            logoSize: 56,
            showOrnament: true,
            showFootnoteAllergens: true,
        },
        allowList: {
            ...COMMON_COLORS,
            ...COMMON_LOGO_SIZE,
            ...COMMON_SIZE,
            ...COMMON_TEXT,
            headingFont: { type: 'font', options: ['Playfair Display', 'Cormorant Garamond', 'EB Garamond'] },
            bodyFont: { type: 'font', options: ['Cormorant', 'Lora', 'EB Garamond'] },
            showOrnament: { type: 'toggle' },
            showFootnoteAllergens: { type: 'toggle' },
        },
    },
];

export function getTemplate(id: string | null | undefined): Template {
    return TEMPLATES.find(t => t.id === id) ?? TEMPLATES[0];
}

export function listEnabledTemplates(): Template[] {
    return TEMPLATES.filter(t => t.enabled);
}

export const DEFAULT_TEMPLATE_ID = 'restaurant-01';
