/**
 * PdfFor() registry — router voor menukaart-PDF-components.
 *
 * Server-only: importeert @react-pdf/renderer-React-components. Wordt gebruikt
 * door `/api/menukaart/pdf/[offerId]/route.ts` om server-side een PDF te
 * renderen op basis van offerte.menukaart_template_id.
 */

import { type ComponentType } from 'react';
import type { PdfTemplateProps } from './pdf-shared';

import Restaurant01Pdf from '@/components/menukaart/templates/restaurant-01/Pdf';
import Smokehouse01Pdf from '@/components/menukaart/templates/smokehouse-01/Pdf';
import Modern01Pdf from '@/components/menukaart/templates/modern-01/Pdf';
import Minimal01Pdf from '@/components/menukaart/templates/minimal-01/Pdf';
import Rustic01Pdf from '@/components/menukaart/templates/rustic-01/Pdf';
import Duotone01Pdf from '@/components/menukaart/templates/duotone-01/Pdf';
import Editorial01Pdf from '@/components/menukaart/templates/editorial-01/Pdf';
import Tasting01Pdf from '@/components/menukaart/templates/tasting-01/Pdf';
import Square01Pdf from '@/components/menukaart/templates/square-01/Pdf';
import Invite01Pdf from '@/components/menukaart/templates/invite-01/Pdf';

type PdfComponent = ComponentType<PdfTemplateProps>;

const PDF_REGISTRY: Record<string, PdfComponent> = {
    'restaurant-01': Restaurant01Pdf,
    'smokehouse-01': Smokehouse01Pdf,
    'modern-01': Modern01Pdf,
    'minimal-01': Minimal01Pdf,
    'rustic-01': Rustic01Pdf,
    'duotone-01': Duotone01Pdf,
    'editorial-01': Editorial01Pdf,
    'tasting-01': Tasting01Pdf,
    'square-01': Square01Pdf,
    'invite-01': Invite01Pdf,
};

export function PdfFor(templateId: string): PdfComponent {
    const found = PDF_REGISTRY[templateId];
    if (found) return found;
    if (process.env.NODE_ENV !== 'production') {
        // eslint-disable-next-line no-console
        console.warn(`[menukaart] PdfFor("${templateId}") niet gevonden — terugval op restaurant-01.`);
    }
    return Restaurant01Pdf;
}
