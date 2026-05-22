/* Shared gang-definitions — voorheen geëxporteerd vanuit
   src/app/marges/GerechtKaart.tsx. Nu een neutrale lib zodat
   menu-analyse, BCG, gerechten-builder en API-tools allemaal
   dezelfde lijst hanteren zonder route-koppeling. */

export interface GangConfig {
    slug: string;
    label: string;
    icon: string;
    kleur: string;
}

export const GANGEN: GangConfig[] = [
    { slug: 'bite', label: 'Bites', icon: '🍢', kleur: '#a78bfa' },
    { slug: 'voorgerecht', label: 'Voorgerechten', icon: '🥗', kleur: '#60a5fa' },
    { slug: 'hoofdgerecht', label: 'Hoofdgerechten', icon: '🥩', kleur: '#f97316' },
    { slug: 'vegetarisch', label: 'Vegetarisch', icon: '🌿', kleur: '#4ade80' },
    { slug: 'dessert', label: 'Desserts', icon: '🍮', kleur: '#f472b6' },
    { slug: 'bijgerecht', label: 'Bijgerechten', icon: '🫙', kleur: '#94a3b8' },
    { slug: 'borrelhap', label: 'Borrelhapjes', icon: '🧀', kleur: '#fbbf24' },
    { slug: 'anders', label: 'Overig', icon: '📦', kleur: '#6b7280' },
];

export function getGang(slug: string): GangConfig {
    return GANGEN.find(function (g) { return g.slug === slug; }) || GANGEN[GANGEN.length - 1];
}
