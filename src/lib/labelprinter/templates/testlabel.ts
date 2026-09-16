/**
 * Testlabel — vanuit Instellingen → Printers. Laat in één oogopslag zien of
 * de maat klopt (kader op de rand), of accenten werken (Renée · Björn · Ø)
 * en of een QR scanbaar is. Staat het kader half buiten het label, dan is de
 * ingestelde labelmaat verkeerd — dat is precies waar dit label voor is.
 */

import type { LabelFormaat } from '../types';
import { kader, label, qr, tekst } from '../zpl';
import { schaalVoor, type LabelTemplate, type RenderResultaat } from './index';

export interface TestlabelData {
    printerNaam: string;
    /** Al opgemaakt, bv. "16-09-2026 14:03". */
    moment: string;
}

export const testlabel: LabelTemplate<TestlabelData> = {
    code: 'test',
    versie: 1,
    naam: 'Testlabel',
    minFormaat: { breedte_mm: 40, hoogte_mm: 20 },

    render(d: TestlabelData, formaat: LabelFormaat): RenderResultaat {
        const sc = schaalVoor(formaat);
        const rand = 4;
        const velden: string[] = [
            kader(rand, rand, sc.breedte - rand * 2, sc.hoogte - rand * 2, 2),
            tekst({ x: sc.x(20), y: sc.y(18), hoogte: sc.h(34), tekst: 'BBQ ARCHITECT' }),
            tekst({ x: sc.x(20), y: sc.y(66), hoogte: sc.h(24), tekst: d.printerNaam }),
            tekst({ x: sc.x(20), y: sc.y(98), hoogte: sc.h(22), tekst: `${formaat.breedte_mm} × ${formaat.hoogte_mm} mm · ${formaat.dpi} dpi` }),
            tekst({ x: sc.x(20), y: sc.y(128), hoogte: sc.h(22), tekst: d.moment }),
            tekst({ x: sc.x(20), y: sc.y(166), hoogte: sc.h(26), tekst: 'Renée · Björn · Ø · ß · €' }),
            tekst({ x: sc.x(20), y: sc.y(204), hoogte: sc.h(18), tekst: 'Staat dit kader op de rand, dan klopt de maat.' }),
            qr(sc.breedte - sc.x(20) - 4 * 25, sc.y(18), 'bbq-architect-test', 4),
        ];
        return { zpl: label({ breedte: sc.breedte, hoogte: sc.hoogte }, velden), waarschuwingen: [] };
    },
};
