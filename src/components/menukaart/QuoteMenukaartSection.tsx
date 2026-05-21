'use client';

/**
 * Menukaart-preview-sectie voor /q/[id].
 *
 * Resolved cascade van tenant brand-overrides + offerte custom-overrides
 * tegen de gekozen template. Klantkant ziet het eindresultaat zoals de
 * caterende ondernemer het heeft samengesteld.
 */

import { useMemo } from 'react';
import { getTemplate, DEFAULT_TEMPLATE_ID, type Overrides } from '@/lib/menukaart/registry';
import { resolveCascade, flatten } from '@/lib/menukaart/cascade';
import Restaurant01Preview, { DEMO_MENU, type MenuData } from '@/components/menukaart/templates/restaurant-01/Preview';

type Props = {
    templateId?: string | null;
    brandOverrides?: Overrides;
    customOverrides?: Overrides;
    menuData?: MenuData;
    logoUrl?: string | null;
};

export default function QuoteMenukaartSection({
    templateId, brandOverrides = {}, customOverrides = {}, menuData, logoUrl,
}: Props) {
    const template = useMemo(() => getTemplate(templateId ?? DEFAULT_TEMPLATE_ID), [templateId]);
    const resolved = useMemo(() => resolveCascade(template, brandOverrides, customOverrides), [template, brandOverrides, customOverrides]);
    const flat = useMemo(() => flatten(resolved) as Overrides, [resolved]);
    const data: MenuData = { ...(menuData ?? DEMO_MENU), logoUrl };

    return (
        <div style={{ padding: '24px clamp(18px, 4.5vw, 28px) 8px' }}>
            <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--zinc)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 16 }}>
                Menukaart
            </h3>
            <div style={{
                display: 'flex',
                justifyContent: 'center',
                padding: '8px 0 16px',
                overflowX: 'auto',
            }}>
                <Restaurant01Preview overrides={flat} data={data} size="small" />
            </div>
        </div>
    );
}
