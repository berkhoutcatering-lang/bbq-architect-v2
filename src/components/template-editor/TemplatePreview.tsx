'use client';

import BlockRenderer from './BlockRenderer';
import { TemplateBrandingProvider, TemplateVariablesProvider, TemplateMenuGroupsProvider, type LiveMenuGroup } from './TemplateBrandingContext';
import type { TemplateBlock, PageSettings, PdfTemplate } from '@/types/template.types';

interface Props {
    blocks: TemplateBlock[];
    pageSettings: PageSettings;
    documentType: PdfTemplate['document_type'];
    branding?: { primary: string; accent: string; logoUrl?: string | null; logoDarkUrl?: string | null; bedrijfsnaam?: string };
    /** Live variabelen — {{event_naam}} etc. worden hiermee vervangen i.p.v. EXAMPLE_DATA. */
    variables?: Record<string, string>;
    /** Live menu-gangen voor menu-blokken. Laat leeg voor placeholder-data. */
    menuGroups?: LiveMenuGroup[];
    /** Canvas-breedte in pixels — hoogte wordt proportioneel berekend op basis van A4/formaat. */
    width?: number;
}

const FORMAT_DIMS: Record<string, { w: number; h: number }> = {
    a4: { w: 210, h: 297 },
    a5: { w: 148, h: 210 },
    letter: { w: 216, h: 279 },
    tabloid: { w: 279, h: 432 },
};

export default function TemplatePreview({ blocks, pageSettings, documentType, branding, variables, menuGroups, width = 300 }: Props) {
    const fmt = FORMAT_DIMS[pageSettings.format] || FORMAT_DIMS.a4;
    const isPortrait = pageSettings.orientation !== 'landscape';
    const mmW = isPortrait ? fmt.w : fmt.h;
    const mmH = isPortrait ? fmt.h : fmt.w;
    const scale = width / mmW;
    const heightPx = mmH * scale;
    const mmToPx = scale;

    const content = (
        <div
            style={{
                width,
                height: heightPx,
                position: 'relative',
                background: pageSettings.backgroundColor || '#ffffff',
                overflow: 'hidden',
                boxShadow: '0 4px 12px rgba(0,0,0,.25)',
                borderRadius: 2,
            }}
        >
            {blocks.filter(function (b) { return (b as TemplateBlock & { visible?: boolean }).visible !== false; }).map(function (block) {
                const b = block as TemplateBlock & { x?: number; y?: number; width?: number; height?: number; zIndex?: number; rotation?: number };
                const left = (b.x || 0) * mmToPx;
                const top = (b.y || 0) * mmToPx;
                const w = (b.width || mmW - (pageSettings.margins?.left || 0) - (pageSettings.margins?.right || 0)) * mmToPx;
                const h = (b.height || 20) * mmToPx;
                const rotation = b.rotation || 0;

                return (
                    <div
                        key={b.id}
                        style={{
                            position: 'absolute',
                            left,
                            top,
                            width: w,
                            height: h,
                            transform: rotation ? `rotate(${rotation}deg)` : undefined,
                            transformOrigin: 'center center',
                            zIndex: b.zIndex || 0,
                            overflow: 'hidden',
                        }}
                    >
                        <div style={{ transform: `scale(${mmToPx / 2.5})`, transformOrigin: 'top left', width: (2.5 / mmToPx) * 100 + '%', height: (2.5 / mmToPx) * 100 + '%' }}>
                            <BlockRenderer block={block} documentType={documentType} />
                        </div>
                    </div>
                );
            })}
        </div>
    );

    let wrapped = content;
    if (menuGroups) {
        wrapped = <TemplateMenuGroupsProvider value={menuGroups}>{wrapped}</TemplateMenuGroupsProvider>;
    }
    if (variables) {
        wrapped = <TemplateVariablesProvider value={variables}>{wrapped}</TemplateVariablesProvider>;
    }
    if (branding) {
        wrapped = <TemplateBrandingProvider value={branding}>{wrapped}</TemplateBrandingProvider>;
    }
    return wrapped;
}
