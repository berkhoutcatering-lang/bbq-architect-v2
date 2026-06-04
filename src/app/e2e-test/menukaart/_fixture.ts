/**
 * Gedeelde fixture voor de e2e-menukaart-render — gebruikt door zowel de
 * preview-test-page als de pdf-test-route (één bron van waarheid). De Playwright
 * visual-regression test importeert 'm óók voor de verwachte gang-/dish-namen,
 * zodat render en assert nooit uit elkaar kunnen lopen.
 *
 * `_`-prefix → App Router behandelt dit als private (geen route).
 */

import type { MenuData } from '@/lib/menukaart/menu-data';

export const E2E_FIXTURE_MENU: MenuData = {
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
