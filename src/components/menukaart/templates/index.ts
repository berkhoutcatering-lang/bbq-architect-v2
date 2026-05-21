/**
 * Router-style template-component map.
 *
 * Alle 10 Sprint 4 fase-2 templates: één Preview-component per template-id.
 * Per id ook een Thumbnail-component (kleine CSS-only render voor de gallery).
 */

import { type ComponentType } from 'react';
import type { Overrides } from '@/lib/menukaart/registry';
import type { MenuData } from '@/lib/menukaart/menu-data';

import Restaurant01Preview from './restaurant-01/Preview';
import Smokehouse01Preview from './smokehouse-01/Preview';
import Modern01Preview from './modern-01/Preview';
import Minimal01Preview from './minimal-01/Preview';
import Rustic01Preview from './rustic-01/Preview';
import Duotone01Preview from './duotone-01/Preview';
import Editorial01Preview from './editorial-01/Preview';
import Tasting01Preview from './tasting-01/Preview';
import Square01Preview from './square-01/Preview';
import Invite01Preview from './invite-01/Preview';

export type PreviewProps = {
    overrides: Overrides;
    data: MenuData;
    size?: 'normal' | 'small';
};

type PreviewComponent = ComponentType<PreviewProps>;

const REGISTRY: Record<string, PreviewComponent> = {
    'restaurant-01': Restaurant01Preview,
    'smokehouse-01': Smokehouse01Preview,
    'modern-01': Modern01Preview,
    'minimal-01': Minimal01Preview,
    'rustic-01': Rustic01Preview,
    'duotone-01': Duotone01Preview,
    'editorial-01': Editorial01Preview,
    'tasting-01': Tasting01Preview,
    'square-01': Square01Preview,
    'invite-01': Invite01Preview,
};

export function PreviewFor(templateId: string): PreviewComponent {
    return REGISTRY[templateId] ?? Restaurant01Preview;
}

// Re-export voor backward-compat met bestaande imports.
export type { MenuData, MenuGang, MenuDish } from '@/lib/menukaart/menu-data';
export { DEMO_MENU } from '@/lib/menukaart/menu-data';
