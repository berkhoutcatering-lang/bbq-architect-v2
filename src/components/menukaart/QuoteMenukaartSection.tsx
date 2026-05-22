'use client';

/**
 * Menukaart-preview-sectie voor /q/[id].
 *
 * Resolved cascade van tenant brand-overrides + offerte custom-overrides
 * tegen de gekozen template. Klantkant ziet het eindresultaat zoals de
 * caterende ondernemer het heeft samengesteld, inclusief de eventueel
 * gevulde "Persoonlijke boodschap".
 *
 * "Download PDF"-knop = browser print-to-PDF van de HTML preview met
 * print-CSS. Dit garandeert dat klant exact dezelfde menukaart download
 * als wat de ondernemer in de editor heeft samengesteld — geen
 * react-pdf-renderer mismatch meer.
 */

import { useMemo } from 'react';
import { Download } from 'lucide-react';
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h3
                    style={{
                        fontSize: 13,
                        fontWeight: 700,
                        color: 'var(--zinc)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.08em',
                    }}
                >
                    Menukaart
                </h3>
                <button
                    onClick={() => window.print()}
                    style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        padding: '6px 12px', borderRadius: 6,
                        background: 'transparent', border: '1px solid rgba(158,120,28,.3)',
                        color: 'var(--brand-gold, #c4a35a)', cursor: 'pointer',
                        fontSize: 12, fontWeight: 600,
                    }}
                    type="button"
                    className="menukaart-print-btn"
                >
                    <Download size={13} /> Download PDF
                </button>
            </div>
            <div
                className="menukaart-printable"
                style={{
                    display: 'flex',
                    justifyContent: 'center',
                    padding: '8px 0 16px',
                    overflowX: 'auto',
                }}
            >
                <TemplateComponent overrides={flat} data={data} size="small" />
            </div>

            {/* Print-CSS: bij window.print() alleen de menukaart tonen op A4 */}
            <style jsx global>{`
                @media print {
                    @page {
                        size: A4 portrait;
                        margin: 0;
                    }
                    body * {
                        visibility: hidden;
                    }
                    .menukaart-printable, .menukaart-printable * {
                        visibility: visible;
                    }
                    .menukaart-printable {
                        position: absolute !important;
                        left: 0 !important;
                        top: 0 !important;
                        width: 100% !important;
                        padding: 0 !important;
                        overflow: visible !important;
                        display: block !important;
                    }
                    .menukaart-printable > * {
                        margin: 0 auto !important;
                        box-shadow: none !important;
                        border-radius: 0 !important;
                        width: 210mm !important;
                        height: 297mm !important;
                        transform: scale(1) !important;
                    }
                    .menukaart-print-btn {
                        display: none !important;
                    }
                }
            `}</style>
        </div>
    );
}
