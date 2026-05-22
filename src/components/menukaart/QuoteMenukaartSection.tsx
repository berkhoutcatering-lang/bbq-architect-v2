'use client';

/**
 * Menukaart-preview-sectie voor /q/[id].
 *
 * Strategie: CSS transform-wrapper.
 *   - Template rendert ALTIJD op 480px (size="normal"), nooit "small".
 *   - On-screen: CSS transform: scale(290/480) past het in de preview.
 *   - Print: CSS transform: scale(794/480) schaalt op naar A4.
 *   - Dezelfde component, dezelfde pixels → preview = PDF gegarandeerd.
 */

import { useMemo } from 'react';
import { Download } from 'lucide-react';
import { getTemplate, DEFAULT_TEMPLATE_ID, type Overrides } from '@/lib/menukaart/registry';
import { resolveCascade, flatten } from '@/lib/menukaart/cascade';
import { PreviewFor } from '@/components/menukaart/templates';
import { DEMO_MENU, type MenuData } from '@/lib/menukaart/menu-data';

const TEMPLATE_BASE_PX = 480;
const A4_WIDTH_PX = 794;      // 210mm bij 96 CSS-px/inch
const PREVIEW_WIDTH = 290;
const PRINT_SCALE = A4_WIDTH_PX / TEMPLATE_BASE_PX;

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

    const isSquare = template.paper === 'square';
    const aspect = isSquare ? 1 : 1.414;
    const previewScale = PREVIEW_WIDTH / TEMPLATE_BASE_PX;
    const previewHeight = PREVIEW_WIDTH * aspect;

    // CSS var op de root → print-CSS kan via var(--menukaart-print-scale)
    // zonder ${} interpolatie in de style-jsx body (Turbopack 16 hangt anders).
    const rootStyle = {
        padding: '24px clamp(18px, 4.5vw, 28px) 8px',
        '--menukaart-print-scale': String(PRINT_SCALE),
    } as React.CSSProperties;

    return (
        <div style={rootStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--zinc)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
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
                style={{ display: 'flex', justifyContent: 'center', padding: '8px 0 16px' }}
            >
                <div
                    className="menukaart-viewport"
                    style={{
                        width: PREVIEW_WIDTH,
                        height: previewHeight,
                        overflow: 'hidden',
                        position: 'relative',
                        flexShrink: 0,
                    }}
                >
                    <div
                        className="menukaart-scale-wrapper"
                        style={{
                            transform: `scale(${previewScale})`,
                            transformOrigin: 'top left',
                            width: TEMPLATE_BASE_PX,
                        }}
                    >
                        {/* ALTIJD size="normal" — schaling via CSS transform */}
                        <TemplateComponent overrides={flat} data={data} size="normal" />
                    </div>
                </div>
            </div>

            {/*
              * Paper-conditional CSS via gewone <style> tag (geen styled-jsx).
              * Reden: styled-jsx staat maar 1 <style jsx> per component toe;
              * dynamische @page size kan niet via CSS-var.
              */}
            <style
                dangerouslySetInnerHTML={{
                    __html: `@media print { @page { size: ${isSquare ? '210mm 210mm' : 'A4 portrait'}; margin: 0; } .menukaart-viewport { height: ${isSquare ? '210mm' : '297mm'} !important; } }`,
                }}
            />

            <style jsx global>{`
                @media print {
                    body * { visibility: hidden; }
                    .menukaart-printable, .menukaart-printable * { visibility: visible; }
                    .menukaart-printable {
                        position: absolute !important;
                        left: 0 !important;
                        top: 0 !important;
                        width: 210mm !important;
                        padding: 0 !important;
                        overflow: visible !important;
                        display: block !important;
                    }
                    .menukaart-viewport {
                        width: 210mm !important;
                        overflow: visible !important;
                    }
                    .menukaart-scale-wrapper {
                        transform: scale(var(--menukaart-print-scale)) !important;
                        transform-origin: top left !important;
                    }
                    .menukaart-print-btn { display: none !important; }
                }
            `}</style>
        </div>
    );
}
