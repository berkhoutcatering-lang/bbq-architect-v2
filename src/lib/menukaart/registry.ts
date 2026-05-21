/**
 * Menukaart-templates registry.
 *
 * Elke template heeft een `allowList`: welke keys overrideable zijn, met
 * range/enum-bounds. Server Actions valideren tegen deze allow-list zodat
 * de client geen onmogelijke waardes terug kan posten.
 *
 * Restaurant-01 is in S4-fase-1 live. De andere 9 volgen — `enabled: false`
 * blokkeert ze in de UI maar de registry-shape staat klaar.
 */

export type LogoPosition = 'top-left' | 'top-center' | 'top-right';

export type Overrides = {
    accent?: string;
    bg?: string;
    text?: string;
    headingFont?: string;
    bodyFont?: string;
    headingSize?: number;
    bodySize?: number;
    headingWeight?: number;
    logoPosition?: LogoPosition;
    logoSize?: number;
    brandName?: string;
    subtitle?: string;
    footer?: string;
    showOrnament?: boolean;
    showDividers?: boolean;
    showGhostNumbers?: boolean;
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
    footer?: { type: 'text'; max: number };
    showOrnament?: { type: 'toggle' };
    showDividers?: { type: 'toggle' };
    showGhostNumbers?: { type: 'toggle' };
};

export type Template = {
    id: string;
    name: string;
    description: string;
    enabled: boolean;
    paper: 'a4' | 'square';
    defaults: Required<Pick<Overrides, 'accent' | 'bg' | 'text' | 'headingFont' | 'bodyFont' | 'headingSize' | 'bodySize' | 'headingWeight' | 'logoPosition' | 'logoSize'>> & Overrides;
    allowList: AllowList;
};

