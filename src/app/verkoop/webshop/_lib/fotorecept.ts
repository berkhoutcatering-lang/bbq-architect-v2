/**
 * De ChatGPT-opdracht voor een productfoto, per soort (blok C5). Uit het
 * fotorecept van de website (_bron/FOTORECEPT.md in de website-repo): één
 * studio, overal dezelfde plank, hetzelfde licht en dezelfde rook; alleen de
 * kleur van de wand verschilt per sectie. Zo blijft elke nieuwe foto één
 * geheel met de rest.
 */
import type { Paginasoort } from '@/lib/winkel/productsoorten';

const WAND: Record<Paginasoort, string> = {
    bier: 'olijfgroen, gedempt (zoals op de stijlvoorbeeld-foto)',
    wijn: 'warm bruin, richting taupe',
    vlees: 'warm antraciet, als leisteen — duidelijk lichter dan zwart',
};

export function chatgptOpdracht(soort: Paginasoort, liggend = false): string {
    const camera = liggend
        ? 'Leg het product schuin op de plank, de camera iets van boven (zo\'n 20 graden), het snijvlak naar de camera.'
        : 'De camera recht van voren op ooghoogte, het product in het midden, ongeveer 60 % van de beeldhoogte.';
    return [
        'Maak een productfoto voor een webshop. Gebruik foto 1 als stijlvoorbeeld en foto 2 als het product.',
        '',
        'Neem van foto 1 precies over: de verweerde roodbruine eikenhouten plank vooraan met de rand in beeld, het zachte warme licht van links, de donkere randen, de dunne rookslierten op de achtergrond en de staande uitsnede 2 : 3 (1024 × 1536), met ruimte boven en onder.',
        '',
        `Verander alleen de achterwand: dezelfde vlekkerige geschilderde textuur, maar in ${WAND[soort]}.`,
        '',
        camera,
        '',
        soort === 'vlees'
            ? 'Het product uit foto 2 blijft precies zoals het is: dezelfde vorm, korst, kleur van vlees en vet, het etiket. Niets roder, glanzender of mooier maken. Geen andere voorwerpen, geen handen, geen tekst.'
            : 'Het product uit foto 2 blijft precies zoals het is: vorm, kleur, etiket, alle tekst, jaartal en inhoud. Laat de fles of het blik op de echte verhouding staan. Niets toevoegen, niets mooier maken. Geen andere voorwerpen, geen handen, geen tekst.',
    ].join('\n');
}
