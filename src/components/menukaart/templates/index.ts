/**
 * Router-style template-component map.
 * S4 fase 1: alleen restaurant-01 live. Volgende templates komen hier bij.
 */

import Restaurant01Preview, { DEMO_MENU } from './restaurant-01/Preview';

export { DEMO_MENU };
export type { MenuData, MenuGang } from './restaurant-01/Preview';

export function PreviewFor(templateId: string) {
    switch (templateId) {
        case 'restaurant-01':
            return Restaurant01Preview;
        default:
            return Restaurant01Preview; // fallback in S4 fase 1
    }
}
