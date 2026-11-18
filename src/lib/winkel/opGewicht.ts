/**
 * Verkopen op gewicht (contract toonbank/v1 1.4): de prijsregel en het etiket.
 *
 * prijsUitGewicht is dezelfde regel als in de Toonbank (packages/kern) en als
 * private.toonbank_controleer_sticker in de database: gewicht × kiloprijs in
 * hele centen, een halve cent omhoog. Alleen met hele getallen gerekend, zodat
 * er geen zwevende-kommafout in kan sluipen.
 *
 * Het etiket vult de eigenaar zelf in; hier wordt alleen gecontroleerd dat het
 * samenhangt. Er wordt niets verzonnen of aangevuld.
 */

export function prijsUitGewicht(gewicht_g: number, kiloprijs_cents: number): number {
    if (!Number.isInteger(gewicht_g) || gewicht_g < 1) throw new Error(`Ongeldig gewicht: ${gewicht_g}`);
    if (!Number.isInteger(kiloprijs_cents) || kiloprijs_cents < 0) throw new Error(`Ongeldige kiloprijs: ${kiloprijs_cents}`);
    return Math.floor((gewicht_g * kiloprijs_cents + 500) / 1000);
}

/** "*Melk*, zout, kaascultuur (*melk*, zuursel)" → één ingrediënt per komma, niet binnen haakjes. */
export function leesIngredienten(tekst: string): string[] {
    const uit: string[] = [];
    let diepte = 0;
    let huidig = '';
    for (const teken of tekst) {
        if (teken === '(' || teken === '[') diepte++;
        if ((teken === ')' || teken === ']') && diepte > 0) diepte--;
        if ((teken === ',' || teken === '\n') && diepte === 0) {
            uit.push(huidig);
            huidig = '';
        } else {
            huidig += teken;
        }
    }
    uit.push(huidig);
    return uit.map((x) => x.trim().replace(/\s+/g, ' ')).filter(Boolean);
}

/** "Melk, ei" → ['melk', 'ei']: kleine letters, zonder dubbele. */
export function leesAllergenen(tekst: string): string[] {
    const uit: string[] = [];
    for (const deel of tekst.split(/[,\n;]/)) {
        const a = deel.trim().replace(/\s+/g, ' ').toLowerCase();
        if (a && !uit.includes(a)) uit.push(a);
    }
    return uit;
}

/**
 * Houdbaar na het snijden: de vuistregel van de eigenaar (18 november 2026).
 * Een ander aantal dagen kan altijd; dit zijn alleen de twee knoppen.
 */
export const HOUDBAAR_KEUZES = [
    { label: 'Harde kaas', dagen: 14 },
    { label: 'Zachte kaas', dagen: 7 },
] as const;

/** Zoveel tekens passen hooguit op de sticker van 60 × 40 mm (de Toonbank meldt het als het niet past). */
export const MAX_INGREDIENTEN_TEKENS = 300;

/**
 * Hangt het etiket samen? null = goed, anders wat er mis is, in gewone taal.
 * Ingrediënten en allergenen mogen leeg (besluit eigenaar, 18 november 2026:
 * de sticker zegt naam, gewicht, prijs, kiloprijs en THT). Vult hij ze wel in,
 * dan staat elk allergeen in de ingrediënten tussen sterretjes, en alles
 * tussen sterretjes staat ook bij de allergenen.
 */
export function controleerEtiket(e: { ingredienten: string[]; allergenen: string[] }): string | null {
    if (e.ingredienten.length === 0) return null;

    const tekst = e.ingredienten.join(', ');
    if (tekst.length > MAX_INGREDIENTEN_TEKENS) {
        return `De ingrediënten zijn te lang voor de sticker (${tekst.length} tekens, hooguit ${MAX_INGREDIENTEN_TEKENS}).`;
    }
    if ((tekst.match(/\*/g) ?? []).length % 2 !== 0) {
        return 'In de ingrediënten staat een sterretje zonder partner. Zet een allergeen zo: *melk*.';
    }
    const gemarkeerd = [...tekst.matchAll(/\*([^*]+)\*/g)].map((m) => m[1]!.trim().toLowerCase());
    for (const a of e.allergenen) {
        if (!gemarkeerd.some((g) => g.includes(a))) {
            return `Zet ${a} tussen sterretjes in de ingrediënten, zo: *${a}*. Dan komt het vet op de sticker.`;
        }
    }
    for (const g of gemarkeerd) {
        if (!e.allergenen.some((a) => g.includes(a))) {
            return `In de ingrediënten staat *${g}* tussen sterretjes, maar het staat niet bij de allergenen.`;
        }
    }
    return null;
}
