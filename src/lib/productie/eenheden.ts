/**
 * Van "zoveel gemaakt" naar "zoveel zakken": de rekenregel achter
 * 12 kg → 12 × 1 kg → 12 labels.
 *
 * Puur, getest, en de énige plek waar dit gerekend wordt. De database-functie
 * productie_partij_afronden krijgt de uitkomst als lijst en controleert alleen
 * nog dat hij klopt.
 *
 * Eenheden blijven beperkt tot wat een keuken echt gebruikt: g/kg, ml/l,
 * stuk, portie. Meer conversies (bv. l → kg) vragen een dichtheid en die
 * verzinnen we niet.
 */

export type Eenheid = 'g' | 'kg' | 'ml' | 'l' | 'stuk' | 'portie';

export const EENHEDEN: readonly Eenheid[] = ['g', 'kg', 'ml', 'l', 'stuk', 'portie'];

/** Ook wat elders in de app voorkomt ('liter', 'stuks', 'st') naar de zes hier. */
export function normaliseerEenheid(e: string | null | undefined): Eenheid | null {
    const t = (e ?? '').trim().toLowerCase();
    if (t === 'g' || t === 'gram') return 'g';
    if (t === 'kg' || t === 'kilo' || t === 'kilogram') return 'kg';
    if (t === 'ml') return 'ml';
    if (t === 'l' || t === 'liter' || t === 'ltr') return 'l';
    if (t === 'stuk' || t === 'stuks' || t === 'st' || t === 'x') return 'stuk';
    if (t === 'portie' || t === 'porties' || t === 'pp') return 'portie';
    return null;
}

/** Factor om `van` naar `naar` te brengen, of null als dat niet kan. */
export function eenheidFactor(van: Eenheid, naar: Eenheid): number | null {
    if (van === naar) return 1;
    if (van === 'g' && naar === 'kg') return 0.001;
    if (van === 'kg' && naar === 'g') return 1000;
    if (van === 'ml' && naar === 'l') return 0.001;
    if (van === 'l' && naar === 'ml') return 1000;
    return null;
}

export function naarEenheid(hoeveelheid: number, van: Eenheid, naar: Eenheid): number | null {
    const f = eenheidFactor(van, naar);
    return f === null ? null : rond3(hoeveelheid * f);
}

function rond3(n: number): number {
    return Math.round(n * 1000) / 1000;
}

export interface EenheidRegel {
    volgnummer: number;
    inhoud: number;
    eenheid: Eenheid;
}

export interface EenhedenUitkomst {
    eenheden: EenheidRegel[];
    volle: number;
    /** Rest-eenheid met echt gewicht, of null als het precies uitkwam. */
    rest: number | null;
    /** Niet in de verpakkingseenheid uit te drukken (bv. stuks vs kg). */
    fout: string | null;
}

/**
 * Hoeveel eenheden van `verpakking` passen in `gemaakt`? Volle eenheden plus,
 * als er meer dan `minRestFractie` van een verpakking over is, één
 * resteenheid met het echte gewicht. Een rest kleiner dan die fractie (default
 * 5 %) is weegruis en gaat bij de laatste volle eenheid — nooit een label
 * voor 30 gram.
 */
export function berekenEenheden(
    gemaakt: number,
    gemaaktEenheid: Eenheid,
    verpakking: number,
    verpakkingEenheid: Eenheid,
    opties: { minRestFractie?: number } = {},
): EenhedenUitkomst {
    const minRest = opties.minRestFractie ?? 0.05;
    if (!(gemaakt > 0) || !(verpakking > 0)) return { eenheden: [], volle: 0, rest: null, fout: 'Hoeveelheid en verpakking moeten groter dan nul zijn' };
    const totaal = naarEenheid(gemaakt, gemaaktEenheid, verpakkingEenheid);
    if (totaal === null) return { eenheden: [], volle: 0, rest: null, fout: `${gemaaktEenheid} is niet om te rekenen naar ${verpakkingEenheid}` };

    let volle = Math.floor(totaal / verpakking + 1e-9);
    let rest = rond3(totaal - volle * verpakking);
    if (rest < verpakking * minRest) rest = 0;
    if (volle === 0 && rest > 0) { volle = 0; }

    const eenheden: EenheidRegel[] = [];
    for (let i = 1; i <= volle; i++) eenheden.push({ volgnummer: i, inhoud: verpakking, eenheid: verpakkingEenheid });
    if (rest > 0) eenheden.push({ volgnummer: volle + 1, inhoud: rest, eenheid: verpakkingEenheid });

    if (eenheden.length === 0) return { eenheden: [], volle: 0, rest: null, fout: 'Te weinig gemaakt voor één eenheid' };
    return { eenheden, volle, rest: rest > 0 ? rest : null, fout: null };
}

/**
 * De kok corrigeert het aantal (potten vallen niet altijd exact). Dan wordt
 * de gemaakte hoeveelheid gelijk verdeeld: 12,4 kg in 13 potten = 13 × 0,954 kg.
 * Productiewaarheid wint van de rekenregel; dit is géén labelaantal.
 */
export function verdeelOverAantal(
    gemaakt: number,
    gemaaktEenheid: Eenheid,
    aantal: number,
    verpakkingEenheid: Eenheid,
): EenhedenUitkomst {
    if (!Number.isInteger(aantal) || aantal < 1 || aantal > 500) return { eenheden: [], volle: 0, rest: null, fout: 'Aantal moet tussen 1 en 500 liggen' };
    const totaal = naarEenheid(gemaakt, gemaaktEenheid, verpakkingEenheid);
    if (totaal === null || !(totaal > 0)) return { eenheden: [], volle: 0, rest: null, fout: `${gemaaktEenheid} is niet om te rekenen naar ${verpakkingEenheid}` };
    const per = rond3(totaal / aantal);
    if (!(per > 0)) return { eenheden: [], volle: 0, rest: null, fout: 'Te weinig gemaakt voor dit aantal' };
    const eenheden: EenheidRegel[] = Array.from({ length: aantal }, (_, i) => ({ volgnummer: i + 1, inhoud: per, eenheid: verpakkingEenheid }));
    return { eenheden, volle: aantal, rest: null, fout: null };
}

/** "1,00 kg", "500 g", "12 stuks" — wat er op het label komt. */
export function formatInhoud(inhoud: number, eenheid: Eenheid): string {
    if (eenheid === 'stuk') return `${formatGetal(inhoud, 0)} ${inhoud === 1 ? 'stuk' : 'stuks'}`;
    if (eenheid === 'portie') return `${formatGetal(inhoud, 0)} ${inhoud === 1 ? 'portie' : 'porties'}`;
    if (eenheid === 'kg' || eenheid === 'l') return `${formatGetal(inhoud, 2)} ${eenheid}`;
    return `${formatGetal(inhoud, 0)} ${eenheid}`;
}

function formatGetal(n: number, decimalen: number): string {
    const vast = n.toFixed(decimalen);
    return vast.replace('.', ',');
}
