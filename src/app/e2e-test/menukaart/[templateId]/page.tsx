/**
 * Test-only render-page voor menukaart-templates.
 *
 * Wordt door Playwright visual-regression tests gebruikt — rendert het
 * gevraagde template-id op A4-formaat (794x1123) met een vaste fixture-menu,
 * zonder auth/DB. Public zodat de Playwright-runner het kan benaderen.
 *
 * Gated achter NEXT_PUBLIC_E2E=1: zonder die env returnt het 404. Wordt
 * dus nooit in productie blootgesteld.
 *
 * Spec: bucket B P0-5.
 */

import { notFound } from 'next/navigation';
import { PreviewFor } from '@/components/menukaart/templates';
import { getTemplate } from '@/lib/menukaart/registry';
import type { MenuData } from '@/lib/menukaart/menu-data';

export const dynamic = 'force-dynamic';

/* In-file fixture — exact dezelfde inhoud als tests/menukaart/fixtures.ts
   (kleine duplicatie, maar voorkomt dat de Next.js server-bundle een test-
   bestand uit `tests/` moet importeren — dat zit niet in tsconfig.paths). */
const FIXTURE_MENU: MenuData = {
    logoUrl: null,
    logoUrlDonker: null,
    gangen: [
        {
            eyebrow: 'GANG 01', name: 'Ontvangst',
            description: 'Welkom met huisgemaakte hapjes vers van de grill.',
            dishes: [
                { name: 'Pulled Pork Brioche', description: '12u gerookt op hickory, met coleslaw.', allergens: ['G', 'E', 'Sd', 'M'] },
                { name: 'Brisket Crostini', description: 'Texas-style brisket op zuurdesem met truffelmayonaise.', allergens: ['G', 'E'] },
                { name: 'Gegrilde Watermeloen', description: 'Met feta, munt en chilivlokken.', allergens: ['L'] },
            ],
        },
        {
            eyebrow: 'GANG 02', name: 'Van de Smoker',
            description: 'Low & slow op kersen- en eikenhout.',
            dishes: [
                { name: 'Beef Brisket 14h', description: 'Signature gerecht. Point en flat, huisgemaakte saus apart.', allergens: ['Sf', 'Sl'] },
                { name: 'Pulled Pork Shoulder', description: 'Langzaam gegaard, Carolina mustard glaze.', allergens: ['M', 'Sf'] },
                { name: 'Lamb Ribs', description: 'Chipotle-honing glaze, zes uur lage temperatuur.', allergens: [] },
            ],
        },
        {
            eyebrow: 'GANG 03', name: 'Bijgerechten',
            description: 'Vers, huisgemaakt.',
            dishes: [
                { name: 'Coleslaw Classic', description: 'Witte kool en wortel in romige dressing.', allergens: ['E', 'M'] },
                { name: 'Smoked Mac & Cheese', description: 'Drie kazen, mee gerookt.', allergens: ['G', 'L'] },
                { name: 'Cornbread', description: 'Met jalapeño en cheddar.', allergens: ['G', 'L', 'E'] },
            ],
        },
        {
            eyebrow: 'GANG 04', name: 'Dessert',
            description: 'Zoete afsluiter met rook.',
            dishes: [
                { name: 'Smoked Pecan Pie', description: 'Klassiek Amerikaans, met bourbon-karamel.', allergens: ['G', 'N', 'E', 'L'] },
                { name: 'Gegrilde Ananas', description: 'Met kokosijs en rum-karamel.', allergens: ['L'] },
            ],
        },
    ],
};

/* CSS-transform schaling: template rendert op 480px breed, A4 op 794. */
const TEMPLATE_BASE = 480;
const A4_W = 794;
const SCALE = A4_W / TEMPLATE_BASE;

type Params = { templateId: string };

export default async function MenukaartTestPage({ params }: { params: Promise<Params> }) {
    if (process.env.NEXT_PUBLIC_E2E !== '1') notFound();

    const { templateId } = await params;
    const template = getTemplate(templateId);
    if (template.id !== templateId) notFound();

    const Preview = PreviewFor(template.id);
    const aspect = template.paper === 'square' ? 1 : 1.414;
    const wrappedHeight = A4_W * aspect;

    return (
        <div
            data-testid="menukaart-test-page"
            data-template-id={template.id}
            style={{
                margin: 0,
                padding: 0,
                background: '#fff',
                width: A4_W,
                height: wrappedHeight,
                overflow: 'hidden',
            }}
        >
            <div
                style={{
                    transform: `scale(${SCALE})`,
                    transformOrigin: 'top left',
                    width: TEMPLATE_BASE,
                }}
            >
                <Preview overrides={{}} data={FIXTURE_MENU} size="normal" />
            </div>
        </div>
    );
}
