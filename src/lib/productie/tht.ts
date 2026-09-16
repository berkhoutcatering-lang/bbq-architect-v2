/**
 * THT van een partij: productiedatum + houdbaarheid in dagen.
 *
 * Bron van de dagen, in volgorde: de receptstap waarop de productie eindigt
 * (`recipe_steps.houdbaarheid_na_dagen`) wint van het component
 * (`components.houdbaarheid_na_bewerking_dagen`). Allebei leeg → geen THT op
 * het label; nooit een verzonnen aantal dagen. De rekenfunctie zelf is
 * `houdbaarTot` uit de bestelstroom (UTC-veilig).
 */

import { houdbaarTot } from '../bestelstroom';

export interface ThtBronnen {
    stapDagen?: number | null;
    componentDagen?: number | null;
}

export interface ThtUitkomst {
    tht: string | null;
    dagen: number | null;
    bron: 'stap' | 'component' | null;
}

export function bepaalTht(productiedatumIso: string, bronnen: ThtBronnen): ThtUitkomst {
    const stap = geldig(bronnen.stapDagen);
    if (stap !== null) return { tht: houdbaarTot(productiedatumIso, stap), dagen: stap, bron: 'stap' };
    const comp = geldig(bronnen.componentDagen);
    if (comp !== null) return { tht: houdbaarTot(productiedatumIso, comp), dagen: comp, bron: 'component' };
    return { tht: null, dagen: null, bron: null };
}

function geldig(d: number | null | undefined): number | null {
    return d != null && Number.isFinite(d) && d > 0 ? Math.floor(d) : null;
}

/** Vandaag als ISO-datum in Europe/Amsterdam — de productiedatum op het label. */
export function vandaagIso(nu: Date = new Date()): string {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Amsterdam', year: 'numeric', month: '2-digit', day: '2-digit' }).format(nu);
}
