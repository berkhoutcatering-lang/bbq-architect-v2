/**
 * Het scherm Assortiment: één lijst met alle winkelproducten, te filteren op
 * afdeling en te doorzoeken. Zuiver: krijgt rijen, geeft keuzes en een lijst.
 *
 * Regels
 *  - Tellingen tellen op: Alles = de som van de afdelingen + Zonder afdeling.
 *  - Een lege afdeling krijgt geen knop; die zie je bij Afdelingen indelen.
 *  - Wat uit het assortiment is, telt niet bij Alles en heeft een eigen knop.
 *  - Bovenaan staat wat het meest verkoopt, daarna op naam.
 */

export const ALLES = 'alles';
export const ZONDER = 'zonder';
export const UIT = 'uit';

export interface AssortimentRij {
    naam: string;
    actief: boolean;
    afdeling_id: string | null;
    verkocht28: number;
}

export interface Keuze {
    id: string;
    label: string;
    aantal: number;
}

export function assortimentKeuzes(
    afdelingen: readonly { id: string; naam: string; volgorde: number }[],
    rijen: readonly AssortimentRij[],
): Keuze[] {
    const actief = rijen.filter((r) => r.actief);
    const perAfdeling = [...afdelingen]
        .sort((a, b) => a.volgorde - b.volgorde || a.naam.localeCompare(b.naam, 'nl'))
        .map((a) => ({ id: a.id, label: a.naam, aantal: actief.filter((r) => r.afdeling_id === a.id).length }))
        .filter((k) => k.aantal > 0);
    const ids = new Set(afdelingen.map((a) => a.id));
    const zonder = actief.filter((r) => !r.afdeling_id || !ids.has(r.afdeling_id)).length;
    const uit = rijen.length - actief.length;
    return [
        { id: ALLES, label: 'Alles', aantal: actief.length },
        ...perAfdeling,
        ...(zonder > 0 && perAfdeling.length > 0 ? [{ id: ZONDER, label: 'Zonder afdeling', aantal: zonder }] : []),
        ...(uit > 0 ? [{ id: UIT, label: 'Uit het assortiment', aantal: uit }] : []),
    ];
}

/** Hoofdletters en accenten tellen niet mee: "brau" vindt Bräuweisse. */
function kaal(tekst: string): string {
    return tekst.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/å/g, 'a').trim();
}

export function assortimentLijst<T extends AssortimentRij>(
    rijen: readonly T[],
    keuze: string,
    zoek: string,
    afdelingIds: ReadonlySet<string>,
): T[] {
    const z = kaal(zoek);
    return rijen
        .filter((r) => {
            if (keuze === UIT) return !r.actief;
            if (!r.actief) return false;
            if (keuze === ALLES) return true;
            if (keuze === ZONDER) return !r.afdeling_id || !afdelingIds.has(r.afdeling_id);
            return r.afdeling_id === keuze;
        })
        .filter((r) => !z || kaal(r.naam).includes(z))
        .sort((a, b) => b.verkocht28 - a.verkocht28 || a.naam.localeCompare(b.naam, 'nl'));
}
