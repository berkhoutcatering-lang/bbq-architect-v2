/* Koppeling of vervanging? (15 sep 2026)
 *
 * De kok klikt op "procureur" en kiest "Varkens spiering BL1". Dat is geen
 * andere naam voor hetzelfde — het is een ánder product, en dan hoort de
 * regel in het recept "spiering" te gaan heten en de bereiding mee te
 * veranderen. Kiest hij "Mosterd fijn, fles 750 ml" voor "Dijon mosterd",
 * dan is dat hetzelfde product in een andere pot: de regel houdt zijn naam,
 * alleen de prijs komt van de gekozen pot.
 *
 * De grens: deelt de productnaam een woord met het ingrediënt, dan is het
 * een koppeling; deelt hij er geen, dan een vervanging. Puur, zodat het te
 * testen is en op alle drie de schermen hetzelfde doet. */

import { coverageOf, normalizeIngredientName } from './recipeMatch';

export function isVervanging(ingredientNaam: string, productNaam: string): boolean {
    return coverageOf(ingredientNaam, productNaam) === 0;
}

/* "Varkens spiering BL1, stuk circa 2 kg" → "Varkens spiering BL1". De
   verpakking na de komma hoort niet in een receptregel. */
export function korteProductnaam(productNaam: string): string {
    /* Alleen een komma gevolgd door een spatie scheidt de verpakking af;
       "37,5%" is een getal en blijft heel. */
    const voorKomma = productNaam.split(/,\s+/)[0].trim();
    return (voorKomma || productNaam).slice(0, 60);
}

/* Het oude ingrediënt in de bereidingstekst vervangen door het nieuwe —
   op woordgrens, ongeacht hoofdletters, en ook het hoofdwoord alleen
   ("procureur" in "…de procureur inwrijven…") als de volledige naam met
   toelichting ("procureur (varkensnek, am been)") daar niet letterlijk
   staat. Verandert niets als er niets te vinden is. */
export function vervangInTekst(tekst: string, oudeNaam: string, nieuweNaam: string): string {
    if (!tekst || !oudeNaam || !nieuweNaam) return tekst;
    const kandidaten = [oudeNaam.trim(), oudeNaam.replace(/\([^)]*\)/g, ' ').trim()]
        .filter(Boolean)
        .filter((v, i, a) => a.indexOf(v) === i)
        .sort((a, b) => b.length - a.length);
    /* Ook het langste losse woord (het hoofdwoord), zodat "de procureur" in de
       lopende tekst meegaat als de regel "procureur (varkensnek)" heette. */
    const woorden = normalizeIngredientName(oudeNaam.replace(/\([^)]*\)/g, ' ')).split(' ').filter((w) => w.length >= 5);
    if (woorden.length > 0) kandidaten.push(woorden.sort((a, b) => b.length - a.length)[0]);
    let uit = tekst;
    for (const k of kandidaten) {
        const re = new RegExp(`(^|[^\\p{L}\\p{N}])${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[^\\p{L}\\p{N}])`, 'giu');
        uit = uit.replace(re, (m, voor: string) => `${voor}${nieuweNaam}`);
    }
    return uit;
}
