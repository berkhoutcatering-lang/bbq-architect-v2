'use client';

/**
 * Menukaart-preview-sectie voor /q/[id].
 *
 * Resolved cascade van tenant brand-overrides + offerte custom-overrides
 * tegen de gekozen template. Klantkant ziet het eindresultaat zoals de
 * caterende ondernemer het heeft samengesteld, inclusief de eventueel
 * gevulde "Persoonlijke boodschap".
 */

import { useMemo } from 'react';
import { getTemplate, DEFAULT_TEMPLATE_ID, type Overrides } from '@/lib/menukaart/registry';
import { resolveCascade, flatten } from '@/lib/menukaart/cascade';
import { PreviewFor } from '@/components/menukaart/templates';
import { DEMO_MENU, type MenuData } from '@/lib/menukaart/menu-data';

type Props = {
    templateId?: string | null;
    brandOverrides?: Overrides;
    customOverrides?: Overrides;
    menuData?: MenuData;
    logoUrl?: string | null;
};

export default function QuoteMenukaartSection({
    templateId,
    brandOverrides = {},
    customOverrides = {},
    menuData,
    logoUrl,
}: Props) {
    const template = useMemo(() => getTemplate(templateId ?? DEFAULT_TEMPLATE_ID), [templateId]);
    const resolved = useMemo(
        () => resolveCascade(template, brandOverrides, customOverrides),
        [template, brandOverrides, customOverrides],
    );
    const flat = useMemo(() => flatten(resolved) as Overrides, [resolved]);
    const data: MenuData = { ...(menuData ?? DEMO_MENU), logoUrl };

    const TemplateComponent = useMemo(() => PreviewFor(template.id), [template.id]);

    return (
        <div style={{ padding: '24px clamp(18px, 4.5vw, 28px) 8px' }}>
            <h3
                style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: 'var(--zinc)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    marginBottom: 16,
                }}
            >
                Menukaart
            </h3>
            <div
                style={{
                    display: 'flex',
                    justifyContent: 'center',
                    padding: '8px 0 16px',
                    overflowX: 'auto',
                }}
            >
                <TemplateComponent overrides={flat} data={data} size="small" />
            </div>
        </div>
    );
}
