/**
 * Test-only PDF-render-route voor de menukaart visual-regression.
 *
 * Waarom een route i.p.v. renderToBuffer in de Playwright-test? Playwright's
 * test-loader transpileert geïmporteerde .tsx met ZIJN eigen jsx-runtime
 * (`__pw_type`), wat @react-pdf niet kan renderen. Door de PDF hier op de Next-
 * server te renderen (React's jsx-runtime) en de test alleen de bytes te laten
 * ophalen, valt dat probleem weg en test je bovendien dezelfde render-pad als
 * de echte /api/menukaart/pdf-route.
 *
 * Gated achter NEXT_PUBLIC_E2E=1 → nooit in productie blootgesteld.
 */

import { notFound } from 'next/navigation';
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer';
import { createElement, type ReactElement } from 'react';
import { PdfFor } from '@/lib/menukaart/pdf';
import { getTemplate } from '@/lib/menukaart/registry';
import { E2E_FIXTURE_MENU } from '../../_fixture';

export const dynamic = 'force-dynamic';

export async function GET(
    _req: Request,
    { params }: { params: Promise<{ templateId: string }> },
) {
    if (process.env.NEXT_PUBLIC_E2E !== '1') notFound();

    const { templateId } = await params;
    const template = getTemplate(templateId);
    if (template.id !== templateId) notFound();

    const Pdf = PdfFor(template.id);
    const element = createElement(Pdf, { overrides: {}, data: E2E_FIXTURE_MENU }) as unknown as ReactElement<DocumentProps>;
    const buffer = await renderToBuffer(element);

    return new Response(new Uint8Array(buffer), {
        headers: { 'Content-Type': 'application/pdf', 'Cache-Control': 'no-store' },
    });
}
