/**
 * Stijl-presets — de "voorgebouwde ideeën" voor de menukaart-canva.
 *
 * Sam's wens (2026-06-02): kant-en-klare kleur + lettertype-combo's als startpunt,
 * bovenop de 10 losse templates. Eén klik → een complete, samenhangende look
 * (template + accent + fonts), die je daarna nog kunt fijnslijpen. Past op het
 * leidende principe "minimale input, maximale output".
 *
 * Een preset is gewoon een `templateId` + een setje `Overrides` dat over de
 * template-defaults heen cascadet (resolveCascade → flatten). Geen nieuwe
 * data-laag: opslaan gebeurt via de bestaande customOverrides op de offerte.
 *
 * Bounds: kleuren (accent/bg/text) zijn altijd overridable; fonts alleen waar
 * ze in de allowList van die template staan (anders zou validateOverrides ze
 * afkeuren in de losse menukaart-editor). Daarom zetten we fonts enkel voor
 * restaurant/smokehouse/modern/minimal — voor de overige presets sturen we
 * alleen de accentkleur (veilig) en laat we het template-lettertype staan.
 */

import { type Overrides } from './registry';

export interface MenukaartPreset {
    id: string;
    naam: string;
    beschrijving: string;
    templateId: string;
    overrides: Partial<Overrides>;
}

export const MENUKAART_PRESETS: MenukaartPreset[] = [
    {
        id: 'klassiek-goud',
        naam: 'Klassiek Goud',
        beschrijving: 'Elegant restaurant — serif met warme goud-accenten',
        templateId: 'restaurant-01',
        overrides: { accent: '#9E781C', headingFont: 'Cormorant Garamond', bodyFont: 'Inter' },
    },
    {
        id: 'avond-bordeaux',
        naam: 'Avond Bordeaux',
        beschrijving: 'Diep wijnrood, sfeervol voor een diner',
        templateId: 'restaurant-01',
        overrides: { accent: '#7B2D3B', headingFont: 'Playfair Display', bodyFont: 'DM Sans' },
    },
    {
        id: 'smokehouse-vuur',
        naam: 'Smokehouse Vuur',
        beschrijving: 'Charcoal met ember-oranje — rauw en BBQ',
        templateId: 'smokehouse-01',
        overrides: { accent: '#D4592A', headingFont: 'Oswald' },
    },
    {
        id: 'krijtbord',
        naam: 'Krijtbord',
        beschrijving: 'Krijt op charcoal — stoer en leesbaar',
        templateId: 'smokehouse-01',
        overrides: { accent: '#E8E0D0', headingFont: 'Bebas Neue' },
    },
    {
        id: 'modern-wit',
        naam: 'Modern Wit',
        beschrijving: 'Strak editorial op wit, zwart-accent',
        templateId: 'modern-01',
        overrides: { accent: '#1A1A1A', headingFont: 'Space Grotesk', bodyFont: 'Inter' },
    },
    {
        id: 'strak-minimal',
        naam: 'Strak Minimal',
        beschrijving: 'Mono-typografie, hairlines, maximale rust',
        templateId: 'minimal-01',
        overrides: { accent: '#0A0A0A', headingFont: 'IBM Plex Mono' },
    },
    {
        id: 'rustiek-kraft',
        naam: 'Rustiek Kraft',
        beschrijving: 'Warm en ambachtelijk, kraft-gevoel',
        templateId: 'rustic-01',
        overrides: { accent: '#7A4A24' },
    },
    {
        id: 'bold-duotone',
        naam: 'Bold Duotone',
        beschrijving: 'Grafisch, hoog contrast, één knaller-kleur',
        templateId: 'duotone-01',
        overrides: { accent: '#E2483D' },
    },
];