export const TEMPLATES: Template[] = [
    {
        id: 'restaurant-01',
        name: 'Restaurant',
        description: 'Klassiek-restaurant — serif, gold ornamenten, centered layout',
        enabled: true,
        paper: 'a4',
        defaults: {
            accent: '#8B5E3C',
            bg: '#FAF6EF',
            text: '#2A2520',
            headingFont: 'Cormorant Garamond',
            bodyFont: 'Inter',
            headingSize: 15,
            bodySize: 10,
            headingWeight: 400,
            logoPosition: 'top-center',
            logoSize: 36,
            brandName: 'Vuur & Vlam',
            subtitle: 'Ambachtelijke BBQ-catering',
            footer: 'Vuur & Vlam · Rookweg 12, Bathmen · vuurenvlam.nl',
            showOrnament: true,
            showDividers: true,
            showGhostNumbers: false,
        },
        allowList: {
            accent: { type: 'color' },
            bg: { type: 'color' },
            text: { type: 'color' },
            headingFont: { type: 'font', options: ['Cormorant Garamond', 'Playfair Display', 'Lora', 'EB Garamond'] },
            bodyFont: { type: 'font', options: ['Inter', 'DM Sans', 'IBM Plex Sans', 'Work Sans'] },
            headingSize: { type: 'size', min: 12, max: 22 },
            bodySize: { type: 'size', min: 8, max: 14 },
            headingWeight: { type: 'weight', options: [300, 400, 500, 600] },
            logoPosition: { type: 'enum', options: ['top-left', 'top-center', 'top-right'] },
            logoSize: { type: 'size', min: 24, max: 72 },
            brandName: { type: 'text', max: 40 },
            subtitle: { type: 'text', max: 60 },
            footer: { type: 'text', max: 120 },
            showOrnament: { type: 'toggle' },
            showDividers: { type: 'toggle' },
        },
    },
    // S4-fase-3: andere 9 worden hier toegevoegd zodra geport.
    { id: 'smokehouse-01', name: 'Smokehouse', description: 'BBQ-rauw — krijtbord-stijl, charcoal-bg', enabled: false, paper: 'a4', defaults: { accent: '#D4592A', bg: '#141210', text: '#E8E0D0', headingFont: 'Oswald', bodyFont: 'Courier Prime', headingSize: 18, bodySize: 10, headingWeight: 500, logoPosition: 'top-left', logoSize: 52 }, allowList: { accent: { type: 'color' }, bg: { type: 'color' }, text: { type: 'color' } } },
    { id: 'modern-01', name: 'Modern', description: 'Modern editorial — whitespace, sans-serif', enabled: false, paper: 'a4', defaults: { accent: '#1a1a1a', bg: '#ffffff', text: '#0a0a0a', headingFont: 'Space Grotesk', bodyFont: 'Space Grotesk', headingSize: 24, bodySize: 11, headingWeight: 500, logoPosition: 'top-left', logoSize: 40 }, allowList: { accent: { type: 'color' } } },
    { id: 'minimal-01', name: 'Minimal', description: 'Strikt minimaal — mono-typografie, geen decoratie', enabled: false, paper: 'a4', defaults: { accent: '#0A0A0A', bg: '#FFFFFF', text: '#0A0A0A', headingFont: 'IBM Plex Mono', bodyFont: 'IBM Plex Mono', headingSize: 16, bodySize: 9, headingWeight: 400, logoPosition: 'top-left', logoSize: 32 }, allowList: { accent: { type: 'color' } } },
    { id: 'rustic-01', name: 'Rustic', description: 'Boerderij-warm — script titels, kraft-papier', enabled: false, paper: 'a4', defaults: { accent: '#7C5234', bg: '#F2E8D5', text: '#3A2A1C', headingFont: 'Caveat', bodyFont: 'Lora', headingSize: 26, bodySize: 11, headingWeight: 500, logoPosition: 'top-center', logoSize: 48 }, allowList: { accent: { type: 'color' } } },
    { id: 'duotone-01', name: 'Duotone', description: 'Knal-grafisch — 2 kleuren, grote nummers', enabled: false, paper: 'a4', defaults: { accent: '#FF4500', bg: '#FFFFFF', text: '#000000', headingFont: 'Bebas Neue', bodyFont: 'DM Sans', headingSize: 32, bodySize: 11, headingWeight: 400, logoPosition: 'top-left', logoSize: 60 }, allowList: { accent: { type: 'color' } } },
    { id: 'editorial-01', name: 'Editorial', description: 'Magazine-spread — beschrijvingen prominent', enabled: false, paper: 'a4', defaults: { accent: '#8B0000', bg: '#FDFDFD', text: '#1A1A1A', headingFont: 'Crimson Pro', bodyFont: 'DM Sans', headingSize: 22, bodySize: 10, headingWeight: 500, logoPosition: 'top-center', logoSize: 44 }, allowList: { accent: { type: 'color' } } },
    { id: 'tasting-01', name: 'Tasting', description: 'Fine-dining — genummerd, ultra-spaarzaam', enabled: false, paper: 'a4', defaults: { accent: '#1A1A1A', bg: '#F8F4EC', text: '#1A1A1A', headingFont: 'Cormorant', bodyFont: 'Cormorant', headingSize: 18, bodySize: 10, headingWeight: 400, logoPosition: 'top-center', logoSize: 40 }, allowList: { accent: { type: 'color' } } },
    { id: 'square-01', name: 'Foodtruck', description: 'Casual truck — sticker-tags, festival', enabled: false, paper: 'square', defaults: { accent: '#E63946', bg: '#FCF5E5', text: '#0A0A0A', headingFont: 'Rubik', bodyFont: 'Rubik', headingSize: 22, bodySize: 11, headingWeight: 700, logoPosition: 'top-left', logoSize: 48 }, allowList: { accent: { type: 'color' } } },
    { id: 'invite-01', name: 'Uitnodiging', description: 'Trouwkaart-feel — sierlijk, centered', enabled: false, paper: 'square', defaults: { accent: '#7C5234', bg: '#F8F4EC', text: '#2A2A2A', headingFont: 'Playfair Display', bodyFont: 'Cormorant', headingSize: 28, bodySize: 11, headingWeight: 500, logoPosition: 'top-center', logoSize: 52 }, allowList: { accent: { type: 'color' } } },
];

export function getTemplate(id: string | null | undefined): Template {
    return TEMPLATES.find(t => t.id === id) ?? TEMPLATES[0];
}

export const DEFAULT_TEMPLATE_ID = 'restaurant-01';
